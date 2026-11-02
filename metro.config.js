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
    // The backend (NestJS) and the website (web/) are separate projects; never bundle them.
    blockList: ['backend', 'web'].map(
      dir => new RegExp(`^${escapeRegExp(path.join(__dirname, dir))}[\\\\/].*`),
    ),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
