import { describe, expect, it } from "vitest";
import { pipelineStage } from "./pipeline";

describe("Project Head work pipeline", () => {
  it("keeps intake and inspection decisions distinct", () => {
    expect(pipelineStage("ticket", "ROUTED_TO_AGENCY")).toBe("INTAKE");
    expect(pipelineStage("ticket", "INSPECTION_DUE")).toBe("INSPECTION");
    expect(pipelineStage("ticket", "INSPECTION_COMPLETE")).toBe("READY");
  });

  it("does not present planned work as active before execution", () => {
    expect(pipelineStage("project", "TIMELINE_SET")).toBe("SCHEDULED");
    expect(pipelineStage("project", "CONFLICT_CHECKED")).toBe("SCHEDULED");
    expect(pipelineStage("project", "READY_TO_START")).toBe("READY");
    expect(pipelineStage("project", "ACTIVE")).toBe("ACTIVE");
  });

  it("separates completion review from closed history", () => {
    expect(pipelineStage("project", "AWAITING_VERIFICATION")).toBe("CLOSURE");
    expect(pipelineStage("project", "CLOSED")).toBe("CLOSED");
  });
});
