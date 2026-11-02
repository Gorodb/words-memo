/**
 * Backup files and share codes for the website, with the app's own file
 * format and merge rules (shared/format.ts and shared/merge.ts are copies of
 * the app's): import never deletes, matches sets and folders by name, and a
 * word with the same term replaces translation, examples and description on
 * every matching word.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import type { SharePayload } from '../shares/share-payload.ts';
import { SharesService, type ShareCreated } from '../shares/shares.service.ts';
import { compareWords, createId } from './domain.ts';
import { LibraryService } from './library.service.ts';
import { BACKUP_APP, BACKUP_VERSION, BackupFormatError, parseBackup } from './shared/format.ts';
import { planImport, type ExistingLanguage, type ImportPlan, type ImportSummary } from './shared/merge.ts';
import type { BackupFile, BackupSet } from './shared/types.ts';
import { LibraryErrorCode, type Reader, type Writer } from './store.ts';

type LanguageEntry = BackupFile['languages'][number];

export interface ImportPreview {
  summary: ImportSummary;
  /** Names of the sets in the file, e.g. for "Import "Verbs"?". */
  setNames: string[];
  /** Languages of the file that have sets (to say where they land). */
  languageCodes: string[];
}

@Injectable()
export class BackupService {
  constructor(
    private readonly library: LibraryService,
    private readonly shares: SharesService,
  ) {}

  // Export

