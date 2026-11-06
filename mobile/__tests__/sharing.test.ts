import {
  formatShareCode,
  normalizeShareCode,
} from '../src/features/sharing/shareCode';
import { importsAnything, type ImportSummary } from '../src/features/backup/merge';

describe('share codes', () => {
  test('typed codes ignore case, spaces and dashes', () => {
    expect(normalizeShareCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeShareCode(' AB CD EF GH ')).toBe('ABCDEFGH');
  });

  test('rejects wrong lengths and look-alike characters', () => {
    expect(normalizeShareCode('ABCDEFG')).toBeNull();
    expect(normalizeShareCode('ABCDEFGHJ')).toBeNull();
    expect(normalizeShareCode('ABCDEFG0')).toBeNull();
    expect(normalizeShareCode('ABCDEFGL')).toBeNull();
    expect(normalizeShareCode('')).toBeNull();
  });

  test('formats as two halves', () => {
    expect(formatShareCode('ABCDEFGH')).toBe('ABCD-EFGH');
    expect(normalizeShareCode(formatShareCode('ABCDEFGH'))).toBe('ABCDEFGH');
  });
});

describe('importsAnything', () => {
  const none: ImportSummary = {
    wordsAdded: 0,
    wordsUpdated: 0,
    rulesAdded: 0,
    setsCreated: 0,
    foldersCreated: 0,
    languagesCreated: [],
    skippedLanguages: [],
  };

  test('false only when nothing changes', () => {
    expect(importsAnything(none)).toBe(false);
    expect(importsAnything({ ...none, rulesAdded: 1 })).toBe(true);
    expect(importsAnything({ ...none, wordsUpdated: 2 })).toBe(true);
  });
});
