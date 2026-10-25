const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // The backend (NestJS) is a separate project; never bundle it.
    blockList: [
      new RegExp(`^${escapeRegExp(path.join(__dirname, 'backend'))}[\\\\/].*`),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