  private async setsWithWords(
    reader: Reader,
    setIds?: string[],
  ): Promise<Map<string, BackupSet & { languageCode: string }>> {
    const sets = (await reader.list('sets', setIds ? { id: setIds } : {})).sort(
      (a, b) =>
        Number(a.pinnedAt === null) - Number(b.pinnedAt === null) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
    const result = new Map<string, BackupSet & { languageCode: string }>();
    for (const s of sets) {
      result.set(s.id, {
        languageCode: s.languageCode,
        name: s.name,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        words: [],
        rules: [],
      });
    }
    const ids = [...result.keys()];
    if (ids.length === 0) {
      return result;
    }
    for (const w of (await reader.list('words', { setId: ids })).sort(compareWords)) {
      result.get(w.setId)?.words.push({
        term: w.term,
        translation: w.translation,
        examples: w.examples,
        description: w.description,
        learnedAt: w.learnedAt,
        favoriteAt: w.favoriteAt,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      });
    }
    const rules = (await reader.list('rules', { setId: ids })).sort((a, b) => a.createdAt - b.createdAt);
    for (const r of rules) {
      result.get(r.setId)?.rules.push({
        title: r.title,
        text: r.text,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      });
    }
    return result;
  }

  private async customNames(reader: Reader): Promise<Map<string, string>> {
    return new Map((await reader.list('languages')).map(l => [l.code, l.name]));
  }

  private entry(code: string, names: Map<string, string>): LanguageEntry {
    const name = names.get(code);
    return { code, ...(name !== undefined && { name }), folders: [], sets: [] };
  }

  /** Everything: all languages, folders (manual order) and sets with words. */
  exportAll(userId: string): Promise<BackupFile> {
    return this.library.view(userId, async reader => {
      const sets = await this.setsWithWords(reader);
      const names = await this.customNames(reader);
      const languages = new Map<string, LanguageEntry>();
      const entry = (code: string) => {
        let found = languages.get(code);
        if (!found) {
          found = this.entry(code, names);
          languages.set(code, found);
        }
        return found;
      };
      for (const { languageCode, ...set } of sets.values()) {
        entry(languageCode).sets.push(set);
      }
      const links = (await reader.list('folderSets')).sort((a, b) => a.addedAt - b.addedAt);
      const folders = (await reader.list('folders')).sort(
        (a, b) =>
          a.languageCode.localeCompare(b.languageCode) ||
          Number(a.pinnedAt === null) - Number(b.pinnedAt === null) ||
          a.position - b.position ||
          a.createdAt - b.createdAt,
      );
      for (const f of folders) {
        entry(f.languageCode).folders.push({
          name: f.name,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
          setNames: links
            .filter(l => l.folderId === f.id)
            .map(l => sets.get(l.setId)?.name)
            .filter((n): n is string => !!n),
        });
      }
      return {
        app: BACKUP_APP,
        version: BACKUP_VERSION,
        kind: 'full',
        exportedAt: Date.now(),
        languages: [...languages.values()],
      };
    });
  }

  /** Selected sets only (sharing): no folders. */
  exportSets(userId: string, setIds: string[]): Promise<BackupFile> {
    return this.library.view(userId, async reader => {
      for (const id of setIds) {
        await reader.get('sets', id);
      }
      const names = await this.customNames(reader);
      const languages = new Map<string, LanguageEntry>();
      for (const { languageCode, ...set } of (await this.setsWithWords(reader, setIds)).values()) {
        const entry = languages.get(languageCode) ?? this.entry(languageCode, names);
        entry.sets.push(set);
        languages.set(languageCode, entry);
      }
      return {
        app: BACKUP_APP,
        version: BACKUP_VERSION,
        kind: 'sets',
        exportedAt: Date.now(),
        languages: [...languages.values()],
      };
    });
  }

  // Import

  /** Untrusted body → BackupFile, or 400 BAD_BACKUP with a readable message. */
  parse(body: unknown): BackupFile {
    try {
      return parseBackup(JSON.stringify(body));
    } catch (e) {
      if (e instanceof BackupFormatError) {
        throw new BadRequestException({ code: LibraryErrorCode.badBackup, message: e.message });
      }
      throw e;
    }
  }

  private async existing(reader: Reader, languageCode: string): Promise<ExistingLanguage> {
    const sets = (await reader.list('sets', { languageCode })).sort((a, b) => a.createdAt - b.createdAt);
    const folders = (await reader.list('folders', { languageCode })).sort((a, b) => a.position - b.position);
    const links = folders.length
      ? await reader.list('folderSets', { folderId: folders.map(f => f.id) })
      : [];
    const wordIdsByTerm = new Map<string, string[]>();
    for (const w of await reader.list('words', { languageCode })) {
      wordIdsByTerm.set(w.termNorm, [...(wordIdsByTerm.get(w.termNorm) ?? []), w.id]);
    }
    const ruleTextsBySet = new Map<string, string[]>();
    for (const r of await reader.list('rules', { languageCode })) {
      ruleTextsBySet.set(r.setId, [...(ruleTextsBySet.get(r.setId) ?? []), r.text]);
    }
    return {
      sets: sets.map(s => ({ id: s.id, name: s.name })),
      folders: folders.map(f => ({
        id: f.id,
        name: f.name,
        setIds: links.filter(l => l.folderId === f.id).map(l => l.setId),
      })),
      wordIdsByTerm,
      ruleTextsBySet,
    };
  }

  private async plan(reader: Reader, backup: BackupFile): Promise<ImportPlan> {
    const codes = [...new Set(backup.languages.map(l => l.code))];
    const known = await this.library.knownLanguages(reader);
    // The planner may map a file language to a custom one by name, so load all.
    const existing = new Map<string, ExistingLanguage>();
    for (const code of new Set([...codes, ...known.map(l => l.code)])) {
      existing.set(code, await this.existing(reader, code));
    }
    return planImport(backup, code => existing.get(code)!, known, createId);
  }

  private preview(backup: BackupFile, plan: ImportPlan): ImportPreview {
    return {
      summary: plan.summary,
      setNames: backup.languages.flatMap(l => l.sets.map(s => s.name)),
      languageCodes: backup.languages.filter(l => l.sets.length > 0).map(l => l.code),
    };
  }

  /** What importing would do; nothing is written. */
  previewImport(userId: string, backup: BackupFile): Promise<ImportPreview> {
    return this.library.view(userId, async reader =>
      this.preview(backup, await this.plan(reader, backup)),
    );
  }

  /** Imports in one transaction (planned again under the lock). */
  import(userId: string, backup: BackupFile): Promise<ImportPreview> {
    return this.library.run(userId, async writer => {
      const plan = await this.plan(writer, backup);
      await this.apply(writer, plan);
      return this.preview(backup, plan);
    });
  }

  private async apply(w: Writer, plan: ImportPlan): Promise<void> {
    const now = Date.now();
    for (const l of plan.createLanguages) {
      if (!(await w.find('languages', l.code))) {
        await w.put('languages', { code: l.code, name: l.name, createdAt: now });
      }
    }
    await w.put('sets', ...plan.createSets.map(s => ({ ...s, pinnedAt: null })));
    const positions = new Map<string, number>();
    for (const f of plan.createFolders) {
      if (!positions.has(f.languageCode)) {
        const current = (await w.list('folders', { languageCode: f.languageCode })).map(x => x.position);
        positions.set(f.languageCode, current.length ? Math.max(...current) + 1 : 0);
      }
      const position = positions.get(f.languageCode)!;
      positions.set(f.languageCode, position + 1);
      await w.put('folders', { ...f, position, pinnedAt: null });
    }
    for (const link of plan.addToFolder) {
      const key = `${link.folderId}:${link.setId}`;
      if (!(await w.find('folderSets', key))) {
        await w.put('folderSets', { ...link, addedAt: now });
      }
    }
    if (plan.updateWords.length) {
      const words = new Map(
        (await w.list('words', { id: plan.updateWords.map(u => u.id) })).map(x => [x.id, x]),
      );
      await w.put(
        'words',
        ...plan.updateWords.flatMap(u => {
          const word = words.get(u.id);
          return word
            ? [{ ...word, translation: u.translation, examples: u.examples, description: u.description, updatedAt: now }]
            : [];
        }),
      );
    }
    // The file lists words newest first; createdAt keeps that order.
    await w.put('words', ...plan.insertWords.map(x => ({ ...x, sortAt: x.createdAt })));
    await w.put('rules', ...plan.insertRules);
  }

  // Share codes

  /** Uploads a snapshot of the set and returns its code. */
  async shareSet(userId: string, setId: string): Promise<ShareCreated> {
    const payload = await this.exportSets(userId, [setId]);
    return this.shares.create(userId, payload as unknown as SharePayload);
  }

  private shareBackup(payload: unknown): BackupFile {
    const backup = this.parse(payload);
    if (backup.kind !== 'sets') {
      throw new BadRequestException({
        code: LibraryErrorCode.badBackup,
        message: 'This code is not for a shared set.',
      });
    }
    return backup;
  }

  /** What importing the shared set would do; the code stays valid. */
  async previewShare(userId: string, code: string): Promise<ImportPreview> {
    const { payload } = await this.shares.peek(code);
    return this.previewImport(userId, this.shareBackup(payload));
  }

  /** Uses the code up and imports the set. */
  async importShare(userId: string, code: string): Promise<ImportPreview> {
    const { payload } = await this.shares.redeem(code);
    return this.import(userId, this.shareBackup(payload));
  }
}
