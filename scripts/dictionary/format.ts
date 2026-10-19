/// <reference types="node" />
/**
 * Pure transformation of wiktextract entries into dictionary rows.
 * Unit tested with real fixture lines (test-utils/fixtures/wiktionary.jsonl).
 */
import { foldedKey, searchKey } from '../../src/features/dictionary/searchKey.ts';

export interface RawForm {
  form: string;
  tags?: string[];
  raw_tags?: string[];
}

export interface RawExample {
  text?: string;
  translation?: string;
}

export interface RawSense {
  glosses?: string[];
  examples?: RawExample[];
}

/** One line of the Russian Wiktionary wiktextract dump. */
export interface RawEntry {
  word: string;
  pos?: string;
  lang_code?: string;
  tags?: string[];
  forms?: RawForm[];
  senses?: RawSense[];
}

/** Grammar from the English Wiktionary German extract, which ruwiktionary lacks. */
export interface GermanExtras {
  /** "haben", "sein" or both. */
  auxiliaries?: string[];
  comparative?: string;
  superlative?: string;
}

export interface DictEntry {
  lemma: string;
  pos: string;
  /** What goes into the word field, e.g. "der Apfel, die Äpfel". */
  display: string;
  glosses: string[];
  examples: Array<{ text: string; translation: string }>;
  /** Lookup keys: lemma and forms, normal + folded. */
  keys: string[];
}

const MAX_SENSES = 5;
const MAX_EXAMPLES = 3;
const ARTICLES: Record<string, string> = {
  masculine: 'der',
  feminine: 'die',
  neuter: 'das',
};

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** "форма настоящего времени … глагола essen" etc.: inflected-form stubs. */
function isFormOfGloss(gloss: string): boolean {
  return /^форма\s/i.test(gloss) || /^(мн\.|ед\.)\s*ч\.\s*от\s/i.test(gloss);
}

function formWithTags(entry: RawEntry, ...tags: string[]): string | undefined {
  return entry.forms?.find(
    f => clean(f.form) && tags.every(t => f.tags?.includes(t)),
  )?.form;
}

function formWithRawTag(entry: RawEntry, pattern: RegExp): string | undefined {
  return entry.forms?.find(f => f.raw_tags?.some(t => pattern.test(t)))?.form;
}

export function germanNounDisplay(entry: RawEntry): string {
  const gender = entry.tags?.find(t => t in ARTICLES);
  if (!gender) {
    return entry.word;
  }
  const plural = formWithTags(entry, 'plural', 'nominative');
  const singular = `${ARTICLES[gender]} ${entry.word}`;
  return plural && plural !== '-' && plural !== '—'
    ? `${singular}, die ${plural}`
    : singular;
}

export function germanVerbDisplay(
  entry: RawEntry,
  extras?: GermanExtras,
): string {
  const third = formWithRawTag(entry, /^3 л\., ед\. ч\./);
  const past = formWithRawTag(entry, /^Претерит/);
  const participle = formWithRawTag(entry, /^Причастие II/);
  if (!third || !past || !participle) {
    return entry.word;
  }
  const aux = extras?.auxiliaries ?? [];
  const hasHaben = aux.some(a => a.includes('haben'));
  const hasSein = aux.some(a => a.includes('sein'));
  const helper =
    hasHaben && hasSein ? 'hat/ist ' : hasSein ? 'ist ' : hasHaben ? 'hat ' : '';
  return `${entry.word}, ${third}, ${past}, ${helper}${participle}`;
}

export function germanAdjectiveDisplay(
  entry: RawEntry,
  extras?: GermanExtras,
): string {
  const { comparative, superlative } = extras ?? {};
  return comparative && superlative
    ? `${entry.word}, ${comparative}, ${superlative}`
    : entry.word;
}

function regularPast(verb: string): string {
  if (verb.endsWith('e')) {
    return verb + 'd';
  }
  if (/[^aeiou]y$/.test(verb)) {
    return verb.slice(0, -1) + 'ied';
  }
  return verb + 'ed';
}

/** Irregular verbs get their principal parts: "go, went, gone". */
export function englishVerbDisplay(entry: RawEntry): string {
  const participle = entry.forms?.find(
    f => f.tags?.includes('past') && f.tags?.includes('participle'),
  )?.form;
  const simplePast = entry.forms?.find(
    f => f.tags?.includes('past') && !f.tags?.includes('participle'),
  )?.form;
  if (!participle || !simplePast) {
    return entry.word;
  }
  const regular = regularPast(entry.word);
  // Also treats generated/doubled forms as regular ("appleed", "stopped").
  const looksRegular =
    simplePast === participle &&
    simplePast.endsWith('ed') &&
    simplePast.startsWith(entry.word.replace(/e$/, ''));
  if ((simplePast === regular && participle === regular) || looksRegular) {
    return entry.word;
  }
  return `${entry.word}, ${simplePast}, ${participle}`;
}

export function displayFor(entry: RawEntry, extras?: GermanExtras): string {
  if (entry.lang_code === 'de') {
    switch (entry.pos) {
      case 'noun':
        return germanNounDisplay(entry);
      case 'verb':
        return germanVerbDisplay(entry, extras);
      case 'adj':
        return germanAdjectiveDisplay(entry, extras);
    }
  }
  if (entry.lang_code === 'en' && entry.pos === 'verb') {
    return englishVerbDisplay(entry);
  }
  return entry.word;
}

/** Converts a wiktextract entry; null for form-of stubs and empty entries. */
export function toDictEntry(
  entry: RawEntry,
  extras?: GermanExtras,
): DictEntry | null {
  const lemma = clean(entry.word);
  if (!lemma || !entry.pos) {
    return null;
  }
  const senses = (entry.senses ?? [])
    .map(s => ({
      gloss: clean((s.glosses ?? []).join('; ')),
      examples: s.examples ?? [],
    }))
    .filter(s => s.gloss && !isFormOfGloss(s.gloss))
    .slice(0, MAX_SENSES);
  if (senses.length === 0) {
    return null;
  }

  const examples = senses
    .flatMap(s => s.examples)
    .map(e => ({ text: clean(e.text), translation: clean(e.translation) }))
    .filter(e => e.text && e.translation)
    .slice(0, MAX_EXAMPLES);

  const keys = new Set<string>();
  for (const text of [
    lemma,
    ...(entry.forms ?? []).map(f => f.form),
    extras?.comparative,
    extras?.superlative,
  ]) {
    const value = clean(text);
    // Skip placeholders like "*" or "—".
    if (!value || !/\p{L}/u.test(value)) {
      continue;
    }
    keys.add(searchKey(value));
    keys.add(foldedKey(value));
  }

  return {
    lemma,
    pos: entry.pos,
    display: displayFor(entry, extras),
    glosses: senses.map(s => s.gloss),
    examples,
    keys: [...keys],
  };
}

/** Collects aux / comparison from one English Wiktionary German line. */
export function germanExtrasFrom(raw: {
  word?: string;
  pos?: string;
  forms?: RawForm[];
}): GermanExtras | null {
  if (raw.pos === 'verb') {
    const auxiliaries = [
      ...new Set(
        (raw.forms ?? [])
          .filter(f => f.tags?.includes('auxiliary'))
          .map(f => f.form),
      ),
    ];
    return auxiliaries.length ? { auxiliaries } : null;
  }
  if (raw.pos === 'adj') {
    const exact = (tag: string) =>
      raw.forms?.find(f => f.tags?.length === 1 && f.tags[0] === tag)?.form;
    const comparative = exact('comparative');
    const superlative = exact('superlative');
    return comparative && superlative ? { comparative, superlative } : null;
  }
  return null;
}
