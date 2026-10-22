/**
 * File side of backups: write / save / share / pick. Cancelling any system
 * dialog is a normal outcome (returns false / null), not an error.
 */
import {
  CachesDirectoryPath,
  readFile,
  writeFile,
} from '@dr.pogodin/react-native-fs';
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  saveDocuments,
  types,
} from '@react-native-documents/picker';
import Share from 'react-native-share';
import {
  applyImportPlan,
  exportAll,
  exportSets,
  loadExisting,
} from '../../db/repositories/backup';
import type { BackupFile, ID } from '../../domain/types';
import { useSettingsStore } from '../../store/settingsStore';
import { createId } from '../../utils/id';
import { parseBackup, safeFileName } from './format';
import { planImport, type ImportPlan } from './merge';

const MIME = 'application/json';

const isCancel = (e: unknown) =>
  isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED;

const today = () => new Date().toISOString().slice(0, 10);

/** Writes the backup to the app cache; returns a file:// uri. */
async function writeTemp(
  fileName: string,
  backup: BackupFile,
): Promise<string> {
  const path = `${CachesDirectoryPath}/${fileName}`;
  await writeFile(path, JSON.stringify(backup, null, 2), 'utf8');
  return `file://${path}`;
}

async function share(uri: string, fileName: string, title: string) {
  await Share.open({
    url: uri,
    type: MIME,
    filename: fileName,
    title,
    failOnCancel: false,
  });
}

/** "Save to device": system "save as" dialog. False if cancelled. */
export async function saveFullBackup(): Promise<boolean> {
  const fileName = `words-backup-${today()}.json`;
  const uri = await writeTemp(fileName, await exportAll());
  try {
    const [result] = await saveDocuments({
      sourceUris: [uri],
      fileName,
      mimeType: MIME,
      copy: true,
    });
    if (result.error) {
      throw new Error(result.error);
    }
    return true;
  } catch (e) {
    if (isCancel(e)) {
      return false;
    }
    throw e;
  }
}

/** Share sheet with the full backup (Drive, Telegram, e-mail, …). */
export async function shareFullBackup(): Promise<void> {
  const fileName = `words-backup-${today()}.json`;
  await share(
    await writeTemp(fileName, await exportAll()),
    fileName,
    'Words backup',
  );
}

/** Share one set as a backup file the other person can import. */
export async function shareSet(setId: ID, setName: string): Promise<void> {
  const fileName = `${safeFileName(setName)}.words.json`;
  await share(
    await writeTemp(fileName, await exportSets([setId])),
    fileName,
    `Words: ${setName}`,
  );
}

/** Lets the user pick a backup file; null if cancelled. Throws on bad files. */
export async function pickBackup(): Promise<BackupFile | null> {
  let picked;
  try {
    // Any type: files from messengers often arrive as octet-stream.
    [picked] = await pick({ type: [types.allFiles] });
  } catch (e) {
    if (isCancel(e)) {
      return null;
    }
    throw e;
  }
  // content:// (Android) → local copy we can read.
  const [copy] = await keepLocalCopy({
    files: [{ uri: picked.uri, fileName: picked.name ?? 'backup.json' }],
    destination: 'cachesDirectory',
  });
  if (copy.status !== 'success') {
    throw new Error(copy.copyError);
  }
  const path = decodeURIComponent(copy.localUri.replace(/^file:\/\//, ''));
  return parseBackup(await readFile(path, 'utf8'));
}

/** Plans the import against the current data (nothing is written yet). */
export function prepareImport(backup: BackupFile): ImportPlan {
  return planImport(
    backup,
    loadExisting,
    useSettingsStore.getState().languages,
    createId,
  );
}

export async function runImport(plan: ImportPlan): Promise<void> {
  await applyImportPlan(plan);
  if (plan.createLanguages.length) {
    useSettingsStore.getState().reloadLanguages();
  }
}
