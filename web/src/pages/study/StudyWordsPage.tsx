import { useEffect, useReducer, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import type { ID } from '../../domain/types';
import {
  createStudyWords,
  currentRound,
  currentWord,
  expectedAnswer,
  hintSeed,
  pickStudyWords,
  STUDY_WORDS_ROUNDS,
  studyWordsReducer,
  studyWordsResult,
  type GameWord,
  type StudyWordsState,
} from '../../features/study/studyWords';
import { useGetWordsQuery } from '../../api/api';
import { loadWords, sampleWordsOutsideSet, setLearnedMany } from '../../store/actions';
import { Button } from '../../ui/Button';
import { EmptyState, LabeledDivider, LoadState } from '../../ui/common';
import { attempt } from '../../ui/dialogs';
import { STATUS_CLASSES, StudyShell } from './StudyShell';

/** Wrong options from other sets when the set has too few words. */
const OTHER_POOL = 30;

/** A new game: words to learn (or from `wordIds`), the `first` ones picked first. */
async function newGame(
  setId: ID,
  wordIds: ID[] | undefined,
  first: ID[],
): Promise<StudyWordsState> {
  const [setWords, other] = await Promise.all([
    loadWords(setId),
    sampleWordsOutsideSet(setId, OTHER_POOL),
  ]);
  const byId = new Map(setWords.map(w => [w.id, w]));
  const candidates = wordIds?.length
    ? wordIds.flatMap(id => byId.get(id) ?? [])
    : setWords.filter(w => w.learnedAt === null);
  return createStudyWords(pickStudyWords(candidates, first), { set: setWords, other });
}

/** "Study words": choose the translation, choose the word, write the word. */
export function StudyWordsPage() {
  const { setId = '' } = useParams();
  const { state } = useLocation() as { state: { wordIds?: ID[] } | null };
  const [game, setGame] = useState<{ id: number; state: StudyWordsState } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const start = (wordIds: ID[] | undefined, first: ID[]) => {
    setGame(null);
    setError(null);
    newGame(setId, wordIds, first)
      .then(next => setGame(g => ({ id: (g?.id ?? 0) + 1, state: next })))
      .catch(setError);
  };
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true; // StrictMode runs effects twice
      start(state?.wordIds, []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!game) {
    return (
      <StudyShell title="Study words" closeTo={`/sets/${setId}`}>
        <LoadState loading={!error} error={error} />
      </StudyShell>
    );
  }
  return (
    <Game
      key={game.id}
      setId={setId}
      initial={game.state}
      onContinue={mistakes => start(undefined, mistakes)}
    />
  );
}

function Game({
  setId,
  initial,
  onContinue,
}: {
  setId: ID;
  initial: StudyWordsState;
  onContinue: (mistakes: ID[]) => void;
}) {
  const navigate = useNavigate();
  const [game, dispatch] = useReducer(studyWordsReducer, initial);
  // Refreshed after the learned words are saved: is there more to learn?
  const { data: setWords } = useGetWordsQuery(setId);
  const word = currentWord(game);
  const round = currentRound(game);
  const closeTo = `/sets/${setId}`;

  // At the end, words without any mistake or hint are learned.
  const saved = useRef(false);
  useEffect(() => {
    if (game.finished && !saved.current && game.ids.length > 0) {
      saved.current = true;
      attempt(
        'Could not save the learned words',
        setLearnedMany(studyWordsResult(game).learned.filter(w => !w.learned).map(w => w.id)),
      );
    }
  }, [game]);

  if (game.ids.length === 0) {
    return (
      <StudyShell title="Study words" closeTo={closeTo}>
        <EmptyState title="No words to learn" hint="Add words or reset progress in the set." />
      </StudyShell>
    );
  }

  if (game.finished || !word) {
    const { learned, toLearn } = studyWordsResult(game);
    const close = () =>
      window.history.state?.idx > 0 ? navigate(-1) : navigate(closeTo, { replace: true });
    const hasMore = (setWords ?? []).some(w => w.learnedAt === null);
    return (
      <StudyShell title="Study words" closeTo={closeTo}>
        <div className="flex flex-col items-center gap-2 pt-6 pb-4 text-center">
          <p className="text-4xl">{toLearn.length === 0 ? '🎉' : '💪'}</p>
          <h2 className="text-2xl font-bold">
            {toLearn.length === 0 ? 'Well done!' : 'Round complete'}
          </h2>
          <p className="max-w-md text-muted">
            {toLearn.length === 0
              ? `No mistakes: ${learned.length} ${learned.length === 1 ? 'word is' : 'words are'} marked as learned.`
              : 'Words without a mistake are marked as learned. The others stay to learn.'}
          </p>
        </div>
        {toLearn.length > 0 ? (
          <>
            {learned.length > 0 ? (
              <>
                <LabeledDivider label={`Learned (${learned.length})`} />
                <ResultList words={learned} />
              </>
            ) : null}
            <LabeledDivider label={`To learn (${toLearn.length})`} />
            <ResultList words={toLearn} />
          </>
        ) : null}
        <div className="mt-auto flex flex-wrap justify-center gap-2 pt-8">
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
          {hasMore ? (
            <Button onClick={() => onContinue(game.mistakes)}>Continue learning</Button>
          ) : null}
        </div>
      </StudyShell>
    );
  }

  return (
    <StudyShell
      title={`Round ${game.round + 1} of ${STUDY_WORDS_ROUNDS.length}`}
      counter={`${round.title}${game.repeat ? ' · mistakes again' : ''} · ${game.index + 1} / ${game.queue.length}`}
      closeTo={closeTo}
    >
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width: `${((game.round + game.index / Math.max(game.queue.length, 1)) / STUDY_WORDS_ROUNDS.length) * 100}%`,
          }}
        />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-6 py-6">
        <p className="text-center text-2xl font-bold whitespace-pre-line break-words md:text-3xl">
          {word[round.prompt]}
        </p>
        {round.kind === 'choose' ? (
          <ChooseOptions game={game} onChoose={option => dispatch({ type: 'choose', option })} />
        ) : (
          <WriteAnswer
            key={`${game.round}/${game.repeat}/${game.index}`}
            game={game}
            onCheck={input => dispatch({ type: 'check', input })}
            onHint={input => dispatch({ type: 'hint', input })}
            onMarkCorrect={() => dispatch({ type: 'markCorrect' })}
          />
        )}
      </div>
      <div className="flex min-h-12 justify-end">
        {game.answer ? (
          <Button autoFocus className="w-full sm:w-auto sm:min-w-32" onClick={() => dispatch({ type: 'next' })}>
            Next
          </Button>
        ) : null}
      </div>
    </StudyShell>
  );
}

