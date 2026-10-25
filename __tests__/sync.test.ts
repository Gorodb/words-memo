/**
 * Sync queue (migration v9 triggers), collecting changes and applying pulled
 * ones, against Node's built-in SQLite.
 */
jest.mock('@op-engineering/op-sqlite', () => ({
  open: () => require('../test-utils/sqliteAdapter').openNodeSqlite(),
}));

import type { DB } from '@op-engineering/op-sqlite';
import { subscribe } from '../src/db/changes';
import { initDatabase } from '../src/db/database';
import { createFolder, reorderFolders } from '../src/db/repositories/folders';
import {
  createLanguage,
  deleteLanguage,
} from '../src/db/repositories/languages';
import { createRule } from '../src/db/repositories/rules';
import { createSet, deleteSet, setInFolder } from '../src/db/repositories/sets';
import {
  applyRemoteChanges,
  collectChanges,
  hasPendingChanges,
} from '../src/db/repositories/sync';
import {
  createWord,
  listWords,
  updateWord,
} from '../src/db/repositories/words';
import {
  emptyChanges,
  type SyncChanges,
  type WordRecord,
} from '../src/features/sync/protocol';

let db: DB;

beforeAll(() => {
  db = initDatabase();
});

beforeEach(() => {
  for (const table of [
    'sets',
    'folders',
    'languages',
    'sync_queue',
    'sync_pause',
  ]) {
    db.executeSync(`DELETE FROM ${table}`);
  }
});

const queue = () =>
  db
    .executeSync('SELECT table_name, row_key FROM sync_queue ORDER BY seq')
    .rows.map(r => `${r.table_name}/${r.row_key}`);

/** Pretends the server took everything queued so far. */
async function push(): Promise<SyncChanges> {
  const { changes, upToSeq } = await collectChanges(false);
  applyRemoteChanges(emptyChanges(), upToSeq);
  return changes;
}

const remoteWord = (over: Partial<WordRecord>): WordRecord => ({
  id: 'remote-w',
  setId: 'remote-s',
  languageCode: 'de',
  term: 'essen',
  termNorm: 'essen',
  translation: 'есть',
  examples: [{ text: 'Ich esse', translation: 'Я ем' }],
  description: '',
  learnedAt: null,
  sortAt: 5,
  createdAt: 1,
  updatedAt: 2,
  ...over,
});

describe('sync queue', () => {
  test('records inserts, updates and deletes once per row, newest last', async () => {
    const set = await createSet('de', 'Verbs');
    const word = await createWord(set.id, {
      term: 'essen',
      translation: 'есть',
      examples: [],
    });
    await updateWord(word.id, {
      term: 'essen',
      translation: 'кушать',
      examples: [],
    });
    expect(queue()).toEqual([`sets/${set.id}`, `words/${word.id}`]);
    expect(await hasPendingChanges()).toBe(true);
  });

  test('cascaded deletes are recorded too', async () => {
    const set = await createSet('de', 'Verbs');
    const folder = await createFolder('de', 'A1');
    await setInFolder(folder.id, set.id, true);
    const word = await createWord(set.id, {
      term: 'essen',
      translation: 'есть',
      examples: [],
    });
    const rule = await createRule(set.id, { title: 'T', text: 'x' });
    await push();
    expect(queue()).toEqual([]);

    await deleteSet(set.id);
    const { changes } = await collectChanges(false);
    expect(changes.sets.deletes).toEqual([set.id]);
    expect(changes.words.deletes).toEqual([word.id]);
    expect(changes.rules.deletes).toEqual([rule.id]);
    expect(changes.folderSets.deletes).toEqual([`${folder.id}:${set.id}`]);
    expect(changes.folders.upserts).toEqual([]);
  });

  test('INSERT OR IGNORE outside still moves the row to the end of the queue', async () => {
    const set = await createSet('de', 'Verbs');
    const folder = await createFolder('de', 'A1');
    await setInFolder(folder.id, set.id, true);
    const { upToSeq } = await collectChanges(false);
    // Removed and added again after the push started: must stay queued.
    await setInFolder(folder.id, set.id, false);
    await setInFolder(folder.id, set.id, true);
    applyRemoteChanges(emptyChanges(), upToSeq);
    expect(queue()).toEqual([`folderSets/${folder.id}:${set.id}`]);
  });

  test('custom languages are synced by code; reordering queues folders', async () => {
    const language = await createLanguage('Chinese');
    const a = await createFolder(language.code, 'A');
    const b = await createFolder(language.code, 'B');
    await push();
    await reorderFolders([b.id, a.id]);
    expect(queue()).toEqual([`folders/${b.id}`, `folders/${a.id}`]);
    await push();

    await deleteLanguage(language.code);
    const changes = await push();
    expect(changes.languages.deletes).toEqual([language.code]);
    expect(changes.folders.deletes.sort()).toEqual([a.id, b.id].sort());
  });
});

describe('collectChanges', () => {
  test('full sends every row plus queued deletions', async () => {
    const kept = await createSet('de', 'Kept');
    const gone = await createSet('de', 'Gone');
    await createWord(kept.id, {
      term: 'essen',
      translation: 'есть',
      examples: [{ text: 'Ich esse', translation: '' }],
    });
    await push();
    await deleteSet(gone.id);

    const { changes } = await collectChanges(true);
    expect(changes.sets.upserts.map(s => s.name)).toEqual(['Kept']);
    expect(changes.sets.deletes).toEqual([gone.id]);
    expect(changes.words.upserts).toEqual([
      expect.objectContaining({
        setId: kept.id,
        term: 'essen',
        termNorm: 'essen',
        examples: [{ text: 'Ich esse', translation: '' }],
        learnedAt: null,
      }),
    ]);
  });
});

