import { useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeftRight,
  Check,
  Pencil,
  Shuffle,
  Undo2,
  Volume2,
  X,
} from 'lucide-react';
import type { ID } from '../../domain/types';
import { speechLocale } from '../../features/speech/speech';
import {
  createFlashcards,
  currentCard,
  flashcardsReducer,
  isFinished,
  learnedWrite,
  roundStats,
  type FlashcardsAction,
} from '../../features/study/flashcards';
import { useGetWordsQuery } from '../../api/api';
import type { Word } from '../../domain/types';
import { setLearned, updateWord } from '../../store/actions';
import { Button, IconButton } from '../../ui/Button';
import { EmptyState, LoadState } from '../../ui/common';
import { attempt, showForm } from '../../ui/dialogs';
import { wordForm } from '../../ui/forms';
import { pronounce } from '../sets/WordRow';
import { StudyShell } from './StudyShell';

/** Drag further than this (px) to answer. */
const SWIPE_DISTANCE = 110;

/**
 * Flashcards over the set's words to learn. The card shows the translation;
 * click (or Space) flips it. Swipe or press → for learned, ← for to learn:
 * both write the Learned flag.
 */
export function FlashcardsPage() {
  const { setId = '' } = useParams();
  const { data: words, error, isLoading } = useGetWordsQuery(setId);
  /** The words to learn when the game opened; swipes don't remove cards from it. */
  const [cards, setCards] = useState<Word[] | null>(null);
  useEffect(() => {
    if (words && !cards) {
      setCards(words.filter(w => w.learnedAt === null));
    }
  }, [words, cards]);
  if (!cards) {
    return (
      <StudyShell title="Flashcards" closeTo={`/sets/${setId}`}>
        <LoadState loading={isLoading || !error} error={error} />
      </StudyShell>
    );
  }
  return <Flashcards setId={setId} initial={cards} current={words ?? cards} />;
}

