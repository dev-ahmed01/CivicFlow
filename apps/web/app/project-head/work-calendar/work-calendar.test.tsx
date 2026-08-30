import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkLedger } from "./work-ledger";
import { WorkTimeline } from "./work-timeline";
import { workAnchor } from "./work-map";

describe("spatial work calendar", () => {
  it("derives a stable map anchor for linear civic work", () => {
    expect(workAnchor({ type: "LineString", coordinates: [[77.60, 12.91], [77.62, 12.93]] })).toEqual([77.61, 12.92]);
  });

  it("shows an instructive ledger empty state until a location is selected", () => {
    const markup = renderToStaticMarkup(<WorkLedger loading={false} onPageChange={vi.fn()} page={1} roadSelected={false} wardSelected={false} />);
    expect(markup).toContain("Choose a road or ward");
    expect(markup).toContain("permanent place history");
  });

  it("names all temporal groups even when a filtered view is empty", () => {
    const markup = renderToStaticMarkup(<WorkTimeline onSelect={vi.fn()} works={[]} />);
    expect(markup).toContain("Happening now");
    expect(markup).toContain("Upcoming");
    expect(markup).toContain("Past work");
  });
});
