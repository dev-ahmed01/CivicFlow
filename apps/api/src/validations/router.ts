import { Router, type NextFunction, type Request, type Response } from "express";
import { CompletionVerificationDecision, ProjectState, TicketState, UserRole, prisma } from "db";
import {
  citizenTicketStateLabels,
  submitCompletionVerificationSchema,
  submitValidationSchema,
  toCitizenTicketState,
  updateCitizenLocationSchema,
  type TicketState as SharedTicketState,
} from "@civicos/shared";
import { requireAuth, requireRole } from "../auth/middleware";
import { runValidationRebatchJob, submitValidation, ValidationDailyCapError } from "./service";
import { createNotifications } from "../notifications/service";
import { storageReadUrl, type ImageStorage } from "../images/storage";

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

export function createValidationsRouter(storage: ImageStorage): Router {
  const router = Router();
  router.use(requireAuth);

  router.patch("/citizens/me/location", requireRole(UserRole.CITIZEN), asyncRoute(async (request, response) => {
    const parsed = updateCitizenLocationSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid citizen location", details: parsed.error.flatten() });
      return;
    }
    const { latitude, longitude } = parsed.data;
    // Part III §9.2 — proximity eligibility uses the citizen's explicit device
    // location; the server derives ward scope from admin-managed boundaries.
    await prisma.$executeRaw`
      UPDATE "User"
      SET "lastKnownCoordinates" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326),
          "wardId" = (
            SELECT "id" FROM "Ward"
            WHERE ST_Covers("boundary", ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326))
            ORDER BY "name" ASC
            LIMIT 1
          )
      WHERE "id" = ${request.auth!.userId}::uuid
    `;
    response.status(204).send();
  }));

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
              select: { images: { where: { isPrimary: true, uploadedAt: { not: null } }, orderBy: { createdAt: "desc" }, take: 1, select: { objectKey: true, url: true } } },
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
      const image = item.ticket.observations[0]?.images[0];
      const imageUrl = image ? storageReadUrl(storage, image.objectKey, image.url) : undefined;
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

  router.get("/citizens/me/pending-completion-verifications", requireRole(UserRole.CITIZEN), asyncRoute(async (request, response) => {
    const requests = await prisma.completionVerificationRequest.findMany({
      where: {
        citizenId: request.auth!.userId,
        respondedAt: null,
        completionEvidence: { uploadedAt: { not: null }, project: { state: ProjectState.AWAITING_VERIFICATION } },
      },
      orderBy: { notifiedAt: "asc" },
      include: {
        completionEvidence: {
          select: {
            id: true,
            projectId: true,
            ticketId: true,
            photoUrl: true,
            objectKey: true,
            notes: true,
            uploadedAt: true,
            ticket: { select: { title: true } },
          },
        },
      },
    });
    response.json({ completions: requests.map(({ completionEvidence }) => ({
      evidenceId: completionEvidence.id,
      projectId: completionEvidence.projectId,
      ticketId: completionEvidence.ticketId,
      title: completionEvidence.ticket.title,
      photoUrl: storageReadUrl(storage, completionEvidence.objectKey, completionEvidence.photoUrl),
      notes: completionEvidence.notes,
      submittedAt: completionEvidence.uploadedAt,
    })) });
  }));

  router.post("/completion-evidence/:id/verify", requireRole(UserRole.CITIZEN), asyncRoute(async (request, response) => {
    const parsed = submitCompletionVerificationSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Choose a completion verification response", details: parsed.error.flatten() });
      return;
    }
    const evidenceId = routeId(request);
    const result = await prisma.$transaction(async (transaction) => {
      const invitation = await transaction.completionVerificationRequest.findUnique({
        where: { completionEvidenceId_citizenId: { completionEvidenceId: evidenceId, citizenId: request.auth!.userId } },
        include: { completionEvidence: { include: { project: { select: { id: true, state: true, agencyId: true, engineerId: true } }, ticket: { select: { id: true, state: true } } } } },
      });
      if (!invitation) return { kind: "missing" as const };
      const evidence = invitation.completionEvidence;
      const existing = await transaction.completionVerification.findUnique({
        where: { completionEvidenceId_validatorId: { completionEvidenceId: evidenceId, validatorId: request.auth!.userId } },
      });
      if (existing) return { kind: "recorded" as const, state: evidence.project.state, duplicate: true };
      if (evidence.project.state !== ProjectState.AWAITING_VERIFICATION || evidence.ticket.state !== TicketState.AWAITING_CITIZEN_VERIFICATION) {
        return { kind: "recorded" as const, state: evidence.project.state, duplicate: false };
      }
      await transaction.completionVerification.create({
        data: {
          completionEvidenceId: evidenceId,
          validatorId: request.auth!.userId,
          decision: parsed.data.decision as CompletionVerificationDecision,
          note: parsed.data.note,
        },
      });
      await transaction.completionVerificationRequest.update({ where: { id: invitation.id }, data: { respondedAt: new Date() } });
      const config = await transaction.adminConfig.findUnique({ where: { key: "verification.quorum" } });
      if (!config || typeof config.value !== "number") throw new Error("Missing required AdminConfig verification.quorum");
      const [verified, rework] = await Promise.all([
        transaction.completionVerification.count({ where: { completionEvidenceId: evidenceId, decision: CompletionVerificationDecision.VERIFIED } }),
        transaction.completionVerification.count({ where: { completionEvidenceId: evidenceId, decision: CompletionVerificationDecision.REWORK_REQUESTED } }),
      ]);
      const resolvedState = rework >= config.value ? ProjectState.ACTIVE : verified >= config.value ? ProjectState.CLOSED : null;
      if (!resolvedState) return { kind: "recorded" as const, state: evidence.project.state, duplicate: false };

      const ticketState = resolvedState === ProjectState.CLOSED ? TicketState.CLOSED : TicketState.WORK_IN_PROGRESS;
      await transaction.project.update({ where: { id: evidence.project.id }, data: { state: resolvedState } });
      await transaction.projectStateTransition.create({
        data: { projectId: evidence.project.id, fromState: ProjectState.AWAITING_VERIFICATION, toState: resolvedState, reason: resolvedState === ProjectState.CLOSED ? "CITIZEN_COMPLETION_VERIFIED" : "CITIZEN_REWORK_REQUESTED", actedById: request.auth!.userId },
      });
      await transaction.ticket.update({ where: { id: evidence.ticket.id }, data: { state: ticketState } });
      await transaction.ticketStateTransition.create({
        data: { ticketId: evidence.ticket.id, fromState: TicketState.AWAITING_CITIZEN_VERIFICATION, toState: ticketState, reason: resolvedState === ProjectState.CLOSED ? "CITIZEN_COMPLETION_VERIFIED" : "CITIZEN_REWORK_REQUESTED", actedById: request.auth!.userId },
      });
      const recipients = await transaction.user.findMany({
        where: { OR: [
          ...(evidence.project.engineerId ? [{ id: evidence.project.engineerId }] : []),
          { agencyId: evidence.project.agencyId, role: UserRole.PROJECT_HEAD },
        ] },
        select: { id: true },
      });
      if (recipients.length > 0) await createNotifications(transaction, recipients.map(({ id }) => ({
        userId: id,
        type: resolvedState === ProjectState.CLOSED ? "COMPLETION_VERIFIED" : "PROJECT_REWORK_REQUESTED",
        payload: { projectId: evidence.project.id, ticketId: evidence.ticket.id, evidenceId },
      })));
      if (resolvedState === ProjectState.CLOSED) {
        const citizens = await transaction.user.findMany({
          where: { OR: [
            { observations: { some: { ticketId: evidence.ticket.id } } },
            { validations: { some: { ticketId: evidence.ticket.id, counted: true } } },
          ] },
          select: { id: true },
        });
        await createNotifications(transaction, citizens.map(({ id }) => ({
          userId: id,
          type: "TICKET_RESOLVED",
          payload: { projectId: evidence.project.id, ticketId: evidence.ticket.id, evidenceId },
        })));
      }
      return { kind: "recorded" as const, state: resolvedState, duplicate: false };
    });
    if (result.kind === "missing") {
      response.status(404).json({ error: "Completion verification request not found" });
      return;
    }
    response.json({ recorded: true, duplicate: result.duplicate, projectState: result.state });
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
