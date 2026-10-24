import type { Scalar } from '@op-engineering/op-sqlite';
import type { ID, Rule, RuleInput } from '../../domain/types';
import { createId } from '../../utils/id';
import { notifyChanged } from '../changes';
import { getDb } from '../database';

type Row = Record<string, Scalar>;

function toRule(row: Row): Rule {
  return {
    id: row.id as string,
    setId: row.set_id as string,
    languageCode: row.language_code as string,
    title: (row.title as string | null) ?? '',
    text: row.text as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

/** Rules of a set in the order they were added (they read like a textbook). */
export async function listRules(setId: ID): Promise<Rule[]> {
  const { rows } = await getDb().execute(
    'SELECT * FROM rules WHERE set_id = ? ORDER BY created_at, rowid',
    [setId],
  );
  return rows.map(toRule);
}

/** The rule inherits the language of its set. */
export async function createRule(setId: ID, input: RuleInput): Promise<Rule> {
  const db = getDb();
  const { rows } = await db.execute(
    'SELECT language_code FROM sets WHERE id = ?',
    [setId],
  );
  if (!rows[0]) {
    throw new Error(`Set ${setId} not found`);
  }
  const now = Date.now();
  const rule: Rule = {
    id: createId(),
    setId,
    languageCode: rows[0].language_code as string,
    title: input.title.trim(),
    text: input.text.trim(),
    createdAt: now,
    updatedAt: now,
  };
  await db.execute(
    `INSERT INTO rules (id, set_id, language_code, title, text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [rule.id, setId, rule.languageCode, rule.title, rule.text, now, now],
  );
  notifyChanged('rules');
  return rule;
}

export async function updateRule(id: ID, input: RuleInput): Promise<void> {
  await getDb().execute(
    'UPDATE rules SET title = ?, text = ?, updated_at = ? WHERE id = ?',
    [input.title.trim(), input.text.trim(), Date.now(), id],
  );
  notifyChanged('rules');
}

export async function deleteRule(id: ID): Promise<void> {
  await getDb().execute('DELETE FROM rules WHERE id = ?', [id]);
  notifyChanged('rules');
}
