/**
 * Everything the website does with the user's library: the server-side
 * counterpart of the app's repositories (`src/db/repositories/*.ts`), with the
 * same orderings, limits and cascades. Writes go through LibraryStore, so
 * phones receive them with their next sync.
 */
import { ConflictException, Injectable } from '@nestjs/common';
import { DictionariesService } from '../dictionaries/dictionaries.service.ts';
import { findSimilar, similarWarning, wordKey } from '../dictionaries/similarWords.ts';
import type {
  FolderRecord,
  LanguageRecord,
  RuleRecord,
  SetRecord,
  WordRecord,
} from '../sync/protocol.ts';
import { recordKey } from '../sync/protocol.ts';
import {
  BUNDLED_LANGUAGES,
  cleanExamples,
  compareWords,
  createId,
  CUSTOM_LANGUAGE_PREFIX,
  languageNameTaken,
  MAX_PINNED,
  nextSortAt,
  reorderedSortKeys,
  wordGroup,
} from './domain.ts';
import { normalizeTerm } from './shared/term.ts';
import { LibraryErrorCode, LibraryStore, type Reader, type Writer } from './store.ts';

export interface LanguageView {
  code: string;
  name: string;
  nativeName: string;
  custom: boolean;
}

export type FolderView = FolderRecord & { setCount: number };
export type FolderDetail = FolderView & { setIds: string[] };
export type SetView = SetRecord & { wordCount: number; ruleCount: number };
/** A word as the website shows it (the sync record without its sort keys). */
export type WordView = Omit<WordRecord, 'termNorm' | 'sortAt'>;

export interface WordInput {
  term: string;
  translation: string;
  examples?: Array<{ text: string; translation: string }>;
  description?: string;
}

export interface WordPatch extends Partial<WordInput> {
  learned?: boolean;
  favorite?: boolean;
}

const pinnedFirst = (a: { pinnedAt: number | null }, b: { pinnedAt: number | null }) =>
  Number(a.pinnedAt === null) - Number(b.pinnedAt === null);
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

const wordView = ({ termNorm: _norm, sortAt: _sort, ...word }: WordRecord): WordView => word;

@Injectable()
export class LibraryService {
  constructor(
    private readonly store: LibraryStore,
    private readonly dictionaries: DictionariesService,
  ) {}

  // Languages

  private async languages(reader: Reader): Promise<LanguageView[]> {
    const custom = (await reader.list('languages')).sort((a, b) => a.createdAt - b.createdAt);
    return [
      ...BUNDLED_LANGUAGES.map(l => ({ ...l, custom: false })),
      ...custom.map(l => ({ code: l.code, name: l.name, nativeName: l.name, custom: true })),
    ];
  }

  listLanguages(userId: string): Promise<LanguageView[]> {
    return this.store.read(userId, reader => this.languages(reader));
  }

  private async checkLanguageName(reader: Reader, name: string, exceptCode?: string) {
    const taken = languageNameTaken(await this.languages(reader), name, exceptCode);
    if (taken) {
      throw new ConflictException({
        code: LibraryErrorCode.languageNameTaken,
        message: `There is already a language called "${taken.name}".`,
      });
    }
  }

  createLanguage(userId: string, name: string): Promise<LanguageView> {
    return this.store.write(userId, async w => {
      await this.checkLanguageName(w, name);
      const record: LanguageRecord = {
        code: CUSTOM_LANGUAGE_PREFIX + createId(),
        name: name.trim(),
        createdAt: Date.now(),
      };
      await w.put('languages', record);
      return { code: record.code, name: record.name, nativeName: record.name, custom: true };
    });
  }

  renameLanguage(userId: string, code: string, name: string): Promise<void> {
    return this.store.write(userId, async w => {
      const language = await w.get('languages', code);
      await this.checkLanguageName(w, name, code);
      await w.put('languages', { ...language, name: name.trim() });
    });
  }

