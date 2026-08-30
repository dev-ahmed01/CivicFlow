import { CoordinationStatus, DependencyState, Prisma, UserRole, WorkflowActionType, prisma } from "db";
import type { CoordinationAction, CreateCoordinationDraft, UserRole as SharedUserRole } from "@civicos/shared";
import { createWorkflowAction, firstResponsibleUser } from "../deadlines/service";
import { createDependencyRequests } from "../dependencies/service";
import { createNotifications } from "../notifications/service";

type DatabaseClient = Prisma.TransactionClient;

export type CoordinationActor = {
  userId: string;
  role: SharedUserRole;
  agencyId: string | null;
};

export class CoordinationActionError extends Error {
  constructor(message: string, readonly status: 403 | 404 | 409 | 422) {
    super(message);
    this.name = "CoordinationActionError";
  }
}

export async function coordinationRequestTypes(client: Pick<DatabaseClient, "adminConfig"> | typeof prisma = prisma): Promise<string[]> {
  const config = await client.adminConfig.findUnique({ where: { key: "coordination.request_types" }, select: { value: true } });
  if (!Array.isArray(config?.value)) throw new CoordinationActionError("Coordination request types are not configured", 422);
  return config.value.filter((item): item is string => typeof item === "string" && /^[a-z0-9-]{2,80}$/.test(item));
}

function assertProjectHead(actor: CoordinationActor): asserts actor is CoordinationActor & { agencyId: string } {
  if (actor.role !== UserRole.PROJECT_HEAD || !actor.agencyId) {
    throw new CoordinationActionError("Only an agency Project Head can perform this action", 403);
  }
}

async function audit(
  client: DatabaseClient,
  projectId: string,
  action: string,
  actorId: string,
  requestId: string,
  metadata: Record<string, string | boolean | null> = {},
): Promise<void> {
  await client.projectAuditEvent.create({
    data: { projectId, action, actorId, metadata: { coordinationRequestId: requestId, ...metadata } },
  });
}

async function notifyAgency(
  client: DatabaseClient,
  agencyId: string,
  type: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  const recipients = await client.user.findMany({
    where: { agencyId, role: { in: [UserRole.PROJECT_HEAD, UserRole.ENGINEER] } },
    select: { id: true },
  });
  await createNotifications(client, recipients.map(({ id: userId }) => ({ userId, type, payload })));
}

export async function createCoordinationDraft(
  projectId: string,
  actor: CoordinationActor,
  input: CreateCoordinationDraft,
) {
  assertProjectHead(actor);
  if (actor.agencyId === input.respondingAgencyId) {
    throw new CoordinationActionError("Choose another agency for coordination", 422);
  }
  const [project, agency, requestTypes] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, agencyId: actor.agencyId }, select: { id: true } }),
    prisma.agency.findUnique({ where: { id: input.respondingAgencyId }, select: { id: true } }),
    coordinationRequestTypes(),
  ]);
  if (!project) throw new CoordinationActionError("Civic work not found", 404);
  if (!agency) throw new CoordinationActionError("Receiving agency not found", 404);
  if (!requestTypes.includes(input.requestTypeKey)) {
    throw new CoordinationActionError("Choose a configured coordination request type", 422);
  }
  const deadline = new Date(input.responseDeadline);
  if (deadline <= new Date()) throw new CoordinationActionError("Response deadline must be in the future", 422);

  return prisma.$transaction(async (transaction) => {
    const request = await transaction.coordinationRequest.create({
      data: {
        projectId,
        requestingAgencyId: actor.agencyId,
        respondingAgencyId: input.respondingAgencyId,
        createdById: actor.userId,
        requestTypeKey: input.requestTypeKey,
        subject: input.subject,
        details: input.details,
        responseDeadline: deadline,
        inspectionNeeded: input.inspectionNeeded,
        engineerRequired: input.engineerRequired,
      },
    });
    const entry = await transaction.coordinationEntry.create({
      data: {
        requestId: request.id,
        senderId: actor.userId,
        senderAgencyId: actor.agencyId,
        action: "DRAFT_CREATED",
        message: input.initialMessage,
        toStatus: CoordinationStatus.DRAFT,
      },
    });
    await audit(transaction, projectId, "COORDINATION_DRAFT_CREATED", actor.userId, request.id, { requestTypeKey: input.requestTypeKey });
    return { request, initialEntryId: entry.id };
  });
}

