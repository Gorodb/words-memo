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
  setFolderPinned,
} from '../src/db/repositories/folders';
import {
  createSet,
  deleteSet,
  listSets,
  listSetsForPicker,
  listSetsInFolder,
  setInFolder,
  setSetPinned,
} from '../src/db/repositories/sets';
import {
  createRule,
  deleteRule,
  listRules,
  updateRule,
} from '../src/db/repositories/rules';
import { readSettings, writeSetting } from '../src/db/repositories/settings';
import {
  createWord,
  deleteWord,
  getWords,
  listWords,
  parseExamples,
  resetLearned,
  sampleWordsOutsideSet,
  setLearned,
  setLearnedMany,
  updateWord,
} from '../src/db/repositories/words';
import { MAX_PINNED, PinLimitError } from '../src/domain/pinning';
import { BUNDLED_LANGUAGES } from '../src/config/languages';
import {
  createLanguage,
  deleteLanguage,
  listCustomLanguages,
} from '../src/db/repositories/languages';
import {
  applyImportPlan,
  exportAll,
  exportSets,
  loadExisting,
} from '../src/db/repositories/backup';
import { parseBackup } from '../src/features/backup/format';
import { planImport } from '../src/features/backup/merge';
import { createId } from '../src/utils/id';
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
    await createWord(set.id, {
      term: 'der Topf',
      translation: 'кастрюля',
      examples: [],
    });
    expect(
      (await listFolders('de')).find(f => f.id === folder.id)?.setCount,
    ).toBe(1);

    await deleteFolder(folder.id);
    expect(await getFolder(folder.id)).toBeNull();
    expect((await listSets('de')).map(s => s.name)).toContain('Geschirr');
    expect(await listWords(set.id)).toHaveLength(1);
  });
});

