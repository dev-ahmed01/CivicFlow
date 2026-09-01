import { AutoProcessor, AutoTokenizer, CLIPModel, RawImage, env as transformersEnv } from "@huggingface/transformers";
import { prisma } from "db";
import type { AppEnv } from "../config/env";

export type ImageRelevanceReason = "MATCH" | "CATEGORY_MISMATCH" | "UNRELATED_CONTENT" | "LOW_CONFIDENCE";

export interface ImageRelevanceResult {
  score: number;
  pass: boolean;
  reason?: ImageRelevanceReason;
}

export interface ImageRelevanceService {
  checkImageRelevance(imageUrl: string, categoryId: string): Promise<ImageRelevanceResult>;
  getImageEmbedding(imageUrl: string): Promise<number[] | null>;
}

type HostedResponse = ImageRelevanceResult & { embedding?: number[] };

export type RelevanceDecision = {
  relevant: boolean;
  confidence: number;
  reason: ImageRelevanceReason;
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

export interface CategoryRelevancePrompt {
  id: string;
  name: string;
  relevancePrompt: string;
}

export type CategoryPromptProvider = () => Promise<CategoryRelevancePrompt[]>;

export interface ClipContentAnalysis {
  scores: number[];
  embedding: number[];
}

export interface ClipContentAnalyzer {
  analyze(image: Blob, prompts: string[]): Promise<ClipContentAnalysis>;
}

const unrelatedPrompts = [
  "an ordinary wall, room, furniture, or building interior with no visible civic issue",
  "a selfie, portrait, face, or posed photo of a person",
  "food, a meal, a drink, groceries, or a restaurant dish",
  "a screenshot, meme, poster, document, advertisement, or computer interface",
] as const;

type ClipRuntime = {
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
  model: Awaited<ReturnType<typeof CLIPModel.from_pretrained>>;
};

function softmax(values: number[]): number[] {
  if (values.length === 0) return [];
  const maximum = Math.max(...values);
  const exponentials = values.map((value) => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return total > 0 ? exponentials.map((value) => value / total) : values.map(() => 0);
}

function normalizedEmbedding(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0));
  return norm > 0 ? values.map((value) => value / norm) : [];
}

export class TransformersClipContentAnalyzer implements ClipContentAnalyzer {
  private runtime?: Promise<ClipRuntime>;

  constructor(private readonly modelId = "Xenova/clip-vit-base-patch32", cacheDir?: string) {
    if (cacheDir) transformersEnv.cacheDir = cacheDir;
  }

  async analyze(image: Blob, prompts: string[]): Promise<ClipContentAnalysis> {
    const { tokenizer, processor, model } = await this.getRuntime();
    const decodedImage = await RawImage.fromBlob(image);
    const textInputs = tokenizer(prompts, { padding: true, truncation: true });
    const imageInputs = await processor(decodedImage);
    const output = await model({ ...textInputs, ...imageInputs }) as unknown as {
      logits_per_image: { data: ArrayLike<number> };
      image_embeds: { data: ArrayLike<number> };
    };
    return {
      scores: softmax(Array.from(output.logits_per_image.data)),
      embedding: normalizedEmbedding(Array.from(output.image_embeds.data)),
    };
  }

  private getRuntime(): Promise<ClipRuntime> {
    this.runtime ??= Promise.all([
      AutoTokenizer.from_pretrained(this.modelId),
      AutoProcessor.from_pretrained(this.modelId),
      CLIPModel.from_pretrained(this.modelId, { dtype: "q8" }),
    ]).then(([tokenizer, processor, model]) => ({ tokenizer, processor, model }));
    return this.runtime;
  }
}

async function databaseCategoryPrompts(): Promise<CategoryRelevancePrompt[]> {
  return prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, relevancePrompt: true },
  });
}

