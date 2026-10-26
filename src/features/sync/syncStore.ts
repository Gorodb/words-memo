import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { DEFAULT_LANGUAGE_CODE } from '../../config/languages';
import {
  SYNC_DEBOUNCE_MS,
  SYNC_RETRY_MAX_MS,
  SYNC_RETRY_MIN_MS,
} from '../../config/sync';
import { subscribe } from '../../db/changes';
import {
  deleteSetting,
  readSettings,
  writeSetting,
} from '../../db/repositories/settings';
import { applyRemoteChanges, collectChanges } from '../../db/repositories/sync';
import { useSettingsStore } from '../../store/settingsStore';
import { api, ApiError, AUTH_ERRORS, NetworkError, type Session } from './api';

/**
 * Optional account sync. The phone's database stays the only place the app
 * reads from; the server is a copy for other devices. Signed out (or offline),
 * everything works as before, and changes are still recorded in the sync
 * queue so they go out on the next sync.
 *
 * A sync runs after sign in (a full one: every row goes up, every row the
 * phone lacks comes down), after local changes (debounced), when the app
 * comes to the foreground, when the network comes back, and as retries with
 * backoff after a failure.
 */

export type SyncStatus =
  /** Nothing running; see `lastSyncedAt`. */
  | 'idle'
  | 'syncing'
  /** The server can't be reached; retried when the network is back. */
  | 'offline'
  | 'error';

interface SyncState {
  /** Signed-in account; null = sync off. */
  email: string | null;
  status: SyncStatus;
  lastSyncedAt: number | null;
  /** Last error, or why the app signed out by itself. */
  message: string | null;
}

const KEYS = {
  token: 'sync.token',
  email: 'sync.email',
  /** Absent = the next sync is a full one. */
  cursor: 'sync.cursor',
  lastSyncedAt: 'sync.lastSyncedAt',
} as const;

export const useSyncStore = create<SyncState>(() => ({
  email: null,
  status: 'idle',
  lastSyncedAt: null,
  message: null,
}));

let token: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
/** A sync was requested while one was running: run once more after it. */
let again = false;
let failures = 0;
/** True while pulled changes are written, so they don't trigger a push. */
let applying = false;

function schedule(delayMs: number): void {
  if (!token) {
    return;
  }
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    timer = null;
    run();
  }, delayMs);
}

/** Bearer token of the signed-in account, for other API calls (share codes). */
export function currentToken(): string | null {
  return token;
}

/** Sync as soon as possible (e.g. "Sync now"). */
export function syncNow(): void {
  schedule(0);
}

async function run(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await syncOnce();
    } while (again && token);
    failures = 0;
  } catch (e) {
    handleFailure(e);
  } finally {
    running = false;
  }
}

async function syncOnce(): Promise<void> {
  const sessionToken = token;
  if (!sessionToken) {
    return;
  }
  useSyncStore.setState({ status: 'syncing' });
  const saved = readSettings()[KEYS.cursor];
  const cursor = saved === undefined ? null : Number(saved);
  const { changes, upToSeq } = await collectChanges(cursor === null);
  const response = await api.sync(sessionToken, { cursor, changes });
  if (token !== sessionToken) {
    return; // signed out (or into another account) meanwhile
  }
  applying = true;
  try {
    applyRemoteChanges(response.changes, upToSeq);
  } finally {
    applying = false;
  }
  if (
    response.changes.languages.upserts.length ||
    response.changes.languages.deletes.length
  ) {
    refreshLanguages();
  }
  const now = Date.now();
  writeSetting(KEYS.cursor, String(response.cursor));
  writeSetting(KEYS.lastSyncedAt, String(now));
  useSyncStore.setState({ status: 'idle', lastSyncedAt: now, message: null });
}

/** Custom languages added, renamed or deleted on another device. */
function refreshLanguages(): void {
  const settings = useSettingsStore.getState();
  settings.reloadLanguages();
  const { languages, activeLanguage } = useSettingsStore.getState();
  if (!languages.some(l => l.code === activeLanguage)) {
    settings.setActiveLanguage(DEFAULT_LANGUAGE_CODE);
  }
}

function handleFailure(e: unknown): void {
  if (e instanceof ApiError && e.code === AUTH_ERRORS.unauthorized) {
    // The session was revoked or the account is gone.
    endSession();
    useSyncStore.setState({
      message: 'You were signed out. Sign in again to keep syncing.',
    });
    return;
  }
  if (e instanceof ApiError && e.code === AUTH_ERRORS.cursorAhead) {
    // The server lost its history (restored or reset): send everything again.
    deleteSetting(KEYS.cursor);
    schedule(0);
    return;
  }
  failures++;
  const delay = Math.min(
    SYNC_RETRY_MIN_MS * 2 ** (failures - 1),
    SYNC_RETRY_MAX_MS,
  );
  useSyncStore.setState(
    e instanceof NetworkError
      ? { status: 'offline', message: null }
      : {
          status: 'error',
          message: e instanceof Error ? e.message : String(e),
        },
  );
  schedule(delay);
}

function beginSession(session: Session): void {
  token = session.token;
  writeSetting(KEYS.token, session.token);
  writeSetting(KEYS.email, session.user.email);
  // The first sync of a session is a full one.
  deleteSetting(KEYS.cursor);
  deleteSetting(KEYS.lastSyncedAt);
  failures = 0;
  useSyncStore.setState({
    email: session.user.email,
    status: 'idle',
    lastSyncedAt: null,
    message: null,
  });
  schedule(0);
}

/** Forgets the session; the words stay on the phone. */
function endSession(): void {
  token = null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  for (const key of Object.values(KEYS)) {
    deleteSetting(key);
  }
  useSyncStore.setState({
    email: null,
    status: 'idle',
    lastSyncedAt: null,
    message: null,
  });
}

/**
 * Signs in, or returns 'noAccount' when there's no account with this email
 * (the caller offers to register). Throws ApiError / NetworkError otherwise.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<'signedIn' | 'noAccount'> {
  try {
    beginSession(await api.login(email, password));
    return 'signedIn';
  } catch (e) {
    if (e instanceof ApiError && e.code === AUTH_ERRORS.userNotFound) {
      return 'noAccount';
    }
    throw e;
  }
}

export async function register(email: string, password: string): Promise<void> {
  beginSession(await api.register(email, password));
}

/** Ends the session here right away; revoking it on the server is best effort. */
export function signOut(): void {
  const revoked = token;
  endSession();
  if (revoked) {
    api.logout(revoked).catch(() => {
      // Offline: the token stays valid on the server, but nothing uses it.
    });
  }
}

let started = false;

/** Restores the session and starts the triggers. Call once after hydrateSettings(). */
export function startSync(): void {
  if (started) {
    return;
  }
  started = true;
  const saved = readSettings();
  token = saved[KEYS.token] ?? null;
  useSyncStore.setState({
    email: token ? saved[KEYS.email] ?? null : null,
    lastSyncedAt: saved[KEYS.lastSyncedAt]
      ? Number(saved[KEYS.lastSyncedAt])
      : null,
  });

  subscribe(() => {
    if (!applying) {
      schedule(SYNC_DEBOUNCE_MS);
    }
  });
  AppState.addEventListener('change', state => {
    if (state === 'active') {
      schedule(0);
    }
  });
  let online = true;
  NetInfo.addEventListener(state => {
    const nowOnline = state.isConnected !== false;
    if (nowOnline && !online) {
      failures = 0;
      schedule(0);
    }
    online = nowOnline;
  });
  schedule(0);
}
