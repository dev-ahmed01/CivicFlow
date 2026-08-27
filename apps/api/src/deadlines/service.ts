import { GrievanceSource, GrievanceStatus, Prisma, UserRole, WorkflowActionType, prisma, type PrismaClient } from "db";
import { createNotifications } from "../notifications/service";

export const DEFAULT_RESPONSE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
export const AUTO_GRIEVANCE_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;
export const ATTENTION_WINDOW_MS = 24 * 60 * 60 * 1000;

type DatabaseClient = Prisma.TransactionClient | PrismaClient;

export type WorkflowActionInput = {
  dedupeKey: string;
  type: WorkflowActionType;
  ticketId: string;
  projectId?: string;
  dependencyId?: string;
  responsibleUserId: string;
  responsibleAgencyId: string;
  explicitDeadline?: Date;
};

export function responseDeadline(createdAt = new Date(), explicitDeadline?: Date): Date {
  return explicitDeadline ?? new Date(createdAt.getTime() + DEFAULT_RESPONSE_WINDOW_MS);
}

export function grievanceDueAt(action: { createdAt: Date; deadline: Date }): Date {
  const fifthDay = new Date(action.createdAt.getTime() + AUTO_GRIEVANCE_WINDOW_MS);
  return action.deadline > fifthDay ? action.deadline : fifthDay;
}

export function deadlineEscalationDecision(action: {
  type: WorkflowActionType;
  createdAt: Date;
  deadline: Date;
  respondedAt: Date | null;
  attentionNotifiedAt: Date | null;
  grievanceExists: boolean;
}, now = new Date()): { createAttention: boolean; createGrievance: boolean } {
  if (action.respondedAt) return { createAttention: false, createGrievance: false };
  return {
    createAttention: !action.attentionNotifiedAt && action.deadline <= new Date(now.getTime() + ATTENTION_WINDOW_MS),
    createGrievance: action.type !== WorkflowActionType.REVIEW_GRIEVANCE && !action.grievanceExists && grievanceDueAt(action) <= now,
  };
}

export function deadlineLabel(deadline: Date | string, now = new Date()): string {
  const difference = new Date(deadline).getTime() - now.getTime();
  const days = Math.max(1, Math.ceil(Math.abs(difference) / (24 * 60 * 60 * 1000)));
  return difference >= 0 ? `${days} ${days === 1 ? "day" : "days"} left` : `Overdue by ${days} ${days === 1 ? "day" : "days"}`;
}

export async function createWorkflowAction(
  client: DatabaseClient,
  input: WorkflowActionInput,
  now = new Date(),
) {
  const existing = await client.workflowAction.findUnique({ where: { dedupeKey: input.dedupeKey } });
  if (existing) return existing;
  return client.workflowAction.create({
    data: {
      dedupeKey: input.dedupeKey,
      type: input.type,
      ticketId: input.ticketId,
      projectId: input.projectId,
      dependencyId: input.dependencyId,
      responsibleUserId: input.responsibleUserId,
      responsibleAgencyId: input.responsibleAgencyId,
      deadline: responseDeadline(now, input.explicitDeadline),
      createdAt: now,
    },
  });
}

export async function completeWorkflowAction(client: DatabaseClient, dedupeKey: string, now = new Date()): Promise<void> {
  await client.workflowAction.updateMany({ where: { dedupeKey, respondedAt: null }, data: { respondedAt: now } });
}