async function sendDraft(client: DatabaseClient, request: Awaited<ReturnType<typeof client.coordinationRequest.findUniqueOrThrow>>, actor: CoordinationActor, now: Date) {
  assertProjectHead(actor);
  if (actor.agencyId !== request.requestingAgencyId || request.status !== CoordinationStatus.DRAFT) {
    throw new CoordinationActionError("Only the requesting agency can send this draft", request.status === CoordinationStatus.DRAFT ? 403 : 409);
  }
  let dependency = await client.dependency.findUnique({
    where: { projectId_respondingAgencyId: { projectId: request.projectId, respondingAgencyId: request.respondingAgencyId } },
  });
  if (!dependency) {
    const created = await createDependencyRequests(client, request.projectId, request.requestingAgencyId, [{
      respondingAgencyId: request.respondingAgencyId,
      requirement: `${request.subject}\n\n${request.details}`,
      deadline: request.responseDeadline.toISOString(),
    }], actor.userId, now);
    dependency = created[0] ?? null;
    if (!dependency) throw new CoordinationActionError("Could not create the linked dependency", 422);
  } else {
    const previous = dependency.state;
    dependency = await client.dependency.update({
      where: { id: dependency.id },
      data: {
        requirement: `${request.subject}\n\n${request.details}`,
        deadline: request.responseDeadline,
        state: DependencyState.PENDING_RESPONSE,
        respondedAt: null,
        escalatedAt: null,
        assignedEngineerId: null,
      },
    });
    if (previous !== DependencyState.PENDING_RESPONSE) {
      await client.dependencyStateTransition.create({
        data: { dependencyId: dependency.id, fromState: previous, toState: DependencyState.PENDING_RESPONSE, reason: "STRUCTURED_COORDINATION_SENT", actedById: actor.userId },
      });
    }
    const project = await client.project.findUniqueOrThrow({ where: { id: request.projectId }, select: { ticketId: true } });
    const responsibleUserId = await firstResponsibleUser(client, request.respondingAgencyId, [UserRole.PROJECT_HEAD, UserRole.ENGINEER]);
    if (project.ticketId && responsibleUserId) await createWorkflowAction(client, {
      dedupeKey: `coordination:${request.id}:respond`,
      type: WorkflowActionType.RESPOND_DEPENDENCY,
      ticketId: project.ticketId,
      projectId: request.projectId,
      dependencyId: dependency.id,
      responsibleUserId,
      responsibleAgencyId: request.respondingAgencyId,
      explicitDeadline: request.responseDeadline,
    }, now);
    await notifyAgency(client, request.respondingAgencyId, "COORDINATION_REQUEST", { coordinationRequestId: request.id, dependencyId: dependency.id, projectId: request.projectId });
  }
  const updated = await client.coordinationRequest.update({
    where: { id: request.id },
    data: { dependencyId: dependency!.id, status: CoordinationStatus.SENT, sentAt: now },
  });
  const entry = await client.coordinationEntry.create({
    data: { requestId: request.id, senderId: actor.userId, senderAgencyId: actor.agencyId, action: "SENT", fromStatus: CoordinationStatus.DRAFT, toStatus: CoordinationStatus.SENT },
  });
  await audit(client, request.projectId, "COORDINATION_SENT", actor.userId, request.id, { dependencyId: dependency!.id });
  return { request: updated, entry };
}

