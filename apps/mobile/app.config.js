module.exports = ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;

  return {
    ...config,
    extra: {
      ...config.extra,
      apiUrl
    }
  };
};
