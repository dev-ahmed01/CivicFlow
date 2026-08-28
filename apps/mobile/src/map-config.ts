export const defaultMapStyleUrl = "https://tiles.openfreemap.org/styles/liberty";

export function resolveMapStyleUrl(configured = process.env.EXPO_PUBLIC_MAP_STYLE_URL): string {
  return configured?.trim() || defaultMapStyleUrl;
}

export const mapStyleUrl = resolveMapStyleUrl();
