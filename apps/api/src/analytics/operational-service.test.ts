import { beforeEach, describe, expect, it, vi } from "vitest";

const projectFindMany = vi.hoisted(() => vi.fn());
const conflictFindMany = vi.hoisted(() => vi.fn());
const roadConflictFindMany = vi.hoisted(() => vi.fn());
const dependencyFindMany = vi.hoisted(() => vi.fn());
const coordinationFindMany = vi.hoisted(() => vi.fn());
const completionEvidenceFindMany = vi.hoisted(() => vi.fn());
const sequencingCount = vi.hoisted(() => vi.fn());

vi.mock("db", () => ({
  prisma: {
    project: { findMany: projectFindMany },
    conflictLog: { findMany: conflictFindMany },
    roadConflictLog: { findMany: roadConflictFindMany },
    dependency: { findMany: dependencyFindMany },
    coordinationRequest: { findMany: coordinationFindMany },
    completionEvidence: { findMany: completionEvidenceFindMany },
    sequencingRecommendationLog: { count: sequencingCount },
  },
  CompletionVerificationDecision: { VERIFIED: "VERIFIED", REWORK_REQUESTED: "REWORK_REQUESTED" },
  CoordinationStatus: {
    DRAFT: "DRAFT", SENT: "SENT", ACKNOWLEDGED: "ACKNOWLEDGED", CLARIFICATION_REQUESTED: "CLARIFICATION_REQUESTED",
    INSPECTION_REQUIRED: "INSPECTION_REQUIRED", ENGINEER_ASSIGNED: "ENGINEER_ASSIGNED", ACCEPTED: "ACCEPTED",
    IN_PROGRESS: "IN_PROGRESS", COMPLETED: "COMPLETED", CLOSED: "CLOSED", REJECTED: "REJECTED",
  },
  DependencyState: {
    REQUESTED: "REQUESTED", PENDING_RESPONSE: "PENDING_RESPONSE", ASSIGNED: "ASSIGNED", DECLINED_UNAVAILABLE: "DECLINED_UNAVAILABLE",
    DECLINED_NOT_CONCERNED: "DECLINED_NOT_CONCERNED", ESCALATED: "ESCALATED", FULFILLED: "FULFILLED",
  },
  ProjectState: {
    CREATED: "CREATED", PENDING_UPTAKE: "PENDING_UPTAKE", UPTAKEN: "UPTAKEN", TIMELINE_SET: "TIMELINE_SET",
    CONFLICT_CHECKED: "CONFLICT_CHECKED", ACTIVE: "ACTIVE", COMPLETED: "COMPLETED", AWAITING_VERIFICATION: "AWAITING_VERIFICATION",
    CLOSED: "CLOSED", CANCELLED: "CANCELLED",
  },
  RoadConflictType: { REPEATED_EXCAVATION_RISK: "REPEATED_EXCAVATION_RISK", DUPLICATE_INTERVENTION: "DUPLICATE_INTERVENTION" },
  TicketState: { RESOLVED: "RESOLVED", CLOSED: "CLOSED" },
}));

import { buildOperationalAnalytics } from "./operational-service";

const p1 = {
  id: "project-1", referenceNumber: "CW-001", title: "Water main repair", state: "ACTIVE", createdAt: new Date("2026-01-01T00:00:00Z"),
  actualStart: new Date("2026-01-10T00:00:00Z"), agency: { id: "agency-1", name: "BWSSB" }, ward: { id: "ward-1", name: "Jayanagar" },
  category: { id: "category-1", name: "Water" }, ticket: { state: "CLOSED" }, stateTransitions: [],
};
const p2 = {
  id: "project-2", referenceNumber: "CW-002", title: "Cable trench", state: "TIMELINE_SET", createdAt: new Date("2026-01-02T00:00:00Z"),
  actualStart: null, agency: { id: "agency-2", name: "BESCOM" }, ward: { id: "ward-1", name: "Jayanagar" },
  category: { id: "category-2", name: "Electrical" }, ticket: null, stateTransitions: [],
};

