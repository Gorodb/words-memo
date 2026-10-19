/** Pure form logic of FormSheet, kept separate so it can be unit tested. */

export interface FormField {
  key: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  /** Save stays disabled until this field has non-blank text. */
  required?: boolean;
  multiline?: boolean;
}

export interface FormExamplesConfig {
  initial?: string[];
  placeholder?: string;
}

export interface FormResult {
  /** Trimmed value of every field, by key. */
  values: Record<string, string>;
  /** Trimmed examples, blank ones removed. Empty if examples aren't enabled. */
  examples: string[];
}

export interface ExampleItem {
  id: number;
  text: string;
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
    examples: examples.map(e => e.text.trim()).filter(text => text !== ''),
  };
}