  /** Deletes a custom language with all its folders, sets, words and rules. */
  deleteLanguage(userId: string, code: string): Promise<void> {
    return this.store.write(userId, async w => {
      await w.get('languages', code);
      const sets = await w.list('sets', { languageCode: code });
      await w.removeSets(sets.map(s => s.id));
      const folders = await w.list('folders', { languageCode: code });
      await w.removeFolders(folders.map(f => f.id));
      await w.remove('languages', [code]);
    });
  }

  /** Number of sets and words of a language, for the delete confirmation. */
  languageStats(userId: string, code: string): Promise<{ sets: number; words: number }> {
    return this.store.read(userId, async r => ({
      sets: (await r.list('sets', { languageCode: code })).length,
      words: (await r.list('words', { languageCode: code })).length,
    }));
  }

  // Pins

  private async checkPinLimit(
    reader: Reader,
    table: 'folders' | 'sets',
    item: { id: string; languageCode: string; pinnedAt: number | null },
  ): Promise<void> {
    if (item.pinnedAt !== null) {
      return;
    }
    const pinned = (await reader.list(table, { languageCode: item.languageCode })).filter(
      r => r.pinnedAt !== null && r.id !== item.id,
    ).length;
    if (pinned >= MAX_PINNED) {
      throw new ConflictException({
        code: LibraryErrorCode.pinLimit,
        message: `You can pin up to ${MAX_PINNED} ${table}. Unpin one first.`,
      });
    }
  }

  // Folders

  private async folderViews(reader: Reader, languageCode: string): Promise<FolderView[]> {
    const folders = await reader.list('folders', { languageCode });
    const counts = await reader.countBy('folderSets', 'folderId');
    return folders
      .map(f => ({ ...f, setCount: counts.get(f.id) ?? 0 }))
      .sort((a, b) => pinnedFirst(a, b) || a.position - b.position || a.createdAt - b.createdAt);
  }

  /** Pinned first, then the manual (drag and drop) order. */
  listFolders(userId: string, languageCode: string): Promise<FolderView[]> {
    return this.store.read(userId, r => this.folderViews(r, languageCode));
  }

  getFolder(userId: string, id: string): Promise<FolderDetail> {
    return this.store.read(userId, async r => {
      const folder = await r.get('folders', id);
      const links = await r.list('folderSets', { folderId: id });
      return { ...folder, setCount: links.length, setIds: links.map(l => l.setId) };
    });
  }

