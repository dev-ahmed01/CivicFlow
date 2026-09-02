import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { ProjectState, TicketState, prisma } from "db";
import { projectConflictSchema } from "@civicos/shared";
import { createApp } from "../src/app";

const demoInternalPassword = process.env.DEMO_INTERNAL_PASSWORD ?? "CivicOS@123";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";

const titlePrefix = "[Phase 7 acceptance]";
const wardId = "10000000-0000-4000-8000-000000000004";
const categoryId = "30000000-0000-4000-8000-000000000001";

const actors = {
  pwd: { agencyId: "20000000-0000-4000-8000-000000000003", engineerId: "40000000-0000-4000-8000-000000000201", email: "engineer.pwd@civicos.local" },
  bwssb: { agencyId: "20000000-0000-4000-8000-000000000001", engineerId: "40000000-0000-4000-8000-000000000202", email: "engineer.bwssb@civicos.local" },
  bescom: { agencyId: "20000000-0000-4000-8000-000000000002", engineerId: "40000000-0000-4000-8000-000000000203", email: "engineer.bescom@civicos.local" },
} as const;

async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const response = await request(app).post("/auth/internal/login").send({ email, password: demoInternalPassword }).expect(200);
  return response.body.accessToken as string;
}

async function createPlannedProject(input: { title: string; longitude: number; latitude: number; agencyId: string; engineerId: string }): Promise<string> {
  const ticketId = randomUUID();
  const projectId = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "Ticket" ("id", "categoryId", "assignedAgencyId", "coordinates", "wardId", "state", "title", "address", "createdAt", "updatedAt")
    VALUES (${ticketId}::uuid, ${categoryId}::uuid, ${input.agencyId}::uuid,
      ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326), ${wardId}::uuid,
      ${TicketState.ENGINEER_ASSIGNED}::"TicketState", ${`${titlePrefix} ${input.title}`}, ${`${input.title}, Jayanagar, Bengaluru`}, NOW(), NOW())
  `;
  await prisma.project.create({ data: {
    id: projectId,
    ticketId,
    categoryId,
    agencyId: input.agencyId,
    wardId,
    title: `${titlePrefix} ${input.title}`,
    engineerId: input.engineerId,
    state: ProjectState.UPTAKEN,
  } });
  await prisma.$executeRaw`
    UPDATE "Project" AS project SET "geometry" = ticket."coordinates"
    FROM "Ticket" AS ticket WHERE project."id" = ${projectId}::uuid AND ticket."id" = ${ticketId}::uuid
  `;
  return projectId;
}

async function saveTimeline(app: ReturnType<typeof createApp>, token: string, projectId: string, start = "2026-09-10T00:00:00.000Z", end = "2026-09-20T23:59:59.999Z") {
  return request(app).patch(`/projects/${projectId}/timeline`).set("Authorization", `Bearer ${token}`).send({
    plannedStart: start,
    plannedEnd: end,
    workDescription: "Coordinate the planned civic work and restore the affected public area.",
    dependencyFlags: ["Cross-agency coordination"],
  }).expect(200);
}

async function cleanup(): Promise<void> {
  const tickets = await prisma.ticket.findMany({ where: { title: { startsWith: titlePrefix } }, select: { id: true, project: { select: { id: true } } } });
  const projectIds = tickets.flatMap(({ project }) => project ? [project.id] : []);
  for (const projectId of projectIds) await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'projectId' = ${projectId}`;
  if (projectIds.length > 0) await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  if (tickets.length > 0) await prisma.ticket.deleteMany({ where: { id: { in: tickets.map(({ id }) => id) } } });
}

async function main(): Promise<void> {
  await cleanup();
  const app = createApp({ otpProvider: { async sendOtp() {} } });
  const [pwdToken, bwssbToken, bescomToken] = await Promise.all([
    login(app, actors.pwd.email),
    login(app, actors.bwssb.email),
    login(app, actors.bescom.email),
  ]);

  try {
    const projectA = await createPlannedProject({ title: "PWD carriageway renewal", longitude: 77.5844, latitude: 12.9299, ...actors.pwd });
    const projectB = await createPlannedProject({ title: "BWSSB water-main repair", longitude: 77.5844, latitude: 12.93035, ...actors.bwssb });
    const projectC = await createPlannedProject({ title: "BESCOM cable maintenance", longitude: 77.5844, latitude: 12.92855, ...actors.bescom });

    assert.deepEqual((await saveTimeline(app, pwdToken, projectA)).body.conflicts, []);
    const prominent = projectConflictSchema.array().parse((await saveTimeline(app, bwssbToken, projectB)).body.conflicts);
    assert.equal(prominent.some((conflict) => conflict.conflictingProjectId === projectA && conflict.severity === "PROMINENT"), true);
    assert.equal(prominent.every((conflict) => conflict.projectId === projectB), true);
    const [scheduledA, scheduledB] = await Promise.all([
      prisma.project.findUniqueOrThrow({ where: { id: projectA } }),
      prisma.project.findUniqueOrThrow({ where: { id: projectB } }),
    ]);
    assert.equal(scheduledA.state, ProjectState.READY_TO_START);
    assert.equal(scheduledB.state, ProjectState.READY_TO_START);
    assert.equal(scheduledA.actualStart, null, "conflict-checked scheduling must not start execution");
    assert.equal(scheduledB.actualStart, null, "conflict warnings remain advisory without implying execution");

    const firstLogCount = await prisma.conflictLog.count();
    await saveTimeline(app, bwssbToken, projectB);
    assert.equal(await prisma.conflictLog.count(), firstLogCount, "an unchanged timeline must not duplicate ConflictLog rows");
    await saveTimeline(app, pwdToken, projectA);
    assert.equal(await prisma.conflictLog.count(), firstLogCount, "either project may be saved again without duplicate logs");

    const inline = projectConflictSchema.array().parse((await saveTimeline(app, bescomToken, projectC)).body.conflicts);
    const near150m = inline.find((conflict) => conflict.conflictingProjectId === projectA);
    assert.ok(near150m);
    assert.equal(near150m.severity, "INLINE");
    assert.ok(near150m.distanceMeters !== null && near150m.distanceMeters > 140 && near150m.distanceMeters < 160);
    assert.equal(inline.every((conflict) => conflict.severity === "INLINE"), true);

    const reverse = projectConflictSchema.array().parse((await request(app).get(`/projects/${projectA}/conflicts`).set("Authorization", `Bearer ${pwdToken}`).expect(200)).body.conflicts);
    assert.equal(reverse.some((conflict) => conflict.conflictingProjectId === projectB && conflict.severity === "PROMINENT"), true);
    assert.equal(reverse.every((conflict) => conflict.conflictingProjectId !== projectA), true);

    const beforeChange = await prisma.conflictLog.count();
    await saveTimeline(app, bwssbToken, projectB, "2026-09-11T00:00:00.000Z", "2026-09-19T23:59:59.999Z");
    assert.ok(await prisma.conflictLog.count() > beforeChange, "a changed timeline must create a new audit row");

    console.log("Phase 7 acceptance verified: configurable PostGIS/ward matching, prominent and inline advisory severity, reverse-project visibility, idempotent logs, and non-blocking saves.");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
