import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { ProjectState, TicketState, UserRole, prisma, type Prisma } from "db";
import {
  completionEvidenceRequestSchema,
  createProjectSchema,
  projectStateSchema,
  updateProjectStatusSchema,
  updateProjectTimelineSchema,
} from "@civicos/shared";
import { z } from "zod";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";
import { checkProjectConflicts } from "../conflicts/service";
import { createDependencyRequests, DependencyActionError } from "../dependencies/service";
import type { ImageStorage } from "../images/storage";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};
const idSchema = z.string().uuid();
const scopeSchema = z.enum(["mine", "assigned", "geographic"]);

function routeId(request: Request): string {
  const value = request.params.id;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function actorAgency(request: Request): string {
  const agencyId = request.auth?.agencyId;
  if (!agencyId) throw new Error("Internal account is missing an agency assignment");
  return agencyId;
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
}

function canEngineerEdit(request: Request, project: { agencyId: string; engineerId: string | null }): boolean {
  return request.auth!.role === UserRole.ENGINEER
    && project.engineerId === request.auth!.userId
    && project.agencyId === request.auth!.agencyId;
}

async function notifyProjectStakeholders(
  transaction: Prisma.TransactionClient,
  project: { id: string; agencyId: string; ticketId: string | null },
  type: string,
  payload: Prisma.InputJsonObject,
): Promise<void> {
  const stakeholders = await transaction.user.findMany({
    where: {
      OR: [
        { agencyId: project.agencyId, role: UserRole.PROJECT_HEAD },
        ...(project.ticketId ? [{ validations: { some: { ticketId: project.ticketId, counted: true } } }] : []),
      ],
    },
    select: { id: true },
  });
  if (stakeholders.length > 0) {
    await transaction.notification.createMany({
      data: stakeholders.map(({ id }) => ({ userId: id, type, payload: { projectId: project.id, ...payload } })),
    });
  }
}

const projectInclude = {
  agency: { select: { id: true, name: true } },
  engineer: { select: { id: true, email: true } },
  ticket: {
    include: {
      category: { select: { id: true, name: true } },
      ward: { select: { id: true, name: true } },
      observations: { orderBy: { createdAt: "asc" as const }, select: { imageUrl: true, note: true } },
      inspectionReports: { orderBy: { createdAt: "desc" as const }, select: { id: true, fileUrl: true, contentType: true, notes: true, uploadedAt: true, createdAt: true } },
    },
  },
  dependencies: { include: { respondingAgency: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" as const } },
  stateTransitions: { orderBy: { createdAt: "asc" as const } },
  workNotes: { include: { author: { select: { id: true, email: true } } }, orderBy: { createdAt: "desc" as const } },
  completionEvidence: { where: { uploadedAt: { not: null } }, orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.ProjectInclude;

export function createProjectsRouter(storage: ImageStorage): Router {
  const router = Router();
  router.use(requireAuth);

  router.post(
    "/projects",
    requireRole(UserRole.PROJECT_HEAD),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const parsed = createProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid project", details: parsed.error.flatten() });
        return;
      }
      const agencyId = actorAgency(request);
      const engineer = await prisma.user.findFirst({ where: { id: parsed.data.engineerId, agencyId, role: UserRole.ENGINEER }, select: { id: true } });
      if (!engineer) {
        response.status(422).json({ error: "Choose an Executive Engineer from your agency roster" });
        return;
      }

      const result = await prisma.$transaction(async (transaction) => {
        // Part III §17.2 — lock and scope the ticket before any state mutation.
        const rows = await transaction.$queryRaw<Array<{ id: string; state: TicketState; assignedAgencyId: string | null }>>`
          SELECT "id", "state", "assignedAgencyId" FROM "Ticket"
          WHERE "id" = ${parsed.data.ticketId}::uuid FOR UPDATE
        `;
        const ticket = rows[0];
        if (!ticket || ticket.assignedAgencyId !== agencyId) return { kind: "missing" as const };
        if (ticket.state !== TicketState.INSPECTION_COMPLETE) return { kind: "state" as const, state: ticket.state };

        const created = await transaction.project.create({
          data: {
            ticketId: ticket.id,
            agencyId,
            engineerId: engineer.id,
            state: ProjectState.PENDING_UPTAKE,
            stateTransitions: { create: [
              { fromState: null, toState: ProjectState.CREATED, reason: "PROJECT_CREATED", actedById: request.auth!.userId },
              { fromState: ProjectState.CREATED, toState: ProjectState.PENDING_UPTAKE, reason: "ENGINEER_ASSIGNED", actedById: request.auth!.userId },
            ] },
          },
          include: { engineer: { select: { id: true, email: true } }, ticket: { select: { id: true, title: true } } },
        });
        await transaction.ticket.update({ where: { id: ticket.id }, data: { state: TicketState.ENGINEER_ASSIGNED } });
        await transaction.ticketStateTransition.createMany({ data: [
          { ticketId: ticket.id, fromState: TicketState.INSPECTION_COMPLETE, toState: TicketState.PROJECT_CREATED, reason: "PROJECT_CREATED" },
          { ticketId: ticket.id, fromState: TicketState.PROJECT_CREATED, toState: TicketState.ENGINEER_ASSIGNED, reason: "ENGINEER_ASSIGNED" },
        ] });
        await transaction.notification.create({ data: { userId: engineer.id, type: "PROJECT_ASSIGNMENT", payload: { projectId: created.id, ticketId: ticket.id } } });
        const dependencies = await createDependencyRequests(transaction, created.id, agencyId, parsed.data.dependencies ?? [], request.auth!.userId);
        return { kind: "created" as const, project: created, dependencies };
      }).catch((error: unknown) => {
        if (error instanceof DependencyActionError) return { kind: "dependency" as const, error: error.message, status: error.status };
        throw error;
      });

      if (result.kind === "missing") response.status(404).json({ error: "Ticket not found" });
      else if (result.kind === "state") response.status(409).json({ error: `Project cannot be created from ${result.state}` });
      else if (result.kind === "dependency") response.status(result.status).json({ error: result.error });
      else response.status(201).json({ project: result.project, dependencies: result.dependencies });
    }),
  );

  router.get(
    "/projects/:id",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const id = idSchema.safeParse(routeId(request));
      if (!id.success) {
        response.status(404).json({ error: "Project not found" });
        return;
      }
      const project = await prisma.project.findFirst({
        where: { id: id.data, ...(request.auth!.role === UserRole.PROJECT_HEAD ? { agencyId: actorAgency(request) } : {}) },
        include: projectInclude,
      });
      if (!project) {
        response.status(404).json({ error: "Project not found" });
        return;
      }
      response.json({ project: { ...project, editable: canEngineerEdit(request, project) } });
    }),
  );

  router.get(
    "/projects",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const status = request.query.status ? projectStateSchema.safeParse(request.query.status) : null;
      const agency = request.query.agency ? idSchema.safeParse(request.query.agency) : null;
      const ward = request.query.ward ? idSchema.safeParse(request.query.ward) : null;
      const scope = request.query.scope ? scopeSchema.safeParse(request.query.scope) : null;
      if ((status && !status.success) || (agency && !agency.success) || (ward && !ward.success) || (scope && !scope.success)) {
        response.status(400).json({ error: "Invalid project filter" });
        return;
      }
      if (request.auth!.role === UserRole.PROJECT_HEAD && agency?.success && agency.data !== actorAgency(request)) {
        response.status(403).json({ error: "Cannot view another agency's projects" });
        return;
      }

      const engineerScope = request.auth!.role === UserRole.ENGINEER ? (scope?.success ? scope.data : "mine") : undefined;
      const where: Prisma.ProjectWhereInput = {
        ...(request.auth!.role === UserRole.PROJECT_HEAD ? { agencyId: actorAgency(request) } : {}),
        ...(request.auth!.role !== UserRole.PROJECT_HEAD && agency?.success ? { agencyId: agency.data } : {}),
        ...(engineerScope === "mine" ? { engineerId: request.auth!.userId, state: status?.success ? status.data : { notIn: [ProjectState.CLOSED, ProjectState.CANCELLED] } } : {}),
        ...(engineerScope === "assigned" ? { engineerId: request.auth!.userId, state: ProjectState.PENDING_UPTAKE } : {}),
        ...(engineerScope === "geographic" && status?.success ? { state: status.data } : {}),
        ...(!engineerScope && status?.success ? { state: status.data } : {}),
        ...(ward?.success ? { ticket: { wardId: ward.data } } : {}),
      };
      const projects = await prisma.project.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          agency: { select: { id: true, name: true } },
          engineer: { select: { id: true, email: true } },
          ticket: { select: { id: true, title: true, ward: { select: { id: true, name: true } } } },
        },
      });
      response.json({ projects: projects.map((project) => ({ ...project, editable: canEngineerEdit(request, project) })) });
    }),
  );

  router.post(
    "/projects/:id/uptake",
    requireRole(UserRole.ENGINEER),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const project = await prisma.project.findFirst({ where: { id: routeId(request), engineerId: request.auth!.userId, agencyId: actorAgency(request) }, select: { id: true, state: true } });
      if (!project) {
        response.status(404).json({ error: "Assigned project not found" });
        return;
      }
      if (project.state !== ProjectState.PENDING_UPTAKE) {
        response.status(409).json({ error: `Project cannot be accepted from ${project.state}` });
        return;
      }
      const updated = await prisma.$transaction(async (transaction) => {
        await transaction.projectStateTransition.create({ data: { projectId: project.id, fromState: project.state, toState: ProjectState.UPTAKEN, reason: "ENGINEER_UPTAKE", actedById: request.auth!.userId } });
        return transaction.project.update({ where: { id: project.id }, data: { state: ProjectState.UPTAKEN } });
      });
      response.json({ project: updated });
    }),
  );

  router.patch(
    "/projects/:id/timeline",
    requireRole(UserRole.ENGINEER),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const parsed = updateProjectTimelineSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid execution details", details: parsed.error.flatten() });
        return;
      }
      const result = await prisma.$transaction(async (transaction) => {
        const rows = await transaction.$queryRaw<Array<{ id: string; agencyId: string; engineerId: string | null; state: ProjectState; ticketId: string | null }>>`
          SELECT "id", "agencyId", "engineerId", "state", "ticketId" FROM "Project"
          WHERE "id" = ${routeId(request)}::uuid FOR UPDATE
        `;
        const project = rows[0];
        if (!project || !canEngineerEdit(request, project)) return { kind: "missing" as const };
        if (project.state !== ProjectState.UPTAKEN && project.state !== ProjectState.ACTIVE && project.state !== ProjectState.MODIFIED) return { kind: "state" as const, state: project.state };
        const initialTimeline = project.state === ProjectState.UPTAKEN;
        const interimState = initialTimeline ? ProjectState.TIMELINE_SET : ProjectState.MODIFIED;
        await transaction.project.update({ where: { id: project.id }, data: {
          plannedStart: new Date(parsed.data.plannedStart),
          plannedEnd: new Date(parsed.data.plannedEnd),
          workDescription: parsed.data.workDescription,
          dependencyFlags: parsed.data.dependencyFlags,
          state: interimState,
        } });
        await transaction.projectStateTransition.create({ data: { projectId: project.id, fromState: project.state, toState: interimState, reason: initialTimeline ? "TIMELINE_SET" : "TIMELINE_MODIFIED", actedById: request.auth!.userId } });

        // Part III §11 — advisory only. Phase 7 fills the function body.
        const conflicts = await checkProjectConflicts(transaction, project.id);
        if (initialTimeline) {
          await transaction.project.update({ where: { id: project.id }, data: { state: ProjectState.CONFLICT_CHECKED } });
          await transaction.projectStateTransition.create({ data: { projectId: project.id, fromState: ProjectState.TIMELINE_SET, toState: ProjectState.CONFLICT_CHECKED, reason: "CONFLICT_CHECK_COMPLETE", actedById: request.auth!.userId } });
        }
        await transaction.project.update({ where: { id: project.id }, data: { state: ProjectState.ACTIVE } });
        await transaction.projectStateTransition.create({ data: { projectId: project.id, fromState: initialTimeline ? ProjectState.CONFLICT_CHECKED : ProjectState.MODIFIED, toState: ProjectState.ACTIVE, reason: conflicts.length === 0 ? "NO_BLOCKING_CONFLICTS" : "ADVISORY_CONFLICTS_REVIEWED", actedById: request.auth!.userId } });

        if (project.ticketId) {
          const ticket = await transaction.ticket.findUnique({ where: { id: project.ticketId }, select: { state: true } });
          if (ticket?.state === TicketState.ENGINEER_ASSIGNED) {
            await transaction.ticket.update({ where: { id: project.ticketId }, data: { state: TicketState.WORK_IN_PROGRESS } });
            await transaction.ticketStateTransition.create({ data: { ticketId: project.ticketId, fromState: ticket.state, toState: TicketState.WORK_IN_PROGRESS, reason: "EXECUTION_STARTED" } });
          }
        }
        if (!initialTimeline) await notifyProjectStakeholders(transaction, project, "PROJECT_TIMELINE_MODIFIED", { conflicts: conflicts.length });
        return { kind: "updated" as const, conflicts };
      });
      if (result.kind === "missing") response.status(404).json({ error: "Assigned project not found" });
      else if (result.kind === "state") response.status(409).json({ error: `Timeline cannot be set from ${result.state}` });
      else response.json({ project: await prisma.project.findUniqueOrThrow({ where: { id: routeId(request) } }), conflicts: result.conflicts });
    }),
  );

  router.get(
    "/projects/:id/conflicts",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const project = await prisma.project.findFirst({ where: { id: routeId(request), ...(request.auth!.role === UserRole.PROJECT_HEAD ? { agencyId: actorAgency(request) } : {}) }, select: { id: true } });
      if (!project) {
        response.status(404).json({ error: "Project not found" });
        return;
      }
      response.json({ conflicts: await checkProjectConflicts(prisma, project.id) });
    }),
  );

  router.patch(
    "/projects/:id/status",
    requireRole(UserRole.ENGINEER),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const parsed = updateProjectStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid project update", details: parsed.error.flatten() });
        return;
      }
      const result = await prisma.$transaction(async (transaction) => {
        const project = await transaction.project.findFirst({ where: { id: routeId(request), engineerId: request.auth!.userId, agencyId: actorAgency(request) }, select: { id: true, state: true, ticketId: true } });
        if (!project) return { kind: "missing" as const };
        if (parsed.data.note) await transaction.projectWorkNote.create({ data: { projectId: project.id, authorId: request.auth!.userId, note: parsed.data.note } });
        if (!parsed.data.state) return { kind: "updated" as const };
        if (project.state !== ProjectState.ACTIVE) return { kind: "state" as const, state: project.state };
        await transaction.project.update({ where: { id: project.id }, data: { state: ProjectState.COMPLETED } });
        await transaction.projectStateTransition.create({ data: { projectId: project.id, fromState: project.state, toState: ProjectState.COMPLETED, reason: "WORK_COMPLETED", actedById: request.auth!.userId } });
        if (project.ticketId) {
          const ticket = await transaction.ticket.findUnique({ where: { id: project.ticketId }, select: { state: true } });
          if (ticket?.state === TicketState.WORK_IN_PROGRESS) {
            await transaction.ticket.update({ where: { id: project.ticketId }, data: { state: TicketState.WORK_COMPLETED } });
            await transaction.ticketStateTransition.create({ data: { ticketId: project.ticketId, fromState: ticket.state, toState: TicketState.WORK_COMPLETED, reason: "WORK_COMPLETED" } });
          }
        }
        return { kind: "updated" as const };
      });
      if (result.kind === "missing") response.status(404).json({ error: "Assigned project not found" });
      else if (result.kind === "state") response.status(409).json({ error: `Project cannot be completed from ${result.state}` });
      else response.json({ project: await prisma.project.findUniqueOrThrow({ where: { id: routeId(request) } }) });
    }),
  );

  router.post(
    "/projects/:id/completion",
    requireRole(UserRole.ENGINEER),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const parsed = completionEvidenceRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid completion evidence", details: parsed.error.flatten() });
        return;
      }
      const project = await prisma.project.findFirst({ where: { id: routeId(request), engineerId: request.auth!.userId, agencyId: actorAgency(request) }, select: { id: true, state: true, ticketId: true } });
      if (!project || !project.ticketId) {
        response.status(404).json({ error: "Assigned ticket project not found" });
        return;
      }

      if (parsed.data.action === "presign") {
        if (project.state !== ProjectState.COMPLETED) {
          response.status(409).json({ error: `Completion evidence cannot be submitted from ${project.state}` });
          return;
        }
        const evidenceId = randomUUID();
        const objectKey = `completion-evidence/${project.id}/${evidenceId}-${safeFileName(parsed.data.fileName)}`;
        const upload = storage.createUpload(objectKey, parsed.data.contentType);
        await prisma.completionEvidence.create({ data: {
          id: evidenceId,
          projectId: project.id,
          ticketId: project.ticketId,
          submittedById: request.auth!.userId,
          photoUrl: upload.publicUrl,
          objectKey,
          contentType: parsed.data.contentType,
          notes: parsed.data.notes,
        } });
        response.status(201).json({ evidenceId, upload });
        return;
      }

      const evidenceId = parsed.data.evidenceId;
      const result = await prisma.$transaction(async (transaction) => {
        const evidence = await transaction.completionEvidence.findFirst({ where: { id: evidenceId, projectId: project.id, submittedById: request.auth!.userId, uploadedAt: null }, select: { id: true, ticketId: true } });
        if (!evidence) return { kind: "missing" as const };
        const lockedProject = await transaction.project.findUniqueOrThrow({ where: { id: project.id }, select: { state: true } });
        const ticket = await transaction.ticket.findUniqueOrThrow({ where: { id: evidence.ticketId }, select: { state: true } });
        if (lockedProject.state !== ProjectState.COMPLETED || ticket.state !== TicketState.WORK_COMPLETED) return { kind: "state" as const, projectState: lockedProject.state, ticketState: ticket.state };

        // Part III §11 / Part II M-C13 — reuse the citizens who validated this ticket.
        const validators = await transaction.validation.findMany({ where: { ticketId: evidence.ticketId, counted: true }, distinct: ["validatorId"], select: { validatorId: true } });
        await transaction.completionEvidence.update({ where: { id: evidence.id }, data: { uploadedAt: new Date() } });
        await transaction.project.update({ where: { id: project.id }, data: { state: ProjectState.AWAITING_VERIFICATION } });
        await transaction.projectStateTransition.create({ data: { projectId: project.id, fromState: ProjectState.COMPLETED, toState: ProjectState.AWAITING_VERIFICATION, reason: "COMPLETION_EVIDENCE_SUBMITTED", actedById: request.auth!.userId } });
        await transaction.ticket.update({ where: { id: evidence.ticketId }, data: { state: TicketState.AWAITING_CITIZEN_VERIFICATION } });
        await transaction.ticketStateTransition.create({ data: { ticketId: evidence.ticketId, fromState: TicketState.WORK_COMPLETED, toState: TicketState.AWAITING_CITIZEN_VERIFICATION, reason: "COMPLETION_EVIDENCE_SUBMITTED" } });
        if (validators.length > 0) {
          await transaction.completionVerificationRequest.createMany({ data: validators.map(({ validatorId }) => ({ completionEvidenceId: evidence.id, citizenId: validatorId })) });
          await transaction.notification.createMany({ data: validators.map(({ validatorId }) => ({ userId: validatorId, type: "COMPLETION_VERIFICATION_REQUEST", payload: { projectId: project.id, ticketId: evidence.ticketId, evidenceId: evidence.id } })) });
        }
        return { kind: "completed" as const, notified: validators.length };
      });
      if (result.kind === "missing") response.status(404).json({ error: "Completion evidence not found" });
      else if (result.kind === "state") response.status(409).json({ error: `Completion handoff requires COMPLETED/WORK_COMPLETED, found ${result.projectState}/${result.ticketState}` });
      else response.json({ evidenceId, projectState: ProjectState.AWAITING_VERIFICATION, ticketState: TicketState.AWAITING_CITIZEN_VERIFICATION, validatorsNotified: result.notified });
    }),
  );

  return router;
}
