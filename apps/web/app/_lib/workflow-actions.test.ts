import { describe, expect, it } from "vitest";
import { getEngineerNextAction } from "./workflow-actions";

describe("getEngineerNextAction", () => {
  it.each([
    ["PENDING_UPTAKE", "Accept Project"],
    ["UPTAKEN", "Set Timeline"],
    ["ACTIVE", "Add Update"],
    ["COMPLETED", "Submit Evidence"],
    ["AWAITING_VERIFICATION", "View Verification"],
    ["CLOSED", "View Project"],
  ] as const)("maps %s to %s", (state, label) => {
    expect(getEngineerNextAction(state).label).toBe(label);
  });

  it("surfaces all active-project actions", () => {
    expect(getEngineerNextAction("ACTIVE").secondary.map(({ label }) => label)).toEqual(["Update Timeline", "Mark Complete"]);
  });
});
