import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import request from "supertest";
import { Prisma, ProjectState, TicketState, prisma } from "db";
import { createApp } from "../src/app";
import { checkProjectConflicts } from "../src/conflicts/service";
import type { ImageRelevanceService } from "../src/images/relevance";
import type { ImageStorage } from "../src/images/storage";

const demoInternalPassword = process.env.DEMO_INTERNAL_PASSWORD ?? "CivicOS@123";
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";
process.env.OTP_PROVIDER = "console";
process.env.OTP_MOCK_CODE ??= "123456";

const ids = {
  agency: "20000000-0000-4000-8000-000000000003",
  category: "30000000-0000-4000-8000-000000000002",
  ward: "10000000-0000-4000-8000-000000000004",
  reporter: "40000000-0000-4000-8000-000000000001",
  validator: "41000000-0000-4000-8000-000000000001",
  head: "40000000-0000-4000-8000-000000000101",
  engineer: "40000000-0000-4000-8000-000000000201",
  bwssb: "20000000-0000-4000-8000-000000000001",
  bescom: "20000000-0000-4000-8000-000000000002",
  bwssbEngineer: "40000000-0000-4000-8000-000000000202",
};

const uuid = (prefix: string, index: number) => `${prefix}-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const ticketIds = Array.from({ length: 100 }, (_, index) => uuid("a1000000", index));
const projectIds = Array.from({ length: 30 }, (_, index) => uuid("a4000000", index));

const storage: ImageStorage = {
  createUpload(objectKey, contentType) {
    return { uploadUrl: `https://uploads.example.test/${objectKey}`, publicUrl: `https://images.example.test/${objectKey}`, headers: { "Content-Type": contentType }, expiresInSeconds: 900 };
  },
  createDownload(objectKey) {
    return `https://images.example.test/${objectKey}`;
  },
  async verifyUpload() {
    return true;
  },
};

const relevance: ImageRelevanceService = {
  async checkImageRelevance() {
    return { pass: true, score: 0.99 };
  },
  async getImageEmbedding() {
    return null;
  },
};

