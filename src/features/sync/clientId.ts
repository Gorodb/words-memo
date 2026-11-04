/**
 * This app run's id, sent as `X-Client-Id` with every API request, so the
 * backend's live updates (`/events`) don't echo the phone's own pushes back.
 * Not a secret: Math.random is enough (Hermes has no crypto).
 */
export const CLIENT_ID: string = Array.from({ length: 4 }, () =>
  Math.random().toString(36).slice(2, 10).padEnd(8, '0'),
).join('');
