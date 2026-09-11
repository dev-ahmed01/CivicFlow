import { describe, expect, it } from "vitest";
import { lifecycleGroup, pipelineStage } from "./pipeline";

describe("Project Head work pipeline", () => {
  it("groups the display lifecycle without promoting planning to execution", () => {
    expect(lifecycleGroup("ticket", "INSPECTION_COMPLETE")).toBe("UPCOMING");
    expect(lifecycleGroup("project", "UPTAKEN")).toBe("UPCOMING");
    expect(lifecycleGroup("project", "MODIFIED")).toBe("ONGOING");
    expect(lifecycleGroup("project", "ACTIVE")).toBe("ONGOING");
    expect(lifecycleGroup("project", "COMPLETED")).toBe("REVIEW");
    expect(lifecycleGroup("project", "CLOSED")).toBe("COMPLETED");
    expect(lifecycleGroup("project", "CANCELLED")).toBe("COMPLETED");
  });
  it("keeps intake and inspection decisions distinct", () => {
    expect(pipelineStage("ticket", "ROUTED_TO_AGENCY")).toBe("INTAKE");
    expect(pipelineStage("ticket", "INSPECTION_DUE")).toBe("INSPECTION");
    expect(pipelineStage("ticket", "INSPECTION_COMPLETE")).toBe("READY");
  });

  it("does not present planned work as active before execution", () => {
    expect(pipelineStage("project", "TIMELINE_SET")).toBe("SCHEDULED");
    expect(pipelineStage("project", "CONFLICT_CHECKED")).toBe("SCHEDULED");
    expect(pipelineStage("project", "READY_TO_START")).toBe("SCHEDULED");
    expect(pipelineStage("project", "ACTIVE")).toBe("ACTIVE");
  });

  it("separates completion review from closed history", () => {
    expect(pipelineStage("project", "AWAITING_VERIFICATION")).toBe("CLOSURE");
    expect(pipelineStage("project", "CLOSED")).toBe("CLOSED");
  });
});