async function cleanupFixture() {
  const existingProjects = await prisma.project.findMany({ where: { ticketId: { in: ticketIds } }, select: { id: true } });
  const notificationProjectIds = [...new Set([...projectIds, ...existingProjects.map(({ id }) => id)])];
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "Notification" WHERE "payload"->>'projectId' IN (${Prisma.join(notificationProjectIds)})`);
  await prisma.project.deleteMany({ where: { id: { in: notificationProjectIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.ticket.deleteMany({ where: { title: "Demo acceptance report" } });
  await prisma.notification.deleteMany({ where: { id: { in: ticketIds.map((_id, index) => uuid("a6000000", index)) } } });
}

async function prepareFixture() {
  await cleanupFixture();

  await prisma.$transaction(async (transaction) => {
    for (const [index, id] of ticketIds.entries()) {
      const state = index < 30 ? TicketState.WORK_IN_PROGRESS : index === 30 ? TicketState.INSPECTION_COMPLETE : index % 2 ? TicketState.ROUTED_TO_AGENCY : TicketState.INSPECTION_DUE;
      const latitude = 12.929 + (index % 10) * 0.00005;
      const longitude = 77.5844 + Math.floor(index / 10) * 0.00005;
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "assignedAgencyId", "coordinates", "wardId", "state", "title", "address", "createdAt", "updatedAt")
        VALUES (${id}::uuid, ${ids.category}::uuid, ${ids.reporter}::uuid, ${ids.agency}::uuid,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326), ${ids.ward}::uuid,
          ${state}::"TicketState", ${`Demo load event ${index + 1}`}, 'Jayanagar demo load grid, Bengaluru', NOW() - (${index} * INTERVAL '1 minute'), NOW() - (${index} * INTERVAL '1 minute'))
      `);
    }
  });

  await prisma.observation.createMany({ data: ticketIds.map((ticketId, index) => ({
    id: uuid("a2000000", index), ticketId, submitterId: ids.reporter,
    imageUrl: `https://images.example.com/demo-load-${index + 1}.jpg`, note: `Realistic demo observation ${index + 1}`,
    latitude: 12.929 + (index % 10) * 0.00005, longitude: 77.5844 + Math.floor(index / 10) * 0.00005,
    address: "Jayanagar demo load grid, Bengaluru",
  })) });
  await prisma.validation.createMany({ data: ticketIds.map((ticketId, index) => ({ id: uuid("a3000000", index), ticketId, validatorId: ids.validator, vote: "CONFIRM", counted: true })) });
  await prisma.ticketStateTransition.createMany({ data: ticketIds.map((ticketId, index) => ({ id: uuid("a7000000", index), ticketId, fromState: TicketState.VALIDATED, toState: index === 30 ? TicketState.INSPECTION_COMPLETE : index < 30 ? TicketState.WORK_IN_PROGRESS : index % 2 ? TicketState.ROUTED_TO_AGENCY : TicketState.INSPECTION_DUE, reason: "DEMO_100_LOAD_FIXTURE" })) });
  await prisma.project.createMany({ data: projectIds.map((id, index) => ({
    id, ticketId: ticketIds[index], categoryId: ids.category, agencyId: ids.agency, wardId: ids.ward,
    ownerProjectHeadId: ids.head, createdById: ids.head, title: `Demo load delivery project ${index + 1}`,
    engineerId: ids.engineer, state: ProjectState.ACTIVE,
    plannedStart: new Date("2026-09-01T00:00:00.000Z"), plannedEnd: new Date("2026-09-12T23:59:59.999Z"),
    workDescription: `Demo load delivery project ${index + 1}`,
  })) });
  await prisma.$executeRaw`
    UPDATE "Project" AS project SET "geometry" = ticket."coordinates"
    FROM "Ticket" AS ticket WHERE project."ticketId" = ticket."id" AND project."id" = ANY(${projectIds}::uuid[])
  `;
  await prisma.projectStateTransition.createMany({ data: projectIds.map((projectId, index) => ({ id: uuid("a5000000", index), projectId, fromState: ProjectState.TIMELINE_SET, toState: ProjectState.ACTIVE, reason: "DEMO_100_LOAD_FIXTURE", actedById: ids.engineer })) });
  await prisma.notification.createMany({ data: ticketIds.map((ticketId, index) => ({ id: uuid("a6000000", index), userId: ids.head, type: "TICKET_ROUTED_TO_AGENCY", payload: { ticketId } })) });
}

async function timed<T>(operation: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  const value = await operation();
  return { value, ms: Math.round((performance.now() - started) * 10) / 10 };
}

