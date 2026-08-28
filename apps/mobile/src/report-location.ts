import * as Location from "expo-location";

export type ConfirmedLocation = {
  latitude: number;
  longitude: number;
  address: string;
  confidenceLow: boolean;
  geocodeFailed: boolean;
};

export type LocationProvider = Pick<
  typeof Location,
  "requestForegroundPermissionsAsync" | "getCurrentPositionAsync" | "reverseGeocodeAsync"
>;

export async function detectCurrentLocation(provider: LocationProvider = Location): Promise<ConfirmedLocation> {
  const permission = await provider.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Location permission is needed to route your report. Enable it and try again.");
  }

  const position = await provider.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  const { latitude, longitude, accuracy } = position.coords;
  const coordinateAddress = `Detected location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;

  try {
    const places = await provider.reverseGeocodeAsync({ latitude, longitude });
    const place = places[0];
    const address = place
      ? [place.name, place.street, place.district, place.city, place.region].filter(Boolean).join(", ")
      : coordinateAddress;
    return { latitude, longitude, address: address || coordinateAddress, confidenceLow: (accuracy ?? 100) > 40, geocodeFailed: !place };
  } catch {
    // Coordinates remain authoritative when the optional address lookup is unavailable.
    return { latitude, longitude, address: coordinateAddress, confidenceLow: (accuracy ?? 100) > 40, geocodeFailed: true };
  }
}
