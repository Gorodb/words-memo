import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { WordRecord } from '../sync/protocol.ts';
import {
  cleanExamples,
  compareWords,
  createId,
  languageNameTaken,
  nextSortAt,
  reorderedSortKeys,
  wordGroup,
} from './domain.ts';

const word = (id: string, extra: Partial<WordRecord> = {}): WordRecord => ({
  id,
  setId: 's',
  languageCode: 'de',
  term: id,
  termNorm: id,
  translation: id,
  examples: [],
  description: '',
  learnedAt: null,
  favoriteAt: null,
  sortAt: 1,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

describe('word order', () => {
  test('to learn first, starred first in each part, then newest sort key', () => {
    const words = [
      word('learned', { learnedAt: 5, sortAt: 9 }),
      word('old', { sortAt: 1 }),
      word('new', { sortAt: 3 }),
      word('starred', { favoriteAt: 2, sortAt: 0 }),
      word('learnedStar', { learnedAt: 5, favoriteAt: 1, sortAt: 0 }),
    ];
    assert.deepEqual(
      words.sort(compareWords).map(w => w.id),
      ['starred', 'new', 'old', 'learnedStar', 'learned'],
    );
  });

  test('groups: to learn × starred', () => {
    assert.equal(wordGroup({ learnedAt: null, favoriteAt: 1 }), 0);
    assert.equal(wordGroup({ learnedAt: null, favoriteAt: null }), 1);
    assert.equal(wordGroup({ learnedAt: 1, favoriteAt: 1 }), 2);
    assert.equal(wordGroup({ learnedAt: 1, favoriteAt: null }), 3);
  });

  test('a new sort key is above every word and at least now', () => {
    assert.equal(nextSortAt([{ sortAt: 5 }, { sortAt: 9 }], 3), 10);
    assert.equal(nextSortAt([{ sortAt: 5 }], 100), 100);
    assert.equal(nextSortAt([], 7), 7);
  });

  test('reordering counts down from the highest key of the moved words', () => {
    const keys = reorderedSortKeys(
      [
        { id: 'a', sortAt: 30 },
        { id: 'b', sortAt: 20 },
        { id: 'c', sortAt: 10 },
      ],
      ['c', 'a', 'missing', 'b'],
    );
    assert.deepEqual([...keys], [
      ['c', 30],
      ['a', 29],
      ['b', 28],
    ]);
  });
});

describe('languages and input', () => {
  test('names are unique ignoring case, by English or native name', () => {
    const languages = [
      { code: 'de', name: 'German', nativeName: 'Deutsch' },
      { code: 'x-1', name: 'Chinese' },
    ];
    assert.equal(languageNameTaken(languages, ' deutsch ')?.code, 'de');
    assert.equal(languageNameTaken(languages, 'CHINESE')?.code, 'x-1');
    assert.equal(languageNameTaken(languages, 'Chinese', 'x-1'), null);
    assert.equal(languageNameTaken(languages, 'Spanish'), null);
  });

  test('examples are trimmed and blank ones dropped', () => {
    assert.deepEqual(
      cleanExamples([
        { text: ' Ich esse ', translation: ' Я ем ' },
        { text: '  ', translation: 'x' },
      ]),
      [{ text: 'Ich esse', translation: 'Я ем' }],
    );
  });

  test('ids are unique and URL-safe', () => {
    const ids = new Set(Array.from({ length: 500 }, createId));
    assert.equal(ids.size, 500);
    assert.ok([...ids].every(id => /^[a-z0-9]+$/.test(id)));
  });
});
