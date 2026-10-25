module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  // The backend is a separate Node project with its own tests.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/backend/'],
  modulePathIgnorePatterns: ['<rootDir>/backend/'],
  // Skips the .native files of reanimated / worklets, which need native modules.
  resolver: 'react-native-reanimated/jest/resolver',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|@gorhom|react-native-.*)/)',
  ],
  moduleNameMapper: {
    // Its ESM build is .mjs, which the RN preset doesn't transform.
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
};
