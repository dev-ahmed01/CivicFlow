import { createHash, createHmac } from "node:crypto";
import type { AppEnv } from "../config/env";

export interface PresignedUpload {
  uploadUrl: string;
  publicUrl: string;
  headers: { "Content-Type": string };
  expiresInSeconds: number;
}

export interface ImageStorage {
  createUpload(objectKey: string, contentType: string): PresignedUpload;
  createDownload(objectKey: string): string;
  verifyUpload(objectKey: string, contentType: string): Promise<boolean>;
}

export function storageReadUrl(storage: ImageStorage, objectKey: string, legacyUrl: string): string {
  return objectKey.startsWith("demo/") ? legacyUrl : storage.createDownload(objectKey);
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function hasExpectedSignature(bytes: Uint8Array, contentType: string): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (contentType === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (contentType === "image/heic") return ascii(4, 8) === "ftyp" && ["heic", "heix", "hevc", "mif1", "msf1"].includes(ascii(8, 12));
  if (contentType === "application/pdf") return ascii(0, 5) === "%PDF-";
  return false;
}

export class S3CompatibleStorage implements ImageStorage {
  constructor(
    private readonly env: AppEnv,
    private readonly now = () => new Date(),
    private readonly request = fetch,
  ) {}

  private sign(method: "GET" | "HEAD" | "PUT", objectKey: string, expiresInSeconds = 900): string {
    const endpoint = new URL(this.env.S3_ENDPOINT);
    const instant = this.now().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = instant.slice(0, 8);
    const scope = `${date}/${this.env.S3_REGION}/s3/aws4_request`;
    const credential = `${this.env.S3_ACCESS_KEY_ID}/${scope}`;
    const canonicalUri = `${endpoint.pathname.replace(/\/$/, "")}/${encodeURIComponent(this.env.S3_BUCKET)}/${encodePath(objectKey)}`;
    const query = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": credential,
      "X-Amz-Date": instant,
      "X-Amz-Expires": String(expiresInSeconds),
      "X-Amz-SignedHeaders": "host",
    });
    query.sort();
    const canonicalRequest = [method, canonicalUri, query.toString(), `host:${endpoint.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", instant, scope, hash(canonicalRequest)].join("\n");
    const dateKey = hmac(`AWS4${this.env.S3_SECRET_ACCESS_KEY}`, date);
    const regionKey = hmac(dateKey, this.env.S3_REGION);
    const serviceKey = hmac(regionKey, "s3");
    const signingKey = hmac(serviceKey, "aws4_request");
    query.set("X-Amz-Signature", createHmac("sha256", signingKey).update(stringToSign).digest("hex"));
    return `${endpoint.origin}${canonicalUri}?${query.toString()}`;
  }

  createUpload(objectKey: string, contentType: string): PresignedUpload {
    return {
      uploadUrl: this.sign("PUT", objectKey),
      // This stable object reference is persisted, but never returned as an
      // authorization mechanism. API responses use createDownload instead.
      publicUrl: `${this.env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${encodePath(objectKey)}`,
      headers: { "Content-Type": contentType },
      expiresInSeconds: 900,
    };
  }

  createDownload(objectKey: string): string {
    return this.sign("GET", objectKey);
  }

  async verifyUpload(objectKey: string, contentType: string): Promise<boolean> {
    try {
      const response = await this.request(this.sign("HEAD", objectKey), { method: "HEAD" });
      const actualType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      const length = Number(response.headers.get("content-length"));
      const metadataValid = response.ok
        && actualType === contentType.toLowerCase()
        && Number.isFinite(length)
        && length > 0
        && length <= 20 * 1024 * 1024;
      if (!metadataValid) return false;
      const sample = await this.request(this.sign("GET", objectKey), { headers: { Range: "bytes=0-15" } });
      if (!sample.ok) return false;
      return hasExpectedSignature(new Uint8Array(await sample.arrayBuffer()), contentType.toLowerCase());
    } catch {
      return false;
    }
  }
}
