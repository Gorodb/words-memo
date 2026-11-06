import { AppState } from 'react-native';
import { SYNC_API_URL } from '../../config/sync';
import { CLIENT_ID } from './clientId';
import { EventStreamParser, parseChanged } from './sse';

/**
 * Live updates: while signed in and in the foreground, the app listens to the
 * backend's `GET /events` stream. A `changed` event means another device (or
 * the website) changed the account; syncStore then pulls (if the version is
 * past its cursor). The app's own pushes aren't echoed: requests carry
 * CLIENT_ID.
 *
 * XMLHttpRequest, because RN's fetch can't read a body as it streams; RN's
 * XHR fills `responseText` bit by bit when `onprogress` is set.
 */

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;
/** responseText only grows: reconnect once it gets this long. */
const MAX_RESPONSE_CHARS = 256 * 1024;

let token: string | null = null;
let onChanged: ((version: number) => void) | null = null;
let xhr: XMLHttpRequest | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let started = false;

function shouldRun(): boolean {
  return token !== null && AppState.currentState === 'active';
}

function disconnect(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const current = xhr;
  xhr = null;
  current?.abort();
}

function retry(delayMs?: number): void {
  if (retryTimer || !shouldRun()) {
    return;
  }
  failures++;
  const delay =
    delayMs ?? Math.min(RETRY_MIN_MS * 2 ** (failures - 1), RETRY_MAX_MS);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, delay);
}

function connect(): void {
  if (xhr || retryTimer || !shouldRun()) {
    return;
  }
  const request = new XMLHttpRequest();
  xhr = request;
  const parser = new EventStreamParser();
  let read = 0;
  const done = (delayMs?: number) => {
    if (xhr !== request) {
      return; // aborted on purpose
    }
    xhr = null;
    request.abort();
    retry(delayMs);
  };
  request.onprogress = () => {
    if (xhr !== request) {
      return;
    }
    const text = request.responseText;
    if (request.status === 200 && text.length > read) {
      failures = 0;
      for (const event of parser.feed(text.slice(read))) {
        const changed = parseChanged(event);
        if (changed) {
          onChanged?.(changed.version);
        }
      }
      read = text.length;
    }
    if (read > MAX_RESPONSE_CHARS) {
      done(0);
    }
  };
  request.onreadystatechange = () => {
    if (request.readyState !== XMLHttpRequest.DONE) {
      return;
    }
    // A 401 also fails the next sync, which signs out and stops this.
    done(request.status === 401 ? RETRY_MAX_MS : undefined);
  };
  request.onerror = () => done();
  request.open('GET', `${SYNC_API_URL}/events`);
  request.setRequestHeader('Accept', 'text/event-stream');
  request.setRequestHeader('Authorization', `Bearer ${token}`);
  request.setRequestHeader('X-Client-Id', CLIENT_ID);
  request.setRequestHeader('Cache-Control', 'no-cache');
  request.send();
}

/**
 * Listens for the session's `token` (null stops). `changed` gets the
 * account's version on every event, including the one sent on connect.
 */
export function setLiveSession(
  sessionToken: string | null,
  changed: (version: number) => void,
): void {
  onChanged = changed;
  if (sessionToken === token) {
    return;
  }
  token = sessionToken;
  failures = 0;
  disconnect();
  if (!started) {
    started = true;
    // Background apps can't keep the connection; foreground reconnects.
    AppState.addEventListener('change', () => {
      if (shouldRun()) {
        failures = 0;
        connect();
      } else {
        disconnect();
      }
    });
  }
  connect();
}
