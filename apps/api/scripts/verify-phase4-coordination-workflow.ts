import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { DependencyState, prisma } from "db";
import type { CivicWorkCalendarItem, CivicWorkLedgerItem, CoordinationConflict, SequencingRecommendation } from "@civicos/shared";
import { createApp } from "../src/app";
import { runDependencyEscalationJob } from "../src/dependencies/service";
import type { ImageStorage } from "../src/images/storage";

const demoInternalPassword = process.env.DEMO_INTERNAL_PASSWORD ?? "CivicOS@123";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";

const roadCategoryId = "30000000-0000-4000-8000-000000000001";
const btmWardId = "10000000-0000-4000-8000-000000000005";
const pwdAgencyId = "20000000-0000-4000-8000-000000000003";
const bwssbAgencyId = "20000000-0000-4000-8000-000000000001";
const bwssbEngineerId = "40000000-0000-4000-8000-000000000202";

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

async function citizenLogin(app: ReturnType<typeof createApp>): Promise<string> {
  const response = await request(app).post("/auth/citizen/login").send({ userId: "citizen.jayanagar@cityconnect.local", password: demoInternalPassword }).expect(200);
  return response.body.accessToken as string;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

async function main(): Promise<void> {
  const app = createApp({ otpProvider: { async sendOtp() {} }, imageStorage: storage });
  const segmentId = randomUUID();
  const projectIds: string[] = [];
  await prisma.$executeRaw`
    INSERT INTO "RoadSegment" ("id", "roadName", "geometry", "wardId", "surfaceType")
    VALUES (${segmentId}::uuid, 'Phase 4 verification · BTM 16th Main',
      ST_GeomFromText('LINESTRING(77.6075 12.9142,77.6125 12.9142)', 4326),
      ${btmWardId}::uuid, 'Asphalt')
  `;

  try {
    const [pwdToken, bwssbToken, engineerToken, citizenToken] = await Promise.all([
      login(app, "head.pwd@civicos.local"),
      login(app, "head.bwssb@civicos.local"),
      login(app, "engineer.bwssb@civicos.local"),
      citizenLogin(app),
    ]);
    const pipelineStart = "2027-01-05T03:30:00.000Z";
    const pipelineEnd = "2027-01-12T12:30:00.000Z";
    const resurfacingStart = "2027-01-09T03:30:00.000Z";
    const resurfacingEnd = "2027-01-15T12:30:00.000Z";

    const createWork = (token: string, input: { title: string; purpose: "pipeline" | "resurfacing"; start: string; end: string }) => request(app)
      .post("/civic-works/planned")
      .set(auth(token))
      .send({
        title: input.title,
        description: "Deterministic Phase 4 BTM overlap used to verify the complete inter-agency workflow.",
        categoryId: roadCategoryId,
        wardId: btmWardId,
        priority: "HIGH",
        proposedStart: input.start,
        proposedEnd: input.end,
        locationLabel: "16th Main Road, BTM Layout 2nd Stage, Bengaluru",
        intervention: { segmentId, purpose: input.purpose, plannedStart: input.start, plannedEnd: input.end, affectedLengthM: 360, startOffsetM: 25, dependencyRefs: [] },
      })
      .expect(201);

    const pipeline = await createWork(bwssbToken, { title: "Phase 4 · BWSSB pipeline replacement", purpose: "pipeline", start: pipelineStart, end: pipelineEnd });
    const pipelineProjectId = pipeline.body.work.id as string;
    projectIds.push(pipelineProjectId);
    const resurfacing = await createWork(pwdToken, { title: "Phase 4 · PWD road resurfacing", purpose: "resurfacing", start: resurfacingStart, end: resurfacingEnd });
    const resurfacingProjectId = resurfacing.body.work.id as string;
    projectIds.push(resurfacingProjectId);

    const conflictResponse = await request(app).get(`/projects/${resurfacingProjectId}/coordination-conflicts`).set(auth(pwdToken)).expect(200);
    const conflicts = conflictResponse.body.conflicts as CoordinationConflict[];
    const conflict = conflicts.find((item) => item.kind === "ROAD" && item.roadConflictType === "RESTORATION_TOO_EARLY" && item.conflictingWork.id === pipelineProjectId);
    assert.ok(conflict, "registration must produce an explainable road conflict against the BWSSB work");
    assert.equal(conflict.sourceWork.agency.id, pwdAgencyId);
    assert.equal(conflict.conflictingWork.agency.id, bwssbAgencyId);
    assert.match(conflict.reason, /resurfacing.*pipeline|pipeline.*resurfacing/i);
    assert.equal(conflict.coordination, null);

    const responseDeadline = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const draft = await request(app).post(`/projects/${resurfacingProjectId}/coordination-requests`).set(auth(pwdToken)).send({
      respondingAgencyId: bwssbAgencyId,
      requestTypeKey: "road-cut-excavation-coordination",
      subject: "Sequence BTM pipeline work before resurfacing",
      details: `Conflicting work ${pipelineProjectId}; 16th Main Road; PWD ${resurfacingStart}–${resurfacingEnd}; BWSSB ${pipelineStart}–${pipelineEnd}.`,
      initialMessage: "Please confirm the pipeline sequence and whether a joint inspection is required.",
      responseDeadline,
      inspectionNeeded: true,
      engineerRequired: true,
      conflictSource: { kind: "ROAD", conflictId: conflict.id, conflictingProjectId: pipelineProjectId },
    }).expect(201);
    const coordinationId = draft.body.request.id as string;
    const inspectionReport = await request(app).post(`/coordination-requests/${coordinationId}/attachments`).set(auth(pwdToken)).send({
      action: "presign",
      entryId: draft.body.initialEntryId,
      fileName: "btm-overlap-inspection.pdf",
      contentType: "application/pdf",
      sizeBytes: 4096,
    }).expect(201);
    await request(app).post(`/coordination-requests/${coordinationId}/attachments`).set(auth(pwdToken)).send({ action: "complete", attachmentId: inspectionReport.body.attachmentId }).expect(200);
    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(auth(pwdToken)).send({ action: "SEND" }).expect(200);

    const sent = await prisma.coordinationRequest.findUniqueOrThrow({ where: { id: coordinationId }, include: { dependency: true } });
    assert.equal(sent.roadConflictLogId, conflict.id);
    assert.equal(sent.conflictingProjectId, pipelineProjectId);
    assert.equal(sent.dependency?.state, DependencyState.PENDING_RESPONSE);

    const firstReminder = await runDependencyEscalationJob();
    const secondReminder = await runDependencyEscalationJob();
    assert.equal(firstReminder.reminders, 1, "one approaching-deadline reminder should be sent");
    assert.equal(secondReminder.reminders, 0, "deadline reminders must be deduplicated");

    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(auth(bwssbToken)).send({ action: "REPLY", message: "Pipeline team confirms the overlap and requests a joint inspection." }).expect(200);
    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(auth(bwssbToken)).send({ action: "REQUEST_INSPECTION", message: "Inspect chainage 25m–385m before finalizing the sequence." }).expect(200);
    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(auth(bwssbToken)).send({ action: "ASSIGN_ENGINEER", engineerId: bwssbEngineerId, message: "Assigned the BTM utility engineer." }).expect(200);
    const accepted = await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(auth(bwssbToken)).send({ action: "ACCEPT", message: "Accepted: pipeline and inspection precede resurfacing." }).expect(200);
    const recommendation = accepted.body.sequencingRecommendation as SequencingRecommendation;
    assert.ok(recommendation?.id, "acceptance must record the existing engine's sequencing recommendation");
    assert.deepEqual(recommendation.proposedOrder.map((item) => item.purpose), ["pipeline", "consolidated restoration", "resurfacing"]);
    assert.ok(recommendation.ruleTrace.length >= 1);

    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(auth(engineerToken)).send({ action: "START_PROGRESS", message: "Joint inspection started." }).expect(200);
    const inspection = await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(auth(engineerToken)).send({ action: "INSPECTION_COMPLETE", notes: "Pipeline alignment and shared chainage confirmed on site." }).expect(200);
    const siteEvidence = await request(app).post(`/coordination-requests/${coordinationId}/attachments`).set(auth(engineerToken)).send({
      action: "presign",
      entryId: inspection.body.entry.id,
      fileName: "btm-chainage-evidence.jpg",
      contentType: "image/jpeg",
      sizeBytes: 8192,
    }).expect(201);
    await request(app).post(`/coordination-requests/${coordinationId}/attachments`).set(auth(engineerToken)).send({ action: "complete", attachmentId: siteEvidence.body.attachmentId }).expect(200);

    const calendarQuery = {
      roadSegmentId: segmentId,
      dateFrom: "2027-01-01T00:00:00.000Z",
      dateTo: "2027-02-01T00:00:00.000Z",
      minLongitude: 77.60,
      minLatitude: 12.90,
      maxLongitude: 77.62,
      maxLatitude: 12.92,
    };
    const blockedCalendar = await request(app).get("/civic-works/calendar").query(calendarQuery).set(auth(pwdToken)).expect(200);
    const blocked = (blockedCalendar.body.works as CivicWorkCalendarItem[]).find(({ id }) => id === resurfacingProjectId);
    assert.equal(blocked?.dependencySummary.blocked, true);
    assert.deepEqual(blocked?.dependencySummary.blockedBy.map(({ name }) => name), ["BWSSB"]);

    const revisedStart = "2027-01-14T03:30:00.000Z";
    const revisedEnd = "2027-01-18T12:30:00.000Z";
    await request(app).post(`/sequencing-recommendations/${recommendation.id}/actions`).set(auth(pwdToken)).send({
      outcome: "MODIFIED",
      timelineRevision: { projectId: resurfacingProjectId, plannedStart: revisedStart, plannedEnd: revisedEnd },
    }).expect(200);

    await request(app).post(`/coordination-requests/${coordinationId}/actions`).set(auth(engineerToken)).send({ action: "COMPLETE", notes: "Inspection action complete; pipeline prerequisite recorded for execution." }).expect(200);
    const updatedCalendar = await request(app).get("/civic-works/calendar").query(calendarQuery).set(auth(pwdToken)).expect(200);
    const updated = (updatedCalendar.body.works as CivicWorkCalendarItem[]).find(({ id }) => id === resurfacingProjectId);
    assert.equal(new Date(updated!.plannedStart!).toISOString(), revisedStart);
    assert.equal(new Date(updated!.plannedEnd!).toISOString(), revisedEnd);
    assert.equal(new Date(updated!.originalPlannedStart!).toISOString(), resurfacingStart);
    assert.equal(new Date(updated!.originalPlannedEnd!).toISOString(), resurfacingEnd);
    assert.equal(updated!.dependencySummary.blocked, false);

    const ledger = await request(app).get("/civic-works/ledger").query({ roadSegmentId: segmentId, limit: 25 }).set(auth(pwdToken)).expect(200);
    const ledgerWork = (ledger.body.works as CivicWorkLedgerItem[]).find(({ id }) => id === resurfacingProjectId);
    assert.ok(ledgerWork, "Civic Work Ledger must retain the resurfacing work");
    assert.ok(ledgerWork.events.some(({ kind }) => kind === "COORDINATION"), "ledger must retain the advisory conflict");
    assert.ok(ledgerWork.events.some(({ kind }) => kind === "DEPENDENCY"), "ledger must retain the accepted coordination dependency");
    assert.ok(ledgerWork.events.some(({ kind }) => kind === "AUDIT"), "ledger must retain coordination and sequencing audit events");

    const nearby = await request(app).get("/civic-works/nearby").query({ latitude: 12.9142, longitude: 77.6095, radiusMeters: 1000 }).set(auth(citizenToken)).expect(200);
    const publicWork = nearby.body.works.find((item: { id: string }) => item.id === resurfacingProjectId) as Record<string, unknown> | undefined;
    assert.ok(publicWork, "citizen nearby-work view must show the scheduled resurfacing");
    assert.equal(publicWork.status, "SCHEDULED");
    for (const privateKey of ["ticketId", "dependencyFlags", "roadConflictLogs", "coordinationRequests", "geometry"]) assert.equal(privateKey in publicWork, false, `${privateKey} must stay private`);

    const linkedConflict = (await request(app).get(`/projects/${resurfacingProjectId}/coordination-conflicts`).set(auth(pwdToken)).expect(200)).body.conflicts
      .find((item: CoordinationConflict) => item.id === conflict.id) as CoordinationConflict;
    assert.equal(linkedConflict.coordination?.requestId, coordinationId);
    assert.equal(linkedConflict.coordination?.status, "COMPLETED");

    const notificationTypes = (await prisma.notification.findMany({
      where: { OR: projectIds.map((projectId) => ({ payload: { path: ["projectId"], equals: projectId } })) },
      select: { type: true },
    })).map(({ type }) => type);
    for (const type of ["COORDINATION_REQUEST", "COORDINATION_REPLY", "COORDINATION_ENGINEER_ASSIGNED", "DEPENDENCY_ACCEPTED", "DEPENDENCY_DEADLINE_APPROACHING", "SEQUENCE_CHANGED"]) {
      assert.ok(notificationTypes.includes(type), `${type} notification must be emitted`);
    }
    assert.equal(await prisma.projectAuditEvent.count({ where: { projectId: resurfacingProjectId, action: "SEQUENCING_TIMELINE_REVISED" } }), 1);
    assert.equal(await prisma.sequencingRecommendationLog.count({ where: { recommendationId: recommendation.id, outcome: "MODIFIED" } }), 1);
    const completedRequest = await prisma.coordinationRequest.findUniqueOrThrow({ where: { id: coordinationId }, include: { entries: { include: { attachments: true } } } });
    assert.equal(completedRequest.entries.flatMap(({ attachments }) => attachments).filter(({ uploadedAt }) => uploadedAt).length, 2);
    console.log("Phase 4 workflow verified: BTM registry → conflict → structured request with inspection report → reply → Engineer assignment/inspection evidence → accepted dependency → rule-traced sequence → revised calendar → Civic Work Ledger → privacy-safe citizen status.");
  } finally {
    if (projectIds.length > 0) {
      for (const projectId of projectIds) await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'projectId' = ${projectId}`;
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    await prisma.roadSegment.deleteMany({ where: { id: segmentId } });
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
