/**
 * Key used to decide whether two terms are "the same word" (import merge).
 * Case-sensitive on purpose: "das Essen" and "essen" are different words.
 */
export function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, ' ').normalize('NFC');
}
