/* eslint-env jest */
require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);
jest.mock('@gorhom/bottom-sheet', () => require('@gorhom/bottom-sheet/mock'));

jest.mock('@op-engineering/op-sqlite', () => {
  const empty = { rows: [], rowsAffected: 0 };
  return {
    open: () => ({
      executeSync: () => empty,
      execute: () => Promise.resolve(empty),
      transaction: fn => fn({ execute: () => Promise.resolve(empty) }),
    }),
  };
});

// Needs real worklets internals; a plain FlatList is enough for render tests.
jest.mock('react-native-reorderable-list', () => {
  const { FlatList } = require('react-native');
  const reorderItems = (items, from, to) => {
    const next = [...items];
    next.splice(to, 0, ...next.splice(from, 1));
    return next;
  };
  return {
    __esModule: true,
    default: FlatList,
    reorderItems,
    useReorderableDrag: () => () => {},
  };
});
