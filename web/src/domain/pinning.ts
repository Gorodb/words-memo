/** At most this many folders, and this many sets, can be pinned per language. */
export const MAX_PINNED = 5;

export class PinLimitError extends Error {
  constructor(readonly kind: 'folders' | 'sets') {
    super(`You can pin up to ${MAX_PINNED} ${kind}. Unpin one first.`);
    this.name = 'PinLimitError';
  }
}
