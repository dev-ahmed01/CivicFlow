import { describe, expect, it } from "vitest";
import { defaultMapStyleUrl, resolveMapStyleUrl } from "./map-config";

describe("MapLibre style configuration", () => {
  it("uses the keyless OpenFreeMap Liberty style by default", () => {
    expect(resolveMapStyleUrl(undefined)).toBe(defaultMapStyleUrl);
    expect(defaultMapStyleUrl).toBe("https://tiles.openfreemap.org/styles/liberty");
  });

  it("allows the tile/style provider to be replaced centrally", () => {
    expect(resolveMapStyleUrl("https://maps.example.org/style.json")).toBe("https://maps.example.org/style.json");
  });
});