describe('applyRemoteChanges', () => {
  test('inserts parents before children and does not queue pulled rows', async () => {
    const changes = emptyChanges();
    changes.languages.upserts = [{ code: 'x-r', name: 'Remote', createdAt: 1 }];
    changes.sets.upserts = [
      {
        id: 'remote-s',
        languageCode: 'de',
        name: 'Remote set',
        pinnedAt: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    changes.folders.upserts = [
      {
        id: 'remote-f',
        languageCode: 'de',
        name: 'Remote folder',
        position: 0,
        pinnedAt: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    changes.folderSets.upserts = [
      { folderId: 'remote-f', setId: 'remote-s', addedAt: 1 },
      // Parent missing on this phone: skipped.
      { folderId: 'remote-f', setId: 'missing', addedAt: 1 },
    ];
    changes.words.upserts = [
      remoteWord({}),
      remoteWord({ id: 'orphan', setId: 'missing' }),
    ];
    changes.rules.upserts = [
      {
        id: 'remote-r',
        setId: 'remote-s',
        languageCode: 'de',
        title: 'Perfekt',
        text: 'haben / sein',
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const notified: string[][] = [];
    const unsubscribe = subscribe(tables => notified.push(tables));
    applyRemoteChanges(changes, 0);
    unsubscribe();

    expect(await listWords('remote-s')).toEqual([
      expect.objectContaining({ id: 'remote-w', translation: 'есть' }),
    ]);
    const count = (sql: string) => db.executeSync(sql).rows.length;
    expect(count('SELECT 1 FROM folder_sets')).toBe(1);
    expect(count('SELECT 1 FROM rules')).toBe(1);
    expect(count("SELECT 1 FROM languages WHERE code = 'x-r'")).toBe(1);
    expect(queue()).toEqual([]);
    expect(notified).toHaveLength(1);
  });

  test('updates in place without cascading, and deletes', async () => {
    const set = await createSet('de', 'Verbs');
    const word = await createWord(set.id, {
      term: 'essen',
      translation: 'есть',
      examples: [],
    });
    await push();

    const changes = emptyChanges();
    changes.sets.upserts = [
      {
        id: set.id,
        languageCode: 'de',
        name: 'Renamed',
        pinnedAt: 7,
        createdAt: set.createdAt,
        updatedAt: 9,
      },
    ];
    applyRemoteChanges(changes, 0);
    // ON CONFLICT DO UPDATE, not REPLACE: the word survives.
    expect(await listWords(set.id)).toHaveLength(1);

    const deletion = emptyChanges();
    deletion.words.deletes = [word.id];
    applyRemoteChanges(deletion, 0);
    expect(await listWords(set.id)).toEqual([]);
    expect(queue()).toEqual([]);
  });

  test('the phone wins: rows changed after the push started are left alone', async () => {
    const set = await createSet('de', 'Verbs');
    const word = await createWord(set.id, {
      term: 'essen',
      translation: 'есть',
      examples: [],
    });
    const { upToSeq } = await collectChanges(false);
    // Edited locally while the request is in flight.
    await updateWord(word.id, {
      term: 'essen',
      translation: 'local',
      examples: [],
    });
    const changes = emptyChanges();
    changes.words.upserts = [
      remoteWord({ id: word.id, setId: set.id, translation: 'remote' }),
    ];
    changes.sets.deletes = [set.id];
    applyRemoteChanges(changes, upToSeq);

    // The set stays (deleting it would take the local edit with it) and both
    // go out with the next push.
    expect(await listWords(set.id)).toEqual([
      expect.objectContaining({ translation: 'local' }),
    ]);
    expect(queue()).toEqual([`words/${word.id}`, `sets/${set.id}`]);
  });

  test('deletions elsewhere apply when nothing changed here', async () => {
    const set = await createSet('de', 'Verbs');
    const folder = await createFolder('de', 'A1');
    await setInFolder(folder.id, set.id, true);
    await createWord(set.id, {
      term: 'essen',
      translation: 'есть',
      examples: [],
    });
    await push();
    const changes = emptyChanges();
    changes.sets.deletes = [set.id];
    changes.folders.deletes = [folder.id];
    applyRemoteChanges(changes, 0);
    expect(db.executeSync('SELECT 1 FROM sets').rows).toEqual([]);
    expect(db.executeSync('SELECT 1 FROM folders').rows).toEqual([]);
    expect(db.executeSync('SELECT 1 FROM words').rows).toEqual([]);
    expect(queue()).toEqual([]);
  });

  test('a language deleted elsewhere is kept while it has content here', async () => {
    const language = await createLanguage('Chinese');
    await createSet(language.code, 'Mine');
    await push();
    const changes = emptyChanges();
    changes.languages.deletes = [language.code];
    applyRemoteChanges(changes, 0);
    expect(
      db.executeSync('SELECT name FROM languages').rows.map(r => r.name),
    ).toEqual(['Chinese']);
    expect(queue()).toEqual([`languages/${language.code}`]);
  });

  test('rolls back and keeps the queue when a statement fails', async () => {
    const set = await createSet('de', 'Verbs');
    const { upToSeq } = await collectChanges(false);
    const changes = emptyChanges();
    changes.sets.upserts = [
      // NOT NULL name: fails.
      {
        id: 'bad',
        languageCode: 'de',
        name: null as unknown as string,
        pinnedAt: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    expect(() => applyRemoteChanges(changes, upToSeq)).toThrow();
    expect(queue()).toEqual([`sets/${set.id}`]);
    expect(db.executeSync('SELECT 1 FROM sync_pause').rows).toEqual([]);
  });
});
