/**
 * Import as a pure plan: (what is in the DB, backup) → operations + summary.
 * Rules (.claude/PLAN.md → Backup):
 * - never deletes anything;
 * - sets and folders are matched by name (per language) or created;
 * - a word matching an existing word by (language, term_norm) fully replaces
 *   translation and examples on EVERY matching word, which stay in their sets;
 * - other words are added to their set from the backup.
 */
import { normalizeTerm } from '../../domain/term';
import type {
  BackupFile,
  Example,
  ID,
  LanguageCode,
  Timestamp,
} from '../../domain/types';

export interface ExistingLanguage {
  sets: Array<{ id: ID; name: string }>;
  folders: Array<{ id: ID; name: string; setIds: ID[] }>;
  /** Existing word ids by term_norm. */
  wordIdsByTerm: Map<string, ID[]>;
}

export interface ImportPlan {
  createSets: Array<{
    id: ID;
    languageCode: LanguageCode;
    name: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }>;
  createFolders: Array<{
    id: ID;
    languageCode: LanguageCode;
    name: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }>;
  addToFolder: Array<{ folderId: ID; setId: ID }>;
  updateWords: Array<{ id: ID; translation: string; examples: Example[] }>;
  insertWords: Array<{
    id: ID;
    setId: ID;
    languageCode: LanguageCode;
    term: string;
    termNorm: string;
    translation: string;
    examples: Example[];
    learnedAt: Timestamp | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }>;
  summary: ImportSummary;
}

export interface ImportSummary {
  wordsAdded: number;
  wordsUpdated: number;
  setsCreated: number;
  foldersCreated: number;
  /** Languages in the file that this app doesn't have; their data is skipped. */
  skippedLanguages: LanguageCode[];
}

export function planImport(
  backup: BackupFile,
  existing: (languageCode: LanguageCode) => ExistingLanguage,
  knownLanguages: LanguageCode[],
  createId: () => ID,
): ImportPlan {
  const plan: ImportPlan = {
    createSets: [],
    createFolders: [],
    addToFolder: [],
    updateWords: [],
    insertWords: [],
    summary: {
      wordsAdded: 0,
      wordsUpdated: 0,
      setsCreated: 0,
      foldersCreated: 0,
      skippedLanguages: [],
    },
  };
  /** Count each existing word once, even if several backup words match it. */
  const updatedIds = new Set<ID>();

  for (const language of backup.languages) {
    if (!knownLanguages.includes(language.code)) {
      if (!plan.summary.skippedLanguages.includes(language.code)) {
        plan.summary.skippedLanguages.push(language.code);
      }
      continue;
    }
    const current = existing(language.code);
    const setIdByName = new Map<string, ID>();
    for (const set of current.sets) {
      if (!setIdByName.has(set.name)) {
        setIdByName.set(set.name, set.id);
      }
    }

    const setIdFor = (
      name: string,
      createdAt: Timestamp,
      updatedAt: Timestamp,
    ): ID => {
      let id = setIdByName.get(name);
      if (!id) {
        id = createId();
        setIdByName.set(name, id);
        plan.createSets.push({
          id,
          languageCode: language.code,
          name,
          createdAt,
          updatedAt,
        });
        plan.summary.setsCreated++;
      }
      return id;
    };

    for (const set of language.sets) {
      const setId = setIdFor(set.name, set.createdAt, set.updatedAt);
      for (const word of set.words) {
        const termNorm = normalizeTerm(word.term);
        const matches = current.wordIdsByTerm.get(termNorm);
        if (matches?.length) {
          for (const id of matches) {
            // A later duplicate in the backup wins (it replaces the update).
            const at = plan.updateWords.findIndex(u => u.id === id);
            const update = {
              id,
              translation: word.translation,
              examples: word.examples,
            };
            if (at >= 0) {
              plan.updateWords[at] = update;
            } else {
              plan.updateWords.push(update);
            }
            updatedIds.add(id);
          }
        } else {
          plan.insertWords.push({
            id: createId(),
            setId,
            languageCode: language.code,
            term: word.term,
            termNorm,
            translation: word.translation,
            examples: word.examples,
            learnedAt: word.learnedAt,
            createdAt: word.createdAt,
            updatedAt: word.updatedAt,
          });
        }
      }
    }

    const folderByName = new Map(current.folders.map(f => [f.name, f]));
    for (const folder of language.folders) {
      let target = folderByName.get(folder.name);
      if (!target) {
        target = { id: createId(), name: folder.name, setIds: [] };
        folderByName.set(folder.name, target);
        plan.createFolders.push({
          id: target.id,
          languageCode: language.code,
          name: folder.name,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        });
        plan.summary.foldersCreated++;
      }
      for (const setName of folder.setNames) {
        const setId = setIdFor(setName, folder.createdAt, folder.updatedAt);
        if (!target.setIds.includes(setId)) {
          target.setIds.push(setId);
          plan.addToFolder.push({ folderId: target.id, setId });
        }
      }
    }
  }

  plan.summary.wordsAdded = plan.insertWords.length;
  plan.summary.wordsUpdated = updatedIds.size;
  return plan;
}

/** "12 words added, 3 updated, 1 new set" (empty parts left out). */
export function describeSummary(summary: ImportSummary): string {
  const parts = [
    `${summary.wordsAdded} ${
      summary.wordsAdded === 1 ? 'word' : 'words'
    } added`,
    `${summary.wordsUpdated} updated`,
  ];
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
  let text = parts.join(', ') + '.';
  if (summary.skippedLanguages.length) {
    text += ` Skipped languages this app doesn't have: ${summary.skippedLanguages.join(
      ', ',
    )}.`;
  }
  return text;
}
