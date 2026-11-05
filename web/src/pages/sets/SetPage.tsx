import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import {
  CircleEllipsis,
  EllipsisVertical,
  GalleryHorizontalEnd,
  GraduationCap,
  ListChecks,
  Plus,
  ScrollText,
} from 'lucide-react';
import { useGetRulesQuery, useGetSetQuery, useGetWordsQuery } from '../../api/api';
import { PageBody, PageHeader } from '../../app/Layout';
import { useLanguageName } from '../../app/useLanguages';
import { ruleTitle } from '../../domain/rules';
import type { ID, Rule, Word } from '../../domain/types';
import { firstLine } from '../../features/markdown/markdown';
import { STUDY_MODES } from '../../features/study/modes';
import { STUDY_WORDS_COUNT } from '../../features/study/studyWords';
import {
  createRule,
  createWord,
  deleteRule,
  deleteSet,
  deleteWord,
  renameSet,
  resetLearned,
  setFavorite,
  setLearned,
  setSetPinned,
  updateRule,
  updateWord,
} from '../../store/actions';
import { Button, IconButton } from '../../ui/Button';
import { ActionTile, EmptyState, LabeledDivider, LoadState } from '../../ui/common';
import { attempt, errorText, showAlert, showForm, showMenu, showReader } from '../../ui/dialogs';
import { nameForm, ruleForm, wordForm, wordOrRuleForm } from '../../ui/forms';
import { confirmDelete, pinLabel, togglePinned } from '../../ui/itemActions';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { plural, setContents } from '../../utils/plural';
import { shareSetMenuItems } from './shareActions';
import { WordRow } from './WordRow';

type Tab = 'words' | 'rules';

