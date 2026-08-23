import { describe, expect, it } from "vitest";
import { parseEnv } from "../config/env";
import { S3CompatibleStorage } from "./storage";

describe("Cloudflare R2 compatibility", () => {
  it("signs an R2 path-style PUT without changing the storage contract", () => {
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
    const storage = new S3CompatibleStorage(env, () => new Date("2026-08-24T10:00:00.000Z"));

    const upload = storage.createUpload("tickets/example/photo one.jpg", "image/jpeg");

    const uploadUrl = new URL(upload.uploadUrl);
    expect(uploadUrl.origin).toBe("https://account-id.r2.cloudflarestorage.com");
    expect(uploadUrl.pathname).toBe("/civicos-demo/tickets/example/photo%20one.jpg");
    expect(uploadUrl.searchParams.get("X-Amz-Credential")).toContain("/auto/s3/aws4_request");
    expect(uploadUrl.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(upload.publicUrl).toBe("https://pub-demo.r2.dev/tickets/example/photo%20one.jpg");
    expect(upload.headers).toEqual({ "Content-Type": "image/jpeg" });
  });
});
