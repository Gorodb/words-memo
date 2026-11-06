/**
 * Sharing a set by code through the server: the server keeps a snapshot of
 * the set (a backup file of kind 'sets') for 7 days, and the first import with
 * the code uses it up. Importing goes through the normal backup merge.
 */
import Share from 'react-native-share';
import { exportSets } from '../../db/repositories/backup';
import type { BackupFile, ID } from '../../domain/types';
import { BackupFormatError, parseBackup } from '../backup/format';
import { ApiError, api, SHARE_ERRORS } from '../sync/api';
import { currentToken } from '../sync/syncStore';
import { formatShareCode, normalizeShareCode } from './shareCode';

/** Creating a code needs an account. */
export class NotSignedInError extends Error {
  constructor() {
    super('Sign in (Settings → Account) to share sets by code.');
  }
}

export interface ShareCode {
  /** As shown: "ABCD-EFGH". */
  code: string;
  expiresAt: Date;
}

export async function createShareCode(setId: ID): Promise<ShareCode> {
  const token = currentToken();
  if (!token) {
    throw new NotSignedInError();
  }
  const created = await api.createShare(token, await exportSets([setId]));
  return {
    code: formatShareCode(created.code),
    expiresAt: new Date(created.expiresAt),
  };
}

/** Share sheet with the code as text (messengers, e-mail, copy). */
export async function sendShareCode(
  setName: string,
  shared: ShareCode,
): Promise<void> {
  await Share.open({
    title: `Words: ${setName}`,
    message: `Set "${setName}" in Words: open Sets → ⋯ → Import by code and enter ${shared.code}`,
    failOnCancel: false,
  });
}

function parseCode(input: string): string {
  const code = normalizeShareCode(input);
  if (!code) {
    throw new Error('A code has 8 letters and digits, like ABCD-EFGH.');
  }
  return code;
}

function toBackup(payload: unknown): BackupFile {
  const backup = parseBackup(JSON.stringify(payload));
  if (backup.kind !== 'sets') {
    throw new BackupFormatError('This code is not for a shared set.');
  }
  return backup;
}

/** Friendlier text for an unknown, used or expired code. */
function rethrow(e: unknown): never {
  if (e instanceof ApiError && e.code === SHARE_ERRORS.notFound) {
    throw new Error(
      'No set has this code. It may be mistyped, already used or expired (codes work for 7 days).',
    );
  }
  throw e;
}

/** The shared set, to preview the import. The code stays valid. */
export async function fetchSharedSet(input: string): Promise<BackupFile> {
  const code = parseCode(input);
  try {
    return toBackup((await api.getShare(code)).payload);
  } catch (e) {
    rethrow(e);
  }
}

/** Uses the code up and returns the shared set to import. */
export async function redeemSharedSet(input: string): Promise<BackupFile> {
  const code = parseCode(input);
  try {
    return toBackup((await api.redeemShare(code)).payload);
  } catch (e) {
    rethrow(e);
  }
}
