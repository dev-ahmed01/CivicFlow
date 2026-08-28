import { describe, expect, it } from "vitest";
import { confirmationQuorumReached, effectiveValidationQuorum, excludeReporter } from "./service";

describe("hackathon community validation", () => {
  it("all-citizen demo selection excludes the reporter", () => {
    expect(excludeReporter([{ citizenId: "reporter" }, { citizenId: "citizen-2" }, { citizenId: "citizen-3" }], "reporter"))
      .toEqual([{ citizenId: "citizen-2" }, { citizenId: "citizen-3" }]);
  });

  it("advances only when the third unique confirmation is recorded", () => {
    expect(confirmationQuorumReached(0, 3)).toBe(false);
    expect(confirmationQuorumReached(2, 3)).toBe(false);
    expect(confirmationQuorumReached(3, 3)).toBe(true);
  });

  it("uses one confirmation in demo broadcast mode", () => {
    expect(effectiveValidationQuorum(5, true)).toBe(1);
    expect(effectiveValidationQuorum(5, false)).toBe(5);
  });
});
