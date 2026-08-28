import type { AppEnv } from "../config/env";

export interface ImageRelevanceResult {
  score: number;
  pass: boolean;
  reason?: "MATCH" | "CATEGORY_MISMATCH" | "UNRELATED_CONTENT" | "LOW_CONFIDENCE";
}

export interface ImageRelevanceService {
  checkImageRelevance(imageUrl: string, categoryId: string): Promise<ImageRelevanceResult>;
  getImageEmbedding(imageUrl: string): Promise<number[] | null>;
}

type HostedResponse = ImageRelevanceResult & { embedding?: number[] };

export type RelevanceDecision = {
  relevant: boolean;
  confidence: number;
  reason: "MATCH" | "CATEGORY_MISMATCH" | "UNRELATED_CONTENT" | "LOW_CONFIDENCE";
};

export function decideImageRelevance(result: ImageRelevanceResult, threshold: number): RelevanceDecision {
  const confidence = Math.max(0, Math.min(1, result.score));
  const relevant = result.pass && confidence >= threshold;
  if (relevant) return { relevant: true, confidence, reason: "MATCH" };
  if (result.reason === "CATEGORY_MISMATCH" || result.reason === "UNRELATED_CONTENT") {
    return { relevant: false, confidence, reason: result.reason };
  }
  return { relevant: false, confidence, reason: "LOW_CONFIDENCE" };
}

export class HostedClipRelevanceService implements ImageRelevanceService {
  private readonly embeddings = new Map<string, number[]>();

  constructor(private readonly endpoint: string, private readonly token?: string, private readonly timeoutMs = 8000) {}

  async checkImageRelevance(imageUrl: string, categoryId: string): Promise<ImageRelevanceResult> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({ imageUrl, categoryId }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Image relevance service returned ${response.status}`);
    const result = await response.json() as HostedResponse;
    if (!Number.isFinite(result.score) || typeof result.pass !== "boolean") {
      throw new Error("Image relevance service returned an invalid response");
    }
    if (result.embedding) this.embeddings.set(imageUrl, result.embedding);
    return { score: result.score, pass: result.pass, reason: result.reason };
  }

  async getImageEmbedding(imageUrl: string): Promise<number[] | null> {
    return this.embeddings.get(imageUrl) ?? null;
  }
}

const clearlyUnrelated = /(?:^|[/_. -])(selfie|portrait|meme|screen[-_ ]?shot|screenshot|food|meal|blank|empty)(?:[/_. -]|$)/;

// Part III §8.1 — free-demo mode is a conservative, deterministic gate after
// storage integrity validation. It never claims to inspect image pixels or
// infer a civic category from a filename. Ordinary camera/gallery names pass;
// only filenames that explicitly identify clearly unsuitable evidence fail.
export class DevelopmentRelevanceService implements ImageRelevanceService {
  async checkImageRelevance(imageUrl: string, categoryId: string): Promise<ImageRelevanceResult> {
    void categoryId; // Category matching is intentionally disabled in free-demo mode.
    const normalized = decodeURIComponent(imageUrl).toLowerCase();
    if (clearlyUnrelated.test(normalized)) return { score: 0.04, pass: false, reason: "UNRELATED_CONTENT" };
    return { score: 1, pass: true, reason: "MATCH" };
  }

  async getImageEmbedding(imageUrl: string): Promise<number[]> {
    const values = Array.from(imageUrl).slice(-32).map((character) => character.charCodeAt(0) / 255);
    return values.length > 0 ? values : [0];
  }
}

export function createImageRelevanceService(env: AppEnv): ImageRelevanceService {
  if (env.CLIP_MODE === "hosted" || env.CLIP_MODE === "auto" && env.CLIP_INFERENCE_URL) {
    if (!env.CLIP_INFERENCE_URL) throw new Error("CLIP_INFERENCE_URL is required for hosted CLIP mode");
    return new HostedClipRelevanceService(env.CLIP_INFERENCE_URL, env.CLIP_INFERENCE_TOKEN, env.CLIP_TIMEOUT_MS);
  }
  if (env.CLIP_MODE === "demo_deterministic") {
    if (env.DEPLOYMENT_PROFILE !== "free_demo") throw new Error("Deterministic relevance is restricted to the free-demo profile");
    return new DevelopmentRelevanceService();
  }
  if (env.NODE_ENV === "production") throw new Error("CLIP_INFERENCE_URL is required in production");
  return new DevelopmentRelevanceService();
}

export function cosineSimilarity(left: number[], right: number[]): number | null {
  if (left.length === 0 || left.length !== right.length) return null;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue ** 2;
    rightNorm += rightValue ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return null;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
