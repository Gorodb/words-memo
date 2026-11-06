/**
 * Share codes as the server makes them (`backend/src/shares/share-code.ts`):
 * 8 characters without look-alikes (0/O, 1/I/L), shown as "ABCD-EFGH".
 */
export const SHARE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SHARE_CODE_LENGTH = 8;

/**
 * The code in a typed text ("abcd efgh", "ABCD-EFGH"), or null when it can't
 * be one. Case, spaces and dashes are ignored.
 */
export function normalizeShareCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== SHARE_CODE_LENGTH) {
    return null;
  }
  for (const char of code) {
    if (!SHARE_CODE_ALPHABET.includes(char)) {
      return null;
    }
  }
  return code;
}

/** "ABCDEFGH" → "ABCD-EFGH", easier to read out and type. */
export function formatShareCode(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)}-${code.slice(half)}`;
}
