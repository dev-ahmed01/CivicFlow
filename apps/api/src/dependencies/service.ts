import { randomUUID } from "node:crypto";
import { DependencyState, Prisma, UserRole, WorkflowActionType, prisma } from "db";
import type { CreateDependencyRequests, DependencyResponse, UserRole as SharedUserRole } from "@civicos/shared";
import { createNotification, createNotifications } from "../notifications/service";
import { createWorkflowAction, firstResponsibleUser, responseDeadline } from "../deadlines/service";

type DatabaseClient = Prisma.TransactionClient;
type DependencyInput = CreateDependencyRequests["dependencies"][number];

export type DependencyActor = {
  userId: string;
  role: SharedUserRole;
  agencyId: string | null;
};

export class DependencyActionError extends Error {
  constructor(message: string, readonly status: 403 | 404 | 409 | 422) {
    super(message);
    this.name = "DependencyActionError";
  }
}

async function notifyAgency(
  client: DatabaseClient,
  agencyId: string,
  roles: UserRole[],
  type: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  const recipients = await client.user.findMany({
    where: { agencyId, role: { in: roles } },
    select: { id: true },
  });
  if (recipients.length > 0) {
    await createNotifications(client, recipients.map(({ id: userId }) => ({ userId, type, payload })));
  }
}

async function transition(
  client: DatabaseClient,
  dependencyId: string,
  fromState: DependencyState | null,
  toState: DependencyState,
  reason: string,
  actedById?: string,
): Promise<void> {
  await client.dependencyStateTransition.create({
    data: { dependencyId, fromState, toState, reason, actedById },
  });
}

export async function createDependencyRequests(
  client: DatabaseClient,
  projectId: string,
  requestingAgencyId: string,
  inputs: DependencyInput[],
  actedById: string,
  now = new Date(),
  options: { notify?: boolean } = {},
) {
  if (inputs.length === 0) return [];
  const respondingAgencyIds = inputs.map((input) => input.respondingAgencyId);
  if (new Set(respondingAgencyIds).size !== respondingAgencyIds.length) {
    throw new DependencyActionError("Select each dependency agency only once", 422);
  }
  if (respondingAgencyIds.includes(requestingAgencyId)) {
    throw new DependencyActionError("An agency cannot request a dependency from itself", 422);
  }
  const [agencyCount, existingCount] = await Promise.all([
    client.agency.count({ where: { id: { in: respondingAgencyIds } } }),
    client.dependency.count({ where: { projectId, respondingAgencyId: { in: respondingAgencyIds } } }),
  ]);
  if (agencyCount !== respondingAgencyIds.length) {
    throw new DependencyActionError("One or more dependency agencies do not exist", 422);
  }
  if (existingCount > 0) {
    throw new DependencyActionError("This project already has a request for one or more selected agencies", 409);
  }

  const requests = inputs.map((input) => ({ id: randomUUID(), input, deadline: responseDeadline(now, input.deadline ? new Date(input.deadline) : undefined) }));
  await client.dependency.createMany({ data: requests.map(({ id, input, deadline }) => ({
    id, projectId, requestingAgencyId, respondingAgencyId: input.respondingAgencyId,
    requirement: input.requirement, deadline, state: DependencyState.PENDING_RESPONSE,
  })) });
  // Part III §12 — both transitions remain explicit even though the batched
  // writes commit in the same project transaction.
  await client.dependencyStateTransition.createMany({ data: requests.flatMap(({ id }) => [
    { dependencyId: id, fromState: null, toState: DependencyState.REQUESTED, reason: "DEPENDENCY_REQUESTED", actedById },
    { dependencyId: id, fromState: DependencyState.REQUESTED, toState: DependencyState.PENDING_RESPONSE, reason: "SENT_TO_RESPONDING_AGENCY", actedById },
  ]) });
  const recipients = await client.user.findMany({
    where: { agencyId: { in: respondingAgencyIds }, role: { in: [UserRole.PROJECT_HEAD, UserRole.ENGINEER] } },
    select: { id: true, agencyId: true },
  });
  if (options.notify !== false) {
    await createNotifications(client, requests.flatMap(({ id, input, deadline }) => recipients
      .filter((recipient) => recipient.agencyId === input.respondingAgencyId)
      .map(({ id: userId }) => ({ userId, type: "DEPENDENCY_REQUEST", payload: { dependencyId: id, projectId, deadline: deadline.toISOString() } }))));
  }
  const project = await client.project.findUniqueOrThrow({ where: { id: projectId }, select: { ticketId: true } });
  for (const request of requests) {
    const responsibleUserId = await firstResponsibleUser(client, request.input.respondingAgencyId, [UserRole.PROJECT_HEAD, UserRole.ENGINEER]);
    // Standalone coordination projects have no Ticket relation. Their
    // dependency deadline/escalation remains authoritative, while the generic
    // WorkflowAction ledger is created only for ticket-backed work.
    if (responsibleUserId && project.ticketId) await createWorkflowAction(client, {
      dedupeKey: `dependency:${request.id}:respond:${request.deadline.toISOString()}`,
      type: WorkflowActionType.RESPOND_DEPENDENCY,
      ticketId: project.ticketId,
      projectId,
      dependencyId: request.id,
      responsibleUserId,
      responsibleAgencyId: request.input.respondingAgencyId,
      explicitDeadline: request.deadline,
    }, now);
  }
  const created = await client.dependency.findMany({ where: { id: { in: requests.map(({ id }) => id) } } });
  const byId = new Map(created.map((dependency) => [dependency.id, dependency]));
  return requests.map(({ id }) => byId.get(id)).filter((dependency): dependency is NonNullable<typeof dependency> => Boolean(dependency));
}

