/**
 * Base URL of the sync backend (`backend/`).
 *
 * Development: `cd backend && docker compose up -d db && npm run start:dev`,
 * then `adb reverse tcp:3000 tcp:3000` so localhost on the emulator or a USB
 * device reaches this computer (iOS simulator: localhost works as is).
 *
 * Release: set the deployed HTTPS address. Android release builds block
 * plain http (`usesCleartextTraffic` is only on for debug).
 */
export const SYNC_API_URL = __DEV__
  ? 'http://localhost:3000'
  : 'https://words-memo.example.com';

/** Wait after a local change before pushing it, to batch quick edits. */
export const SYNC_DEBOUNCE_MS = 1500;
/** Retry delays after a failed sync double from the first up to the max. */
export const SYNC_RETRY_MIN_MS = 5_000;
export const SYNC_RETRY_MAX_MS = 5 * 60_000;
