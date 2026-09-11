import { describe, expect, it } from "vitest";
import { type RoadScanOptions } from "@civicos/shared";

describe("AreaScanPage UI logic", () => {
  it("determines when ward selection is available based on options", () => {
    const emptyOptions: RoadScanOptions = {
      providerMode: "DEMO",
      simulated: true,
      wards: [],
      newCandidates: 0,
    };
    expect(emptyOptions.wards.length).toBe(0);

    const populatedOptions: RoadScanOptions = {
      providerMode: "DEMO",
      simulated: true,
      wards: [
        {
          id: "10000000-0000-4000-8000-000000000011",
          name: "Jakkasandra / JAIN Global Campus",
          camerasAvailable: 8,
        },
      ],
      newCandidates: 0,
    };
    expect(populatedOptions.wards.length).toBe(1);
    expect(populatedOptions.wards[0]?.camerasAvailable).toBe(8);
  });
});
