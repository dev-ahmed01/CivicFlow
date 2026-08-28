import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "../config/env";
import { cosineSimilarity, createImageRelevanceService, decideImageRelevance, DevelopmentRelevanceService, HostedClipRelevanceService } from "./relevance";

afterEach(() => vi.unstubAllGlobals());

describe("cosineSimilarity", () => {
  it("recognizes aligned and orthogonal image embeddings", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
});

describe("free-demo relevance", () => {
  it("only enables deterministic relevance through an explicit free-demo profile", () => {
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
      CLIP_MODE: "demo_deterministic",
      CORS_ORIGINS: "https://civicos-demo.vercel.app",
    });
    expect(createImageRelevanceService(env)).toBeInstanceOf(DevelopmentRelevanceService);
  });

  const service = new DevelopmentRelevanceService();
  const roadDamage = "30000000-0000-4000-8000-000000000001";
  const waterSupply = "30000000-0000-4000-8000-000000000003";
  const garbage = "30000000-0000-4000-8000-000000000005";

  it.each([
    ["pothole-road-damage.jpg", roadDamage],
    ["overflowing-garbage-bin.jpg", garbage],
    ["water-leak-burst-pipe.jpg", waterSupply],
  ])("accepts descriptive seeded-category evidence: %s", async (fileName, categoryId) => {
    expect(await service.checkImageRelevance(`https://images.example.com/${fileName}`, categoryId))
      .toMatchObject({ pass: true, score: 1, reason: "MATCH" });
  });

  it.each(["selfie.jpg", "portrait.png", "food.jpg", "reaction-meme.webp", "random-screenshot.png", "blank-image.jpg"])("rejects explicitly unrelated evidence: %s", async (fileName) => {
    expect(await service.checkImageRelevance(`https://images.example.com/${fileName}`, roadDamage))
      .toMatchObject({ pass: false, reason: "UNRELATED_CONTENT" });
  });

  it("does not enforce filename-based category matching in demo mode", async () => {
    expect(await service.checkImageRelevance("https://images.example.com/garbage-pile.jpg", roadDamage))
      .toMatchObject({ pass: true, reason: "MATCH" });
  });

  it.each(["IMG_1234.jpg", "DSC_1234.jpg", "PXL_20260828.jpg", "camera_001.jpg", "gallery-image-42.jpg"])("accepts an ordinary camera/gallery filename: %s", async (fileName) => {
    const result = await service.checkImageRelevance(`https://images.example.com/${fileName}`, roadDamage);
    expect(decideImageRelevance(result, 0.6)).toEqual({ relevant: true, confidence: 1, reason: "MATCH" });
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
