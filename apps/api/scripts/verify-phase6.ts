import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { ProjectState, TicketState, prisma } from "db";
import { createApp } from "../src/app";
import type { ImageStorage } from "../src/images/storage";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";

const titlePrefix = "[Phase 6 acceptance]";
const reporterId = "40000000-0000-4000-8000-000000000001";
const validatorId = (number: number) => `41000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const pwdAgencyId = "20000000-0000-4000-8000-000000000003";
const roadCategoryId = "30000000-0000-4000-8000-000000000001";
const koramangalaWardId = "10000000-0000-4000-8000-000000000001";
const pwdEngineerId = "40000000-0000-4000-8000-000000000201";

const storage: ImageStorage = {
  createUpload(objectKey, contentType) {
    return { uploadUrl: `https://uploads.example.test/${objectKey}`, publicUrl: `https://images.example.test/${objectKey}`, headers: { "Content-Type": contentType }, expiresInSeconds: 900 };
  },
};

async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const response = await request(app).post("/auth/internal/login").send({ email, password: "CivicOS@123" }).expect(200);
  return response.body.accessToken as string;
}

function citizenToken(userId: string): string {
  return jwt.sign({ role: "CITIZEN", agencyId: null, wardId: koramangalaWardId, mustResetPassword: false, tokenType: "access" }, process.env.JWT_ACCESS_SECRET!, {
    subject: userId, expiresIn: "15m", issuer: "civicos-api", audience: "civicos-clients",
  });
}