export async function respondToDependency(
  dependencyId: string,
  actor: DependencyActor,
  input: DependencyResponse,
  now = new Date(),
) {
  return prisma.$transaction(async (transaction) => {
    const locked = await transaction.$queryRaw<Array<{ id: string; state: DependencyState }>>`
      SELECT "id", "state" FROM "Dependency" WHERE "id" = ${dependencyId}::uuid FOR UPDATE
    `;
    if (!locked[0]) throw new DependencyActionError("Dependency not found", 404);
    const dependency = await transaction.dependency.findUniqueOrThrow({ where: { id: dependencyId } });

    if (input.action === "RESEND") {
      if (actor.role !== UserRole.PROJECT_HEAD || actor.agencyId !== dependency.requestingAgencyId) {
        throw new DependencyActionError("Only the requesting agency Project Head can re-send this request", 403);
      }
      if (dependency.state !== DependencyState.DECLINED_UNAVAILABLE) {
        throw new DependencyActionError(`A request cannot be re-sent from ${dependency.state}`, 409);
      }
      const deadline = responseDeadline(now);
      await transition(transaction, dependency.id, dependency.state, DependencyState.REQUESTED, "REQUEST_RE_SENT", actor.userId);
      await transition(transaction, dependency.id, DependencyState.REQUESTED, DependencyState.PENDING_RESPONSE, "RE_SENT_TO_RESPONDING_AGENCY", actor.userId);
      const updated = await transaction.dependency.update({
        where: { id: dependency.id },
        data: { state: DependencyState.PENDING_RESPONSE, deadline, respondedAt: null, escalatedAt: null, deadlineReminderSentAt: null, assignedEngineerId: null },
      });
      await notifyAgency(transaction, dependency.respondingAgencyId, [UserRole.PROJECT_HEAD, UserRole.ENGINEER], "DEPENDENCY_REQUEST_RE_SENT", { dependencyId, projectId: dependency.projectId, deadline: deadline.toISOString() });
      const responsibleUserId = await firstResponsibleUser(transaction, dependency.respondingAgencyId, [UserRole.PROJECT_HEAD, UserRole.ENGINEER]);
      const project = await transaction.project.findUniqueOrThrow({ where: { id: dependency.projectId }, select: { ticketId: true } });
      if (responsibleUserId && project.ticketId) await createWorkflowAction(transaction, {
        dedupeKey: `dependency:${dependency.id}:respond:${deadline.toISOString()}`, type: WorkflowActionType.RESPOND_DEPENDENCY,
        ticketId: project.ticketId, projectId: dependency.projectId, dependencyId: dependency.id,
        responsibleUserId, responsibleAgencyId: dependency.respondingAgencyId, explicitDeadline: deadline,
      }, now);
      return updated;
    }

    if (input.action === "MARK_ASSIGNED_OUT_OF_BAND") {
      if (actor.role !== UserRole.PROJECT_HEAD || actor.agencyId !== dependency.requestingAgencyId) {
        throw new DependencyActionError("Only the requesting agency Project Head can record an out-of-band assignment", 403);
      }
      if (dependency.state !== DependencyState.ESCALATED) {
        throw new DependencyActionError(`An out-of-band assignment cannot be recorded from ${dependency.state}`, 409);
      }
      const updated = await transaction.dependency.update({ where: { id: dependency.id }, data: { state: DependencyState.ASSIGNED, respondedAt: now } });
      await transition(transaction, dependency.id, dependency.state, DependencyState.ASSIGNED, "OUT_OF_BAND_ASSIGNMENT_RECORDED", actor.userId);
      return updated;
    }

    if (input.action === "FULFILL") {
      if (actor.role !== UserRole.ENGINEER || dependency.assignedEngineerId !== actor.userId) {
        throw new DependencyActionError("Only the assigned Engineer can fulfill this dependency", 403);
      }
      if (dependency.state !== DependencyState.ASSIGNED) {
        throw new DependencyActionError(`A dependency cannot be fulfilled from ${dependency.state}`, 409);
      }
      const updated = await transaction.dependency.update({ where: { id: dependency.id }, data: { state: DependencyState.FULFILLED, respondedAt: now } });
      await transaction.workflowAction.updateMany({ where: { dependencyId: dependency.id, type: WorkflowActionType.FULFILL_DEPENDENCY, respondedAt: null }, data: { respondedAt: now } });
      await transition(transaction, dependency.id, dependency.state, DependencyState.FULFILLED, "ASSIGNED_WORK_FULFILLED", actor.userId);
      await notifyAgency(transaction, dependency.requestingAgencyId, [UserRole.PROJECT_HEAD], "DEPENDENCY_FULFILLED", { dependencyId, projectId: dependency.projectId });
      return updated;
    }

    if (!actor.agencyId || actor.agencyId !== dependency.respondingAgencyId || (actor.role !== UserRole.PROJECT_HEAD && actor.role !== UserRole.ENGINEER)) {
      throw new DependencyActionError("Only the responding agency can answer this request", 403);
    }
    if (dependency.state !== DependencyState.PENDING_RESPONSE) {
      throw new DependencyActionError(`A dependency cannot be answered from ${dependency.state}`, 409);
    }

    let toState: DependencyState;
    let assignedEngineerId: string | null = null;
    let reason: string;
    if (input.action === "ASSIGN_ENGINEER") {
      assignedEngineerId = actor.role === UserRole.ENGINEER ? actor.userId : input.engineerId ?? null;
      if (!assignedEngineerId) throw new DependencyActionError("Choose an Engineer to assign", 422);
      const engineer = await transaction.user.findFirst({
        where: { id: assignedEngineerId, role: UserRole.ENGINEER, agencyId: dependency.respondingAgencyId },
        select: { id: true },
      });
      if (!engineer) throw new DependencyActionError("Choose an Engineer from the responding agency", 422);
      toState = DependencyState.ASSIGNED;
      reason = "RESPONDING_AGENCY_ASSIGNED_ENGINEER";
    } else if (input.action === "DECLINE_UNAVAILABLE") {
      toState = DependencyState.DECLINED_UNAVAILABLE;
      reason = "RESPONDING_AGENCY_UNAVAILABLE";
    } else {
      toState = DependencyState.DECLINED_NOT_CONCERNED;
      reason = "RESPONDING_AGENCY_NOT_CONCERNED";
    }
    const updated = await transaction.dependency.update({
      where: { id: dependency.id },
      data: { state: toState, assignedEngineerId, respondedAt: now },
    });
    await transition(transaction, dependency.id, dependency.state, toState, reason, actor.userId);
    await transaction.workflowAction.updateMany({ where: { dependencyId: dependency.id, type: WorkflowActionType.RESPOND_DEPENDENCY, respondedAt: null }, data: { respondedAt: now } });
    await notifyAgency(transaction, dependency.requestingAgencyId, [UserRole.PROJECT_HEAD], "DEPENDENCY_RESPONSE", { dependencyId, projectId: dependency.projectId, state: toState });
    if (assignedEngineerId) {
      await createNotification(transaction, { userId: assignedEngineerId, type: "DEPENDENCY_ASSIGNMENT", payload: { dependencyId, projectId: dependency.projectId } });
      const project = await transaction.project.findUniqueOrThrow({ where: { id: dependency.projectId }, select: { ticketId: true } });
      if (project.ticketId) await createWorkflowAction(transaction, {
        dedupeKey: `dependency:${dependency.id}:fulfill`, type: WorkflowActionType.FULFILL_DEPENDENCY,
        ticketId: project.ticketId, projectId: dependency.projectId, dependencyId: dependency.id,
        responsibleUserId: assignedEngineerId, responsibleAgencyId: dependency.respondingAgencyId,
      }, now);
    }
    return updated;
  });
}

