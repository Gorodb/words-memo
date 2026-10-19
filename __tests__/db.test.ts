/**
 * Runs the real migrations and repository SQL against Node's built-in SQLite.
 */
jest.mock('@op-engineering/op-sqlite', () => ({
  open: () => require('../test-utils/sqliteAdapter').openNodeSqlite(),
}));

import type { DB } from '@op-engineering/op-sqlite';
import { initDatabase } from '../src/db/database';
import { migrate } from '../src/db/migrations';
import {
  createFolder,
  deleteFolder,
  getFolder,
  listFolders,
  renameFolder,
  reorderFolders,
} from '../src/db/repositories/folders';
import {
  createSet,
  deleteSet,
  listSets,
  listSetsForPicker,
  listSetsInFolder,
  setPinned,
} from '../src/db/repositories/sets';
import { readSettings, writeSetting } from '../src/db/repositories/settings';
import {
  createWord,
  deleteWord,
  getWords,
  listWords,
  parseExamples,
  setLearned,
  updateWord,
} from '../src/db/repositories/words';
import { openNodeSqlite } from '../test-utils/sqliteAdapter';

let db: DB;

beforeAll(() => {
  db = initDatabase();
});

const count = (table: string) =>
  Number(db.executeSync(`SELECT COUNT(*) AS n FROM ${table}`).rows[0].n);

describe('folders', () => {
  test('are scoped by language; new ones go last; reorder persists', async () => {
    const a = await createFolder('en', 'Travel');
    const b = await createFolder('en', 'Animals');
    const c = await createFolder('en', 'Work');
    await createFolder('de', 'Reisen');

    expect((await listFolders('en')).map(f => f.name)).toEqual([
      'Travel',
      'Animals',
      'Work',
    ]);
    await reorderFolders([c.id, a.id, b.id]);
    expect((await listFolders('en')).map(f => f.name)).toEqual([
      'Work',
      'Travel',
      'Animals',
    ]);
    expect(await listFolders('de')).toHaveLength(1);

    await renameFolder(a.id, 'Trips');
    expect((await getFolder(a.id))?.name).toBe('Trips');
  });

  test('removing a folder unpins its sets but keeps them and their words', async () => {
    const folder = await createFolder('de', 'Küche');
    const set = await createSet('de', 'Geschirr', folder.id);
    await createWord(set.id, { term: 'der Topf', translation: 'кастрюля', examples: [] });
    expect((await listFolders('de')).find(f => f.id === folder.id)?.setCount).toBe(1);

    await deleteFolder(folder.id);
    expect(await getFolder(folder.id)).toBeNull();
    expect((await listSets('de')).map(s => s.name)).toContain('Geschirr');
    expect(await listWords(set.id)).toHaveLength(1);
  });
});

describe('sets', () => {
  test('pin / unpin from the picker; a set can be in several folders', async () => {
    const f1 = await createFolder('en', 'Folder 1');
    const f2 = await createFolder('en', 'Folder 2');
    const set = await createSet('en', 'Verbs');
    await createSet('en', 'Adjectives');

    let picker = await listSetsForPicker(f1.id, 'en');
    expect(picker.find(s => s.id === set.id)?.pinned).toBe(false);

    await setPinned(f1.id, set.id, true);
    await setPinned(f1.id, set.id, true); // idempotent
    await setPinned(f2.id, set.id, true);
    picker = await listSetsForPicker(f1.id, 'en');
    expect(picker.find(s => s.id === set.id)?.pinned).toBe(true);
    expect((await listSetsInFolder(f2.id)).map(s => s.name)).toEqual(['Verbs']);

    await setPinned(f1.id, set.id, false);
    expect(await listSetsInFolder(f1.id)).toEqual([]);
    expect(await listSetsInFolder(f2.id)).toHaveLength(1);
  });

  test('deleting a set deletes its words and unpins it everywhere', async () => {
    const folder = await createFolder('en', 'Temp');
    const set = await createSet('en', 'Scratch', folder.id);
    await createWord(set.id, { term: 'x', translation: 'y', examples: [] });
    const words = count('words');

    await deleteSet(set.id);
    expect(await listSetsInFolder(folder.id)).toEqual([]);
    expect(count('words')).toBe(words - 1);
  });
});

test('words: create, update, delete; term_norm is case-sensitive', async () => {
  const set = await createSet('de', 'Verben');
  const word = await createWord(set.id, {
    term: ' essen ',
    translation: 'есть',
    examples: [{ text: 'Wir essen.', translation: 'Мы едим.' }],
  });
  await createWord(set.id, { term: 'das   Essen', translation: 'еда', examples: [] });
  expect(word).toMatchObject({ term: 'essen', languageCode: 'de' });

  await updateWord(word.id, {
    term: 'essen',
    translation: 'есть, кушать',
    examples: [
      { text: 'Wir essen.', translation: 'Мы едим.' },
      { text: 'Was isst du?', translation: '' },
    ],
  });
  const words = await listWords(set.id);
  expect(words.map(w => [w.term, w.translation, w.examples])).toEqual([
    ['das   Essen', 'еда', []],
    [
      'essen',
      'есть, кушать',
      [
        { text: 'Wir essen.', translation: 'Мы едим.' },
        { text: 'Was isst du?', translation: '' },
      ],
    ],
  ]);

  const norms = db
    .executeSync('SELECT term_norm FROM words WHERE set_id = ? ORDER BY term_norm', [set.id])
    .rows.map(r => r.term_norm);
  expect(norms).toEqual(['das Essen', 'essen']);

  await deleteWord(word.id);
  expect(await listWords(set.id)).toHaveLength(1);
});

