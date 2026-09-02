import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { InspectionStatus, ProjectState, TicketState, prisma } from "db";
import { createApp } from "../src/app";
import type { ImageStorage } from "../src/images/storage";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";

const prefix = "[SIH redesign acceptance]";
const bescomAgencyId = "20000000-0000-4000-8000-000000000002";
const bwssbAgencyId = "20000000-0000-4000-8000-000000000001";
const bbmpAgencyId = "20000000-0000-4000-8000-000000000003";
const engineerId = "40000000-0000-4000-8000-000000000203";
const validatorId = "40000000-0000-4000-8000-000000000002";
const categoryId = "30000000-0000-4000-8000-000000000002";
const wardId = "10000000-0000-4000-8000-000000000004";
const demoPassword = process.env.DEMO_INTERNAL_PASSWORD ?? "CivicOS@123";

const storage: ImageStorage = {
  createUpload(objectKey, contentType) { return { uploadUrl: `https://uploads.example.test/${objectKey}`, publicUrl: `https://evidence.example.test/${objectKey}`, headers: { "Content-Type": contentType }, expiresInSeconds: 900 }; },
  createDownload(objectKey) { return `https://evidence.example.test/${objectKey}`; },
  async verifyUpload() { return true; },
};

async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const result = await request(app).post("/auth/internal/login").send({ email, password: demoPassword }).expect(200);
  return result.body.accessToken as string;
}

function citizenToken(userId: string): string {
  return jwt.sign({ role: "CITIZEN", agencyId: null, wardId, mustResetPassword: false, tokenType: "access" }, process.env.JWT_ACCESS_SECRET!, { subject: userId, expiresIn: "15m", issuer: "civicos-api", audience: "civicos-clients" });
}

async function cleanup(): Promise<void> {
  const tickets = await prisma.ticket.findMany({ where: { title: { startsWith: prefix } }, select: { id: true, project: { select: { id: true } } } });
  const ticketIds = tickets.map(({ id }) => id);
  const projectIds = tickets.flatMap(({ project }) => project ? [project.id] : []);
  for (const projectId of projectIds) await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'projectId' = ${projectId}`;
  for (const ticketId of ticketIds) await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'ticketId' = ${ticketId}`;
  if (projectIds.length) await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  if (ticketIds.length) await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
}

async function createRoutedTicket(): Promise<string> {
  const ticketId = randomUUID();
  const observationId = randomUUID();
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "assignedAgencyId", "coordinates", "wardId", "state", "title", "address", "createdAt", "updatedAt")
      VALUES (${ticketId}::uuid, ${categoryId}::uuid, ${validatorId}::uuid, ${bescomAgencyId}::uuid,
        ST_SetSRID(ST_MakePoint(77.5712, 12.9441), 4326), ${wardId}::uuid, ${TicketState.ROUTED_TO_AGENCY}::"TicketState",
        ${`${prefix} feeder junction fault`}, 'Jayanagar 4th Block, Bengaluru', NOW(), NOW())
    `;
    await transaction.observation.create({ data: { id: observationId, ticketId, submitterId: validatorId, imageUrl: `https://evidence.example.test/${ticketId}.jpg`, note: "Citizen reported feeder junction damage." } });
    await transaction.image.create({ data: { observationId, url: `https://evidence.example.test/${ticketId}.jpg`, objectKey: `sih-redesign/${ticketId}.jpg`, isPrimary: true, uploadedAt: new Date() } });
    await transaction.validation.create({ data: { ticketId, validatorId, vote: "CONFIRM", counted: true } });
  });
  return ticketId;
}

