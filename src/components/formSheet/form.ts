/** Pure form logic of FormSheet, kept separate so it can be unit tested. */
import type { Example } from '../../domain/types';

export interface FormSuggestion {
  key: string;
  title: string;
  subtitle?: string;
}

export interface FormFieldSuggestions {
  /**
   * Called (debounced) when the field gets focus and on every change while
   * focused. Return [] to show no dropdown.
   */
  load: (
    text: string,
    values: Record<string, string>,
  ) => Promise<FormSuggestion[]>;
  /** Field values to set when a suggestion is picked, by field key. */
  onPick: (
    suggestion: FormSuggestion,
    values: Record<string, string>,
  ) => Record<string, string>;
}

export interface FormField {
  key: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  /** Save stays disabled until this field has non-blank text. */
  required?: boolean;
  multiline?: boolean;
  /** A large text area for long text (implies multiline), e.g. a rule. */
  textArea?: boolean;
  /** Small muted text below the input. */
  hint?: string;
  /** Keyboard, autofill and masking for an email, password or share code. */
  kind?: 'email' | 'password' | 'code';
  /**
   * Optional extra: the field stays hidden behind a "+ <addLabel>" button
   * (next to "+ Add example") until tapped, or until it has an initial value.
   * Hidden fields are shown after the examples.
   */
  addLabel?: string;
  /** Dropdown with suggestions below the input while it's focused. */
  suggestions?: FormFieldSuggestions;
}

export interface FormExamplesConfig {
  initial?: Example[];
  placeholder?: string;
  translationPlaceholder?: string;
}

export interface FormResult {
  /** Trimmed value of every field, by key. */
  values: Record<string, string>;
  /** Trimmed examples; rows with a blank example text are dropped. */
  examples: Example[];
}

export interface ExampleItem extends Example {
  id: number;
}

export function initialValues(fields: FormField[]): Record<string, string> {
  return Object.fromEntries(fields.map(f => [f.key, f.initialValue ?? '']));
}

/** Keys of the "+ Add …" fields that start open because they have a value. */
export function initiallyRevealed(fields: FormField[]): string[] {
  return fields
    .filter(f => f.addLabel && (f.initialValue ?? '').trim() !== '')
    .map(f => f.key);
}

export function canSubmit(
  fields: FormField[],
  values: Record<string, string>,
): boolean {
  return fields.every(f => !f.required || (values[f.key] ?? '').trim() !== '');
}

export function buildResult(
  fields: FormField[],
  values: Record<string, string>,
  examples: ExampleItem[],
): FormResult {
  return {
    values: Object.fromEntries(
      fields.map(f => [f.key, (values[f.key] ?? '').trim()]),
    ),
    examples: examples
      .map(e => ({ text: e.text.trim(), translation: e.translation.trim() }))
      .filter(e => e.text !== ''),
  };
}
