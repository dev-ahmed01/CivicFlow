import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "../config/env";
import { inspectImageBytes, inspectUploadBytes, S3CompatibleStorage } from "./storage";

function validJpeg(width = 640, height = 480): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    height >> 8, height & 0xff, width >> 8, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

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
    expect(new URL(storage.createDownload("tickets/example/photo one.jpg")).searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("only confirms an uploaded object when its stored type and size are valid", async () => {
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
    const jpeg = validJpeg();
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length) } }))
      .mockResolvedValueOnce(new Response(jpeg.buffer as ArrayBuffer, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length) } }));
    const storage = new S3CompatibleStorage(env, () => new Date("2026-08-24T10:00:00.000Z"), request);

    await expect(storage.verifyUpload("tickets/example/photo.jpg", "image/jpeg")).resolves.toBe(true);
    await expect(storage.verifyUpload("tickets/example/photo.jpg", "image/png")).resolves.toBe(false);
    expect(request).toHaveBeenCalledWith(expect.stringContaining("X-Amz-Signature="), { method: "HEAD" });
    expect(request).toHaveBeenCalledWith(expect.stringContaining("X-Amz-Signature="));
  });
});

describe("uploaded image integrity", () => {
  it("accepts a structurally complete image with reasonable dimensions", () => {
    expect(inspectImageBytes(validJpeg(), "image/jpeg")).toBe(true);
  });

  it("rejects a corrupted image", () => {
    expect(inspectImageBytes(validJpeg().slice(0, -2), "image/jpeg")).toBe(false);
  });

  it("rejects an empty file", () => {
    expect(inspectImageBytes(new Uint8Array(), "image/jpeg")).toBe(false);
  });

  it("rejects an unsupported MIME type", () => {
    expect(inspectImageBytes(validJpeg(), "image/gif")).toBe(false);
  });
});

describe("shared upload integrity", () => {
  it("preserves structurally complete Project Head PDF uploads", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
    expect(inspectUploadBytes(pdf, "application/pdf")).toBe(true);
  });

  it("rejects a truncated PDF", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>");
    expect(inspectUploadBytes(pdf, "application/pdf")).toBe(false);
  });
});
