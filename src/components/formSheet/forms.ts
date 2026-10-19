import type { WordInput } from '../../domain/types';
import type { FormSheetOptions } from './FormSheet';

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

/** Word + translation (both required) and any number of examples. */
export function wordForm(options: {
  title: string;
  initial?: WordInput;
  onSubmit: (word: WordInput) => void | Promise<void>;
}): FormSheetOptions {
  return {
    title: options.title,
    fields: [
      {
        key: 'term',
        label: 'Word or phrase',
        initialValue: options.initial?.term,
        required: true,
      },
      {
        key: 'translation',
        label: 'Translation',
        initialValue: options.initial?.translation,
        required: true,
        multiline: true,
      },
    ],
    examples: { initial: options.initial?.examples },
    onSubmit: ({ values, examples }) =>
      options.onSubmit({
        term: values.term,
        translation: values.translation,
        examples,
      }),
  };
}
