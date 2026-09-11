import { type Prisma } from "db";
import { createWorkflowAction } from "../deadlines/service";

// Part III completion verification: shared legal transition, always invoked by a human decision.
export async function applyCompletionTransition(tx: Prisma.TransactionClient, input: {
  projectId: string; ticketId: string; evidenceId: string; engineerId: string | null; agencyId: string;
  actorId: string; target: "ACTIVE" | "CLOSED"; reason: string;
}) {
  const project = await tx.project.findUniqueOrThrow({ where: { id: input.projectId }, select: { state: true } });
  if (project.state !== "AWAITING_VERIFICATION") throw new Error("Completion is no longer awaiting verification");
  const ticketState = input.target === "CLOSED" ? "CLOSED" : "WORK_IN_PROGRESS";
  await tx.project.update({ where: { id: input.projectId }, data: { state: input.target, ...(input.target === "ACTIVE" ? { actualCompletion: null } : {}) } });
  await tx.completionVerificationRequest.updateMany({ where: { completionEvidenceId: input.evidenceId, respondedAt: null }, data: { respondedAt: new Date() } });
  if (input.target === "ACTIVE" && input.engineerId) await createWorkflowAction(tx, { dedupeKey: `project:${input.projectId}:rework:${input.evidenceId}`, type: "COMPLETE_WORK", ticketId: input.ticketId, projectId: input.projectId, responsibleUserId: input.engineerId, responsibleAgencyId: input.agencyId });
  await tx.projectStateTransition.create({ data: { projectId: input.projectId, fromState: "AWAITING_VERIFICATION", toState: input.target, reason: input.reason, actedById: input.actorId } });
  await tx.ticket.update({ where: { id: input.ticketId }, data: { state: ticketState } });
  await tx.ticketStateTransition.create({ data: { ticketId: input.ticketId, fromState: "AWAITING_CITIZEN_VERIFICATION", toState: ticketState, reason: input.reason, actedById: input.actorId } });
}
