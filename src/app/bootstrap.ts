import { initDatabase } from '../db/database';
import { hydrateSettings } from '../store/settingsStore';

let done = false;

/** Synchronous startup work that must finish before the first render. */
export function bootstrap(): void {
  if (done) {
    return;
  }
  initDatabase();
  hydrateSettings();
  done = true;
}
