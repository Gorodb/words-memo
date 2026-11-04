import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  changedFrame,
  decodeNotice,
  encodeNotice,
  validClientId,
} from './protocol.ts';

describe('change notices', () => {
  it('round-trips through the NOTIFY payload', () => {
    const notice = {
      userId: 'u1',
      version: 7,
      tables: ['words' as const, 'sets' as const],
      origin: 'tab_abcdef12',
    };
    assert.deepEqual(decodeNotice(encodeNotice(notice)), notice);
  });

  it('drops unknown tables and bad origins, rejects broken payloads', () => {
    assert.deepEqual(
      decodeNotice('{"userId":"u","version":1,"tables":["words","users"],"origin":"x"}'),
      { userId: 'u', version: 1, tables: ['words'], origin: null },
    );
    assert.equal(decodeNotice('{"userId":"u","tables":[]}'), null);
    assert.equal(decodeNotice('not json'), null);
  });

  it('accepts only plain client ids', () => {
    assert.equal(validClientId('abcDEF12-_'), 'abcDEF12-_');
    assert.equal(validClientId('short'), null);
    assert.equal(validClientId('has space 123'), null);
    assert.equal(validClientId(undefined), null);
  });

  it('formats a changed event frame', () => {
    assert.equal(
      changedFrame({ version: 3, tables: ['rules'] }),
      'event: changed\ndata: {"version":3,"tables":["rules"]}\n\n',
    );
  });
});
