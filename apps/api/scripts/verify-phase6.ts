import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { InspectionRecommendation, InspectionStatus, ProjectState, TicketState, prisma } from "db";
import { createApp } from "../src/app";
import type { ImageStorage } from "../src/images/storage";

const demoInternalPassword = process.env.DEMO_INTERNAL_PASSWORD ?? "CivicOS@123";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";

const titlePrefix = "[Phase 6 acceptance]";
const reporterId = "40000000-0000-4000-8000-000000000001";
const validatorId = (number: number) => `41000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const bescomAgencyId = "20000000-0000-4000-8000-000000000002";
const streetlightCategoryId = "30000000-0000-4000-8000-000000000002";
const jayanagarWardId = "10000000-0000-4000-8000-000000000004";
const bescomEngineerId = "40000000-0000-4000-8000-000000000203";

const storage: ImageStorage = {
  createUpload(objectKey, contentType) {
    return { uploadUrl: `https://uploads.example.test/${objectKey}`, publicUrl: `https://images.example.test/${objectKey}`, headers: { "Content-Type": contentType }, expiresInSeconds: 900 };
  },
  createDownload(objectKey) { return `https://images.example.test/${objectKey}`; },
  async verifyUpload() { return true; },
};

async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const response = await request(app).post("/auth/internal/login").send({ email, password: demoInternalPassword }).expect(200);
  return response.body.accessToken as string;
}

function citizenToken(userId: string): string {
  return jwt.sign({ role: "CITIZEN", agencyId: null, wardId: jayanagarWardId, mustResetPassword: false, tokenType: "access" }, process.env.JWT_ACCESS_SECRET!, {
    subject: userId, expiresIn: "15m", issuer: "civicos-api", audience: "civicos-clients",
  });
}

async function createInspectedTicket(): Promise<string> {
  const ticketId = randomUUID();
  const observationId = randomUUID();
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "assignedAgencyId", "coordinates", "wardId", "state", "title", "address", "createdAt", "updatedAt")
      VALUES (${ticketId}::uuid, ${streetlightCategoryId}::uuid, ${reporterId}::uuid, ${bescomAgencyId}::uuid,
        ST_SetSRID(ST_MakePoint(77.5844, 12.9299), 4326), ${jayanagarWardId}::uuid,
        ${TicketState.INSPECTION_COMPLETE}::"TicketState", ${`${titlePrefix} streetlight restoration`}, 'Jayanagar, Bengaluru', NOW(), NOW())
    `;
    await transaction.observation.create({ data: { id: observationId, ticketId, submitterId: reporterId, imageUrl: `https://images.example.test/${ticketId}.jpg` } });
    await transaction.image.create({ data: { observationId, url: `https://images.example.test/${ticketId}.jpg`, objectKey: `phase6/${ticketId}.jpg`, isPrimary: true, uploadedAt: new Date() } });
    await transaction.inspectionReport.create({ data: {
      ticketId,
      assignedEngineerId: bescomEngineerId,
      assignedById: "40000000-0000-4000-8000-000000000103",
      submittedById: bescomEngineerId,
      deadline: new Date("2026-10-10T12:00:00.000Z"),
      status: InspectionStatus.REVIEWED,
      recommendation: InspectionRecommendation.PROCEED,
      observations: "The failed luminaire and feeder require replacement.",
      submittedAt: new Date(),
      reviewedAt: new Date(),
      fileUrl: `https://images.example.test/${ticketId}-inspection.pdf`,
      objectKey: `phase6/${ticketId}-inspection.pdf`,
      contentType: "application/pdf",
      notes: "The failed luminaire and feeder require replacement.",
      uploadedAt: new Date(),
    } });
    await transaction.validation.createMany({ data: [1, 2, 3].map((number) => ({ ticketId, validatorId: validatorId(number), vote: "CONFIRM" as const, counted: true })) });
  });
  return ticketId;
}

async function cleanup(): Promise<void> {
  const tickets = await prisma.ticket.findMany({ where: { title: { startsWith: titlePrefix } }, select: { id: true, project: { select: { id: true } } } });
  const ticketIds = tickets.map(({ id }) => id);
  const projectIds = tickets.flatMap(({ project }) => project ? [project.id] : []);
  for (const projectId of projectIds) await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'projectId' = ${projectId}`;
  for (const ticketId of ticketIds) await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'ticketId' = ${ticketId}`;
  if (projectIds.length > 0) await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  if (ticketIds.length > 0) await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
}

