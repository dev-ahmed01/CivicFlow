import { randomUUID } from "node:crypto";
import { prisma, Prisma, type RoadScan as ScanRecord } from "db";
import { roadScanSchema, roadScanSummarySchema, potholeCandidateSchema, scanEvidenceSchema, potholeDetectionSchema, type ScanEvidence } from "@civicos/shared";
import { getEnv } from "../config/env";
import { createAssignment } from "../inspections/router";
import { createNotifications, requestPushDelivery } from "../notifications/service";
import { PotholeAiClient, ScanError } from "./ai-client";
import { assetDirectory, bboxIou, clusterFrames, DemoCameraScanProvider, demoVerification, toFrames } from "./provider";

export type ScanActor = { userId: string; agencyId: string | null; wardId: string | null };
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
export function scanScope(actor: ScanActor): Prisma.RoadScanWhereInput {
  if (!actor.agencyId) throw new ScanError(403, "An agency assignment is required.");
  return { agencyId: actor.agencyId, ...(actor.wardId ? { wardId: actor.wardId } : {}) };
}
export function cameraScope(actor: ScanActor): Prisma.RoadCameraWhereInput {
  scanScope(actor);
  return { agencyId: actor.agencyId!, ...(actor.wardId ? { wardId: actor.wardId } : {}) };
}
const candidateInclude = { camera: true, ticket: { select: { project: { select: { id: true } } } } } satisfies Prisma.PotholeCandidateInclude;
type CandidateRecord = Prisma.PotholeCandidateGetPayload<{ include: typeof candidateInclude }>;
function candidateResponse(candidate: CandidateRecord) {
  return potholeCandidateSchema.parse(wire({ ...candidate, projectId: candidate.projectId ?? candidate.ticket?.project?.id ?? null }));
}
export async function getCandidate(actor: ScanActor, id: string, tx: Prisma.TransactionClient = prisma) {
  const candidate = await tx.potholeCandidate.findFirst({ where: { id, camera: cameraScope(actor) }, include: candidateInclude });
  if (!candidate) throw new ScanError(404, "Candidate not found.");
  return candidate;
}
export async function scanOptions(actor: ScanActor) {
  const cameras = await prisma.roadCamera.findMany({ where: { ...cameraScope(actor), enabled: true }, include: { ward: { select: { id: true, name: true } } } });
  const wards = [...new Map(cameras.map(camera => [camera.wardId, camera.ward])).values()].map(ward => ({ ...ward, camerasAvailable: cameras.filter(camera => camera.wardId === ward.id).length }));
  return { providerMode: getEnv().POTHOLE_SCAN_PROVIDER === "ai" ? "AI" : "DEMO", simulated: cameras.every(camera => camera.simulated), wards, newCandidates: await prisma.potholeCandidate.count({ where: { camera: cameraScope(actor), status: "NEW" } }) };
}
export async function recentScans(actor: ScanActor) {
  const scans = await prisma.roadScan.findMany({ where: scanScope(actor), include: { ward: true }, orderBy: { createdAt: "desc" }, take: 25 });
  return scans.map(scan => roadScanSummarySchema.parse(wire(scan)));
}
export async function scanDetail(actor: ScanActor, id: string) {
  // A lost bounded execution is visible after its lease, rather than polling forever.
  await prisma.roadScan.updateMany({ where: { ...scanScope(actor), id, status: { in: ["QUEUED", "RUNNING"] }, createdAt: { lt: new Date(Date.now() - 300000) } }, data: { status: "FAILED", completedAt: new Date(), failureSummary: "Scan was interrupted. Start a new scan." } });
  const scan = await prisma.roadScan.findFirst({ where: { ...scanScope(actor), id }, include: { ward: true, cameras: { include: { camera: true } }, verification: true } });
  if (!scan) throw new ScanError(404, "Scan not found.");
  const candidates = await prisma.potholeCandidate.findMany({ where: { camera: cameraScope(actor), OR: [{ scanId: id }, { observations: { some: { scanId: id } } }] }, include: candidateInclude });
  return roadScanSchema.parse(wire({ ...scan, candidates: candidates.map(candidateResponse) }));
}
export async function candidateDetail(actor: ScanActor, id: string) {
  const candidate = await getCandidate(actor, id);
  const observations = await prisma.potholeObservation.findMany({ where: { candidateId: id }, orderBy: { id: "asc" }, take: 100 });
  const verifications = await prisma.roadScan.findMany({ where: { ...scanScope(actor), verification: { candidateId: id } }, include: { ward: true }, orderBy: { createdAt: "desc" }, take: 20 });
  return { ...candidateResponse(candidate), observations, verifications: verifications.map(scan => roadScanSummarySchema.parse(wire(scan))) };
}
export async function createScan(actor: ScanActor, wardId: string, candidateId?: string) {
  if (getEnv().POTHOLE_SCAN_PROVIDER === "disabled") throw new ScanError(503, "Camera scanning is not configured.");
  if (actor.wardId && actor.wardId !== wardId) throw new ScanError(403, "This ward is outside your scope.");
  return prisma.$transaction(async tx => {
    // Serialize creation by agency; only one bounded scan is active per agency.
    await tx.$queryRaw`SELECT "id" FROM "Agency" WHERE "id" = ${actor.agencyId}::uuid FOR UPDATE`;
    const cameras = await tx.roadCamera.findMany({ where: { ...cameraScope(actor), wardId, enabled: true, ...(candidateId ? { candidates: { some: { id: candidateId } } } : {}) }, orderBy: { code: "asc" }, take: 12 });
    if (!cameras.length) throw new ScanError(403, "No configured cameras are available in your authorized scope.");
    const active = await tx.roadScan.findFirst({ where: { ...scanScope(actor), status: { in: ["QUEUED", "RUNNING"] }, createdAt: { gte: new Date(Date.now() - 300000) } } });
    if (active) throw new ScanError(409, "A scan is already running. Open Recent scans to follow it.");
    let verification: Prisma.PotholeVerificationScanUncheckedCreateWithoutScanInput | undefined;
    if (candidateId) {
      const candidate = await getCandidate(actor, candidateId, tx);
      const projectId = candidate.projectId ?? candidate.ticket?.project?.id;
      const project = projectId ? await tx.project.findFirst({ where: { id: projectId, agencyId: actor.agencyId!, wardId }, include: { completionEvidence: { where: { uploadedAt: { not: null } }, orderBy: { createdAt: "desc" }, take: 1 } } }) : null;
      if (!project || project.state !== "AWAITING_VERIFICATION" || !project.completionEvidence[0]) throw new ScanError(409, "Verification requires linked work awaiting review with Engineer completion evidence.");
      verification = { candidateId, projectId: project.id, completionEvidenceId: project.completionEvidence[0].id, before: candidate.evidence as Prisma.InputJsonValue, result: json(demoVerification(potholeDetectionSchema.parse(candidate.detection), candidate.cameraId, [])) };
    }
    return tx.roadScan.create({ data: { type: candidateId ? "VERIFICATION" : "AREA", initiatedById: actor.userId, agencyId: actor.agencyId!, wardId, simulated: cameras.every(camera => camera.simulated), providerMode: getEnv().POTHOLE_SCAN_PROVIDER === "ai" ? "AI" : "DEMO", camerasRequested: cameras.length, cameras: { create: cameras.map(camera => ({ cameraId: camera.id })) }, ...(verification ? { verification: { create: verification } } : {}) } });
  });
}

