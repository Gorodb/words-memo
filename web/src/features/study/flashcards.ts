/**
 * Flashcards game as a pure reducer (unit tested). Unlike the study session,
 * a swipe changes the word's Learned flag: the screen writes the change that
 * `learnedWrite` returns before dispatching the action.
 */
import type { ID, Word } from '../../domain/types';

export interface Flashcard {
  id: ID;
  term: string;
  translation: string;
}

export interface FlashcardsState {
  cards: Record<ID, Flashcard>;
  order: ID[];
  /** Position of the current card; `order.length` = all cards answered. */
  index: number;
  /** Learned flag per card as it is in the database now. */
  learned: Record<ID, boolean>;
  /** Answered cards, oldest first, with their flag before the swipe (Undo). */
  history: { id: ID; wasLearned: boolean }[];
  /** false: the translation is on the front and the word on the back. */
  termFirst: boolean;
}

export type FlashcardsAction =
  /** Swipe right (learned = true) or left (learned = false). */
  | { type: 'swipe'; learned: boolean }
  | { type: 'undo' }
  /** Shuffles the cards not answered yet. */
  | { type: 'shuffle'; random?: () => number }
  | { type: 'toggleSide' }
  /** The word was edited during the game: show its new text. */
  | { type: 'edit'; card: Flashcard }
  /** A new round over the cards that are still not learned. */
  | { type: 'repeat' };

export function createFlashcards(words: Word[]): FlashcardsState {
  return {
    cards: Object.fromEntries(
      words.map(w => [
        w.id,
        { id: w.id, term: w.term, translation: w.translation },
      ]),
    ),
    order: words.map(w => w.id),
    index: 0,
    learned: Object.fromEntries(words.map(w => [w.id, w.learnedAt !== null])),
    history: [],
    termFirst: false,
  };
}

export function currentCard(state: FlashcardsState): Flashcard | null {
  const id = state.order[state.index];
  return id === undefined ? null : state.cards[id];
}

export function isFinished(state: FlashcardsState): boolean {
  return state.index >= state.order.length;
}

/** Cards of this round marked learned / to learn so far. */
export function roundStats(state: FlashcardsState): {
  learned: number;
  toLearn: number;
} {
  const answered = state.order.slice(0, state.index);
  const learned = answered.filter(id => state.learned[id]).length;
  return { learned, toLearn: answered.length - learned };
}

/** The Learned flag the action changes in the database, if any. */
export function learnedWrite(
  state: FlashcardsState,
  action: FlashcardsAction,
): { id: ID; learned: boolean } | null {
  if (action.type === 'swipe') {
    const card = currentCard(state);
    return card && state.learned[card.id] !== action.learned
      ? { id: card.id, learned: action.learned }
      : null;
  }
  if (action.type === 'undo') {
    const last = state.history[state.history.length - 1];
    return last && state.learned[last.id] !== last.wasLearned
      ? { id: last.id, learned: last.wasLearned }
      : null;
  }
  return null;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function flashcardsReducer(
  state: FlashcardsState,
  action: FlashcardsAction,
): FlashcardsState {
  switch (action.type) {
    case 'swipe': {
      const card = currentCard(state);
      if (!card) {
        return state;
      }
      return {
        ...state,
        index: state.index + 1,
        learned: { ...state.learned, [card.id]: action.learned },
        history: [
          ...state.history,
          { id: card.id, wasLearned: state.learned[card.id] },
        ],
      };
    }

    case 'undo': {
      const last = state.history[state.history.length - 1];
      if (!last) {
        return state;
      }
      return {
        ...state,
        index: state.index - 1,
        learned: { ...state.learned, [last.id]: last.wasLearned },
        history: state.history.slice(0, -1),
      };
    }

    case 'shuffle':
      return {
        ...state,
        order: [
          ...state.order.slice(0, state.index),
          ...shuffled(
            state.order.slice(state.index),
            action.random ?? Math.random,
          ),
        ],
      };

    case 'toggleSide':
      return { ...state, termFirst: !state.termFirst };

    case 'edit':
      if (!state.cards[action.card.id]) {
        return state;
      }
      return {
        ...state,
        cards: { ...state.cards, [action.card.id]: action.card },
      };

    case 'repeat':
      return {
        ...state,
        order: state.order.filter(id => !state.learned[id]),
        index: 0,
        history: [],
      };
  }
}
