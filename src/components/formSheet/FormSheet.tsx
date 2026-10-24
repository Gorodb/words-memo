import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
  type BottomSheetScrollViewMethods,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleMinus } from 'lucide-react-native';
import { useAppTheme } from '../../theme/ThemeProvider';
import { useKeyboardHeight } from '../../utils/useKeyboardHeight';
import { IconButton } from '../IconButton';
import { SegmentedControl } from '../SegmentedControl';
import { TextButton } from '../TextButton';
import {
  buildResult,
  canSubmit,
  initialValues,
  initiallyRevealed,
  type ExampleItem,
  type FormExamplesConfig,
  type FormField,
  type FormResult,
  type FormSuggestion,
} from './form';

export interface FormSheetOptions {
  title: string;
  fields: FormField[];
  /** Enables the "Add example" button and the removable example rows. */
  examples?: FormExamplesConfig;
  submitLabel?: string;
  onSubmit: (result: FormResult) => void | Promise<void>;
}

export interface FormSheetVariant {
  /** Segment label, e.g. "Word". */
  label: string;
  options: FormSheetOptions;
}

/**
 * Several forms in one sheet, switched with a segmented control under the
 * title (e.g. a new word or a new rule). Switching starts the other form empty.
 */
export interface FormSheetChoice {
  variants: FormSheetVariant[];
  /** Index of the variant shown first (default 0). */
  initial?: number;
}

export interface FormSheetHandle {
  open: (options: FormSheetOptions | FormSheetChoice) => void;
}

/** Space kept free above the sheet when it's at full height. */
const TOP_GAP = 24;
const SUGGEST_DEBOUNCE_MS = 200;
const MAX_SUGGESTIONS = 6;

/** BottomSheetTextInput's ref type is the gesture-handler component; we only need focus(). */
type Focusable = { focus: () => void };

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
);

/**
 * Bottom sheet form: any number of text fields (optionally with a suggestion
 * dropdown), optional repeatable example + translation rows, Cancel / Save
 * text buttons. Save is disabled until required fields are filled.
 *
 * All inputs are uncontrolled and their `defaultValue` never changes while
 * mounted. React Native sends `value ?? defaultValue` to the native field, so a
 * value that follows the typing resets the cursor on Android. To set a field
 * from code (picking a suggestion), its seed is replaced and the input
 * remounts through its `key`.
 */
