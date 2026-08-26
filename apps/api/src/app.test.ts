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
    roadMetrics: {
      conflictsByType: [],
      simulatedRestorationCostSaved: {
        amountInr: 0,
        label: "Simulated/Illustrative",
        formula: "No accepted recommendations",
        unitCostPerMeterInr: 1800,
        avoidedReworkFactor: 0.65,
        qualifyingAcceptedRecommendations: 0,
        affectedLengthMeters: 0,
      },
    },
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
