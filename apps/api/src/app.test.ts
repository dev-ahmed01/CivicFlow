import request from "supertest";
import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "db";
import { createApp } from "./app";
import type { OtpProvider } from "./auth/otp-provider";

const accessSecret = "test-access-secret-that-is-at-least-32-characters";
process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
process.env.JWT_ACCESS_SECRET = accessSecret;
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-that-is-at-least-32-characters";

vi.mock("./analytics/service", () => ({
  buildPublicDashboard: vi.fn(async () => ({
    generatedAt: "2026-08-24T00:00:00.000Z",
    totals: { ticketsCreated: 0, ticketsResolved: 0, resolutionRatePercent: 0, roadConflicts: 0 },
    categoryBreakdown: [],
    agencyPerformance: [],
    roadMetrics: { conflictsByType: [] },
    privacyNotice: "Aggregated only",
  })),
  buildAnalyticsReport: vi.fn(),
  buildProjectHeadPerformance: vi.fn(),
}));

const noopOtpProvider: OtpProvider = {
  async sendOtp() {},
};

function mockCurrentUser(role: "CITIZEN" | "PROJECT_HEAD", mustResetPassword = false) {
  vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
    id: "40000000-0000-4000-8000-000000000001",
    role,
    agencyId: role === "PROJECT_HEAD" ? "20000000-0000-4000-8000-000000000003" : null,
    wardId: null,
    mustResetPassword,
  } as never);
}

function accessToken(
  role: "CITIZEN" | "PROJECT_HEAD",
  mustResetPassword = false,
) {
  return jwt.sign(
    {
      role,
      agencyId: null,
      wardId: null,
      mustResetPassword,
      tokenType: "access",
    },
    accessSecret,
    {
      subject: "40000000-0000-4000-8000-000000000001",
      expiresIn: "15m",
      issuer: "civicos-api",
      audience: "civicos-clients",
    },
  );
}

describe("RBAC middleware", () => {
  const app = createApp(noopOtpProvider);
  afterEach(() => vi.restoreAllMocks());

  it("returns 401 without authentication", async () => {
    await request(app).get("/protected/project-head").expect(401);
  });

  it("serves the public dashboard before root-level authenticated routers", async () => {
    const response = await request(app).get("/analytics/public-dashboard").expect(200);
    expect(response.body.privacyNotice).toBe("Aggregated only");
  });

  it("serves citizens only the allowlisted Nearby Works fields", async () => {
    mockCurrentUser("CITIZEN");
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([{
      id: "90000000-0000-4000-8000-000000000001",
      referenceNumber: "CW-202608-0001",
      workType: "Road Damage",
      agency: "PWD",
      ward: "Jayanagar",
      latitude: 12.93,
      longitude: 77.584,
      distanceMeters: 144,
      state: "ACTIVE",
      plannedStart: new Date("2026-08-20T00:00:00.000Z"),
      plannedEnd: new Date("2026-09-02T00:00:00.000Z"),
      actualCompletion: null,
    }] as never);

    const response = await request(app)
      .get("/civic-works/nearby?latitude=12.93&longitude=77.58")
      .set("Authorization", `Bearer ${accessToken("CITIZEN")}`)
      .expect(200);

    expect(Object.keys(response.body.works[0]).sort()).toEqual([
      "agency", "approximateLocation", "completedAt", "completionStatus", "distanceMeters", "expectedCompletion",
      "id", "plannedStart", "publicProgress", "referenceNumber", "status", "statusLabel", "workType",
    ].sort());
    expect(JSON.stringify(response.body)).not.toMatch(/engineer|attachment|evidence|dependency|conflict|comment|discussion|purpose/i);
  });

  it("does not expose the citizen Nearby Works endpoint to operational roles", async () => {
    mockCurrentUser("PROJECT_HEAD");
    await request(app)
      .get("/civic-works/nearby?latitude=12.93&longitude=77.58")
      .set("Authorization", `Bearer ${accessToken("PROJECT_HEAD")}`)
      .expect(403);
  });

  it("returns 403 to a citizen", async () => {
    mockCurrentUser("CITIZEN");
    await request(app)
      .get("/protected/project-head")
      .set("Authorization", `Bearer ${accessToken("CITIZEN")}`)
      .expect(403);
  });

  it("uses the current database role instead of a stale elevated token claim", async () => {
    mockCurrentUser("CITIZEN");
    await request(app)
      .get("/protected/project-head")
      .set("Authorization", `Bearer ${accessToken("PROJECT_HEAD")}`)
      .expect(403);
  });

  it("allows a Project Head", async () => {
    mockCurrentUser("PROJECT_HEAD");
    const response = await request(app)
      .get("/protected/project-head")
      .set("Authorization", `Bearer ${accessToken("PROJECT_HEAD")}`)
      .expect(200);
    expect(response.body.message).toBe("Project Head access granted");
  });

  it("forces first-login Project Heads through password reset", async () => {
    mockCurrentUser("PROJECT_HEAD", true);
    const response = await request(app)
      .get("/protected/project-head")
      .set("Authorization", `Bearer ${accessToken("PROJECT_HEAD", true)}`)
      .expect(403);
    expect(response.body.code).toBe("PASSWORD_RESET_REQUIRED");
  });
});
