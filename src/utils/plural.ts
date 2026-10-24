/** plural(3, 'set') -> "3 sets" */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "12 words", or "12 words · 3 rules" when the set has rules. */
export function setContents(set: { wordCount: number; ruleCount: number }) {
  const words = plural(set.wordCount, 'word');
  return set.ruleCount > 0
    ? `${words} · ${plural(set.ruleCount, 'rule')}`
    : words;
}
