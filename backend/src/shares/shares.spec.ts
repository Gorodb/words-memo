import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  newShareCode,
  normalizeShareCode,
  SHARE_CODE_ALPHABET,
  SHARE_CODE_LENGTH,
} from './share-code.ts';
import {
  MAX_SHARE_BYTES,
  parseSharePayload,
  SharePayloadError,
} from './share-payload.ts';

describe('share codes', () => {
  test('new codes use only the alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = newShareCode();
      assert.equal(code.length, SHARE_CODE_LENGTH);
      assert.ok([...code].every(c => SHARE_CODE_ALPHABET.includes(c)), code);
      assert.equal(normalizeShareCode(code), code);
    }
  });

  test('typed codes ignore case, spaces and dashes', () => {
    assert.equal(normalizeShareCode(' abcd-efgh '), 'ABCDEFGH');
    assert.equal(normalizeShareCode('AB CD EF GH'), 'ABCDEFGH');
  });

  test('rejects wrong lengths and look-alike characters', () => {
    assert.equal(normalizeShareCode('ABCDEFG'), null);
    assert.equal(normalizeShareCode('ABCDEFGHJ'), null);
    assert.equal(normalizeShareCode('ABCDEFG0'), null);
    assert.equal(normalizeShareCode('ABCDEFGI'), null);
    assert.equal(normalizeShareCode(''), null);
  });
});

describe('parseSharePayload', () => {
  const payload = {
    app: 'wordsLearning',
    version: 1,
    kind: 'sets',
    languages: [{ code: 'de', folders: [], sets: [{ name: 'A' }] }],
  };

  test('accepts a sets backup', () => {
    assert.deepEqual(parseSharePayload(payload), payload);
  });

  test('rejects other shapes', () => {
    for (const bad of [
      null,
      [],
      'x',
      { ...payload, kind: 'full' },
      { ...payload, languages: [] },
      { ...payload, languages: 'x' },
    ]) {
      assert.throws(() => parseSharePayload(bad), SharePayloadError);
    }
  });

  test('rejects payloads over the size limit', () => {
    const big = {
      ...payload,
      languages: [{ code: 'de', sets: [{ name: 'x'.repeat(MAX_SHARE_BYTES) }] }],
    };
    assert.throws(() => parseSharePayload(big), SharePayloadError);
  });
});
