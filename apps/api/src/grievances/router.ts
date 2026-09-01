import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { GrievanceSource, GrievanceStatus, TicketState, UserRole, WorkflowActionType, prisma } from "db";
import { createCitizenGrievanceSchema, grievanceStatusSchema, updateGrievanceSchema } from "@civicos/shared";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";
import { completeWorkflowAction, createWorkflowAction, firstResponsibleUser, runDeadlineEscalationJob } from "../deadlines/service";
import { createNotifications } from "../notifications/service";
import { storageReadUrl, type ImageStorage } from "../images/storage";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};
const activeStatuses = [GrievanceStatus.OPEN, GrievanceStatus.UNDER_REVIEW, GrievanceStatus.ESCALATED, GrievanceStatus.REOPENED];
const eligibleTicketStates: TicketState[] = [TicketState.WORK_COMPLETED, TicketState.AWAITING_CITIZEN_VERIFICATION, TicketState.RESOLVED, TicketState.CLOSED];

function routeId(request: Request): string {
  const value = request.params.id;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
}

function serializeGrievance(storage: ImageStorage, grievance: { evidenceObjectKey: string | null; evidenceUrl: string | null } & Record<string, unknown>) {
  return {
    ...grievance,
    evidenceUrl: grievance.evidenceObjectKey && grievance.evidenceUrl
      ? storageReadUrl(storage, grievance.evidenceObjectKey, grievance.evidenceUrl)
      : grievance.evidenceUrl,
  };
}