export async function processScan(actor: ScanActor, id: string) {
  const scan = await prisma.roadScan.findFirst({ where: { ...scanScope(actor), id }, include: { cameras: { include: { camera: true } }, verification: { include: { candidate: true } } } });
  if (!scan) throw new ScanError(404, "Scan not found.");
  const claimed = await prisma.roadScan.updateMany({ where: { id, status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date() } });
  if (!claimed.count) return scanDetail(actor, id);
  try {
    const env = getEnv();
    const ai = scan.providerMode === "AI" ? new PotholeAiClient(env.POTHOLE_AI_URL, env.POTHOLE_AI_INTERNAL_TOKEN) : undefined;
    if (ai) await ai.health();
    const provider = new DemoCameraScanProvider(assetDirectory(env.POTHOLE_DEMO_ASSET_DIR || undefined), ai);
    const stopAt = Date.now() + 180000;
    for (const item of scan.cameras) {
      try {
        if (Date.now() > stopAt) throw new ScanError(503, "The bounded scan time limit was reached.");
        if (!item.camera.enabled) throw new ScanError(503, "Camera is disabled.");
        const evidence = await provider.sample(item.camera, Boolean(scan.verification), id);
        const frames = toFrames(item.cameraId, evidence);
        const usable = frames.filter(frame => frame.frameQuality.usable);
        const raw = frames.reduce((sum, frame) => sum + frame.detections.length, 0);
        const clusters = ai ? (await ai.temporal(usable)).confirmedClusters.map(cluster => ({ detection: { detectionId: cluster.clusterId, label: "pothole" as const, confidence: cluster.averageConfidence, bbox: cluster.canonicalBbox, polygon: cluster.canonicalPolygon, visibleAreaRatio: cluster.maxVisibleAreaRatio, visualExtentCandidate: cluster.visualExtentCandidate }, frameIndices: usable.filter(frame => frame.detections.some(det => bboxIou(det.bbox, cluster.canonicalBbox) >= .3)).map(frame => frame.frameIndex) })) : clusterFrames(frames);
        const verificationResult = scan.verification ? ai ? await ai.verify(potholeDetectionSchema.parse(scan.verification.candidate.detection), item.cameraId, frames) : demoVerification(potholeDetectionSchema.parse(scan.verification.candidate.detection), item.cameraId, frames) : undefined;
        await prisma.$transaction(async tx => {
          await tx.roadScanCameraResult.update({ where: { id: item.id }, data: { status: usable.length >= 3 ? "USABLE" : "POOR_QUALITY", framesProcessed: frames.length, rawDetections: raw, evidence: json(evidence), failure: usable.length >= 3 ? null : "Camera samples did not pass quality checks." } });
          if (verificationResult && scan.verification) {
            await tx.potholeVerificationScan.update({ where: { id: scan.verification.id }, data: { result: json(verificationResult), after: json(evidence.at(-1) ?? null) } });
          } else {
            // Same-camera deterministic ROI matching only; never infer cross-camera identity.
            const existing = await tx.potholeCandidate.findMany({ where: { cameraId: item.cameraId, status: { not: "DISMISSED" } } });
            for (const cluster of clusters) {
              const first = evidence[cluster.frameIndices[0] ?? 0]!;
              let candidate = existing.find(record => bboxIou(potholeDetectionSchema.parse(record.detection).bbox, cluster.detection.bbox) >= .3);
              if (!candidate) {
                candidate = await tx.potholeCandidate.create({ data: { reference: `AS-${randomUUID().slice(0, 8).toUpperCase()}`, scanId: id, cameraId: item.cameraId, detection: json(cluster.detection), evidence: json(first), uniqueFrameCount: cluster.frameIndices.length, firstSeenAt: new Date(first.capturedAt), lastSeenAt: new Date(evidence.at(-1)!.capturedAt) } });
                existing.push(candidate);
              } else await tx.potholeCandidate.update({ where: { id: candidate.id }, data: { lastSeenAt: new Date(evidence.at(-1)!.capturedAt), uniqueFrameCount: { increment: cluster.frameIndices.length } } });
              await tx.potholeObservation.createMany({ data: cluster.frameIndices.map(frameIndex => ({ candidateId: candidate!.id, scanId: id, frameIndex, detection: json(frames[frameIndex]!.detections.find(det => bboxIou(det.bbox, cluster.detection.bbox) >= .3) ?? cluster.detection), evidence: json(evidence[frameIndex]) })), skipDuplicates: true });
            }
          }
          await tx.roadScan.update({ where: { id }, data: { camerasProcessed: { increment: 1 }, usableCameras: { increment: usable.length >= 3 ? 1 : 0 }, unusableCameras: { increment: usable.length >= 3 ? 0 : 1 }, rawDetections: { increment: raw } } });
        });
      } catch (error) {
        await prisma.roadScanCameraResult.update({ where: { id: item.id }, data: { status: "UNAVAILABLE", failure: error instanceof ScanError ? error.message : "Camera sample is unavailable." } });
        await prisma.roadScan.update({ where: { id }, data: { camerasProcessed: { increment: 1 }, unusableCameras: { increment: 1 } } });
      }
    }
    const updated = await prisma.roadScan.findUniqueOrThrow({ where: { id } });
    const uniqueCandidates = await prisma.potholeCandidate.count({ where: { observations: { some: { scanId: id } } } });
    await finishScan(updated, uniqueCandidates);
  } catch (error) {
    await prisma.roadScanCameraResult.updateMany({ where: { scanId: id, status: "PENDING" }, data: { status: "UNAVAILABLE", failure: "Analysis service was unavailable before this camera could be processed." } });
    await prisma.roadScan.update({ where: { id }, data: { status: "FAILED", completedAt: new Date(), failureSummary: error instanceof ScanError ? error.message : "Scan could not complete. Try again later." } });
  }
  return scanDetail(actor, id);
}
async function finishScan(scan: ScanRecord, uniqueCandidates: number) {
  const status = scan.usableCameras === 0 ? "FAILED" : scan.unusableCameras > 0 ? "PARTIAL" : "COMPLETED";
  await prisma.$transaction(async tx => {
    await tx.roadScan.update({ where: { id: scan.id }, data: { status, uniqueCandidates, completedAt: new Date(), failureSummary: scan.unusableCameras ? `${scan.unusableCameras} camera(s) could not provide usable evidence.` : null } });
    await createNotifications(tx, [{ userId: scan.initiatedById, type: "ROAD_SCAN_READY", payload: { scanId: scan.id, status, uniqueCandidates } }]);
  });
  requestPushDelivery();
}
export async function assignCandidate(actor: ScanActor, id: string, input: { engineerId: string; deadline: string }) {
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "PotholeCandidate" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const candidate = await getCandidate(actor, id, tx);
    if (candidate.status !== "NEW" || candidate.ticketId || candidate.projectId) throw new ScanError(409, "This candidate is already assigned, linked, or dismissed.");
    const ticketId = randomUUID();
    const camera = candidate.camera;
    const evidence = scanEvidenceSchema.parse(candidate.evidence);
    // Human-triggered system intake, not citizen validation or automatic issue confirmation.
    await tx.$executeRaw`INSERT INTO "Ticket" ("id", "categoryId", "assignedAgencyId", "coordinates", "wardId", "roadSegmentId", "state", "channel", "title", "address", "createdAt", "updatedAt") VALUES (${ticketId}::uuid, ${camera.categoryId}::uuid, ${actor.agencyId}::uuid, ST_SetSRID(ST_MakePoint(${camera.longitude}, ${camera.latitude}),4326), ${camera.wardId}::uuid, ${camera.roadSegmentId}::uuid, 'ROUTED_TO_AGENCY', 'WEB', ${`Area Scan: ${camera.name}`}, ${`Approximate camera anchor: ${camera.name}`}, NOW(), NOW())`;
    await tx.ticketStateTransition.create({ data: { ticketId, toState: "ROUTED_TO_AGENCY", reason: `AREA_SCAN_REVIEW:${id}`, actedById: actor.userId } });
    await tx.observation.create({ data: { ticketId, submitterId: actor.userId, imageUrl: new URL(evidence.url, getEnv().PUBLIC_API_URL).href, note: `Source: Area Scan · ${candidate.reference}. Simulated camera source. Field confirmation required.`, latitude: camera.latitude, longitude: camera.longitude, address: camera.name } });
    const inspection = await createAssignment(tx, { ticketId, engineerId: input.engineerId, assignedById: actor.userId, agencyId: actor.agencyId!, deadline: new Date(input.deadline) });
    if (!inspection) throw new ScanError(422, "Choose an active Engineer from your agency.");
    await tx.ticket.update({ where: { id: ticketId }, data: { state: "INSPECTION_DUE" } });
    await tx.ticketStateTransition.create({ data: { ticketId, fromState: "ROUTED_TO_AGENCY", toState: "INSPECTION_DUE", reason: "ENGINEER_INSPECTION_ASSIGNED", actedById: actor.userId } });
    await tx.potholeCandidate.update({ where: { id }, data: { status: "INSPECTION_ASSIGNED", ticketId, inspectionId: inspection.id, audit: json([{ actorId: actor.userId, action: "ASSIGN_INSPECTION", at: new Date().toISOString() }]) } });
    return { ticketId, inspectionId: inspection.id };
  });
  requestPushDelivery();
  return result;
}
export async function changeCandidate(actor: ScanActor, id: string, reason: string, projectId?: string) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "PotholeCandidate" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const candidate = await getCandidate(actor, id, tx);
    if (candidate.status !== "NEW") throw new ScanError(409, "This candidate is already assigned, linked, or dismissed.");
    if (projectId) {
      const project = await tx.project.findFirst({ where: { id: projectId, agencyId: actor.agencyId!, wardId: candidate.camera.wardId, state: { notIn: ["CLOSED", "CANCELLED"] } } });
      if (!project) throw new ScanError(404, "Open work was not found in this agency and ward.");
    }
    await tx.potholeCandidate.update({ where: { id }, data: { status: projectId ? "LINKED" : "DISMISSED", projectId, dismissReason: projectId ? null : reason, audit: json([{ actorId: actor.userId, action: projectId ? "LINK_WORK" : "DISMISS", reason, at: new Date().toISOString() }]) } });
  });
}
