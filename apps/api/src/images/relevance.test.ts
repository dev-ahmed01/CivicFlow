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
      .toMatchObject({ pass: true, score: 0.93, reason: "MATCH" });
  });

  it.each(["selfie.jpg", "indoor-room.png", "food-and-pet.jpg", "random-screenshot.png"])("rejects unrelated evidence: %s", async (fileName) => {
    expect(await service.checkImageRelevance(`https://images.example.com/${fileName}`, roadDamage))
      .toMatchObject({ pass: false, reason: "UNRELATED_CONTENT" });
  });

  it("rejects a relevant civic image filed under the wrong category", async () => {
    expect(await service.checkImageRelevance("https://images.example.com/garbage-pile.jpg", roadDamage))
      .toMatchObject({ pass: false, reason: "CATEGORY_MISMATCH" });
  });

  it("sends unknown camera filenames to a recoverable low-confidence retake", async () => {
    const result = await service.checkImageRelevance("https://images.example.com/IMG_2048.jpg", roadDamage);
    expect(decideImageRelevance(result, 0.6)).toEqual({ relevant: false, confidence: 0.42, reason: "LOW_CONFIDENCE" });
  });
});

describe("hosted relevance reliability", () => {
  it("aborts an inference request at the configured deadline", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    })));
    const service = new HostedClipRelevanceService("https://clip.example.com/infer", undefined, 5);
    await expect(service.checkImageRelevance("https://images.example.com/photo.jpg", "category-1")).rejects.toBeDefined();
  });
});
