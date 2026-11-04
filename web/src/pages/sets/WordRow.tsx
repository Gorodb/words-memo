import { memo } from 'react';
import { EllipsisVertical, FileText, Volume2 } from 'lucide-react';
import type { Word } from '../../domain/types';
import { speakTerm, speechLocale } from '../../features/speech/speech';
import { IconButton } from '../../ui/Button';
import { useLongPress } from '../../ui/common';
import { showAlert } from '../../ui/dialogs';
import { plural } from '../../utils/plural';

export async function pronounce(term: string, languageCode: string) {
  const result = await speakTerm(term, languageCode);
  if (result === 'noVoice') {
    showAlert(
      'No voice for this language',
      'Your browser or system has no text-to-speech voice for this language. Add one in the system settings (speech / text-to-speech), then reload the page.',
    );
  }
}

/**
 * One word: term, translation, then (tapped open) its examples. A "Description"
 * link opens the Markdown note. "Learned" / "To revise" moves it between the
 * parts, like on the phone. With a mouse, a faint checkbox shows on hover:
 * checking it starts "Select words" with this word.
 */
export const WordRow = memo(function WordRow({
  word,
  expanded,
  selecting,
  selected,
  onToggleSelected,
  onToggleExpanded,
  onToggleLearned,
  onMenu,
  onOpenDescription,
}: {
  word: Word;
  expanded: boolean;
  /** "Select words" mode: a click on the row toggles its checkbox. */
  selecting: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onToggleLearned: () => void;
  onMenu: () => void;
  onOpenDescription: () => void;
}) {
  const learned = word.learnedAt !== null;
  const canSpeak = speechLocale(word.languageCode) !== null;
  const longPress = useLongPress(selecting ? undefined : onMenu);
  return (
    <div
      className={`group flex gap-2 rounded-2xl border bg-surface py-3 pr-1.5 transition select-none ${
        selected ? 'border-primary bg-primary-soft/40' : 'border-line'
      } ${selecting ? 'pl-3' : 'pl-4 pointer-fine:pl-3'}`}
      {...longPress.handlers}
    >
      <input
        type="checkbox"
        aria-label={`Select ${word.term}`}
        title={selecting ? undefined : 'Select for studying'}
        className={`mt-1 size-4.5 shrink-0 cursor-pointer accent-primary transition-opacity ${
          selecting
            ? ''
            : 'hidden opacity-0 group-hover:opacity-50 hover:opacity-100! focus-visible:opacity-100 pointer-fine:block'
        }`}
        checked={selected}
        onChange={onToggleSelected}
      />
      <div
        className="min-w-0 flex-1 cursor-pointer"
        onClick={() => {
          if (longPress.fired.current) {
            longPress.fired.current = false;
            return;
          }
          if (selecting) {
            onToggleSelected();
          } else {
            onToggleExpanded();
          }
        }}
      >
        <div className="flex items-start gap-1">
          <span className="min-w-0 font-semibold break-words">{word.term}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-line break-words text-muted">
          {word.translation}
        </p>
        {expanded && word.examples.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1.5 border-l-2 border-primary/30 pl-3">
            {word.examples.map((example, i) => (
              <li key={i} className="text-sm">
                <span className="italic">{example.text}</span>
                {example.translation ? (
                  <span className="block text-muted">{example.translation}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {(word.examples.length > 0 && !expanded) || word.description ? (
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {word.examples.length > 0 && !expanded ? (
              <span className="text-primary">{plural(word.examples.length, 'example')}</span>
            ) : null}
            {word.description ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-primary hover:underline"
                onClick={e => {
                  e.stopPropagation();
                  onOpenDescription();
                }}
              >
                <FileText size={14} />
                Description
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {selecting ? null : (
        <div className="-mt-1 flex shrink-0 items-start gap-0.5">
          <button
            type="button"
            title={learned ? 'Move to "To learn"' : 'Mark as learned'}
            onClick={onToggleLearned}
            className={`mt-0.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition select-none ${
              learned
                ? 'bg-surface-2 text-fg hover:brightness-95 dark:hover:brightness-125'
                : 'bg-primary text-white hover:brightness-110'
            }`}
          >
            {learned ? 'To revise' : 'Learned'}
          </button>
          {canSpeak ? (
            <IconButton
              icon={Volume2}
              label="Pronounce"
              size={18}
              onClick={() => void pronounce(word.term, word.languageCode)}
            />
          ) : null}
          <IconButton icon={EllipsisVertical} label="Word actions" size={18} onClick={onMenu} />
        </div>
      )}
    </div>
  );
});
