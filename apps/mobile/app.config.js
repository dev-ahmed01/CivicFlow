const hostedApiUrl = "https://city-connect-backend-ln7h.onrender.com";

function resolveApiUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  const allowLocal = process.env.EXPO_PUBLIC_ALLOW_LOCAL_API === "true";
  if (!configured) return hostedApiUrl;

  try {
    const parsed = new URL(configured);
    const hostname = parsed.hostname.toLowerCase();
    const privateIpv4 = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
    const localAddress = hostname === "localhost" || privateIpv4;
    const obsoleteRailway = hostname.endsWith(".railway.app") || hostname.endsWith(".up.railway.app");
    if ((!allowLocal && localAddress) || obsoleteRailway) return hostedApiUrl;
    return configured.replace(/\/$/, "");
  } catch {
    return hostedApiUrl;
  }
}

module.exports = ({ config }) => {
  const apiUrl = resolveApiUrl();
  const mapStyleUrl = process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";
  const productionBundle = process.env.NODE_ENV === "production" || Boolean(process.env.EAS_BUILD);

  const parsed = new URL(apiUrl);
  const hostname = parsed.hostname.toLowerCase();
  const privateIpv4 = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
  if (productionBundle && (parsed.protocol !== "https:" || hostname === "localhost" || privateIpv4)) {
    throw new Error("Resolved mobile API URL must be a public HTTPS URL for production and EAS builds");
  }
  if (new URL(mapStyleUrl).protocol !== "https:") {
    throw new Error("EXPO_PUBLIC_MAP_STYLE_URL must be an HTTPS MapLibre style URL");
  }

  return {
    ...config,
    extra: {
      ...config.extra,
      apiUrl,
      mapStyleUrl
    }
  };
};
