// Expo evaluates dynamic app configuration in Node's CommonJS context.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appJson = require("./app.json");

module.exports = () => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const projectId = process.env.EAS_PROJECT_ID;
  if (process.env.EAS_BUILD_PROFILE) {
    if (!apiUrl) throw new Error("EXPO_PUBLIC_API_URL is required for EAS builds");
    const hostname = new URL(apiUrl).hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "10.0.2.2") {
      throw new Error("EXPO_PUBLIC_API_URL must use the deployed API for EAS builds");
    }
    if (!projectId) throw new Error("EAS_PROJECT_ID is required for EAS builds");
  }

  return {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      apiUrl,
      eas: projectId ? { projectId } : undefined,
    },
  };
};