  /** New folders go to the end of the manual order. */
  createFolder(userId: string, languageCode: string, name: string): Promise<FolderView> {
    return this.store.write(userId, async w => {
      const positions = (await w.list('folders', { languageCode })).map(f => f.position);
      const now = Date.now();
      const folder: FolderRecord = {
        id: createId(),
        languageCode,
        name: name.trim(),
        position: positions.length ? Math.max(...positions) + 1 : 0,
        pinnedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await w.put('folders', folder);
      return { ...folder, setCount: 0 };
    });
  }

  updateFolder(
    userId: string,
    id: string,
    patch: { name?: string; pinned?: boolean },
  ): Promise<void> {
    return this.store.write(userId, async w => {
      const folder = { ...(await w.get('folders', id)) };
      if (patch.name !== undefined) {
        folder.name = patch.name.trim();
        folder.updatedAt = Date.now();
      }
      if (patch.pinned !== undefined) {
        if (patch.pinned) {
          await this.checkPinLimit(w, 'folders', folder);
        }
        folder.pinnedAt = patch.pinned ? folder.pinnedAt ?? Date.now() : null;
      }
      await w.put('folders', folder);
    });
  }

  /** `orderedIds[i]` gets position i. */
  reorderFolders(userId: string, orderedIds: string[]): Promise<void> {
    return this.store.write(userId, async w => {
      const folders = new Map((await w.list('folders', { id: orderedIds })).map(f => [f.id, f]));
      const changed = orderedIds.flatMap((id, position) => {
        const folder = folders.get(id);
        return folder && folder.position !== position ? [{ ...folder, position }] : [];
      });
      await w.put('folders', ...changed);
    });
  }

  /** Removes the folder; its sets stay. */
  deleteFolder(userId: string, id: string): Promise<void> {
    return this.store.write(userId, async w => {
      await w.get('folders', id);
      await w.removeFolders([id]);
    });
  }

  /** Adds the set to the folder or removes it from there (the set stays). */
  setInFolder(userId: string, folderId: string, setId: string, inFolder: boolean): Promise<void> {
    return this.store.write(userId, async w => {
      const key = recordKey('folderSets', { folderId, setId, addedAt: 0 });
      const existing = await w.find('folderSets', key);
      if (!inFolder) {
        if (existing) {
          await w.remove('folderSets', [key]);
        }
        return;
      }
      if (existing) {
        return;
      }
      await w.get('folders', folderId);
      await w.get('sets', setId);
      await w.put('folderSets', { folderId, setId, addedAt: Date.now() });
    });
  }

  // Sets

  private async setViews(reader: Reader, sets: SetRecord[]): Promise<SetView[]> {
    const words = await reader.countBy('words', 'setId');
    const rules = await reader.countBy('rules', 'setId');
    return sets
      .map(s => ({ ...s, wordCount: words.get(s.id) ?? 0, ruleCount: rules.get(s.id) ?? 0 }))
      .sort((a, b) => pinnedFirst(a, b) || byName(a, b));
  }

  /** All sets of a language, pinned first, then by name. */
  listSets(userId: string, languageCode: string): Promise<SetView[]> {
    return this.store.read(userId, async r =>
      this.setViews(r, await r.list('sets', { languageCode })),
    );
  }

  listSetsInFolder(userId: string, folderId: string): Promise<SetView[]> {
    return this.store.read(userId, async r => {
      await r.get('folders', folderId);
      const links = await r.list('folderSets', { folderId });
      const sets = links.length ? await r.list('sets', { id: links.map(l => l.setId) }) : [];
      return this.setViews(r, sets);
    });
  }

  getSet(userId: string, id: string): Promise<SetView> {
    return this.store.read(userId, async r => (await this.setViews(r, [await r.get('sets', id)]))[0]);
  }

  /** Creates a set; with `folderId`, also adds it to that folder. */
  createSet(userId: string, languageCode: string, name: string, folderId?: string): Promise<SetView> {
    return this.store.write(userId, async w => {
      const now = Date.now();
      const set: SetRecord = {
        id: createId(),
        languageCode,
        name: name.trim(),
        pinnedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await w.put('sets', set);
      if (folderId) {
        await w.get('folders', folderId);
        await w.put('folderSets', { folderId, setId: set.id, addedAt: now });
      }
      return { ...set, wordCount: 0, ruleCount: 0 };
    });
  }

  updateSet(userId: string, id: string, patch: { name?: string; pinned?: boolean }): Promise<void> {
    return this.store.write(userId, async w => {
      const set = { ...(await w.get('sets', id)) };
      if (patch.name !== undefined) {
        set.name = patch.name.trim();
        set.updatedAt = Date.now();
      }
      if (patch.pinned !== undefined) {
        if (patch.pinned) {
          await this.checkPinLimit(w, 'sets', set);
        }
        set.pinnedAt = patch.pinned ? set.pinnedAt ?? Date.now() : null;
      }
      await w.put('sets', set);
    });
  }

  /** Deletes the set's words and rules and removes it from every folder. */
  deleteSet(userId: string, id: string): Promise<void> {
    return this.store.write(userId, async w => {
      await w.get('sets', id);
      await w.removeSets([id]);
    });
  }

  /** Marks every learned word of the set as not learned; keeps their order. */
  resetProgress(userId: string, setId: string): Promise<void> {
    return this.store.write(userId, async w => {
      const now = Date.now();
      const learned = (await w.list('words', { setId })).filter(word => word.learnedAt !== null);
      await w.put('words', ...learned.map(word => ({ ...word, learnedAt: null, updatedAt: now })));
    });
  }

  // Words

  /** To learn first, then learned; starred first in each part; then newest or dragged order. */
  listWords(userId: string, setId: string): Promise<WordView[]> {
    return this.store.read(userId, async r => {
      await r.get('sets', setId);
      return (await r.list('words', { setId })).sort(compareWords).map(wordView);
    });
  }

  /** Words by id, in the order of `ids` (missing ones are skipped). */
  getWords(userId: string, ids: string[]): Promise<WordView[]> {
    return this.store.read(userId, async r => {
      const byId = new Map((await r.list('words', { id: ids })).map(w => [w.id, w]));
      return ids.flatMap(id => (byId.has(id) ? [wordView(byId.get(id)!)] : []));
    });
  }

  /** The word inherits the language of its set and goes to the top of "To learn". */
  createWord(userId: string, setId: string, input: WordInput): Promise<WordView> {
    return this.store.write(userId, async w => {
      const set = await w.get('sets', setId);
      const now = Date.now();
      const term = input.term.trim();
      const word: WordRecord = {
        id: createId(),
        setId,
        languageCode: set.languageCode,
        term,
        termNorm: normalizeTerm(term),
        translation: input.translation.trim(),
        examples: cleanExamples(input.examples),
        description: input.description?.trim() ?? '',
        learnedAt: null,
        favoriteAt: null,
        sortAt: nextSortAt(await w.list('words', { setId }), now),
        createdAt: now,
        updatedAt: now,
      };
      await w.put('words', word);
      return wordView(word);
    });
  }

  /**
   * Edits a word. `learned` and `favorite` move it to the top of its new
   * group, like the Learned button and the star in the app.
   */
  updateWord(userId: string, id: string, patch: WordPatch): Promise<WordView> {
    return this.store.write(userId, async w => {
      const word = { ...(await w.get('words', id)) };
      const now = Date.now();
      if (patch.term !== undefined) {
        word.term = patch.term.trim();
        word.termNorm = normalizeTerm(word.term);
      }
      if (patch.translation !== undefined) {
        word.translation = patch.translation.trim();
      }
      if (patch.examples !== undefined) {
        word.examples = cleanExamples(patch.examples);
      }
      if (patch.description !== undefined) {
        word.description = patch.description.trim();
      }
      let moved = false;
      if (patch.learned !== undefined && patch.learned !== (word.learnedAt !== null)) {
        word.learnedAt = patch.learned ? now : null;
        moved = true;
      }
      if (patch.favorite !== undefined && patch.favorite !== (word.favoriteAt !== null)) {
        word.favoriteAt = patch.favorite ? now : null;
        moved = true;
      }
      if (moved) {
        word.sortAt = nextSortAt(await w.list('words', { setId: word.setId }), now);
      }
      word.updatedAt = now;
      await w.put('words', word);
      return wordView(word);
    });
  }

  /** Marks several words as learned (end of "Study words"). */
  markLearned(userId: string, ids: string[]): Promise<void> {
    return this.store.write(userId, async w => {
      const now = Date.now();
      const words = (await w.list('words', { id: ids })).filter(word => word.learnedAt === null);
      // Each one goes on top of its set's learned part.
      const top = new Map<string, number>();
      for (const setId of new Set(words.map(word => word.setId))) {
        top.set(setId, nextSortAt(await w.list('words', { setId }), now));
      }
      await w.put(
        'words',
        ...words.map(word => {
          const sortAt = top.get(word.setId)!;
          top.set(word.setId, sortAt + 1);
          return { ...word, learnedAt: now, sortAt, updatedAt: now };
        }),
      );
    });
  }

  /**
   * Saves a manual order of words in a set. Only the group of the first word
   * (to learn / learned × starred or not) is reordered; others are ignored.
   */
  reorderWords(userId: string, setId: string, orderedIds: string[]): Promise<void> {
    return this.store.write(userId, async w => {
      const words = await w.list('words', { setId });
      const byId = new Map(words.map(word => [word.id, word]));
      const first = byId.get(orderedIds[0]);
      if (!first) {
        return;
      }
      const group = wordGroup(first);
      const ids = orderedIds.filter(id => byId.has(id) && wordGroup(byId.get(id)!) === group);
      const keys = reorderedSortKeys(words, ids);
      await w.put(
        'words',
        ...ids
          .map(id => byId.get(id)!)
          .filter(word => word.sortAt !== keys.get(word.id))
          .map(word => ({ ...word, sortAt: keys.get(word.id)! })),
      );
    });
  }

  deleteWord(userId: string, id: string): Promise<void> {
    return this.store.write(userId, async w => {
      await w.get('words', id);
      await w.remove('words', [id]);
    });
  }

  /**
   * Random words of the same language from other sets: wrong options in
   * "Study words" when the set itself has too few words.
   */
  sampleOutsideSet(userId: string, setId: string, limit: number): Promise<WordView[]> {
    return this.store.read(userId, async r => {
      const set = await r.get('sets', setId);
      const pool = (await r.list('words', { languageCode: set.languageCode })).filter(
        word => word.setId !== setId,
      );
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, limit).map(wordView);
    });
  }

  /**
   * Warning for the word form: the language already has the same word, or
   * (with the dictionary on the server) another form of it ("isst" ↔ "essen").
   */
  similarWarning(
    userId: string,
    languageCode: string,
    term: string,
    excludeId?: string,
  ): Promise<string | null> {
    return this.store.read(userId, async r => {
      const key = wordKey(term);
      if (!key) {
        return null;
      }
      const words = await r.list('words', { languageCode });
      const setNames = new Map((await r.list('sets', { languageCode })).map(s => [s.id, s.name]));
      const known = words.map(word => ({
        id: word.id,
        term: word.term,
        setName: setNames.get(word.setId) ?? '',
      }));
      const entries = await this.dictionaries.entryIds(languageCode, [
        key,
        ...known.map(k => wordKey(k.term)),
      ]);
      return similarWarning(findSimilar(term, known, k => entries.get(k) ?? [], excludeId));
    });
  }

  // Rules

  /** Rules of a set in the order they were added. */
  listRules(userId: string, setId: string): Promise<RuleRecord[]> {
    return this.store.read(userId, async r => {
      await r.get('sets', setId);
      return (await r.list('rules', { setId })).sort(
        (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1),
      );
    });
  }

  createRule(userId: string, setId: string, input: { title: string; text: string }): Promise<RuleRecord> {
    return this.store.write(userId, async w => {
      const set = await w.get('sets', setId);
      const now = Date.now();
      const rule: RuleRecord = {
        id: createId(),
        setId,
        languageCode: set.languageCode,
        title: input.title.trim(),
        text: input.text.trim(),
        createdAt: now,
        updatedAt: now,
      };
      await w.put('rules', rule);
      return rule;
    });
  }

  updateRule(userId: string, id: string, input: { title: string; text: string }): Promise<RuleRecord> {
    return this.store.write(userId, async w => {
      const rule = {
        ...(await w.get('rules', id)),
        title: input.title.trim(),
        text: input.text.trim(),
        updatedAt: Date.now(),
      };
      await w.put('rules', rule);
      return rule;
    });
  }

  deleteRule(userId: string, id: string): Promise<void> {
    return this.store.write(userId, async w => {
      await w.get('rules', id);
      await w.remove('rules', [id]);
    });
  }

  /** For the backup module: languages known to the user (bundled + custom). */
  knownLanguages(reader: Reader): Promise<LanguageView[]> {
    return this.languages(reader);
  }

  run<R>(userId: string, work: (writer: Writer) => Promise<R>): Promise<R> {
    return this.store.write(userId, work);
  }

  view<R>(userId: string, work: (reader: Reader) => Promise<R>): Promise<R> {
    return this.store.read(userId, work);
  }
}