test('learned words go below; toggling moves a word to the top of its part', async () => {
  const set = await createSet('en', 'Order');
  const make = (term: string) =>
    createWord(set.id, { term, translation: term, examples: [] });
  const a = await make('a');
  await make('b');
  const c = await make('c');
  const terms = async () => (await listWords(set.id)).map(w => w.term);
  expect(await terms()).toEqual(['c', 'b', 'a']); // newest first

  await setLearned(a.id, true);
  await setLearned(c.id, true);
  // To learn: b. Learned: most recently learned on top.
  expect(await terms()).toEqual(['b', 'c', 'a']);
  expect((await listWords(set.id))[1].learnedAt).not.toBeNull();

  await setLearned(a.id, false); // "To revise" → top of the list
  expect(await terms()).toEqual(['a', 'b', 'c']);
  expect((await getWords([c.id, a.id, 'missing'])).map(w => w.term)).toEqual([
    'c',
    'a',
  ]);
});

test('settings upsert', () => {
  writeSetting('themeMode', 'dark');
  writeSetting('themeMode', 'light');
  expect(readSettings()).toEqual({ themeMode: 'light' });
});

test('migration v1 → v2 keeps sets and words and turns ownership into pins', () => {
  const raw = openNodeSqlite() as unknown as DB;
  raw.executeSync('PRAGMA foreign_keys = ON');
  migrate(raw, 1);
  const t = 1000;
  raw.executeSync(
    "INSERT INTO folders VALUES ('fB', 'en', 'beta', ?, ?), ('fA', 'en', 'Alpha', ?, ?)",
    [t, t, t, t],
  );
  raw.executeSync(
    "INSERT INTO sets VALUES ('s1', 'fA', 'en', 'One', ?, ?), ('s2', 'fB', 'en', 'Two', ?, ?)",
    [t, t, t, t],
  );
  raw.executeSync(
    "INSERT INTO words VALUES ('w1', 's1', 'en', 'cat', 'cat', 'кот', '[]', ?, ?)",
    [t, t],
  );

  migrate(raw, 2);

  const rows = (q: string) => raw.executeSync(q).rows;
  expect(rows('PRAGMA user_version')[0].user_version).toBe(2);
  expect(rows('SELECT id, name FROM sets ORDER BY id')).toEqual([
    { id: 's1', name: 'One' },
    { id: 's2', name: 'Two' },
  ]);
  expect(rows('SELECT folder_id, set_id FROM folder_sets ORDER BY set_id')).toEqual([
    { folder_id: 'fA', set_id: 's1' },
    { folder_id: 'fB', set_id: 's2' },
  ]);
  expect(rows('SELECT id FROM words')).toEqual([{ id: 'w1' }]);
  // Previous alphabetical order (case-insensitive) becomes the manual order.
  expect(rows('SELECT id FROM folders ORDER BY position')).toEqual([
    { id: 'fA' },
    { id: 'fB' },
  ]);
  // Words still cascade from the rebuilt sets table.
  raw.executeSync("DELETE FROM sets WHERE id = 's1'");
  expect(rows('SELECT id FROM words')).toEqual([]);
  expect(rows('PRAGMA foreign_keys')[0].foreign_keys).toBe(1);
});

test('migration v2 → v3: examples become pairs, sort order from creation time', () => {
  const raw = openNodeSqlite() as unknown as DB;
  raw.executeSync('PRAGMA foreign_keys = ON');
  migrate(raw, 2);
  raw.executeSync("INSERT INTO sets VALUES ('s1', 'de', 'Set', 1, 1)");
  raw.executeSync(
    `INSERT INTO words (id, set_id, language_code, term, term_norm, translation, examples_json, created_at, updated_at)
     VALUES ('w1', 's1', 'de', 'essen', 'essen', 'есть', ?, 5, 5),
            ('w2', 's1', 'de', 'gehen', 'gehen', 'идти', '[]', 7, 7)`,
    [JSON.stringify(['Wir essen.', 'Ich esse.'])],
  );

  migrate(raw);

  const rows = raw.executeSync(
    'SELECT id, examples_json, sort_at, learned_at FROM words ORDER BY id',
  ).rows;
  expect(rows).toEqual([
    {
      id: 'w1',
      examples_json: JSON.stringify([
        { text: 'Wir essen.', translation: '' },
        { text: 'Ich esse.', translation: '' },
      ]),
      sort_at: 5,
      learned_at: null,
    },
    { id: 'w2', examples_json: '[]', sort_at: 7, learned_at: null },
  ]);
  expect(raw.executeSync('PRAGMA user_version').rows[0].user_version).toBe(3);
});

test('parseExamples accepts legacy strings and pairs', () => {
  expect(parseExamples('["a", {"text": "b", "translation": "б"}]')).toEqual([
    { text: 'a', translation: '' },
    { text: 'b', translation: 'б' },
  ]);
  expect(parseExamples('not json')).toEqual([]);
});
