import { Router, type NextFunction, type Request, type Response } from "express";
import { TicketState, UserRole, prisma } from "db";
import {
  citizenTicketStateLabels,
  submitValidationSchema,
  toCitizenTicketState,
  type TicketState as SharedTicketState,
} from "@civicos/shared";
import { requireAuth, requireRole } from "../auth/middleware";
import { runValidationRebatchJob, submitValidation, ValidationDailyCapError } from "./service";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};

function routeId(request: Request): string {
  const value = request.params.id;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function status(state: TicketState) {
  const citizenState = toCitizenTicketState(state as SharedTicketState);
  return { status: citizenState, statusLabel: citizenTicketStateLabels[citizenState] };
}

export function createValidationsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/citizens/me/pending-validations", requireRole(UserRole.CITIZEN), asyncRoute(async (request, response) => {
    const citizenId = request.auth!.userId;
    const requests = await prisma.validationRequest.findMany({
      where: {
        citizenId,
        expiresAt: { gt: new Date() },
        respondedAt: null,
        ticket: { state: TicketState.PENDING_VALIDATION, reporterId: { not: citizenId } },
      },
      include: {
        ticket: {
          select: {
            id: true,
            title: true,
            category: { select: { id: true, name: true } },
            observations: {
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { images: { where: { isPrimary: true }, orderBy: { createdAt: "desc" }, take: 1, select: { url: true } } },
            },
          },
        },
      },
      orderBy: [{ distanceMeters: "asc" }, { notifiedAt: "asc" }],
    });
    // Part III §9.2 — eligibility can change after notification, so cap and phone
    // verification are rechecked without exposing any other citizens' responses.
    const config = await prisma.adminConfig.findUnique({ where: { key: "verification.daily_cap" } });
    if (!config || typeof config.value !== "number") throw new Error("Missing required AdminConfig verification.daily_cap");
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const [citizen, dailyCount] = await Promise.all([
      prisma.user.findUnique({ where: { id: citizenId }, select: { phoneVerifiedAt: true } }),
      prisma.validation.count({ where: { validatorId: citizenId, createdAt: { gte: dayStart } } }),
    ]);
    if (!citizen?.phoneVerifiedAt || dailyCount >= config.value) {
      response.json({ validations: [] });
      return;
    }
    response.json({ validations: requests.flatMap((item) => {
      const imageUrl = item.ticket.observations[0]?.images[0]?.url;
      return imageUrl ? [{
        ticketId: item.ticket.id,
        title: item.ticket.title,
        category: item.ticket.category,
        imageUrl,
        distanceMeters: item.distanceMeters,
        expiresAt: item.expiresAt,
      }] : [];
    }) });
  }));

  router.post("/tickets/:id/validate", requireRole(UserRole.CITIZEN), asyncRoute(async (request, response) => {
    const parsed = submitValidationSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Choose one validation response", details: parsed.error.flatten() });
      return;
    }
    try {
      const result = await submitValidation(routeId(request), request.auth!.userId, parsed.data.vote);
      if (!result) {
        response.status(404).json({ error: "Validation request not found" });
        return;
      }
      response.json({
        validationId: result.validationId,
        recorded: true,
        counted: result.counted,
        alreadyResolved: result.alreadyResolved,
        ...status(result.state),
      });
    } catch (error) {
      if (error instanceof ValidationDailyCapError) {
        response.status(429).json({ error: error.message });
        return;
      }
      throw error;
    }
  }));

  return router;
}

export function createValidationJobsRouter(cronSecret?: string): Router {
  const router = Router();
  router.post("/internal/jobs/validation-rebatch", asyncRoute(async (request, response) => {
    if (!cronSecret) {
      response.status(503).json({ error: "Validation scheduler is not configured" });
      return;
    }
    if (request.header("authorization") !== `Bearer ${cronSecret}`) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    response.json(await runValidationRebatchJob());
  }));
  return router;
}
