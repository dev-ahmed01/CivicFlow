import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsReport, PublicDashboard } from "@civicos/shared";

process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
process.env.JWT_ACCESS_SECRET = "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-that-is-at-least-32-characters";

const publicDashboard: PublicDashboard = {
  generatedAt: "2026-08-23T00:00:00.000Z",
  totals: { ticketsCreated: 2, ticketsResolved: 1, resolutionRatePercent: 50, roadConflicts: 1 },
  categoryBreakdown: [{ dimension: "Road Damage", count: 1, total: 2, ratePercent: 50 }],
  agencyPerformance: [{ agencyId: "20000000-0000-4000-8000-000000000003", agency: "PWD", created: 2, resolved: 1, resolutionRatePercent: 50, averageResolutionHours: 12 }],
  roadMetrics: { conflictsByType: [{ dimension: "TEMPORAL", count: 1 }] },
  privacyNotice: "Aggregated only",
};

vi.mock("./service", () => ({
  buildPublicDashboard: vi.fn(async () => ({
    generatedAt: "2026-08-23T00:00:00.000Z",
    totals: { ticketsCreated: 2, ticketsResolved: 1, resolutionRatePercent: 50, roadConflicts: 1 },
    categoryBreakdown: [{ dimension: "Road Damage", count: 1, total: 2, ratePercent: 50 }],
    agencyPerformance: [],
    roadMetrics: { conflictsByType: [] },
    privacyNotice: "Aggregated only",
  })),
  buildAnalyticsReport: vi.fn(),
}));

vi.mock("./operational-service", () => ({
  buildOperationalAnalytics: vi.fn(),
}));

import { createAnalyticsRouter, reportCsv, simplePdf } from "./router";
import express from "express";
import { buildOperationalAnalytics } from "./operational-service";

function privateApp(role: "PROJECT_HEAD" | "ENGINEER" | "CITIZEN" = "PROJECT_HEAD", agencyId: string | null = "20000000-0000-4000-8000-000000000001", reset = false) {
  const app = express();
  app.use((req, _res, next) => { req.auth = { userId: "u", role, agencyId, wardId: null, mustResetPassword: reset }; next(); });
  app.use(createAnalyticsRouter()); return app;
}

const report: AnalyticsReport = {
  generatedAt: publicDashboard.generatedAt,
  filters: { wardId: "10000000-0000-4000-8000-000000000001" },
  totals: publicDashboard.totals,
  ticketsByCategory: publicDashboard.categoryBreakdown,
  ticketsByWard: [], ticketsByPeriod: [], validationTimeByWard: [], inspectionTimeByAgency: [],
  resolutionTimeByCategoryAgency: [], dependencyResponseByAgency: [], dependencyEscalationByAgency: [],
  validatorParticipationByWard: [], conflictsByWardAgencyPair: [], reworkByAgencyEngineer: [],
  citizenNotResolvedByAgency: [], roadConflictsByWardType: [], repeatedExcavationsAvoidedBySegmentAgency: [],
  sequencingOutcomesByAgency: [],
};

describe("Phase 10 analytics surfaces", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serves the aggregate public dashboard without authentication or PII fields", async () => {
    const app = express(); app.use(createAnalyticsRouter());
    const response = await request(app).get("/analytics/public-dashboard").expect(200);
    const serialized = JSON.stringify(response.body).toLowerCase();
    expect(response.body.totals.ticketsCreated).toBe(2);
    expect(serialized).not.toContain("phone");
    expect(serialized).not.toContain("reporter");
    expect(serialized).not.toContain("coordinates");
    expect(serialized).not.toContain("ticketid");
  });

  it("does not expose a city-wide private report", async () => {
    const app = express(); app.use(createAnalyticsRouter());
    await request(app).get("/analytics/city-wide").expect(404);
    await request(app).get("/analytics/city-wide/operations").expect(404);
  });

  it("requires authentication, Project Head role, agency and completed password reset", async () => {
    const anonymous = express(); anonymous.use(createAnalyticsRouter());
    await request(anonymous).get("/analytics/project-head/operations").expect(401);
    for (const app of [privateApp("ENGINEER"), privateApp("CITIZEN"), privateApp("PROJECT_HEAD", null), privateApp("PROJECT_HEAD", "a", true)]) await request(app).get("/analytics/project-head/operations").expect(403);
    expect(buildOperationalAnalytics).not.toHaveBeenCalled();
  });
  it("overrides arbitrary browser agency scope with authenticated agency", async () => {
    vi.mocked(buildOperationalAnalytics).mockResolvedValue({ metrics: [] } as unknown as Awaited<ReturnType<typeof buildOperationalAnalytics>>);
    const response = await request(privateApp()).get("/analytics/project-head/operations?preset=last7&agencyId=foreign&wardId=10000000-0000-4000-8000-000000000001&categoryId=30000000-0000-4000-8000-000000000001").expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(buildOperationalAnalytics).toHaveBeenCalledWith({ agencyId: "20000000-0000-4000-8000-000000000001", wardId: "10000000-0000-4000-8000-000000000001", categoryId: "30000000-0000-4000-8000-000000000001" }, expect.any(Date), "last7");
  });
  it.each(["preset=invalid", "wardId=invalid", "preset=custom&from=2026-02-30&to=2026-03-01", "preset=custom&from=2026-01-01", "preset=custom&from=2026-01-10&to=2026-01-01"])("rejects invalid Insights filter %s", async query => {
    await request(privateApp()).get(`/analytics/project-head/operations?${query}`).expect(400);
    expect(buildOperationalAnalytics).not.toHaveBeenCalled();
  });

  it("exports operational rows without a fabricated financial-savings claim", () => {
    const csv = reportCsv(report);
    expect(csv).toContain("Road Damage");
    expect(csv.toLowerCase()).not.toMatch(/cost saved|crore|amountinr/);
    expect(simplePdf(report).subarray(0, 8).toString()).toBe("%PDF-1.4");
  });
});
