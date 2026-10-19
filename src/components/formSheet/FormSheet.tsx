import React, {
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Alert,
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
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleMinus } from 'lucide-react-native';
import { useAppTheme } from '../../theme/ThemeProvider';
import { IconButton } from '../IconButton';
import { TextButton } from '../TextButton';
import {
  buildResult,
  canSubmit,
  initialValues,
  type ExampleItem,
  type FormExamplesConfig,
  type FormField,
  type FormResult,
} from './form';

export interface FormSheetOptions {
  title: string;
  fields: FormField[];
  /** Enables the "Add example" button and the removable example inputs. */
  examples?: FormExamplesConfig;
  submitLabel?: string;
  onSubmit: (result: FormResult) => void | Promise<void>;
}

export interface FormSheetHandle {
  open: (options: FormSheetOptions) => void;
}

/** Space kept free above the sheet when it's at full height. */
const TOP_GAP = 24;

/** BottomSheetTextInput's ref type is the gesture-handler component; we only need focus(). */
type Focusable = { focus: () => void };

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
);

/**
 * Bottom sheet form: any number of text fields, optional repeatable examples,
 * Cancel / Save text buttons. Save is disabled until required fields are filled.
 */
export function FormSheet({ ref }: { ref: React.Ref<FormSheetHandle> }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetRef = useRef<BottomSheetModal>(null);
  const nextExampleId = useRef(0);
  const firstInputRef = useRef<Focusable | null>(null);
  const focusedSinceOpen = useRef(false);
  const setFirstInput = useCallback((node: unknown) => {
    firstInputRef.current = (node as Focusable | null) ?? null;
  }, []);

  const [options, setOptions] = useState<FormSheetOptions | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [examples, setExamples] = useState<ExampleItem[]>([]);
  const [busy, setBusy] = useState(false);
  /** Changes on every open() so the inputs remount with fresh default values. */
  const [formKey, setFormKey] = useState(0);

  useImperativeHandle(ref, () => ({
    open: next => {
      setOptions(next);
      setValues(initialValues(next.fields));
      setExamples(
        (next.examples?.initial ?? []).map(text => ({
          id: nextExampleId.current++,
          text,
        })),
      );
      setBusy(false);
      setFormKey(k => k + 1);
      focusedSinceOpen.current = false;
      sheetRef.current?.present();
    },
  }));

  const fields = options?.fields ?? [];
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

  const addExample = () =>
    setExamples(prev => [...prev, { id: nextExampleId.current++, text: '' }]);

  const updateExample = (id: number, text: string) =>
    setExamples(prev => prev.map(e => (e.id === id ? { ...e, text } : e)));

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
      maxDynamicContentSize={height - insets.top - TOP_GAP}
      // Lift the sheet above the keyboard; when it doesn't fit, the content
      // shrinks to the space above the keyboard and scrolls.
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
        if (index >= 0 && !focusedSinceOpen.current) {
          focusedSinceOpen.current = true;
          firstInputRef.current?.focus();
        }
      }}
    >
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 12 },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {options?.title}
        </Text>

        {/*
          Inputs are uncontrolled (defaultValue + onChangeText). A controlled
          `value` is written back to the native field on every keystroke, which
          resets the cursor when typing in the middle of the text on Android.
        */}
        <View key={formKey}>
        {fields.map((field, index) => (
          <View key={field.key} style={styles.field}>
            {field.label ? (
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                {field.label}
                {field.required ? ' *' : ''}
              </Text>
            ) : null}
            <BottomSheetTextInput
              defaultValue={field.initialValue}
              onChangeText={text =>
                setValues(prev => ({ ...prev, [field.key]: text }))
              }
              placeholder={field.placeholder}
              placeholderTextColor={colors.textSecondary}
              multiline={field.multiline}
              ref={index === 0 ? setFirstInput : undefined}
              accessibilityLabel={field.label ?? field.placeholder}
              style={[inputStyle, field.multiline && styles.multiline]}
            />
          </View>
        ))}

        {options?.examples ? (
          <>
            {examples.length > 0 ? (
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Examples
              </Text>
            ) : null}
            {examples.map((example, index) => (
              <View key={example.id} style={styles.exampleRow}>
                <BottomSheetTextInput
                  defaultValue={example.text}
                  onChangeText={text => updateExample(example.id, text)}
                  placeholder={options.examples?.placeholder ?? 'Example'}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  // Added while the sheet is open: focus the new (empty) example.
                  autoFocus={example.text === ''}
                  accessibilityLabel={`Example ${index + 1}`}
                  style={[inputStyle, styles.multiline, styles.exampleInput]}
                />
                <IconButton
                  icon={CircleMinus}
                  color={colors.danger}
                  size={22}
                  accessibilityLabel={`Remove example ${index + 1}`}
                  onPress={() => removeExample(example.id)}
                />
              </View>
            ))}
            <View style={styles.addExample}>
              <TextButton title="+ Add example" onPress={addExample} />
            </View>
          </>
        ) : null}
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
    (options: FormSheetOptions) => ref.current?.open(options),
    [],
  );
  return { open, element: <FormSheet ref={ref} /> };
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 4 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  input: {
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multiline: { minHeight: 44, textAlignVertical: 'top' },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  exampleInput: { flex: 1 },
  addExample: { alignItems: 'flex-start', marginLeft: -12 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
    marginRight: -12,
  },
});
