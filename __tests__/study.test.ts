import type { Word } from '../src/domain/types';
import { studyMode } from '../src/features/study/modes';
import {
  correctPrefixLength,
  createSession,
  hintText,
  isCorrect,
  sessionReducer,
  visibleIds,
  type SessionAction,
  type SessionState,
} from '../src/features/study/session';

const word = (id: string, term: string, translation: string): Word => ({
  id,
  setId: 's',
  languageCode: 'de',
  term,
  translation,
  examples: [],
  learnedAt: null,
  createdAt: 0,
  updatedAt: 0,
});

const words = [
  word('1', 'der Apfel, die Äpfel', 'яблоко'),
  word('2', 'essen', 'есть'),
  word('3', 'schnell', 'быстрый'),
];

const run = (state: SessionState, ...actions: SessionAction[]) =>
  actions.reduce(sessionReducer, state);

test('modes pick the right prompt and answer', () => {
  const s1 = createSession(studyMode('translation-word'), words);
  expect(s1.cards['1']).toMatchObject({
    prompt: 'яблоко',
    answer: 'der Apfel, die Äpfel',
  });
  const s4 = createSession(studyMode('write-translation'), words);
  expect(s4.cards['2']).toMatchObject({ prompt: 'essen', answer: 'есть' });
});

test('reveal: tap toggles; hide learned hides revealed words for the session', () => {
  let s = createSession(studyMode('word-translation'), words);
  s = run(
    s,
    { type: 'toggleReveal', id: '1' },
    { type: 'toggleReveal', id: '3' },
  );
  s = run(s, { type: 'toggleReveal', id: '3' }); // hidden again
  s = run(s, { type: 'hideLearned' });
  expect(visibleIds(s)).toEqual(['2', '3']);
  // Unrevealing nothing more: hidden stays hidden.
  s = run(s, { type: 'toggleReveal', id: '2' }, { type: 'hideLearned' });
  expect(visibleIds(s)).toEqual(['3']);
});

test('shuffle reorders but keeps hidden words hidden', () => {
  let s = createSession(studyMode('word-translation'), words);
  s = run(s, { type: 'toggleReveal', id: '2' }, { type: 'hideLearned' });
  const reversed = () => 0; // Fisher-Yates with random()=0 rotates
  s = run(s, { type: 'shuffle', random: reversed });
  expect([...s.order].sort()).toEqual(['1', '2', '3']);
  expect(s.order).not.toEqual(['1', '2', '3']);
  expect(visibleIds(s)).not.toContain('2');
});

test('write: check is whole-string and case-insensitive', () => {
  let s = createSession(studyMode('write-word'), words);
  s = run(s, { type: 'check', id: '1', input: '  DER apfel,   die äpfel ' });
  expect(s.progress['1']).toMatchObject({ status: 'correct' });
  s = run(s, { type: 'check', id: '2', input: 'esen' });
  expect(s.progress['2']).toMatchObject({ status: 'wrong' });
  expect(isCorrect('Apfel', 'der Apfel, die Äpfel')).toBe(false);
});

test('write: wrong → show → try again resets; mark as correct', () => {
  let s = createSession(studyMode('write-word'), words);
  s = run(s, { type: 'check', id: '2', input: 'x' }, { type: 'show', id: '2' });
  expect(s.progress['2']).toMatchObject({ status: 'shown' });
  s = run(s, { type: 'retry', id: '2' });
  expect(s.progress['2']).toEqual({
    kind: 'write',
    status: 'idle',
    hints: 0,
    revision: 0,
    attempt: 1,
  });
  s = run(
    s,
    { type: 'check', id: '2', input: 'esen' },
    { type: 'markCorrect', id: '2' },
  );
  expect(s.progress['2']).toMatchObject({ status: 'correct' });
  s = run(s, { type: 'hideLearned' });
  expect(visibleIds(s)).toEqual(['1', '3']);
});

test('write: hint keeps the correctly typed beginning and adds one letter', () => {
  let s = createSession(studyMode('write-word'), words);
  const hint = (input: string) => {
    s = run(s, { type: 'hint', id: '2', input });
    return hintText(
      s.cards['2'].answer,
      (s.progress['2'] as { hints: number }).hints,
    );
  };
  expect(hint('')).toBe('e'); // nothing typed: first letter
  expect(hint('es')).toBe('ess'); // correct so far: one more letter
  expect(hint('esx')).toBe('ess'); // wrong part removed
  expect(hint('ESS')).toBe('esse'); // case doesn't matter
  expect(hint('xyz')).toBe('e'); // wrong from the start
  expect(hint('essen')).toBe('essen'); // never longer than the answer
  expect(correctPrefixLength('  der Ap', 'der Apfel, die Äpfel')).toBe(6);
  // Every press remounts the input, even if the text stays the same.
  const before = (s.progress['2'] as { revision: number }).revision;
  hint('essen');
  expect((s.progress['2'] as { revision: number }).revision).toBe(before + 1);
  // Ignored once checked.
  s = run(s, { type: 'check', id: '2', input: 'essen' });
  const done = s;
  s = run(s, { type: 'hint', id: '2', input: '' });
  expect(s).toBe(done);
});

test('swipe-hide removes one card for the session; repeats are no-ops', () => {
  let s = createSession(studyMode('translation-word'), words);
  s = run(s, { type: 'hide', id: '2' }, { type: 'hide', id: '2' });
  expect(visibleIds(s)).toEqual(['1', '3']);
  expect(s.hidden).toEqual(['2']);
  s = run(s, { type: 'shuffle', random: () => 0 });
  expect(visibleIds(s)).not.toContain('2');
  expect(run(s, { type: 'hide', id: 'missing' })).toBe(s);
});
