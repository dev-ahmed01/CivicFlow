import { describe, expect, it } from "vitest";
import { DEMO_WARD_SRID, demoWardIds, demoWards } from "./demo-wards";

function bounds(ward: (typeof demoWards)[number]) {
  const longitudes = ward.boundary.map(([longitude]) => longitude);
  const latitudes = ward.boundary.map(([, latitude]) => latitude);
  return {
    minLongitude: Math.min(...longitudes),
    maxLongitude: Math.max(...longitudes),
    minLatitude: Math.min(...latitudes),
    maxLatitude: Math.max(...latitudes),
  };
}

function coversRepresentative(ward: (typeof demoWards)[number], latitude: number, longitude: number): boolean {
  const area = bounds(ward);
  return longitude >= area.minLongitude && longitude <= area.maxLongitude
    && latitude >= area.minLatitude && latitude <= area.maxLatitude;
}

describe("Bengaluru demo wards", () => {
  it("uses stable deterministic UUIDs and SRID 4326", () => {
    expect(DEMO_WARD_SRID).toBe(4326);
    expect(demoWardIds.btmLayout).toBe("10000000-0000-4000-8000-000000000005");
    expect(new Set(demoWards.map((ward) => ward.id)).size).toBe(10);
    for (const ward of demoWards) {
      expect(ward.id).toMatch(/^10000000-0000-4000-8000-\d{12}$/);
      expect(ward.boundary[0]).toEqual(ward.boundary.at(-1));
    }
  });

  it.each(demoWards)("resolves $name representative coordinates to only that ward", (expected) => {
    const matches = demoWards.filter((ward) => coversRepresentative(
      ward,
      expected.representativeCoordinates.latitude,
      expected.representativeCoordinates.longitude,
    ));
    expect(matches.map((ward) => ward.id)).toEqual([expected.id]);
  });

  it("resolves the BTM Layout GPS regression point to BTM Layout", () => {
    const matches = demoWards.filter((ward) => coversRepresentative(ward, 12.9166, 77.6101));
    expect(matches.map((ward) => ward.name)).toEqual(["BTM Layout"]);
  });

  it("keeps every demo polygon interior separate", () => {
    for (const [leftIndex, leftWard] of demoWards.entries()) {
      for (const rightWard of demoWards.slice(leftIndex + 1)) {
        const left = bounds(leftWard);
        const right = bounds(rightWard);
        const interiorsOverlap = left.minLongitude < right.maxLongitude
          && left.maxLongitude > right.minLongitude
          && left.minLatitude < right.maxLatitude
          && left.maxLatitude > right.minLatitude;
        expect(interiorsOverlap, `${leftWard.name} overlaps ${rightWard.name}`).toBe(false);
      }
    }
  });
});