export async function runDependencyEscalationJob(now = new Date()): Promise<{ escalated: number; reminders: number }> {
  const reminderThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const approaching = await prisma.dependency.findMany({
    where: { state: DependencyState.PENDING_RESPONSE, deadlineReminderSentAt: null, deadline: { gt: now, lte: reminderThreshold } },
    orderBy: { deadline: "asc" },
    select: { id: true },
    take: 50,
  });
  let reminders = 0;
  for (const item of approaching) {
    const sent = await prisma.$transaction(async (transaction) => {
      const dependency = await transaction.dependency.findUnique({ where: { id: item.id } });
      if (!dependency || dependency.state !== DependencyState.PENDING_RESPONSE || dependency.deadlineReminderSentAt || dependency.deadline <= now || dependency.deadline > reminderThreshold) return false;
      const marked = await transaction.dependency.updateMany({ where: { id: dependency.id, deadlineReminderSentAt: null }, data: { deadlineReminderSentAt: now } });
      if (marked.count === 0) return false;
      await notifyAgency(transaction, dependency.respondingAgencyId, [UserRole.PROJECT_HEAD], "DEPENDENCY_DEADLINE_APPROACHING", { dependencyId: dependency.id, projectId: dependency.projectId, deadline: dependency.deadline.toISOString() });
      return true;
    });
    if (sent) reminders += 1;
  }
  const due = await prisma.dependency.findMany({
    where: { state: DependencyState.PENDING_RESPONSE, deadline: { lte: now } },
    orderBy: { deadline: "asc" },
    select: { id: true },
    take: 50,
  });
  let escalated = 0;
  for (const item of due) {
    const changed = await prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ state: DependencyState; deadline: Date }>>`
        SELECT "state", "deadline" FROM "Dependency" WHERE "id" = ${item.id}::uuid FOR UPDATE
      `;
      if (locked[0]?.state !== DependencyState.PENDING_RESPONSE || locked[0].deadline > now) return false;
      const dependency = await transaction.dependency.update({
        where: { id: item.id },
        data: { state: DependencyState.ESCALATED, escalatedAt: now },
      });
      await transition(transaction, dependency.id, DependencyState.PENDING_RESPONSE, DependencyState.ESCALATED, "NO_RESPONSE_BY_DEADLINE");
      await notifyAgency(transaction, dependency.requestingAgencyId, [UserRole.PROJECT_HEAD], "DEPENDENCY_ESCALATED", { dependencyId: dependency.id, projectId: dependency.projectId, deadline: dependency.deadline.toISOString() });
      return true;
    });
    if (changed) escalated += 1;
  }
  return { escalated, reminders };
}

export function startDependencyEscalationScheduler(intervalMinutes: number): NodeJS.Timeout {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    void runDependencyEscalationJob()
      .catch((error: unknown) => console.error("Dependency escalation job failed", error))
      .finally(() => { running = false; });
  };
  run();
  const timer = setInterval(run, intervalMinutes * 60 * 1000);
  timer.unref();
  return timer;
}
