/**
 * "Study words" game as a pure reducer (unit tested). Up to 10 words go
 * through three rounds: choose the translation, choose the word, write the
 * word. Each round ends with one repeat pass over the words answered wrong.
 * Words without a single mistake or hint are learned at the end; the screen
 * writes that to the database.
 */
import type { ID, Word } from '../../domain/types';
import type { WordSide } from './modes';
import {
  correctPrefixLength,
  hintText,
  isCorrect,
  normalizeAnswer,
} from './session';

export const STUDY_WORDS_COUNT = 10;
const CHOICES = 4;

export interface StudyWordsRound {
  title: string;
  kind: 'choose' | 'write';
  prompt: WordSide;
  answer: WordSide;
}

export const STUDY_WORDS_ROUNDS: StudyWordsRound[] = [
  {
    title: 'Choose the translation',
    kind: 'choose',
    prompt: 'term',
    answer: 'translation',
  },
  {
    title: 'Choose the word',
    kind: 'choose',
    prompt: 'translation',
    answer: 'term',
  },
  {
    title: 'Write the word',
    kind: 'write',
    prompt: 'translation',
    answer: 'term',
  },
];

export type GameWord = Pick<Word, 'id' | 'term' | 'translation'> & {
  /** Learned flag in the database when the game started. */
  learned: boolean;
};

/** Where wrong options come from: the set first, then other sets. */
export interface OptionPools {
  set: Pick<Word, 'id' | 'term' | 'translation'>[];
  other: Pick<Word, 'id' | 'term' | 'translation'>[];
}

export type StudyWordsAnswer =
  | { kind: 'choose'; choice: string; correct: boolean }
  /**
   * hinted: a Hint was used, which counts as a mistake even when correct.
   * marked: wrong, then "Mark as correct" (a typo).
   */
  | {
      kind: 'write';
      input: string;
      correct: boolean;
      hinted: boolean;
      marked: boolean;
    };

export interface StudyWordsState {
  words: Record<ID, GameWord>;
  /** Words of the game in their first order. */
  ids: ID[];
  pools: OptionPools;
  /** Index into STUDY_WORDS_ROUNDS. */
  round: number;
  /** The repeat pass over the words answered wrong in this round. */
  repeat: boolean;
  /** Words of the current pass, in the order they are asked. */
  queue: ID[];
  index: number;
  /** Options per word in the current pass (choose rounds). */
  options: Record<ID, string[]>;
  /** Answer to the current question; null = not answered yet. */
  answer: StudyWordsAnswer | null;
  /** Write round: letters shown by Hint, and a remount counter for the input. */
  hints: number;
  revision: number;
  /** Answered wrong in the current round's first pass (asked again in the repeat). */
  missed: ID[];
  /** Answered wrong or with a hint at least once in the game. */
  mistakes: ID[];
  /** `missed` and `mistakes` before the current answer ("Mark as correct" restores them). */
  beforeAnswer: { missed: ID[]; mistakes: ID[] } | null;
  finished: boolean;
}

