import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { CivicWorkOrigin, ProjectBlockerStatus, ProjectState, ReassignmentRequestStatus, TicketState, UserRole, WorkflowActionType, prisma, type Prisma } from "db";
import {
  completionEvidenceRequestSchema,
  createProjectSchema,
  projectStateSchema,
  reportProjectBlockerSchema,
  requestReassignmentSchema,
  resolveProjectBlockerSchema,
  respondReassignmentSchema,
  updateProjectStatusSchema,
  updateProjectTimelineSchema,
} from "@civicos/shared";
import { z } from "zod";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";
import { checkProjectConflicts } from "../conflicts/service";
import { createDependencyRequests, DependencyActionError } from "../dependencies/service";
import { storageReadUrl, type ImageStorage } from "../images/storage";
import { checkRoadConflicts, isRoadCategory } from "../road-intelligence/service";
import { createNotification, createNotifications, requestPushDelivery } from "../notifications/service";
import { paginationMeta, parsePagination } from "../http/pagination";
import { completeWorkflowAction, createWorkflowAction } from "../deadlines/service";
import { canSaveTimeline, canStartWork, stateAfterTimelineCheck } from "./lifecycle";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};
const idSchema = z.string().uuid();
const scopeSchema = z.enum(["mine", "assigned", "geographic"]);
const engineerStageSchema = z.enum(["scheduled", "active", "completed"]);

function routeId(request: Request): string {
  const value = request.params.id;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function routeParam(request: Request, key: string): string {
  const value = request.params[key];
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

function projectReadScope(request: Request): Prisma.ProjectWhereInput {
  const agencyId = actorAgency(request);
  return request.auth!.role === UserRole.ENGINEER
    ? { agencyId, engineerId: request.auth!.userId }
    : { agencyId };
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
        ...(project.ticketId ? [{ observations: { some: { ticketId: project.ticketId } } }] : []),
        ...(project.ticketId ? [{ validations: { some: { ticketId: project.ticketId, counted: true } } }] : []),
      ],
    },
    select: { id: true },
  });
  if (stakeholders.length > 0) {
    await createNotifications(transaction, stakeholders.map(({ id }) => ({ userId: id, type, payload: { projectId: project.id, ...payload } })));
  }
}

