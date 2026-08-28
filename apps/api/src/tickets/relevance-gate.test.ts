import jwt from "jsonwebtoken";
import request from "supertest";
import { prisma } from "db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import type { ImageRelevanceService } from "../images/relevance";
import type { ImageStorage } from "../images/storage";

const accessSecret = "test-access-secret-that-is-at-least-32-characters";
const citizenId = "40000000-0000-4000-8000-000000000001";
const categoryId = "30000000-0000-4000-8000-000000000001";
process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
process.env.JWT_ACCESS_SECRET = accessSecret;
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-that-is-at-least-32-characters";

function accessToken() {
  return jwt.sign(
    { role: "CITIZEN", agencyId: null, wardId: null, mustResetPassword: false, tokenType: "access" },
    accessSecret,
    { subject: citizenId, expiresIn: "15m", issuer: "civicos-api", audience: "civicos-clients" },
  );
}

const storage: ImageStorage = {
  createUpload: (objectKey, contentType) => ({ uploadUrl: "https://upload.example.com", publicUrl: `https://images.example.com/${objectKey}`, headers: { "Content-Type": contentType }, expiresInSeconds: 900 }),
  createDownload: (objectKey) => `https://images.example.com/${objectKey}`,
  verifyUpload: async () => true,
};

function relevance(pass: boolean, score: number, reason: "MATCH" | "UNRELATED_CONTENT"): ImageRelevanceService {
  return {
    async checkImageRelevance() { return { pass, score, reason }; },
    async getImageEmbedding() { return [1, 0]; },
  };
}

describe("pre-ticket image relevance gate", () => {
  beforeEach(() => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({ id: citizenId, role: "CITIZEN", agencyId: null, wardId: null, mustResetPassword: false } as never);
    vi.spyOn(prisma.category, "findUnique").mockResolvedValue({ id: categoryId } as never);
    vi.spyOn(prisma.adminConfig, "findUnique").mockResolvedValue({ key: "ai_relevance.pass_threshold", value: 0.6 } as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it("rejects unrelated evidence without creating tickets, invitations, or routing work", async () => {
    const executeRaw = vi.spyOn(prisma, "$executeRaw");
    const invitations = vi.spyOn(prisma.validationRequest, "createMany");
    const projects = vi.spyOn(prisma.project, "create");
    const app = createApp({ imageRelevance: relevance(false, 0.04, "UNRELATED_CONTENT"), imageStorage: storage, otpProvider: { async sendOtp() {} } });
    const response = await request(app)
      .post("/tickets/image-relevance")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ action: "complete", categoryId, objectKey: `preflight/${citizenId}/selfie.jpg`, fileName: "selfie.jpg", contentType: "image/jpeg", attempt: 1 })
      .expect(200);
    expect(response.body).toMatchObject({ relevant: false, reason: "UNRELATED_CONTENT" });
    expect(executeRaw).not.toHaveBeenCalled();
    expect(invitations).not.toHaveBeenCalled();
    expect(projects).not.toHaveBeenCalled();
  });

  it("issues a category-bound validation token only for relevant evidence", async () => {
    const app = createApp({ imageRelevance: relevance(true, 0.94, "MATCH"), imageStorage: storage, otpProvider: { async sendOtp() {} } });
    const response = await request(app)
      .post("/tickets/image-relevance")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ action: "complete", categoryId, objectKey: `preflight/${citizenId}/pothole-road.jpg`, fileName: "pothole-road.jpg", contentType: "image/jpeg", attempt: 1 })
      .expect(200);
    expect(response.body).toMatchObject({ relevant: true, reason: "MATCH", confidence: 0.94 });
    expect(response.body.validationToken).toEqual(expect.any(String));
  });

  it("returns a recoverable API error when the relevance service fails", async () => {
    const failing: ImageRelevanceService = {
      async checkImageRelevance() { throw new Error("inference unavailable"); },
      async getImageEmbedding() { return null; },
    };
    const app = createApp({ imageRelevance: failing, imageStorage: storage, otpProvider: { async sendOtp() {} } });
    const response = await request(app)
      .post("/tickets/image-relevance")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ action: "complete", categoryId, objectKey: `preflight/${citizenId}/pothole-road.jpg`, fileName: "pothole-road.jpg", contentType: "image/jpeg", attempt: 1 })
      .expect(502);
    expect(response.body.error).toBe("We could not check this photo right now. Please try again.");
  });
});
