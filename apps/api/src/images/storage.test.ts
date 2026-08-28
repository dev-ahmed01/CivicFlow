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
  it("signs an R2 path-style PUT without changing the storage contract", async () => {
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

    const upload = await storage.createUpload("tickets/example/photo one.jpg", "image/jpeg");

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
      .mockResolvedValueOnce(new Response(jpeg.buffer as ArrayBuffer, { status: 200, headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length) } }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length) } }))
      .mockResolvedValueOnce(new Response(jpeg.buffer as ArrayBuffer, { status: 200, headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length) } }));
    const storage = new S3CompatibleStorage(env, () => new Date("2026-08-24T10:00:00.000Z"), request);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(storage.verifyUpload("tickets/example/photo.jpg", "image/jpeg")).resolves.toBe(true);
    await expect(storage.verifyUpload("tickets/example/photo.jpg", "image/png")).resolves.toBe(false);
    expect(request).toHaveBeenCalledWith(expect.stringContaining("X-Amz-Signature="), { method: "HEAD" });
    expect(request).toHaveBeenCalledWith(expect.stringContaining("X-Amz-Signature="), { method: "GET" });
    warn.mockRestore();
  });
});

describe("Supabase Storage S3 compatibility", () => {
  const env = () => parseEnv({
    NODE_ENV: "production",
    DEPLOYMENT_PROFILE: "free_demo",
    DATABASE_URL: "postgresql://prisma:secret@pooler.supabase.com:5432/postgres",
    JWT_ACCESS_SECRET: "access-secret-that-is-at-least-32-characters",
    JWT_REFRESH_SECRET: "refresh-secret-that-is-at-least-32-characters",
    OTP_PROVIDER: "demo",
    DEMO_AUTH_MODE: "fixed_otp",
    DEMO_AUTH_CODE: "123456",
    S3_ENDPOINT: "https://project-ref.storage.supabase.co/storage/v1/s3",
    S3_REGION: "ap-southeast-1",
    S3_BUCKET: "civic-evidence",
    S3_ACCESS_KEY_ID: "supabase-access-key",
    S3_SECRET_ACCESS_KEY: "supabase-secret-key",
    S3_PUBLIC_BASE_URL: "https://project-ref.supabase.co/storage/v1/object/public/civic-evidence",
    CLIP_MODE: "demo_deterministic",
    CORS_ORIGINS: "https://civicos-demo.vercel.app",
  });

  it("generates an SDK-compatible path-style presigned PUT for the Supabase S3 endpoint", async () => {
    const storage = new S3CompatibleStorage(env(), () => new Date("2026-08-28T10:00:00.000Z"));

    const upload = await storage.createUpload("preflight/citizen/photo (1)!.jpg", "image/jpeg");
    const url = new URL(upload.uploadUrl);

    expect(url.origin).toBe("https://project-ref.storage.supabase.co");
    expect(url.pathname).toBe("/storage/v1/s3/civic-evidence/preflight/citizen/photo%20%281%29%21.jpg");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Credential")).toBe("supabase-access-key/20260828/ap-southeast-1/s3/aws4_request");
    expect(url.searchParams.get("X-Amz-Date")).toBe("20260828T100000Z");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-Content-Sha256")).toBe("UNSIGNED-PAYLOAD");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(url.searchParams.get("x-id")).toBe("PutObject");
    expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
    expect(upload.headers).toEqual({ "Content-Type": "image/jpeg" });
  });

  it("uses the same bucket path, region, and object-key encoding for PUT, HEAD, and GET", async () => {
    const jpeg = validJpeg();
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length) } }))
      .mockResolvedValueOnce(new Response(jpeg.buffer as ArrayBuffer, { status: 200, headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length) } }));
    const storage = new S3CompatibleStorage(env(), () => new Date("2026-08-28T10:00:00.000Z"), request);

    const objectKey = "preflight/citizen/photo (1)!.jpg";
    const upload = await storage.createUpload(objectKey, "image/jpeg");
    const putUrl = new URL(upload.uploadUrl);
    await expect(storage.verifyUpload(objectKey, "image/jpeg")).resolves.toBe(true);
    const headUrl = new URL(request.mock.calls[0]?.[0] as string);
    const getUrl = new URL(request.mock.calls[1]?.[0] as string);

    for (const url of [putUrl, headUrl, getUrl]) {
      expect(url.hostname).toBe("project-ref.storage.supabase.co");
      expect(url.pathname).toBe("/storage/v1/s3/civic-evidence/preflight/citizen/photo%20%281%29%21.jpg");
      expect(url.searchParams.get("X-Amz-Credential")).toContain("/ap-southeast-1/s3/aws4_request");
      expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(putUrl.searchParams.get("X-Amz-Content-Sha256")).toBe("UNSIGNED-PAYLOAD");
    expect(putUrl.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(upload.headers).toEqual({ "Content-Type": "image/jpeg" });
    expect(new Set([putUrl, headUrl, getUrl].map((url) => url.searchParams.get("X-Amz-Signature"))).size).toBe(3);
  });

  it("downloads and verifies the object even when the storage gateway rejects HEAD", async () => {
    const jpeg = validJpeg();
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(jpeg.buffer as ArrayBuffer, { status: 200, headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length) } }));
    const storage = new S3CompatibleStorage(env(), () => new Date("2026-08-28T10:00:00.000Z"), request);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(storage.verifyUpload("preflight/citizen/IMG_1234.jpg", "image/jpeg")).resolves.toBe(true);
    expect(request).toHaveBeenNthCalledWith(1, expect.any(String), { method: "HEAD" });
    expect(request).toHaveBeenNthCalledWith(2, expect.any(String), { method: "GET" });
    expect(warn).toHaveBeenCalledWith(
      "[storage.verifyUpload] HEAD check failed; GET verified the object",
      expect.objectContaining({
        failurePhase: "head_status",
        headStatus: 403,
        getStatus: 200,
        storageHost: "project-ref.storage.supabase.co",
        objectKey: "preflight/citizen/IMG_1234.jpg",
        contentType: "image/jpeg",
        contentLength: jpeg.length,
      }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("X-Amz-");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("supabase-secret-key");
    warn.mockRestore();
  });

  it("rejects a failed GET and logs safe phase/status diagnostics", async () => {
    const jpeg = validJpeg();
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length) } }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    const storage = new S3CompatibleStorage(env(), () => new Date("2026-08-28T10:00:00.000Z"), request);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(storage.verifyUpload("preflight/citizen/IMG_1234.jpg", "image/jpeg")).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "[storage.verifyUpload] verification failed",
      expect.objectContaining({
        failurePhase: "get_status",
        headStatus: 200,
        getStatus: 403,
        storageHost: "project-ref.storage.supabase.co",
        objectKey: "preflight/citizen/IMG_1234.jpg",
        contentType: "image/jpeg",
        contentLength: jpeg.length,
      }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("X-Amz-");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("supabase-secret-key");
    warn.mockRestore();
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
