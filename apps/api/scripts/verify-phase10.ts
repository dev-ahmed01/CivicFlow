import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { prisma } from "db";
import { createAdminRouter } from "../src/admin/router";
import { createAnalyticsRouter } from "../src/analytics/router";
import { createAuthRouter } from "../src/auth/routes";
import { routeValidatedTicket } from "../src/routing/service";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function containsPiiKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPiiKey);
  if (!value || typeof value !== "object") return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.some(([key, child]) => ["phone", "email", "reporter", "coordinates", "ticketId", "address", "citizenId"].includes(key) || containsPiiKey(child));
}

async function main(): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/auth", createAuthRouter({ async sendOtp() {} }));
  app.use(createAnalyticsRouter());
  app.use("/admin", createAdminRouter());

  const publicResponse = await request(app).get("/analytics/public-dashboard").expect(200);
  assert(!containsPiiKey(publicResponse.body), "Public dashboard exposed a PII or individual-ticket key");
  assert(!JSON.stringify(publicResponse.body).toLowerCase().includes("cost saved"), "Public analytics must not claim unmeasured savings");

  const login = await request(app).post("/auth/internal/login").send({ email: "admin@civicos.local", password: "CivicOS@123" }).expect(200);
  const authorization = `Bearer ${login.body.accessToken as string}`;
  await request(app).put("/admin/config/verification.daily_cap").set("Authorization", authorization).send({ value: 0, description: "Invalid cap must not persist" }).expect(422);
  await request(app).delete("/admin/config/verification.daily_cap").set("Authorization", authorization).expect(409);
  await request(app).post("/admin/users").set("Authorization", authorization).send({ role: "ADMIN", email: "invalid-scope@civicos.local", password: "temporary-password", agencyId: "20000000-0000-4000-8000-000000000003", mustResetPassword: true }).expect(400);
  const [category, agencies, ward] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { adminEditable: true }, orderBy: { name: "asc" } }),
    prisma.agency.findMany({ orderBy: { name: "asc" }, take: 2 }),
    prisma.ward.findFirstOrThrow({ orderBy: { name: "asc" } }),
  ]);
  const targetAgency = agencies.find((agency) => agency.id !== category.primaryAgencyId) ?? agencies[0];
  assert(targetAgency, "Need at least one agency for routing acceptance");
  const ticketId = randomUUID();
  try {
    await request(app).patch(`/admin/categories/${category.id}/routing`).set("Authorization", authorization).send({ primaryAgencyId: targetAgency.id }).expect(200);
    await prisma.$executeRaw`INSERT INTO "Ticket" ("id", "categoryId", "coordinates", "wardId", "state", "title", "address", "updatedAt") VALUES (${ticketId}::uuid, ${category.id}::uuid, ST_SetSRID(ST_MakePoint(77.62, 12.935), 4326), ${ward.id}::uuid, 'PENDING_VALIDATION'::"TicketState", 'Phase 10 live-routing acceptance', 'Acceptance fixture', NOW())`;
    await prisma.$transaction((transaction) => routeValidatedTicket(transaction, ticketId));
    const routed = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { assignedAgencyId: true } });
    assert(routed.assignedAgencyId === targetAgency.id, "The next validated ticket did not use the edited primary routing rule");

    const query = `?wardId=${ward.id}`;
    const report = await request(app).get(`/analytics/admin${query}`).set("Authorization", authorization).expect(200);
    const csv = await request(app).get(`/analytics/admin/export.csv${query}`).set("Authorization", authorization).expect(200);
    assert(csv.text.includes(`"totals","Tickets created","","${report.body.totals.ticketsCreated as number}"`), "CSV totals do not match the filtered on-screen report");
    assert(csv.text.includes("Simulated/Illustrative"), "CSV omitted the simulated label");
    await request(app).get(`/analytics/admin/export.pdf${query}`).set("Authorization", authorization).expect("Content-Type", /application\/pdf/).expect(200);
  } finally {
    await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'ticketId' = ${ticketId}`;
    await prisma.ticket.deleteMany({ where: { id: ticketId } });
    await prisma.category.update({ where: { id: category.id }, data: { primaryAgencyId: category.primaryAgencyId } });
  }
  console.log("Phase 10 acceptance passed: public privacy, live routing, protected config/user integrity, simulated labels, and filtered CSV/PDF exports.");
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
