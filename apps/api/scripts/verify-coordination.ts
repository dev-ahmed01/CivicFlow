import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { CoordinationStatus, DependencyState, ProjectState, TicketState, WorkflowActionType, prisma } from "db";
import { createApp } from "../src/app";
import type { ImageStorage } from "../src/images/storage";

const demoInternalPassword = process.env.DEMO_INTERNAL_PASSWORD ?? "CivicOS@123";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";

const pwdAgencyId = "20000000-0000-4000-8000-000000000003";
const bwssbAgencyId = "20000000-0000-4000-8000-000000000001";
const bwssbEngineerId = "40000000-0000-4000-8000-000000000202";
const pwdHeadId = "40000000-0000-4000-8000-000000000101";
const categoryId = "30000000-0000-4000-8000-000000000001";
const wardId = "10000000-0000-4000-8000-000000000004";

const storage: ImageStorage = {
  createUpload(objectKey, contentType) {
    return { uploadUrl: `https://uploads.example.test/${objectKey}`, publicUrl: `https://files.example.test/${objectKey}`, headers: { "Content-Type": contentType }, expiresInSeconds: 900 };
  },
  createDownload(objectKey) { return `https://downloads.example.test/${objectKey}?signed=test`; },
  async verifyUpload() { return true; },
};

async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const response = await request(app).post("/auth/internal/login").send({ email, password: demoInternalPassword }).expect(200);
  return response.body.accessToken as string;
}

