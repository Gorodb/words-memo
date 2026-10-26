import type { Word } from '../src/domain/types';
import {
  createFlashcards,
  currentCard,
  flashcardsReducer,
  isFinished,
  learnedWrite,
  roundStats,
  type FlashcardsAction,
  type FlashcardsState,
} from '../src/features/study/flashcards';

const word = (id: string, learned = false): Word => ({
  id,
  setId: 's',
  languageCode: 'de',
  term: `term ${id}`,
  translation: `translation ${id}`,
  examples: [],
  description: '',
  learnedAt: learned ? 1 : null,
  createdAt: 0,
  updatedAt: 0,
});

const run = (state: FlashcardsState, ...actions: FlashcardsAction[]) =>
  actions.reduce(flashcardsReducer, state);

test('swipes answer the cards in order and report the Learned writes', () => {
  let s = createFlashcards([word('1'), word('2'), word('3')]);
  expect(currentCard(s)?.translation).toBe('translation 1');

  expect(learnedWrite(s, { type: 'swipe', learned: true })).toEqual({
    id: '1',
    learned: true,
  });
  // Already not learned: swiping left writes nothing.
  s = run(s, { type: 'swipe', learned: true });
  expect(learnedWrite(s, { type: 'swipe', learned: false })).toBeNull();
  s = run(
    s,
    { type: 'swipe', learned: false },
    { type: 'swipe', learned: true },
  );

  expect(isFinished(s)).toBe(true);
  expect(currentCard(s)).toBeNull();
  expect(roundStats(s)).toEqual({ learned: 2, toLearn: 1 });
  // Swiping past the end does nothing.
  expect(run(s, { type: 'swipe', learned: true })).toBe(s);
});

test('undo goes back one card and restores its Learned flag', () => {
  let s = createFlashcards([word('1'), word('2')]);
  s = run(s, { type: 'swipe', learned: true });
  expect(learnedWrite(s, { type: 'undo' })).toEqual({
    id: '1',
    learned: false,
  });
  s = run(s, { type: 'undo' });
  expect(currentCard(s)?.id).toBe('1');
  expect(s.learned['1']).toBe(false);
  expect(learnedWrite(s, { type: 'undo' })).toBeNull();
  expect(run(s, { type: 'undo' })).toBe(s);

  // Undo of a swipe that changed nothing writes nothing.
  s = run(s, { type: 'swipe', learned: false });
  expect(learnedWrite(s, { type: 'undo' })).toBeNull();
});

test('shuffle keeps answered cards in place', () => {
  let s = createFlashcards([word('1'), word('2'), word('3'), word('4')]);
  s = run(s, { type: 'swipe', learned: true });
  s = run(s, { type: 'shuffle', random: () => 0 });
  expect(s.order[0]).toBe('1');
  expect([...s.order].sort()).toEqual(['1', '2', '3', '4']);
  expect(s.order).toEqual(['1', '3', '4', '2']);
});

test('toggle side and repeat the cards still to learn', () => {
  let s = createFlashcards([word('1'), word('2'), word('3')]);
  s = run(s, { type: 'toggleSide' });
  expect(s.termFirst).toBe(true);
  s = run(
    s,
    { type: 'swipe', learned: false },
    { type: 'swipe', learned: true },
    { type: 'swipe', learned: false },
    { type: 'repeat' },
  );
  expect(s.order).toEqual(['1', '3']);
  expect(s.index).toBe(0);
  expect(s.history).toEqual([]);
  expect(s.termFirst).toBe(true);
});

test('edit replaces the card text and keeps the game position', () => {
  let s = run(createFlashcards([word('1'), word('2')]), {
    type: 'swipe',
    learned: true,
  });
  const edited = { id: '2', term: 'der Apfel', translation: 'яблоко' };
  s = run(s, { type: 'edit', card: edited });
  expect(currentCard(s)).toEqual(edited);
  expect(s.index).toBe(1);
  expect(s.learned).toEqual({ '1': true, '2': false });
  // Unknown ids are ignored.
  expect(run(s, { type: 'edit', card: { ...edited, id: 'x' } })).toBe(s);
});