const terminalStatuses = new Set<CoordinationStatus>([CoordinationStatus.CLOSED, CoordinationStatus.REJECTED]);
const allowedActionStatuses: Partial<Record<CoordinationAction["action"], ReadonlySet<CoordinationStatus>>> = {
  ACKNOWLEDGE: new Set([CoordinationStatus.SENT, CoordinationStatus.CLARIFICATION_REQUESTED]),
  REQUEST_CLARIFICATION: new Set([CoordinationStatus.SENT, CoordinationStatus.ACKNOWLEDGED]),
  REQUEST_INSPECTION: new Set([CoordinationStatus.SENT, CoordinationStatus.ACKNOWLEDGED, CoordinationStatus.CLARIFICATION_REQUESTED, CoordinationStatus.ACCEPTED]),
  ASSIGN_ENGINEER: new Set([CoordinationStatus.SENT, CoordinationStatus.ACKNOWLEDGED, CoordinationStatus.CLARIFICATION_REQUESTED, CoordinationStatus.INSPECTION_REQUIRED, CoordinationStatus.ACCEPTED]),
  ACCEPT: new Set([CoordinationStatus.SENT, CoordinationStatus.ACKNOWLEDGED, CoordinationStatus.CLARIFICATION_REQUESTED, CoordinationStatus.INSPECTION_REQUIRED, CoordinationStatus.ENGINEER_ASSIGNED]),
  REJECT: new Set([CoordinationStatus.SENT, CoordinationStatus.ACKNOWLEDGED, CoordinationStatus.CLARIFICATION_REQUESTED, CoordinationStatus.INSPECTION_REQUIRED, CoordinationStatus.ENGINEER_ASSIGNED]),
  START_PROGRESS: new Set([CoordinationStatus.ACKNOWLEDGED, CoordinationStatus.INSPECTION_REQUIRED, CoordinationStatus.ENGINEER_ASSIGNED, CoordinationStatus.ACCEPTED]),
  INSPECTION_COMPLETE: new Set([CoordinationStatus.INSPECTION_REQUIRED, CoordinationStatus.ENGINEER_ASSIGNED, CoordinationStatus.IN_PROGRESS]),
  COMPLETE: new Set([CoordinationStatus.ENGINEER_ASSIGNED, CoordinationStatus.ACCEPTED, CoordinationStatus.IN_PROGRESS]),
};

