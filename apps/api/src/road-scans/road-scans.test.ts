import { describe, expect, it, vi } from "vitest";
import { potholeDetectionResponseSchema, type PotholeDetection, type PotholeFrame } from "@civicos/shared";
import { PotholeAiClient } from "./ai-client";
import { bboxIou, clusterFrames, demoVerification, DemoCameraScanProvider, assetDirectory, loadManifest } from "./provider";
import { cameraScope, scanScope } from "./service";

const detection: PotholeDetection = { detectionId: "d1", label: "pothole", confidence: .9, bbox: { x: .1, y: .2, width: .3, height: .2 }, polygon: [[.1,.2],[.4,.2],[.4,.4]], visibleAreaRatio: .03, visualExtentCandidate: "HIGH" };
const frames = (usable = true, detections = [detection]): PotholeFrame[] => [0,1,2].map(frameIndex => ({ frameIndex, timestampSec: frameIndex, cameraId: "cam", frameQuality: { usable, blurScore: 100, brightnessScore: .5, reasons: [] }, detections }));
describe("camera sampling and deterministic evidence", () => {
  it("clusters raw observations into one candidate", () => { expect(clusterFrames(frames())).toHaveLength(1); expect(clusterFrames(frames())[0]?.frameIndices).toHaveLength(3); });
  it("does not count repeated frame IDs twice", () => { expect(clusterFrames(frames().map(frame => ({ ...frame, frameIndex: 0 })))).toHaveLength(0); });
  it("excludes poor quality", () => { expect(clusterFrames(frames(false))).toHaveLength(0); });
  it("does not merge distinct spatial candidates", () => { expect(clusterFrames(frames(true, [detection, { ...detection, bbox: { x: .7, y: .7, width: .1, height: .1 } }]))).toHaveLength(2); });
  it("rejects cross-camera sequences", () => { expect(() => clusterFrames([...frames(), { ...frames()[0]!, cameraId: "other" }])).toThrow(); });
  it("detects no matching visible defect without a workflow mutation", () => { expect(demoVerification(detection, "cam", frames(true, [])).verificationStatus).toBe("NO_MATCHING_DEFECT_DETECTED"); });
  it("detects persistence", () => { expect(demoVerification(detection, "cam", frames()).verificationStatus).toBe("DEFECT_STILL_DETECTED"); });
  it.each([frames(false), frames().slice(0,2), frames().map(frame => ({ ...frame, cameraId: "other" }))].map(current => ({ current })))("treats inadequate evidence as inconclusive", ({ current }) => { expect(demoVerification(detection, "cam", current).verificationStatus).toBe("INCONCLUSIVE"); });
  it("handles empty and disjoint boxes", () => { expect(bboxIou(detection.bbox, { x: .9, y: .9, width: 0, height: 0 })).toBe(0); });
  it("selects a bounded local manifest sample and records demo provenance", async () => { const result = await new DemoCameraScanProvider(assetDirectory()).sample({ id: "cam", providerReference: "repair", simulated: true }, false, "scan"); expect(result).toHaveLength(3); expect(result[0]?.model.runtimeMode).toBe("DEMO"); expect(result[0]?.model.weightsSha256).toBeNull(); expect(result[0]?.url).toMatch(/^\/road-scan-assets\//); });
  it("rejects unknown and unauthorized providers", async () => { const provider = new DemoCameraScanProvider(assetDirectory()); await expect(provider.sample({ id: "cam", providerReference: "unknown", simulated: true }, false, "scan")).rejects.toThrow(); await expect(provider.sample({ id: "cam", providerReference: "repair", simulated: false }, false, "scan")).rejects.toThrow(); });
  it("manifest has eight scenarios and attributable photos", () => { const manifest = loadManifest(assetDirectory()); expect(manifest.cameras).toHaveLength(8); expect(manifest.assets.every(asset => asset.attribution && asset.sha256.length === 64)).toBe(true); });
  it("scope retains agency and assigned ward", () => { const actor = { userId: "head", agencyId: "agency", wardId: "ward" }; expect(cameraScope(actor)).toEqual({ agencyId: "agency", wardId: "ward" }); expect(scanScope(actor)).toEqual(cameraScope(actor)); expect(() => cameraScope({ ...actor, agencyId: null })).toThrow(); });
});
describe("AI client contract and failure boundary", () => {
  it.each([401,400,413,503])("handles upstream %s without leaking internal details", async status => { const transport = vi.fn().mockResolvedValue(new Response("private traceback", { status })); const client = new PotholeAiClient("http://private-ai", "a".repeat(40), 100, transport); await expect(client.health()).rejects.toThrow(/Camera/); });
  it("missing token fails before network access", async () => { const transport = vi.fn(); await expect(new PotholeAiClient("http://private-ai", "", 100, transport).health()).rejects.toThrow(/authentication/); expect(transport).not.toHaveBeenCalled(); });
  it("wrong contract version is rejected", async () => { const transport = vi.fn().mockResolvedValue(Response.json({ contractVersion: "2.0", status: "ok", runtimeMode: "REAL", modelLoaded: true, weightsSha256: "a".repeat(64) })); await expect(new PotholeAiClient("http://private-ai", "a".repeat(40), 100, transport).health()).rejects.toThrow(/unsupported/); });
  it("network failure is sanitized", async () => { const transport = vi.fn().mockRejectedValue(new Error("private token")); await expect(new PotholeAiClient("http://private-ai", "a".repeat(40), 100, transport).health()).rejects.toThrow(/time limit/); });
  it("validates polygon bounds and runtime provenance", () => { expect(potholeDetectionResponseSchema.safeParse({}).success).toBe(false); });
  it("attaches internal authentication only server-side", async () => { const transport = vi.fn().mockResolvedValue(Response.json({ contractVersion: "1.0", status: "ok", runtimeMode: "REAL", modelLoaded: true, weightsSha256: "a".repeat(64) })); await new PotholeAiClient("http://private-ai", "a".repeat(40), 100, transport).health(); expect(transport.mock.calls[0]?.[1].headers["X-Internal-Token"]).toBe("a".repeat(40)); });
});
