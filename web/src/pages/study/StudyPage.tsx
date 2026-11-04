import { useEffect, useReducer, useRef, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { EyeOff, Shuffle } from 'lucide-react';
import { useGetWordsQuery } from '../../api/api';
import type { ID, Word } from '../../domain/types';
import { STUDY_MODES, type StudyModeId } from '../../features/study/modes';
import {
  createSession,
  hintText,
  isLearnedInSession,
  sessionReducer,
  visibleIds,
  type CardProgress,
  type SessionAction,
  type StudyCard,
} from '../../features/study/session';
import { setLearned } from '../../store/actions';
import { Button } from '../../ui/Button';
import { EmptyState, LoadState } from '../../ui/common';
import { attempt as report } from '../../ui/dialogs';
import { STATUS_CLASSES, StudyShell } from './StudyShell';

/** Words of the session: the ids it was opened with, else the set's words to learn (or all). */
function sessionWords(all: Word[], wordIds?: ID[]): Word[] {
  if (wordIds?.length) {
    const byId = new Map(all.map(w => [w.id, w]));
    return wordIds.flatMap(id => byId.get(id) ?? []);
  }
  const toLearn = all.filter(w => w.learnedAt === null);
  return toLearn.length ? toLearn : all;
}

/** One study session in one mode (reveal or write), over a list of cards. */
export function StudyPage() {
  const { setId = '', modeId } = useParams();
  const mode = STUDY_MODES.find(m => m.id === (modeId as StudyModeId));
  const { state } = useLocation() as { state: { wordIds?: ID[] } | null };
  /** Bumped by Restart: a new session over the same words. */
  const [run, setRun] = useState(0);
  const { data: words, error, isLoading } = useGetWordsQuery(setId);
  /** The words at the start: later changes (e.g. Learned) don't reshuffle the session. */
  const [snapshot, setSnapshot] = useState<{ run: number; words: Word[] } | null>(null);
  useEffect(() => {
    if (words && snapshot?.run !== run) {
      setSnapshot({ run, words: sessionWords(words, state?.wordIds) });
    }
  }, [words, run, snapshot, state]);
  if (!mode) {
    return <Navigate to={`/sets/${setId}`} replace />;
  }
  if (!snapshot || snapshot.run !== run) {
    return (
      <StudyShell title={mode.title} closeTo={`/sets/${setId}`}>
        <LoadState loading={isLoading || !error} error={error} />
      </StudyShell>
    );
  }
  return (
    <Session
      key={`${mode.id}/${run}`}
      setId={setId}
      modeIndex={STUDY_MODES.indexOf(mode)}
      words={snapshot.words}
      onRestart={() => setRun(r => r + 1)}
    />
  );
}

function Session({
  setId,
  modeIndex,
  words,
  onRestart,
}: {
  setId: ID;
  modeIndex: number;
  words: Word[];
  onRestart: () => void;
}) {
  const mode = STUDY_MODES[modeIndex];
  const [session, dispatch] = useReducer(sessionReducer, undefined, () =>
    createSession(mode, words),
  );
  const visible = visibleIds(session);
  const total = session.order.length;
  const learnedNow = visible.filter(id => isLearnedInSession(session.progress[id])).length;

  if (total === 0) {
    return (
      <StudyShell title={mode.title} closeTo={`/sets/${setId}`}>
        <EmptyState title="No words to study" />
      </StudyShell>
    );
  }

  return (
    <StudyShell
      title={mode.title}
      counter={`${visible.length} of ${total} words${
        session.hidden.length ? ` · ${session.hidden.length} hidden` : ''
      }`}
      closeTo={`/sets/${setId}`}
      actions={
        <>
          <Button
            variant="ghost"
            icon={Shuffle}
            className="px-2.5"
            onClick={() => dispatch({ type: 'shuffle' })}
          >
            Shuffle
          </Button>
          {mode.kind === 'write' ? (
            // Reveal modes only flip cards: nothing to hide there.
            <Button
              variant="ghost"
              icon={EyeOff}
              className="px-2.5"
              disabled={learnedNow === 0}
              onClick={() => dispatch({ type: 'hideLearned' })}
            >
              <span className="hidden sm:inline">Hide learned</span>
            </Button>
          ) : null}
        </>
      }
    >
      <p className="pb-3 text-sm text-muted">{mode.description}</p>
      {visible.length === 0 ? (
        <EmptyState
          title="All words are hidden"
          action={
            <Button onClick={onRestart}>Restart</Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map(id =>
            mode.kind === 'reveal' ? (
              <RevealCard
                key={id}
                card={session.cards[id]}
                progress={session.progress[id]}
                dispatch={dispatch}
              />
            ) : (
              <WriteCard
                key={id}
                card={session.cards[id]}
                progress={session.progress[id]}
                dispatch={dispatch}
              />
            ),
          )}
        </div>
      )}
    </StudyShell>
  );
}

/** Click: reveal / hide the answer. Every card starts hidden. */
function RevealCard({
  card,
  progress,
  dispatch,
}: {
  card: StudyCard;
  progress: CardProgress;
  dispatch: (action: SessionAction) => void;
}) {
  const revealed = progress.kind === 'reveal' && progress.revealed;
  return (
    <button
      type="button"
      aria-expanded={revealed}
      onClick={() => dispatch({ type: 'toggleReveal', id: card.id })}
      className={`w-full rounded-2xl border bg-surface px-4 py-4 text-left transition hover:border-primary/50 ${
        revealed ? 'border-primary/40' : 'border-line'
      }`}
    >
      <span className="block text-lg font-semibold whitespace-pre-line break-words">
        {card.prompt}
      </span>
      {revealed ? (
        <span className="mt-2 block font-medium whitespace-pre-line break-words text-primary">
          {card.answer}
        </span>
      ) : (
        <span className="mt-2 block text-sm text-muted select-none">Click to reveal</span>
      )}
    </button>
  );
}

const PEEK_DELAY_MS = 400;

/**
 * Type the answer. Hint adds the next letter (holding it shows the whole
 * answer); Check compares the whole string, ignoring case.
 */
function WriteCard({
  card,
  progress,
  dispatch,
}: {
  card: StudyCard;
  progress: CardProgress;
  dispatch: (action: SessionAction) => void;
}) {
  const p = progress.kind === 'write' ? progress : null;
  const [input, setInput] = useState('');
  const [peeking, setPeeking] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peeked = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const revision = p?.revision ?? 0;
  const attempt = p?.attempt ?? 0;
  const hints = p?.hints ?? 0;

  // Hint sets the input to the answer's first letters; Try again empties it.
  useEffect(() => {
    if (revision > 0) {
      setInput(hintText(card.answer, hints));
    }
    // Only a new Hint (revision) sets the text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);
  useEffect(() => {
    if (attempt > 0) {
      setInput('');
      inputRef.current?.focus();
    }
  }, [attempt]);

  if (!p) {
    return null;
  }

  const status = p.status;
  const done = status !== 'idle';
  const check = () => dispatch({ type: 'check', id: card.id, input });

  const startHint = () => {
    peeked.current = false;
    peekTimer.current = setTimeout(() => {
      peeked.current = true;
      setPeeking(true);
      dispatch({ type: 'peek', id: card.id });
    }, PEEK_DELAY_MS);
  };
  const endHint = (apply: boolean) => {
    if (peekTimer.current) {
      clearTimeout(peekTimer.current);
      peekTimer.current = null;
    }
    setPeeking(false);
    if (apply && !peeked.current) {
      dispatch({ type: 'hint', id: card.id, input });
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className={`rounded-2xl border bg-surface p-4 ${
        done ? STATUS_CLASSES[status].split(' ')[0] : 'border-line'
      }`}
    >
      <p className="text-lg font-semibold whitespace-pre-line break-words">{card.prompt}</p>
      <div className="relative mt-3">
        {done ? (
          <div className={`rounded-xl border px-3 py-2.5 font-medium ${STATUS_CLASSES[status]}`}>
            {input || ' '}
          </div>
        ) : (
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                check();
              }
            }}
            placeholder="Type the answer"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        )}
        {peeking ? (
          <div className="absolute inset-0 flex items-center rounded-xl bg-primary-soft px-3 font-medium text-primary">
            {card.answer}
          </div>
        ) : null}
      </div>
      {status === 'wrong' ? (
        <p className="mt-2 text-sm">
          <span className="text-muted">Right answer: </span>
          <span className="font-semibold text-success">{card.answer}</span>
        </p>
      ) : null}
      {status === 'assisted' ? (
        <p className="mt-2 text-sm text-assisted">Correct, with a hint.</p>
      ) : null}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {status === 'idle' ? (
          <>
            <Button
              variant="secondary"
              title="Click for the next letter, hold to see the answer"
              onPointerDown={startHint}
              onPointerUp={() => endHint(true)}
              onPointerLeave={() => endHint(false)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  dispatch({ type: 'hint', id: card.id, input });
                }
              }}
            >
              Hint
            </Button>
            <Button onClick={check}>Check</Button>
          </>
        ) : null}
        {status === 'wrong' ? (
          <Button variant="secondary" onClick={() => dispatch({ type: 'markCorrect', id: card.id })}>
            Mark as correct
          </Button>
        ) : null}
        {status === 'correct' ? (
          <>
            <Button variant="secondary" onClick={() => dispatch({ type: 'hide', id: card.id })}>
              Hide
            </Button>
            <Button
              onClick={() => {
                report('Could not save', setLearned(card.id, true));
                dispatch({ type: 'hide', id: card.id });
              }}
            >
              Learned
            </Button>
          </>
        ) : null}
        {status === 'wrong' || status === 'assisted' ? (
          <Button onClick={() => dispatch({ type: 'retry', id: card.id })}>Try again</Button>
        ) : null}
      </div>
    </div>
  );
}
