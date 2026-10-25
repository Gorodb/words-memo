module.exports = {
  root: true,
  extends: '@react-native',
  // Separate Node project with its own tooling.
  ignorePatterns: ['backend/'],
  rules: {
    // React Navigation options (headerRight, tabBarIcon) take render functions.
    'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
  },
};
