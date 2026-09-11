import { z } from "zod";

const unit = z.number().finite().min(0).max(1);
const count = z.number().int().nonnegative();
export const normalizedBboxSchema = z.object({ x: unit, y: unit, width: unit, height: unit });
export const normalizedPolygonSchema = z.array(z.tuple([unit, unit])).min(3).max(10000);
export const potholeDetectionSchema = z.object({
  detectionId: z.string(), label: z.literal("pothole"), confidence: unit,
  bbox: normalizedBboxSchema, polygon: normalizedPolygonSchema, visibleAreaRatio: unit,
  visualExtentCandidate: z.enum(["LOW", "MEDIUM", "HIGH"]),
});
export const frameQualitySchema = z.object({ usable: z.boolean(), blurScore: z.number().finite(), brightnessScore: unit, reasons: z.array(z.string()) });
export const potholeModelSchema = z.object({ name: z.string(), version: z.string(), runtimeMode: z.enum(["REAL", "DEMO"]), weightsSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), source: z.string(), threshold: unit });
export const potholeDetectionResponseSchema = z.object({
  contractVersion: z.literal("1.0"), requestId: z.string().nullable(), cameraId: z.string().nullable(), capturedAt: z.string().nullable(),
  image: z.object({ width: count.positive(), height: count.positive() }), frameQuality: frameQualitySchema,
  detections: z.array(potholeDetectionSchema).max(200), model: potholeModelSchema, processingMs: count,
});
export const potholeFrameSchema = z.object({ frameIndex: count, timestampSec: z.number().finite(), cameraId: z.string(), frameQuality: frameQualitySchema, detections: z.array(potholeDetectionSchema) });
export const potholeTemporalSchema = z.object({ totalFramesProcessed: count, totalRawDetections: count, confirmedClusters: z.array(z.object({
  clusterId: z.string(), uniqueFrameCount: count, repeatCount: count, firstFrameIndex: count, lastFrameIndex: count,
  firstTimestampSec: z.number(), lastTimestampSec: z.number(), averageConfidence: unit, canonicalBbox: normalizedBboxSchema,
  canonicalPolygon: normalizedPolygonSchema, maxVisibleAreaRatio: unit, visualExtentCandidate: z.enum(["LOW", "MEDIUM", "HIGH"]),
})) });
export const potholeVerificationResultSchema = z.object({ verificationStatus: z.enum(["NO_MATCHING_DEFECT_DETECTED", "DEFECT_STILL_DETECTED", "INCONCLUSIVE"]), evidenceScore: unit, reason: z.string(), usableFramesProcessed: count, totalFramesProcessed: count, matchedDetection: potholeDetectionSchema.nullable() });
export const roadScanRequestSchema = z.object({ type: z.literal("AREA"), wardId: z.string().uuid() }).strict();
export const candidateAssignSchema = z.object({ engineerId: z.string().uuid(), deadline: z.string().datetime().refine(v => Date.parse(v) > Date.now(), "Choose a future deadline") }).strict();
export const candidateDismissSchema = z.object({ reason: z.string().trim().min(5).max(1000) }).strict();
export const candidateLinkSchema = z.object({ projectId: z.string().uuid(), reason: z.string().trim().min(5).max(1000) }).strict();
export const scanReviewSchema = z.object({ decision: z.enum(["CONTINUE_CLOSURE", "REQUEST_REWORK"]), note: z.string().trim().min(5).max(1000) }).strict();
export const roadCameraSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), wardId: z.string().uuid(), roadSegmentId: z.string().uuid().nullable(), latitude: z.number(), longitude: z.number(), simulated: z.boolean() });
export const scanEvidenceSchema = z.object({ url: z.string(), attribution: z.string(), sourceUrl: z.string().url(), simulated: z.boolean(), capturedAt: z.string(), image: z.object({ width: count.positive(), height: count.positive() }), frameQuality: frameQualitySchema, detections: z.array(potholeDetectionSchema), model: potholeModelSchema });
export const potholeCandidateSchema = z.object({ id: z.string().uuid(), reference: z.string(), scanId: z.string().uuid(), status: z.enum(["NEW", "INSPECTION_ASSIGNED", "LINKED", "DISMISSED"]), camera: roadCameraSchema, detection: potholeDetectionSchema, evidence: scanEvidenceSchema, uniqueFrameCount: count, firstSeenAt: z.string(), lastSeenAt: z.string(), ticketId: z.string().uuid().nullable(), inspectionId: z.string().uuid().nullable(), projectId: z.string().uuid().nullable(), dismissReason: z.string().nullable() });
export const roadScanSummarySchema = z.object({ id: z.string().uuid(), type: z.enum(["AREA", "VERIFICATION"]), status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "PARTIAL", "FAILED"]), ward: z.object({ id: z.string().uuid(), name: z.string() }), providerMode: z.enum(["DEMO", "AI"]), simulated: z.boolean(), createdAt: z.string(), completedAt: z.string().nullable(), camerasRequested: count, camerasProcessed: count, usableCameras: count, unusableCameras: count, rawDetections: count, uniqueCandidates: count, failureSummary: z.string().nullable() });
export const roadScanSchema = roadScanSummarySchema.extend({ candidates: z.array(potholeCandidateSchema), cameras: z.array(z.object({ camera: roadCameraSchema, status: z.enum(["PENDING", "USABLE", "POOR_QUALITY", "UNAVAILABLE"]), failure: z.string().nullable(), framesProcessed: count, rawDetections: count })), verification: z.object({ candidateId: z.string().uuid(), projectId: z.string().uuid(), result: potholeVerificationResultSchema, before: scanEvidenceSchema, after: scanEvidenceSchema.nullable() }).nullable() });
export const potholeCandidateDetailSchema = potholeCandidateSchema.extend({ observations: z.array(z.object({ id: z.string().uuid(), scanId: z.string().uuid(), frameIndex: count, evidence: scanEvidenceSchema, detection: potholeDetectionSchema })), verifications: z.array(roadScanSummarySchema) });
export const roadScanOptionsSchema = z.object({ providerMode: z.enum(["DEMO", "AI"]), simulated: z.boolean(), wards: z.array(z.object({ id: z.string().uuid(), name: z.string(), camerasAvailable: count })), newCandidates: count });
export type PotholeDetection = z.infer<typeof potholeDetectionSchema>;
export type PotholeDetectionResponse = z.infer<typeof potholeDetectionResponseSchema>;
export type PotholeFrame = z.infer<typeof potholeFrameSchema>;
export type PotholeVerificationResult = z.infer<typeof potholeVerificationResultSchema>;
export type ScanEvidence = z.infer<typeof scanEvidenceSchema>;
export type RoadCamera = z.infer<typeof roadCameraSchema>;
export type PotholeCandidate = z.infer<typeof potholeCandidateSchema>;
export type PotholeCandidateDetail = z.infer<typeof potholeCandidateDetailSchema>;
export type RoadScan = z.infer<typeof roadScanSchema>;
export type RoadScanSummary = z.infer<typeof roadScanSummarySchema>;
export type RoadScanOptions = z.infer<typeof roadScanOptionsSchema>;
