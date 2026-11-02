import { memo } from 'react';
import {
  CircleCheck,
  Circle,
  EllipsisVertical,
  FileText,
  Volume2,
} from 'lucide-react';
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
 * link opens the Markdown note. The circle marks it learned or to learn.
 */
export const WordRow = memo(function WordRow({
  word,
  expanded,
  selection,
  onToggleExpanded,
  onToggleLearned,
  onMenu,
  onOpenDescription,
}: {
  word: Word;
  expanded: boolean;
  /** Present in "Select words" mode. */
  selection?: { selected: boolean; onToggle: () => void };
  onToggleExpanded: () => void;
  onToggleLearned: () => void;
  onMenu: () => void;
  onOpenDescription: () => void;
}) {
  const learned = word.learnedAt !== null;
  const canSpeak = speechLocale(word.languageCode) !== null;
  const longPress = useLongPress(selection ? undefined : onMenu);
  return (
    <div
      className={`flex gap-2 rounded-2xl border bg-surface py-3 pr-1.5 pl-4 transition select-none ${
        selection?.selected ? 'border-primary bg-primary-soft/40' : 'border-line'
      }`}
      {...longPress.handlers}
    >
      {selection ? (
        <input
          type="checkbox"
          aria-label={`Select ${word.term}`}
          className="mt-1 size-5 shrink-0 accent-primary"
          checked={selection.selected}
          onChange={selection.onToggle}
        />
      ) : null}
      <div
        className="min-w-0 flex-1 cursor-pointer"
        onClick={() => {
          if (longPress.fired.current) {
            longPress.fired.current = false;
            return;
          }
          if (selection) {
            selection.onToggle();
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
      {selection ? null : (
        <div className="-mt-1 flex shrink-0 items-start">
          <IconButton
            icon={learned ? CircleCheck : Circle}
            label={learned ? 'Learned. Move to "To learn"' : 'Mark as learned'}
            active={learned}
            className={learned ? 'text-success hover:text-success' : ''}
            onClick={onToggleLearned}
          />
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