const projectInclude = {
  agency: { select: { id: true, name: true } },
  engineer: { select: { id: true, email: true } },
  ticket: {
    include: {
      category: { select: { id: true, name: true } },
      ward: { select: { id: true, name: true } },
      observations: { orderBy: { createdAt: "asc" as const }, select: { imageUrl: true, note: true, images: { where: { uploadedAt: { not: null } }, orderBy: { createdAt: "asc" as const }, take: 1, select: { objectKey: true, url: true } } } },
      inspectionReports: { orderBy: { createdAt: "desc" as const }, include: { assignedEngineer: { select: { id: true, email: true } }, assignedBy: { select: { id: true, email: true } }, evidence: { orderBy: { createdAt: "asc" as const } } } },
    },
  },
  dependencies: { include: { respondingAgency: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" as const } },
  stateTransitions: { orderBy: { createdAt: "asc" as const } },
  workNotes: { include: { author: { select: { id: true, email: true } } }, orderBy: { createdAt: "desc" as const } },
  completionEvidence: { where: { uploadedAt: { not: null } }, orderBy: { createdAt: "desc" as const } },
  intervention: { include: { segment: { select: { id: true, roadName: true, wardId: true, surfaceType: true, lastRestorationDate: true, ward: { select: { id: true, name: true } } } } } },
  workflowActions: { orderBy: { createdAt: "desc" as const }, include: { responsibleUser: { select: { id: true, email: true } } } },
  grievances: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.ProjectInclude;

type ProjectWithDetails = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

function projectForResponse(storage: ImageStorage, project: ProjectWithDetails) {
  const pendingAction = project.workflowActions.filter((action) => !action.respondedAt).sort((first, second) => first.deadline.getTime() - second.deadline.getTime())[0] ?? null;
  return {
    ...project,
    dependencyCount: project.dependencies.length,
    action: pendingAction,
    grievance: project.grievances[0] ?? null,
    ticket: project.ticket ? {
      ...project.ticket,
      observations: project.ticket.observations.map(({ images, ...observation }) => ({
        ...observation,
        imageUrl: images[0] ? storageReadUrl(storage, images[0].objectKey, images[0].url) : observation.imageUrl,
      })),
      inspectionReports: project.ticket.inspectionReports.map(({ objectKey, ...report }) => ({
        ...report,
        fileUrl: objectKey && report.fileUrl ? storageReadUrl(storage, objectKey, report.fileUrl) : null,
        evidence: report.evidence.map(({ objectKey: evidenceKey, ...evidence }) => ({ ...evidence, fileUrl: storageReadUrl(storage, evidenceKey, evidence.fileUrl) })),
      })),
    } : null,
    completionEvidence: project.completionEvidence.map((evidence) => ({
      ...evidence,
      photoUrl: storageReadUrl(storage, evidence.objectKey, evidence.photoUrl),
    })),
  };
}

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
        const rows = await transaction.$queryRaw<Array<{ id: string; state: TicketState; assignedAgencyId: string | null; categoryId: string; wardId: string; reporterId: string | null; title: string; address: string }>>`
          SELECT "id", "state", "assignedAgencyId", "categoryId", "wardId", "reporterId", "title", "address" FROM "Ticket"
          WHERE "id" = ${parsed.data.ticketId}::uuid FOR UPDATE
        `;
        const ticket = rows[0];
        if (!ticket || ticket.assignedAgencyId !== agencyId) return { kind: "missing" as const };
        const roadCategory = await isRoadCategory(transaction, ticket.categoryId);
        const existing = await transaction.project.findUnique({ where: { ticketId: ticket.id }, include: { intervention: true } });
        if (ticket.state !== TicketState.INSPECTION_COMPLETE && !(ticket.state === TicketState.PROJECT_CREATED && existing?.state === ProjectState.CREATED)) {
          return { kind: "state" as const, state: ticket.state };
        }
        if (roadCategory && !parsed.data.intervention && !existing?.intervention) return { kind: "road-input" as const };
        if (!roadCategory && parsed.data.intervention) return { kind: "not-road" as const };

        if (parsed.data.intervention) {
          const segment = await transaction.roadSegment.findFirst({ where: { id: parsed.data.intervention.segmentId, wardId: ticket.wardId }, select: { id: true } });
          if (!segment) return { kind: "segment" as const };
          const refs = await transaction.intervention.count({ where: { id: { in: parsed.data.intervention.dependencyRefs }, segmentId: segment.id } });
          if (refs !== new Set(parsed.data.intervention.dependencyRefs).size) return { kind: "refs" as const };
          if (existing?.intervention && parsed.data.intervention.dependencyRefs.includes(existing.intervention.id)) return { kind: "refs" as const };
        }

        const intervention = parsed.data.intervention;
        const created = existing
          ? await transaction.project.update({
            where: { id: existing.id },
            data: {
              engineerId: engineer.id,
              state: ProjectState.PENDING_UPTAKE,
              ownerProjectHeadId: request.auth!.userId,
              updatedById: request.auth!.userId,
              ...(intervention ? { plannedStart: new Date(intervention.plannedStart), plannedEnd: new Date(intervention.plannedEnd) } : {}),
              stateTransitions: { create: { fromState: ProjectState.CREATED, toState: ProjectState.PENDING_UPTAKE, reason: "ENGINEER_ASSIGNED", actedById: request.auth!.userId } },
              ...(intervention ? { intervention: { update: {
                segmentId: intervention.segmentId,
                purpose: intervention.purpose,
                plannedStart: new Date(intervention.plannedStart),
                plannedEnd: new Date(intervention.plannedEnd),
                affectedLengthM: intervention.affectedLengthM,
                startOffsetM: intervention.startOffsetM,
                dependencyRefs: intervention.dependencyRefs,
              } } } : {}),
            },
            include: { engineer: { select: { id: true, email: true } }, ticket: { select: { id: true, title: true } } },
          })
          : await transaction.project.create({
            data: {
              ticketId: ticket.id,
              categoryId: ticket.categoryId,
              agencyId,
              ownerProjectHeadId: request.auth!.userId,
              createdById: request.auth!.userId,
              updatedById: request.auth!.userId,
              origin: ticket.reporterId ? CivicWorkOrigin.CITIZEN_REPORTED : CivicWorkOrigin.AGENCY_PLANNED,
              title: ticket.title,
              locationLabel: ticket.address,
              wardId: ticket.wardId,
              engineerId: engineer.id,
              state: ProjectState.PENDING_UPTAKE,
              ...(intervention ? { plannedStart: new Date(intervention.plannedStart), plannedEnd: new Date(intervention.plannedEnd) } : {}),
              stateTransitions: { create: [
                { fromState: null, toState: ProjectState.CREATED, reason: "PROJECT_CREATED", actedById: request.auth!.userId },
                { fromState: ProjectState.CREATED, toState: ProjectState.PENDING_UPTAKE, reason: "ENGINEER_ASSIGNED", actedById: request.auth!.userId },
              ] },
              ...(intervention ? { intervention: { create: {
                segmentId: intervention.segmentId,
                requestingAgencyId: agencyId,
                purpose: intervention.purpose,
                plannedStart: new Date(intervention.plannedStart),
                plannedEnd: new Date(intervention.plannedEnd),
                affectedLengthM: intervention.affectedLengthM,
                startOffsetM: intervention.startOffsetM,
                dependencyRefs: intervention.dependencyRefs,
              } } } : {}),
            },
          include: { engineer: { select: { id: true, email: true } }, ticket: { select: { id: true, title: true } } },
          });
        // Phase 1 — ticket intake remains authoritative for the citizen-linked
        // location while Project becomes the reusable spatial work record.
        await transaction.$executeRaw`
          UPDATE "Project" AS project
          SET "geometry" = ticket."coordinates",
              "categoryId" = ticket."categoryId",
              "wardId" = ticket."wardId",
              "title" = ticket."title",
              "locationLabel" = ticket."address"
          FROM "Ticket" AS ticket
          WHERE project."id" = ${created.id}::uuid
            AND ticket."id" = ${ticket.id}::uuid
        `;
        if (intervention) {
          await transaction.$executeRaw`
            UPDATE "Project" AS project
            SET "geometry" = segment."geometry"
            FROM "RoadSegment" AS segment
            WHERE project."id" = ${created.id}::uuid
              AND segment."id" = ${intervention.segmentId}::uuid
          `;
        }
        await transaction.ticket.update({ where: { id: ticket.id }, data: { state: TicketState.ENGINEER_ASSIGNED, ...(intervention ? { roadSegmentId: intervention.segmentId } : {}) } });
        await transaction.ticketStateTransition.createMany({ data: [
          ...(existing ? [] : [{ ticketId: ticket.id, fromState: TicketState.INSPECTION_COMPLETE, toState: TicketState.PROJECT_CREATED, reason: "PROJECT_CREATED" as const, actedById: request.auth!.userId }]),
          { ticketId: ticket.id, fromState: TicketState.PROJECT_CREATED, toState: TicketState.ENGINEER_ASSIGNED, reason: "ENGINEER_ASSIGNED", actedById: request.auth!.userId },
        ] });
        await createNotification(transaction, { userId: engineer.id, type: "PROJECT_ASSIGNMENT", payload: { projectId: created.id, ticketId: ticket.id } });
        await completeWorkflowAction(transaction, `ticket:${ticket.id}:create-project`);
        await completeWorkflowAction(transaction, `ticket:${ticket.id}:assign-engineer`);
        await createWorkflowAction(transaction, {
          dedupeKey: `project:${created.id}:accept`, type: WorkflowActionType.ACCEPT_PROJECT,
          ticketId: ticket.id, projectId: created.id, responsibleUserId: engineer.id, responsibleAgencyId: agencyId,
        });
        await notifyProjectStakeholders(transaction, { id: created.id, agencyId, ticketId: ticket.id }, "PROJECT_CREATED", { ticketId: ticket.id });
        const dependencies = await createDependencyRequests(transaction, created.id, agencyId, parsed.data.dependencies ?? [], request.auth!.userId);
        // Delta §4.3 — generic Phase 7 check remains unchanged and runs first.
        const conflicts = intervention || existing?.intervention ? await checkProjectConflicts(transaction, created.id) : [];
        const roadConflicts = intervention || existing?.intervention ? await checkRoadConflicts(transaction, created.id) : [];
        return { kind: "created" as const, project: created, dependencies, conflicts, roadConflicts };
      }).catch((error: unknown) => {
        if (error instanceof DependencyActionError) return { kind: "dependency" as const, error: error.message, status: error.status };
        throw error;
      });

      if (result.kind === "missing") response.status(404).json({ error: "Ticket not found" });
      else if (result.kind === "state") response.status(409).json({ error: `Project cannot be created from ${result.state}` });
      else if (result.kind === "dependency") response.status(result.status).json({ error: result.error });
      else if (result.kind === "road-input") response.status(422).json({ error: "Road Damage projects require road-segment intervention details" });
      else if (result.kind === "not-road") response.status(422).json({ error: "Interventions are only available for the configured Road Damage category" });
      else if (result.kind === "segment") response.status(422).json({ error: "Choose a road segment in the ticket ward" });
      else if (result.kind === "refs") response.status(422).json({ error: "Every intervention dependency must reference work on the same road segment" });
      else {
        requestPushDelivery();
        response.status(201).json({ project: result.project, dependencies: result.dependencies, conflicts: result.conflicts, roadConflicts: result.roadConflicts });
      }
    }),
  );

  router.get(
    "/projects/:id",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const id = idSchema.safeParse(routeId(request));
      if (!id.success) {
        response.status(404).json({ error: "Project not found" });
        return;
      }
      const project = await prisma.project.findFirst({
        where: { id: id.data, ...projectReadScope(request) },
        include: projectInclude,
      });
      if (!project) {
        response.status(404).json({ error: "Project not found" });
        return;
      }
      response.json({ project: { ...projectForResponse(storage, project), editable: canEngineerEdit(request, project) } });
    }),
  );

  router.get(
    "/projects",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const status = request.query.status ? projectStateSchema.safeParse(request.query.status) : null;
      const agency = request.query.agency ? idSchema.safeParse(request.query.agency) : null;
      const ward = request.query.ward ? idSchema.safeParse(request.query.ward) : null;
      const scope = request.query.scope ? scopeSchema.safeParse(request.query.scope) : null;
      const engineerStage = request.query.stage ? engineerStageSchema.safeParse(request.query.stage) : null;
      const pagination = parsePagination(request.query);
      if ((status && !status.success) || (agency && !agency.success) || (ward && !ward.success) || (scope && !scope.success) || (engineerStage && !engineerStage.success) || !pagination.success) {
        response.status(400).json({ error: "Invalid project filter" });
        return;
      }
      if (agency?.success && agency.data !== actorAgency(request)) {
        response.status(403).json({ error: "Cannot view another agency's projects" });
        return;
      }

      const engineerScope = request.auth!.role === UserRole.ENGINEER ? (scope?.success ? scope.data : "mine") : undefined;
      const stageStates: Record<z.infer<typeof engineerStageSchema>, ProjectState[]> = {
        scheduled: [ProjectState.UPTAKEN, ProjectState.TIMELINE_SET, ProjectState.CONFLICT_CHECKED, ProjectState.READY_TO_START],
        active: [ProjectState.ACTIVE, ProjectState.MODIFIED],
        completed: [ProjectState.COMPLETED, ProjectState.AWAITING_VERIFICATION, ProjectState.CLOSED],
      };
      const where: Prisma.ProjectWhereInput = {
        agencyId: actorAgency(request),
        ...(engineerScope === "mine" ? { engineerId: request.auth!.userId, state: status?.success ? status.data : engineerStage?.success ? { in: stageStates[engineerStage.data] } : { notIn: [ProjectState.CLOSED, ProjectState.CANCELLED] } } : {}),
        ...(engineerScope === "assigned" ? { engineerId: request.auth!.userId, state: ProjectState.PENDING_UPTAKE } : {}),
        ...(engineerScope === "geographic" && status?.success ? { state: status.data } : {}),
        ...(!engineerScope && status?.success ? { state: status.data } : {}),
        ...(ward?.success ? { ticket: { wardId: ward.data } } : {}),
      };
      const [projects, total] = await Promise.all([prisma.project.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pagination.data.skip,
        take: pagination.data.limit,
        select: {
          id: true, referenceNumber: true, title: true, ticketId: true, agencyId: true, origin: true,
          description: true, locationLabel: true, state: true, priority: true, plannedStart: true, plannedEnd: true,
          actualStart: true, actualCompletion: true, workDescription: true, dependencyFlags: true,
          engineerId: true, createdAt: true, updatedAt: true,
          agency: { select: { id: true, name: true } },
          engineer: { select: { id: true, email: true } },
          ticket: { select: { id: true, title: true, ward: { select: { id: true, name: true } } } },
          dependencies: { select: { id: true } },
          _count: { select: { conflictLogs: true, conflictingLogs: true, roadConflictLogs: true, conflictingRoadLogs: true, coordinationRequests: true, conflictingCoordinationRequests: true } },
          workflowActions: { where: { respondedAt: null }, orderBy: { deadline: "asc" }, take: 1, select: { id: true, type: true, deadline: true, responsibleUser: { select: { id: true, email: true } } } },
          grievances: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, reason: true, createdAt: true } },
        },
      }), prisma.project.count({ where })]);
      response.json({ projects: projects.map(({ workflowActions, grievances, dependencies, _count, ...project }) => ({
        ...project,
        dependencyCount: dependencies.length,
        conflictCount: _count.conflictLogs + _count.conflictingLogs,
        roadConflictCount: _count.roadConflictLogs + _count.conflictingRoadLogs,
        coordinationCount: _count.coordinationRequests + _count.conflictingCoordinationRequests,
        action: workflowActions[0] ?? null,
        grievance: grievances[0] ?? null,
        editable: canEngineerEdit(request, project),
      })), pagination: paginationMeta(pagination.data.page, pagination.data.limit, total) });
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
        const now = new Date();
        await transaction.projectStateTransition.create({ data: { projectId: project.id, fromState: project.state, toState: ProjectState.UPTAKEN, reason: "ENGINEER_UPTAKE", actedById: request.auth!.userId } });
        const value = await transaction.project.update({ where: { id: project.id }, data: { state: ProjectState.UPTAKEN }, select: { id: true, ticketId: true, agencyId: true, engineerId: true, state: true } });
        if (value.ticketId && value.engineerId) {
          await completeWorkflowAction(transaction, `project:${project.id}:accept`, now);
          await createWorkflowAction(transaction, {
            dedupeKey: `project:${project.id}:timeline`, type: WorkflowActionType.SET_TIMELINE,
            ticketId: value.ticketId, projectId: value.id, responsibleUserId: value.engineerId, responsibleAgencyId: value.agencyId,
          }, now);
        }
        return value;
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
        const rows = await transaction.$queryRaw<Array<{ id: string; agencyId: string; engineerId: string | null; state: ProjectState; ticketId: string | null; actualStart: Date | null }>>`
          SELECT "id", "agencyId", "engineerId", "state", "ticketId", "actualStart" FROM "Project"
          WHERE "id" = ${routeId(request)}::uuid FOR UPDATE
        `;
        const project = rows[0];
        if (!project || !canEngineerEdit(request, project)) return { kind: "missing" as const };
        if (!canSaveTimeline(project.state)) return { kind: "state" as const, state: project.state };
        const initialTimeline = project.state === ProjectState.UPTAKEN;
        const executionAlreadyStarted = project.actualStart !== null;
        const interimState = initialTimeline ? ProjectState.TIMELINE_SET : ProjectState.MODIFIED;
        await transaction.project.update({ where: { id: project.id }, data: {
          plannedStart: new Date(parsed.data.plannedStart),
          plannedEnd: new Date(parsed.data.plannedEnd),
          workDescription: parsed.data.workDescription,
          dependencyFlags: parsed.data.dependencyFlags,
          state: interimState,
        } });
        await transaction.intervention.updateMany({ where: { projectId: project.id }, data: {
          plannedStart: new Date(parsed.data.plannedStart),
          plannedEnd: new Date(parsed.data.plannedEnd),
        } });
        await transaction.projectStateTransition.create({ data: { projectId: project.id, fromState: project.state, toState: interimState, reason: initialTimeline ? "TIMELINE_SET" : "TIMELINE_MODIFIED", actedById: request.auth!.userId } });

        // Part III §11 — advisory only. Phase 7 fills the function body.
        const conflicts = await checkProjectConflicts(transaction, project.id);
        const roadConflicts = await checkRoadConflicts(transaction, project.id);
        if (initialTimeline) {
          await transaction.project.update({ where: { id: project.id }, data: { state: ProjectState.CONFLICT_CHECKED } });
          await transaction.projectStateTransition.create({ data: { projectId: project.id, fromState: ProjectState.TIMELINE_SET, toState: ProjectState.CONFLICT_CHECKED, reason: "CONFLICT_CHECK_COMPLETE", actedById: request.auth!.userId } });
        }
        const readyState = stateAfterTimelineCheck(project.actualStart);
        await transaction.project.update({ where: { id: project.id }, data: { state: readyState, updatedById: request.auth!.userId } });
        await transaction.projectStateTransition.create({ data: {
          projectId: project.id,
          fromState: initialTimeline ? ProjectState.CONFLICT_CHECKED : ProjectState.MODIFIED,
          toState: readyState,
          reason: executionAlreadyStarted ? "ACTIVE_TIMELINE_UPDATED" : "READY_TO_START_AFTER_ADVISORY_CHECKS",
          actedById: request.auth!.userId,
        } });
        await transaction.projectAuditEvent.create({ data: {
          projectId: project.id,
          action: executionAlreadyStarted ? "ACTIVE_TIMELINE_UPDATED" : "TIMELINE_READY_TO_START",
          actorId: request.auth!.userId,
          metadata: { genericConflicts: conflicts.length, roadConflicts: roadConflicts.length, advisory: true },
        } });
        await notifyProjectStakeholders(
          transaction,
          project,
          initialTimeline ? "PROJECT_READY_TO_START" : "PROJECT_TIMELINE_MODIFIED",
          { conflicts: conflicts.length, roadConflicts: roadConflicts.length, state: readyState },
        );
        if (project.ticketId && project.engineerId) {
          await completeWorkflowAction(transaction, `project:${project.id}:timeline`);
          if (!executionAlreadyStarted) await createWorkflowAction(transaction, {
            dedupeKey: `project:${project.id}:start-work`, type: WorkflowActionType.START_WORK,
            ticketId: project.ticketId, projectId: project.id, responsibleUserId: project.engineerId, responsibleAgencyId: project.agencyId,
            explicitDeadline: new Date(parsed.data.plannedStart),
          });
        }
        return { kind: "updated" as const, conflicts, roadConflicts };
      });
      if (result.kind === "missing") response.status(404).json({ error: "Assigned project not found" });
      else if (result.kind === "state") response.status(409).json({ error: `Timeline cannot be set from ${result.state}` });
      else response.json({ project: await prisma.project.findUniqueOrThrow({ where: { id: routeId(request) } }), conflicts: result.conflicts, roadConflicts: result.roadConflicts });
    }),
  );

  router.post(
    "/projects/:id/start",
    requireRole(UserRole.ENGINEER),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const result = await prisma.$transaction(async (transaction) => {
        const rows = await transaction.$queryRaw<Array<{ id: string; agencyId: string; engineerId: string | null; state: ProjectState; ticketId: string | null; plannedEnd: Date | null }>>`
          SELECT "id", "agencyId", "engineerId", "state", "ticketId", "plannedEnd" FROM "Project"
          WHERE "id" = ${routeId(request)}::uuid FOR UPDATE
        `;
        const project = rows[0];
        if (!project || !canEngineerEdit(request, project)) return { kind: "missing" as const };
        if (!canStartWork(project.state)) return { kind: "state" as const, state: project.state };
        const now = new Date();
        await transaction.project.update({ where: { id: project.id }, data: { state: ProjectState.ACTIVE, actualStart: now, updatedById: request.auth!.userId } });
        await transaction.projectStateTransition.create({ data: { projectId: project.id, fromState: ProjectState.READY_TO_START, toState: ProjectState.ACTIVE, reason: "ENGINEER_STARTED_WORK", actedById: request.auth!.userId } });
        await transaction.projectAuditEvent.create({ data: { projectId: project.id, action: "WORK_STARTED", actorId: request.auth!.userId, metadata: { actualStart: now.toISOString() } } });
        if (project.ticketId) {
          const ticket = await transaction.ticket.findUnique({ where: { id: project.ticketId }, select: { state: true } });
          if (ticket?.state === TicketState.ENGINEER_ASSIGNED) {
            await transaction.ticket.update({ where: { id: project.ticketId }, data: { state: TicketState.WORK_IN_PROGRESS } });
            await transaction.ticketStateTransition.create({ data: { ticketId: project.ticketId, fromState: ticket.state, toState: TicketState.WORK_IN_PROGRESS, reason: "ENGINEER_STARTED_WORK", actedById: request.auth!.userId } });
          }
          await completeWorkflowAction(transaction, `project:${project.id}:start-work`, now);
          if (project.engineerId) await createWorkflowAction(transaction, {
            dedupeKey: `project:${project.id}:complete-work`,
            type: WorkflowActionType.COMPLETE_WORK,
            ticketId: project.ticketId,
            projectId: project.id,
            responsibleUserId: project.engineerId,
            responsibleAgencyId: project.agencyId,
            ...(project.plannedEnd ? { explicitDeadline: project.plannedEnd } : {}),
          }, now);
        }
        await notifyProjectStakeholders(transaction, project, "WORK_STARTED", { actualStart: now.toISOString() });
        return { kind: "started" as const };
      });
      if (result.kind === "missing") response.status(404).json({ error: "Assigned project not found" });
      else if (result.kind === "state") response.status(409).json({ error: `Work cannot be started from ${result.state}` });
      else response.json({ project: await prisma.project.findUniqueOrThrow({ where: { id: routeId(request) } }) });
    }),
  );

  router.get(
    "/projects/:id/conflicts",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const project = await prisma.project.findFirst({ where: { id: routeId(request), ...projectReadScope(request) }, select: { id: true } });
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
        await transaction.project.update({
          where: { id: project.id },
          data: { state: ProjectState.COMPLETED, actualCompletion: new Date(), updatedById: request.auth!.userId },
        });
        await transaction.projectStateTransition.create({ data: { projectId: project.id, fromState: project.state, toState: ProjectState.COMPLETED, reason: "WORK_COMPLETED", actedById: request.auth!.userId } });
        if (project.ticketId) {
          const ticket = await transaction.ticket.findUnique({ where: { id: project.ticketId }, select: { state: true } });
          if (ticket?.state === TicketState.WORK_IN_PROGRESS) {
            await transaction.ticket.update({ where: { id: project.ticketId }, data: { state: TicketState.WORK_COMPLETED } });
            await transaction.ticketStateTransition.create({ data: { ticketId: project.ticketId, fromState: ticket.state, toState: TicketState.WORK_COMPLETED, reason: "WORK_COMPLETED", actedById: request.auth!.userId } });
          }
        }
        await notifyProjectStakeholders(transaction, { ...project, agencyId: actorAgency(request) }, "WORK_COMPLETED", {});
        if (project.ticketId) {
          await completeWorkflowAction(transaction, `project:${project.id}:complete-work`);
          await createWorkflowAction(transaction, {
            dedupeKey: `project:${project.id}:submit-completion`, type: WorkflowActionType.SUBMIT_COMPLETION,
            ticketId: project.ticketId, projectId: project.id, responsibleUserId: request.auth!.userId, responsibleAgencyId: actorAgency(request),
          });
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
        const upload = await storage.createUpload(objectKey, parsed.data.contentType);
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
      const pendingEvidence = await prisma.completionEvidence.findFirst({
        where: { id: evidenceId, projectId: project.id, submittedById: request.auth!.userId, uploadedAt: null },
        select: { objectKey: true, contentType: true },
      });
      if (!pendingEvidence) {
        response.status(404).json({ error: "Completion evidence not found" });
        return;
      }
      if (!(await storage.verifyUpload(pendingEvidence.objectKey, pendingEvidence.contentType))) {
        response.status(422).json({ error: "The completion photo is missing, empty, too large, or has an unexpected file type. Upload it again." });
        return;
      }
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
        await transaction.ticketStateTransition.create({ data: { ticketId: evidence.ticketId, fromState: TicketState.WORK_COMPLETED, toState: TicketState.AWAITING_CITIZEN_VERIFICATION, reason: "COMPLETION_EVIDENCE_SUBMITTED", actedById: request.auth!.userId } });
        if (validators.length > 0) {
          await transaction.completionVerificationRequest.createMany({ data: validators.map(({ validatorId }) => ({ completionEvidenceId: evidence.id, citizenId: validatorId })) });
          await createNotifications(transaction, validators.map(({ validatorId }) => ({ userId: validatorId, type: "COMPLETION_VERIFICATION_REQUEST", payload: { projectId: project.id, ticketId: evidence.ticketId, evidenceId: evidence.id } })));
        }
        await completeWorkflowAction(transaction, `project:${project.id}:submit-completion`);
        return { kind: "completed" as const, notified: validators.length };
      });
      if (result.kind === "missing") response.status(404).json({ error: "Completion evidence not found" });
      else if (result.kind === "state") response.status(409).json({ error: `Completion handoff requires COMPLETED/WORK_COMPLETED, found ${result.projectState}/${result.ticketState}` });
      else {
        requestPushDelivery();
        response.json({ evidenceId, projectState: ProjectState.AWAITING_VERIFICATION, ticketState: TicketState.AWAITING_CITIZEN_VERIFICATION, validatorsNotified: result.notified });
      }
    }),
  );

  router.post("/projects/:id/reassignment-requests", requireRole(UserRole.ENGINEER), requirePasswordResetComplete, asyncRoute(async (request, response) => {
    const parsed = requestReassignmentSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid reassignment request", details: parsed.error.flatten() }); return; }
    const project = await prisma.project.findFirst({ where: { id: routeId(request), agencyId: actorAgency(request), engineerId: request.auth!.userId }, select: { id: true, ticketId: true, state: true, title: true } });
    if (!project) { response.status(404).json({ error: "Assigned project not found" }); return; }
    if (project.state !== ProjectState.PENDING_UPTAKE) { response.status(409).json({ error: "Reassignment can only be requested before accepting work" }); return; }
    const existing = await prisma.projectReassignmentRequest.findFirst({ where: { projectId: project.id, status: ReassignmentRequestStatus.PENDING }, select: { id: true } });
    if (existing) { response.status(409).json({ error: "A reassignment request is already awaiting a decision", requestId: existing.id }); return; }
    const result = await prisma.$transaction(async (transaction) => {
      const item = await transaction.projectReassignmentRequest.create({ data: { projectId: project.id, requestedById: request.auth!.userId, reason: parsed.data.reason, note: parsed.data.note, availableFrom: parsed.data.availableFrom ? new Date(parsed.data.availableFrom) : undefined } });
      await transaction.projectAuditEvent.create({ data: { projectId: project.id, action: "REASSIGNMENT_REQUESTED", actorId: request.auth!.userId, metadata: { requestId: item.id, reason: parsed.data.reason } } });
      const heads = await transaction.user.findMany({ where: { agencyId: actorAgency(request), role: UserRole.PROJECT_HEAD, deactivatedAt: null }, select: { id: true } });
      await createNotifications(transaction, heads.map(({ id }) => ({ userId: id, type: "PROJECT_REASSIGNMENT_REQUESTED", payload: { projectId: project.id, requestId: item.id, title: project.title } })));
      return item;
    });
    requestPushDelivery(); response.status(201).json({ request: result });
  }));

  router.get("/project-reassignment-requests", requireRole(UserRole.PROJECT_HEAD), requirePasswordResetComplete, asyncRoute(async (request, response) => {
    const requests = await prisma.projectReassignmentRequest.findMany({ where: { project: { agencyId: actorAgency(request) } }, include: { project: { select: { id: true, referenceNumber: true, title: true, state: true } }, requestedBy: { select: { id: true, email: true } }, newEngineer: { select: { id: true, email: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 });
    response.json({ requests });
  }));

  router.post("/project-reassignment-requests/:requestId/respond", requireRole(UserRole.PROJECT_HEAD), requirePasswordResetComplete, asyncRoute(async (request, response) => {
    const parsed = respondReassignmentSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid reassignment decision", details: parsed.error.flatten() }); return; }
    const result = await prisma.$transaction(async (transaction) => {
      const item = await transaction.projectReassignmentRequest.findFirst({ where: { id: routeParam(request, "requestId"), status: ReassignmentRequestStatus.PENDING, project: { agencyId: actorAgency(request) } }, include: { project: { select: { id: true, engineerId: true, agencyId: true } } } });
      if (!item) return null;
      let engineerId: string | undefined;
      if (parsed.data.decision === "APPROVE") {
        const engineer = await transaction.user.findFirst({ where: { id: parsed.data.engineerId, agencyId: item.project.agencyId, role: UserRole.ENGINEER, deactivatedAt: null }, select: { id: true } });
        if (!engineer) return { kind: "engineer" as const };
        engineerId = engineer.id;
        await transaction.project.update({ where: { id: item.project.id }, data: { engineerId, updatedById: request.auth!.userId } });
      }
      const status = parsed.data.decision === "APPROVE" ? ReassignmentRequestStatus.APPROVED : ReassignmentRequestStatus.DECLINED;
      await transaction.projectReassignmentRequest.update({ where: { id: item.id }, data: { status, decidedById: request.auth!.userId, newEngineerId: engineerId, decisionNote: parsed.data.note, decidedAt: new Date() } });
      await transaction.projectAuditEvent.create({ data: { projectId: item.project.id, action: `REASSIGNMENT_${status}`, actorId: request.auth!.userId, metadata: { requestId: item.id, newEngineerId: engineerId ?? null, note: parsed.data.note } } });
      const recipients = [item.requestedById, ...(engineerId && engineerId !== item.requestedById ? [engineerId] : [])];
      await createNotifications(transaction, recipients.map((userId) => ({ userId, type: `PROJECT_REASSIGNMENT_${status}`, payload: { projectId: item.project.id, requestId: item.id } })));
      return { kind: "decided" as const, status };
    });
    if (!result) response.status(404).json({ error: "Pending reassignment request not found" });
    else if (result.kind === "engineer") response.status(422).json({ error: "Choose an active Engineer from your agency" });
    else { requestPushDelivery(); response.json(result); }
  }));

  router.post("/projects/:id/blockers", requireRole(UserRole.ENGINEER), requirePasswordResetComplete, asyncRoute(async (request, response) => {
    const parsed = reportProjectBlockerSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid blocker", details: parsed.error.flatten() }); return; }
    const project = await prisma.project.findFirst({ where: { id: routeId(request), agencyId: actorAgency(request), engineerId: request.auth!.userId, state: { in: [ProjectState.ACTIVE, ProjectState.MODIFIED] } }, select: { id: true, title: true } });
    if (!project) { response.status(404).json({ error: "Active assigned project not found" }); return; }
    const blocker = await prisma.$transaction(async (transaction) => {
      const item = await transaction.projectBlocker.create({ data: { projectId: project.id, reportedById: request.auth!.userId, ...parsed.data } });
      await transaction.projectAuditEvent.create({ data: { projectId: project.id, action: "BLOCKER_REPORTED", actorId: request.auth!.userId, metadata: { blockerId: item.id, severity: item.severity, title: item.title } } });
      const heads = await transaction.user.findMany({ where: { agencyId: actorAgency(request), role: UserRole.PROJECT_HEAD, deactivatedAt: null }, select: { id: true } });
      await createNotifications(transaction, heads.map(({ id }) => ({ userId: id, type: "PROJECT_BLOCKER_REPORTED", payload: { projectId: project.id, blockerId: item.id, severity: item.severity, title: project.title } })));
      return item;
    });
    requestPushDelivery(); response.status(201).json({ blocker });
  }));

  router.get("/project-blockers", requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER), requirePasswordResetComplete, asyncRoute(async (request, response) => {
    const blockers = await prisma.projectBlocker.findMany({ where: { project: { agencyId: actorAgency(request), ...(request.auth!.role === UserRole.ENGINEER ? { engineerId: request.auth!.userId } : {}) }, ...(request.query.status === "all" ? {} : { status: ProjectBlockerStatus.OPEN }) }, include: { project: { select: { id: true, referenceNumber: true, title: true, state: true } }, reportedBy: { select: { id: true, email: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 });
    response.json({ blockers });
  }));

  router.post("/project-blockers/:blockerId/resolve", requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER), requirePasswordResetComplete, asyncRoute(async (request, response) => {
    const parsed = resolveProjectBlockerSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid blocker resolution", details: parsed.error.flatten() }); return; }
    const blocker = await prisma.projectBlocker.findFirst({ where: { id: routeParam(request, "blockerId"), status: ProjectBlockerStatus.OPEN, project: { agencyId: actorAgency(request), ...(request.auth!.role === UserRole.ENGINEER ? { engineerId: request.auth!.userId } : {}) } }, select: { id: true, projectId: true } });
    if (!blocker) { response.status(404).json({ error: "Open blocker not found" }); return; }
    await prisma.$transaction([prisma.projectBlocker.update({ where: { id: blocker.id }, data: { status: ProjectBlockerStatus.RESOLVED, resolution: parsed.data.resolution, resolvedById: request.auth!.userId, resolvedAt: new Date() } }), prisma.projectAuditEvent.create({ data: { projectId: blocker.projectId, action: "BLOCKER_RESOLVED", actorId: request.auth!.userId, metadata: { blockerId: blocker.id, resolution: parsed.data.resolution } } })]);
    response.json({ status: ProjectBlockerStatus.RESOLVED });
  }));

  return router;
}
