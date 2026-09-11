import { z } from "zod";
import { potholeDetectionResponseSchema, potholeTemporalSchema, potholeVerificationResultSchema, type PotholeDetection, type PotholeFrame } from "@civicos/shared";

export class ScanError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export class PotholeAiClient {
  constructor(private url: string, private token: string, private timeoutMs = 8000, private transport: typeof fetch = fetch) {}
  private async request<T>(path: string, schema: z.ZodType<T>, body?: BodyInit): Promise<T> {
    if (!this.url || this.token.length < 32 || /^(change-me|dev-secret|test)/i.test(this.token)) throw new ScanError(503, "Camera analysis authentication needs configuration.");
    try {
      const response = await this.transport(`${this.url.replace(/\/$/, "")}${path}`, {
        method: body ? "POST" : "GET", body, signal: AbortSignal.timeout(this.timeoutMs),
        headers: { "X-Internal-Token": this.token, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) },
      });
      if (!response.ok) throw new ScanError(503, response.status === 401 ? "Camera analysis authentication failed." : response.status === 413 ? "Camera sample exceeds the analysis size limit." : response.status === 400 || response.status === 422 ? "Camera sample could not be analyzed." : "Camera analysis is unavailable. Try again later.");
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) throw new ScanError(503, "Camera analysis returned an unsupported response.");
      return parsed.data;
    } catch (error) {
      if (error instanceof ScanError) throw error;
      throw new ScanError(503, "Camera analysis could not be reached within the time limit.");
    }
  }
  async health() {
    const result = await this.request("/health", z.object({ contractVersion: z.literal("1.0"), status: z.literal("ok"), runtimeMode: z.literal("REAL"), modelLoaded: z.literal(true), weightsSha256: z.string().regex(/^[a-f0-9]{64}$/) }));
    return result;
  }
  async detect(bytes: Uint8Array, cameraId: string, capturedAt: string, requestId: string) {
    const body = new FormData();
    body.set("image", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), "sample.jpg");
    body.set("camera_id", cameraId); body.set("captured_at", capturedAt); body.set("request_id", requestId);
    const result = await this.request("/v1/detect/image", potholeDetectionResponseSchema, body);
    if (result.cameraId !== cameraId || result.requestId !== requestId || result.capturedAt !== capturedAt || result.model.runtimeMode !== "REAL" || !result.model.weightsSha256) throw new ScanError(503, "Camera analysis did not match the requested source or runtime.");
    return result;
  }
  temporal(frames: PotholeFrame[]) { return this.request("/v1/temporal/confirm", potholeTemporalSchema, JSON.stringify(frames)); }
  verify(baselineDetection: PotholeDetection, cameraId: string, currentFrames: PotholeFrame[]) {
    if (currentFrames.some(frame => frame.cameraId !== cameraId)) throw new ScanError(422, "Verification requires the original camera.");
    return this.request("/v1/verification/evaluate", potholeVerificationResultSchema, JSON.stringify({ baselineDetection, baselineCameraId: cameraId, currentCameraId: cameraId, currentFrames }));
  }
}
