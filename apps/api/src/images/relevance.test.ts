import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "../config/env";
import { cosineSimilarity, createImageRelevanceService, DevelopmentRelevanceService, HostedClipRelevanceService } from "./relevance";

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
