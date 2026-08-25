import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { ProjectState, TicketState, prisma } from "db";
import { createApp } from "../src/app";
import type { ImageRelevanceService } from "../src/images/relevance";
import type { ImageStorage } from "../src/images/storage";
import { enterPendingValidation } from "../src/validations/service";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";

const titlePrefix = "[Phase 4 acceptance]";
const reporterId = "40000000-0000-4000-8000-000000000001";
const validatorId = (number: number) => `41000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const roadCategoryId = "30000000-0000-4000-8000-000000000001";
const streetlightCategoryId = "30000000-0000-4000-8000-000000000002";
const jayanagarWardId = "10000000-0000-4000-8000-000000000004";
const pwdAgencyId = "20000000-0000-4000-8000-000000000003";
const bwssbAgencyId = "20000000-0000-4000-8000-000000000001";
const pwdEngineerId = "40000000-0000-4000-8000-000000000201";

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
const relevance: ImageRelevanceService = {
  async checkImageRelevance() { return { pass: true, score: 0.99 }; },
  async getImageEmbedding() { return null; },
};

function citizenToken(userId: string): string {
  return jwt.sign({ role: "CITIZEN", agencyId: null, wardId: jayanagarWardId, mustResetPassword: false, tokenType: "access" }, process.env.JWT_ACCESS_SECRET!, {
    subject: userId, expiresIn: "15m", issuer: "civicos-api", audience: "civicos-clients",
  });
}

async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const response = await request(app).post("/auth/internal/login").send({ email, password: "CivicOS@123" }).expect(200);
  return response.body.accessToken as string;
}

async function createPendingTicket(suffix: string): Promise<string> {
  const ticketId = randomUUID();
  const observationId = randomUUID();
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "coordinates", "wardId", "state", "title", "address", "createdAt")
      VALUES (${ticketId}::uuid, ${roadCategoryId}::uuid, ${reporterId}::uuid,
        ST_SetSRID(ST_MakePoint(77.5844, 12.9290), 4326), ${jayanagarWardId}::uuid,
        ${TicketState.AI_CHECK_PENDING}::"TicketState", ${`${titlePrefix} ${suffix}`}, 'Jayanagar, Bengaluru', NOW())
    `;
    await transaction.observation.create({
      data: { id: observationId, ticketId, submitterId: reporterId, imageUrl: `https://images.example.test/${ticketId}.jpg` },
    });
    await transaction.image.create({
      data: { observationId, url: `https://images.example.test/${ticketId}.jpg`, objectKey: `phase4/${ticketId}.jpg`, isPrimary: true, uploadedAt: new Date() },
    });
    await enterPendingValidation(transaction, ticketId, TicketState.AI_CHECK_PENDING);
  });
  return ticketId;
}

async function validate(app: ReturnType<typeof createApp>, ticketId: string): Promise<void> {
  for (let index = 1; index <= 3; index += 1) {
    await request(app).post(`/tickets/${ticketId}/validate`).set("Authorization", `Bearer ${citizenToken(validatorId(index))}`).send({ vote: "CONFIRM" }).expect(200);
  }
}