describe('sets', () => {
  test('add / remove from the picker; a set can be in several folders', async () => {
    const f1 = await createFolder('en', 'Folder 1');
    const f2 = await createFolder('en', 'Folder 2');
    const set = await createSet('en', 'Verbs');
    await createSet('en', 'Adjectives');

    let picker = await listSetsForPicker(f1.id, 'en');
    expect(picker.find(s => s.id === set.id)?.inFolder).toBe(false);

    await setInFolder(f1.id, set.id, true);
    await setInFolder(f1.id, set.id, true); // idempotent
    await setInFolder(f2.id, set.id, true);
    picker = await listSetsForPicker(f1.id, 'en');
    expect(picker.find(s => s.id === set.id)?.inFolder).toBe(true);
    expect((await listSetsInFolder(f2.id)).map(s => s.name)).toEqual(['Verbs']);

    await setInFolder(f1.id, set.id, false);
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
  await createWord(set.id, {
    term: 'das   Essen',
    translation: 'еда',
    examples: [],
  });
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
    .executeSync(
      'SELECT term_norm FROM words WHERE set_id = ? ORDER BY term_norm',
      [set.id],
    )
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

test('reset progress marks every word of the set as not learned', async () => {
  const set = await createSet('en', 'Reset');
  const other = await createSet('en', 'Other');
  const make = (setId: string, term: string) =>
    createWord(setId, { term, translation: term, examples: [] });
  const a = await make(set.id, 'a');
  const b = await make(set.id, 'b');
  const c = await make(other.id, 'c');
  await setLearned(a.id, true);
  await setLearned(b.id, true);
  await setLearned(c.id, true);

  await resetLearned(set.id);
  expect((await listWords(set.id)).map(w => w.learnedAt)).toEqual([null, null]);
  expect((await listWords(other.id))[0].learnedAt).not.toBeNull();
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
  expect(
    rows('SELECT folder_id, set_id FROM folder_sets ORDER BY set_id'),
  ).toEqual([
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

  migrate(raw, 3);

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

test('migration v6: existing Chinese data becomes a custom language', () => {
  const withData = openNodeSqlite() as unknown as DB;
  migrate(withData, 5);
  withData.executeSync(
    "INSERT INTO sets VALUES ('s1', 'zh', 'Set', 1, 1, NULL)",
  );
  migrate(withData, 6);
  expect(withData.executeSync('SELECT code, name FROM languages').rows).toEqual(
    [{ code: 'zh', name: 'Chinese' }],
  );

  const empty = openNodeSqlite() as unknown as DB;
  migrate(empty, 6);
  expect(empty.executeSync('SELECT * FROM languages').rows).toEqual([]);
});

test('migration v7: existing words get an empty description', () => {
  const raw = openNodeSqlite() as unknown as DB;
  migrate(raw, 6);
  raw.executeSync("INSERT INTO sets VALUES ('s1', 'de', 'Set', 1, 1, NULL)");
  raw.executeSync(
    `INSERT INTO words (id, set_id, language_code, term, term_norm, translation, created_at, updated_at)
     VALUES ('w1', 's1', 'de', 'essen', 'essen', 'есть', 1, 1)`,
  );
  migrate(raw, 7);
  expect(raw.executeSync('SELECT description FROM words').rows).toEqual([
    { description: '' },
  ]);
  expect(raw.executeSync('SELECT * FROM rules').rows).toEqual([]);
});

test('migration v8: existing rules get an empty title', () => {
  const raw = openNodeSqlite() as unknown as DB;
  migrate(raw, 7);
  raw.executeSync("INSERT INTO sets VALUES ('s1', 'de', 'Set', 1, 1, NULL)");
  raw.executeSync(
    "INSERT INTO rules VALUES ('r1', 's1', 'de', '# Perfekt', 1, 1)",
  );
  migrate(raw, 8);
  expect(raw.executeSync('SELECT title, text FROM rules').rows).toEqual([
    { title: '', text: '# Perfekt' },
  ]);
});

describe('descriptions and rules', () => {
  test('a word keeps its description; an update without one keeps it', async () => {
    const set = await createSet('de', 'Desc set');
    const word = await createWord(set.id, {
      term: 'essen',
      translation: 'есть',
      examples: [],
      description: ' **isst**, aß ',
    });
    expect((await listWords(set.id))[0].description).toBe('**isst**, aß');

    await updateWord(word.id, {
      term: 'essen',
      translation: 'кушать',
      examples: [],
    });
    expect((await listWords(set.id))[0].description).toBe('**isst**, aß');
    await updateWord(word.id, {
      term: 'essen',
      translation: 'кушать',
      examples: [],
      description: '',
    });
    expect((await listWords(set.id))[0].description).toBe('');
  });

  test('rules: oldest first, counted per set, deleted with the set', async () => {
    const set = await createSet('de', 'Rules set');
    const first = await createRule(set.id, {
      title: ' Perfekt ',
      text: ' haben + **Partizip II** ',
    });
    await createRule(set.id, { title: 'Second', text: 'Text' });
    await createWord(set.id, {
      term: 'gehen',
      translation: 'идти',
      examples: [],
    });

    expect((await listRules(set.id)).map(r => [r.title, r.text])).toEqual([
      ['Perfekt', 'haben + **Partizip II**'],
      ['Second', 'Text'],
    ]);
    const listed = (await listSets('de')).find(s => s.id === set.id)!;
    expect([listed.wordCount, listed.ruleCount]).toEqual([1, 2]);
    // Rules are never study material.
    expect(await sampleWordsOutsideSet('nope', 100)).not.toContainEqual(
      expect.objectContaining({ term: 'Perfekt' }),
    );

    await updateRule(first.id, { title: 'Perfekt II', text: 'sein' });
    expect((await listRules(set.id))[0]).toMatchObject({
      title: 'Perfekt II',
      text: 'sein',
    });
    await deleteRule(first.id);
    expect(await listRules(set.id)).toHaveLength(1);

    await deleteSet(set.id);
    expect(
      db.executeSync('SELECT COUNT(*) AS n FROM rules WHERE set_id = ?', [
        set.id,
      ]).rows[0].n,
    ).toBe(0);
  });
});

test('parseExamples accepts legacy strings and pairs', () => {
  expect(parseExamples('["a", {"text": "b", "translation": "б"}]')).toEqual([
    { text: 'a', translation: '' },
    { text: 'b', translation: 'б' },
  ]);
  expect(parseExamples('not json')).toEqual([]);
});

describe('pin to top', () => {
  test('pinned folders come first (in manual order); limit is per language', async () => {
    const lang = 'pin-f';
    const folders = [];
    for (let i = 0; i < MAX_PINNED + 2; i++) {
      folders.push(await createFolder(lang, `F${i}`));
    }
    await setFolderPinned(folders[4].id, true);
    await setFolderPinned(folders[2].id, true);
    const names = async () => (await listFolders(lang)).map(f => f.name);
    expect(await names()).toEqual(['F2', 'F4', 'F0', 'F1', 'F3', 'F5', 'F6']);

    for (const f of folders.slice(0, MAX_PINNED)) {
      await setFolderPinned(f.id, true); // re-pinning is a no-op
    }
    await expect(setFolderPinned(folders[5].id, true)).rejects.toBeInstanceOf(
      PinLimitError,
    );
    // Other languages have their own limit.
    const other = await createFolder('pin-f2', 'Other');
    await setFolderPinned(other.id, true);

    await setFolderPinned(folders[0].id, false);
    await setFolderPinned(folders[5].id, true);
    expect((await listFolders(lang)).filter(f => f.pinnedAt).length).toBe(
      MAX_PINNED,
    );
  });

  test('pinned sets come first in the Sets tab, folders and the picker', async () => {
    const lang = 'pin-s';
    const folder = await createFolder(lang, 'Folder');
    const a = await createSet(lang, 'Alpha', folder.id);
    const b = await createSet(lang, 'Beta', folder.id);
    const c = await createSet(lang, 'Gamma', folder.id);
    await setSetPinned(c.id, true);
    await setSetPinned(b.id, true);

    const expected = ['Beta', 'Gamma', 'Alpha'];
    expect((await listSets(lang)).map(x => x.name)).toEqual(expected);
    expect((await listSetsInFolder(folder.id)).map(x => x.name)).toEqual(
      expected,
    );
    expect((await listSetsForPicker(folder.id, lang)).map(x => x.name)).toEqual(
      expected,
    );

    await setSetPinned(b.id, false);
    const sets = await listSets(lang);
    expect(sets.map(x => [x.name, x.pinnedAt !== null])).toEqual([
      ['Gamma', true],
      ['Alpha', false],
      ['Beta', false],
    ]);
    expect(a.pinnedAt).toBeNull();

    for (let i = 0; i < MAX_PINNED - 1; i++) {
      await setSetPinned((await createSet(lang, `S${i}`)).id, true);
    }
    await expect(setSetPinned(a.id, true)).rejects.toThrow(
      `You can pin up to ${MAX_PINNED} sets`,
    );
  });
});

describe('backup round trip', () => {
  test('a shared set can be deleted and imported back unchanged', async () => {
    const lang = 'de';
    const folder = await createFolder(lang, 'RT folder');
    const set = await createSet(lang, 'RT set', folder.id);
    const learned = await createWord(set.id, {
      term: 'der Hund, die Hunde',
      translation: 'собака',
      examples: [{ text: 'Der Hund bellt.', translation: 'Собака лает.' }],
    });
    await setLearned(learned.id, true);
    await createWord(set.id, {
      term: 'die Katze',
      translation: 'кошка',
      examples: [],
      description: '## Katze\n- *f*, die Katzen',
    });
    await createRule(set.id, {
      title: 'Plural',
      text: '| Sg | Pl |\n|--|--|\n| Hund | Hunde |',
    });
    await createRule(set.id, { title: 'Second', text: 'Second rule' });
    const before = await listWords(set.id);
    const ruleParts = (r: { title: string; text: string }) => [r.title, r.text];
    const rulesBefore = (await listRules(set.id)).map(ruleParts);

    const shared = await exportSets([set.id]);
    expect(shared.kind).toBe('sets');
    expect(shared.languages).toHaveLength(1);
    expect(shared.languages[0].folders).toEqual([]);
    // Survives JSON like a real file.
    const file = parseBackup(JSON.stringify(shared));

    await deleteSet(set.id);
    const plan = planImport(file, loadExisting, BUNDLED_LANGUAGES, createId);
    expect(plan.summary).toMatchObject({
      wordsAdded: 2,
      rulesAdded: 2,
      setsCreated: 1,
    });
    await applyImportPlan(plan);

    const restored = (await listSets(lang)).find(s => s.name === 'RT set')!;
    const after = await listWords(restored.id);
    const strip = (w: (typeof after)[number]) => [
      w.term,
      w.translation,
      w.examples,
      w.description,
      w.learnedAt !== null,
    ];
    expect(after.map(strip)).toEqual(before.map(strip));
    expect((await listRules(restored.id)).map(ruleParts)).toEqual(rulesBefore);

    // Importing the same file again only updates; no duplicates.
    const again = planImport(file, loadExisting, BUNDLED_LANGUAGES, createId);
    expect(again.summary).toMatchObject({
      wordsAdded: 0,
      wordsUpdated: 2,
      rulesAdded: 0,
      setsCreated: 0,
    });
    await applyImportPlan(again);
    expect(await listWords(restored.id)).toHaveLength(2);
    expect(await listRules(restored.id)).toHaveLength(2);
  });

  test('full export keeps folders in order with their set names', async () => {
    const lang = 'en';
    const f = await createFolder(lang, 'Full folder');
    await createSet(lang, 'Full set', f.id);
    const full = await exportAll();
    expect(full.kind).toBe('full');
    const en = full.languages.find(l => l.code === lang)!;
    expect(en.folders.find(x => x.name === 'Full folder')?.setNames).toEqual([
      'Full set',
    ]);
    expect(en.sets.some(s => s.name === 'Full set')).toBe(true);
  });
});

describe('custom languages', () => {
  test('are listed, exported with their name and re-created on import', async () => {
    const french = await createLanguage(' French ');
    expect(french.code.startsWith('x-')).toBe(true);
    expect(listCustomLanguages()).toContainEqual({
      code: french.code,
      name: 'French',
      nativeName: 'French',
      custom: true,
    });
    const set = await createSet(french.code, 'Animaux');
    await createWord(set.id, {
      term: 'le chat',
      translation: 'кот',
      examples: [],
    });

    const shared = await exportSets([set.id]);
    expect(shared.languages[0]).toMatchObject({
      code: french.code,
      name: 'French',
    });
    const full = await exportAll();
    expect(full.languages.find(l => l.code === 'de')?.name).toBeUndefined();

    await deleteLanguage(french.code);
    expect(listCustomLanguages().some(l => l.code === french.code)).toBe(false);
    expect(await listSets(french.code)).toEqual([]);

    const file = parseBackup(JSON.stringify(shared));
    const plan = planImport(file, loadExisting, BUNDLED_LANGUAGES, createId);
    expect(plan.summary.languagesCreated).toEqual(['French']);
    await applyImportPlan(plan);
    expect(listCustomLanguages().map(l => l.name)).toContain('French');
    const [restored] = await listSets(french.code);
    expect((await listWords(restored.id)).map(w => w.term)).toEqual([
      'le chat',
    ]);
  });

  test('deleting a language deletes its folders, sets and words only', async () => {
    const lang = await createLanguage('Latin');
    const folder = await createFolder(lang.code, 'F');
    const set = await createSet(lang.code, 'S', folder.id);
    await createWord(set.id, {
      term: 'lux',
      translation: 'свет',
      examples: [],
    });
    const other = await createSet('en', 'Keep me');

    await deleteLanguage(lang.code);
    const left = (table: string) =>
      Number(
        db.executeSync(
          `SELECT COUNT(*) AS n FROM ${table} WHERE language_code = ?`,
          [lang.code],
        ).rows[0].n,
      );
    expect([left('folders'), left('sets'), left('words')]).toEqual([0, 0, 0]);
    expect(
      db.executeSync('SELECT * FROM folder_sets WHERE folder_id = ?', [
        folder.id,
      ]).rows,
    ).toEqual([]);
    expect((await listSets('en')).some(s => s.id === other.id)).toBe(true);
  });
});

describe('study words helpers', () => {
  test('setLearnedMany marks words; sampleWordsOutsideSet skips the set and other languages', async () => {
    const set = await createSet('de', 'SW set');
    const other = await createSet('de', 'SW other');
    const english = await createSet('en', 'SW english');
    const a = await createWord(set.id, {
      term: 'a',
      translation: 'а',
      examples: [],
    });
    const b = await createWord(set.id, {
      term: 'b',
      translation: 'б',
      examples: [],
    });
    const c = await createWord(other.id, {
      term: 'c',
      translation: 'в',
      examples: [],
    });
    await createWord(english.id, { term: 'e', translation: 'е', examples: [] });

    await setLearnedMany([a.id, b.id]);
    expect((await listWords(set.id)).every(w => w.learnedAt !== null)).toBe(
      true,
    );

    const sample = await sampleWordsOutsideSet(set.id, 1000);
    const ids = sample.map(w => w.id);
    expect(ids).toContain(c.id);
    expect(ids).not.toContain(a.id);
    expect(sample.every(w => w.term !== 'e')).toBe(true);
  });
});
