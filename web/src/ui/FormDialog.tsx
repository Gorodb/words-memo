/**
 * The one form dialog for every create and edit form (web counterpart of the
 * phone's FormSheet): fields with required / hint / check, optional example
 * pairs, fields hidden behind "+ Add …", and a Word | Rule switch between
 * whole forms. Build options with the presets in `forms.ts`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from './Button';
import {
  buildResult,
  canSubmit,
  initiallyRevealed,
  initialValues,
  type ExampleItem,
  type FormExamplesConfig,
  type FormField,
  type FormResult,
  type FormSuggestion,
} from './form';
import { errorText } from './dialogs';
import { SegmentedControl } from './SegmentedControl';
import { Sheet } from './Sheet';

export interface FormOptions {
  title: string;
  fields: FormField[];
  /** Turns on "+ Add example" and example + translation rows. */
  examples?: FormExamplesConfig;
  submitLabel?: string;
  /** Shown above an error thrown by onSubmit. */
  errorTitle?: string;
  /** Return false (or throw) to keep the form open. */
  onSubmit: (result: FormResult) => unknown | Promise<unknown>;
}

/** Several whole forms switched by a segmented control (new word | new rule). */
export interface FormChoice {
  variants: { label: string; options: FormOptions }[];
  initial?: number;
}

const isChoice = (o: FormOptions | FormChoice): o is FormChoice =>
  'variants' in o;

const CHECK_DELAY_MS = 300;

const inputClass =
  'w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-[15px] text-fg outline-none placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/25';

export function FormDialog({
  options,
  onClose,
}: {
  options: FormOptions | FormChoice;
  onClose: () => void;
}) {
  const choice = isChoice(options) ? options : null;
  const [variant, setVariant] = useState(choice?.initial ?? 0);
  const current = choice ? choice.variants[variant].options : (options as FormOptions);
  return (
    <Sheet title={current.title} onDismiss={onClose}>
      {choice ? (
        <div className="mb-3">
          <SegmentedControl
            labels={choice.variants.map(v => v.label)}
            selectedIndex={variant}
            onChange={setVariant}
          />
        </div>
      ) : null}
      {/* Switching starts the other form empty: a new key remounts it. */}
      <FormBody key={variant} options={current} onClose={onClose} />
    </Sheet>
  );
}

function FormBody({
  options,
  onClose,
}: {
  options: FormOptions;
  onClose: () => void;
}) {
  const { fields } = options;
  const [values, setValues] = useState(() => initialValues(fields));
  const [revealed, setRevealed] = useState(() => initiallyRevealed(fields));
  const nextExampleId = useRef(0);
  const [examples, setExamples] = useState<ExampleItem[]>(() =>
    (options.examples?.initial ?? []).map(e => ({
      ...e,
      id: nextExampleId.current++,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const warnings = useFieldChecks(fields, values);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current
      ?.querySelector<HTMLElement>('input, textarea')
      ?.focus({ preventScroll: true });
  }, []);

  const visible = fields.filter(f => !f.addLabel || revealed.includes(f.key));
  const main = visible.filter(f => !f.addLabel);
  const extras = visible.filter(f => f.addLabel);
  const hidden = fields.filter(f => f.addLabel && !revealed.includes(f.key));
  const ready = canSubmit(fields, values) && !busy;

  const submit = async () => {
    if (!ready) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await options.onSubmit(buildResult(fields, values, examples));
      if (result !== false) {
        onClose();
        return;
      }
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  };

  const fieldView = (field: FormField) => (
    <Field
      key={field.key}
      field={field}
      value={values[field.key] ?? ''}
      values={values}
      warning={warnings[field.key]}
      onChange={text => setValues(v => ({ ...v, [field.key]: text }))}
      onPick={picked => setValues(v => ({ ...v, ...picked }))}
      onSubmitShortcut={submit}
    />
  );

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4 pt-2"
      onSubmit={e => {
        e.preventDefault();
        void submit();
      }}
    >
      {main.map(fieldView)}
      {options.examples && examples.length > 0 ? (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-muted">Examples</span>
          {examples.map((example, i) => (
            <div
              key={example.id}
              className="flex items-start gap-2 rounded-xl bg-surface-2/60 p-2"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <textarea
                  rows={1}
                  className={`${inputClass} resize-none`}
                  placeholder={options.examples?.placeholder ?? `Example ${i + 1}`}
                  value={example.text}
                  onChange={e =>
                    setExamples(list =>
                      list.map(x =>
                        x.id === example.id ? { ...x, text: e.target.value } : x,
                      ),
                    )
                  }
                />
                <textarea
                  rows={1}
                  className={`${inputClass} resize-none`}
                  placeholder={
                    options.examples?.translationPlaceholder ?? 'Translation'
                  }
                  value={example.translation}
                  onChange={e =>
                    setExamples(list =>
                      list.map(x =>
                        x.id === example.id
                          ? { ...x, translation: e.target.value }
                          : x,
                      ),
                    )
                  }
                />
              </div>
              <IconButton
                icon={Trash2}
                label="Remove example"
                onClick={() =>
                  setExamples(list => list.filter(x => x.id !== example.id))
                }
              />
            </div>
          ))}
        </div>
      ) : null}
      {extras.map(fieldView)}
      {options.examples || hidden.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {options.examples ? (
            <Button
              variant="ghost"
              icon={Plus}
              className="px-2"
              onClick={() =>
                setExamples(list => [
                  ...list,
                  { id: nextExampleId.current++, text: '', translation: '' },
                ])
              }
            >
              Add example
            </Button>
          ) : null}
          {hidden.map(f => (
            <Button
              key={f.key}
              variant="ghost"
              icon={Plus}
              className="px-2"
              onClick={() => setRevealed(r => [...r, f.key])}
            >
              {f.addLabel}
            </Button>
          ))}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {options.errorTitle ? (
            <p className="font-semibold">{options.errorTitle}</p>
          ) : null}
          <p className="whitespace-pre-line">{error}</p>
        </div>
      ) : null}
      <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-line bg-surface px-5 pt-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready}>
          {busy ? 'Saving…' : options.submitLabel ?? 'Save'}
        </Button>
      </div>
    </form>
  );
}

