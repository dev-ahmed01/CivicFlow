import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import request from "supertest";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma, type ProjectState, type TicketState } from "db";
import { createApp } from "../src/app";
import { getEnv } from "../src/config/env";
import { DevelopmentRelevanceService, createImageRelevanceService } from "../src/images/relevance";
import { S3CompatibleStorage } from "../src/images/storage";

// This suite creates records; it never resets or deletes application data.
// Explicitly refuse live databases/storage, even if an inherited .env points there.
const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
assert.ok(["127.0.0.1", "localhost"].includes(database.hostname) && database.pathname.endsWith("_test"), "Use an isolated localhost database ending in _test");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(process.env.S3_ENDPOINT ?? "https://invalid").hostname), "Use isolated local S3 storage");
process.env.NODE_ENV = "test";
process.env.DEPLOYMENT_PROFILE = "local";
process.env.DEMO_NOTIFY_ALL_CITIZENS = "false";
process.env.JWT_ACCESS_SECRET ??= "jain-test-access-secret-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "jain-test-refresh-secret-at-least-32-characters";
const wardId = "10000000-0000-4000-8000-000000000011";
const citizenA = "42000000-0000-4000-8000-000000000001";
const citizenB = "42000000-0000-4000-8000-000000000002";
const categoryId = "30000000-0000-4000-8000-000000000001";
const agencyId = "20000000-0000-4000-8000-000000000003";
const engineerId = "40000000-0000-4000-8000-000000000201";
const headId = "40000000-0000-4000-8000-000000000101";
const password = process.env.DEMO_INTERNAL_PASSWORD ?? "CivicOS@123";

function fixturePng() {
  function chunk(type: string, data: Buffer) {
    const bytes = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    const header = Buffer.alloc(4); header.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, bytes, tail]);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(320); ihdr.writeUInt32BE(240, 4); ihdr[8] = 8; ihdr[9] = 2;
  const pixels = Buffer.alloc(240 * (1 + 320 * 3), 128);
  for (let y = 0; y < 240; y++) pixels[y * (1 + 320 * 3)] = 0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

const bytes = process.env.JAIN_TEST_PHOTO_PATH ? readFileSync(process.env.JAIN_TEST_PHOTO_PATH) : fixturePng();
const contentType = process.env.JAIN_TEST_PHOTO_PATH?.match(/\.jpe?g$/i) ? "image/jpeg" : "image/png";
const fileName = contentType === "image/jpeg" ? "site.jpg" : "site.png";
const env = getEnv();
const storage = new S3CompatibleStorage(env);
// Only the ML classifier is deterministic in the default integration run.
// Real bytes, signed PUT/GET, integrity checks, DB, auth, routing and votes run unchanged.
const relevance = process.env.JAIN_REAL_AI === "true" ? createImageRelevanceService(env) : new DevelopmentRelevanceService({
  analyzer: { async analyze(_image, prompts) { return { scores: prompts.map((prompt) => prompt.includes("pothole") ? 0.99 : 0.001), embedding: [1, 0, 0] }; } },
});
const app = createApp({ imageStorage: storage, imageRelevance: relevance });
const createdRecords: Array<{ ticketId: string; projectId: string; result: string }> = [];

async function call(token: string, method: "get" | "post" | "patch", path: string, body?: object, expected = 200) {
  const result = await request(app)[method](path).set("Authorization", `Bearer ${token}`).send(body);
  assert.equal(result.status, expected, `${method} ${path}: ${JSON.stringify(result.body)}`);
  return result.body;
}
async function put(upload: { uploadUrl: string; headers: Record<string, string> }, body = bytes) {
  const response = await fetch(upload.uploadUrl, { method: "PUT", headers: upload.headers, body: new Uint8Array(body) });
  assert.ok(response.ok, `Real S3 PUT failed (${response.status})`);
}
async function states(ticketId: string, projectId: string | null, ticketState: TicketState, projectState?: ProjectState) {
  assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).state, ticketState);
  if (projectId) assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).state, projectState);
}
async function notification(userId: string, type: string, ticketId: string) {
  assert.ok(await prisma.notification.count({ where: { userId, type, payload: { path: ["ticketId"], equals: ticketId } } }), `Missing ${type} for ${userId}`);
}