/**
 * True once the page is scrolled down: the sticky header and tiles shrink.
 * Two thresholds, so the height change it causes can't flip it back.
 */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(() => window.scrollY > 48);
  useEffect(() => {
    const onScroll = () =>
      setScrolled(prev => (prev ? window.scrollY > 8 : window.scrollY > 48));
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return scrolled;
}

/**
 * Words of one set: Learn / Flashcards / Study words tiles, then "To learn"
 * and "Learned". When the set has rules, Words / Rules tabs on top.
 */
export function SetPage() {
  const { setId = '' } = useParams();
  const navigate = useNavigate();
  const { data: set, error, isLoading } = useGetSetQuery(setId);
  const wordsQuery = useGetWordsQuery(setId);
  const rulesQuery = useGetRulesQuery(setId);
  const words = useMemo(() => wordsQuery.data ?? [], [wordsQuery.data]);
  const rules = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);
  const loaded = !!wordsQuery.data && !!rulesQuery.data;
  const languageName = useLanguageName(set?.languageCode);

  const [expanded, setExpanded] = useState<ReadonlySet<ID>>(new Set());
  /** null = normal mode; a set of ids = "Select words" mode. */
  const [selected, setSelected] = useState<ReadonlySet<ID> | null>(null);
  const [tab, setTab] = useState<Tab>('words');
  // A set with rules but no words opens on the Rules tab.
  const tabInitialized = useRef(false);
  useEffect(() => {
    if (!tabInitialized.current && loaded) {
      tabInitialized.current = true;
      if (words.length === 0 && rules.length > 0) {
        setTab('rules');
      }
    }
  }, [loaded, words, rules]);
  const [query, setQuery] = useState('');
  const scrolled = useScrolled();
  const hasRules = rules.length > 0;
  const activeTab: Tab = hasRules && !selected ? tab : 'words';

  // Escape leaves "Select words".
  const selecting = selected !== null;
  useEffect(() => {
    if (!selecting) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[data-sheet]')) {
        setSelected(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selecting]);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return q
      ? words.filter(
          w =>
            w.term.toLocaleLowerCase().includes(q) ||
            w.translation.toLocaleLowerCase().includes(q),
        )
      : words;
  }, [words, query]);
  const toLearn = shown.filter(w => w.learnedAt === null);
  const learned = shown.filter(w => w.learnedAt !== null);
  const toLearnCount = words.filter(w => w.learnedAt === null).length;

  const openWordForm = useCallback(
    (word?: Word) => {
      if (!set) {
        return;
      }
      const options = wordForm({
        title: word ? 'Edit word' : 'New word',
        languageCode: set.languageCode,
        initial: word,
        wordId: word?.id,
        onSubmit: async input => {
          if (word) {
            await updateWord(word.id, input);
          } else {
            await createWord(set.id, input);
            setTab('words');
          }
        },
      });
      if (word) {
        showForm(options);
        return;
      }
      showForm(
        wordOrRuleForm({
          word: options,
          rule: ruleForm({
            title: 'New rule',
            onSubmit: async input => {
              await createRule(set.id, input);
              setTab('rules');
            },
          }),
          ruleFirst: activeTab === 'rules',
        }),
      );
    },
    [set, activeTab],
  );

  const wordMenu = useCallback(
    (word: Word) =>
      showMenu({
        title: word.term,
        items: [
          { label: 'Edit', onPress: () => openWordForm(word) },
          {
            label: word.learnedAt === null ? 'Mark as learned' : 'Move to "To learn"',
            onPress: () =>
              attempt('Could not save', setLearned(word.id, word.learnedAt === null)),
          },
          {
            label: 'Delete',
            destructive: true,
            onPress: () =>
              confirmDelete(word.term, 'The word will be deleted.', () =>
                deleteWord(word.id),
              ),
          },
        ],
      }),
    [openWordForm],
  );

  const ruleMenu = (rule: Rule) =>
    showMenu({
      title: ruleTitle(rule),
      items: [
        {
          label: 'Edit',
          onPress: () =>
            showForm(
              ruleForm({
                title: 'Edit rule',
                initial: rule,
                onSubmit: input => updateRule(rule.id, input),
              }),
            ),
        },
        {
          label: 'Delete',
          destructive: true,
          onPress: () =>
            confirmDelete(ruleTitle(rule), 'The rule will be deleted.', () =>
              deleteRule(rule.id),
            ),
        },
      ],
    });

  if (!set) {
    // Deleted (maybe on another device): back to the list.
    return (error as { status?: number } | undefined)?.status === 404 ? (
      <Navigate to="/sets" replace />
    ) : (
      <>
        <PageHeader title="Set" back="/sets" />
        <LoadState loading={isLoading} error={error} />
      </>
    );
  }

  const startStudy = (wordIds: ID[]) =>
    showMenu({
      title: 'Study mode',
      items: [
        ...STUDY_MODES.map(mode => ({
          label: mode.title,
          onPress: () => {
            setSelected(null);
            navigate(`/sets/${set.id}/study/${mode.id}`, { state: { wordIds } });
          },
        })),
        {
          label: 'Study words',
          onPress: () => {
            setSelected(null);
            navigate(`/sets/${set.id}/study-words`, { state: { wordIds } });
          },
        },
      ],
    });

  /** Study modes over the words to learn, or the whole set once all are learned. */
  const openLearn = () => {
    const notLearned = words.filter(w => w.learnedAt === null);
    startStudy((notLearned.length > 0 ? notLearned : words).map(w => w.id));
  };

  /** Flashcards and Study words take the words to learn; offer a reset when there are none. */
  const openGame = (path: 'flashcards' | 'study-words', name: string) => {
    if (toLearnCount > 0) {
      navigate(`/sets/${set.id}/${path}`);
      return;
    }
    showAlert(
      'All words are learned',
      `${name} ${
        path === 'flashcards' ? 'show' : 'picks'
      } the words to learn. Reset progress to go through the whole set again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset and start',
          onPress: () =>
            resetLearned(set.id)
              .then(() => navigate(`/sets/${set.id}/${path}`))
              .catch(e => showAlert('Could not reset progress', errorText(e))),
        },
      ],
    );
  };

  const confirmResetLearned = () => {
    const count = words.filter(w => w.learnedAt !== null).length;
    showAlert(
      'Reset progress?',
      `${plural(count, 'learned word')} will be marked as not learned.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => attempt('Could not reset progress', resetLearned(set.id)),
        },
      ],
    );
  };

  const openSetMenu = () => {
    const notLearned = words.filter(w => w.learnedAt === null);
    showMenu({
      title: set.name,
      items: [
        {
          label: pinLabel(set.pinnedAt),
          onPress: () => void togglePinned(setSetPinned, set),
        },
        {
          label: 'Edit set',
          onPress: () =>
            showForm(
              nameForm({
                title: 'Rename set',
                placeholder: 'Set name',
                initialValue: set.name,
                onSubmit: name => renameSet(set.id, name),
              }),
            ),
        },
        {
          label: 'Share set',
          disabled: words.length === 0 && !hasRules,
          onPress: () =>
            showMenu({ title: `Share "${set.name}"`, items: shareSetMenuItems(set) }),
        },
        {
          label: 'Select words',
          disabled: words.length === 0,
          onPress: () => setSelected(new Set()),
        },
        {
          label: 'Study set',
          disabled: words.length === 0,
          onPress: () => startStudy(words.map(w => w.id)),
        },
        {
          label: 'Study not learned',
          disabled: notLearned.length === 0,
          onPress: () => startStudy(notLearned.map(w => w.id)),
        },
        {
          label: 'Reset progress',
          destructive: true,
          disabled: words.length === notLearned.length,
          onPress: confirmResetLearned,
        },
        {
          label: 'Delete set',
          destructive: true,
          onPress: () =>
            confirmDelete(
              set.name,
              set.wordCount > 0 || set.ruleCount > 0
                ? `${setContents(set)} will be deleted, and the set will be removed from all folders.`
                : 'The set will be removed from all folders.',
              async () => {
                await deleteSet(set.id);
                navigate('/sets', { replace: true });
              },
            ),
        },
      ],
    });
  };

  const toggle = (ids: ReadonlySet<ID>, id: ID) => {
    const next = new Set(ids);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  };

  // Study selected words in list order.
  const selectedIds = words.filter(w => selected?.has(w.id)).map(w => w.id);
  const allSelected = !!selected && words.length > 0 && selected.size === words.length;

  const renderWord = (word: Word) => (
    <WordRow
      key={word.id}
      word={word}
      expanded={expanded.has(word.id)}
      onToggleExpanded={() => setExpanded(prev => toggle(prev, word.id))}
      onToggleLearned={() =>
        attempt('Could not save', setLearned(word.id, word.learnedAt === null))
      }
      onToggleFavorite={() =>
        attempt('Could not save', setFavorite(word.id, word.favoriteAt === null))
      }
      onMenu={() => wordMenu(word)}
      onOpenDescription={() => showReader({ title: word.term, text: word.description })}
      selecting={selecting}
      selected={!!selected?.has(word.id)}
      // The hover checkbox starts "Select words" with this word.
      onToggleSelected={() => setSelected(prev => toggle(prev ?? new Set(), word.id))}
    />
  );

  const showTiles = activeTab === 'words' && loaded && words.length > 0 && !selected;

  return (
    <>
      <div
        className={`sticky top-0 z-20 bg-bg/90 backdrop-blur transition-[border-color] ${
          scrolled ? 'border-b border-line' : 'border-b border-transparent'
        }`}
      >
        <PageHeader
          embedded
          compact={scrolled}
          title={set.name}
          subtitle={languageName}
          back="/sets"
          actions={
            selected ? (
              <Button
                variant="ghost"
                onClick={() =>
                  setSelected(allSelected ? new Set() : new Set(words.map(w => w.id)))
                }
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </Button>
            ) : (
              <>
                <IconButton icon={Plus} label="Add word or rule" onClick={() => openWordForm()} />
                <IconButton icon={CircleEllipsis} label="Set actions" onClick={openSetMenu} />
              </>
            )
          }
        />
        {showTiles ? (
          <div
            className={`mx-auto grid max-w-3xl gap-2 px-3 transition-all md:px-6 ${
              scrolled
                ? 'grid-cols-3 pb-2'
                : 'grid-cols-2 pt-1 pb-2 sm:grid-cols-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1'
            }`}
          >
            <ActionTile
              icon={GraduationCap}
              title="Learn"
              subtitle={`${STUDY_MODES.length + 1} study modes`}
              compact={scrolled}
              onPress={openLearn}
            />
            <ActionTile
              icon={GalleryHorizontalEnd}
              title="Flashcards"
              subtitle={toLearnCount > 0 ? `${toLearnCount} to learn` : 'All learned'}
              compact={scrolled}
              onPress={() => openGame('flashcards', 'Flashcards')}
            />
            <ActionTile
              icon={ListChecks}
              title="Study words"
              subtitle={
                toLearnCount > 0
                  ? `${Math.min(toLearnCount, STUDY_WORDS_COUNT)} words · choose, then write`
                  : 'All learned'
              }
              compact={scrolled}
              onPress={() => openGame('study-words', 'Study words')}
            />
          </div>
        ) : null}
      </div>
      <PageBody>
        {hasRules && !selected ? (
          <div className="pb-3">
            <SegmentedControl
              labels={[`Words (${words.length})`, `Rules (${rules.length})`]}
              selectedIndex={activeTab === 'words' ? 0 : 1}
              onChange={i => setTab(i === 0 ? 'words' : 'rules')}
            />
          </div>
        ) : null}

        {activeTab === 'rules' ? (
          <div className="flex flex-col gap-2">
            {rules.map((rule, i) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                number={i + 1}
                onOpen={() => showReader({ title: ruleTitle(rule), text: rule.text })}
                onMenu={() => ruleMenu(rule)}
              />
            ))}
          </div>
        ) : !loaded ? (
          <LoadState loading={wordsQuery.isLoading} error={wordsQuery.error} />
        ) : words.length === 0 ? (
          <EmptyState
            title="No words yet"
            hint="Add a word with its translation, examples and notes, or a grammar rule."
            action={
              <Button icon={Plus} onClick={() => openWordForm()}>
                Add word or rule
              </Button>
            }
          />
        ) : (
          <>
            {words.length > 8 ? (
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search words"
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-primary"
              />
            ) : null}
            {toLearn.length > 0 ? (
              <>
                <LabeledDivider label={`To learn (${toLearn.length})`} />
                <div className="flex flex-col gap-2">{toLearn.map(renderWord)}</div>
              </>
            ) : null}
            {learned.length > 0 ? (
              <>
                <LabeledDivider label={`Learned (${learned.length})`} />
                <div className="flex flex-col gap-2">{learned.map(renderWord)}</div>
              </>
            ) : null}
            {shown.length === 0 ? (
              <p className="py-10 text-center text-muted">No words match "{query}".</p>
            ) : null}
          </>
        )}
        {selected ? <div className="h-20" /> : null}
      </PageBody>

      {selected ? (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface md:bottom-0 md:left-64">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-3 py-2 md:px-6">
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button disabled={selectedIds.length === 0} onClick={() => startStudy(selectedIds)}>
              Study ({selectedIds.length})
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** A rule in the Rules tab: number, title and a "More…" link to the whole text. */
function RuleCard({
  rule,
  number,
  onOpen,
  onMenu,
}: {
  rule: Rule;
  number: number;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const preview = rule.title ? firstLine(rule.text) : '';
  return (
    <div className="flex gap-3 rounded-2xl border border-line bg-surface py-3 pr-1.5 pl-4">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 gap-3 text-left">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-sm font-semibold text-primary">
          {number}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold break-words">{ruleTitle(rule)}</span>
          {preview ? <span className="block truncate text-sm text-muted">{preview}</span> : null}
          <span className="mt-1 inline-flex items-center gap-1 text-sm text-primary">
            <ScrollText size={14} />
            More…
          </span>
        </span>
      </button>
      <IconButton icon={EllipsisVertical} label="Rule actions" size={18} onClick={onMenu} />
    </div>
  );
}
