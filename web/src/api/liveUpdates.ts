/**
 * Live updates: while signed in and the tab is visible, the site listens to
 * the backend's `GET /events` stream and refetches what another client (a
 * phone's sync, another tab) changed. The tab's own changes aren't echoed:
 * every request carries this tab's CLIENT_ID.
 *
 * fetch (not EventSource) because the stream needs the Authorization header.
 */
import { API_URL } from '../config/api';
import type { AppDispatch, RootState } from '../store';
import { libraryApi } from './api';
import { CLIENT_ID } from './clientId';
import { EventStreamParser, parseChanged } from './sse';

type Tag = 'Language' | 'Folder' | 'Set' | 'Word' | 'Rule';

/** What to refetch per synced table (sets lists show counts and folder contents). */
const TAGS_BY_TABLE: Record<string, Tag[]> = {
  languages: ['Language'],
  folders: ['Folder'],
  folderSets: ['Folder', 'Set'],
  sets: ['Set', 'Folder'],
  words: ['Word', 'Set'],
  rules: ['Rule', 'Set'],
};
const ALL_TAGS: Tag[] = ['Language', 'Folder', 'Set', 'Word', 'Rule'];

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;
/** A hidden tab lets the stream go after this long (browsers cap open connections). */
const HIDDEN_GRACE_MS = 30_000;

interface Store {
  getState: () => RootState;
  dispatch: AppDispatch;
  subscribe: (listener: () => void) => () => void;
}

export function startLiveUpdates(store: Store): void {
  let token: string | null = null;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  /** Account version the cached data matches; null until the first event. */
  let version: number | null = null;

  const invalidate = (tags: Tag[]) => {
    if (tags.length > 0) {
      store.dispatch(libraryApi.util.invalidateTags([...new Set(tags)]));
    }
  };

  const disconnect = () => {
    controller?.abort();
    controller = null;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const shouldRun = () => token !== null && document.visibilityState === 'visible';

  const connect = () => {
    if (controller || !shouldRun()) {
      return;
    }
    const own = new AbortController();
    controller = own;
    void listen(token!, own.signal).then(
      () => retry(own),
      (e: unknown) => {
        if (!own.signal.aborted && (e as { status?: number }).status === 401) {
          // Revoked session: the next API call signs out; don't hammer the server.
          controller = null;
          return;
        }
        retry(own);
      },
    );
  };

  const retry = (own: AbortController) => {
    if (controller !== own || own.signal.aborted) {
      return;
    }
    controller = null;
    failures++;
    const delay = Math.min(RETRY_MIN_MS * 2 ** (failures - 1), RETRY_MAX_MS);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };

  const listen = async (sessionToken: string, signal: AbortSignal) => {
    const response = await fetch(`${API_URL}/events`, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'X-Client-Id': CLIENT_ID,
        Accept: 'text/event-stream',
      },
      cache: 'no-store',
      signal,
    });
    if (!response.ok || !response.body) {
      throw Object.assign(new Error(`events: HTTP ${response.status}`), {
        status: response.status,
      });
    }
    failures = 0;
    const parser = new EventStreamParser();
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        return;
      }
      for (const event of parser.feed(value)) {
        const changed = parseChanged(event);
        if (!changed) {
          continue;
        }
        if (version !== null && changed.version !== version) {
          // The event on connect has no tables: what changed while away is unknown.
          invalidate(
            changed.tables.length
              ? changed.tables.flatMap(t => TAGS_BY_TABLE[t] ?? [])
              : ALL_TAGS,
          );
        }
        version = changed.version;
      }
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (hiddenTimer) {
        clearTimeout(hiddenTimer);
        hiddenTimer = null;
      }
      failures = 0;
      connect();
    } else if (!hiddenTimer) {
      hiddenTimer = setTimeout(() => {
        hiddenTimer = null;
        if (document.visibilityState !== 'visible') {
          disconnect();
        }
      }, HIDDEN_GRACE_MS);
    }
  });

  const onAuth = () => {
    const next = store.getState().auth.token;
    if (next === token) {
      return;
    }
    token = next;
    version = null;
    failures = 0;
    disconnect();
    connect();
  };
  store.subscribe(onAuth);
  onAuth();
}