function ChooseOptions({
  game,
  onChoose,
}: {
  game: StudyWordsState;
  onChoose: (option: string) => void;
}) {
  const word = currentWord(game)!;
  const options = game.options[word.id] ?? [];
  const right = expectedAnswer(game);
  const answer = game.answer?.kind === 'choose' ? game.answer : null;

  // Keys 1–4 pick an option.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (!answer && n >= 1 && n <= options.length && !document.querySelector('[data-sheet]')) {
        onChoose(options[n - 1]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [answer, options, onChoose]);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option, i) => {
        const isRight = option === right;
        const picked = answer?.choice === option;
        const style = !answer
          ? 'border-line bg-surface hover:border-primary'
          : isRight
          ? STATUS_CLASSES.correct
          : picked
          ? STATUS_CLASSES.wrong
          : 'border-line bg-surface opacity-60';
        return (
          <button
            key={option}
            type="button"
            disabled={!!answer}
            onClick={() => onChoose(option)}
            className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left font-medium whitespace-pre-line transition ${style}`}
          >
            <span className="hidden size-6 shrink-0 items-center justify-center rounded-md bg-surface-2 text-xs text-muted sm:flex">
              {i + 1}
            </span>
            <span className="min-w-0 break-words">{option}</span>
          </button>
        );
      })}
    </div>
  );
}

function WriteAnswer({
  game,
  onCheck,
  onHint,
  onMarkCorrect,
}: {
  game: StudyWordsState;
  onCheck: (input: string) => void;
  onHint: (input: string) => void;
  onMarkCorrect: () => void;
}) {
  const [input, setInput] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const answer = game.answer?.kind === 'write' ? game.answer : null;

  // Hint sets the input to the answer's first letters.
  useEffect(() => {
    if (game.revision > 0) {
      setInput(hintSeed(game));
      ref.current?.focus();
    }
    // Only a new Hint (revision) sets the text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.revision]);

  useEffect(() => ref.current?.focus(), []);

  const status = !answer
    ? null
    : answer.correct
    ? answer.hinted
      ? 'assisted'
      : 'correct'
    : 'wrong';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      {status ? (
        <div className={`rounded-xl border-2 px-3 py-2.5 text-lg font-medium ${STATUS_CLASSES[status]}`}>
          {answer!.input || ' '}
        </div>
      ) : (
        <input
          ref={ref}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onCheck(input);
            }
          }}
          placeholder="Type the word"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-xl border-2 border-line bg-surface px-3 py-2.5 text-lg outline-none focus:border-primary"
        />
      )}
      {answer && !answer.correct ? (
        <p className="text-center">
          <span className="text-muted">Right answer: </span>
          <span className="font-semibold text-success">{expectedAnswer(game)}</span>
        </p>
      ) : null}
      {answer?.marked ? (
        <p className="text-center text-sm text-muted">
          {answer.hinted ? 'Marked as correct, but a hint was used: it stays to learn.' : 'Marked as correct.'}
        </p>
      ) : status === 'assisted' ? (
        <p className="text-center text-sm text-assisted">Correct, with a hint: asked again.</p>
      ) : null}
      <div className="flex justify-center gap-2">
        {!answer ? (
          <>
            <Button variant="secondary" onClick={() => onHint(input)}>
              Hint
            </Button>
            <Button onClick={() => onCheck(input)}>Check</Button>
          </>
        ) : !answer.correct ? (
          <Button variant="secondary" onClick={onMarkCorrect}>
            Mark as correct
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ResultList({ words }: { words: GameWord[] }) {
  return (
    <div className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
      {words.map(w => (
        <div key={w.id} className="px-4 py-2.5">
          <p className="font-medium">{w.term}</p>
          <p className="text-sm text-muted">{w.translation}</p>
        </div>
      ))}
    </div>
  );
}
