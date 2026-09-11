import { describe, expect, it } from "vitest";
import { compareInsight, insightsPeriods } from "./insights";
const now = new Date("2026-09-11T10:00:00Z");
describe("Insights calendar comparisons", () => {
  it.each([
    ["today", "2026-09-10T18:30:00.000Z", "2026-09-09T18:30:00.000Z", "vs yesterday"],
    ["last7", "2026-09-04T18:30:00.000Z", "2026-08-28T18:30:00.000Z", "vs previous 7 days"],
    ["last30", "2026-08-12T18:30:00.000Z", "2026-07-13T18:30:00.000Z", "vs previous 30 days"],
    ["week", "2026-09-06T18:30:00.000Z", "2026-08-30T18:30:00.000Z", "vs last week"],
    ["month", "2026-08-31T18:30:00.000Z", "2026-07-31T18:30:00.000Z", "vs last month"],
  ] as const)("%s uses the immediately previous civil period", (preset, from, previous, label) => {
    const r = insightsPeriods(preset, now); expect(r.current.from).toBe(from); expect(r.previous.from).toBe(previous); expect(r.previous.to).toBe(from); expect(r.label).toBe(label);
  });
  it("counts custom dates inclusively and compares the previous 11 days", () => {
    const r = insightsPeriods("custom", now, "2026-08-10", "2026-08-20");
    expect(r.previous.from).toBe("2026-07-29T18:30:00.000Z");
    expect(Date.parse(r.current.to) - Date.parse(r.current.from)).toBe(11 * 86400000);
  });
  it("handles January rollover and leap February", () => {
    expect(insightsPeriods("month", new Date("2026-01-01T00:00Z")).previous.from).toBe("2025-11-30T18:30:00.000Z");
    const r = insightsPeriods("month", new Date("2024-03-05T00:00Z")); expect(Date.parse(r.previous.to) - Date.parse(r.previous.from)).toBe(29 * 86400000);
  });
  it("rejects malformed, reversed, future and excessive custom ranges", () => {
    for (const [from, to] of [["2026-02-30", "2026-03-01"], ["2026-09-10", "2026-09-01"], ["2027-01-01", "2027-02-01"], ["2020-01-01", "2026-01-01"]]) expect(() => insightsPeriods("custom", now, from, to)).toThrow();
  });
});
describe("direction-aware metric comparison", () => {
  it("uses percentage points for rates", () => expect(compareInsight(83, 67, "higher", "percent")).toEqual({ change: 16, relativePercent: null, interpretation: "Improved" }));
  it("interprets lower rework as improvement", () => expect(compareInsight(10, 20, "lower", "percent").interpretation).toBe("Improved"));
  it("measures relative time reduction", () => expect(compareInsight(8.4, 12, "lower", "hours")).toEqual({ change: -3.6, relativePercent: 30, interpretation: "Improved" }));
  it("handles decline and unchanged", () => { expect(compareInsight(12, 8, "lower", "hours").interpretation).toBe("Declined"); expect(compareInsight(50, 50, "higher", "percent").interpretation).toBe("Unchanged"); });
  it("never divides by zero or invents missing baselines", () => { expect(compareInsight(5, 0, "lower", "hours").relativePercent).toBeNull(); expect(compareInsight(100, null, "higher", "percent").interpretation).toBe("No comparable data"); });
  it("never converts more activity into better performance", () => expect(compareInsight(12, 8, "context", "count")).toEqual({ change: 4, relativePercent: null, interpretation: "Context only" }));
});