export async function firstResponsibleUser(
  client: DatabaseClient,
  agencyId: string,
  preferredRoles: UserRole[],
): Promise<string | null> {
  const user = await client.user.findFirst({
    where: { agencyId, role: { in: preferredRoles } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function runDeadlineEscalationJob(now = new Date()): Promise<{ attentionCreated: number; grievancesCreated: number }> {
  const attentionThreshold = new Date(now.getTime() + ATTENTION_WINDOW_MS);
  const candidates = await prisma.workflowAction.findMany({
    where: { respondedAt: null, OR: [{ deadline: { lte: attentionThreshold } }, { createdAt: { lte: new Date(now.getTime() - AUTO_GRIEVANCE_WINDOW_MS) } }] },
    orderBy: [{ deadline: "asc" }, { createdAt: "asc" }],
    take: 100,
  });
  let attentionCreated = 0;
  let grievancesCreated = 0;

  for (const candidate of candidates) {
    const result = await prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "WorkflowAction" WHERE "id" = ${candidate.id}::uuid FOR UPDATE
      `;
      if (!locked[0]) return { attention: false, grievance: false };
      const action = await transaction.workflowAction.findUniqueOrThrow({ where: { id: candidate.id } });
      if (action.respondedAt) return { attention: false, grievance: false };
      const existingGrievance = action.type === WorkflowActionType.REVIEW_GRIEVANCE
        ? null
        : await transaction.grievance.findFirst({
          where: {
            source: GrievanceSource.AUTO_NON_RESPONSE,
            status: { in: [GrievanceStatus.OPEN, GrievanceStatus.UNDER_REVIEW, GrievanceStatus.ESCALATED, GrievanceStatus.REOPENED] },
            OR: [{ actionId: action.id }, ...(action.dependencyId ? [{ dependencyId: action.dependencyId }] : [])],
          },
          select: { id: true },
        });
      const decision = deadlineEscalationDecision({ ...action, grievanceExists: Boolean(existingGrievance) }, now);

      let attention = false;
      if (decision.createAttention) {
        const marked = await transaction.workflowAction.updateMany({
          where: { id: action.id, respondedAt: null, attentionNotifiedAt: null },
          data: { attentionNotifiedAt: now },
        });
        if (marked.count > 0) {
          await createNotifications(transaction, [{
            userId: action.responsibleUserId,
            type: "ACTION_ATTENTION",
            payload: { actionId: action.id, actionType: action.type, ticketId: action.ticketId, projectId: action.projectId, dependencyId: action.dependencyId, deadline: action.deadline.toISOString() },
          }]);
          attention = true;
        }
      }

      let grievance = false;
      if (decision.createGrievance) {
        const created = await transaction.grievance.create({
            data: {
              ticketId: action.ticketId,
              projectId: action.projectId,
              dependencyId: action.dependencyId,
              actionId: action.id,
              responsibleUserId: action.responsibleUserId,
              responsibleAgencyId: action.responsibleAgencyId,
              reason: "No response received within 5 days.",
              source: GrievanceSource.AUTO_NON_RESPONSE,
              status: GrievanceStatus.ESCALATED,
              escalatedAt: now,
              createdAt: now,
            },
        });
        const reviewers = await transaction.user.findMany({
            where: { OR: [{ role: UserRole.ADMIN }, { agencyId: action.responsibleAgencyId, role: UserRole.PROJECT_HEAD }, { id: action.responsibleUserId }] },
            select: { id: true },
        });
        await createNotifications(transaction, [...new Set(reviewers.map(({ id }) => id))].map((userId) => ({
          userId,
          type: "GRIEVANCE_ESCALATED",
          payload: { grievanceId: created.id, actionId: action.id, ticketId: action.ticketId, projectId: action.projectId, dependencyId: action.dependencyId },
        })));
        grievance = true;
      }
      return { attention, grievance };
    });
    if (result.attention) attentionCreated += 1;
    if (result.grievance) grievancesCreated += 1;
  }
  return { attentionCreated, grievancesCreated };
}

export function startDeadlineEscalationScheduler(intervalMinutes: number): NodeJS.Timeout {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    void runDeadlineEscalationJob()
      .catch((error: unknown) => console.error("Deadline escalation job failed", error))
      .finally(() => { running = false; });
  };
  run();
  const timer = setInterval(run, intervalMinutes * 60 * 1000);
  timer.unref();
  return timer;
}
