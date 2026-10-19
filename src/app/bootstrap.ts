import { initDatabase } from '../db/database';
import { useDictionaryStore } from '../features/dictionary/dictionaryStore';
import { hydrateSettings } from '../store/settingsStore';

let done = false;

/** Synchronous startup work that must finish before the first render. */
export function bootstrap(): void {
  if (done) {
    return;
  }
  initDatabase();
  hydrateSettings();
  // Async: dictionaries show as "checking…" until this finishes.
  useDictionaryStore.getState().refresh();
  done = true;
}
