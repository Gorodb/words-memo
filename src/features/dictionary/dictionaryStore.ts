import { create } from 'zustand';
import {
  downloadFile,
  exists,
  mkdir,
  moveFile,
  unlink,
} from '@dr.pogodin/react-native-fs';
import {
  DICTIONARIES,
  DICTIONARY_FORMAT,
  BUNDLED_LANGUAGES,
} from '../../config/languages';
import type { LanguageCode } from '../../domain/types';
import {
  closeDictionary,
  DICTIONARY_DIR,
  dictionaryPath,
  openDictionary,
} from './dictionary';

export type DictionaryStatus =
  | { state: 'unknown' }
  | { state: 'missing' }
  | { state: 'downloading'; progress: number }
  | { state: 'installed' }
  | { state: 'error'; message: string };

interface DictionaryState {
  statuses: Record<LanguageCode, DictionaryStatus>;
  /** Checks which dictionaries are on disk (call once at startup). */
  refresh: () => Promise<void>;
  download: (language: LanguageCode) => Promise<void>;
  remove: (language: LanguageCode) => Promise<void>;
}

/** Throws unless the file is a dictionary in the format this app reads. */
function checkFormat(language: LanguageCode): void {
  const { rows } = openDictionary(language).executeSync(
    "SELECT value FROM meta WHERE key = 'format'",
  );
  const format = Number(rows[0]?.value);
  if (format !== DICTIONARY_FORMAT) {
    throw new Error(
      `Unsupported dictionary format ${format || 'unknown'} (expected ${DICTIONARY_FORMAT}).`,
    );
  }
}

export const useDictionaryStore = create<DictionaryState>((set, get) => {
  const setStatus = (language: LanguageCode, status: DictionaryStatus) =>
    set(state => ({ statuses: { ...state.statuses, [language]: status } }));

  return {
    statuses: Object.fromEntries(
      BUNDLED_LANGUAGES.map(l => [l.code, { state: 'unknown' }]),
    ),

    refresh: async () => {
      for (const { code } of BUNDLED_LANGUAGES) {
        if (get().statuses[code]?.state === 'downloading') {
          continue;
        }
        try {
          if (await exists(dictionaryPath(code))) {
            checkFormat(code);
            setStatus(code, { state: 'installed' });
          } else {
            setStatus(code, { state: 'missing' });
          }
        } catch (e) {
          closeDictionary(code);
          setStatus(code, { state: 'error', message: String(e) });
        }
      }
    },

    download: async language => {
      const info = DICTIONARIES[language];
      if (!info || get().statuses[language]?.state === 'downloading') {
        return;
      }
      const target = dictionaryPath(language);
      const part = `${target}.part`;
      setStatus(language, { state: 'downloading', progress: 0 });
      try {
        await mkdir(DICTIONARY_DIR);
        if (await exists(part)) {
          await unlink(part);
        }
        const { promise } = downloadFile({
          fromUrl: info.url,
          toFile: part,
          progressInterval: 250,
          progress: ({ bytesWritten, contentLength }) =>
            setStatus(language, {
              state: 'downloading',
              progress: contentLength > 0 ? bytesWritten / contentLength : 0,
            }),
        });
        const result = await promise;
        if (result.statusCode === 404) {
          // Release missing, still a draft, or the repo isn't public.
          throw new Error('The dictionary file is not published yet (HTTP 404).');
        }
        if (result.statusCode < 200 || result.statusCode >= 300) {
          throw new Error(`Download failed (HTTP ${result.statusCode}).`);
        }
        closeDictionary(language);
        if (await exists(target)) {
          await unlink(target);
        }
        await moveFile(part, target);
        checkFormat(language);
        setStatus(language, { state: 'installed' });
      } catch (e) {
        closeDictionary(language);
        await unlink(part).catch(() => {});
        setStatus(language, {
          state: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },

    remove: async language => {
      closeDictionary(language);
      const target = dictionaryPath(language);
      if (await exists(target)) {
        await unlink(target);
      }
      setStatus(language, { state: 'missing' });
    },
  };
});

export const isDictionaryInstalled = (language: LanguageCode) =>
  useDictionaryStore.getState().statuses[language]?.state === 'installed';