async function main(): Promise<void> {
  await cleanup();
  const app = createApp({ otpProvider: { async sendOtp() {} }, imageStorage: storage });
  const [headToken, engineerToken, otherEngineerToken] = await Promise.all([
    login(app, "head.bescom@civicos.local"),
    login(app, "engineer.bescom@civicos.local"),
    login(app, "engineer.pwd@civicos.local"),
  ]);
  try {
    const ticketId = await createInspectedTicket();
    const created = await request(app).post("/projects").set("Authorization", `Bearer ${headToken}`).send({ ticketId, engineerId: bescomEngineerId }).expect(201);
    const projectId = created.body.project.id as string;
    assert.equal(created.body.project.state, ProjectState.PENDING_UPTAKE);

    await request(app).get(`/projects?scope=geographic&agency=${bescomAgencyId}`).set("Authorization", `Bearer ${otherEngineerToken}`).expect(403);
    await request(app).get(`/projects/${projectId}`).set("Authorization", `Bearer ${otherEngineerToken}`).expect(404);
    await request(app).post(`/projects/${projectId}/uptake`).set("Authorization", `Bearer ${otherEngineerToken}`).expect(404);

    await request(app).post(`/projects/${projectId}/uptake`).set("Authorization", `Bearer ${engineerToken}`).expect(200);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).state, ProjectState.UPTAKEN);
    const timeline = await request(app).patch(`/projects/${projectId}/timeline`).set("Authorization", `Bearer ${engineerToken}`).send({
      plannedStart: "2026-10-25T00:00:00.000Z",
      plannedEnd: "2026-11-05T23:59:59.999Z",
      workDescription: "Replace the failed luminaire, test the feeder, and restore lighting.",
      dependencyFlags: ["Electrical isolation"],
    }).expect(200);
    assert.deepEqual(timeline.body.conflicts, []);
    assert.equal(timeline.body.project.state, ProjectState.READY_TO_START);
    assert.equal(timeline.body.project.actualStart, null);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).state, TicketState.ENGINEER_ASSIGNED);
    const transitions = await prisma.projectStateTransition.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(transitions.map(({ toState }) => toState).slice(0, 6), [ProjectState.CREATED, ProjectState.PENDING_UPTAKE, ProjectState.UPTAKEN, ProjectState.TIMELINE_SET, ProjectState.CONFLICT_CHECKED, ProjectState.READY_TO_START]);
    assert.deepEqual((await request(app).get(`/projects/${projectId}/conflicts`).set("Authorization", `Bearer ${engineerToken}`).expect(200)).body.conflicts, []);

    await request(app).post(`/projects/${projectId}/start`).set("Authorization", `Bearer ${engineerToken}`).expect(200);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).state, ProjectState.ACTIVE);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).state, TicketState.WORK_IN_PROGRESS);

    await request(app).patch(`/projects/${projectId}/timeline`).set("Authorization", `Bearer ${engineerToken}`).send({
      plannedStart: "2026-10-26T00:00:00.000Z",
      plannedEnd: "2026-11-06T23:59:59.999Z",
      workDescription: "Revised field plan after the electrical-isolation coordination meeting.",
      dependencyFlags: ["Electrical isolation", "Feeder clearance"],
    }).expect(200);
    assert.equal(await prisma.notification.count({ where: { type: "PROJECT_TIMELINE_MODIFIED", payload: { path: ["projectId"], equals: projectId } } }) >= 1, true);

    await request(app).patch(`/projects/${projectId}/status`).set("Authorization", `Bearer ${engineerToken}`).send({ state: "COMPLETED", note: "Lighting restored and the site made safe." }).expect(200);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).state, ProjectState.COMPLETED);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).state, TicketState.WORK_COMPLETED);
    const evidence = await request(app).post(`/projects/${projectId}/completion`).set("Authorization", `Bearer ${engineerToken}`).send({ action: "presign", fileName: "complete.jpg", contentType: "image/jpeg", notes: "Replacement luminaire operating after feeder testing." }).expect(201);
    const completed = await request(app).post(`/projects/${projectId}/completion`).set("Authorization", `Bearer ${engineerToken}`).send({ action: "complete", evidenceId: evidence.body.evidenceId }).expect(200);
    assert.equal(completed.body.validatorsNotified, 3);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).state, ProjectState.AWAITING_VERIFICATION);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).state, TicketState.AWAITING_CITIZEN_VERIFICATION);
    assert.equal(await prisma.completionVerificationRequest.count({ where: { completionEvidenceId: evidence.body.evidenceId } }), 3);
    assert.equal(await prisma.notification.count({ where: { type: "COMPLETION_VERIFICATION_REQUEST", payload: { path: ["projectId"], equals: projectId } } }), 3);

    const verificationConfig = await prisma.systemConfig.findUniqueOrThrow({ where: { key: "verification.quorum" }, select: { value: true } });
    assert.equal(typeof verificationConfig.value, "number");
    const verificationQuorum = verificationConfig.value as number;
    assert.ok(Number.isInteger(verificationQuorum) && verificationQuorum >= 1 && verificationQuorum <= 3);
    for (let number = 1; number <= verificationQuorum; number += 1) {
      const token = citizenToken(validatorId(number));
      const pending = await request(app).get("/citizens/me/pending-completion-verifications").set("Authorization", `Bearer ${token}`).expect(200);
      assert.equal(
        pending.body.completions.some((item: { evidenceId: string }) => item.evidenceId === evidence.body.evidenceId),
        true,
        `Validator ${number} could not see completion ${evidence.body.evidenceId}: ${JSON.stringify(pending.body)}`,
      );
      await request(app).post(`/completion-evidence/${evidence.body.evidenceId}/verify`).set("Authorization", `Bearer ${token}`).send({ decision: "VERIFIED" }).expect(200);
    }
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).state, ProjectState.CLOSED);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).state, TicketState.CLOSED);
    console.log(`Phase 6 acceptance verified: uptake, timeline/conflict seam, active modification, completion handoff, three original-validator notifications, configured ${verificationQuorum}-citizen closure quorum, and cross-agency read-only access.`);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
