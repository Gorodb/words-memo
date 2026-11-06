/// <reference types="node" />
/** Debug helper: `node scripts/dictionary/query.ts de essen Essen apf` */
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { searchEntries } from '../../src/features/dictionary/queries.ts';
import { BUILD_DIR } from './sources.ts';

const [language, ...queries] = process.argv.slice(2);
const db = new DatabaseSync(path.join(BUILD_DIR, `${language}-ru.db`), {
  readOnly: true,
});
const adapter = {
  execute: async (query: string, params: unknown[] = []) => ({
    rows: db.prepare(query).all(...(params as never[])) as never,
  }),
};
for (const q of queries) {
  console.log(`\n> ${q}`);
  for (const e of await searchEntries(adapter, q, 5)) {
    console.log(`  ${e.display} [${e.pos}] — ${e.glosses.slice(0, 2).join(' | ')}`);
  }
}
