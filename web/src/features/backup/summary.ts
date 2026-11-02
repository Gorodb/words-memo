/** Texts for import results (the planning itself runs on the server). */
import type { LanguageCode } from '../../domain/types';

export interface ImportSummary {
  wordsAdded: number;
  wordsUpdated: number;
  rulesAdded: number;
  setsCreated: number;
  foldersCreated: number;
  /** Names of the custom languages that will be created. */
  languagesCreated: string[];
  /** Languages in the file that this app doesn't have; their data is skipped. */
  skippedLanguages: LanguageCode[];
}

/** False when importing would change nothing. */
export function importsAnything(summary: ImportSummary): boolean {
  return (
    summary.wordsAdded > 0 ||
    summary.wordsUpdated > 0 ||
    summary.rulesAdded > 0 ||
    summary.setsCreated > 0 ||
    summary.foldersCreated > 0
  );
}

/** "12 words added, 3 updated, 1 new set" (empty parts left out). */
export function describeSummary(summary: ImportSummary): string {
  const parts = [
    `${summary.wordsAdded} ${
      summary.wordsAdded === 1 ? 'word' : 'words'
    } added`,
    `${summary.wordsUpdated} updated`,
  ];
  if (summary.rulesAdded) {
    parts.push(
      `${summary.rulesAdded} ${
        summary.rulesAdded === 1 ? 'rule' : 'rules'
      } added`,
    );
  }
  if (summary.setsCreated) {
    parts.push(
      `${summary.setsCreated} new ${
        summary.setsCreated === 1 ? 'set' : 'sets'
      }`,
    );
  }
  if (summary.foldersCreated) {
    parts.push(
      `${summary.foldersCreated} new ${
        summary.foldersCreated === 1 ? 'folder' : 'folders'
      }`,
    );
  }
  if (summary.languagesCreated.length) {
    parts.push(
      `${
        summary.languagesCreated.length === 1 ? 'new language' : 'new languages'
      } ${summary.languagesCreated.join(', ')}`,
    );
  }
  let text = parts.join(', ') + '.';
  if (summary.skippedLanguages.length) {
    text += ` Skipped languages this app doesn't have: ${summary.skippedLanguages.join(
      ', ',
    )}.`;
  }
  return text;
}