function Flashcards({
  setId,
  initial,
  current,
}: {
  setId: ID;
  initial: Word[];
  /** The set's words now (for editing a card). */
  current: Word[];
}) {
  const navigate = useNavigate();
  const [state, rawDispatch] = useReducer(flashcardsReducer, initial, createFlashcards);
  const [flipped, setFlipped] = useState(false);
  const closeTo = `/sets/${setId}`;
  const languageCode = initial[0]?.languageCode ?? '';
  const card = currentCard(state);
  const finished = isFinished(state);

  const stateRef = useRef(state);
  stateRef.current = state;
  /** Writes the Learned change the action makes, then updates the game. */
  const dispatch = (action: FlashcardsAction) => {
    const write = learnedWrite(stateRef.current, action);
    if (write) {
      attempt('Could not save', setLearned(write.id, write.learned));
    }
    rawDispatch(action);
    if (action.type === 'swipe' || action.type === 'undo' || action.type === 'repeat') {
      setFlipped(false);
    }
  };
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const edit = (id: ID) => {
    const word = current.find(w => w.id === id);
    if (!word) {
      return;
    }
    showForm(
      wordForm({
        title: 'Edit word',
        languageCode: word.languageCode,
        initial: word,
        wordId: word.id,
        onSubmit: async input => {
          await updateWord(word.id, input);
          rawDispatch({
            type: 'edit',
            card: { id: word.id, term: input.term.trim(), translation: input.translation.trim() },
          });
        },
      }),
    );
  };

  // Keyboard: ←/→ answer, Space flips, Backspace / Ctrl+Z undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[data-sheet]') || e.target instanceof HTMLInputElement) {
        return;
      }
      const run = dispatchRef.current;
      if (e.key === 'ArrowRight') {
        run({ type: 'swipe', learned: true });
      } else if (e.key === 'ArrowLeft') {
        run({ type: 'swipe', learned: false });
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped(f => !f);
      } else if (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) {
        run({ type: 'undo' });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (state.order.length === 0) {
    return (
      <StudyShell title="Flashcards" closeTo={closeTo}>
        <EmptyState title="No words to learn" hint="Every word of this set is learned." />
      </StudyShell>
    );
  }

  const total = state.order.length;
  const stats = roundStats(state);
  const front = state.termFirst ? 'term' : 'translation';
  const back = state.termFirst ? 'translation' : 'term';

  return (
    <StudyShell
      title="Flashcards"
      counter={`${Math.min(state.index + 1, total)} / ${total}`}
      closeTo={closeTo}
      actions={
        <>
          <IconButton
            icon={ArrowLeftRight}
            label={state.termFirst ? 'Show the translation first' : 'Show the word first'}
            onClick={() => {
              rawDispatch({ type: 'toggleSide' });
              setFlipped(false);
            }}
          />
          <IconButton
            icon={Shuffle}
            label="Shuffle the cards left"
            disabled={finished}
            onClick={() => {
              rawDispatch({ type: 'shuffle' });
              setFlipped(false);
            }}
          />
        </>
      }
    >
      {finished || !card ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <h2 className="text-2xl font-bold">
            {stats.toLearn === 0 ? 'All learned!' : 'Round complete'}
          </h2>
          <p className="text-muted">
            {stats.learned} learned · {stats.toLearn} to learn
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" icon={Undo2} onClick={() => dispatch({ type: 'undo' })}>
              Undo
            </Button>
            {stats.toLearn > 0 ? (
              <Button onClick={() => dispatch({ type: 'repeat' })}>
                Repeat {stats.toLearn} to learn
              </Button>
            ) : (
              <Button onClick={() => navigate(closeTo, { replace: true })}>Done</Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-between px-1 pb-2 text-sm">
            <span className="text-danger">{stats.toLearn} to learn</span>
            <span className="text-success">{stats.learned} learned</span>
          </div>
          <SwipeCard
            key={card.id + '/' + state.index}
            flipped={flipped}
            onFlip={() => setFlipped(f => !f)}
            onSwipe={learned => dispatch({ type: 'swipe', learned })}
            front={card[front]}
            back={card[back]}
            frontLabel={front === 'term' ? 'Word' : 'Translation'}
            backLabel={back === 'term' ? 'Word' : 'Translation'}
            speaker={
              speechLocale(languageCode)
                ? { side: front === 'term' ? 'front' : 'back', speak: () => void pronounce(card.term, languageCode) }
                : null
            }
            onEdit={() => edit(card.id)}
          />
          <div className="flex items-center justify-center gap-3 pt-5">
            <Button
              variant="secondary"
              className="min-w-28 text-danger"
              icon={X}
              onClick={() => dispatch({ type: 'swipe', learned: false })}
            >
              To learn
            </Button>
            <IconButton
              icon={Undo2}
              label="Undo"
              disabled={state.history.length === 0}
              onClick={() => dispatch({ type: 'undo' })}
            />
            <Button
              variant="secondary"
              className="min-w-28 text-success"
              icon={Check}
              onClick={() => dispatch({ type: 'swipe', learned: true })}
            >
              Learned
            </Button>
          </div>
          <p className="hidden pt-4 text-center text-xs text-muted md:block">
            Space flips · → learned · ← to learn · Backspace undoes
          </p>
        </>
      )}
    </StudyShell>
  );
}

function SwipeCard({
  front,
  back,
  frontLabel,
  backLabel,
  flipped,
  onFlip,
  onSwipe,
  speaker,
  onEdit,
}: {
  front: string;
  back: string;
  frontLabel: string;
  backLabel: string;
  flipped: boolean;
  onFlip: () => void;
  onSwipe: (learned: boolean) => void;
  speaker: { side: 'front' | 'back'; speak: () => void } | null;
  onEdit: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const moved = useRef(false);

  const finish = (learned: boolean) => {
    setLeaving(learned ? 1 : -1);
    setTimeout(() => onSwipe(learned), 180);
  };

  const offset = leaving ? leaving * window.innerWidth : dx;
  const tint = Math.min(Math.abs(dx) / SWIPE_DISTANCE, 1);

  const face = (text: string, label: string, side: 'front' | 'back') => (
    <div
      className="absolute inset-0 flex flex-col rounded-3xl border border-line bg-surface p-5 shadow-sm [backface-visibility:hidden]"
      style={side === 'back' ? { transform: 'rotateY(180deg)' } : undefined}
      // The hidden face takes no clicks (its buttons sit under the visible one).
      aria-hidden={(side === 'back') !== flipped}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</span>
        <div className="flex" style={{ pointerEvents: (side === 'back') === flipped ? 'auto' : 'none' }}>
          {speaker?.side === side ? (
            <IconButton
              icon={Volume2}
              label="Pronounce"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                speaker.speak();
              }}
            />
          ) : null}
          <IconButton
            icon={Pencil}
            label="Edit word"
            size={18}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              onEdit();
            }}
          />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-y-auto">
        <p className="text-center text-2xl font-bold whitespace-pre-line break-words md:text-3xl">
          {text}
        </p>
      </div>
      <p className="text-center text-xs text-muted">Click to flip</p>
    </div>
  );

  return (
    <div
      className="relative mx-auto aspect-[4/5] max-h-[58dvh] w-full max-w-md touch-pan-y select-none [perspective:1200px]"
      style={{
        transform: `translateX(${offset}px) rotate(${offset / 25}deg)`,
        transition: start.current ? 'none' : 'transform 180ms ease-out',
        opacity: leaving ? 0 : 1,
      }}
      onPointerDown={e => {
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        moved.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={e => {
        if (!start.current || start.current.id !== e.pointerId) {
          return;
        }
        const x = e.clientX - start.current.x;
        if (Math.abs(x) > 6) {
          moved.current = true;
        }
        setDx(x);
      }}
      onPointerUp={() => {
        if (!start.current) {
          return; // pressed a button on the card
        }
        const x = dx;
        start.current = null;
        if (Math.abs(x) >= SWIPE_DISTANCE) {
          finish(x > 0);
        } else {
          setDx(0);
          if (!moved.current) {
            onFlip();
          }
        }
      }}
      onPointerCancel={() => {
        start.current = null;
        setDx(0);
      }}
    >
      <div
        className="relative h-full w-full transition-transform duration-300 [transform-style:preserve-3d]"
        style={{ transform: flipped ? 'rotateY(180deg)' : undefined }}
      >
        {face(front, frontLabel, 'front')}
        {face(back, backLabel, 'back')}
      </div>
      {dx !== 0 ? (
        <div
          className={`pointer-events-none absolute top-5 rounded-xl border-2 px-3 py-1 text-sm font-bold uppercase ${
            dx > 0 ? 'left-5 border-success text-success' : 'right-5 border-danger text-danger'
          }`}
          style={{ opacity: tint }}
        >
          {dx > 0 ? 'Learned' : 'To learn'}
        </div>
      ) : null}
    </div>
  );
}
