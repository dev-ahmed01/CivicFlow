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

const demoCategoryPatterns: Record<string, RegExp> = {
  "0001": /pothole|road[-_ ]?damage|damaged[-_ ]?road|broken[-_ ]?road|road[-_ ]?crack|asphalt/,
  "0002": /street[-_ ]?light|streetlight|lamp[-_ ]?post|light[-_ ]?pole/,
  "0003": /water[-_ ]?(leak|leakage|supply)|leaking[-_ ]?pipe|burst[-_ ]?pipe|water[-_ ]?infrastructure/,
  "0004": /drain(age)?|sewage|sewer|manhole/,
  "0005": /garbage|waste|trash|litter|overflowing[-_ ]?bin|dump/,
  "0006": /electrical[-_ ]?hazard|exposed[-_ ]?wire|fallen[-_ ]?wire|sparking/,
  "0007": /public[-_ ]?toilet|toilet|restroom/,
  "0008": /park|fallen[-_ ]?tree|broken[-_ ]?tree|tree[-_ ]?hazard/,
  "0009": /stray[-_ ]?(dog|animal|cattle)|street[-_ ]?dog/,
  "0010": /illegal[-_ ]?construction|unauthorized[-_ ]?building|encroachment/,
  "0011": /traffic[-_ ]?sign|road[-_ ]?sign|signal|signage/,
  "0012": /other[-_ ]?civic[-_ ]?issue/,
};
const clearlyUnrelated = /selfie|portrait|indoor|bedroom|living[-_ ]?room|food|meal|pet|cat|screenshot|screen[-_ ]?shot|vacation/;

function categorySuffix(categoryId: string): string {
  return categoryId.slice(-4);
}

// Free-demo mode is intentionally filename-driven and deterministic. Curated
// demo evidence must use descriptive filenames; unknown camera filenames are
// sent to retake instead of being falsely treated as measured visual AI.
export class DevelopmentRelevanceService implements ImageRelevanceService {
  async checkImageRelevance(imageUrl: string, categoryId: string): Promise<ImageRelevanceResult> {
    const normalized = decodeURIComponent(imageUrl).toLowerCase();
    if (clearlyUnrelated.test(normalized)) return { score: 0.04, pass: false, reason: "UNRELATED_CONTENT" };
    const selected = categorySuffix(categoryId);
    const selectedPattern = demoCategoryPatterns[selected];
    if (selectedPattern?.test(normalized)) return { score: 0.93, pass: true, reason: "MATCH" };
    const otherCategoryMatched = Object.entries(demoCategoryPatterns)
      .some(([suffix, pattern]) => suffix !== selected && pattern.test(normalized));
    if (otherCategoryMatched) return { score: 0.12, pass: false, reason: "CATEGORY_MISMATCH" };
    return { score: 0.42, pass: false, reason: "LOW_CONFIDENCE" };
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
