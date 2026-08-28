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

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function uint16BigEndian(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function uint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) * 0x1000000) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0)) >>> 0;
}

function reasonableDimensions(width: number, height: number): boolean {
  return width >= 160 && height >= 120 && width <= 20_000 && height <= 20_000 && width * height <= 100_000_000;
}

function jpegDimensions(bytes: Uint8Array): [number, number] | undefined {
  if (bytes.length < 6 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let hasEndMarker = false;
  for (let offset = Math.max(2, bytes.length - 4096); offset + 1 < bytes.length; offset += 1) {
    if (bytes[offset] === 0xff && bytes[offset + 1] === 0xd9) { hasEndMarker = true; break; }
  }
  if (!hasEndMarker) return undefined;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    const length = uint16BigEndian(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return undefined;
    if (startOfFrame.has(marker) && length >= 7) return [uint16BigEndian(bytes, offset + 5), uint16BigEndian(bytes, offset + 3)];
    offset += length;
  }
  return undefined;
}

function pngDimensions(bytes: Uint8Array): [number, number] | undefined {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 33 || !signature.every((byte, index) => bytes[index] === byte)) return undefined;
  if (uint32BigEndian(bytes, 8) !== 13 || ascii(bytes, 12, 16) !== "IHDR") return undefined;
  const dimensions: [number, number] = [uint32BigEndian(bytes, 16), uint32BigEndian(bytes, 20)];
  let offset = 8;
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = uint32BigEndian(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return undefined;
    const type = ascii(bytes, offset + 4, offset + 8);
    offset = end;
    if (type === "IEND") { ended = length === 0; break; }
  }
  return ended && offset === bytes.length ? dimensions : undefined;
}

function webpDimensions(bytes: Uint8Array): [number, number] | undefined {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WEBP") return undefined;
  const declaredSize = (bytes[4] ?? 0) | (bytes[5] ?? 0) << 8 | (bytes[6] ?? 0) << 16 | (bytes[7] ?? 0) << 24;
  if ((declaredSize >>> 0) + 8 !== bytes.length) return undefined;
  const kind = ascii(bytes, 12, 16);
  if (kind === "VP8X") {
    const width = 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16);
    const height = 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16);
    return [width, height];
  }
  if (kind === "VP8L" && bytes[20] === 0x2f) {
    const bits = (bytes[21] ?? 0) | ((bytes[22] ?? 0) << 8) | ((bytes[23] ?? 0) << 16) | ((bytes[24] ?? 0) << 24);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return [((bytes[26] ?? 0) | (bytes[27] ?? 0) << 8) & 0x3fff, ((bytes[28] ?? 0) | (bytes[29] ?? 0) << 8) & 0x3fff];
  }
  return undefined;
}

function heicDimensions(bytes: Uint8Array): [number, number] | undefined {
  if (bytes.length < 24 || ascii(bytes, 4, 8) !== "ftyp" || !["heic", "heix", "hevc", "mif1", "msf1"].includes(ascii(bytes, 8, 12))) return undefined;
  for (let offset = 4; offset + 16 <= bytes.length; offset += 1) {
    if (ascii(bytes, offset, offset + 4) === "ispe") return [uint32BigEndian(bytes, offset + 8), uint32BigEndian(bytes, offset + 12)];
  }
  return undefined;
}

export function inspectImageBytes(bytes: Uint8Array, contentType: string): boolean {
  let dimensions: [number, number] | undefined;
  if (contentType === "image/jpeg") dimensions = jpegDimensions(bytes);
  else if (contentType === "image/png") dimensions = pngDimensions(bytes);
  else if (contentType === "image/webp") dimensions = webpDimensions(bytes);
  else if (contentType === "image/heic") dimensions = heicDimensions(bytes);
  return Boolean(dimensions && reasonableDimensions(dimensions[0], dimensions[1]));
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

export function inspectUploadBytes(bytes: Uint8Array, contentType: string): boolean {
  const normalizedType = contentType.toLowerCase();
  if (!hasExpectedSignature(bytes, normalizedType)) return false;
  if (normalizedType === "application/pdf") {
    const tailStart = Math.max(0, bytes.length - 4096);
    return ascii(bytes, tailStart, bytes.length).includes("%%EOF");
  }
  return inspectImageBytes(bytes, normalizedType);
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
      const image = await this.request(this.sign("GET", objectKey));
      if (!image.ok) return false;
      const bytes = new Uint8Array(await image.arrayBuffer());
      return bytes.length === length && inspectUploadBytes(bytes, contentType);
    } catch {
      return false;
    }
  }
}
