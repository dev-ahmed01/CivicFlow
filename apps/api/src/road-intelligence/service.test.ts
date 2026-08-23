import { describe, expect, it } from "vitest";
import { ProjectState, RoadConflictSeverity, RoadConflictType } from "db";
import { buildSequencingRecommendation, evaluateRoadConflicts, type RoadInterventionRecord } from "./service";

const segmentId = "10000000-0000-4000-8000-000000000001";
const base = new Date("2027-06-01T00:00:00.000Z");

function intervention(index: number, overrides: Partial<RoadInterventionRecord> = {}): RoadInterventionRecord {
  return {
    id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    projectId: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    segmentId,
    agencyId: `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    agencyName: `Agency ${index}`,
    purpose: "pipeline",
    plannedStart: new Date(base.getTime() + index * 86_400_000),
    plannedEnd: new Date(base.getTime() + (index + 2) * 86_400_000),
    affectedLengthM: 100,
    startOffsetM: index * 200,
    dependencyRefs: [],
    createdAt: new Date(base.getTime() + index * 1_000),
    projectState: ProjectState.ACTIVE,
    hasUnresolvedDependencies: false,
    ...overrides,
  };
}

function types(records: RoadInterventionRecord[], restoration: Date | null = null): RoadConflictType[] {
  return evaluateRoadConflicts(records[0]!.projectId, records, restoration, 90).map((item) => item.type);
}

describe("Phase 8 road conflict fixtures", () => {
  it("detects exact-segment spatial chainage overlap independently of dates", () => {
    const first = intervention(1, { startOffsetM: 10, affectedLengthM: 100, plannedEnd: new Date("2027-06-03T00:00:00.000Z") });
    const second = intervention(2, { startOffsetM: 80, affectedLengthM: 40, plannedStart: new Date("2027-07-01T00:00:00.000Z"), plannedEnd: new Date("2027-07-02T00:00:00.000Z") });
    expect(types([first, second])).toContain(RoadConflictType.SPATIAL);
  });

  it("detects temporal overlap independently of chainage", () => {
    const first = intervention(1, { startOffsetM: 0, affectedLengthM: 20 });
    const second = intervention(2, { startOffsetM: 500, affectedLengthM: 20, plannedStart: first.plannedStart, plannedEnd: first.plannedEnd });
    expect(types([first, second])).toContain(RoadConflictType.TEMPORAL);
  });

  it("detects a declared dependency that is not WORK_COMPLETED", () => {
    const dependency = intervention(2, { projectState: ProjectState.ACTIVE });
    const dependent = intervention(1, { purpose: "cable", dependencyRefs: [dependency.id], plannedStart: new Date("2027-06-02T00:00:00.000Z") });
    const result = evaluateRoadConflicts(dependent.projectId, [dependent, dependency], null, 90);
    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ type: RoadConflictType.SEQUENCING_VIOLATION, severity: RoadConflictSeverity.HIGH })]));
  });

  it("detects restoration before utility work completion", () => {
    const restoration = intervention(1, { purpose: "resurfacing", plannedStart: new Date("2027-06-20T00:00:00.000Z"), plannedEnd: new Date("2027-06-24T00:00:00.000Z") });
    const utility = intervention(2, { purpose: "pipeline", projectState: ProjectState.ACTIVE, plannedStart: new Date("2027-06-10T00:00:00.000Z"), plannedEnd: new Date("2027-06-16T00:00:00.000Z") });
    expect(types([restoration, utility])).toContain(RoadConflictType.RESTORATION_TOO_EARLY);
  });

  it("detects the configured repeated-excavation window with no peer record", () => {
    const source = intervention(1, { plannedStart: new Date("2027-06-20T00:00:00.000Z") });
    const result = evaluateRoadConflicts(source.projectId, [source], new Date("2027-04-01T00:00:00.000Z"), 90);
    expect(result).toEqual([expect.objectContaining({ type: RoadConflictType.REPEATED_EXCAVATION_RISK, severity: RoadConflictSeverity.MEDIUM })]);
  });

  it("flags a same-agency, same-purpose, date-overlap duplicate for manual review", () => {
    const first = intervention(1, { purpose: "OFC" });
    const second = intervention(2, { agencyId: first.agencyId, agencyName: first.agencyName, purpose: "OFC", plannedStart: first.plannedStart, plannedEnd: first.plannedEnd });
    const result = evaluateRoadConflicts(first.projectId, [first, second], null, 90);
    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ type: RoadConflictType.DUPLICATE_INTERVENTION, reason: expect.stringContaining("never auto-merge") })]));
  });
});

describe("sequencing recommendation", () => {
  it("orders dependencies before utilities, adds consolidated restoration, and carries all six rule traces", () => {
    const pipeline = intervention(1, { purpose: "pipeline", agencyName: "BWSSB" });
    const cable = intervention(2, { purpose: "cable", agencyName: "BESCOM", dependencyRefs: [pipeline.id] });
    const resurfacing = intervention(3, { purpose: "resurfacing", agencyName: "PWD", plannedStart: new Date("2027-06-20T00:00:00.000Z") });
    const recommendation = buildSequencingRecommendation([resurfacing, cable, pipeline]);
    expect(recommendation?.proposedOrder.map((item) => item.purpose)).toEqual(["pipeline", "cable", "consolidated restoration", "resurfacing"]);
    expect(recommendation?.ruleTrace.map((item) => item.rule)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(recommendation?.explanation).toContain("will likely require re-cutting");
  });
});
