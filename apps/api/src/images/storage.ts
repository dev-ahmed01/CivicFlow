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

export class S3CompatibleStorage implements ImageStorage {
  constructor(private readonly env: AppEnv, private readonly now = () => new Date()) {}

  createUpload(objectKey: string, contentType: string): PresignedUpload {
    const endpoint = new URL(this.env.S3_ENDPOINT);
    const expiresInSeconds = 900;
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
    const canonicalRequest = ["PUT", canonicalUri, query.toString(), `host:${endpoint.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", instant, scope, hash(canonicalRequest)].join("\n");
    const dateKey = hmac(`AWS4${this.env.S3_SECRET_ACCESS_KEY}`, date);
    const regionKey = hmac(dateKey, this.env.S3_REGION);
    const serviceKey = hmac(regionKey, "s3");
    const signingKey = hmac(serviceKey, "aws4_request");
    query.set("X-Amz-Signature", createHmac("sha256", signingKey).update(stringToSign).digest("hex"));

    return {
      uploadUrl: `${endpoint.origin}${canonicalUri}?${query.toString()}`,
      publicUrl: `${this.env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${encodePath(objectKey)}`,
      headers: { "Content-Type": contentType },
      expiresInSeconds,
    };
  }
}
