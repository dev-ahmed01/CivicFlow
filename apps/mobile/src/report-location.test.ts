import { describe, expect, it, vi } from "vitest";

vi.mock("expo-location", () => ({ Accuracy: { High: 6 } }));

import { detectCurrentLocation, type LocationProvider } from "./report-location";

function provider(overrides: Partial<LocationProvider> = {}): LocationProvider {
  return {
    requestForegroundPermissionsAsync: vi.fn(async () => ({ granted: true })) as unknown as LocationProvider["requestForegroundPermissionsAsync"],
    getCurrentPositionAsync: vi.fn(async () => ({ coords: { latitude: 12.9295, longitude: 77.5854, accuracy: 12 } })) as unknown as LocationProvider["getCurrentPositionAsync"],
    reverseGeocodeAsync: vi.fn(async () => [{ name: "11th Main Road", city: "Bengaluru", region: "Karnataka" }]) as unknown as LocationProvider["reverseGeocodeAsync"],
    ...overrides,
  };
}

describe("real report location", () => {
  it("requests foreground permission and preserves retrieved GPS coordinates", async () => {
    const locationProvider = provider();
    const result = await detectCurrentLocation(locationProvider);
    expect(locationProvider.requestForegroundPermissionsAsync).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ latitude: 12.9295, longitude: 77.5854, address: "11th Main Road, Bengaluru, Karnataka", geocodeFailed: false });
  });

  it("returns a recoverable error when foreground permission is denied", async () => {
    const locationProvider = provider({
      requestForegroundPermissionsAsync: vi.fn(async () => ({ granted: false })) as unknown as LocationProvider["requestForegroundPermissionsAsync"],
    });
    await expect(detectCurrentLocation(locationProvider)).rejects.toThrow("Location permission is needed");
    expect(locationProvider.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it("preserves coordinates when reverse geocoding fails", async () => {
    const locationProvider = provider({ reverseGeocodeAsync: vi.fn(async () => { throw new Error("offline"); }) });
    await expect(detectCurrentLocation(locationProvider)).resolves.toMatchObject({
      latitude: 12.9295,
      longitude: 77.5854,
      address: "Detected location (12.92950, 77.58540)",
      geocodeFailed: true,
    });
  });
});
