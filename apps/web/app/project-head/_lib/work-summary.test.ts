import { describe, expect, it } from "vitest";
import { getShortWorkLocation } from "./work-summary";

describe("compact work locations", () => {
  it.each([
    ["11th Main Road, Jayanagar 4th Block, Bengaluru, Karnataka, 560041", "11th Main Road, Jayanagar 4th Block"],
    ["Segment X · 11th Main Road, Jayanagar", "11th Main Road, Jayanagar"],
    ["South End Circle · Maintenance patching on identified stretch", "South End Circle"],
    ["BTM Layout, Bengaluru, Karnataka", "BTM Layout"],
  ])("shortens %s without inventing a locality", (locationLabel, expected) => {
    expect(getShortWorkLocation({ locationLabel })).toBe(expected);
  });
  it("uses recorded ward metadata when no usable label is available", () => {
    const ward = { id: "ward", name: "Jayanagar" };
    expect(getShortWorkLocation({ ward })).toBe("Jayanagar");
    expect(getShortWorkLocation({ ward, title: "Repair road", locationLabel: "Repair road, Bengaluru" })).toBe("Jayanagar");
  });
  it("does not fabricate missing location data", () => {
    expect(getShortWorkLocation({})).toBe("Location not recorded");
  });
  it("extracts the explicit place from legacy title-based location labels", () => {
    const title = "Complete pothole patching near South End Circle";
    expect(getShortWorkLocation({ title, locationLabel: `${title}, Bengaluru` })).toBe("South End Circle");
  });
});
