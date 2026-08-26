const appJson = require("./app.json");

module.exports = () => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;

  return {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      apiUrl
    }
  };
};