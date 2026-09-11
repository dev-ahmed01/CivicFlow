import { describe, expect, it } from "vitest";
import { ACTIVE_PROJECT_STATES, COMPLETED_ENGINEER_WORK_STATES, ENGINEER_STAGE_STATES, engineerWorkload, projectPipelineStage, dependencyNeedsAttention } from "./work-states";
import { eligibleMappedWorks } from "./mapped-work";
import { collectPages } from "./pagination";

describe("canonical count/list semantics", () => {
  it("uses identical active and completion filters across groupings", () => {
    const states = ["CREATED", "PENDING_UPTAKE", "UPTAKEN", "TIMELINE_SET", "CONFLICT_CHECKED", "READY_TO_START", "ACTIVE", "MODIFIED", "COMPLETED", "AWAITING_VERIFICATION", "CLOSED", "CANCELLED"];
    expect(states.filter((state) => projectPipelineStage(state) === "ACTIVE")).toEqual(ACTIVE_PROJECT_STATES);
    expect(ENGINEER_STAGE_STATES.active).toEqual(ACTIVE_PROJECT_STATES);
    expect(ENGINEER_STAGE_STATES.completed).toEqual(COMPLETED_ENGINEER_WORK_STATES);
    expect(new Set(Object.values(ENGINEER_STAGE_STATES).flat()).size).toBe(Object.values(ENGINEER_STAGE_STATES).flat().length);
  });
  it("derives all three workload bands and counts an inspection deadline only once", () => {
    const now = Date.now();
    expect(engineerWorkload([{ state: "ACTIVE" }], [], [], now).loadLabel).toBe("Available");
    expect(engineerWorkload([{ state: "ACTIVE" }], [{ deadline: new Date(now + 1000) }], [], now).loadLabel).toBe("Moderate load");
    const result = engineerWorkload([{ state: "ACTIVE" }, { state: "MODIFIED" }], [{ deadline: new Date(now - 1000) }], [{ type: "COMPLETE_INSPECTION", deadline: new Date(now - 1000) }], now);
    expect(result).toMatchObject({ activeWorks: 2, pendingInspections: 1, overdueTasks: 1, loadLabel: "High load" });
  });
  it("ignores fulfilled deadlines and includes unanswered dependencies", () => {
    const now = Date.now();
    expect(dependencyNeedsAttention({ state: "FULFILLED", deadline: new Date(now - 1000) }, now)).toBe(false);
    expect(dependencyNeedsAttention({ state: "PENDING_RESPONSE", deadline: new Date(now + 1000) }, now)).toBe(true);
  });
  it("counts only unique renderable map locations", () => {
    const valid = { id: "one", geometry: { type: "Point", coordinates: [77.61, 12.91] } };
    expect(eligibleMappedWorks([valid, valid, { id: "missing", geometry: null }, { id: "empty", geometry: { type: "LineString", coordinates: [] } }, { id: "invalid", geometry: { type: "Point", coordinates: [NaN, 12] } }])).toEqual([valid]);
  });
  it("counts all pages including records after the first 50", async () => {
    const values = await collectPages(async (page) => ({ items: Array.from({ length: page === 1 ? 50 : 7 }, (_, i) => (page - 1) * 50 + i), pagination: { page, limit: 50, total: 57, totalPages: 2 } }));
    expect(values).toHaveLength(57);
    expect(new Set(values).size).toBe(57);
  });
});