async function downloadImage(imageUrl: string, timeoutMs: number): Promise<Blob> {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Image download returned ${response.status}`);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!contentType?.startsWith("image/")) throw new Error("Downloaded object is not an image");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 20 * 1024 * 1024) throw new Error("Image is too large for relevance analysis");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > 20 * 1024 * 1024) throw new Error("Image is empty or too large for relevance analysis");
  return new Blob([bytes], { type: contentType });
}

function relativeConfidence(selected: number, competitor: number): number {
  const total = selected + competitor;
  return total > 0 ? selected / total : 0;
}

export interface DevelopmentRelevanceOptions {
  analyzer?: ClipContentAnalyzer;
  categoryPrompts?: CategoryPromptProvider;
  download?: (imageUrl: string) => Promise<Blob>;
  timeoutMs?: number;
  modelId?: string;
  cacheDir?: string;
}

// Part III §8.1 — free-demo inference evaluates downloaded pixels with CLIP.
// Category prompts remain system-configurable in the database; filenames and
// object keys are never included in model input or decision logic.
export class DevelopmentRelevanceService implements ImageRelevanceService {
  private readonly analyzer: ClipContentAnalyzer;
  private readonly categoryPrompts: CategoryPromptProvider;
  private readonly download: (imageUrl: string) => Promise<Blob>;
  private readonly embeddings = new Map<string, number[]>();

  constructor(options: DevelopmentRelevanceOptions = {}) {
    const timeoutMs = options.timeoutMs ?? 8000;
    this.analyzer = options.analyzer ?? new TransformersClipContentAnalyzer(options.modelId, options.cacheDir);
    this.categoryPrompts = options.categoryPrompts ?? databaseCategoryPrompts;
    this.download = options.download ?? ((imageUrl) => downloadImage(imageUrl, timeoutMs));
  }

  async checkImageRelevance(imageUrl: string, categoryId: string): Promise<ImageRelevanceResult> {
    try {
      const categories = await this.categoryPrompts();
      const selectedIndex = categories.findIndex((category) => category.id === categoryId);
      if (selectedIndex < 0 || categories.length < 2) return { score: 0, pass: false, reason: "LOW_CONFIDENCE" };

      const image = await this.download(imageUrl);
      const categoryPrompts = categories.map((category) => `${category.name}: ${category.relevancePrompt}`);
      const prompts = [...categoryPrompts, ...unrelatedPrompts];
      const analysis = await this.analyzer.analyze(image, prompts);
      if (analysis.scores.length !== prompts.length || analysis.scores.some((score) => !Number.isFinite(score))) {
        return { score: 0, pass: false, reason: "LOW_CONFIDENCE" };
      }
      if (analysis.embedding.length > 0 && analysis.embedding.every(Number.isFinite)) {
        this.embeddings.set(imageUrl, analysis.embedding);
      }

      const selectedScore = analysis.scores[selectedIndex] ?? 0;
      const otherCategoryScores = analysis.scores.slice(0, categories.length).filter((_score, index) => index !== selectedIndex);
      const bestOtherCategory = Math.max(0, ...otherCategoryScores);
      const bestUnrelated = Math.max(0, ...analysis.scores.slice(categories.length));
      const strongestCompetitor = Math.max(bestOtherCategory, bestUnrelated);
      const confidence = relativeConfidence(selectedScore, strongestCompetitor);

      if (selectedScore >= strongestCompetitor) return { score: confidence, pass: true, reason: "MATCH" };
      const competitorConfidence = 1 - confidence;
      if (competitorConfidence < 0.6) return { score: confidence, pass: false, reason: "LOW_CONFIDENCE" };
      return {
        score: confidence,
        pass: false,
        reason: bestUnrelated >= bestOtherCategory ? "UNRELATED_CONTENT" : "CATEGORY_MISMATCH",
      };
    } catch (error) {
      console.warn("[images.relevance.local_clip] inference unavailable", {
        error: error instanceof Error ? error.message : "Unknown inference error",
      });
      return { score: 0, pass: false, reason: "LOW_CONFIDENCE" };
    }
  }

  async getImageEmbedding(imageUrl: string): Promise<number[] | null> {
    return this.embeddings.get(imageUrl) ?? null;
  }
}

export class UnavailableRelevanceService implements ImageRelevanceService {
  async checkImageRelevance(imageUrl: string, categoryId: string): Promise<ImageRelevanceResult> {
    void imageUrl;
    void categoryId;
    return { score: 0, pass: false, reason: "LOW_CONFIDENCE" };
  }

  async getImageEmbedding(imageUrl: string): Promise<null> {
    void imageUrl;
    return null;
  }
}

export function createImageRelevanceService(env: AppEnv): ImageRelevanceService {
  if (env.CLIP_MODE === "hosted" || env.CLIP_MODE === "auto" && env.CLIP_INFERENCE_URL) {
    if (!env.CLIP_INFERENCE_URL) throw new Error("CLIP_INFERENCE_URL is required for hosted CLIP mode");
    return new HostedClipRelevanceService(env.CLIP_INFERENCE_URL, env.CLIP_INFERENCE_TOKEN, env.CLIP_TIMEOUT_MS);
  }
  if (env.CLIP_MODE === "local_clip" || env.CLIP_MODE === "auto" && env.NODE_ENV !== "production") {
    return new DevelopmentRelevanceService({
      timeoutMs: env.CLIP_TIMEOUT_MS,
      modelId: env.CLIP_LOCAL_MODEL,
      cacheDir: env.CLIP_LOCAL_CACHE_DIR,
    });
  }
  // Legacy/no-model demo configuration is deliberately fail-closed.
  return new UnavailableRelevanceService();
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