export function FormSheet({ ref }: { ref: React.Ref<FormSheetHandle> }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const sheetRef = useRef<BottomSheetModal>(null);
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
  const nextExampleId = useRef(0);
  const inputRefs = useRef<Record<string, Focusable | null>>({});
  const focusedSinceOpen = useRef(false);
  /** Initial text of each example input, by example id (stable per mount). */
  const exampleSeeds = useRef<Record<number, ExampleItem>>({});

  const [options, setOptions] = useState<FormSheetOptions | null>(null);
  const [variants, setVariants] = useState<FormSheetVariant[] | null>(null);
  const [variantIndex, setVariantIndex] = useState(0);
  /** Keys of the "+ Add …" fields that are shown. */
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [values, setValues] = useState<Record<string, string>>({});
  /** Initial text of each field input; replaced only when set from code. */
  const [seeds, setSeeds] = useState<Record<string, string>>({});
  /** Bumped per field when its seed is replaced, to remount that input. */
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const [examples, setExamples] = useState<ExampleItem[]>([]);
  const [busy, setBusy] = useState(false);
  /** Changes on every open() so all inputs remount with fresh seeds. */
  const [formKey, setFormKey] = useState(0);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{
    fieldKey: string;
    items: FormSuggestion[];
  } | null>(null);

  const fields = options?.fields ?? [];

  const newExample = (text = '', translation = ''): ExampleItem => {
    const item = { id: nextExampleId.current++, text, translation };
    exampleSeeds.current[item.id] = item;
    return item;
  };

  /** Shows a form with fresh inputs. */
  const load = (next: FormSheetOptions) => {
    const start = initialValues(next.fields);
    exampleSeeds.current = {};
    setOptions(next);
    setValues(start);
    setSeeds(start);
    setRevisions({});
    setRevealed(new Set(initiallyRevealed(next.fields)));
    setExamples(
      (next.examples?.initial ?? []).map(e =>
        newExample(e.text, e.translation),
      ),
    );
    setBusy(false);
    setFocusedKey(null);
    setSuggestions(null);
    setFormKey(k => k + 1);
  };

  useImperativeHandle(ref, () => ({
    open: next => {
      if ('variants' in next) {
        const index = next.initial ?? 0;
        setVariants(next.variants);
        setVariantIndex(index);
        load(next.variants[index].options);
      } else {
        setVariants(null);
        load(next);
      }
      focusedSinceOpen.current = false;
      sheetRef.current?.present();
    },
  }));

  const switchVariant = (index: number) => {
    if (!variants) {
      return;
    }
    const next = variants[index].options;
    setVariantIndex(index);
    load(next);
    // The sheet is already open, so the new first field can take the focus.
    const first = next.fields[0]?.key;
    if (first) {
      setTimeout(() => inputRefs.current[first]?.focus(), 100);
    }
  };

  const reveal = (key: string) => {
    setRevealed(prev => new Set(prev).add(key));
    // Revealed fields come last: scroll to them, then focus.
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
      inputRefs.current[key]?.focus();
    }, 100);
  };

  // Suggestions for the focused field: on focus and while typing (debounced).
  const focusedField = fields.find(f => f.key === focusedKey);
  const focusedText = focusedKey ? values[focusedKey] ?? '' : '';
  const valuesRef = useRef(values);
  valuesRef.current = values;
  useEffect(() => {
    const source = focusedField?.suggestions;
    if (!focusedField || !source) {
      setSuggestions(null);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      source.load(focusedText, valuesRef.current).then(
        items => {
          if (active) {
            setSuggestions({
              fieldKey: focusedField.key,
              items: items.slice(0, MAX_SUGGESTIONS),
            });
          }
        },
        () => active && setSuggestions(null),
      );
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [focusedField, focusedText]);

  const pickSuggestion = (field: FormField, item: FormSuggestion) => {
    const updates = field.suggestions?.onPick(item, valuesRef.current) ?? {};
    setValues(prev => ({ ...prev, ...updates }));
    setSeeds(prev => ({ ...prev, ...updates }));
    setRevisions(prev => {
      const next = { ...prev };
      for (const key of Object.keys(updates)) {
        next[key] = (next[key] ?? 0) + 1;
      }
      return next;
    });
    setSuggestions(null);
    // Continue with the next field (its own suggestions load on focus).
    const nextField = fields[fields.indexOf(field) + 1];
    const target = nextField?.key ?? field.key;
    setTimeout(() => inputRefs.current[target]?.focus(), 50);
  };

  const submitEnabled = !!options && !busy && canSubmit(fields, values);

  const close = useCallback(() => sheetRef.current?.dismiss(), []);

  const submit = useCallback(async () => {
    if (!options || !submitEnabled) {
      return;
    }
    setBusy(true);
    try {
      await options.onSubmit(buildResult(options.fields, values, examples));
      sheetRef.current?.dismiss();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [options, submitEnabled, values, examples]);

  const addExample = () => {
    setExamples(prev => [...prev, newExample()]);
    // The new row is near the bottom: keep it (and the buttons) in view.
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const updateExample = (
    id: number,
    part: 'text' | 'translation',
    text: string,
  ) =>
    setExamples(prev =>
      prev.map(e => (e.id === id ? { ...e, [part]: text } : e)),
    );

  const removeExample = (id: number) =>
    setExamples(prev => prev.filter(e => e.id !== id));

  const inputStyle = [
    styles.input,
    {
      color: colors.text,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
  ];

  return (
    <BottomSheetModal
      ref={sheetRef}
      backdropComponent={renderBackdrop}
      enableDynamicSizing
      // Never taller than the screen below the status bar; longer content scrolls.
      topInset={insets.top}
      // While the keyboard is open, the sheet must also fit above it. The
      // library only shrinks the scroll area for the keyboard in some cases,
      // so content that grows with the keyboard open (adding examples) would
      // otherwise end up behind the keyboard, out of scroll reach.
      maxDynamicContentSize={height - insets.top - TOP_GAP - keyboardHeight}
      // Lift the sheet above the keyboard; longer content scrolls.
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      // Must be adjustPan: the app is edge-to-edge, so Android never resizes the
      // window for the keyboard, and with adjustResize the library ignores the
      // keyboard height (the sheet then stays hidden behind the keyboard).
      android_keyboardInputMode="adjustPan"
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
      // Focus only after the open animation: focusing while the sheet is still
      // animating makes the keyboard push it off-screen on Android.
      onChange={index => {
        if (index >= 0 && !focusedSinceOpen.current && fields[0]) {
          focusedSinceOpen.current = true;
          inputRefs.current[fields[0].key]?.focus();
        }
      }}
    >
      <BottomSheetScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 12 },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {options?.title}
        </Text>

        {variants ? (
          <View style={styles.variants}>
            <SegmentedControl
              labels={variants.map(v => v.label)}
              selectedIndex={variantIndex}
              onChange={switchVariant}
            />
          </View>
        ) : null}

        <View key={formKey}>
          {fields.map(field => {
            if (field.addLabel) {
              return null; // rendered after the examples
            }
            const dropdown =
              suggestions?.fieldKey === field.key &&
              focusedKey === field.key &&
              suggestions.items.length > 0
                ? suggestions.items
                : null;
            return (
              <View key={field.key} style={styles.field}>
                {field.label ? (
                  <Text style={[styles.label, { color: colors.textSecondary }]}>
                    {field.label}
                    {field.required ? ' *' : ''}
                  </Text>
                ) : null}
                <BottomSheetTextInput
                  key={revisions[field.key] ?? 0}
                  defaultValue={seeds[field.key]}
                  onChangeText={text =>
                    setValues(prev => ({ ...prev, [field.key]: text }))
                  }
                  onFocus={() => setFocusedKey(field.key)}
                  onBlur={() =>
                    setFocusedKey(current =>
                      current === field.key ? null : current,
                    )
                  }
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.textSecondary}
                  multiline={field.multiline || field.textArea}
                  ref={(node: unknown) => {
                    inputRefs.current[field.key] =
                      (node as Focusable | null) ?? null;
                  }}
                  accessibilityLabel={field.label ?? field.placeholder}
                  style={[
                    inputStyle,
                    (field.multiline || field.textArea) && styles.multiline,
                    field.textArea && styles.textArea,
                  ]}
                />
                {dropdown ? (
                  <View
                    style={[
                      styles.dropdown,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                  >
                    {dropdown.map((item, i) => (
                      <Pressable
                        key={item.key}
                        onPress={() => pickSuggestion(field, item)}
                        accessibilityRole="button"
                        accessibilityLabel={`Suggestion ${item.title}`}
                        style={({ pressed }) => [
                          styles.suggestion,
                          i > 0 && {
                            borderTopColor: colors.border,
                            borderTopWidth: StyleSheet.hairlineWidth,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.suggestionTitle,
                            { color: colors.text },
                          ]}
                        >
                          {item.title}
                        </Text>
                        {item.subtitle ? (
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.suggestionSubtitle,
                              { color: colors.textSecondary },
                            ]}
                          >
                            {item.subtitle}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {field.hint ? (
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>
                    {field.hint}
                  </Text>
                ) : null}
              </View>
            );
          })}

          {options?.examples ? (
            <>
              {examples.length > 0 ? (
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Examples
                </Text>
              ) : null}
              {examples.map((example, index) => {
                const seed = exampleSeeds.current[example.id];
                return (
                  <View key={example.id} style={styles.exampleRow}>
                    <View style={styles.examplePair}>
                      <BottomSheetTextInput
                        defaultValue={seed?.text}
                        onChangeText={text =>
                          updateExample(example.id, 'text', text)
                        }
                        placeholder={options.examples?.placeholder ?? 'Example'}
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        // Added while the sheet is open: focus the new (empty) row.
                        autoFocus={!seed?.text && !seed?.translation}
                        accessibilityLabel={`Example ${index + 1}`}
                        style={[inputStyle, styles.multiline]}
                      />
                      <BottomSheetTextInput
                        defaultValue={seed?.translation}
                        onChangeText={text =>
                          updateExample(example.id, 'translation', text)
                        }
                        placeholder={
                          options.examples?.translationPlaceholder ??
                          'Translation'
                        }
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        accessibilityLabel={`Example ${index + 1} translation`}
                        style={[inputStyle, styles.multiline]}
                      />
                    </View>
                    <IconButton
                      icon={CircleMinus}
                      color={colors.danger}
                      size={22}
                      accessibilityLabel={`Remove example ${index + 1}`}
                      onPress={() => removeExample(example.id)}
                    />
                  </View>
                );
              })}
            </>
          ) : null}

          {fields
            .filter(field => field.addLabel && revealed.has(field.key))
            .map(field => (
              <View key={field.key} style={styles.field}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  {field.label ?? field.addLabel}
                </Text>
                <BottomSheetTextInput
                  defaultValue={seeds[field.key]}
                  onChangeText={text =>
                    setValues(prev => ({ ...prev, [field.key]: text }))
                  }
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  ref={(node: unknown) => {
                    inputRefs.current[field.key] =
                      (node as Focusable | null) ?? null;
                  }}
                  accessibilityLabel={field.label ?? field.addLabel}
                  style={[inputStyle, styles.multiline, styles.long]}
                />
                {field.hint ? (
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>
                    {field.hint}
                  </Text>
                ) : null}
              </View>
            ))}

          <View style={styles.addButtons}>
            {options?.examples ? (
              <TextButton title="+ Add example" onPress={addExample} />
            ) : null}
            {fields
              .filter(field => field.addLabel && !revealed.has(field.key))
              .map(field => (
                <TextButton
                  key={field.key}
                  title={`+ ${field.addLabel}`}
                  onPress={() => reveal(field.key)}
                />
              ))}
          </View>
        </View>

        <View style={styles.actions}>
          <TextButton title="Cancel" variant="secondary" onPress={close} />
          <TextButton
            title={options?.submitLabel ?? 'Save'}
            onPress={submit}
            disabled={!submitEnabled}
          />
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/** `const sheet = useFormSheet(); … {sheet.element} … sheet.open({...})`. */
export function useFormSheet() {
  const ref = useRef<FormSheetHandle>(null);
  const open = useCallback(
    (options: FormSheetOptions | FormSheetChoice) => ref.current?.open(options),
    [],
  );
  return { open, element: <FormSheet ref={ref} /> };
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 4 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  hint: { fontSize: 12, marginTop: 4 },
  input: {
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multiline: { minHeight: 44, textAlignVertical: 'top' },
  long: { minHeight: 120 },
  textArea: { minHeight: 220 },
  variants: { marginBottom: 16 },
  dropdown: {
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: 'hidden',
  },
  suggestion: { paddingHorizontal: 12, paddingVertical: 10 },
  suggestionTitle: { fontSize: 15 },
  suggestionSubtitle: { fontSize: 13, marginTop: 2 },
  pressed: { opacity: 0.5 },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  examplePair: { flex: 1, gap: 6 },
  addButtons: { flexDirection: 'row', flexWrap: 'wrap', marginLeft: -12 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
    marginRight: -12,
  },
});