function authorized(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

async function main(): Promise<void> {
  const app = createApp({ otpProvider: { async sendOtp() {} }, imageStorage: storage });
  const ticketId = randomUUID();
  const projectId = randomUUID();
  const createdRequestIds: string[] = [];
  await prisma.$executeRaw`
    INSERT INTO "Ticket" ("id", "categoryId", "assignedAgencyId", "coordinates", "wardId", "state", "title", "address", "createdAt", "updatedAt")
    VALUES (${ticketId}::uuid, ${categoryId}::uuid, ${pwdAgencyId}::uuid, ST_SetSRID(ST_MakePoint(77.5844, 12.9299), 4326), ${wardId}::uuid, ${TicketState.PROJECT_CREATED}::"TicketState", 'Coordination verification work', 'Jayanagar 4th Block, Bengaluru', NOW(), NOW())
  `;
  await prisma.project.create({ data: { id: projectId, ticketId, categoryId, agencyId: pwdAgencyId, wardId, ownerProjectHeadId: pwdHeadId, createdById: pwdHeadId, title: "Structured coordination verification", locationLabel: "Jayanagar 4th Block", state: ProjectState.CREATED } });
  await prisma.$executeRaw`UPDATE "Project" SET "geometry" = ST_SetSRID(ST_MakePoint(77.5844, 12.9299), 4326) WHERE "id" = ${projectId}::uuid`;

  try {
    const [pwdToken, bwssbToken, engineerToken, bescomToken] = await Promise.all([
      login(app, "head.pwd@civicos.local"),
      login(app, "head.bwssb@civicos.local"),
      login(app, "engineer.bwssb@civicos.local"),
      login(app, "head.bescom@civicos.local"),
    ]);
    const options = await request(app).get("/coordination-options").set(authorized(pwdToken)).expect(200);
    assert.ok(options.body.requestTypes.includes("utility-clearance"));

    const draftResponse = await request(app).post(`/projects/${projectId}/coordination-requests`).set(authorized(pwdToken)).send({
      respondingAgencyId: bwssbAgencyId,
      requestTypeKey: "utility-clearance",
      subject: "Confirm water-main clearance before excavation",
      details: "Review the proposed excavation footprint and confirm utility clearance requirements.",
      initialMessage: "Please review the attached inspection sketch and respond before mobilization.",
      responseDeadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      inspectionNeeded: true,
      engineerRequired: true,
    }).expect(201);
    const coordinationId = draftResponse.body.request.id as string;
    const initialEntryId = draftResponse.body.initialEntryId as string;
    createdRequestIds.push(coordinationId);
    assert.equal(draftResponse.body.request.status, CoordinationStatus.DRAFT);

    const presign = await request(app).post(`/coordination-requests/${coordinationId}/attachments`).set(authorized(pwdToken)).send({ action: "presign", entryId: initialEntryId, fileName: "inspection-sketch.pdf", contentType: "application/pdf", sizeBytes: 4096 }).expect(201);
    assert.ok(!JSON.stringify(presign.body).includes("secret"), "storage credentials must never be returned");
    await request(app).post(`/coordination-requests/${coordinationId}/attachments`).set(authorized(pwdToken)).send({ action: "complete", attachmentId: presign.body.attachmentId }).expect(200);
    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(authorized(pwdToken)).send({ action: "SEND" }).expect(200);

    const sent = await prisma.coordinationRequest.findUniqueOrThrow({ where: { id: coordinationId }, include: { dependency: true } });
    assert.equal(sent.status, CoordinationStatus.SENT);
    assert.ok(sent.dependencyId);
    assert.equal(sent.dependency?.state, DependencyState.PENDING_RESPONSE);

    await request(app).get(`/coordination-requests/${coordinationId}`).set(authorized(bescomToken)).expect(404);
    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(authorized(bescomToken)).send({ action: "REPLY", message: "Unauthorized" }).expect(404);
    const received = await request(app).get("/coordination-requests?direction=received&status=SENT").set(authorized(bwssbToken)).expect(200);
    assert.ok(received.body.requests.some((item: { id: string }) => item.id === coordinationId));

    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(authorized(bwssbToken)).send({ action: "ACKNOWLEDGE", message: "Request received by utility coordination desk." }).expect(200);
    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(authorized(bwssbToken)).send({ action: "REQUEST_CLARIFICATION", message: "Please confirm the proposed trench depth." }).expect(200);
    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(authorized(pwdToken)).send({ action: "REPLY", message: "The planned trench depth is 1.2 metres." }).expect(200);
    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(authorized(bwssbToken)).send({ action: "REQUEST_INSPECTION", message: "A joint field inspection is required before clearance." }).expect(200);
    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(authorized(bwssbToken)).send({ action: "PROPOSE_DATETIME", proposedAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), message: "Proposed morning site visit." }).expect(200);
    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(authorized(bwssbToken)).send({ action: "ASSIGN_ENGINEER", engineerId: bwssbEngineerId, message: "Assigned for the joint inspection." }).expect(200);

    const assigned = await prisma.coordinationRequest.findUniqueOrThrow({ where: { id: coordinationId }, include: { dependency: true } });
    assert.equal(assigned.assignedEngineerId, bwssbEngineerId);
    assert.equal(assigned.dependency?.assignedEngineerId, bwssbEngineerId);
    assert.equal(await prisma.workflowAction.count({ where: { dependencyId: assigned.dependencyId!, type: WorkflowActionType.FULFILL_DEPENDENCY, responsibleUserId: bwssbEngineerId, respondedAt: null } }), 1);
    const engineerTasks = await request(app).get("/coordination-requests?direction=received").set(authorized(engineerToken)).expect(200);
    assert.ok(engineerTasks.body.requests.some((item: { id: string }) => item.id === coordinationId));

    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(authorized(bwssbToken)).send({ action: "ACCEPT", message: "Dependency accepted subject to inspection findings." }).expect(200);
    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(authorized(engineerToken)).send({ action: "START_PROGRESS", message: "Traveling to site." }).expect(200);
    const inspection = await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(authorized(engineerToken)).send({ action: "INSPECTION_COMPLETE", notes: "Water main located outside the excavation buffer; clearance can proceed." }).expect(200);
    const evidence = await request(app).post(`/coordination-requests/${coordinationId}/attachments`).set(authorized(engineerToken)).send({ action: "presign", entryId: inspection.body.entry.id, fileName: "site-evidence.jpg", contentType: "image/jpeg", sizeBytes: 8192 }).expect(201);
    await request(app).post(`/coordination-requests/${coordinationId}/attachments`).set(authorized(engineerToken)).send({ action: "complete", attachmentId: evidence.body.attachmentId }).expect(200);
    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(authorized(engineerToken)).send({ action: "COMPLETE", notes: "Utility clearance and inspection action completed." }).expect(200);
    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(authorized(pwdToken)).send({ action: "CLOSE", message: "Clearance recorded against the civic work." }).expect(200);

    const completed = await prisma.coordinationRequest.findUniqueOrThrow({ where: { id: coordinationId }, include: { dependency: true, entries: { include: { attachments: true }, orderBy: { createdAt: "asc" } } } });
    assert.equal(completed.status, CoordinationStatus.CLOSED);
    assert.equal(completed.dependency?.state, DependencyState.FULFILLED);
    assert.ok(completed.inspectionCompletedAt);
    assert.equal(completed.entries.flatMap((entry) => entry.attachments).filter((attachment) => attachment.uploadedAt).length, 2);
    assert.ok(completed.entries.every((entry) => entry.requestId === coordinationId), "messages may not detach from their request");
    const auditActions = (await prisma.projectAuditEvent.findMany({ where: { projectId, metadata: { path: ["coordinationRequestId"], equals: coordinationId } }, select: { action: true } })).map(({ action }) => action);
    for (const action of ["COORDINATION_SENT", "COORDINATION_ACKNOWLEDGE", "COORDINATION_REPLY", "COORDINATION_ASSIGN_ENGINEER", "COORDINATION_ATTACHMENT_ADDED", "COORDINATION_ACCEPT", "COORDINATION_COMPLETE", "COORDINATION_CLOSE"]) assert.ok(auditActions.includes(action), `${action} must be audited`);
    const detail = await request(app).get(`/coordination-requests/${coordinationId}`).set(authorized(pwdToken)).expect(200);
    const attachments = detail.body.request.entries.flatMap((entry: { attachments: Array<{ url: string; sizeBytes: number }> }) => entry.attachments);
    assert.ok(attachments.every((attachment: { url: string }) => attachment.url.startsWith("https://downloads.example.test/")));
    assert.ok(attachments.some((attachment: { sizeBytes: number }) => attachment.sizeBytes === 4096));

    const rejectedDraft = await request(app).post(`/projects/${projectId}/coordination-requests`).set(authorized(pwdToken)).send({ respondingAgencyId: bwssbAgencyId, requestTypeKey: "schedule-coordination", subject: "Coordinate a revised mobilization date", details: "Review whether the receiving agency can support the revised mobilization date.", initialMessage: "Please confirm availability or reject with an operational reason.", responseDeadline: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(), inspectionNeeded: false, engineerRequired: false }).expect(201);
    const rejectedId = rejectedDraft.body.request.id as string;
    createdRequestIds.push(rejectedId);
    await request(app).post(`/coordination-requests/${rejectedId}/actions`).set(authorized(pwdToken)).send({ action: "SEND" }).expect(200);
    await request(app).post(`/coordination-requests/${rejectedId}/actions`).set(authorized(engineerToken)).send({ action: "REJECT", reason: "Engineer must not reject" }).expect(404);
    await request(app).post(`/coordination-requests/${rejectedId}/actions`).set(authorized(bwssbToken)).send({ action: "REJECT", reason: "No safe shutdown window is available during the requested period." }).expect(200);
    assert.equal((await prisma.coordinationRequest.findUniqueOrThrow({ where: { id: rejectedId } })).status, CoordinationStatus.REJECTED);

    console.log("Phase 3 coordination verified: agency-scoped lifecycle, chronological replies, signed attachment metadata/access, Engineer assignment and inspection evidence, dependency linkage, rejection authority, unauthorized access denial, and project audit history.");
  } finally {
    await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'projectId' = ${projectId}`;
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.ticket.deleteMany({ where: { id: ticketId } });
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
