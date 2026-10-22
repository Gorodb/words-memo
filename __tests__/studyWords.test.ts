import type { Word } from '../src/domain/types';
import {
  buildOptions,
  createStudyWords,
  currentRound,
  currentWord,
  expectedAnswer,
  hintSeed,
  pickStudyWords,
  studyWordsReducer,
  studyWordsResult,
  type StudyWordsAction,
  type StudyWordsState,
} from '../src/features/study/studyWords';

const word = (id: string, term = id, translation = `t-${id}`): Word => ({
  id,
  setId: 's',
  languageCode: 'de',
  term,
  translation,
  examples: [],
  learnedAt: null,
  createdAt: 1,
  updatedAt: 1,
});

/** Deterministic "random": keeps the original order when shuffling. */
const keep = () => 0.999999;

const run = (state: StudyWordsState, ...actions: StudyWordsAction[]) =>
  actions.reduce(studyWordsReducer, state);

/** Answers the current question right or wrong, then Next. */
function answer(state: StudyWordsState, right: boolean): StudyWordsState {
  const round = currentRound(state);
  const correct = expectedAnswer(state);
  const given = right ? correct : 'nope';
  return run(
    state,
    round.kind === 'choose'
      ? { type: 'choose', option: given }
      : { type: 'check', input: given },
    { type: 'next', random: keep },
  );
}

const words = ['a', 'b', 'c', 'd', 'e'].map(id => word(id));
const pools = { set: words, other: [] };

describe('pickStudyWords', () => {
  test('takes the given words first, then fills up to the count', () => {
    const many = Array.from({ length: 15 }, (_, i) => word(`w${i}`));
    const picked = pickStudyWords(many, ['w14', 'w13'], 10, Math.random);
    expect(picked).toHaveLength(10);
    expect(picked.map(w => w.id)).toEqual(
      expect.arrayContaining(['w14', 'w13']),
    );
    expect(new Set(picked.map(w => w.id)).size).toBe(10);
    expect(pickStudyWords(many.slice(0, 3))).toHaveLength(3);
  });
});

describe('buildOptions', () => {
  test('one right answer and 3 different wrong ones, set first', () => {
    const set = [
      word('a', 'a', 'Haus'),
      word('b', 'b', 'haus '), // same as the answer once normalized
      word('c', 'c', 'Baum'),
    ];
    const other = [
      word('x', 'x', 'Baum'),
      word('y', 'y', 'Tür'),
      word('z', 'z', 'Tisch'),
    ];
    const options = buildOptions(set[0], 'translation', { set, other }, keep);
    expect(options).toHaveLength(4);
    expect(options).toContain('Haus');
    expect(options).toContain('Baum');
    expect(options.filter(o => o.toLowerCase().trim() === 'haus')).toEqual([
      'Haus',
    ]);
  });

  test('fewer options when there are not enough other words', () => {
    expect(
      buildOptions(words[0], 'term', { set: [words[0]], other: [] }, keep),
    ).toEqual(['a']);
  });
});

describe('study words game', () => {
  test('three rounds; mistakes get one repeat pass per round', () => {
    let s = createStudyWords(words.slice(0, 3), pools, keep);
    expect(currentRound(s).title).toBe('Choose the translation');
    expect(s.options.a).toContain('t-a');

    // Round 1: b wrong → repeat pass with b only, wrong again → round 2.
    s = answer(s, true);
    s = answer(s, false);
    s = answer(s, true);
    expect(s.repeat).toBe(true);
    expect(s.queue).toEqual(['b']);
    s = answer(s, false);
    expect(s.round).toBe(1);
    expect(s.repeat).toBe(false);
    expect(s.queue).toEqual(['a', 'b', 'c']);
    expect(currentWord(s)?.id).toBe('a');
    expect(s.options.a).toContain('a');

    // Round 2: all right → no repeat pass.
    s = answer(answer(answer(s, true), true), true);
    expect(s.round).toBe(2);
    expect(currentRound(s).kind).toBe('write');

    // Round 3: a with a hint (correct but a mistake), others right.
    s = run(s, { type: 'hint', input: '' });
    expect(hintSeed(s)).toBe('a');
    s = run(s, { type: 'check', input: 'A' }, { type: 'next', random: keep });
    s = answer(answer(s, true), true);
    // a goes to the repeat pass because of the hint.
    expect(s.repeat).toBe(true);
    expect(s.queue).toEqual(['a']);
    s = answer(s, true);
    expect(s.finished).toBe(true);
    expect(currentWord(s)).toBeNull();

    const result = studyWordsResult(s);
    expect(result.learned.map(w => w.id)).toEqual(['c']);
    expect(result.toLearn.map(w => w.id)).toEqual(['a', 'b']);
  });

  test('no Next before an answer; one answer per question', () => {
    let s = createStudyWords(words.slice(0, 2), pools, keep);
    expect(run(s, { type: 'next' })).toBe(s);
    s = run(s, { type: 'choose', option: 'nope' });
    expect(run(s, { type: 'choose', option: 't-a' })).toBe(s);
    expect(s.answer).toEqual({
      kind: 'choose',
      choice: 'nope',
      correct: false,
    });
  });

  test('Mark as correct: a typo counts as right, unless a hint was used', () => {
    const toWriteRound = (s: StudyWordsState) => answer(answer(s, true), true);
    let s = toWriteRound(
      createStudyWords([word('a', 'essen', 'есть')], pools, keep),
    );
    s = run(s, { type: 'check', input: 'esen' }, { type: 'markCorrect' });
    expect(s.answer).toMatchObject({ correct: true, marked: true });
    s = run(s, { type: 'next', random: keep });
    expect(s.finished).toBe(true); // no repeat pass
    expect(studyWordsResult(s).learned.map(w => w.id)).toEqual(['a']);

    // A mistake in an earlier round stays a mistake.
    s = createStudyWords([word('a', 'essen', 'есть')], pools, keep);
    s = answer(answer(s, false), true); // round 1 + its repeat pass
    s = answer(s, true); // round 2
    s = run(s, { type: 'check', input: 'esen' }, { type: 'markCorrect' });
    expect(s.mistakes).toEqual(['a']);
    expect(s.missed).toEqual([]);

    // With a hint: still a mistake, and repeated.
    s = toWriteRound(
      createStudyWords([word('a', 'essen', 'есть')], pools, keep),
    );
    s = run(
      s,
      { type: 'hint', input: '' },
      { type: 'check', input: 'esen' },
      { type: 'markCorrect' },
    );
    expect(s.answer).toMatchObject({ correct: true, hinted: true });
    expect(s.mistakes).toEqual(['a']);
    s = run(s, { type: 'next', random: keep });
    expect(s.repeat).toBe(true);

    // Only wrong written answers can be marked.
    const chooseRound = run(createStudyWords([word('a')], pools, keep), {
      type: 'choose',
      option: 'nope',
    });
    expect(run(chooseRound, { type: 'markCorrect' })).toBe(chooseRound);
  });

  test('hint keeps the correct beginning and adds a letter', () => {
    let s = createStudyWords([word('a', 'essen', 'есть')], pools, keep);
    s = answer(answer(s, true), true); // rounds 1 and 2
    s = run(s, { type: 'hint', input: 'esx' });
    expect(hintSeed(s)).toBe('ess');
    expect(s.revision).toBe(1);
  });

  test('an empty game is finished at once', () => {
    expect(createStudyWords([], pools).finished).toBe(true);
  });
});
