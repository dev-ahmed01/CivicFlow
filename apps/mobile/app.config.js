module.exports = ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const productionBundle = process.env.NODE_ENV === "production" || Boolean(process.env.EAS_BUILD);

  if (productionBundle && !apiUrl) {
    throw new Error("EXPO_PUBLIC_API_URL is required for production and EAS mobile builds");
  }
  if (apiUrl) {
    const parsed = new URL(apiUrl);
    const hostname = parsed.hostname.toLowerCase();
    const privateIpv4 = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
    if (productionBundle && (parsed.protocol !== "https:" || hostname === "localhost" || privateIpv4)) {
      throw new Error("EXPO_PUBLIC_API_URL must be a public HTTPS URL for production and EAS mobile builds");
    }
  }

  return {
    ...config,
    extra: {
      ...config.extra,
      apiUrl
    }
  };
};
