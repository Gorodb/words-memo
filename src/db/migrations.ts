import type { DB } from '@op-engineering/op-sqlite';

/**
 * Append-only list. Index + 1 = schema version stored in PRAGMA user_version.
 * Never edit a migration that has shipped; add a new one instead.
 */
const MIGRATIONS: string[][] = [
  // v1
  [
    `CREATE TABLE folders (
      id TEXT PRIMARY KEY NOT NULL,
      language_code TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    'CREATE INDEX idx_folders_language ON folders (language_code)',
    `CREATE TABLE sets (
      id TEXT PRIMARY KEY NOT NULL,
      folder_id TEXT NOT NULL REFERENCES folders (id) ON DELETE CASCADE,
      language_code TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    'CREATE INDEX idx_sets_folder ON sets (folder_id)',
    'CREATE INDEX idx_sets_language ON sets (language_code)',
    `CREATE TABLE words (
      id TEXT PRIMARY KEY NOT NULL,
      set_id TEXT NOT NULL REFERENCES sets (id) ON DELETE CASCADE,
      language_code TEXT NOT NULL,
      term TEXT NOT NULL,
      term_norm TEXT NOT NULL,
      translation TEXT NOT NULL,
      examples_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    'CREATE INDEX idx_words_set ON words (set_id)',
    'CREATE INDEX idx_words_term ON words (language_code, term_norm)',
    `CREATE TABLE settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`,
  ],
  // v2: sets no longer belong to one folder; folders pin any number of sets
  // (removing a folder keeps its sets). Folders get a manual sort position.
  [
    'ALTER TABLE folders ADD COLUMN position INTEGER NOT NULL DEFAULT 0',
    // Keep the previous (alphabetical) order as the starting manual order.
    `UPDATE folders SET position = (
      SELECT COUNT(*) FROM folders f2
      WHERE f2.language_code = folders.language_code
        AND (f2.name COLLATE NOCASE < folders.name COLLATE NOCASE
          OR (f2.name COLLATE NOCASE = folders.name COLLATE NOCASE AND f2.id < folders.id))
    )`,
    `CREATE TABLE sets_new (
      id TEXT PRIMARY KEY NOT NULL,
      language_code TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    'INSERT INTO sets_new SELECT id, language_code, name, created_at, updated_at FROM sets',
    `CREATE TABLE folder_sets (
      folder_id TEXT NOT NULL REFERENCES folders (id) ON DELETE CASCADE,
      set_id TEXT NOT NULL REFERENCES sets (id) ON DELETE CASCADE,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (folder_id, set_id)
    )`,
    'INSERT INTO folder_sets SELECT folder_id, id, created_at FROM sets',
    'DROP TABLE sets',
    'ALTER TABLE sets_new RENAME TO sets',
    'CREATE INDEX idx_sets_language ON sets (language_code)',
    'CREATE INDEX idx_folder_sets_set ON folder_sets (set_id)',
  ],
  // v3: learned state, manual list order, examples become {text, translation} pairs.
  [
    'ALTER TABLE words ADD COLUMN learned_at INTEGER',
    'ALTER TABLE words ADD COLUMN sort_at INTEGER NOT NULL DEFAULT 0',
    'UPDATE words SET sort_at = created_at',
    `UPDATE words SET examples_json = (
      SELECT COALESCE(json_group_array(json_object('text', value, 'translation', '')), '[]')
      FROM json_each(words.examples_json)
      WHERE json_each.type = 'text'
    )`,
  ],
  // v4: pin up to MAX_PINNED folders / sets per language to the top of lists.
  [
    'ALTER TABLE folders ADD COLUMN pinned_at INTEGER',
    'ALTER TABLE sets ADD COLUMN pinned_at INTEGER',
  ],
  // v5: languages the user adds (no dictionary); bundled ones stay in config.
  [
    `CREATE TABLE languages (
      code TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
  ],
  // v6: Chinese is no longer bundled. Existing Chinese data stays as a custom language.
  [
    `INSERT INTO languages (code, name, created_at)
     SELECT 'zh', 'Chinese', CAST(strftime('%s', 'now') AS INTEGER) * 1000
     WHERE EXISTS (SELECT 1 FROM sets WHERE language_code = 'zh')
        OR EXISTS (SELECT 1 FROM folders WHERE language_code = 'zh')`,
  ],
  // v7: a long Markdown description per word, and rules (Markdown text, read only, never studied).
  [
    "ALTER TABLE words ADD COLUMN description TEXT NOT NULL DEFAULT ''",
    `CREATE TABLE rules (
      id TEXT PRIMARY KEY NOT NULL,
      set_id TEXT NOT NULL REFERENCES sets (id) ON DELETE CASCADE,
      language_code TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    'CREATE INDEX idx_rules_set ON rules (set_id)',
  ],
  // v8: rules get a title (the rules list shows only titles).
  ["ALTER TABLE rules ADD COLUMN title TEXT NOT NULL DEFAULT ''"],
];

/**
 * Foreign keys are switched off while migrating so tables can be rebuilt
 * (DROP + RENAME) without cascading deletes; integrity is checked before commit.
 * `target` (schema version to stop at) exists for migration tests.
 */
export function migrate(db: DB, target = MIGRATIONS.length): void {
  const current = Number(
    db.executeSync('PRAGMA user_version').rows[0]?.user_version ?? 0,
  );
  if (current >= target) {
    return;
  }
  db.executeSync('PRAGMA foreign_keys = OFF');
  try {
    for (let version = current; version < target; version++) {
      runMigration(db, version);
    }
  } finally {
    db.executeSync('PRAGMA foreign_keys = ON');
  }
}

function runMigration(db: DB, version: number): void {
  db.executeSync('BEGIN');
  try {
    for (const statement of MIGRATIONS[version]) {
      db.executeSync(statement);
    }
    const violations = db.executeSync('PRAGMA foreign_key_check').rows;
    if (violations.length > 0) {
      throw new Error(
        `Migration ${version + 1} broke foreign keys: ${JSON.stringify(
          violations,
        )}`,
      );
    }
    // PRAGMA doesn't accept bound parameters.
    db.executeSync(`PRAGMA user_version = ${version + 1}`);
    db.executeSync('COMMIT');
  } catch (e) {
    db.executeSync('ROLLBACK');
    throw e;
  }
}
