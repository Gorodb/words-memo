import React, { createRef } from 'react';
import { TextInput } from 'react-native';
import ReactTestRenderer, {
  type ReactTestInstance,
  type ReactTestRenderer as Renderer,
} from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  FormSheet,
  type FormSheetHandle,
} from '../src/components/formSheet/FormSheet';
import { nameForm, wordForm } from '../src/components/formSheet/forms';
import { buildResult, canSubmit } from '../src/components/formSheet/form';
import { ThemeProvider } from '../src/theme/ThemeProvider';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderSheet() {
  const ref = createRef<FormSheetHandle>();
  let renderer!: Renderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <FormSheet ref={ref} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  const root = renderer.root;
  const inputs = () => root.findAll(n => n.type === TextInput);
  const input = (label: string) =>
    inputs().find(n => n.props.accessibilityLabel === label)!;
  const button = (label: string) =>
    root.find(
      (n: ReactTestInstance) =>
        n.props.accessibilityRole === 'button' &&
        n.props.accessibilityLabel === label &&
        typeof n.props.onPress === 'function' &&
        typeof n.type !== 'string',
    );
  const act = (fn: () => unknown) =>
    ReactTestRenderer.act(async () => {
      await fn();
    });
  return { ref, inputs, input, button, act };
}

describe('form logic', () => {
  const fields = [
    { key: 'term', required: true },
    { key: 'note' },
  ];

  test('required fields gate submit; whitespace does not count', () => {
    expect(canSubmit(fields, { term: '', note: 'x' })).toBe(false);
    expect(canSubmit(fields, { term: '   ', note: '' })).toBe(false);
    expect(canSubmit(fields, { term: 'Haus', note: '' })).toBe(true);
  });

  test('result is trimmed and blank examples are dropped', () => {
    const result = buildResult(fields, { term: ' Haus ', note: '' }, [
      { id: 1, text: '  Das Haus ist groß. ' },
      { id: 2, text: '   ' },
      { id: 3, text: '' },
    ]);
    expect(result).toEqual({
      values: { term: 'Haus', note: '' },
      examples: ['Das Haus ist groß.'],
    });
  });
});

describe('FormSheet', () => {
  test('name form: one prefilled input, Save disabled when emptied', async () => {
    const s = await renderSheet();
    const onSubmit = jest.fn();
    await s.act(() =>
      s.ref.current!.open(
        nameForm({
          title: 'Rename folder',
          placeholder: 'Folder name',
          initialValue: 'Travel',
          onSubmit,
        }),
      ),
    );

    expect(s.inputs()).toHaveLength(1);
    expect(s.inputs()[0].props.defaultValue).toBe('Travel');
    expect(() => s.button('+ Add example')).toThrow();
    expect(s.button('Save').props.disabled).toBe(false);

    await s.act(() => s.inputs()[0].props.onChangeText('  '));
    expect(s.button('Save').props.disabled).toBe(true);

    await s.act(() => s.inputs()[0].props.onChangeText('Trips '));
    await s.act(() => s.button('Save').props.onPress());
    expect(onSubmit).toHaveBeenCalledWith('Trips');
  });

  test('word form: requires both fields, adds/removes examples, drops empty ones', async () => {
    const s = await renderSheet();
    const onSubmit = jest.fn();
    await s.act(() =>
      s.ref.current!.open(wordForm({ title: 'New word', onSubmit })),
    );

    expect(s.inputs()).toHaveLength(2);
    expect(s.button('Save').props.disabled).toBe(true);

    await s.act(() => s.input('Word or phrase').props.onChangeText('essen'));
    expect(s.button('Save').props.disabled).toBe(true);
    await s.act(() => s.input('Translation').props.onChangeText('есть'));
    expect(s.button('Save').props.disabled).toBe(false);

    await s.act(() => s.button('+ Add example').props.onPress());
    await s.act(() => s.button('+ Add example').props.onPress());
    await s.act(() => s.button('+ Add example').props.onPress());
    expect(s.inputs()).toHaveLength(5);

    await s.act(() => s.input('Example 1').props.onChangeText('Wir essen.'));
    await s.act(() => s.input('Example 2').props.onChangeText('to remove'));
    await s.act(() => s.button('Remove example 2').props.onPress());
    expect(s.inputs()).toHaveLength(4);
    // The old third example (left empty) is now "Example 2".

    await s.act(() => s.button('Save').props.onPress());
    expect(onSubmit).toHaveBeenCalledWith({
      term: 'essen',
      translation: 'есть',
      examples: ['Wir essen.'],
    });
  });

  test('edit word form is prefilled, including examples', async () => {
    const s = await renderSheet();
    await s.act(() =>
      s.ref.current!.open(
        wordForm({
          title: 'Edit word',
          initial: {
            term: 'das Essen',
            translation: 'еда',
            examples: ['Das Essen ist fertig.'],
          },
          onSubmit: jest.fn(),
        }),
      ),
    );
    expect(s.inputs().map(i => i.props.defaultValue)).toEqual([
      'das Essen',
      'еда',
      'Das Essen ist fertig.',
    ]);
  });

  test('inputs are uncontrolled and reset on every open', async () => {
    const s = await renderSheet();
    const open = (initialValue: string) =>
      s.act(() =>
        s.ref.current!.open(
          nameForm({
            title: 'Rename',
            placeholder: 'Name',
            initialValue,
            onSubmit: jest.fn(),
          }),
        ),
      );

    await open('First');
    await s.act(() => s.inputs()[0].props.onChangeText('Fir st'));
    // Regression: a controlled `value` makes the cursor jump while typing
    // in the middle of the text on Android.
    expect(s.inputs()[0].props.value).toBeUndefined();
    expect(s.button('Save').props.disabled).toBe(false);

    await open('Second');
    expect(s.inputs()).toHaveLength(1);
    expect(s.inputs()[0].props.defaultValue).toBe('Second');
  });
});
