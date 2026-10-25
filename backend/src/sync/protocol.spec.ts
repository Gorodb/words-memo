import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseSyncRequest, SyncFormatError } from './protocol.ts';
import { dedupe, toRecord, toRow } from './records.ts';

const word = {
  id: 'w1',
  setId: 's1',
  languageCode: 'de',
  term: 'essen',
  termNorm: 'essen',
  translation: 'есть',
  examples: [{ text: 'Ich esse', translation: 'Я ем' }],
  description: '',
  learnedAt: null,
  sortAt: 3,
  createdAt: 1,
  updatedAt: 2,
};

describe('parseSyncRequest', () => {
  test('fills missing tables and keeps only known fields', () => {
    const request = parseSyncRequest({
      cursor: 5,
      changes: { words: { upserts: [{ ...word, extra: 'x' }] } },
    });
    assert.equal(request.cursor, 5);
    assert.deepEqual(request.changes.words.upserts, [word]);
    assert.deepEqual(request.changes.sets, { upserts: [], deletes: [] });
  });

  test('a missing cursor means a full sync; a missing pinnedAt is null', () => {
    const request = parseSyncRequest({
      changes: {
        sets: {
          upserts: [
            { id: 's1', languageCode: 'de', name: 'A', createdAt: 1, updatedAt: 1 },
          ],
        },
      },
    });
    assert.equal(request.cursor, null);
    assert.equal(request.changes.sets.upserts[0].pinnedAt, null);
  });

  test('rejects bad values with the path', () => {
    assert.throws(
      () => parseSyncRequest({ changes: { words: { upserts: [{ ...word, sortAt: 'x' }] } } }),
      (e: Error) =>
        e instanceof SyncFormatError &&
        e.message === 'changes.words.upserts[0].sortAt: expected an integer',
    );
    assert.throws(() => parseSyncRequest({ cursor: -1 }), SyncFormatError);
    assert.throws(() => parseSyncRequest([]), SyncFormatError);
    assert.throws(
      () => parseSyncRequest({ changes: { rules: { deletes: [1] } } }),
      SyncFormatError,
    );
  });
});

describe('records', () => {
  test('languages keep their code in id; folder links get a composite key', () => {
    const language = { code: 'x-1', name: 'Chinese', createdAt: 1 };
    const row = toRow('languages', language, 'u', 7);
    assert.deepEqual(row, {
      name: 'Chinese',
      createdAt: 1,
      userId: 'u',
      id: 'x-1',
      version: 7,
      deleted: false,
    });
    assert.deepEqual(toRecord('languages', row), language);

    const link = { folderId: 'f', setId: 's', addedAt: 1 };
    assert.equal(toRow('folderSets', link, 'u', 1).id, 'f:s');
    assert.deepEqual(toRecord('folderSets', toRow('folderSets', link, 'u', 1)), link);
  });

  test('dedupe: last upsert wins, deletes win over upserts', () => {
    const changes = dedupe('words', {
      upserts: [word, { ...word, translation: 'later' }, { ...word, id: 'w2' }],
      deletes: ['w2', 'w2'],
    });
    assert.deepEqual(
      changes.upserts.map(w => w.translation),
      ['later'],
    );
    assert.deepEqual(changes.deletes, ['w2']);
  });
});
