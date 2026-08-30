import assert from "node:assert/strict";
import request from "supertest";
import { prisma } from "db";
import { civicWorkCalendarItemSchema, civicWorkLedgerItemSchema, civicWorkSchema } from "@civicos/shared";
import { createApp } from "../src/app";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";

const btmWardId = "10000000-0000-4000-8000-000000000005";
const waterCategoryId = "30000000-0000-4000-8000-000000000003";
const bwssbAgencyId = "20000000-0000-4000-8000-000000000001";
const createdIds: string[] = [];

async function internalLogin(app: ReturnType<typeof createApp>, email: string, expectedRole: "PROJECT_HEAD" | "ENGINEER") {
  const response = await request(app).post("/auth/internal/login").send({ email, password: "CivicOS@123", expectedRole }).expect(200);
  return response.body.accessToken as string;
}

async function citizenLogin(app: ReturnType<typeof createApp>) {
  const response = await request(app).post("/auth/citizen/login").send({
    userId: "citizen.jayanagar@cityconnect.local",
    password: "CivicOS@123",
  }).expect(200);
  return response.body.accessToken as string;
}

async function cleanup(): Promise<void> {
  if (createdIds.length === 0) return;
  for (const id of createdIds) {
    await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'projectId' = ${id}`;
  }
  await prisma.project.deleteMany({ where: { id: { in: createdIds } } });
}

async function main(): Promise<void> {
  const app = createApp({ otpProvider: { async sendOtp() {} } });
  const [headToken, engineerToken, citizenToken] = await Promise.all([
    internalLogin(app, "head.bwssb@civicos.local", "PROJECT_HEAD"),
    internalLogin(app, "engineer.bwssb@civicos.local", "ENGINEER"),
    citizenLogin(app),
  ]);
  const plannedWork = {
    title: "[Phase 1 verification] BTM distribution-main replacement",
    description: "Replace an aging distribution main and reinstate the affected road surface after pressure testing.",
    categoryId: waterCategoryId,
    wardId: btmWardId,
    priority: "HIGH",
    proposedStart: "2026-12-01T03:30:00.000Z",
    proposedEnd: "2026-12-08T12:30:00.000Z",
    locationLabel: "16th Main Road, BTM Layout 2nd Stage, Bengaluru",
    geometry: { type: "LineString", coordinates: [[77.6075, 12.9142], [77.6125, 12.9142]] },
  };

  try {
    const created = await request(app)
      .post("/civic-works/planned")
      .set("Authorization", `Bearer ${headToken}`)
      .send(plannedWork)
      .expect(201);
    const work = civicWorkSchema.parse(created.body.work);
    createdIds.push(work.id);
    assert.equal(work.ticketId, null);
    assert.equal(work.origin, "AGENCY_PLANNED");
    assert.equal(work.wardId, btmWardId);
    assert.match(work.referenceNumber, /^CW\d{9,}$/);
    assert.deepEqual(work.geometry, plannedWork.geometry);
    assert.ok(work.audit.some(({ action }) => action === "PLANNED_WORK_CREATED"));

    const persisted = await prisma.$queryRaw<Array<{ geometry: string; srid: number }>>`
      SELECT ST_AsGeoJSON("geometry") AS "geometry", ST_SRID("geometry") AS "srid"
      FROM "Project" WHERE "id" = ${work.id}::uuid
    `;
    assert.equal(persisted[0]?.srid, 4326);
    assert.deepEqual(JSON.parse(persisted[0]!.geometry), plannedWork.geometry);

    const filtered = await request(app)
      .get("/civic-works")
      .query({
        wardId: btmWardId,
        agencyId: bwssbAgencyId,
        status: "TIMELINE_SET",
        dateFrom: "2026-12-03T00:00:00.000Z",
        dateTo: "2026-12-04T23:59:59.999Z",
        minLongitude: 77.60,
        minLatitude: 12.90,
        maxLongitude: 77.62,
        maxLatitude: 12.92,
      })
      .set("Authorization", `Bearer ${headToken}`)
      .expect(200);
    assert.ok((filtered.body.works as Array<{ id: string }>).some(({ id }) => id === work.id));

    const calendar = await request(app)
      .get("/civic-works/calendar")
      .query({
        wardId: btmWardId,
        dateFrom: "2026-01-01T00:00:00.000Z",
        dateTo: "2026-12-31T23:59:59.999Z",
        minLongitude: 77.60,
        minLatitude: 12.90,
        maxLongitude: 77.62,
        maxLatitude: 12.92,
      })
      .set("Authorization", `Bearer ${headToken}`)
      .expect(200);
    const calendarWork = (calendar.body.works as unknown[]).map((item) => civicWorkCalendarItemSchema.parse(item)).find(({ id }) => id === work.id);
    assert.ok(calendarWork, "bounded calendar must include the created spatial/date match");
    assert.equal(calendarWork.period, "FUTURE");

    const ledger = await request(app)
      .get("/civic-works/ledger")
      .query({ wardId: btmWardId, limit: 25 })
      .set("Authorization", `Bearer ${headToken}`)
      .expect(200);
    const ledgerWork = (ledger.body.works as unknown[]).map((item) => civicWorkLedgerItemSchema.parse(item)).find(({ id }) => id === work.id);
    assert.ok(ledgerWork, "ward ledger must retain the created work");
    assert.ok(ledgerWork.events.some(({ kind }) => kind === "STATUS" || kind === "AUDIT"));
    assert.equal(ledger.body.location.id, btmWardId);

    await request(app)
      .get("/civic-works/calendar")
      .query({ dateFrom: "2026-01-01T00:00:00.000Z", dateTo: "2026-12-31T23:59:59.999Z" })
      .set("Authorization", `Bearer ${headToken}`)
      .expect(400);
    await request(app)
      .get("/civic-works/ledger")
      .query({ wardId: btmWardId })
      .set("Authorization", `Bearer ${engineerToken}`)
      .expect(403);
    await request(app)
      .get("/civic-works/calendar")
      .query({ wardId: btmWardId, dateFrom: "2026-01-01T00:00:00.000Z", dateTo: "2026-12-31T23:59:59.999Z" })
      .set("Authorization", `Bearer ${citizenToken}`)
      .expect(403);

    await request(app)
      .post("/civic-works/planned")
      .set("Authorization", `Bearer ${engineerToken}`)
      .send(plannedWork)
      .expect(403);
    await request(app)
      .post("/civic-works/planned")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send(plannedWork)
      .expect(403);
    await request(app)
      .post("/civic-works/planned")
      .set("Authorization", `Bearer ${headToken}`)
      .send({ ...plannedWork, proposedEnd: "2026-11-01T00:00:00.000Z" })
      .expect(400);
    await request(app)
      .post("/civic-works/planned")
      .set("Authorization", `Bearer ${headToken}`)
      .send({ ...plannedWork, categoryId: "30000000-0000-4000-8000-000000000002" })
      .expect(422);
    await request(app)
      .post("/civic-works/planned")
      .set("Authorization", `Bearer ${headToken}`)
      .send({ ...plannedWork, geometry: { type: "Point", coordinates: [77.6408, 12.9784] } })
      .expect(422);

    const updated = await request(app)
      .patch(`/civic-works/${work.id}`)
      .set("Authorization", `Bearer ${headToken}`)
      .send({ priority: "URGENT", title: "[Phase 1 verification] Urgent BTM distribution-main replacement" })
      .expect(200);
    assert.equal(updated.body.work.priority, "URGENT");

    const linkedCitizenWork = await prisma.project.findFirst({
      where: { ticket: { reporterId: { not: null } } },
      select: { id: true, ticketId: true, categoryId: true, wardId: true },
    });
    assert.ok(linkedCitizenWork?.ticketId, "existing citizen-ticket project linkage must remain intact");
    assert.ok(linkedCitizenWork.categoryId);
    assert.ok(linkedCitizenWork.wardId);

    const cancelled = await request(app)
      .post(`/civic-works/${work.id}/cancel`)
      .set("Authorization", `Bearer ${headToken}`)
      .send({ reason: "Verification fixture cancellation after registry assertions complete." })
      .expect(200);
    assert.equal(cancelled.body.work.state, "CANCELLED");
    assert.ok(cancelled.body.work.cancelledAt);
    console.log("Civic Work Registry verification passed: creation, RBAC, dates, PostGIS, spatial calendar, location ledger, linkage, update, and cancellation.");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