async function cleanup(): Promise<void> {
  const tickets = await prisma.ticket.findMany({ where: { title: { startsWith: titlePrefix } }, select: { id: true, project: { select: { id: true } } } });
  const ticketIds = tickets.map((ticket) => ticket.id);
  const projectIds = tickets.flatMap((ticket) => ticket.project ? [ticket.project.id] : []);
  if (projectIds.length > 0) await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  for (const ticketId of ticketIds) {
    await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'ticketId' = ${ticketId}`;
  }
  if (ticketIds.length > 0) await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
}

async function main(): Promise<void> {
  await cleanup();
  const app = createApp({ otpProvider: { async sendOtp() {} }, imageRelevance: relevance, imageStorage: storage });
  const [pwdToken, bwssbToken, adminToken] = await Promise.all([
    login(app, "head.pwd@civicos.local"),
    login(app, "head.bwssb@civicos.local"),
    login(app, "admin@civicos.local"),
  ]);
  try {
    const initiallyRouted = await createPendingTicket("primary route");
    await validate(app, initiallyRouted);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: initiallyRouted } })).assignedAgencyId, pwdAgencyId);

    await request(app).patch(`/admin/categories/${roadCategoryId}/routing`).set("Authorization", `Bearer ${adminToken}`).send({ primaryAgencyId: bwssbAgencyId }).expect(200);
    const rerouted = await createPendingTicket("changed route");
    await validate(app, rerouted);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: rerouted } })).assignedAgencyId, bwssbAgencyId);
    const pwdQueue = await request(app).get("/tickets").set("Authorization", `Bearer ${pwdToken}`).expect(200);
    const bwssbQueue = await request(app).get("/tickets").set("Authorization", `Bearer ${bwssbToken}`).expect(200);
    assert.equal(pwdQueue.body.tickets.some((ticket: { id: string }) => ticket.id === initiallyRouted), true);
    assert.equal(pwdQueue.body.tickets.some((ticket: { id: string }) => ticket.id === rerouted), false);
    assert.equal(bwssbQueue.body.tickets.some((ticket: { id: string }) => ticket.id === rerouted), true);
    assert.equal(bwssbQueue.body.tickets.some((ticket: { id: string }) => ticket.id === initiallyRouted), false);
    await request(app).get(`/tickets/${rerouted}`).set("Authorization", `Bearer ${pwdToken}`).expect(404);
    await request(app).get(`/tickets/${rerouted}`).set("Authorization", `Bearer ${bwssbToken}`).expect(200);
    await request(app).patch(`/admin/categories/${roadCategoryId}/routing`).set("Authorization", `Bearer ${adminToken}`).send({ primaryAgencyId: pwdAgencyId }).expect(200);

    const agencyTicket = await request(app).post("/tickets/agency-originated").set("Authorization", `Bearer ${pwdToken}`).send({
      action: "create",
      categoryId: streetlightCategoryId,
      wardId: jayanagarWardId,
      description: `${titlePrefix} planned resurfacing inspection`,
      evidence: { fileName: "field-evidence.jpg", contentType: "image/jpeg" },
    }).expect(201);
    await request(app).post("/tickets/agency-originated").set("Authorization", `Bearer ${pwdToken}`).send({ action: "complete", imageId: agencyTicket.body.imageId }).expect(200);
    const direct = await prisma.ticket.findUniqueOrThrow({ where: { id: agencyTicket.body.ticketId }, include: { stateTransitions: true } });
    assert.equal(direct.reporterId, null);
    assert.equal(direct.assignedAgencyId, pwdAgencyId);
    assert.equal(direct.state, TicketState.ROUTED_TO_AGENCY);
    assert.equal(direct.stateTransitions.some((transition) => transition.toState === TicketState.PENDING_VALIDATION || transition.toState === TicketState.VALIDATED), false);
    assert.equal(await prisma.dependency.count({ where: { project: { ticketId: direct.id } } }), 0);

    const detail = await request(app).get(`/tickets/${direct.id}`).set("Authorization", `Bearer ${pwdToken}`).expect(200);
    assert.ok(detail.body.ticket.routingSuggestions.length > 0);
    await request(app).get(`/tickets/${direct.id}`).set("Authorization", `Bearer ${bwssbToken}`).expect(404);
    const inspection = await request(app).post(`/tickets/${direct.id}/inspection-report`).set("Authorization", `Bearer ${pwdToken}`).send({ action: "presign", fileName: "inspection.pdf", contentType: "application/pdf", notes: "Road surface failed across the carriageway." }).expect(201);
    await request(app).post(`/tickets/${direct.id}/inspection-report`).set("Authorization", `Bearer ${pwdToken}`).send({ action: "complete", reportId: inspection.body.reportId }).expect(200);
    await request(app).post(`/tickets/${direct.id}/inspection-report`).set("Authorization", `Bearer ${bwssbToken}`).send({ action: "presign", fileName: "forbidden.pdf", contentType: "application/pdf", notes: "Must not be accepted." }).expect(404);

    const projectResponse = await request(app).post("/projects").set("Authorization", `Bearer ${pwdToken}`).send({ ticketId: direct.id, engineerId: pwdEngineerId }).expect(201);
    assert.equal(projectResponse.body.project.state, ProjectState.PENDING_UPTAKE);
    assert.equal(projectResponse.body.project.engineer.id, pwdEngineerId);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: direct.id } })).state, TicketState.ENGINEER_ASSIGNED);
    await request(app).get(`/projects/${projectResponse.body.project.id}`).set("Authorization", `Bearer ${bwssbToken}`).expect(404);
    await request(app).get(`/projects?agency=${pwdAgencyId}`).set("Authorization", `Bearer ${bwssbToken}`).expect(403);

    const dashboard = await request(app).get("/project-head/dashboard").set("Authorization", `Bearer ${pwdToken}`).expect(200);
    for (const value of Object.values(dashboard.body.counts)) assert.equal(typeof value, "number");

    console.log("Phase 4 acceptance verified: DB routing changes, two-agency isolation, direct agency tickets, inspection completion, advisory suggestions, and engineer-assigned project creation.");
  } finally {
    await prisma.category.update({ where: { id: roadCategoryId }, data: { primaryAgencyId: pwdAgencyId } });
    await cleanup();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
