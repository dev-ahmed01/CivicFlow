import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "../config/env";
import {
  cosineSimilarity,
  createImageRelevanceService,
  decideImageRelevance,
  DevelopmentRelevanceService,
  HostedClipRelevanceService,
  type ClipContentAnalyzer,
  type CategoryRelevancePrompt,
  UnavailableRelevanceService,
} from "./relevance";

afterEach(() => vi.unstubAllGlobals());

describe("cosineSimilarity", () => {
  it("recognizes aligned and orthogonal image embeddings", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
});

describe("free-demo relevance", () => {
  const roadDamage = "30000000-0000-4000-8000-000000000001";
  const garbage = "30000000-0000-4000-8000-000000000005";
  const categories: CategoryRelevancePrompt[] = [
    { id: roadDamage, name: "Road Damage", relevancePrompt: "a pothole, damaged road, cracked pavement, or broken asphalt" },
    { id: garbage, name: "Garbage/Waste", relevancePrompt: "dumped garbage, litter, an overflowing trash bin, or solid waste" },
  ];

  function testAnalyzer(): ClipContentAnalyzer {
    return {
      async analyze(image, prompts) {
        const pixels = await image.text();
        const winningPrompt = pixels.includes("pothole") ? 0
          : pixels.includes("garbage") ? 1
            : pixels.includes("wall") ? 2
              : 3;
        return {
          scores: prompts.map((_prompt, index) => index === winningPrompt ? 0.82 : 0.03),
          embedding: pixels.includes("pothole") ? [1, 0] : [0, 1],
        };
      },
    };
  }

  function serviceForPixels(pixels: string): DevelopmentRelevanceService {
    return new DevelopmentRelevanceService({
      analyzer: testAnalyzer(),
      categoryPrompts: async () => categories,
      download: async () => new Blob([pixels], { type: "image/jpeg" }),
    });
  }

  it("enables local CLIP through the explicit free-demo profile", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      DEPLOYMENT_PROFILE: "free_demo",
      DATABASE_URL: "postgresql://prisma:secret@pooler.supabase.com:5432/postgres",
      JWT_ACCESS_SECRET: "access-secret-that-is-at-least-32-characters",
      JWT_REFRESH_SECRET: "refresh-secret-that-is-at-least-32-characters",
      OTP_PROVIDER: "demo",
      DEMO_AUTH_MODE: "fixed_otp",
      DEMO_AUTH_CODE: "123456",
      S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
      S3_REGION: "auto",
      S3_BUCKET: "civicos-demo",
      S3_ACCESS_KEY_ID: "r2-access-key",
      S3_SECRET_ACCESS_KEY: "r2-secret-key",
      S3_PUBLIC_BASE_URL: "https://pub-demo.r2.dev",
      CLIP_MODE: "local_clip",
      CORS_ORIGINS: "https://civicos-demo.vercel.app",
    });
    expect(createImageRelevanceService(env)).toBeInstanceOf(DevelopmentRelevanceService);
  });

  it("accepts pothole pixels for the pothole/road-damage category", async () => {
    const service = serviceForPixels("decoded pixels of a pothole from a distant camera angle");
    const result = await service.checkImageRelevance("https://images.example.com/IMG_1234.jpg", roadDamage);
    expect(decideImageRelevance(result, 0.6)).toMatchObject({ relevant: true, reason: "MATCH" });
    await expect(service.getImageEmbedding("https://images.example.com/IMG_1234.jpg")).resolves.toEqual([1, 0]);
  });

  it("rejects wall pixels for the pothole/road-damage category", async () => {
    const result = await serviceForPixels("decoded pixels of a plain indoor wall")
      .checkImageRelevance("https://images.example.com/IMG_1234.jpg", roadDamage);
    expect(result).toMatchObject({ pass: false, reason: "UNRELATED_CONTENT" });
  });

  it("accepts garbage pixels for the garbage category", async () => {
    const result = await serviceForPixels("decoded pixels of dumped garbage and an overflowing bin")
      .checkImageRelevance("https://images.example.com/camera_001.jpg", garbage);
    expect(decideImageRelevance(result, 0.6)).toMatchObject({ relevant: true, reason: "MATCH" });
  });

  it("rejects selfie pixels for the garbage category", async () => {
    const result = await serviceForPixels("decoded pixels of a selfie portrait")
      .checkImageRelevance("https://images.example.com/garbage-evidence.jpg", garbage);
    expect(result).toMatchObject({ pass: false, reason: "UNRELATED_CONTENT" });
  });

  it("returns a category mismatch when another configured civic category wins", async () => {
    const result = await serviceForPixels("decoded pixels of dumped garbage")
      .checkImageRelevance("https://images.example.com/IMG_9999.jpg", roadDamage);
    expect(result).toMatchObject({ pass: false, reason: "CATEGORY_MISMATCH" });
  });

  it("never uses a generic camera filename as the decision signal", async () => {
    const pothole = await serviceForPixels("decoded pixels of a pothole")
      .checkImageRelevance("https://images.example.com/IMG_0001.jpg", roadDamage);
    const wall = await serviceForPixels("decoded pixels of a plain indoor wall")
      .checkImageRelevance("https://images.example.com/IMG_0001.jpg", roadDamage);
    expect(pothole.reason).toBe("MATCH");
    expect(wall.reason).toBe("UNRELATED_CONTENT");
  });

  it("fails closed with low confidence when no real model is configured", async () => {
    const service = new UnavailableRelevanceService();
    await expect(service.checkImageRelevance("https://images.example.com/IMG_0001.jpg", roadDamage))
      .resolves.toEqual({ score: 0, pass: false, reason: "LOW_CONFIDENCE" });
  });

  it("fails closed when local model inference cannot run", async () => {
    const service = new DevelopmentRelevanceService({
      analyzer: { async analyze() { throw new Error("model unavailable"); } },
      categoryPrompts: async () => categories,
      download: async () => new Blob(["pixels"], { type: "image/jpeg" }),
    });
    await expect(service.checkImageRelevance("https://images.example.com/IMG_0001.jpg", roadDamage))
      .resolves.toEqual({ score: 0, pass: false, reason: "LOW_CONFIDENCE" });
  });
});

describe("hosted relevance reliability", () => {
  it("preserves hosted content-analysis decisions and category context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ pass: false, score: 0.18, reason: "CATEGORY_MISMATCH", embedding: [0.2, 0.8] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new HostedClipRelevanceService("https://clip.example.com/infer", "hosted-token", 5000);
    await expect(service.checkImageRelevance("https://images.example.com/IMG_1234.jpg", "category-1"))
      .resolves.toEqual({ pass: false, score: 0.18, reason: "CATEGORY_MISMATCH" });
    expect(fetchMock).toHaveBeenCalledWith("https://clip.example.com/infer", expect.objectContaining({
      body: JSON.stringify({ imageUrl: "https://images.example.com/IMG_1234.jpg", categoryId: "category-1" }),
    }));
    await expect(service.getImageEmbedding("https://images.example.com/IMG_1234.jpg")).resolves.toEqual([0.2, 0.8]);
  });

  it("aborts an inference request at the configured deadline", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    })));
    const service = new HostedClipRelevanceService("https://clip.example.com/infer", undefined, 5);
    await expect(service.checkImageRelevance("https://images.example.com/photo.jpg", "category-1")).rejects.toBeDefined();
  });
});