async function createInspectedTicket(): Promise<string> {
  const ticketId = randomUUID();
  const observationId = randomUUID();
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "assignedAgencyId", "coordinates", "wardId", "state", "title", "address", "createdAt")
      VALUES (${ticketId}::uuid, ${roadCategoryId}::uuid, ${reporterId}::uuid, ${pwdAgencyId}::uuid,
        ST_SetSRID(ST_MakePoint(77.62, 12.935), 4326), ${koramangalaWardId}::uuid,
        ${TicketState.INSPECTION_COMPLETE}::"TicketState", ${`${titlePrefix} road repair`}, 'Koramangala, Bengaluru', NOW())
    `;
    await transaction.observation.create({ data: { id: observationId, ticketId, submitterId: reporterId, imageUrl: `https://images.example.test/${ticketId}.jpg` } });
    await transaction.image.create({ data: { observationId, url: `https://images.example.test/${ticketId}.jpg`, objectKey: `phase6/${ticketId}.jpg`, isPrimary: true, uploadedAt: new Date() } });
    await transaction.inspectionReport.create({ data: { ticketId, submittedById: "40000000-0000-4000-8000-000000000101", fileUrl: `https://images.example.test/${ticketId}-inspection.pdf`, objectKey: `phase6/${ticketId}-inspection.pdf`, contentType: "application/pdf", notes: "Carriageway repair is required before the next monsoon cycle.", uploadedAt: new Date() } });
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
    login(app, "head.pwd@civicos.local"),
    login(app, "engineer.pwd@civicos.local"),
    login(app, "engineer.bwssb@civicos.local"),
  ]);
  try {
    const ticketId = await createInspectedTicket();
    const created = await request(app).post("/projects").set("Authorization", `Bearer ${headToken}`).send({ ticketId, engineerId: pwdEngineerId }).expect(201);
    const projectId = created.body.project.id as string;
    assert.equal(created.body.project.state, ProjectState.PENDING_UPTAKE);

    const geographic = await request(app).get(`/projects?scope=geographic&agency=${pwdAgencyId}`).set("Authorization", `Bearer ${otherEngineerToken}`).expect(200);
    assert.equal(geographic.body.projects.find((item: { id: string }) => item.id === projectId).editable, false);
    assert.equal((await request(app).get(`/projects/${projectId}`).set("Authorization", `Bearer ${otherEngineerToken}`).expect(200)).body.project.editable, false);
    await request(app).post(`/projects/${projectId}/uptake`).set("Authorization", `Bearer ${otherEngineerToken}`).expect(404);

    await request(app).post(`/projects/${projectId}/uptake`).set("Authorization", `Bearer ${engineerToken}`).expect(200);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).state, ProjectState.UPTAKEN);
    const timeline = await request(app).patch(`/projects/${projectId}/timeline`).set("Authorization", `Bearer ${engineerToken}`).send({
      plannedStart: "2026-10-25T00:00:00.000Z",
      plannedEnd: "2026-11-05T23:59:59.999Z",
      workDescription: "Mill the damaged surface, rebuild the base, and restore the carriageway.",
      dependencyFlags: ["Traffic diversion"],
    }).expect(200);
    assert.deepEqual(timeline.body.conflicts, []);
    assert.equal(timeline.body.project.state, ProjectState.ACTIVE);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).state, TicketState.WORK_IN_PROGRESS);
    const transitions = await prisma.projectStateTransition.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(transitions.map(({ toState }) => toState).slice(0, 6), [ProjectState.CREATED, ProjectState.PENDING_UPTAKE, ProjectState.UPTAKEN, ProjectState.TIMELINE_SET, ProjectState.CONFLICT_CHECKED, ProjectState.ACTIVE]);
    assert.deepEqual((await request(app).get(`/projects/${projectId}/conflicts`).set("Authorization", `Bearer ${engineerToken}`).expect(200)).body.conflicts, []);

    await request(app).patch(`/projects/${projectId}/timeline`).set("Authorization", `Bearer ${engineerToken}`).send({
      plannedStart: "2026-10-26T00:00:00.000Z",
      plannedEnd: "2026-11-06T23:59:59.999Z",
      workDescription: "Revised field plan after the traffic-diversion coordination meeting.",
      dependencyFlags: ["Traffic diversion", "Utility clearance"],
    }).expect(200);
    assert.equal(await prisma.notification.count({ where: { type: "PROJECT_TIMELINE_MODIFIED", payload: { path: ["projectId"], equals: projectId } } }) >= 1, true);

    await request(app).patch(`/projects/${projectId}/status`).set("Authorization", `Bearer ${engineerToken}`).send({ state: "COMPLETED", note: "Surface restored and site cleared." }).expect(200);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).state, ProjectState.COMPLETED);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).state, TicketState.WORK_COMPLETED);
    const evidence = await request(app).post(`/projects/${projectId}/completion`).set("Authorization", `Bearer ${engineerToken}`).send({ action: "presign", fileName: "complete.jpg", contentType: "image/jpeg", notes: "Finished carriageway with markings restored." }).expect(201);
    const completed = await request(app).post(`/projects/${projectId}/completion`).set("Authorization", `Bearer ${engineerToken}`).send({ action: "complete", evidenceId: evidence.body.evidenceId }).expect(200);
    assert.equal(completed.body.validatorsNotified, 3);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).state, ProjectState.AWAITING_VERIFICATION);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).state, TicketState.AWAITING_CITIZEN_VERIFICATION);
    assert.equal(await prisma.completionVerificationRequest.count({ where: { completionEvidenceId: evidence.body.evidenceId } }), 3);
    assert.equal(await prisma.notification.count({ where: { type: "COMPLETION_VERIFICATION_REQUEST", payload: { path: ["projectId"], equals: projectId } } }), 3);

    for (let number = 1; number <= 3; number += 1) {
      const token = citizenToken(validatorId(number));
      const pending = await request(app).get("/citizens/me/pending-completion-verifications").set("Authorization", `Bearer ${token}`).expect(200);
      assert.equal(pending.body.completions.some((item: { evidenceId: string }) => item.evidenceId === evidence.body.evidenceId), true);
      await request(app).post(`/completion-evidence/${evidence.body.evidenceId}/verify`).set("Authorization", `Bearer ${token}`).send({ decision: "VERIFIED" }).expect(200);
    }
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).state, ProjectState.CLOSED);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).state, TicketState.CLOSED);
    console.log("Phase 6 acceptance verified: uptake, timeline/conflict seam, active modification, completion handoff, original-validator notifications, citizen closure, and cross-agency read-only access.");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