describe("Phase 7 operational analytics queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectFindMany.mockResolvedValue([p2, p1]);
    conflictFindMany.mockResolvedValue([{
      id: "conflict-1", projectId: p1.id, createdAt: new Date("2026-01-05T00:00:00Z"), severity: "PROMINENT",
      locationDescription: "Same carriageway", conflictingProject: { referenceNumber: p2.referenceNumber, title: p2.title },
      projectAgency: { name: "BWSSB" }, conflictingAgency: { name: "BESCOM" }, coordinationRequests: [{ status: "CLOSED" }],
    }]);
    roadConflictFindMany.mockResolvedValue([{
      id: "road-conflict-1", projectId: p2.id, segmentId: "segment-1", createdAt: new Date("2026-01-06T00:00:00Z"),
      type: "REPEATED_EXCAVATION_RISK", severity: "MEDIUM", reason: "Recently restored", segment: { roadName: "11th Main" },
      conflictingProject: null, projectAgency: { name: "BESCOM" }, conflictingAgency: null, coordinationRequests: [],
      project: { intervention: { affectedLengthM: 120 } },
    }]);
    dependencyFindMany.mockResolvedValue([{
      id: "dependency-1", projectId: p1.id, state: "ASSIGNED", requirement: "Valve isolation", deadline: new Date("2026-01-03T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"), respondedAt: new Date("2026-01-02T00:00:00Z"), requestingAgency: { name: "BWSSB" },
      respondingAgency: { name: "BESCOM" }, stateTransitions: [{ toState: "ASSIGNED", createdAt: new Date("2026-01-01T12:00:00Z") }],
    }]);
    coordinationFindMany.mockResolvedValue([
      { id: "coordination-1", projectId: p1.id, subject: "Joint inspection", status: "CLOSED", sentAt: new Date("2026-01-02T00:00:00Z"), closedAt: new Date("2026-01-03T00:00:00Z"), responseDeadline: new Date("2026-01-04T00:00:00Z"), requestingAgency: { name: "BWSSB" }, respondingAgency: { name: "BESCOM" } },
      { id: "coordination-2", projectId: p2.id, subject: "Schedule alignment", status: "SENT", sentAt: new Date("2026-01-02T00:00:00Z"), closedAt: null, responseDeadline: new Date("2026-01-04T00:00:00Z"), requestingAgency: { name: "BESCOM" }, respondingAgency: { name: "BWSSB" } },
    ]);
    completionEvidenceFindMany.mockResolvedValue([{
      id: "evidence-1", projectId: p1.id, createdAt: new Date("2026-01-12T00:00:00Z"),
      verifications: [{ decision: "VERIFIED", createdAt: new Date("2026-01-13T00:00:00Z") }],
    }]);
    sequencingCount.mockResolvedValue(1);
  });

  it("derives conservation and turnaround metrics only from linked records", async () => {
    const report = await buildOperationalAnalytics({}, new Date("2026-01-10T00:00:00Z"));
    const values = new Map(report.metrics.map((item) => [item.key, item.value]));

    expect(values.get("conflicts-before-execution")).toBe(2);
    expect(values.get("conflicts-resolved")).toBe(1);
    expect(values.get("dependency-response-time")).toBe(12);
    expect(values.get("works-blocked")).toBe(1);
    expect(values.get("coordination-turnaround")).toBe(24);
    expect(values.get("repeated-excavation")).toBe(1);
    expect(values.get("first-time-completion")).toBe(100);
    expect(values.get("verified-closure")).toBe(100);
    expect(values.get("overdue-coordination")).toBe(1);
    expect(report.conservationInputs).toMatchObject({ repeatedRiskSegments: 1, affectedLengthMeters: 120, acceptedSequencingRecommendations: 1 });
    expect(JSON.stringify(report).toLowerCase()).not.toMatch(/₹|rupee|crore|amountinr|cost saved/);
    expect(report.details["conflicts-resolved"][0]).toMatchObject({ id: "conflict-1", relatedReference: "CW-002" });
  });

  it("scopes every downstream query to the filtered work cohort", async () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-01-31T23:59:59Z");
    await buildOperationalAnalytics({ agencyId: "agency-1", wardId: "ward-1", categoryId: "category-1", from, to });

    expect(projectFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      agencyId: "agency-1", wardId: "ward-1", categoryId: "category-1", createdAt: { gte: from, lte: to },
    } }));
    for (const query of [conflictFindMany, roadConflictFindMany, dependencyFindMany, coordinationFindMany, completionEvidenceFindMany]) {
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ projectId: { in: [p2.id, p1.id] } }) }));
    }
  });

  it("returns null rates and averages when the database has no qualifying evidence", async () => {
    projectFindMany.mockResolvedValue([]);
    conflictFindMany.mockResolvedValue([]);
    roadConflictFindMany.mockResolvedValue([]);
    dependencyFindMany.mockResolvedValue([]);
    coordinationFindMany.mockResolvedValue([]);
    completionEvidenceFindMany.mockResolvedValue([]);

    const report = await buildOperationalAnalytics({});
    const values = new Map(report.metrics.map((item) => [item.key, item.value]));
    expect(values.get("dependency-response-time")).toBeNull();
    expect(values.get("coordination-turnaround")).toBeNull();
    expect(values.get("first-time-completion")).toBeNull();
    expect(values.get("verified-closure")).toBeNull();
    expect(sequencingCount).not.toHaveBeenCalled();
  });
});
