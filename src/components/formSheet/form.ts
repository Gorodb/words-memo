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
  /** Small muted text below the input. */
  hint?: string;
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
