/**
 * Study modes registry. New modes are added here; StudyScreen renders a mode
 * by its `kind`, so a new kind also needs a card renderer there.
 */
export type StudyModeId =
  | 'translation-word'
  | 'word-translation'
  | 'write-word'
  | 'write-translation';

export type WordSide = 'term' | 'translation';

export interface StudyMode {
  id: StudyModeId;
  title: string;
  description: string;
  /** reveal: tap to show/hide the answer; write: type and check it. */
  kind: 'reveal' | 'write';
  /** Side shown to the user. */
  prompt: WordSide;
  /** Side the user has to recall. */
  answer: WordSide;
}

export const STUDY_MODES: StudyMode[] = [
  {
    id: 'translation-word',
    title: 'Translation → word',
    description: 'See the translation, tap to reveal the word.',
    kind: 'reveal',
    prompt: 'translation',
    answer: 'term',
  },
  {
    id: 'word-translation',
    title: 'Word → translation',
    description: 'See the word, tap to reveal the translation.',
    kind: 'reveal',
    prompt: 'term',
    answer: 'translation',
  },
  {
    id: 'write-word',
    title: 'Writing the word',
    description: 'See the translation and type the word.',
    kind: 'write',
    prompt: 'translation',
    answer: 'term',
  },
  {
    id: 'write-translation',
    title: 'Writing the translation',
    description: 'See the word and type the translation.',
    kind: 'write',
    prompt: 'term',
    answer: 'translation',
  },
];

export function studyMode(id: StudyModeId): StudyMode {
  const mode = STUDY_MODES.find(m => m.id === id);
  if (!mode) {
    throw new Error(`Unknown study mode ${id}`);
  }
  return mode;
}