export type StudyWordsAction =
  | { type: 'choose'; option: string }
  | { type: 'check'; input: string }
  /** `input`: what is typed now; its correct beginning is kept. */
  | { type: 'hint'; input: string }
  /** Write round: a wrong answer was a typo. Still a mistake after a Hint. */
  | { type: 'markCorrect' }
  | { type: 'next'; random?: () => number };

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Up to `count` words: the `first` ones (e.g. last game's mistakes), then
 * random others. The result is in random order.
 */
export function pickStudyWords(
  candidates: Word[],
  first: ID[] = [],
  count = STUDY_WORDS_COUNT,
  random: () => number = Math.random,
): Word[] {
  const priority = new Set(first);
  const picked = [
    ...shuffled(
      candidates.filter(w => priority.has(w.id)),
      random,
    ),
    ...shuffled(
      candidates.filter(w => !priority.has(w.id)),
      random,
    ),
  ].slice(0, count);
  return shuffled(picked, random);
}

/**
 * The right answer and up to 3 different wrong ones, shuffled. Wrong ones
 * come from other words of the set, then from other sets.
 */
export function buildOptions(
  word: Pick<Word, 'id' | 'term' | 'translation'>,
  side: WordSide,
  pools: OptionPools,
  random: () => number,
): string[] {
  const answer = word[side];
  const seen = new Set([normalizeAnswer(answer)]);
  const wrong: string[] = [];
  for (const pool of [pools.set, pools.other]) {
    for (const other of shuffled(pool, random)) {
      if (wrong.length === CHOICES - 1) {
        break;
      }
      const text = other[side];
      const key = normalizeAnswer(text);
      if (other.id !== word.id && key && !seen.has(key)) {
        seen.add(key);
        wrong.push(text);
      }
    }
  }
  return shuffled([answer, ...wrong], random);
}

function startPass(
  state: StudyWordsState,
  round: number,
  ids: ID[],
  repeat: boolean,
  random: () => number,
): StudyWordsState {
  const { kind, answer } = STUDY_WORDS_ROUNDS[round];
  const queue = shuffled(ids, random);
  return {
    ...state,
    round,
    repeat,
    queue,
    index: 0,
    options:
      kind === 'choose'
        ? Object.fromEntries(
            queue.map(id => [
              id,
              buildOptions(state.words[id], answer, state.pools, random),
            ]),
          )
        : {},
    answer: null,
    beforeAnswer: null,
    hints: 0,
    revision: 0,
    missed: repeat ? state.missed : [],
  };
}

export function createStudyWords(
  words: Word[],
  pools: OptionPools,
  random: () => number = Math.random,
): StudyWordsState {
  const initial: StudyWordsState = {
    words: Object.fromEntries(
      words.map(w => [
        w.id,
        {
          id: w.id,
          term: w.term,
          translation: w.translation,
          learned: w.learnedAt !== null,
        },
      ]),
    ),
    ids: words.map(w => w.id),
    pools,
    round: 0,
    repeat: false,
    queue: [],
    index: 0,
    options: {},
    answer: null,
    hints: 0,
    revision: 0,
    missed: [],
    mistakes: [],
    beforeAnswer: null,
    finished: words.length === 0,
  };
  return words.length === 0
    ? initial
    : startPass(initial, 0, initial.ids, false, random);
}

export function currentWord(state: StudyWordsState): GameWord | null {
  if (state.finished) {
    return null;
  }
  const id = state.queue[state.index];
  return id === undefined ? null : state.words[id];
}

export function currentRound(state: StudyWordsState): StudyWordsRound {
  return STUDY_WORDS_ROUNDS[state.round];
}

/** The text the user has to give for the current question. */
function expected(state: StudyWordsState, word: GameWord): string {
  return word[currentRound(state).answer];
}

function answered(
  state: StudyWordsState,
  word: GameWord,
  answer: StudyWordsAnswer,
): StudyWordsState {
  const mistake = !answer.correct || (answer.kind === 'write' && answer.hinted);
  const add = (ids: ID[]) => (ids.includes(word.id) ? ids : [...ids, word.id]);
  return {
    ...state,
    answer,
    beforeAnswer: { missed: state.missed, mistakes: state.mistakes },
    missed: mistake && !state.repeat ? add(state.missed) : state.missed,
    mistakes: mistake ? add(state.mistakes) : state.mistakes,
  };
}

export function studyWordsReducer(
  state: StudyWordsState,
  action: StudyWordsAction,
): StudyWordsState {
  const word = currentWord(state);
  if (!word && action.type !== 'next') {
    return state;
  }
  switch (action.type) {
    case 'choose':
      if (state.answer || currentRound(state).kind !== 'choose') {
        return state;
      }
      return answered(state, word!, {
        kind: 'choose',
        choice: action.option,
        correct: isCorrect(action.option, expected(state, word!)),
      });

    case 'check':
      if (state.answer || currentRound(state).kind !== 'write') {
        return state;
      }
      return answered(state, word!, {
        kind: 'write',
        input: action.input,
        correct: isCorrect(action.input, expected(state, word!)),
        hinted: state.hints > 0,
        marked: false,
      });

    case 'markCorrect': {
      const { answer, beforeAnswer } = state;
      if (answer?.kind !== 'write' || answer.correct) {
        return state;
      }
      return {
        ...state,
        answer: { ...answer, correct: true, marked: true },
        // Without a hint it's as if the word was typed right.
        ...(!answer.hinted && beforeAnswer && beforeAnswer),
      };
    }

    case 'hint': {
      if (state.answer || currentRound(state).kind !== 'write') {
        return state;
      }
      // Keep the correctly typed beginning, drop the rest, add one letter.
      const answer = expected(state, word!);
      const length = [...answer.trim()].length;
      return {
        ...state,
        hints: Math.min(correctPrefixLength(action.input, answer) + 1, length),
        revision: state.revision + 1,
      };
    }

    case 'next': {
      if (state.finished || !state.answer) {
        return state;
      }
      const random = action.random ?? Math.random;
      if (state.index + 1 < state.queue.length) {
        return {
          ...state,
          index: state.index + 1,
          answer: null,
          beforeAnswer: null,
          hints: 0,
          revision: 0,
        };
      }
      if (!state.repeat && state.missed.length > 0) {
        return startPass(state, state.round, state.missed, true, random);
      }
      if (state.round + 1 < STUDY_WORDS_ROUNDS.length) {
        return startPass(state, state.round + 1, state.ids, false, random);
      }
      return { ...state, answer: null, finished: true };
    }
  }
}

/** What the input shows after Hint in the write round. */
export function hintSeed(state: StudyWordsState): string {
  const word = currentWord(state);
  return word ? hintText(expected(state, word), state.hints) : '';
}

/** The answer to the current question (shown after a wrong answer). */
export function expectedAnswer(state: StudyWordsState): string {
  const word = currentWord(state);
  return word ? expected(state, word) : '';
}

/** Words without any mistake or hint are learned; the rest stay to learn. */
export function studyWordsResult(state: StudyWordsState): {
  learned: GameWord[];
  toLearn: GameWord[];
} {
  const mistakes = new Set(state.mistakes);
  const words = state.ids.map(id => state.words[id]);
  return {
    learned: words.filter(w => !mistakes.has(w.id)),
    toLearn: words.filter(w => mistakes.has(w.id)),
  };
}
