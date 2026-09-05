import { describe, expect, it } from "vitest";
import { inspectionAction, isDependencyOpen, matchesInspectionFilter } from "./presentation";

const now = Date.parse("2026-09-05T12:00:00Z");
const past = new Date("2026-09-04T12:00:00Z");
const future = new Date("2026-09-06T12:00:00Z");

describe("Engineer inspection queues", () => {
  it("keeps overdue open inspections visible and excludes submitted assessments", () => {
    expect(matchesInspectionFilter({ status: "IN_PROGRESS", deadline: past }, "Overdue", now)).toBe(true);
    expect(matchesInspectionFilter({ status: "ASSIGNED", deadline: future }, "Overdue", now)).toBe(false);
    expect(matchesInspectionFilter({ status: "SUBMITTED", deadline: past }, "Overdue", now)).toBe(false);
    expect(matchesInspectionFilter({ status: "REVIEWED", deadline: past }, "Overdue", now)).toBe(false);
  });

  it("includes both submitted and reviewed assessments under Completed", () => {
    expect(matchesInspectionFilter({ status: "SUBMITTED", deadline: past }, "Completed", now)).toBe(true);
    expect(matchesInspectionFilter({ status: "REVIEWED", deadline: past }, "Completed", now)).toBe(true);
    expect(matchesInspectionFilter({ status: "ACCEPTED", deadline: past }, "Completed", now)).toBe(false);
  });

  it("retains the separate acceptance and start steps", () => {
    expect(inspectionAction("ASSIGNED")).toBe("Review assignment");
    expect(inspectionAction("ACCEPTED")).toBe("Start inspection");
    expect(inspectionAction("IN_PROGRESS")).toBe("Continue");
    expect(matchesInspectionFilter({ status: "ACCEPTED", deadline: future }, "Accepted", now)).toBe(true);
    expect(matchesInspectionFilter({ status: "ACCEPTED", deadline: future }, "In progress", now)).toBe(false);
  });
});

describe("Engineer dependency queues", () => {
  it("does not treat either declined outcome or fulfillment as an open task", () => {
    expect(isDependencyOpen({ state: "FULFILLED" })).toBe(false);
    expect(isDependencyOpen({ state: "DECLINED_UNAVAILABLE" })).toBe(false);
    expect(isDependencyOpen({ state: "DECLINED_NOT_CONCERNED" })).toBe(false);
    expect(isDependencyOpen({ state: "ASSIGNED" })).toBe(true);
    expect(isDependencyOpen({ state: "ESCALATED" })).toBe(true);
  });
});
