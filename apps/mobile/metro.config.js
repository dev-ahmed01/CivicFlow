/* eslint-disable @typescript-eslint/no-require-imports -- Expo loads Metro configuration as CommonJS. */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