function Field({
  field,
  value,
  values,
  warning,
  onChange,
  onPick,
  onSubmitShortcut,
}: {
  field: FormField;
  value: string;
  values: Record<string, string>;
  warning?: string | null;
  onChange: (text: string) => void;
  onPick: (values: Record<string, string>) => void;
  onSubmitShortcut: () => void;
}) {
  const id = `field-${field.key}`;
  const multiline = field.multiline || field.textArea;
  const [focused, setFocused] = useState(false);
  const suggestions = useSuggestions(field, value, values, focused);
  const [active, setActive] = useState(-1);
  const pick = (s: FormSuggestion) => {
    onPick(field.suggestions!.onPick(s, values));
    setFocused(false);
  };
  const common = {
    id,
    value,
    placeholder: field.placeholder,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setFocused(true);
      setActive(-1);
      onChange(e.target.value);
    },
    onFocus: () => setFocused(true),
    // Later than a click on a suggestion.
    onBlur: () => setTimeout(() => setFocused(false), 150),
    'aria-autocomplete': field.suggestions ? ('list' as const) : undefined,
  };
  /** Arrow keys move through the suggestions, Enter picks, Escape closes. */
  const onSuggestionKey = (e: React.KeyboardEvent): boolean => {
    if (!suggestions.length || !focused) {
      return false;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(i => (i + step + suggestions.length) % suggestions.length);
      return true;
    }
    if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
      return true;
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      setFocused(false);
      return true;
    }
    return false;
  };
  return (
    <div className="flex flex-col gap-1.5">
      {field.label ? (
        <label htmlFor={id} className="text-sm font-medium text-muted">
          {field.label}
          {field.required ? null : (
            <span className="font-normal opacity-70"> (optional)</span>
          )}
        </label>
      ) : null}
      {multiline ? (
        <textarea
          {...common}
          rows={field.textArea ? 10 : 2}
          className={`${inputClass} ${field.textArea ? 'min-h-48 font-mono text-sm' : 'resize-y'}`}
          onKeyDown={e => {
            if (onSuggestionKey(e)) {
              return;
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onSubmitShortcut();
            }
          }}
        />
      ) : (
        <input
          {...common}
          onKeyDown={e => void onSuggestionKey(e)}
          className={inputClass}
          type={
            field.kind === 'email'
              ? 'email'
              : field.kind === 'password'
              ? 'password'
              : 'text'
          }
          autoComplete={
            field.kind === 'email'
              ? 'email'
              : field.kind === 'password'
              ? 'current-password'
              : 'off'
          }
          autoCapitalize={
            field.kind === 'code' ? 'characters' : field.kind ? 'none' : undefined
          }
          spellCheck={field.kind ? false : undefined}
        />
      )}
      {focused && suggestions.length > 0 ? (
        <ul
          role="listbox"
          className="max-h-60 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={s.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                // Picked before the input's blur hides the list.
                onMouseDown={e => {
                  e.preventDefault();
                  pick(s);
                }}
                className={`block w-full px-3 py-2 text-left hover:bg-surface-2 ${
                  i === active ? 'bg-surface-2' : ''
                }`}
              >
                <span className="block text-[15px]">{s.title}</span>
                {s.subtitle ? (
                  <span className="block truncate text-xs text-muted">{s.subtitle}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {warning ? (
        <p className="text-sm text-warning" role="status">
          {warning}
        </p>
      ) : null}
      {field.hint ? <p className="text-xs text-muted">{field.hint}</p> : null}
    </div>
  );
}

/** Runs each field's `check` (debounced) and keeps the latest warnings. */
function useFieldChecks(
  fields: FormField[],
  values: Record<string, string>,
): Record<string, string | null> {
  const [warnings, setWarnings] = useState<Record<string, string | null>>({});
  const checked = useMemo(() => fields.filter(f => f.check), [fields]);
  const key = checked.map(f => values[f.key] ?? '').join('\u0000');
  useEffect(() => {
    if (checked.length === 0) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await Promise.all(
        checked.map(async f => {
          try {
            return [f.key, await f.check!(values[f.key] ?? '')] as const;
          } catch {
            return [f.key, null] as const;
          }
        }),
      );
      if (!cancelled) {
        setWarnings(Object.fromEntries(results));
      }
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` stands for the checked values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, checked]);
  return warnings;
}

const SUGGEST_DELAY_MS = 250;

/** The field's suggestions (debounced) while it has focus. */
function useSuggestions(
  field: FormField,
  value: string,
  values: Record<string, string>,
  focused: boolean,
): FormSuggestion[] {
  const [list, setList] = useState<FormSuggestion[]>([]);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  useEffect(() => {
    if (!field.suggestions || !focused) {
      setList([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const next = await field.suggestions!.load(value, valuesRef.current);
        if (!cancelled) {
          setList(next);
        }
      } catch {
        // suggestions are optional
      }
    }, SUGGEST_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [field, value, focused]);
  return list;
}
