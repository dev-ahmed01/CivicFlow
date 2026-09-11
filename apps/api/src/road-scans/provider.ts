import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { potholeDetectionSchema, type PotholeDetection, type PotholeFrame, type ScanEvidence, type PotholeVerificationResult } from "@civicos/shared";
import { PotholeAiClient, ScanError } from "./ai-client";

const assetSchema = z.object({ id: z.string(), file: z.string().regex(/^[a-z0-9_]+\.jpg$/), sha256: z.string(), sourceUrl: z.string().url(), attribution: z.string(), image: z.object({ width: z.number(), height: z.number() }), detections: z.array(potholeDetectionSchema) });
const manifestSchema = z.object({ assets: z.array(assetSchema), cameras: z.array(z.object({ reference: z.string(), before: z.string(), after: z.string(), quality: z.enum(["poor", "usable"]), verification: z.enum(["clear", "visible", "poor"]) })) });
export function assetDirectory(configured?: string): string {
  const candidates = [configured, resolve(process.cwd(), "packages/db/demo/road-scans"), resolve(process.cwd(), "../../packages/db/demo/road-scans")];
  const result = candidates.find(path => path && existsSync(join(path, "manifest.json")));
  if (!result) throw new ScanError(503, "Demo camera samples have not been provisioned.");
  return result;
}
export function loadManifest(directory: string) { return manifestSchema.parse(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"))); }
export interface CameraScanProvider {
  readonly simulated: boolean;
  sample(camera: { id: string; providerReference: string; simulated: boolean }, verification: boolean, scanId: string): Promise<ScanEvidence[]>;
}
// Future authorized providers implement bounded acquisition here, never a watcher.
export class DemoCameraScanProvider implements CameraScanProvider {
  readonly simulated = true;
  constructor(private directory: string, private ai?: PotholeAiClient) {}
  async sample(camera: { id: string; providerReference: string; simulated: boolean }, verification: boolean, scanId: string): Promise<ScanEvidence[]> {
    if (!camera.simulated) throw new ScanError(503, "An authorized camera provider is not configured.");
    const manifest = loadManifest(this.directory);
    const fixture = manifest.cameras.find(item => item.reference === camera.providerReference);
    const asset = manifest.assets.find(item => item.id === (verification ? fixture?.after : fixture?.before));
    if (!fixture || !asset) throw new ScanError(503, "Camera sample is unavailable.");
    const bytes = readFileSync(join(this.directory, asset.file));
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new ScanError(503, "Camera sample integrity check failed.");
    const evidence: ScanEvidence[] = [];
    for (let index = 0; index < 3; index++) {
      const capturedAt = new Date(Date.now() + index).toISOString();
      const result = this.ai ? await this.ai.detect(bytes, camera.id, capturedAt, scanId) : null;
      const poor = fixture.quality === "poor" || (verification && fixture.verification === "poor");
      evidence.push({ url: `/road-scan-assets/${asset.file}`, sourceUrl: asset.sourceUrl, attribution: asset.attribution,
        simulated: true, capturedAt, image: result?.image ?? asset.image,
        frameQuality: result?.frameQuality ?? { usable: !poor, blurScore: poor ? 4 : 120, brightnessScore: .5, reasons: poor ? ["TOO_BLURRY"] : [] },
        detections: result?.detections ?? (poor ? [] : asset.detections),
        model: result?.model ?? { name: "Explicit demo replay", version: "1", runtimeMode: "DEMO", weightsSha256: null, source: "Licensed photo demo manifest; illustrative replay", threshold: .25 },
      });
    }
    return evidence;
  }
}
export function toFrames(cameraId: string, evidence: ScanEvidence[]): PotholeFrame[] {
  return evidence.map((item, frameIndex) => ({ cameraId, frameIndex, timestampSec: Date.parse(item.capturedAt) / 1000, frameQuality: item.frameQuality, detections: item.detections }));
}
export function bboxIou(a: PotholeDetection["bbox"], b: PotholeDetection["bbox"]): number {
  const intersection = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}
// Contract §5: one camera, one contribution per distinct frame. Quality gates clustering.
export function clusterFrames(frames: PotholeFrame[], iou = .3, repeats = 3) {
  if (new Set(frames.map(frame => frame.cameraId)).size > 1) throw new ScanError(422, "Samples must belong to one camera.");
  const clusters: Array<{ detection: PotholeDetection; frameIndices: number[] }> = [];
  for (const frame of frames.filter(item => item.frameQuality.usable)) {
    const used = new Set<number>();
    for (const detection of frame.detections) {
      let index = clusters.findIndex((item, n) => !used.has(n) && bboxIou(item.detection.bbox, detection.bbox) >= iou);
      if (index < 0) { index = clusters.length; clusters.push({ detection, frameIndices: [] }); }
      used.add(index);
      const cluster = clusters[index]!;
      if (!cluster.frameIndices.includes(frame.frameIndex)) cluster.frameIndices.push(frame.frameIndex);
    }
  }
  return clusters.filter(item => item.frameIndices.length >= repeats);
}
export function demoVerification(baseline: PotholeDetection, cameraId: string, frames: PotholeFrame[]): PotholeVerificationResult {
  const usable = frames.filter(item => item.frameQuality.usable);
  const match = usable.flatMap(frame => frame.detections).find(item => item.confidence >= .3 && bboxIou(baseline.bbox, item.bbox) >= .3);
  const inconclusive = usable.length < 3 || frames.some(frame => frame.cameraId !== cameraId);
  return { verificationStatus: inconclusive ? "INCONCLUSIVE" : match ? "DEFECT_STILL_DETECTED" : "NO_MATCHING_DEFECT_DETECTED", evidenceScore: inconclusive ? 0 : match?.confidence ?? Math.min(1, usable.length / 5), reason: "Explicit simulated camera replay. Supporting evidence requires a human review.", usableFramesProcessed: usable.length, totalFramesProcessed: frames.length, matchedDetection: inconclusive ? null : match ?? null };
}
