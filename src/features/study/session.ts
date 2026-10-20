/**
 * Study session state as a pure reducer (unit tested). The session lives only
 * in memory: hiding words or marking answers never changes the database.
 */
import type { ID, Word } from '../../domain/types';
import type { StudyMode } from './modes';

export type WriteStatus = 'idle' | 'correct' | 'wrong' | 'shown';

export type CardProgress =
  | { kind: 'reveal'; revealed: boolean }
  | {
      kind: 'write';
      status: WriteStatus;
      /** Letters of the answer the input shows after the last Hint. */
      hints: number;
      /** Bumped on every Hint so the input remounts with the hint text. */
      revision: number;
      /** Bumped on "Try again" so the input starts empty. */
      attempt: number;
    };

export interface StudyCard {
  id: ID;
  prompt: string;
  answer: string;
}

export interface SessionState {
  mode: StudyMode;
  cards: Record<ID, StudyCard>;
  order: ID[];
  /** Hidden by "Hide learned"; they stay hidden for the rest of the session. */
  hidden: ID[];
  progress: Record<ID, CardProgress>;
}

export type SessionAction =
  | { type: 'shuffle'; random?: () => number }
  | { type: 'toggleReveal'; id: ID }
  | { type: 'hideLearned' }
  /** Swipe left in reveal modes: hide this card for the rest of the session. */
  | { type: 'hide'; id: ID }
  | { type: 'check'; id: ID; input: string }
  /** `input`: what is typed now; its correct beginning is kept. */
  | { type: 'hint'; id: ID; input: string }
  | { type: 'show'; id: ID }
  | { type: 'retry'; id: ID }
  | { type: 'markCorrect'; id: ID };

function initialProgress(mode: StudyMode): CardProgress {
  return mode.kind === 'reveal'
    ? { kind: 'reveal', revealed: false }
    : { kind: 'write', status: 'idle', hints: 0, revision: 0, attempt: 0 };
}

export function createSession(mode: StudyMode, words: Word[]): SessionState {
  return {
    mode,
    cards: Object.fromEntries(
      words.map(w => [
        w.id,
        { id: w.id, prompt: w[mode.prompt], answer: w[mode.answer] },
      ]),
    ),
    order: words.map(w => w.id),
    hidden: [],
    progress: Object.fromEntries(words.map(w => [w.id, initialProgress(mode)])),
  };
}

/** Whole-string comparison: case, extra spaces and Unicode form don't matter. */
export function normalizeAnswer(text: string): string {
  return text.trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase();
}

export function isCorrect(input: string, answer: string): boolean {
  return normalizeAnswer(input) === normalizeAnswer(answer);
}

/**
 * Length of the beginning of `input` that matches `answer` letter by letter
 * (case-insensitive): "esx" vs "essen" → 2.
 */
export function correctPrefixLength(input: string, answer: string): number {
  const typed = [...input.trimStart().normalize('NFC')];
  const expected = [...answer.trim().normalize('NFC')];
  let i = 0;
  while (
    i < typed.length &&
    i < expected.length &&
    typed[i].toLocaleLowerCase() === expected[i].toLocaleLowerCase()
  ) {
    i++;
  }
  return i;
}

/** The first `hints` letters of the answer (what the input shows after Hint). */
export function hintText(answer: string, hints: number): string {
  return [...answer.trim()].slice(0, hints).join('');
}

export function visibleIds(state: SessionState): ID[] {
  const hidden = new Set(state.hidden);
  return state.order.filter(id => !hidden.has(id));
}

/** Revealed (reveal modes) or answered correctly (write modes). */
export function isLearnedInSession(
  progress: CardProgress | undefined,
): boolean {
  if (!progress) {
    return false;
  }
  return progress.kind === 'reveal'
    ? progress.revealed
    : progress.status === 'correct';
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function updateWrite(
  state: SessionState,
  id: ID,
  update: (
    p: Extract<CardProgress, { kind: 'write' }>,
  ) => Extract<CardProgress, { kind: 'write' }>,
): SessionState {
  const current = state.progress[id];
  if (current?.kind !== 'write') {
    return state;
  }
  const next = update(current);
  // Unchanged (e.g. Hint after Check): keep the same state, no re-render.
  return next === current
    ? state
    : { ...state, progress: { ...state.progress, [id]: next } };
}

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case 'shuffle':
      return {
        ...state,
        order: shuffled(state.order, action.random ?? Math.random),
      };

    case 'toggleReveal': {
      const current = state.progress[action.id];
      if (current?.kind !== 'reveal') {
        return state;
      }
      return {
        ...state,
        progress: {
          ...state.progress,
          [action.id]: { ...current, revealed: !current.revealed },
        },
      };
    }

    case 'hideLearned': {
      const learned = visibleIds(state).filter(id =>
        isLearnedInSession(state.progress[id]),
      );
      return learned.length
        ? { ...state, hidden: [...state.hidden, ...learned] }
        : state;
    }

    case 'hide':
      return state.hidden.includes(action.id) || !state.cards[action.id]
        ? state
        : { ...state, hidden: [...state.hidden, action.id] };

    case 'check': {
      const answer = state.cards[action.id]?.answer ?? '';
      return updateWrite(state, action.id, p =>
        p.status === 'idle'
          ? {
              ...p,
              status: isCorrect(action.input, answer) ? 'correct' : 'wrong',
            }
          : p,
      );
    }

    case 'hint': {
      // Keep the correctly typed beginning, drop the rest, add one letter.
      const answer = state.cards[action.id]?.answer ?? '';
      const length = [...answer.trim()].length;
      const correct = correctPrefixLength(action.input, answer);
      return updateWrite(state, action.id, p =>
        p.status === 'idle'
          ? {
              ...p,
              hints: Math.min(correct + 1, length),
              revision: p.revision + 1,
            }
          : p,
      );
    }

    case 'show':
      return updateWrite(state, action.id, p =>
        p.status === 'wrong' ? { ...p, status: 'shown' } : p,
      );

    case 'retry':
      return updateWrite(state, action.id, p => ({
        ...p,
        status: 'idle',
        hints: 0,
        attempt: p.attempt + 1,
      }));

    case 'markCorrect':
      return updateWrite(state, action.id, p =>
        p.status === 'wrong' || p.status === 'shown'
          ? { ...p, status: 'correct' }
          : p,
      );
  }
}
