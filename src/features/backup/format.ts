/**
 * Backup file format: validation of untrusted JSON (files can come from
 * other people) into a typed BackupFile.
 */
import type {
  BackupFile,
  BackupFolder,
  BackupRule,
  BackupSet,
  BackupWord,
  Example,
} from '../../domain/types';

export const BACKUP_APP = 'wordsLearning';
export const BACKUP_VERSION = 1;

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, where: string): string {
  if (typeof v !== 'string') {
    throw new BackupFormatError(`${where} must be text.`);
  }
  return v;
}

function time(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function list(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) {
    throw new BackupFormatError(`${where} must be a list.`);
  }
  return v;
}

function parseExample(v: unknown, where: string): Example {
  if (typeof v === 'string') {
    return { text: v, translation: '' };
  }
  if (!isObject(v)) {
    throw new BackupFormatError(`${where} is invalid.`);
  }
  return {
    text: str(v.text, `${where} text`),
    translation: typeof v.translation === 'string' ? v.translation : '',
  };
}

function parseWord(v: unknown, where: string, now: number): BackupWord {
  if (!isObject(v)) {
    throw new BackupFormatError(`${where} is invalid.`);
  }
  const term = str(v.term, `${where} word`).trim();
  if (!term) {
    throw new BackupFormatError(`${where} has an empty word.`);
  }
  return {
    term,
    translation: str(v.translation ?? '', `${where} translation`).trim(),
    examples: list(v.examples ?? [], `${where} examples`)
      .map((e, i) => parseExample(e, `${where} example ${i + 1}`))
      .filter(e => e.text.trim() !== ''),
    description: str(v.description ?? '', `${where} description`).trim(),
    learnedAt:
      typeof v.learnedAt === 'number' && Number.isFinite(v.learnedAt)
        ? v.learnedAt
        : null,
    createdAt: time(v.createdAt, now),
    updatedAt: time(v.updatedAt, now),
  };
}

function parseRule(v: unknown, where: string, now: number): BackupRule {
  if (!isObject(v)) {
    throw new BackupFormatError(`${where} is invalid.`);
  }
  return {
    title: str(v.title ?? '', `${where} title`).trim(),
    text: str(v.text, `${where} text`).trim(),
    createdAt: time(v.createdAt, now),
    updatedAt: time(v.updatedAt, now),
  };
}

function parseSet(v: unknown, where: string, now: number): BackupSet {
  if (!isObject(v)) {
    throw new BackupFormatError(`${where} is invalid.`);
  }
  const name = str(v.name, `${where} name`).trim();
  if (!name) {
    throw new BackupFormatError(`${where} has an empty name.`);
  }
  return {
    name,
    createdAt: time(v.createdAt, now),
    updatedAt: time(v.updatedAt, now),
    words: list(v.words ?? [], `Set "${name}" words`).map((w, i) =>
      parseWord(w, `Set "${name}", word ${i + 1}`, now),
    ),
    rules: list(v.rules ?? [], `Set "${name}" rules`)
      .map((r, i) => parseRule(r, `Set "${name}", rule ${i + 1}`, now))
      .filter(r => r.text !== ''),
  };
}

function parseFolder(v: unknown, where: string, now: number): BackupFolder {
  if (!isObject(v)) {
    throw new BackupFormatError(`${where} is invalid.`);
  }
  const name = str(v.name, `${where} name`).trim();
  if (!name) {
    throw new BackupFormatError(`${where} has an empty name.`);
  }
  return {
    name,
    createdAt: time(v.createdAt, now),
    updatedAt: time(v.updatedAt, now),
    setNames: list(v.setNames ?? [], `Folder "${name}" sets`).map(n =>
      str(n, `Folder "${name}" set name`).trim(),
    ),
  };
}

/** Parses and validates a backup file; throws BackupFormatError with a readable message. */
export function parseBackup(json: string, now = Date.now()): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new BackupFormatError('This file is not a words backup (not JSON).');
  }
  if (!isObject(data) || data.app !== BACKUP_APP) {
    throw new BackupFormatError('This file is not a words backup.');
  }
  if (data.version !== BACKUP_VERSION) {
    throw new BackupFormatError(
      `This backup was made by a newer app version (format ${String(
        data.version,
      )}). Update the app to import it.`,
    );
  }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    kind: data.kind === 'sets' ? 'sets' : 'full',
    exportedAt: time(data.exportedAt, now),
    languages: list(data.languages, 'languages').map((l, i) => {
      if (!isObject(l)) {
        throw new BackupFormatError(`Language ${i + 1} is invalid.`);
      }
      const code = str(l.code, `Language ${i + 1} code`).trim();
      const name = typeof l.name === 'string' ? l.name.trim() : '';
      return {
        code,
        ...(name && { name }),
        folders: list(l.folders ?? [], `${code} folders`).map((f, j) =>
          parseFolder(f, `${code} folder ${j + 1}`, now),
        ),
        sets: list(l.sets ?? [], `${code} sets`).map((s, j) =>
          parseSet(s, `${code} set ${j + 1}`, now),
        ),
      };
    }),
  };
}

/** Readable file name part: "Verbs: A1/A2" → "Verbs-A1-A2". */
export function safeFileName(name: string): string {
  return (
    name
      .normalize('NFC')
      .replace(/[\\/:*?"<>|\s]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'set'
  );
}
