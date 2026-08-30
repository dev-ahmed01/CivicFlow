export function formatNearbyDistance(distanceMeters: number): string {
  if (distanceMeters < 1_000) return `${Math.max(0, Math.round(distanceMeters))} m away`;
  return `${(distanceMeters / 1_000).toFixed(1)} km away`;
}

export function formatNearbyDate(value: string | null): string {
  if (!value) return "To be announced";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
