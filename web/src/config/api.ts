/**
 * Base URL of the backend (`backend/`): the website reads and writes the
 * user's words there. Set VITE_SYNC_API_URL at build time (see .env.example);
 * the dev server falls back to a local backend.
 */
export const API_URL: string = (
  import.meta.env.VITE_SYNC_API_URL ??
  (import.meta.env.DEV ? 'http://localhost:3000' : 'https://api.recallico.com')
).replace(/\/+$/, '');
