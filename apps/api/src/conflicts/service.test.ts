import { describe, expect, it } from "vitest";
import { conflictSeverity, isFullDateOverlap } from "./service";

const date = (day: number) => new Date(`2026-09-${String(day).padStart(2, "0")}T00:00:00.000Z`);

describe("generic conflict severity", () => {
  it("treats a contained date range as a full overlap", () => {
    expect(isFullDateOverlap(date(1), date(10), date(3), date(8))).toBe(true);
  });

  it("returns a prominent advisory warning for full overlap below 100m", () => {
    expect(conflictSeverity({
      sourcePlannedStart: date(1), sourcePlannedEnd: date(10),
      candidatePlannedStart: date(1), candidatePlannedEnd: date(10),
      distanceMeters: 99.9,
    })).toBe("PROMINENT");
  });

  it("returns an inline note for partial overlap or a distance of at least 100m", () => {
    expect(conflictSeverity({
      sourcePlannedStart: date(1), sourcePlannedEnd: date(5),
      candidatePlannedStart: date(4), candidatePlannedEnd: date(8),
      distanceMeters: 50,
    })).toBe("INLINE");
    expect(conflictSeverity({
      sourcePlannedStart: date(1), sourcePlannedEnd: date(10),
      candidatePlannedStart: date(1), candidatePlannedEnd: date(10),
      distanceMeters: 150,
    })).toBe("INLINE");
  });
});
