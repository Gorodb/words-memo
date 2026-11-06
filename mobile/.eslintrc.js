module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // React Navigation options (headerRight, tabBarIcon) take render functions.
    'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
  },
};