async function main() {
  const s3 = new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION, forcePathStyle: true, credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } });
  try { await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET })); }
  catch (error) { if (!(error instanceof Error) || !["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(error.name)) throw error; }
  const login = async (email: string, citizen = false) => {
    const result = await request(app).post(citizen ? "/auth/citizen/login" : "/auth/internal/login").send(citizen ? { userId: email, password } : { email, password });
    assert.equal(result.status, 200, `Login failed for ${email}`); return result.body.accessToken as string;
  };
  const [a, b, head, engineer, outsider, uninvited] = await Promise.all([
    login("citizen.jain.1@cityconnect.local", true), login("citizen.jain.2@cityconnect.local", true), login("head.pwd@civicos.local"), login("engineer.pwd@civicos.local"), login("engineer.bescom@civicos.local"), login("citizen.jayanagar@cityconnect.local", true),
  ]);
  assert.equal((await prisma.systemConfig.findUniqueOrThrow({ where: { key: "demo.web_auto_route_enabled" } })).value, false);
  assert.equal((await call(engineer, "get", "/workflow-options")).demoDefaults, true);
  for (const [latitude, longitude] of [[12.63865,77.44137], [12.6375,77.4405], [12.6400,77.4430], [12.6420,77.4380]]) {
    const result = await call(a, "post", "/reporting-areas/resolve", { latitude, longitude });
    assert.equal(result.area.id, wardId); assert.equal(result.area.name, "Jakkasandra / JAIN Global Campus");
  }
  assert.ok((await call(a, "get", "/reporting-areas")).areas.some((area: { id: string }) => area.id === wardId));
  assert.equal((await call(a, "post", "/reporting-areas/resolve", { latitude: 12.9299, longitude: 77.5844 })).area.id, "10000000-0000-4000-8000-000000000004");

  async function flow(label: string, latitude: number, longitude: number, decision: "VERIFIED" | "REWORK_REQUESTED", fallback = false, noRecipients = false) {
    await call(b, "patch", "/citizens/me/location", { latitude, longitude }, 204);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: citizenB } })).wardId, wardId);
    const photo = await call(a, "post", "/tickets/image-relevance", { action: "presign", categoryId, fileName, contentType }, 201);
    await put(photo.upload);
    const checked = await call(a, "post", "/tickets/image-relevance", { action: "complete", categoryId, objectKey: photo.objectKey, fileName, contentType });
    assert.ok(checked.validationToken, "Photo did not pass relevance");
    const ticket = await call(a, "post", "/tickets", { categoryId, channel: "WEB", title: `[JAIN ${label}] campus road repair ${Date.now()}`, address: "JAIN Global Campus, Jakkasandra, Karnataka 562112", latitude, longitude, primaryImage: { validationToken: checked.validationToken } }, 201);
    const ticketId = ticket.ticketId as string;
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).wardId, wardId);
    assert.ok((await prisma.image.findUniqueOrThrow({ where: { id: ticket.imageId } })).uploadedAt);
    await call(a, "post", `/tickets/${ticketId}/images`, { action: "complete", imageId: ticket.imageId });
    await states(ticketId, null, "PENDING_VALIDATION");
    await notification(citizenB, "VALIDATION_REQUEST", ticketId);
    assert.ok((await call(b, "get", "/citizens/me/pending-validations")).validations.some((v: { ticketId: string }) => v.ticketId === ticketId));
    await call(a, "post", `/tickets/${ticketId}/validate`, { vote: "CONFIRM" }, 404);
    await call(b, "post", `/tickets/${ticketId}/validate`, { vote: "CONFIRM" });
    await states(ticketId, null, "ROUTED_TO_AGENCY");
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).assignedAgencyId, agencyId);
    assert.ok(await prisma.ticketStateTransition.count({ where: { ticketId, toState: "VALIDATED" } }));
    await notification(headId, "TICKET_ROUTED_TO_AGENCY", ticketId);
    await call(head, "get", `/tickets/${ticketId}`);
    const assigned = await call(head, "post", `/tickets/${ticketId}/inspections`, {}, 201);
    const inspectionId = assigned.inspection.id as string;
    assert.equal(assigned.inspection.assignedEngineerId, engineerId);
    await states(ticketId, null, "INSPECTION_DUE");
    await call(outsider, "post", `/inspections/${inspectionId}/accept`, {}, 404);
    await call(engineer, "post", `/inspections/${inspectionId}/accept`, {});
    assert.equal((await prisma.inspectionReport.findUniqueOrThrow({ where: { id: inspectionId } })).status, "ACCEPTED");
    await call(engineer, "post", `/inspections/${inspectionId}/start`, {});
    assert.equal((await prisma.inspectionReport.findUniqueOrThrow({ where: { id: inspectionId } })).status, "IN_PROGRESS");
    await call(engineer, "post", `/inspections/${inspectionId}/submit`, {}, 422);
    const site = await call(engineer, "post", `/inspections/${inspectionId}/evidence`, { action: "presign", fileName, contentType }, 201);
    await call(engineer, "post", `/inspections/${inspectionId}/evidence`, { action: "complete", evidenceId: site.evidenceId }, 422);
    await put(site.upload);
    await call(engineer, "post", `/inspections/${inspectionId}/evidence`, { action: "complete", evidenceId: site.evidenceId });
    assert.ok((await prisma.inspectionEvidence.findUniqueOrThrow({ where: { id: site.evidenceId } })).uploadedAt);
    await call(engineer, "post", `/inspections/${inspectionId}/submit`, {});
    await states(ticketId, null, "INSPECTION_COMPLETE");
    await call(head, "post", "/projects", { ticketId }, 409);
    const assessment = await prisma.inspectionReport.findUniqueOrThrow({ where: { id: inspectionId } });
    assert.equal(assessment.status, "SUBMITTED"); assert.equal(assessment.issueConfirmation, "CONFIRMED"); assert.equal(assessment.latitude, latitude);
    await call(head, "post", `/inspections/${inspectionId}/review`, { decision: "CREATE_WORK" });
    assert.equal((await prisma.inspectionReport.findUniqueOrThrow({ where: { id: inspectionId } })).status, "REVIEWED");
    const created = await call(head, "post", "/projects", { ticketId }, 201);
    const projectId = created.project.id as string;
    await states(ticketId, projectId, "ENGINEER_ASSIGNED", "PENDING_UPTAKE");
    const intervention = await prisma.intervention.findUniqueOrThrow({ where: { projectId } });
    assert.equal(intervention.segmentId, "80000000-0000-4000-8000-000000000011"); assert.deepEqual(intervention.dependencyRefs, []);
    assert.equal(await prisma.dependency.count({ where: { projectId } }), 0);
    await call(outsider, "post", `/projects/${projectId}/uptake`, {}, 404);
    await call(engineer, "post", `/projects/${projectId}/uptake`, {});
    await states(ticketId, projectId, "ENGINEER_ASSIGNED", "UPTAKEN");
    await call(engineer, "patch", `/projects/${projectId}/timeline`, {});
    await states(ticketId, projectId, "ENGINEER_ASSIGNED", "READY_TO_START");
    const transitions = await prisma.projectStateTransition.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(transitions.map((t) => t.toState), ["CREATED", "PENDING_UPTAKE", "UPTAKEN", "TIMELINE_SET", "CONFLICT_CHECKED", "READY_TO_START"]);
    await call(engineer, "post", `/projects/${projectId}/start`, {});
    await states(ticketId, projectId, "WORK_IN_PROGRESS", "ACTIVE");
    await call(engineer, "patch", `/projects/${projectId}/status`, { state: "COMPLETED" });
    await states(ticketId, projectId, "WORK_COMPLETED", "COMPLETED");
    // A legacy zero-validator record is simulated only after proving real initial validation.
    if (fallback) await prisma.validation.deleteMany({ where: { ticketId } });
    if (noRecipients) await call(b, "patch", "/citizens/me/location", { latitude: 12.9299, longitude: 77.5844 }, 204);
    const done = await call(engineer, "post", `/projects/${projectId}/completion`, { action: "presign", fileName, contentType }, 201);
    assert.equal((await prisma.completionEvidence.findUniqueOrThrow({ where: { id: done.evidenceId } })).notes, "");
    await call(engineer, "post", `/projects/${projectId}/completion`, { action: "complete", evidenceId: done.evidenceId }, 422);
    await put(done.upload);
    if (noRecipients) {
      const refused = await call(engineer, "post", `/projects/${projectId}/completion`, { action: "complete", evidenceId: done.evidenceId }, 422);
      assert.equal(refused.code, "NO_COMPLETION_VERIFIERS");
      await states(ticketId, projectId, "WORK_COMPLETED", "COMPLETED");
      assert.equal(await prisma.completionVerificationRequest.count({ where: { completionEvidenceId: done.evidenceId } }), 0);
      assert.equal((await prisma.completionEvidence.findUniqueOrThrow({ where: { id: done.evidenceId } })).uploadedAt, null);
      await call(b, "patch", "/citizens/me/location", { latitude, longitude }, 204);
    }
    await call(engineer, "post", `/projects/${projectId}/completion`, { action: "complete", evidenceId: done.evidenceId });
    await states(ticketId, projectId, "AWAITING_CITIZEN_VERIFICATION", "AWAITING_VERIFICATION");
    assert.ok(await prisma.completionVerificationRequest.count({ where: { completionEvidenceId: done.evidenceId, respondedAt: null } }));
    await notification(citizenB, "COMPLETION_VERIFICATION_REQUEST", ticketId);
    const pending = (await call(b, "get", "/citizens/me/pending-completion-verifications")).completions.find((v: { evidenceId: string }) => v.evidenceId === done.evidenceId);
    assert.ok(pending?.photoUrl && pending.originalPhotoUrl && pending.address && pending.agencyName && pending.title);
    for (const url of [pending.photoUrl, pending.originalPhotoUrl]) assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()), bytes);
    assert.equal((await call(a, "get", `/tickets/${ticketId}`)).ticket.statusLabel, "Awaiting confirmation");
    await call(a, "post", `/completion-evidence/${done.evidenceId}/verify`, { decision }, 404);
    await call(uninvited, "post", `/completion-evidence/${done.evidenceId}/verify`, { decision }, 404);
    await Promise.all([call(b, "post", `/completion-evidence/${done.evidenceId}/verify`, { decision }), call(b, "post", `/completion-evidence/${done.evidenceId}/verify`, { decision })]);
    await states(ticketId, projectId, decision === "VERIFIED" ? "CLOSED" : "WORK_IN_PROGRESS", decision === "VERIFIED" ? "CLOSED" : "ACTIVE");
    await notification(engineerId, decision === "VERIFIED" ? "COMPLETION_VERIFIED" : "PROJECT_REWORK_REQUESTED", ticketId);
    await notification(headId, decision === "VERIFIED" ? "COMPLETION_VERIFIED" : "PROJECT_REWORK_REQUESTED", ticketId);
    await call(b, "post", `/completion-evidence/${done.evidenceId}/verify`, { decision });
    assert.equal(await prisma.completionVerification.count({ where: { completionEvidenceId: done.evidenceId } }), 1);
    createdRecords.push({ ticketId, projectId, result: decision });
    if (decision === "REWORK_REQUESTED") {
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).actualCompletion, null);
      await call(engineer, "patch", `/projects/${projectId}/status`, { state: "COMPLETED" });
      const retry = await call(engineer, "post", `/projects/${projectId}/completion`, { action: "presign", fileName, contentType }, 201);
      await put(retry.upload);
      await call(engineer, "post", `/projects/${projectId}/completion`, { action: "complete", evidenceId: retry.evidenceId });
      // Old invitations must never cast a vote against a later completion round.
      await call(b, "post", `/completion-evidence/${done.evidenceId}/verify`, { decision: "VERIFIED" });
      await states(ticketId, projectId, "AWAITING_CITIZEN_VERIFICATION", "AWAITING_VERIFICATION");
      await call(b, "post", `/completion-evidence/${retry.evidenceId}/verify`, { decision: "VERIFIED" });
      await states(ticketId, projectId, "CLOSED", "CLOSED");
    }
    console.log(`PASS ${label}: real upload → community → agency → inspection → execution → completion → ${decision}`);
  }
  await flow("closure", 12.63865, 77.44137, "VERIFIED");
  await flow("rework", 12.6400, 77.4430, "REWORK_REQUESTED");
  await flow("fallback", 12.6375, 77.4405, "VERIFIED", true);
  await flow("no-recipients-atomic-refusal-and-retry", 12.6510, 77.4510, "VERIFIED", true, true);

  const photo = await call(head, "post", "/civic-works/planning-photo", { fileName, contentType }, 201);
  const planned = { planningPhotoToken: photo.planningPhotoToken, geometry: { type: "Point", coordinates: [77.44137, 12.63865] } };
  await call(head, "post", "/civic-works/planned", planned, 422);
  await put(photo.upload);
  const work = await call(head, "post", "/civic-works/planned", planned, 201);
  assert.equal(work.work.wardId, wardId);
  assert.ok(await prisma.projectEvidence.count({ where: { projectId: work.work.id, uploadedAt: { not: null }, kind: "SITE_PHOTO" } }));
  console.log("PASS agency-originated planned work: real mandatory photo, blank descriptions/dates, server-resolved campus ward");
  console.log(JSON.stringify({ classifier: process.env.JAIN_REAL_AI === "true" ? "real CLIP" : "deterministic classifier fixture; real image transport and integrity", createdRecords, plannedWorkId: work.work.id }, null, 2));
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
