import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compareInsight, type OperationalMetric } from "@civicos/shared";
import { InsightMetric, metricChange, PerformanceSummary, SystemValidation } from "./insight-metrics";

const metric = (overrides: Partial<OperationalMetric> = {}): OperationalMetric => ({ key: "conflicts-resolved", label: "Conflict resolution rate", value: 50, unit: "percent", numerator: 1, denominator: 2, description: "Resolved / detected", direction: "higher", limitedSample: true, previous: { value: 25, numerator: 1, denominator: 4 }, comparison: compareInsight(50, 25, "higher", "percent"), ...overrides });
describe("auditable Insights presentation", () => {
  it("renders current and previous denominators with a sample caution and evidence button", () => {
    const html = renderToStaticMarkup(<InsightMetric metric={metric()} onInspect={() => undefined} />);
    for (const text of ["50%", "1 of 2", "1 of 4", "Limited sample", "+25 percentage points", "View evidence"]) expect(html).toContain(text);
  });
  it("explains lower response times as faster rather than a naked negative percentage", () => {
    expect(metricChange(metric({ unit: "hours", direction: "lower", comparison: compareInsight(8.4, 12, "lower", "hours") }))).toBe("30% faster than previous period");
  });
  it("does not call additional conflicts better performance", () => {
    expect(metricChange(metric({ unit: "count", direction: "context", comparison: compareInsight(12, 8, "context", "count") }))).toBe("4 more records");
  });
  it("shows an unavailable baseline without infinite growth", () => {
    expect(metricChange(metric({ comparison: compareInsight(50, null, "higher", "percent") }))).toContain("No previous-period comparison");
  });
  it("keeps raw activity out of the performance summary", () => {
    const html = renderToStaticMarkup(<PerformanceSummary metrics={[metric(), metric({ key: "repeated-excavation", direction: "context" })]} label="vs last week" />);
    expect(html).toContain("1 improved"); expect(html).toContain("Activity counts are excluded");
  });
  it("shows benchmark not run instead of synthetic validation accuracy", () => {
    const html = renderToStaticMarkup(<SystemValidation benchmark={null} />);
    expect(html).toContain("Validation benchmark not run"); expect(html).not.toContain("100%");
  });
});
