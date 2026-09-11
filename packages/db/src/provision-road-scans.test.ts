import { describe, expect, it, vi } from "vitest";
import { provisionRoadScans } from "./provision-road-scans";

describe("provisionRoadScans", () => {
  it("upserts agency, category, config, ward, road segment, and all manifest cameras idempotently", async () => {
    const mockAgencyUpsert = vi.fn().mockResolvedValue({ id: "20000000-0000-4000-8000-000000000003", name: "BBMP Road Infrastructure" });
    const mockCategoryUpsert = vi.fn().mockResolvedValue({ id: "30000000-0000-4000-8000-000000000001", name: "Road Damage" });
    const mockConfigUpsert = vi.fn().mockResolvedValue({ key: "road.category_id", value: "30000000-0000-4000-8000-000000000001" });
    const mockExecuteRaw = vi.fn().mockResolvedValue(1);
    const mockRoadCameraUpsert = vi.fn().mockImplementation(({ where, create, update }) => Promise.resolve({ ...create, ...update, code: where.code }));

    const mockPrisma = {
      agency: { upsert: mockAgencyUpsert },
      category: { upsert: mockCategoryUpsert },
      systemConfig: { upsert: mockConfigUpsert },
      roadCamera: { upsert: mockRoadCameraUpsert },
      $executeRaw: mockExecuteRaw,
    } as unknown as Parameters<typeof provisionRoadScans>[0];

    const result = await provisionRoadScans(mockPrisma);

    expect(result.camerasProvisioned).toBe(8);
    expect(result.wardId).toBe("10000000-0000-4000-8000-000000000011");
    expect(result.agencyId).toBe("20000000-0000-4000-8000-000000000003");

    expect(mockAgencyUpsert).toHaveBeenCalledTimes(1);
    expect(mockCategoryUpsert).toHaveBeenCalledTimes(1);
    expect(mockConfigUpsert).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2); // Ward + RoadSegment
    expect(mockRoadCameraUpsert).toHaveBeenCalledTimes(8);

    // Verify update block has explicit non-empty fields to repair existing camera configuration
    const firstCallArg = mockRoadCameraUpsert.mock.calls[0]?.[0];
    expect(firstCallArg?.where.code).toBe("DEMO-CAM-01");
    expect(firstCallArg?.update).toEqual({
      name: "Service road south",
      wardId: "10000000-0000-4000-8000-000000000011",
      agencyId: "20000000-0000-4000-8000-000000000003",
      categoryId: "30000000-0000-4000-8000-000000000001",
      roadSegmentId: "ac000000-0000-4000-8000-000000000001",
      latitude: 12.637,
      longitude: 77.438,
      simulated: true,
      providerReference: "single",
      enabled: true,
    });
  });
});
