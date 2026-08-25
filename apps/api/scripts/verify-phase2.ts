import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import request from "supertest";
import { prisma } from "db";
import { createApp } from "../src/app";
import type { ImageRelevanceService } from "../src/images/relevance";
import type { ImageStorage } from "../src/images/storage";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";

const titlePrefix = "[Phase 2 verification]";
const streetlightId = "30000000-0000-4000-8000-000000000002";
const citizenOne = "40000000-0000-4000-8000-000000000001";
const citizenTwo = "40000000-0000-4000-8000-000000000002";

class AcceptanceRelevance implements ImageRelevanceService {
  private checks = 0;
  async checkImageRelevance() {
    this.checks += 1;
    return this.checks <= 3 ? { score: 0.12, pass: false } : { score: 0.93, pass: true };
  }
  async getImageEmbedding() { return [1, 0, 0, 1]; }
}

const storage: ImageStorage = {
  createUpload(objectKey, contentType) {
    return {
      uploadUrl: `https://uploads.example.test/${objectKey}`,
      publicUrl: `https://images.example.test/${objectKey}`,
      headers: { "Content-Type": contentType },
      expiresInSeconds: 900,
    };
  },
};

function token(userId: string): string {
  return jwt.sign({ role: "CITIZEN", agencyId: null, wardId: null, mustResetPassword: false, tokenType: "access" }, process.env.JWT_ACCESS_SECRET!, {
    subject: userId, expiresIn: "15m", issuer: "civicos-api", audience: "civicos-clients",
  });
}

async function createDraft(app: ReturnType<typeof createApp>, auth: string, suffix: string, latitude: number, longitude: number) {
  return request(app).post("/tickets").set("Authorization", `Bearer ${auth}`).send({
    categoryId: streetlightId,
    title: `${titlePrefix} ${suffix}`,
    address: "11th Main Road, Jayanagar, Bengaluru",
    latitude,
    longitude,
    primaryImage: { fileName: "pothole.jpg", contentType: "image/jpeg" },
  }).expect(201);
}

async function cleanup(): Promise<void> {
  const tickets = await prisma.ticket.findMany({ where: { title: { startsWith: titlePrefix } }, select: { id: true } });
  for (const ticket of tickets) {
    await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'ticketId' = ${ticket.id}`;
  }
  await prisma.ticket.deleteMany({ where: { title: { startsWith: titlePrefix } } });
  await prisma.$executeRaw`
    DELETE FROM "Notification" n
    WHERE n."type" = 'VALIDATION_REQUEST'
      AND NOT EXISTS (SELECT 1 FROM "Ticket" t WHERE t."id"::text = n."payload"->>'ticketId')
  `;
}

async function main(): Promise<void> {
  await cleanup();
  const app = createApp({ imageRelevance: new AcceptanceRelevance(), imageStorage: storage, otpProvider: { async sendOtp() {} } });
  try {
    const reportingAreas = await request(app).get("/reporting-areas").set("Authorization", `Bearer ${token(citizenOne)}`).expect(200);
    const jayanagar = reportingAreas.body.areas.find((area: { name: string }) => area.name === "Jayanagar") as { id: string; latitude: number; longitude: number } | undefined;
    assert.ok(jayanagar, "configured Jayanagar reporting area must be available to citizens");
    const resolved = await request(app).post("/reporting-areas/resolve").set("Authorization", `Bearer ${token(citizenOne)}`).send({ latitude: jayanagar.latitude, longitude: jayanagar.longitude }).expect(200);
    assert.equal(resolved.body.area.id, jayanagar.id);
    await request(app).post("/reporting-areas/resolve").set("Authorization", `Bearer ${token(citizenOne)}`).send({ latitude: 0, longitude: 0 }).expect(422);

    const first = await createDraft(app, token(citizenOne), "first", 12.9299, 77.5844);
    let imageId = first.body.imageId as string;
    const ticketId = first.body.ticketId as string;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (attempt > 1) {
        const presigned = await request(app).post(`/tickets/${ticketId}/images`).set("Authorization", `Bearer ${token(citizenOne)}`).send({ action: "presign", fileName: `pothole-${attempt}.jpg`, contentType: "image/jpeg", isPrimary: true }).expect(201);
        imageId = presigned.body.imageId as string;
      }
      const completed = await request(app).post(`/tickets/${ticketId}/images`).set("Authorization", `Bearer ${token(citizenOne)}`).send({ action: "complete", imageId }).expect(200);
      if (attempt < 3) assert.equal(completed.body.needsRetake, true);
      else {
        assert.equal(completed.body.needsRetake, false);
        assert.equal(completed.body.ticket.id, ticketId);
        assert.match(completed.body.ticket.referenceNumber, /^\d{9,}$/);
        assert.equal(completed.body.ticket.manualReviewRecommended, true);
      }
    }

    // Regression: an accepted nearby observation must recover a shared ticket that
    // was left in the AI stage instead of returning a false submission success.
    await prisma.ticket.update({ where: { id: ticketId }, data: { state: "AI_CHECK_PENDING" } });
    const second = await createDraft(app, token(citizenTwo), "second", 12.9300, 77.5845);
    const shared = await request(app).post(`/tickets/${second.body.ticketId}/images`).set("Authorization", `Bearer ${token(citizenTwo)}`).send({ action: "complete", imageId: second.body.imageId }).expect(200);
    assert.equal(shared.body.ticket.id, ticketId);
    assert.equal(shared.body.ticket.status, "COMMUNITY_REVIEW");
    assert.equal(shared.body.ticket.observationCount, 2);
    assert.equal("state" in shared.body.ticket, false);

    const list = await request(app).get("/citizens/me/tickets?filter=ongoing").set("Authorization", `Bearer ${token(citizenTwo)}`).expect(200);
    assert.equal(list.body.tickets.some((ticket: { id: string }) => ticket.id === ticketId), true);
    assert.equal(list.body.tickets.every((ticket: Record<string, unknown>) => !("state" in ticket) && typeof ticket.statusLabel === "string"), true);
    const observationCount = await prisma.observation.count({ where: { ticketId } });
    assert.equal(observationCount, 2);
    const recovered = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { state: true, validationRequests: { select: { id: true } } } });
    assert.equal(recovered.state, "PENDING_VALIDATION");
    assert.ok(recovered.validationRequests.length > 0);
    console.log("Phase 2 acceptance verified: ticket numbering, configured reporting areas, retake cap, stalled shared-ticket recovery, community verification handoff, observation count, and simplified citizen states.");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
