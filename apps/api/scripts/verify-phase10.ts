import "dotenv/config";
import express from "express";
import request from "supertest";
import { prisma } from "db";
import { createAnalyticsRouter, reportCsv, simplePdf } from "../src/analytics/router";
import { createAuthRouter } from "../src/auth/routes";

const demoInternalPassword = process.env.DEMO_INTERNAL_PASSWORD ?? "CivicOS@123";
const pwdAgencyId = "20000000-0000-4000-8000-000000000003";
const bwssbAgencyId = "20000000-0000-4000-8000-000000000001";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function containsPiiKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPiiKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
    ["phone", "email", "reporter", "coordinates", "ticketId", "address", "citizenId"].includes(key) || containsPiiKey(child));
}

async function main(): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/auth", createAuthRouter({ async sendOtp() {} }));
  app.use(createAnalyticsRouter());

  const publicResponse = await request(app).get("/analytics/public-dashboard").expect(200);
  assert(!containsPiiKey(publicResponse.body), "Public dashboard exposed a PII or individual-ticket key");
  assert(!JSON.stringify(publicResponse.body).toLowerCase().includes("cost saved"), "Public analytics must not claim unmeasured savings");

  const login = await request(app).post("/auth/internal/login").send({
    email: "head.pwd@civicos.local",
    password: demoInternalPassword,
    expectedRole: "PROJECT_HEAD",
  }).expect(200);
  const authorization = `Bearer ${login.body.accessToken as string}`;

  const ownReport = await request(app).get("/analytics/project-head").set("Authorization", authorization).expect(200);
  assert(ownReport.body.filters.agencyId === pwdAgencyId, "Project Head analytics did not retain agency scope");
  const crossAgencyAttempt = await request(app).get(`/analytics/project-head?agencyId=${bwssbAgencyId}`).set("Authorization", authorization).expect(200);
  assert(crossAgencyAttempt.body.filters.agencyId === pwdAgencyId, "Project Head analytics accepted another agency scope");

  await request(app).get("/admin/users").set("Authorization", authorization).expect(404);
  await request(app).get("/analytics/city-wide").set("Authorization", authorization).expect(404);

  const csv = reportCsv(ownReport.body);
  assert(!/cost saved|crore|amountinr/i.test(csv), "CSV introduced an unmeasured financial-savings claim");
  assert(simplePdf(ownReport.body).subarray(0, 8).toString() === "%PDF-1.4", "PDF export helper returned an invalid document");

  console.log("Phase 10 compatibility acceptance passed: public privacy, agency-scoped Project Head analytics, retired global surfaces, and no fabricated savings claims.");
}

main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
