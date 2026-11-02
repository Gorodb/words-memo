/** Form presets, the same forms as the phone app (components/formSheet/forms.ts). */
import type { DictionaryEntry } from '../api/types';
import type { ID, LanguageCode, RuleInput, WordInput } from '../domain/types';
import {
  dictionaryTranslations,
  searchDictionary,
  similarWarning,
} from '../store/actions';
import type { FormChoice, FormOptions } from './FormDialog';
import type { FormSuggestion } from './form';

/** Under Markdown inputs. */
export const MARKDOWN_HINT =
  'Markdown: **bold**, *italic*, # Heading, - list, | table |, `code`';

/** Single required "name" field, used to create and rename folders and sets. */
export function nameForm(options: {
  title: string;
  placeholder: string;
  initialValue?: string;
  onSubmit: (name: string) => unknown;
}): FormOptions {
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
 * optional Markdown description behind "+ Add description". With a
 * dictionary for the language on the server, the word field suggests
 * entries with their forms ("der Apfel, die Äpfel") and the translation field
 * that entry's Russian translations. The word field warns when the language
 * already has the same word, or another form of it ("isst" → "essen").
 */
export function wordForm(options: {
  title: string;
  languageCode: LanguageCode;
  initial?: WordInput;
  /** The edited word, left out of the duplicate check. */
  wordId?: ID;
  onSubmit: (word: WordInput) => unknown;
}): FormOptions {
  const { languageCode } = options;
  /** Entries behind the current term suggestions, and the one picked. */
  let offered = new Map<string, DictionaryEntry>();
  let picked: DictionaryEntry | null = null;

  const termSuggestions = async (text: string): Promise<FormSuggestion[]> => {
    if (picked && text === picked.display) {
      return []; // just picked; don't reopen the dropdown
    }
    picked = null;
    if (text.trim().length < MIN_TERM_CHARS) {
      return [];
    }
    const entries = await searchDictionary(languageCode, text).catch(() => []);
    offered = new Map(entries.map(e => [String(e.id), e]));
    return entries.map(e => ({
      key: String(e.id),
      title: e.display,
      subtitle: e.glosses.slice(0, 2).join('; '),
    }));
  };

  const translationSuggestions = async (
    text: string,
    values: Record<string, string>,
  ): Promise<FormSuggestion[]> => {
    if (!values.term?.trim()) {
      return [];
    }
    const glosses =
      picked && values.term === picked.display
        ? picked.glosses
        : await dictionaryTranslations(languageCode, values.term).catch(() => []);
    const typed = text.trim().toLocaleLowerCase();
    return [...new Set(glosses)]
      .filter(g => !typed || g.toLocaleLowerCase().includes(typed))
      .filter(g => g !== text.trim())
      .slice(0, MAX_GLOSSES)
      .map(gloss => ({ key: gloss, title: gloss }));
  };

  const checkTerm = async (text: string): Promise<string | null> => {
    if (!text.trim()) {
      return null;
    }
    const { warning } = await similarWarning(languageCode, text.trim(), options.wordId);
    return warning;
  };

  return {
    title: options.title,
    fields: [
      {
        key: 'term',
        label: 'Word or phrase',
        initialValue: options.initial?.term,
        required: true,
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
  onSubmit: (rule: RuleInput) => unknown;
}): FormOptions {
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
  onSubmit: (email: string, password: string) => unknown;
}): FormOptions {
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

/** One share code field. A thrown error keeps the form open. */
export function shareCodeForm(options: {
  initialCode?: string;
  onSubmit: (code: string) => unknown;
}): FormOptions {
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
        initialValue: options.initialCode,
        placeholder: 'ABCD-EFGH',
        hint: 'The code of a set someone shared with you. Each code works once, for 7 days.',
      },
    ],
    onSubmit: ({ values }) => options.onSubmit(values.code),
  };
}

/** "New word" / "New rule" in one form, switched with Word | Rule. */
export function wordOrRuleForm(options: {
  word: FormOptions;
  rule: FormOptions;
  /** Start with the rule form (e.g. opened from the Rules tab). */
  ruleFirst?: boolean;
}): FormChoice {
  return {
    variants: [
      { label: 'Word', options: options.word },
      { label: 'Rule', options: options.rule },
    ],
    initial: options.ruleFirst ? 1 : 0,
  };
}
