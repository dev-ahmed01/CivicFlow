import { describe, expect, it } from "vitest";
import { responsiveMetrics } from "./responsive";

describe("Android responsive viewport classes", () => {
  it.each([
    ["small Android", 360, 640, true, true, 16, 220],
    ["common Android", 360, 800, true, false, 16, 250],
    ["larger Android", 412, 915, false, false, 18, 290],
  ] as const)("adapts %s (%d x %d)", (_label, width, height, narrow, compactHeight, horizontalPadding, mediaMaxHeight) => {
    expect(responsiveMetrics({ width, height, fontScale: 1 })).toEqual({ narrow, compactHeight, horizontalPadding, mediaMaxHeight });
  });

  it("collapses wide rows when the user increases font scaling", () => {
    expect(responsiveMetrics({ width: 412, height: 915, fontScale: 1.3 })).toMatchObject({ narrow: true, compactHeight: true, horizontalPadding: 16 });
  });
});
