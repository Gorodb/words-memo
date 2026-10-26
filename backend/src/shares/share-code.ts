import { randomInt } from 'node:crypto';

/**
 * Share codes are typed by hand, so they skip look-alike characters
 * (0/O, 1/I/L). 8 characters of 31 give ~8.5e11 codes.
 */
export const SHARE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SHARE_CODE_LENGTH = 8;

/** How long a code works before it expires. */
export const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function newShareCode(): string {
  let code = '';
  for (let i = 0; i < SHARE_CODE_LENGTH; i++) {
    code += SHARE_CODE_ALPHABET[randomInt(SHARE_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * The stored form of a typed code ("abcd-efgh" → "ABCDEFGH"), or null when it
 * can't be a code. Spaces and dashes are ignored.
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
