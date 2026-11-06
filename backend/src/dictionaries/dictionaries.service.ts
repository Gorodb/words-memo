/**
 * The Wiktionary dictionaries (`<lang>-ru.db`, built by the app's
 * `npm run dict:build`) are kept on the server: the app downloads them from
 * here, and the website looks words up through the API instead.
 *
 * Files live in DICTIONARIES_DIR (default: `dictionaries/` in the app root).
 * They are read-only SQLite files, opened with Node's built-in `node:sqlite`.
 */
import { Injectable, Logger, NotFoundException, type OnApplicationShutdown } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  entryIdsByKey,
  findExact,
  searchEntries,
  type DictionaryDb,
  type DictionaryEntry,
  type Scalar,
} from './queries.ts';

/** Must equal FORMAT_VERSION in the app's mobile/scripts/dictionary/schema.ts. */
export const DICTIONARY_FORMAT = 1;

const FILE = /^([a-z]{2,3})-ru\.db$/;

export const DictionaryErrorCode = {
  notFound: 'DICTIONARY_NOT_FOUND',
} as const;

export interface DictionaryInfo {
  language: string;
  /** File name, also the download path: GET /dictionaries/<file>. */
  file: string;
  sizeBytes: number;
  format: number;
  /** ISO time the file was last replaced. */
  updatedAt: string;
}

@Injectable()
export class DictionariesService implements OnApplicationShutdown {
  private readonly logger = new Logger(DictionariesService.name);
  readonly dir = path.resolve(
    process.env.DICTIONARIES_DIR ?? path.join(process.cwd(), 'dictionaries'),
  );
  private readonly open = new Map<string, { db: DatabaseSync; mtimeMs: number }>();

  /** Absolute path of a dictionary file, or null for anything else. */
  filePath(file: string): string | null {
    if (!FILE.test(file)) {
      return null;
    }
    const full = path.join(this.dir, file);
    return fs.existsSync(full) ? full : null;
  }

  list(): DictionaryInfo[] {
    let names: string[];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return [];
    }
    return names.flatMap(file => {
      const match = FILE.exec(file);
      if (!match) {
        return [];
      }
      try {
        const stat = fs.statSync(path.join(this.dir, file));
        const format = this.format(match[1]);
        return [
          {
            language: match[1],
            file,
            sizeBytes: stat.size,
            format,
            updatedAt: stat.mtime.toISOString(),
          },
        ];
      } catch (e) {
        this.logger.warn(`Skipping ${file}: ${e instanceof Error ? e.message : e}`);
        return [];
      }
    });
  }

  has(language: string): boolean {
    return this.filePath(`${language}-ru.db`) !== null;
  }

  /** Prefix search over lemmas and forms ("isst" finds essen). */
  search(language: string, text: string): Promise<DictionaryEntry[]> {
    return searchEntries(this.db(language), text);
  }

  /** Entries of a typed term's main form (for translation suggestions). */
  exact(language: string, term: string): Promise<DictionaryEntry[]> {
    return findExact(this.db(language), term);
  }

  /** Entry ids per key ("isst" → [essen]); empty without a dictionary. */
  async entryIds(language: string, keys: string[]): Promise<Map<string, number[]>> {
    if (!this.has(language)) {
      return new Map();
    }
    return entryIdsByKey(this.db(language), keys);
  }

  private format(language: string): number {
    const row = this.connection(language)
      .prepare("SELECT value FROM meta WHERE key = 'format'")
      .get() as { value?: string } | undefined;
    return Number(row?.value ?? 0);
  }

  /** Reopens a file that was replaced since it was opened. */
  private connection(language: string): DatabaseSync {
    const file = this.filePath(`${language}-ru.db`);
    if (!file) {
      throw new NotFoundException({
        code: DictionaryErrorCode.notFound,
        message: `There is no ${language} dictionary on the server`,
      });
    }
    const { mtimeMs } = fs.statSync(file);
    const cached = this.open.get(language);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.db;
    }
    cached?.db.close();
    const db = new DatabaseSync(file, { readOnly: true });
    this.open.set(language, { db, mtimeMs });
    return db;
  }

  private db(language: string): DictionaryDb {
    const connection = this.connection(language);
    return {
      execute: async (query, params = []) => ({
        rows: connection
          .prepare(query)
          .all(...(params as Array<Exclude<Scalar, bigint> | bigint>)) as Array<
          Record<string, Scalar>
        >,
      }),
    };
  }

  onApplicationShutdown(): void {
    for (const { db } of this.open.values()) {
      db.close();
    }
    this.open.clear();
  }
}
