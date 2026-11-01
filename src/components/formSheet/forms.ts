import { listLanguageTerms } from '../../db/repositories/words';
import type {
  ID,
  LanguageCode,
  RuleInput,
  WordInput,
} from '../../domain/types';
import {
  entryIdsFor,
  exactEntries,
  suggestEntries,
} from '../../features/dictionary/dictionary';
import { isDictionaryInstalled } from '../../features/dictionary/dictionaryStore';
import type { DictionaryEntry } from '../../features/dictionary/queries';
import {
  findSimilar,
  similarWarning,
  wordKey,
  type KnownWord,
} from '../../features/similarWords/similarWords';
import type { FormSuggestion } from './form';
import type { FormSheetChoice, FormSheetOptions } from './FormSheet';

/** Under Markdown inputs. */
export const MARKDOWN_HINT =
  'Markdown: **bold**, *italic*, # Heading, - list, | table |, `code`';

/** Single required "name" field, used to create and rename folders and sets. */
export function nameForm(options: {
  title: string;
  placeholder: string;
  initialValue?: string;
  onSubmit: (name: string) => void | Promise<void>;
}): FormSheetOptions {
  return {
    title: options.title,
    fields: [
      {
        key: 'name',
        placeholder: options.placeholder,
        initialValue: options.initialValue,
        required: true,
      },
    ],
    onSubmit: ({ values }) => options.onSubmit(values.name),
  };
}

const MIN_TERM_CHARS = 2;
const MAX_GLOSSES = 6;

/**
 * Word + translation (both required), any number of example pairs and an
 * optional Markdown description behind "+ Add description".
 * With the language's dictionary installed, the word field suggests entries
 * with their forms ("der Apfel, die Äpfel") and the translation field
 * suggests the entry's Russian translations.
 * The word field warns when the language already has the same word, or
 * (with the dictionary) another form of it ("isst" → "essen").
 */
export function wordForm(options: {
  title: string;
  languageCode: LanguageCode;
  /** Shown under the word field when the dictionary isn't installed. */
  dictionaryHint?: string;
  initial?: WordInput;
  /** The edited word, left out of the duplicate check. */
  wordId?: ID;
  onSubmit: (word: WordInput) => void | Promise<void>;
}): FormSheetOptions {
  const { languageCode } = options;
  const installed = isDictionaryInstalled(languageCode);
  /** Entries behind the current term suggestions, and the one picked. */
  let offered = new Map<string, DictionaryEntry>();
  let picked: DictionaryEntry | null = null;

  const termSuggestions = async (text: string): Promise<FormSuggestion[]> => {
    if (picked && text === picked.display) {
      return []; // just picked; don't reopen the dropdown
    }
    picked = null;
    if (!installed || text.trim().length < MIN_TERM_CHARS) {
      return [];
    }
    const entries = await suggestEntries(languageCode, text);
    offered = new Map(entries.map(e => [String(e.id), e]));
    return entries.map(e => ({
      key: String(e.id),
      title: e.display,
      subtitle: e.glosses.slice(0, 2).join('; '),
    }));
  };

  /** The language's words and their dictionary entries, loaded on the first check. */
  let known: Promise<{
    words: KnownWord[];
    entries: Map<string, number[]>;
  }> | null = null;
  const loadKnown = async () => {
    const words = await listLanguageTerms(languageCode);
    const entries = installed
      ? await entryIdsFor(
          languageCode,
          words.map(w => wordKey(w.term)),
        )
      : new Map<string, number[]>();
    return { words, entries };
  };

  const checkTerm = async (text: string): Promise<string | null> => {
    const key = wordKey(text);
    if (!key) {
      return null;
    }
    known ??= loadKnown();
    const { words, entries } = await known;
    if (installed && !entries.has(key)) {
      const typed = await entryIdsFor(languageCode, [key]);
      entries.set(key, typed.get(key) ?? []);
    }
    return similarWarning(
      findSimilar(text, words, k => entries.get(k) ?? [], options.wordId),
    );
  };

  const translationSuggestions = async (
    text: string,
    values: Record<string, string>,
  ): Promise<FormSuggestion[]> => {
    if (!installed || !values.term?.trim()) {
      return [];
    }
    const entries =
      picked && values.term === picked.display
        ? [picked]
        : (await exactEntries(languageCode, values.term)).slice(0, 2);
    const typed = text.trim().toLocaleLowerCase();
    const glosses = [...new Set(entries.flatMap(e => e.glosses))]
      .filter(g => !typed || g.toLocaleLowerCase().includes(typed))
      .filter(g => g !== text.trim())
      .slice(0, MAX_GLOSSES);
    return glosses.map(gloss => ({ key: gloss, title: gloss }));
  };

  return {
    title: options.title,
    fields: [
      {
        key: 'term',
        label: 'Word or phrase',
        initialValue: options.initial?.term,
        required: true,
        hint: installed ? undefined : options.dictionaryHint,
        check: checkTerm,
        suggestions: {
          load: termSuggestions,
          onPick: suggestion => {
            picked = offered.get(suggestion.key) ?? null;
            return { term: suggestion.title };
          },
        },
      },
      {
        key: 'translation',
        label: 'Translation',
        initialValue: options.initial?.translation,
        required: true,
        multiline: true,
        suggestions: {
          load: translationSuggestions,
          onPick: suggestion => ({ translation: suggestion.title }),
        },
      },
      {
        key: 'description',
        label: 'Description',
        addLabel: 'Add description',
        initialValue: options.initial?.description,
        multiline: true,
        placeholder: 'Notes, forms, usage…',
        hint: MARKDOWN_HINT,
      },
    ],
    examples: { initial: options.initial?.examples },
    onSubmit: ({ values, examples }) =>
      options.onSubmit({
        term: values.term,
        translation: values.translation,
        examples,
        description: values.description,
      }),
  };
}