export async function actOnCoordinationRequest(
  requestId: string,
  actor: CoordinationActor,
  input: CoordinationAction,
  now = new Date(),
) {
  if (!actor.agencyId) throw new CoordinationActionError("This account is missing an agency assignment", 403);
  const actorAgencyId = actor.agencyId;
  return prisma.$transaction(async (transaction) => {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CoordinationRequest" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
    if (!locked[0]) throw new CoordinationActionError("Coordination request not found", 404);
    const request = await transaction.coordinationRequest.findUniqueOrThrow({ where: { id: requestId }, include: { project: { select: { ticketId: true } }, dependency: true } });
    const isRequester = actorAgencyId === request.requestingAgencyId;
    const isResponder = actorAgencyId === request.respondingAgencyId;
    if (!isRequester && !isResponder) throw new CoordinationActionError("This coordination request belongs to other agencies", 403);
    if (actor.role === UserRole.ENGINEER && request.assignedEngineerId !== actor.userId) throw new CoordinationActionError("Only the assigned Engineer can act on this request", 403);
    if (input.action === "SEND") return sendDraft(transaction, request, actor, now);
    if (request.status === CoordinationStatus.DRAFT || request.status === CoordinationStatus.CLOSED) {
      throw new CoordinationActionError(`This action is unavailable while the request is ${request.status.toLowerCase()}`, 409);
    }
    if (request.status === CoordinationStatus.COMPLETED && input.action !== "REPLY" && input.action !== "CLOSE") {
      throw new CoordinationActionError("The completed request can only receive a final reply or be closed", 409);
    }
    const allowedStatuses = allowedActionStatuses[input.action];
    if (allowedStatuses && !allowedStatuses.has(request.status)) {
      throw new CoordinationActionError(`${input.action.toLowerCase().replaceAll("_", " ")} is unavailable while the request is ${request.status.toLowerCase().replaceAll("_", " ")}`, 409);
    }

    let nextStatus: CoordinationStatus = request.status;
    let message: string | undefined;
    let proposedAt: Date | undefined;
    let assignedEngineerId: string | undefined;
    let inspectionCompletedAt: Date | undefined;
    let closedAt: Date | undefined;

    if (input.action === "REPLY") {
      message = input.message;
    } else if (input.action === "ACKNOWLEDGE") {
      if (!isResponder) throw new CoordinationActionError("Only the receiving agency can acknowledge this request", 403);
      nextStatus = CoordinationStatus.ACKNOWLEDGED;
      message = input.message;
    } else if (input.action === "REQUEST_CLARIFICATION") {
      if (!isResponder) throw new CoordinationActionError("Only the receiving agency can request clarification", 403);
      nextStatus = CoordinationStatus.CLARIFICATION_REQUESTED;
      message = input.message;
    } else if (input.action === "REQUEST_INSPECTION") {
      if (!isResponder) throw new CoordinationActionError("Only the receiving agency can request an inspection", 403);
      nextStatus = CoordinationStatus.INSPECTION_REQUIRED;
      message = input.message;
    } else if (input.action === "PROPOSE_DATETIME") {
      if (!isResponder) throw new CoordinationActionError("Only the receiving agency can propose an inspection date", 403);
      proposedAt = new Date(input.proposedAt);
      message = input.message;
    } else if (input.action === "ASSIGN_ENGINEER") {
      if (!isResponder || actor.role !== UserRole.PROJECT_HEAD) throw new CoordinationActionError("Only the receiving agency Project Head can assign an Engineer", 403);
      const engineer = await transaction.user.findFirst({ where: { id: input.engineerId, agencyId: request.respondingAgencyId, role: UserRole.ENGINEER }, select: { id: true } });
      if (!engineer) throw new CoordinationActionError("Choose an Engineer from the receiving agency", 422);
      assignedEngineerId = engineer.id;
      nextStatus = CoordinationStatus.ENGINEER_ASSIGNED;
      message = input.message;
      if (request.dependency) {
        const previous = request.dependency.state;
        await transaction.dependency.update({ where: { id: request.dependency.id }, data: { assignedEngineerId: engineer.id, state: DependencyState.ASSIGNED, respondedAt: now } });
        if (previous !== DependencyState.ASSIGNED) await transaction.dependencyStateTransition.create({ data: { dependencyId: request.dependency.id, fromState: previous, toState: DependencyState.ASSIGNED, reason: "COORDINATION_ENGINEER_ASSIGNED", actedById: actor.userId } });
        await transaction.workflowAction.updateMany({ where: { dependencyId: request.dependency.id, type: WorkflowActionType.RESPOND_DEPENDENCY, respondedAt: null }, data: { respondedAt: now } });
        if (request.project.ticketId) await createWorkflowAction(transaction, {
          dedupeKey: `coordination:${request.id}:inspection`, type: WorkflowActionType.FULFILL_DEPENDENCY,
          ticketId: request.project.ticketId, projectId: request.projectId, dependencyId: request.dependency.id,
          responsibleUserId: engineer.id, responsibleAgencyId: request.respondingAgencyId,
        }, now);
      }
      await createNotifications(transaction, [{ userId: engineer.id, type: "COORDINATION_ENGINEER_ASSIGNED", payload: { coordinationRequestId: request.id, projectId: request.projectId, dependencyId: request.dependencyId } }]);
    } else if (input.action === "ACCEPT") {
      if (!isResponder || actor.role !== UserRole.PROJECT_HEAD) throw new CoordinationActionError("Only the receiving agency Project Head can accept this dependency", 403);
      nextStatus = CoordinationStatus.ACCEPTED;
      message = input.message;
      if (request.dependency && request.dependency.state === DependencyState.PENDING_RESPONSE) {
        await transaction.dependency.update({ where: { id: request.dependency.id }, data: { state: DependencyState.ASSIGNED, respondedAt: now } });
        await transaction.dependencyStateTransition.create({ data: { dependencyId: request.dependency.id, fromState: DependencyState.PENDING_RESPONSE, toState: DependencyState.ASSIGNED, reason: "COORDINATION_ACCEPTED", actedById: actor.userId } });
        await transaction.workflowAction.updateMany({ where: { dependencyId: request.dependency.id, type: WorkflowActionType.RESPOND_DEPENDENCY, respondedAt: null }, data: { respondedAt: now } });
      }
    } else if (input.action === "REJECT") {
      if (!isResponder || actor.role !== UserRole.PROJECT_HEAD) throw new CoordinationActionError("Only the receiving agency Project Head can reject this dependency", 403);
      nextStatus = CoordinationStatus.REJECTED;
      message = input.reason;
      if (request.dependency && !(new Set<DependencyState>([DependencyState.FULFILLED, DependencyState.DECLINED_UNAVAILABLE, DependencyState.DECLINED_NOT_CONCERNED])).has(request.dependency.state)) {
        await transaction.dependency.update({ where: { id: request.dependency.id }, data: { state: DependencyState.DECLINED_UNAVAILABLE, respondedAt: now } });
        await transaction.dependencyStateTransition.create({ data: { dependencyId: request.dependency.id, fromState: request.dependency.state, toState: DependencyState.DECLINED_UNAVAILABLE, reason: input.reason, actedById: actor.userId } });
        await transaction.workflowAction.updateMany({ where: { dependencyId: request.dependency.id, type: WorkflowActionType.RESPOND_DEPENDENCY, respondedAt: null }, data: { respondedAt: now } });
      }
    } else if (input.action === "START_PROGRESS") {
      if (!isResponder) throw new CoordinationActionError("Only the receiving agency can start this work", 403);
      nextStatus = CoordinationStatus.IN_PROGRESS;
      message = input.message;
    } else if (input.action === "INSPECTION_COMPLETE") {
      if (!isResponder || actor.role !== UserRole.ENGINEER || request.assignedEngineerId !== actor.userId) throw new CoordinationActionError("Only the assigned Engineer can complete this inspection", 403);
      nextStatus = CoordinationStatus.IN_PROGRESS;
      inspectionCompletedAt = now;
      message = input.notes;
    } else if (input.action === "COMPLETE") {
      const assignedEngineer = actor.role === UserRole.ENGINEER && request.assignedEngineerId === actor.userId;
      if (!isResponder || actor.role !== UserRole.PROJECT_HEAD && !assignedEngineer) throw new CoordinationActionError("Only the receiving Project Head or assigned Engineer can complete this action", 403);
      nextStatus = CoordinationStatus.COMPLETED;
      message = input.notes;
      if (request.dependency && request.dependency.state !== DependencyState.FULFILLED) {
        await transaction.dependency.update({ where: { id: request.dependency.id }, data: { state: DependencyState.FULFILLED, respondedAt: now } });
        await transaction.dependencyStateTransition.create({ data: { dependencyId: request.dependency.id, fromState: request.dependency.state, toState: DependencyState.FULFILLED, reason: "COORDINATION_ACTION_COMPLETED", actedById: actor.userId } });
        await transaction.workflowAction.updateMany({ where: { dependencyId: request.dependency.id, type: WorkflowActionType.FULFILL_DEPENDENCY, respondedAt: null }, data: { respondedAt: now } });
      }
    } else if (input.action === "CLOSE") {
      if (!isRequester || actor.role !== UserRole.PROJECT_HEAD) throw new CoordinationActionError("Only the requesting agency Project Head can close this request", 403);
      if (!(new Set<CoordinationStatus>([CoordinationStatus.COMPLETED, CoordinationStatus.REJECTED])).has(request.status)) throw new CoordinationActionError("Complete or reject the request before closing it", 409);
      nextStatus = CoordinationStatus.CLOSED;
      closedAt = now;
      message = input.message;
    }

    if (terminalStatuses.has(request.status) && input.action !== "REPLY" && input.action !== "CLOSE") {
      throw new CoordinationActionError("This coordination request has reached a terminal state", 409);
    }
    const updated = await transaction.coordinationRequest.update({
      where: { id: request.id },
      data: {
        status: nextStatus,
        ...(proposedAt ? { proposedAt } : {}),
        ...(assignedEngineerId ? { assignedEngineerId } : {}),
        ...(inspectionCompletedAt ? { inspectionCompletedAt } : {}),
        ...(closedAt ? { closedAt } : {}),
        ...(input.action === "REQUEST_INSPECTION" ? { inspectionNeeded: true } : {}),
      },
    });
    const entry = await transaction.coordinationEntry.create({
      data: {
        requestId: request.id,
        senderId: actor.userId,
        senderAgencyId: actorAgencyId,
        action: input.action,
        message,
        fromStatus: nextStatus === request.status ? null : request.status,
        toStatus: nextStatus === request.status ? null : nextStatus,
      },
    });
    await audit(transaction, request.projectId, `COORDINATION_${input.action}`, actor.userId, request.id, { fromStatus: request.status, toStatus: nextStatus });
    await notifyAgency(transaction, isRequester ? request.respondingAgencyId : request.requestingAgencyId, `COORDINATION_${input.action}`, { coordinationRequestId: request.id, projectId: request.projectId, status: nextStatus });
    return { request: updated, entry };
  });
}
