/**
 * Spots words that are already added while a new one is typed: the same word
 * ("der Apfel" vs "Apfel, die Äpfel") or another form of the same dictionary
 * entry ("isst" vs "essen", "went" vs "go"). Pure, so it's unit tested.
 */
import { mainForm } from '../dictionary/queries';
import { searchKey } from '../dictionary/searchKey';

export interface KnownWord {
  id: string;
  term: string;
  setName: string;
}

export interface SimilarWord extends KnownWord {
  /** Same main form (ignoring case and articles), not just a related form. */
  same: boolean;
}

/** Compared form of a term: main form without "der/die/das" or "to", lowercase. */
export function wordKey(term: string): string {
  return searchKey(mainForm(term).replace(/^to\s+/i, ''));
}

/**
 * Words similar to `term`, same ones first. `entryIds` gives the dictionary
 * entries a key is a lemma or form of (empty without a dictionary).
 */
export function findSimilar(
  term: string,
  words: KnownWord[],
  entryIds: (key: string) => readonly number[],
  excludeId?: string,
): SimilarWord[] {
  const key = wordKey(term);
  if (!key) {
    return [];
  }
  const entries = new Set(entryIds(key));
  const same: SimilarWord[] = [];
  const related: SimilarWord[] = [];
  for (const word of words) {
    if (word.id === excludeId) {
      continue;
    }
    const other = wordKey(word.term);
    if (other === key) {
      same.push({ ...word, same: true });
    } else if (other && entryIds(other).some(id => entries.has(id))) {
      related.push({ ...word, same: false });
    }
  }
  return [...same, ...related];
}

/** Warning text under the word field, or null when nothing is similar. */
export function similarWarning(matches: SimilarWord[]): string | null {
  const [first] = matches;
  if (!first) {
    return null;
  }
  const more = matches.length > 1 ? ` (+${matches.length - 1} more)` : '';
  return `${first.same ? 'Already added' : 'Similar word added'}: “${
    first.term
  }” in “${first.setName}”${more}`;
}
