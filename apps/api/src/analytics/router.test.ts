import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsReport, PublicDashboard } from "@civicos/shared";

process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
process.env.JWT_ACCESS_SECRET = "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-that-is-at-least-32-characters";

const simulated = {
  amountInr: 117000,
  label: "Simulated/Illustrative" as const,
  formula: "accepted × metres × unit cost × factor",
  unitCostPerMeterInr: 1800,
  avoidedReworkFactor: 0.65,
  qualifyingAcceptedRecommendations: 1,
  affectedLengthMeters: 100,
};
const publicDashboard: PublicDashboard = {
  generatedAt: "2026-08-23T00:00:00.000Z",
  totals: { ticketsCreated: 2, ticketsResolved: 1, resolutionRatePercent: 50, roadConflicts: 1 },
  categoryBreakdown: [{ dimension: "Road Damage", count: 1, total: 2, ratePercent: 50 }],
  agencyPerformance: [{ agencyId: "20000000-0000-4000-8000-000000000003", agency: "PWD", created: 2, resolved: 1, resolutionRatePercent: 50, averageResolutionHours: 12 }],
  roadMetrics: { conflictsByType: [{ dimension: "TEMPORAL", count: 1 }], simulatedRestorationCostSaved: simulated },
  privacyNotice: "Aggregated only",
};

vi.mock("./service", () => ({
  buildPublicDashboard: vi.fn(async () => ({
    generatedAt: "2026-08-23T00:00:00.000Z",
    totals: { ticketsCreated: 2, ticketsResolved: 1, resolutionRatePercent: 50, roadConflicts: 1 },
    categoryBreakdown: [{ dimension: "Road Damage", count: 1, total: 2, ratePercent: 50 }],
    agencyPerformance: [],
    roadMetrics: { conflictsByType: [], simulatedRestorationCostSaved: { amountInr: 117000, label: "Simulated/Illustrative", formula: "formula", unitCostPerMeterInr: 1800, avoidedReworkFactor: 0.65, qualifyingAcceptedRecommendations: 1, affectedLengthMeters: 100 } },
    privacyNotice: "Aggregated only",
  })),
  buildAnalyticsReport: vi.fn(),
}));

import { createAnalyticsRouter, reportCsv, simplePdf } from "./router";
import express from "express";

const report: AnalyticsReport = {
  generatedAt: publicDashboard.generatedAt,
  filters: { wardId: "10000000-0000-4000-8000-000000000001" },
  totals: publicDashboard.totals,
  ticketsByCategory: publicDashboard.categoryBreakdown,
  ticketsByWard: [], ticketsByPeriod: [], validationTimeByWard: [], inspectionTimeByAgency: [],
  resolutionTimeByCategoryAgency: [], dependencyResponseByAgency: [], dependencyEscalationByAgency: [],
  validatorParticipationByWard: [], conflictsByWardAgencyPair: [], reworkByAgencyEngineer: [],
  citizenNotResolvedByAgency: [], roadConflictsByWardType: [], repeatedExcavationsAvoidedBySegmentAgency: [],
  sequencingOutcomesByAgency: [], simulatedRestorationCostSaved: simulated,
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

  it("protects the city-wide admin report", async () => {
    const app = express(); app.use(createAnalyticsRouter());
    await request(app).get("/analytics/admin").expect(401);
  });

  it("exports report rows and the simulated label from the same report object", () => {
    const csv = reportCsv(report);
    expect(csv).toContain("Road Damage");
    expect(csv).toContain("Simulated/Illustrative");
    expect(simplePdf(report).subarray(0, 8).toString()).toBe("%PDF-1.4");
  });
});
