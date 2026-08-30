import { describe, expect, it } from "vitest";
import { formatNearbyDate, formatNearbyDistance } from "./nearby-work-display";

describe("nearby work display", () => {
  it("keeps citizen-facing distance approximate and readable", () => {
    expect(formatNearbyDistance(144)).toBe("144 m away");
    expect(formatNearbyDistance(1_540)).toBe("1.5 km away");
  });

  it("uses a safe fallback when dates are not yet public", () => {
    expect(formatNearbyDate(null)).toBe("To be announced");
  });
});
