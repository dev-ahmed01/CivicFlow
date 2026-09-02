import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { InspectionStatus, TicketState, UserRole, WorkflowActionType, prisma, type Prisma } from "db";
import { assignInspectionSchema, inspectionEvidenceRequestSchema, reviewInspectionSchema, submitInspectionSchema } from "@civicos/shared";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";
import { completeWorkflowAction, createWorkflowAction } from "../deadlines/service";
import { storageReadUrl, type ImageStorage } from "../images/storage";
import { createNotifications, requestPushDelivery } from "../notifications/service";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => { void handler(request, response, next).catch(next); };

function routeId(request: Request, key = "id"): string {
  const value = request.params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function actorAgency(request: Request): string {
  if (!request.auth!.agencyId) throw new Error("Internal account is missing an agency assignment");
  return request.auth!.agencyId;
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
}

const inspectionInclude = {
  assignedEngineer: { select: { id: true, email: true } },
  assignedBy: { select: { id: true, email: true } },
  evidence: { orderBy: { createdAt: "asc" as const } },
  ticket: {
    include: {
      category: { select: { id: true, name: true } },
      ward: { select: { id: true, name: true } },
      roadSegment: { select: { id: true, roadName: true } },
      observations: { orderBy: { createdAt: "asc" as const }, select: { id: true, imageUrl: true, note: true, latitude: true, longitude: true, address: true } },
    },
  },
} satisfies Prisma.InspectionReportInclude;

type InspectionRecord = Prisma.InspectionReportGetPayload<{ include: typeof inspectionInclude }>;

function responseInspection(storage: ImageStorage, inspection: InspectionRecord) {
  const { objectKey, ...report } = inspection;
  return {
    ...report,
    fileUrl: objectKey && inspection.fileUrl ? storageReadUrl(storage, objectKey, inspection.fileUrl) : null,
    evidence: inspection.evidence.map(({ objectKey, ...item }) => ({ ...item, fileUrl: storageReadUrl(storage, objectKey, item.fileUrl) })),
  };
}

async function createAssignment(
  transaction: Prisma.TransactionClient,
  input: { ticketId: string; engineerId: string; assignedById: string; agencyId: string; deadline: Date },
) {
  const engineer = await transaction.user.findFirst({ where: { id: input.engineerId, agencyId: input.agencyId, role: UserRole.ENGINEER, deactivatedAt: null }, select: { id: true } });
  if (!engineer) return null;
  const inspection = await transaction.inspectionReport.create({ data: {
    ticketId: input.ticketId,
    assignedEngineerId: engineer.id,
    assignedById: input.assignedById,
    deadline: input.deadline,
    status: InspectionStatus.ASSIGNED,
  } });
  await createWorkflowAction(transaction, {
    dedupeKey: `inspection:${inspection.id}:accept`,
    type: WorkflowActionType.ACCEPT_INSPECTION,
    ticketId: input.ticketId,
    responsibleUserId: engineer.id,
    responsibleAgencyId: input.agencyId,
    explicitDeadline: input.deadline,
  });
  await createNotifications(transaction, [{ userId: engineer.id, type: "INSPECTION_ASSIGNED", payload: { inspectionId: inspection.id, ticketId: input.ticketId, deadline: input.deadline.toISOString() } }]);
  return inspection;
}

export function createInspectionsRouter(storage: ImageStorage): Router {
  const router = Router();
  router.use(requireAuth, requirePasswordResetComplete);

  router.post("/tickets/:ticketId/inspections", requireRole(UserRole.PROJECT_HEAD), asyncRoute(async (request, response) => {
    const parsed = assignInspectionSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid inspection assignment", details: parsed.error.flatten() }); return; }
    const ticketId = routeId(request, "ticketId");
    const agencyId = actorAgency(request);
    const result = await prisma.$transaction(async (transaction) => {
      const ticket = await transaction.ticket.findFirst({ where: { id: ticketId, assignedAgencyId: agencyId }, select: { id: true, state: true } });
      if (!ticket) return { kind: "missing" as const };
      const assignableStates: ReadonlySet<TicketState> = new Set([TicketState.ROUTED_TO_AGENCY, TicketState.INSPECTION_DUE, TicketState.INSPECTION_COMPLETE]);
      if (!assignableStates.has(ticket.state)) return { kind: "state" as const, state: ticket.state };
      const assignment = await createAssignment(transaction, { ticketId, engineerId: parsed.data.engineerId, assignedById: request.auth!.userId, agencyId, deadline: new Date(parsed.data.deadline) });
      if (!assignment) return { kind: "engineer" as const };
      if (ticket.state !== TicketState.INSPECTION_DUE) {
        await transaction.ticket.update({ where: { id: ticket.id }, data: { state: TicketState.INSPECTION_DUE } });
        await transaction.ticketStateTransition.create({ data: { ticketId, fromState: ticket.state, toState: TicketState.INSPECTION_DUE, reason: "ENGINEER_INSPECTION_ASSIGNED", actedById: request.auth!.userId } });
      }
      await completeWorkflowAction(transaction, `ticket:${ticketId}:inspect`);
      return { kind: "created" as const, id: assignment.id };
    });
    if (result.kind === "missing") response.status(404).json({ error: "Ticket not found" });
    else if (result.kind === "state") response.status(409).json({ error: `Inspection cannot be assigned from ${result.state}` });
    else if (result.kind === "engineer") response.status(422).json({ error: "Choose an active Engineer from your agency" });
    else { requestPushDelivery(); response.status(201).json({ inspection: responseInspection(storage, await prisma.inspectionReport.findUniqueOrThrow({ where: { id: result.id }, include: inspectionInclude })) }); }
  }));

  router.get("/inspections", requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER), asyncRoute(async (request, response) => {
    const agencyId = actorAgency(request);
    const inspections = await prisma.inspectionReport.findMany({
      where: request.auth!.role === UserRole.ENGINEER
        ? { assignedEngineerId: request.auth!.userId, ticket: { assignedAgencyId: agencyId } }
        : { ticket: { assignedAgencyId: agencyId } },
      include: inspectionInclude,
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    response.json({ inspections: inspections.map((inspection) => responseInspection(storage, inspection)) });
  }));

  router.get("/inspections/:id", requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER), asyncRoute(async (request, response) => {
    const agencyId = actorAgency(request);
    const inspection = await prisma.inspectionReport.findFirst({
      where: {
        id: routeId(request),
        ticket: { assignedAgencyId: agencyId },
        ...(request.auth!.role === UserRole.ENGINEER ? { assignedEngineerId: request.auth!.userId } : {}),
      },
      include: inspectionInclude,
    });
    if (!inspection) { response.status(404).json({ error: "Inspection not found" }); return; }
    response.json({ inspection: responseInspection(storage, inspection) });
  }));

  router.post("/inspections/:id/accept", requireRole(UserRole.ENGINEER), asyncRoute(async (request, response) => {
    const inspection = await prisma.inspectionReport.findFirst({ where: { id: routeId(request), assignedEngineerId: request.auth!.userId, ticket: { assignedAgencyId: actorAgency(request) } }, select: { id: true, status: true } });
    if (!inspection) { response.status(404).json({ error: "Inspection not found" }); return; }
    if (inspection.status !== InspectionStatus.ASSIGNED) { response.status(409).json({ error: `Inspection cannot be accepted from ${inspection.status}` }); return; }
    const now = new Date();
    await prisma.$transaction(async (transaction) => {
      await transaction.inspectionReport.update({ where: { id: inspection.id }, data: { status: InspectionStatus.ACCEPTED, acceptedAt: now } });
      await completeWorkflowAction(transaction, `inspection:${inspection.id}:accept`, now);
      const record = await transaction.inspectionReport.findUniqueOrThrow({ where: { id: inspection.id }, select: { ticketId: true, deadline: true } });
      await createWorkflowAction(transaction, { dedupeKey: `inspection:${inspection.id}:complete`, type: WorkflowActionType.COMPLETE_INSPECTION, ticketId: record.ticketId, responsibleUserId: request.auth!.userId, responsibleAgencyId: actorAgency(request), explicitDeadline: record.deadline }, now);
    });
    response.json({ status: InspectionStatus.ACCEPTED });
  }));

  router.post("/inspections/:id/start", requireRole(UserRole.ENGINEER), asyncRoute(async (request, response) => {
    const inspection = await prisma.inspectionReport.findFirst({ where: { id: routeId(request), assignedEngineerId: request.auth!.userId, ticket: { assignedAgencyId: actorAgency(request) } }, select: { id: true, status: true } });
    if (!inspection) { response.status(404).json({ error: "Inspection not found" }); return; }
    if (inspection.status !== InspectionStatus.ACCEPTED) { response.status(409).json({ error: `Inspection cannot be started from ${inspection.status}` }); return; }
    await prisma.inspectionReport.update({ where: { id: inspection.id }, data: { status: InspectionStatus.IN_PROGRESS, startedAt: new Date() } });
    response.json({ status: InspectionStatus.IN_PROGRESS });
  }));

  router.post("/inspections/:id/evidence", requireRole(UserRole.ENGINEER), asyncRoute(async (request, response) => {
    const parsed = inspectionEvidenceRequestSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid inspection evidence", details: parsed.error.flatten() }); return; }
    const inspection = await prisma.inspectionReport.findFirst({ where: { id: routeId(request), assignedEngineerId: request.auth!.userId, ticket: { assignedAgencyId: actorAgency(request) } }, select: { id: true, status: true } });
    if (!inspection) { response.status(404).json({ error: "Inspection not found" }); return; }
    const evidenceStates: ReadonlySet<InspectionStatus> = new Set([InspectionStatus.ACCEPTED, InspectionStatus.IN_PROGRESS]);
    if (!evidenceStates.has(inspection.status)) { response.status(409).json({ error: `Evidence cannot be added from ${inspection.status}` }); return; }
    if (parsed.data.action === "presign") {
      const evidenceId = randomUUID();
      const objectKey = `inspection-evidence/${inspection.id}/${evidenceId}-${safeFileName(parsed.data.fileName)}`;
      const upload = await storage.createUpload(objectKey, parsed.data.contentType);
      await prisma.inspectionEvidence.create({ data: { id: evidenceId, inspectionId: inspection.id, uploadedById: request.auth!.userId, fileUrl: upload.publicUrl, objectKey, contentType: parsed.data.contentType } });
      response.status(201).json({ evidenceId, upload });
      return;
    }
    const evidence = await prisma.inspectionEvidence.findFirst({ where: { id: parsed.data.evidenceId, inspectionId: inspection.id, uploadedById: request.auth!.userId, uploadedAt: null } });
    if (!evidence) { response.status(404).json({ error: "Inspection evidence not found" }); return; }
    if (!(await storage.verifyUpload(evidence.objectKey, evidence.contentType))) { response.status(422).json({ error: "The inspection evidence is missing or invalid" }); return; }
    await prisma.inspectionEvidence.update({ where: { id: evidence.id }, data: { uploadedAt: new Date() } });
    response.json({ evidenceId: evidence.id, uploaded: true });
  }));

  router.post("/inspections/:id/submit", requireRole(UserRole.ENGINEER), asyncRoute(async (request, response) => {
    const parsed = submitInspectionSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid inspection assessment", details: parsed.error.flatten() }); return; }
    const agencyId = actorAgency(request);
    const result = await prisma.$transaction(async (transaction) => {
      const inspection = await transaction.inspectionReport.findFirst({ where: { id: routeId(request), assignedEngineerId: request.auth!.userId, ticket: { assignedAgencyId: agencyId } }, select: { id: true, ticketId: true, status: true } });
      if (!inspection) return { kind: "missing" as const };
      const submittableStates: ReadonlySet<InspectionStatus> = new Set([InspectionStatus.ACCEPTED, InspectionStatus.IN_PROGRESS]);
      if (!submittableStates.has(inspection.status)) return { kind: "state" as const, state: inspection.status };
      const evidenceCount = await transaction.inspectionEvidence.count({ where: { inspectionId: inspection.id, uploadedAt: { not: null } } });
      if (evidenceCount === 0) return { kind: "evidence" as const };
      const now = new Date();
      await transaction.inspectionReport.update({ where: { id: inspection.id }, data: { ...parsed.data, status: InspectionStatus.SUBMITTED, submittedById: request.auth!.userId, submittedAt: now, locationConfirmedAt: now, notes: parsed.data.observations } });
      const ticket = await transaction.ticket.findUniqueOrThrow({ where: { id: inspection.ticketId }, select: { id: true, state: true } });
      if (ticket.state !== TicketState.INSPECTION_COMPLETE) {
        await transaction.ticket.update({ where: { id: ticket.id }, data: { state: TicketState.INSPECTION_COMPLETE } });
        await transaction.ticketStateTransition.create({ data: { ticketId: ticket.id, fromState: ticket.state, toState: TicketState.INSPECTION_COMPLETE, reason: "ENGINEER_INSPECTION_SUBMITTED", actedById: request.auth!.userId } });
      }
      await completeWorkflowAction(transaction, `inspection:${inspection.id}:complete`, now);
      const heads = await transaction.user.findMany({ where: { agencyId, role: UserRole.PROJECT_HEAD, deactivatedAt: null }, select: { id: true } });
      for (const head of heads) await createWorkflowAction(transaction, { dedupeKey: `inspection:${inspection.id}:review:${head.id}`, type: WorkflowActionType.REVIEW_INSPECTION, ticketId: ticket.id, responsibleUserId: head.id, responsibleAgencyId: agencyId }, now);
      await createNotifications(transaction, heads.map(({ id }) => ({ userId: id, type: "INSPECTION_SUBMITTED", payload: { inspectionId: inspection.id, ticketId: ticket.id, recommendation: parsed.data.recommendation } })));
      return { kind: "submitted" as const };
    });
    if (result.kind === "missing") response.status(404).json({ error: "Inspection not found" });
    else if (result.kind === "state") response.status(409).json({ error: `Inspection cannot be submitted from ${result.state}` });
    else if (result.kind === "evidence") response.status(422).json({ error: "Attach at least one verified site evidence image" });
    else { requestPushDelivery(); response.json({ status: InspectionStatus.SUBMITTED }); }
  }));

  router.post("/inspections/:id/review", requireRole(UserRole.PROJECT_HEAD), asyncRoute(async (request, response) => {
    const parsed = reviewInspectionSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid inspection review", details: parsed.error.flatten() }); return; }
    const agencyId = actorAgency(request);
    const result = await prisma.$transaction(async (transaction) => {
      const inspection = await transaction.inspectionReport.findFirst({ where: { id: routeId(request), ticket: { assignedAgencyId: agencyId } }, select: { id: true, ticketId: true, status: true, assignedEngineerId: true, deadline: true } });
      if (!inspection) return { kind: "missing" as const };
      if (inspection.status !== InspectionStatus.SUBMITTED) return { kind: "state" as const, state: inspection.status };
      if (parsed.data.decision === "ADDITIONAL_INSPECTION") {
        const engineer = await transaction.user.findFirst({ where: { id: parsed.data.engineerId ?? inspection.assignedEngineerId, agencyId, role: UserRole.ENGINEER, deactivatedAt: null }, select: { id: true } });
        if (!engineer) return { kind: "engineer" as const };
      }
      const now = new Date();
      await transaction.inspectionReport.update({ where: { id: inspection.id }, data: { status: InspectionStatus.REVIEWED, reviewedById: request.auth!.userId, reviewedAt: now, reviewDecision: parsed.data.decision, reviewNote: parsed.data.note } });
      // One agency decision resolves the shared review queue for every Project Head.
      await transaction.workflowAction.updateMany({
        where: { dedupeKey: { startsWith: `inspection:${inspection.id}:review:` }, respondedAt: null },
        data: { respondedAt: now },
      });
      if (parsed.data.decision === "NO_WORK_REQUIRED") {
        const ticket = await transaction.ticket.findUniqueOrThrow({ where: { id: inspection.ticketId }, select: { id: true, state: true } });
        await transaction.ticket.update({ where: { id: ticket.id }, data: { state: TicketState.CLOSED } });
        await transaction.ticketStateTransition.create({ data: { ticketId: ticket.id, fromState: ticket.state, toState: TicketState.CLOSED, reason: "INSPECTION_REVIEW_NO_WORK_REQUIRED", actedById: request.auth!.userId } });
      }
      if (parsed.data.decision === "ADDITIONAL_INSPECTION") {
        const nextDeadline = parsed.data.deadline ? new Date(parsed.data.deadline) : new Date(Math.max(Date.now(), inspection.deadline.getTime()) + 2 * 86_400_000);
        const assignment = await createAssignment(transaction, { ticketId: inspection.ticketId, engineerId: parsed.data.engineerId ?? inspection.assignedEngineerId, assignedById: request.auth!.userId, agencyId, deadline: nextDeadline });
        if (!assignment) throw new Error("Validated inspection Engineer became unavailable");
        const ticket = await transaction.ticket.findUniqueOrThrow({ where: { id: inspection.ticketId }, select: { id: true, state: true } });
        if (ticket.state !== TicketState.INSPECTION_DUE) {
          await transaction.ticket.update({ where: { id: ticket.id }, data: { state: TicketState.INSPECTION_DUE } });
          await transaction.ticketStateTransition.create({ data: { ticketId: ticket.id, fromState: ticket.state, toState: TicketState.INSPECTION_DUE, reason: "ADDITIONAL_INSPECTION_REQUESTED", actedById: request.auth!.userId } });
        }
      }
      return { kind: "reviewed" as const, ticketId: inspection.ticketId };
    });
    if (result.kind === "missing") response.status(404).json({ error: "Inspection not found" });
    else if (result.kind === "state") response.status(409).json({ error: `Inspection cannot be reviewed from ${result.state}` });
    else if (result.kind === "engineer") response.status(422).json({ error: "Choose an active Engineer from your agency" });
    else { requestPushDelivery(); response.json({ status: InspectionStatus.REVIEWED, decision: parsed.data.decision, ticketId: result.ticketId }); }
  }));

  return router;
}
