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

// Native file system: dictionaries are "not installed" in tests.
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/documents',
  exists: jest.fn(() => Promise.resolve(false)),
  mkdir: jest.fn(() => Promise.resolve()),
  moveFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
  downloadFile: jest.fn(() => ({
    jobId: 1,
    promise: Promise.resolve({ jobId: 1, statusCode: 200, bytesWritten: 0 }),
  })),
}));

// Needs real worklets internals; render the row without swipe behavior.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const Swipeable = React.forwardRef(({ children }, ref) => {
    React.useImperativeHandle(ref, () => ({
      close: () => {},
      openLeft: () => {},
      openRight: () => {},
      reset: () => {},
    }));
    return children;
  });
  return { __esModule: true, default: Swipeable };
});