async function main() {
  await prepareFixture();
  try {
    const app = createApp({ otpProvider: { async sendOtp() {} }, imageStorage: storage, imageRelevance: relevance });
    const agent = request(app);
  const login = async (email: string, expectedRole: "PROJECT_HEAD" | "ENGINEER" | "ADMIN") => timed(() => agent.post("/auth/internal/login").send({ email, password: demoInternalPassword, expectedRole }));
  const projectHeadLogin = await login("head.pwd@civicos.local", "PROJECT_HEAD");
  const engineerLogin = await login("engineer.pwd@civicos.local", "ENGINEER");
  const adminLogin = await login("admin@civicos.local", "ADMIN");
  assert.equal(projectHeadLogin.value.status, 200);
  assert.equal(engineerLogin.value.status, 200);
  assert.equal(adminLogin.value.status, 200);
  const headToken = projectHeadLogin.value.body.accessToken as string;
  const engineerToken = engineerLogin.value.body.accessToken as string;

  const invalidLogin = await timed(() => agent.post("/auth/internal/login").send({ email: "head.pwd@civicos.local", password: "incorrect-password", expectedRole: "PROJECT_HEAD" }));
  const roleMismatch = await timed(() => agent.post("/auth/internal/login").send({ email: "engineer.pwd@civicos.local", password: demoInternalPassword, expectedRole: "PROJECT_HEAD" }));
  assert.equal(invalidLogin.value.status, 401);
  assert.equal(roleMismatch.value.status, 403);
  assert.equal((await agent.get("/protected/project-head").set("Authorization", `Bearer ${engineerToken}`)).status, 403);

  const phone = "+919870009999";
  const citizenOtpRequest = await timed(() => agent.post("/auth/citizen/request-otp").send({ phone }));
  const citizenLogin = await timed(() => agent.post("/auth/citizen/verify-otp").send({ phone, code: process.env.OTP_MOCK_CODE ?? "123456" }));
  assert.equal(citizenOtpRequest.value.status, 202);
  assert.equal(citizenLogin.value.status, 200);
  const citizenToken = citizenLogin.value.body.accessToken as string;

  const ticketList = await timed(() => agent.get("/tickets?page=1&limit=20").set("Authorization", `Bearer ${headToken}`));
  const projectList = await timed(() => agent.get("/projects?page=1&limit=20").set("Authorization", `Bearer ${headToken}`));
  const engineerList = await timed(() => agent.get("/projects?scope=mine&page=1&limit=20").set("Authorization", `Bearer ${engineerToken}`));
  const notifications = await timed(() => agent.get("/notifications?page=1&limit=20").set("Authorization", `Bearer ${headToken}`));
  const dashboardCold = await timed(() => agent.get("/project-head/dashboard").set("Authorization", `Bearer ${headToken}`));
  const dashboardCached = await timed(() => agent.get("/project-head/dashboard").set("Authorization", `Bearer ${headToken}`));
  for (const result of [ticketList, projectList, engineerList, notifications, dashboardCold, dashboardCached]) assert.equal(result.value.status, 200);
  assert.equal(ticketList.value.body.pagination.limit, 20);
  assert.ok(ticketList.value.body.pagination.total >= 100);
  assert.ok(projectList.value.body.pagination.total >= 30);
  assert.equal(notifications.value.body.notifications.length, 20);

  const imagePresign = await timed(() => agent.post("/tickets/image-relevance").set("Authorization", `Bearer ${citizenToken}`).send({
    action: "presign", categoryId: ids.category, fileName: "demo-streetlight.jpg", contentType: "image/jpeg",
  }));
  assert.equal(imagePresign.value.status, 201);
  const relevanceCheck = await timed(() => agent.post("/tickets/image-relevance").set("Authorization", `Bearer ${citizenToken}`).send({
    action: "complete", categoryId: ids.category, objectKey: imagePresign.value.body.objectKey, fileName: "demo-streetlight.jpg", contentType: "image/jpeg", attempt: 1,
  }));
  assert.equal(relevanceCheck.value.status, 200);
  const citizenCreate = await timed(() => agent.post("/tickets").set("Authorization", `Bearer ${citizenToken}`).send({
    categoryId: ids.category, title: "Demo acceptance report", address: "Jayanagar 4th Block, Bengaluru",
    latitude: 12.9295, longitude: 77.5854, note: "Streetlight remains dark after sunset during the demo check.",
    primaryImage: { validationToken: relevanceCheck.value.body.validationToken },
  }));
  assert.equal(citizenCreate.value.status, 201);
  const citizenSubmit = await timed(() => agent.post(`/tickets/${citizenCreate.value.body.ticketId}/images`).set("Authorization", `Bearer ${citizenToken}`).send({
    action: "complete", imageId: citizenCreate.value.body.imageId,
  }));
  assert.equal(citizenSubmit.value.status, 200);

  const projectCreation = await timed(() => agent.post("/projects").set("Authorization", `Bearer ${headToken}`).send({
    ticketId: ticketIds[30], engineerId: ids.engineer,
    dependencies: [
      { respondingAgencyId: ids.bwssb, requirement: "Confirm underground utility clearance before field work." },
      { respondingAgencyId: ids.bescom, requirement: "Coordinate electrical isolation and restoration timing." },
    ],
  }));
  assert.equal(projectCreation.value.status, 201);
  assert.equal(projectCreation.value.body.dependencies.length, 2);
  const createdDependencyId = projectCreation.value.body.dependencies.find((item: { respondingAgencyId: string }) => item.respondingAgencyId === ids.bwssb)?.id as string;
  const bwssbLogin = await login("head.bwssb@civicos.local", "PROJECT_HEAD");
  const dependencyResponse = await timed(() => agent.post(`/dependencies/${createdDependencyId}/respond`).set("Authorization", `Bearer ${bwssbLogin.value.body.accessToken}`).send({ action: "ASSIGN_ENGINEER", engineerId: ids.bwssbEngineer }));
  assert.equal(dependencyResponse.value.status, 200);

  const conflictCheck = await timed(() => checkProjectConflicts(prisma, projectIds[0]!));
  assert.ok(conflictCheck.value.length >= 29);
  const dbProbe = await timed(() => prisma.ticket.count({ where: { id: { in: ticketIds } } }));

  const concurrent = await timed(() => Promise.all(Array.from({ length: 25 }, () => agent.get("/tickets?page=1&limit=20").set("Authorization", `Bearer ${headToken}`))));
  assert.ok(concurrent.value.every((response) => response.status === 200));
  const normalLatencies = [ticketList.ms, projectList.ms, engineerList.ms, notifications.ms, imagePresign.ms, relevanceCheck.ms, citizenCreate.ms, citizenSubmit.ms, projectCreation.ms, dependencyResponse.ms];
  const report = {
    fixture: { tickets: 100, validations: 100, projects: 30, transitions: 130, notifications: 100 },
    authenticationMs: { citizenOtpRequest: citizenOtpRequest.ms, citizenLogin: citizenLogin.ms, projectHead: projectHeadLogin.ms, engineer: engineerLogin.ms, admin: adminLogin.ms, invalid: invalidLogin.ms, roleMismatch: roleMismatch.ms },
    listAndCrudMs: { ticketList: ticketList.ms, projectList: projectList.ms, engineerList: engineerList.ms, notifications: notifications.ms, imagePresign: imagePresign.ms, relevanceCheck: relevanceCheck.ms, citizenTicketCreate: citizenCreate.ms, citizenTicketSubmit: citizenSubmit.ms, projectCreateWithDependencies: projectCreation.ms, dependencyResponse: dependencyResponse.ms },
    dashboardMs: { cold: dashboardCold.ms, cached: dashboardCached.ms },
    enginesMs: { conflicts: conflictCheck.ms, conflictsFound: conflictCheck.value.length },
    concurrency: { requests: 25, wallMs: concurrent.ms, failed: concurrent.value.filter((response) => response.status >= 400).length },
    database: { countProbeMs: dbProbe.ms, fixtureCount: dbProbe.value },
    processMemoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    targets: { normalUnder500ms: normalLatencies.every((ms) => ms < 500), dashboardUnder1500ms: dashboardCold.ms < 1500, loginsUnder1000ms: [citizenLogin.ms, projectHeadLogin.ms, engineerLogin.ms, adminLogin.ms].every((ms) => ms < 1000) },
  };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.targets.normalUnder500ms, true);
  assert.equal(report.targets.dashboardUnder1500ms, true);
    assert.equal(report.targets.loginsUnder1000ms, true);
  } finally {
    await cleanupFixture();
    const [remainingTickets, remainingProjects] = await Promise.all([
      prisma.ticket.count({ where: { id: { in: ticketIds } } }),
      prisma.project.count({ where: { id: { in: projectIds } } }),
    ]);
    assert.equal(remainingTickets, 0, "Demo ticket fixture cleanup failed");
    assert.equal(remainingProjects, 0, "Demo project fixture cleanup failed");
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