/** A rule: a required title and a required Markdown text area. */
export function ruleForm(options: {
  title: string;
  initial?: RuleInput;
  onSubmit: (rule: RuleInput) => void | Promise<void>;
}): FormSheetOptions {
  return {
    title: options.title,
    fields: [
      {
        key: 'title',
        label: 'Title',
        initialValue: options.initial?.title,
        required: true,
        placeholder: 'e.g. Perfekt',
      },
      {
        key: 'text',
        label: 'Rule',
        initialValue: options.initial?.text,
        required: true,
        textArea: true,
        placeholder: 'haben / sein + Partizip II',
        hint: MARKDOWN_HINT,
      },
    ],
    onSubmit: ({ values }) =>
      options.onSubmit({ title: values.title, text: values.text }),
  };
}

/** Email + password, both required. Return false from onSubmit to stay open. */
export function signInForm(options: {
  onSubmit: (email: string, password: string) => unknown | Promise<unknown>;
}): FormSheetOptions {
  return {
    title: 'Sign in',
    submitLabel: 'Sign in',
    errorTitle: 'Could not sign in',
    fields: [
      {
        key: 'email',
        label: 'Email',
        kind: 'email',
        required: true,
        placeholder: 'you@example.com',
      },
      {
        key: 'password',
        label: 'Password',
        kind: 'password',
        required: true,
        hint: 'No account yet? Sign in with a new email to create one.',
      },
    ],
    onSubmit: ({ values }) => options.onSubmit(values.email, values.password),
  };
}

/** One share code field. A thrown error keeps the sheet open. */
export function shareCodeForm(options: {
  onSubmit: (code: string) => unknown | Promise<unknown>;
}): FormSheetOptions {
  return {
    title: 'Import set by code',
    submitLabel: 'Continue',
    errorTitle: 'Could not import',
    fields: [
      {
        key: 'code',
        label: 'Code',
        kind: 'code',
        required: true,
        placeholder: 'ABCD-EFGH',
        hint: 'The code of a set someone shared with you. Each code works once, for 7 days.',
      },
    ],
    onSubmit: ({ values }) => options.onSubmit(values.code),
  };
}

/** "New word" / "New rule" in one sheet, switched with Word | Rule. */
export function wordOrRuleForm(options: {
  word: FormSheetOptions;
  rule: FormSheetOptions;
  /** Start with the rule form (e.g. opened from the Rules tab). */
  ruleFirst?: boolean;
}): FormSheetChoice {
  return {
    variants: [
      { label: 'Word', options: options.word },
      { label: 'Rule', options: options.rule },
    ],
    initial: options.ruleFirst ? 1 : 0,
  };
}
