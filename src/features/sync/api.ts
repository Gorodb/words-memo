import { SYNC_API_URL } from '../../config/sync';
import type { SyncRequest, SyncResponse } from './protocol';

/** The server answered with an error status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Machine-readable reason from the body, e.g. 'USER_NOT_FOUND'. */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** No answer: offline, server down or timed out. */
export class NetworkError extends Error {}

export interface Session {
  token: string;
  user: { id: string; email: string };
}

/** Error body shapes: Nest's `{message: string | string[]}`, plus our `code`. */
function errorMessage(body: unknown, status: number): string {
  const message = (body as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) {
    return message.join('\n');
  }
  return typeof message === 'string' ? message : `Server error (${status})`;
}

async function request<T>(
  path: string,
  options: { body?: unknown; token?: string; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 30_000,
  );
  let response: Response;
  try {
    response = await fetch(SYNC_API_URL + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token && { Authorization: `Bearer ${options.token}` }),
      },
      body: JSON.stringify(options.body ?? {}),
      // RN's AbortSignal type differs from the DOM one fetch is typed with.
      signal: controller.signal as RequestInit['signal'],
    });
  } catch {
    throw new NetworkError('No connection to the sync server');
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // not JSON (e.g. a proxy error page)
  }
  if (!response.ok) {
    throw new ApiError(
      errorMessage(body, response.status),
      response.status,
      (body as { code?: string } | null)?.code,
    );
  }
  return body as T;
}

export const api = {
  /** Throws ApiError with code USER_NOT_FOUND or WRONG_PASSWORD. */
  login: (email: string, password: string) =>
    request<Session>('/auth/login', { body: { email, password } }),
  /** Throws ApiError with code EMAIL_TAKEN. */
  register: (email: string, password: string) =>
    request<Session>('/auth/register', { body: { email, password } }),
  logout: (token: string) =>
    request<null>('/auth/logout', { token, timeoutMs: 5_000 }),
  /** A first sync uploads everything, so it may take a while. */
  sync: (token: string, body: SyncRequest) =>
    request<SyncResponse>('/sync', { body, token, timeoutMs: 120_000 }),
};

export const AUTH_ERRORS = {
  userNotFound: 'USER_NOT_FOUND',
  unauthorized: 'UNAUTHORIZED',
  cursorAhead: 'SYNC_CURSOR_AHEAD',
} as const;