async function main(): Promise<void> {
  await cleanup();
  const app = createApp({ otpProvider: { async sendOtp() {} }, imageStorage: storage });
  const [head, engineer, bwssbEngineer, bbmpHead] = await Promise.all([
    login(app, "head.bescom@civicos.local"),
    login(app, "engineer.bescom@civicos.local"),
    login(app, "engineer.bwssb@civicos.local"),
    login(app, "head.bbmp@civicos.local"),
  ]);
  const citizen = citizenToken(validatorId);
  try {
    const ticketId = await createRoutedTicket();

    await request(app).get("/inspections").set("Authorization", `Bearer ${citizen}`).expect(403);
    const assigned = await request(app).post(`/tickets/${ticketId}/inspections`).set("Authorization", `Bearer ${head}`).send({ engineerId, deadline: "2028-02-03T12:00:00.000Z" }).expect(201);
    const inspectionId = assigned.body.inspection.id as string;
    assert.equal(assigned.body.inspection.status, InspectionStatus.ASSIGNED);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).state, TicketState.INSPECTION_DUE);
    assert.equal((await request(app).get("/inspections").set("Authorization", `Bearer ${bwssbEngineer}`).expect(200)).body.inspections.some((item: { id: string }) => item.id === inspectionId), false);
    await request(app).get(`/inspections/${inspectionId}`).set("Authorization", `Bearer ${bwssbEngineer}`).expect(404);
    await request(app).post(`/inspections/${inspectionId}/accept`).set("Authorization", `Bearer ${engineer}`).expect(200);
    await request(app).post(`/inspections/${inspectionId}/start`).set("Authorization", `Bearer ${engineer}`).expect(200);
    const evidence = await request(app).post(`/inspections/${inspectionId}/evidence`).set("Authorization", `Bearer ${engineer}`).send({ action: "presign", fileName: "site.jpg", contentType: "image/jpeg", sizeBytes: 2048 }).expect(201);
    await request(app).post(`/inspections/${inspectionId}/evidence`).set("Authorization", `Bearer ${engineer}`).send({ action: "complete", evidenceId: evidence.body.evidenceId }).expect(200);
    await request(app).post(`/inspections/${inspectionId}/submit`).set("Authorization", `Bearer ${engineer}`).send({ issueConfirmation: "CONFIRMED", severity: "HIGH", observations: "The feeder junction enclosure is damaged and live components are exposed.", recommendedWork: "Isolate the feeder, replace the junction enclosure, and test the circuit.", complexity: "MEDIUM", coordinationRequired: false, recommendation: "PROCEED", latitude: 12.9441, longitude: 77.5712 }).expect(200);
    assert.equal((await prisma.inspectionReport.findUniqueOrThrow({ where: { id: inspectionId } })).status, InspectionStatus.SUBMITTED);
    await request(app).post(`/inspections/${inspectionId}/review`).set("Authorization", `Bearer ${head}`).send({ decision: "CREATE_WORK", note: "Evidence supports a scoped electrical repair." }).expect(200);

    const created = await request(app).post("/projects").set("Authorization", `Bearer ${head}`).send({ ticketId, engineerId }).expect(201);
    const projectId = created.body.project.id as string;
    await request(app).post(`/projects/${projectId}/uptake`).set("Authorization", `Bearer ${bwssbEngineer}`).expect(404);
    const reassignment = await request(app).post(`/projects/${projectId}/reassignment-requests`).set("Authorization", `Bearer ${engineer}`).send({ reason: "AVAILABILITY", note: "Available after the current emergency callout." }).expect(201);
    await request(app).post(`/project-reassignment-requests/${reassignment.body.request.id}/respond`).set("Authorization", `Bearer ${head}`).send({ decision: "DECLINE", note: "Priority work retained with adjusted field support." }).expect(200);
    await request(app).post(`/projects/${projectId}/uptake`).set("Authorization", `Bearer ${engineer}`).expect(200);

    const planned = await request(app).patch(`/projects/${projectId}/timeline`).set("Authorization", `Bearer ${engineer}`).send({ plannedStart: "2028-02-05T03:30:00.000Z", plannedEnd: "2028-02-06T12:30:00.000Z", workDescription: "Isolate the feeder, replace the enclosure, test, and restore supply.", dependencyFlags: [] }).expect(200);
    assert.equal(planned.body.project.state, ProjectState.READY_TO_START);
    assert.equal(planned.body.project.actualStart, null);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).state, TicketState.ENGINEER_ASSIGNED);
    await request(app).patch(`/projects/${projectId}/status`).set("Authorization", `Bearer ${head}`).send({ note: "Project Head must not enter field updates." }).expect(403);
    await request(app).post(`/projects/${projectId}/start`).set("Authorization", `Bearer ${engineer}`).expect(200);
    const active = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    assert.equal(active.state, ProjectState.ACTIVE);
    assert.ok(active.actualStart);
    const blocker = await request(app).post(`/projects/${projectId}/blockers`).set("Authorization", `Bearer ${engineer}`).send({ title: "Unsafe live feeder", details: "Isolation confirmation is required before the enclosure can be opened safely.", severity: "HIGH" }).expect(201);
    await request(app).post(`/project-blockers/${blocker.body.blocker.id}/resolve`).set("Authorization", `Bearer ${head}`).send({ resolution: "Control room confirmed isolation and issued the clearance reference." }).expect(200);
    await request(app).patch(`/projects/${projectId}/status`).set("Authorization", `Bearer ${engineer}`).send({ note: "Junction isolated and enclosure replacement started." }).expect(200);

    await request(app).post("/civic-works/planned").set("Authorization", `Bearer ${engineer}`).send({}).expect(403);
    await request(app).patch("/civic-works/8b000000-0000-4000-8000-000000000002").set("Authorization", `Bearer ${bbmpHead}`).send({ title: "Forbidden cross-agency change" }).expect(404);
    const map = await request(app).get("/civic-works/calendar?dateFrom=2026-09-01T00:00:00.000Z&dateTo=2026-12-31T23:59:59.999Z&minLongitude=77.56&minLatitude=12.82&maxLongitude=77.72&maxLatitude=12.995&limit=200").set("Authorization", `Bearer ${engineer}`).expect(200);
    assert.ok(map.body.works.some((item: { agency: { id: string } }) => item.agency.id === bwssbAgencyId));
    assert.ok(map.body.works.some((item: { agency: { id: string } }) => item.agency.id === bbmpAgencyId));

    const auditActions = (await prisma.projectAuditEvent.findMany({ where: { projectId }, select: { action: true } })).map(({ action }) => action);
    assert.ok(["REASSIGNMENT_REQUESTED", "REASSIGNMENT_DECLINED", "WORK_STARTED", "BLOCKER_REPORTED", "BLOCKER_RESOLVED"].every((action) => auditActions.includes(action)));
    console.log("SIH redesign verified: Engineer inspection ownership, structured evidence, Project Head review, reassignment decision, schedule/start separation, traceable blocker handling, role denials, cross-agency read-only map visibility, and audit history.");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
