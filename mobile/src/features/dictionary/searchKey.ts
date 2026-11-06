/**
 * Dictionary lookup keys. Shared by the build script (scripts/dictionary) and
 * the app, so both normalize the same way.
 */

/** Lowercase + NFC + single spaces. */
export function searchKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').normalize('NFC').toLowerCase();
}

/** searchKey without umlauts/accents: "Äpfel" → "apfel", "Straße" → "strasse". */
export function foldedKey(text: string): string {
  return searchKey(text)
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

/** Upper bound for a prefix range query: key >= prefix AND key < prefixEnd(prefix). */
export function prefixEnd(prefix: string): string {
  return prefix + '\u{10FFFF}';
}
