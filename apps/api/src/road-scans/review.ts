import { prisma } from "db";
import { ScanError } from "./ai-client";
import { scanScope, type ScanActor } from "./service";
import { applyCompletionTransition } from "../validations/completion-transition";
import { createNotifications, requestPushDelivery } from "../notifications/service";

export async function reviewScanCompletion(actor: ScanActor, projectId: string, input: { decision: "CONTINUE_CLOSURE" | "REQUEST_REWORK"; note: string }) {
  scanScope(actor);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId}::uuid FOR UPDATE`;
    const project = await tx.project.findFirst({ where: { id: projectId, agencyId: actor.agencyId!, ...(actor.wardId ? { wardId: actor.wardId } : {}) }, include: { completionEvidence: { where: { uploadedAt: { not: null } }, orderBy: { createdAt: "desc" }, take: 1 } } });
    if (!project) throw new ScanError(404, "Work not found.");
    const evidence = project.completionEvidence[0];
    if (project.state !== "AWAITING_VERIFICATION" || !evidence || !project.ticketId) throw new ScanError(409, "Work is no longer awaiting completion review.");
    const candidate = await tx.potholeCandidate.findFirst({ where: { OR: [{ projectId }, { ticketId: project.ticketId }] } });
    if (!candidate) throw new ScanError(404, "This work is not linked to an Area Scan candidate.");
    const scan = await tx.potholeVerificationScan.findFirst({ where: { projectId, completionEvidenceId: evidence.id }, orderBy: { scan: { createdAt: "desc" } } });
    await tx.projectAuditEvent.create({ data: { projectId, actorId: actor.userId, action: "SCAN_COMPLETION_REVIEW", metadata: { ...input, verificationScanId: scan?.scanId ?? null, completionEvidenceId: evidence.id } } });
    if (input.decision === "REQUEST_REWORK") {
      await applyCompletionTransition(tx, { projectId, ticketId: project.ticketId, evidenceId: evidence.id, engineerId: project.engineerId, agencyId: project.agencyId, actorId: actor.userId, target: "ACTIVE", reason: "PROJECT_HEAD_REWORK_REQUESTED" });
      if (project.engineerId) await createNotifications(tx, [{ userId: project.engineerId, type: "PROJECT_REWORK_REQUESTED", payload: { projectId, ticketId: project.ticketId, evidenceId: evidence.id } }]);
    }
    // Continue closure is an approval record. Existing citizen quorum remains authoritative.
  });
  requestPushDelivery();
}
