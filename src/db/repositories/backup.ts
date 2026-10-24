import type {
  BackupFile,
  BackupSet,
  ID,
  LanguageCode,
} from '../../domain/types';
import type { ExistingLanguage, ImportPlan } from '../../features/backup/merge';
import { BACKUP_APP, BACKUP_VERSION } from '../../features/backup/format';
import { notifyChanged } from '../changes';
import { getDb } from '../database';
import { parseExamples } from './words';

async function setsWithWords(
  where: string,
  params: Array<string | number>,
): Promise<Map<ID, BackupSet & { languageCode: LanguageCode }>> {
  const db = getDb();
  const { rows: sets } = await db.execute(
    `SELECT * FROM sets WHERE ${where} ORDER BY pinned_at IS NULL, name COLLATE NOCASE`,
    params,
  );
  const result = new Map<ID, BackupSet & { languageCode: LanguageCode }>();
  for (const s of sets) {
    result.set(s.id as string, {
      languageCode: s.language_code as string,
      name: s.name as string,
      createdAt: s.created_at as number,
      updatedAt: s.updated_at as number,
      words: [],
      rules: [],
    });
  }
  if (result.size === 0) {
    return result;
  }
  const ids = [...result.keys()];
  const { rows: words } = await db.execute(
    `SELECT * FROM words WHERE set_id IN (${ids.map(() => '?').join(', ')})
     ORDER BY learned_at IS NOT NULL, sort_at DESC, rowid DESC`,
    ids,
  );
  for (const w of words) {
    result.get(w.set_id as string)?.words.push({
      term: w.term as string,
      translation: w.translation as string,
      examples: parseExamples(w.examples_json),
      description: (w.description as string | null) ?? '',
      learnedAt: (w.learned_at as number | null) ?? null,
      createdAt: w.created_at as number,
      updatedAt: w.updated_at as number,
    });
  }
  const { rows: rules } = await db.execute(
    `SELECT * FROM rules WHERE set_id IN (${ids.map(() => '?').join(', ')})
     ORDER BY created_at, rowid`,
    ids,
  );
  for (const r of rules) {
    result.get(r.set_id as string)?.rules.push({
      title: (r.title as string | null) ?? '',
      text: r.text as string,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
    });
  }
  return result;
}

/** Names of custom languages by code; bundled languages aren't listed. */
async function customLanguageNames(): Promise<Map<LanguageCode, string>> {
  const { rows } = await getDb().execute('SELECT code, name FROM languages');
  return new Map(rows.map(r => [r.code as string, r.name as string]));
}

/** A file entry for a language; custom languages carry their name. */
function languageEntryFor(
  code: LanguageCode,
  names: Map<LanguageCode, string>,
): BackupFile['languages'][number] {
  const name = names.get(code);
  return { code, ...(name !== undefined && { name }), folders: [], sets: [] };
}

/** Everything: all languages, folders (manual order) and sets with words. */
export async function exportAll(): Promise<BackupFile> {
  const db = getDb();
  const sets = await setsWithWords('1 = 1', []);
  const { rows: folders } = await db.execute(
    'SELECT * FROM folders ORDER BY language_code, pinned_at IS NULL, position, created_at',
  );
  const { rows: links } = await db.execute(
    'SELECT folder_id, set_id FROM folder_sets ORDER BY added_at',
  );

  const names = await customLanguageNames();
  const languages = new Map<LanguageCode, BackupFile['languages'][number]>();
  const languageEntry = (code: LanguageCode) => {
    let entry = languages.get(code);
    if (!entry) {
      entry = languageEntryFor(code, names);
      languages.set(code, entry);
    }
    return entry;
  };
  for (const { languageCode, ...set } of sets.values()) {
    languageEntry(languageCode).sets.push(set);
  }
  for (const f of folders) {
    languageEntry(f.language_code as string).folders.push({
      name: f.name as string,
      createdAt: f.created_at as number,
      updatedAt: f.updated_at as number,
      setNames: links
        .filter(l => l.folder_id === f.id)
        .map(l => sets.get(l.set_id as string)?.name)
        .filter((n): n is string => !!n),
    });
  }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    kind: 'full',
    exportedAt: Date.now(),
    languages: [...languages.values()],
  };
}