export function createGrievancesRouter(storage: ImageStorage): Router {
  const router = Router();
  router.use(requireAuth);

  router.post("/tickets/:id/grievances", requireRole(UserRole.CITIZEN), asyncRoute(async (request, response) => {
    const parsed = createCitizenGrievanceSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid grievance", details: parsed.error.flatten() });
      return;
    }
    const ticket = await prisma.ticket.findFirst({
      where: { id: routeId(request), reporterId: request.auth!.userId },
      select: { id: true, state: true, assignedAgencyId: true, project: { select: { id: true } } },
    });
    if (!ticket || !ticket.assignedAgencyId) {
      response.status(404).json({ error: "Ticket not found" });
      return;
    }
    if (!eligibleTicketStates.includes(ticket.state)) {
      response.status(409).json({ error: "A grievance can be raised after work is completed or the ticket is closed" });
      return;
    }
    const existing = await prisma.grievance.findFirst({
      where: { ticketId: ticket.id, raisedByUserId: request.auth!.userId, source: GrievanceSource.CITIZEN, status: { in: activeStatuses } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      response.json({ grievance: serializeGrievance(storage, existing), duplicate: true });
      return;
    }
    const responsibleUserId = await firstResponsibleUser(prisma, ticket.assignedAgencyId, [UserRole.PROJECT_HEAD]);
    if (!responsibleUserId) {
      response.status(422).json({ error: "The responsible agency has no Project Head available for grievance review" });
      return;
    }

    const grievanceId = randomUUID();
    const evidence = parsed.data.evidence;
    const objectKey = evidence ? `grievances/${grievanceId}/${safeFileName(evidence.fileName)}` : undefined;
    const upload = evidence && objectKey ? await storage.createUpload(objectKey, evidence.contentType) : undefined;
    const grievance = await prisma.$transaction(async (transaction) => {
      const created = await transaction.grievance.create({
        data: {
          id: grievanceId,
          ticketId: ticket.id,
          projectId: ticket.project?.id,
          raisedByUserId: request.auth!.userId,
          responsibleUserId,
          responsibleAgencyId: ticket.assignedAgencyId!,
          reason: parsed.data.reason,
          note: parsed.data.note,
          evidenceUrl: upload?.publicUrl,
          evidenceObjectKey: objectKey,
          evidenceContentType: evidence?.contentType,
          source: GrievanceSource.CITIZEN,
          status: GrievanceStatus.OPEN,
        },
      });
      await createWorkflowAction(transaction, {
        dedupeKey: `grievance:${created.id}:review`, type: WorkflowActionType.REVIEW_GRIEVANCE,
        ticketId: ticket.id, projectId: ticket.project?.id, responsibleUserId, responsibleAgencyId: ticket.assignedAgencyId!,
      });
      await createNotifications(transaction, [{
        userId: responsibleUserId, type: "GRIEVANCE_CREATED", payload: { grievanceId: created.id, ticketId: ticket.id, projectId: ticket.project?.id },
      }]);
      return created;
    });
    response.status(201).json({ grievance: serializeGrievance(storage, grievance), upload });
  }));

  router.post("/grievances/:id/evidence/complete", requireRole(UserRole.CITIZEN), asyncRoute(async (request, response) => {
    const grievance = await prisma.grievance.findFirst({
      where: { id: routeId(request), raisedByUserId: request.auth!.userId, evidenceUploadedAt: null },
      select: { id: true, evidenceObjectKey: true, evidenceContentType: true },
    });
    if (!grievance?.evidenceObjectKey || !grievance.evidenceContentType) {
      response.status(404).json({ error: "Grievance evidence upload not found" });
      return;
    }
    if (!(await storage.verifyUpload(grievance.evidenceObjectKey, grievance.evidenceContentType))) {
      response.status(422).json({ error: "The grievance image is missing, empty, too large, or has an unexpected file type" });
      return;
    }
    await prisma.grievance.update({ where: { id: grievance.id }, data: { evidenceUploadedAt: new Date() } });
    response.json({ uploaded: true });
  }));

  router.get("/citizens/me/grievances", requireRole(UserRole.CITIZEN), asyncRoute(async (request, response) => {
    const grievances = await prisma.grievance.findMany({ where: { raisedByUserId: request.auth!.userId }, orderBy: { createdAt: "desc" } });
    response.json({ grievances: grievances.map((item) => serializeGrievance(storage, item)) });
  }));

  router.get("/grievances", requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER), requirePasswordResetComplete, asyncRoute(async (request, response) => {
    const status = request.query.status ? grievanceStatusSchema.safeParse(request.query.status) : null;
    if (status && !status.success) {
      response.status(400).json({ error: "Invalid grievance status" });
      return;
    }
    const where = request.auth!.role === UserRole.PROJECT_HEAD
      ? { responsibleAgencyId: request.auth!.agencyId! }
      : { OR: [{ responsibleUserId: request.auth!.userId }, { responsibleAgencyId: request.auth!.agencyId! }] };
    const grievances = await prisma.grievance.findMany({
      where: { ...where, ...(status?.success ? { status: status.data } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { ticket: { select: { id: true, title: true, referenceNumber: true } }, responsibleAgency: { select: { id: true, name: true } }, responsibleUser: { select: { id: true, email: true } } },
    });
    response.json({ grievances: grievances.map((item) => serializeGrievance(storage, item)) });
  }));

  router.patch("/grievances/:id", requireRole(UserRole.PROJECT_HEAD), requirePasswordResetComplete, asyncRoute(async (request, response) => {
    const parsed = updateGrievanceSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid grievance update", details: parsed.error.flatten() });
      return;
    }
    const grievance = await prisma.grievance.findFirst({
      where: { id: routeId(request), responsibleAgencyId: request.auth!.agencyId! },
    });
    if (!grievance) {
      response.status(404).json({ error: "Grievance not found" });
      return;
    }
    const now = new Date();
    const updated = await prisma.$transaction(async (transaction) => {
      const value = await transaction.grievance.update({
        where: { id: grievance.id },
        data: {
          status: parsed.data.status as GrievanceStatus,
          resolutionNote: parsed.data.resolutionNote,
          resolvedAt: parsed.data.status === "RESOLVED" ? now : null,
          escalatedAt: parsed.data.status === "ESCALATED" ? grievance.escalatedAt ?? now : grievance.escalatedAt,
        },
      });
      if (parsed.data.status === "RESOLVED") await completeWorkflowAction(transaction, `grievance:${grievance.id}:review`, now);
      if (grievance.raisedByUserId) await createNotifications(transaction, [{ userId: grievance.raisedByUserId, type: "GRIEVANCE_UPDATED", payload: { grievanceId: grievance.id, ticketId: grievance.ticketId, status: parsed.data.status } }]);
      return value;
    });
    response.json({ grievance: serializeGrievance(storage, updated) });
  }));

  return router;
}

export function createDeadlineJobsRouter(cronSecret?: string): Router {
  const router = Router();
  router.post("/internal/jobs/deadline-escalation", asyncRoute(async (request, response) => {
    if (!cronSecret) {
      response.status(503).json({ error: "Deadline scheduler is not configured" });
      return;
    }
    if (request.header("authorization") !== `Bearer ${cronSecret}`) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    response.json(await runDeadlineEscalationJob());
  }));
  return router;
}
