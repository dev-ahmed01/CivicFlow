import { describe, expect, it } from "vitest";
import { ProjectState } from "db";
import { canSaveTimeline, canStartWork, stateAfterTimelineCheck } from "./lifecycle";

describe("project planning and execution lifecycle", () => {
  it("keeps initial scheduling out of execution", () => {
    expect(canSaveTimeline(ProjectState.UPTAKEN)).toBe(true);
    expect(stateAfterTimelineCheck(null)).toBe(ProjectState.READY_TO_START);
    expect(canStartWork(ProjectState.READY_TO_START)).toBe(true);
  });

  it("preserves active execution when its plan is edited", () => {
    expect(canSaveTimeline(ProjectState.ACTIVE)).toBe(true);
    expect(stateAfterTimelineCheck(new Date("2026-09-01T08:00:00.000Z"))).toBe(ProjectState.ACTIVE);
  });

  it("rejects starting from scheduled and active states", () => {
    expect(canStartWork(ProjectState.CONFLICT_CHECKED)).toBe(false);
    expect(canStartWork(ProjectState.ACTIVE)).toBe(false);
  });
});