/** Selected sets only (for sharing): no folders, nothing else. */
export async function exportSets(setIds: ID[]): Promise<BackupFile> {
  const sets = await setsWithWords(
    `id IN (${setIds.map(() => '?').join(', ')})`,
    setIds,
  );
  const names = await customLanguageNames();
  const languages = new Map<LanguageCode, BackupFile['languages'][number]>();
  for (const { languageCode, ...set } of sets.values()) {
    const entry =
      languages.get(languageCode) ?? languageEntryFor(languageCode, names);
    entry.sets.push(set);
    languages.set(languageCode, entry);
  }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    kind: 'sets',
    exportedAt: Date.now(),
    languages: [...languages.values()],
  };
}

/** What the import planner needs to know about one language. */
export function loadExisting(languageCode: LanguageCode): ExistingLanguage {
  const db = getDb();
  const sets = db
    .executeSync(
      'SELECT id, name FROM sets WHERE language_code = ? ORDER BY created_at',
      [languageCode],
    )
    .rows.map(r => ({ id: r.id as string, name: r.name as string }));
  const links = db.executeSync(
    `SELECT fs.folder_id, fs.set_id FROM folder_sets fs
     JOIN folders f ON f.id = fs.folder_id WHERE f.language_code = ?`,
    [languageCode],
  ).rows;
  const folders = db
    .executeSync(
      'SELECT id, name FROM folders WHERE language_code = ? ORDER BY position',
      [languageCode],
    )
    .rows.map(r => ({
      id: r.id as string,
      name: r.name as string,
      setIds: links
        .filter(l => l.folder_id === r.id)
        .map(l => l.set_id as string),
    }));
  const wordIdsByTerm = new Map<string, ID[]>();
  for (const r of db.executeSync(
    'SELECT id, term_norm FROM words WHERE language_code = ?',
    [languageCode],
  ).rows) {
    const key = r.term_norm as string;
    wordIdsByTerm.set(key, [...(wordIdsByTerm.get(key) ?? []), r.id as string]);
  }
  const ruleTextsBySet = new Map<ID, string[]>();
  for (const r of db.executeSync(
    'SELECT set_id, text FROM rules WHERE language_code = ?',
    [languageCode],
  ).rows) {
    const key = r.set_id as string;
    ruleTextsBySet.set(key, [
      ...(ruleTextsBySet.get(key) ?? []),
      r.text as string,
    ]);
  }
  return { sets, folders, wordIdsByTerm, ruleTextsBySet };
}

/** Applies an import plan in one transaction (all or nothing). */
export async function applyImportPlan(plan: ImportPlan): Promise<void> {
  const now = Date.now();
  await getDb().transaction(async tx => {
    for (const l of plan.createLanguages) {
      await tx.execute(
        'INSERT OR IGNORE INTO languages (code, name, created_at) VALUES (?, ?, ?)',
        [l.code, l.name, now],
      );
    }
    for (const s of plan.createSets) {
      await tx.execute(
        'INSERT INTO sets (id, language_code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [s.id, s.languageCode, s.name, s.createdAt, s.updatedAt],
      );
    }
    for (const f of plan.createFolders) {
      // New folders go to the end of the manual order.
      await tx.execute(
        `INSERT INTO folders (id, language_code, name, position, created_at, updated_at)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM folders WHERE language_code = ?), ?, ?)`,
        [
          f.id,
          f.languageCode,
          f.name,
          f.languageCode,
          f.createdAt,
          f.updatedAt,
        ],
      );
    }
    for (const link of plan.addToFolder) {
      await tx.execute(
        'INSERT OR IGNORE INTO folder_sets (folder_id, set_id, added_at) VALUES (?, ?, ?)',
        [link.folderId, link.setId, now],
      );
    }
    for (const w of plan.updateWords) {
      await tx.execute(
        'UPDATE words SET translation = ?, examples_json = ?, description = ?, updated_at = ? WHERE id = ?',
        [w.translation, JSON.stringify(w.examples), w.description, now, w.id],
      );
    }
    for (const w of plan.insertWords) {
      // The backup's order is newest first, so later rows sort lower.
      await tx.execute(
        `INSERT INTO words (id, set_id, language_code, term, term_norm, translation, examples_json, description, learned_at, sort_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          w.id,
          w.setId,
          w.languageCode,
          w.term,
          w.termNorm,
          w.translation,
          JSON.stringify(w.examples),
          w.description,
          w.learnedAt,
          w.createdAt,
          w.createdAt,
          w.updatedAt,
        ],
      );
    }
    for (const r of plan.insertRules) {
      await tx.execute(
        `INSERT INTO rules (id, set_id, language_code, title, text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          r.id,
          r.setId,
          r.languageCode,
          r.title,
          r.text,
          r.createdAt,
          r.updatedAt,
        ],
      );
    }
  });
  notifyChanged('folders', 'sets', 'folder_sets', 'words', 'rules');
}
