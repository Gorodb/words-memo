/**
 * Write operations for event handlers, menus and dialogs: each one calls the
 * backend (through RTK Query, so the cached lists refresh) and resolves with
 * the result or rejects with the server's error.
 */
import { libraryApi } from '../api/api';
import type { WordInput, WordPatch } from '../api/types';
import type { ID, LanguageCode, RuleInput } from '../domain/types';
import { authActions } from './authSlice';
import { store } from './index';
import { settingsActions } from './settingsSlice';

const api = libraryApi.endpoints;
const dispatch = store.dispatch;

// Account

export async function signIn(email: string, password: string) {
  const session = await dispatch(api.login.initiate({ email, password })).unwrap();
  dispatch(authActions.signedIn({ token: session.token, email: session.user.email }));
}

export async function register(email: string, password: string) {
  const session = await dispatch(api.register.initiate({ email, password })).unwrap();
  dispatch(authActions.signedIn({ token: session.token, email: session.user.email }));
}

/** Revokes the session on the server (best effort) and forgets it here. */
export async function signOut() {
  await dispatch(api.logout.initiate()).unwrap().catch(() => {});
  dispatch(authActions.signedOut());
  dispatch(libraryApi.util.resetApiState());
}

// Languages

export const setActiveLanguage = (code: LanguageCode) =>
  dispatch(settingsActions.activeLanguageChanged(code));

export const addLanguage = (name: string) =>
  dispatch(api.createLanguage.initiate(name)).unwrap();

export const renameLanguage = (code: LanguageCode, name: string) =>
  dispatch(api.renameLanguage.initiate({ code, name })).unwrap();

export async function removeLanguage(code: LanguageCode) {
  await dispatch(api.deleteLanguage.initiate(code)).unwrap();
  if (store.getState().settings.activeLanguage === code) {
    setActiveLanguage('en');
  }
}

export const languageStats = (code: LanguageCode) =>
  dispatch(api.languageStats.initiate(code, { subscribe: false, forceRefetch: true })).unwrap();

// Folders

export const createFolder = (languageCode: LanguageCode, name: string) =>
  dispatch(api.createFolder.initiate({ languageCode, name })).unwrap();

export const renameFolder = (id: ID, name: string) =>
  dispatch(api.updateFolder.initiate({ id, name })).unwrap();

export const setFolderPinned = (id: ID, pinned: boolean) =>
  dispatch(api.updateFolder.initiate({ id, pinned })).unwrap();

export const reorderFolders = (language: LanguageCode, ids: ID[]) =>
  dispatch(api.reorderFolders.initiate({ language, ids })).unwrap();

export const deleteFolder = (id: ID) => dispatch(api.deleteFolder.initiate(id)).unwrap();

export const setInFolder = (folderId: ID, setId: ID, inFolder: boolean) =>
  dispatch(api.setInFolder.initiate({ folderId, setId, inFolder })).unwrap();

// Sets

export const createSet = (languageCode: LanguageCode, name: string, folderId?: ID) =>
  dispatch(api.createSet.initiate({ languageCode, name, folderId })).unwrap();

export const renameSet = (id: ID, name: string) =>
  dispatch(api.updateSet.initiate({ id, name })).unwrap();

export const setSetPinned = (id: ID, pinned: boolean) =>
  dispatch(api.updateSet.initiate({ id, pinned })).unwrap();

export const deleteSet = (id: ID) => dispatch(api.deleteSet.initiate(id)).unwrap();

export const resetLearned = (setId: ID) => dispatch(api.resetProgress.initiate(setId)).unwrap();

export const exportSet = (setId: ID) =>
  dispatch(api.exportSet.initiate(setId, { subscribe: false, forceRefetch: true })).unwrap();

export const createShareCode = (setId: ID) => dispatch(api.shareCode.initiate(setId)).unwrap();

export const sampleWordsOutsideSet = (setId: ID, limit: number) =>
  dispatch(api.sampleOutside.initiate({ setId, limit }, { subscribe: false, forceRefetch: true })).unwrap();

// Words

export const createWord = (setId: ID, input: WordInput) =>
  dispatch(api.createWord.initiate({ setId, input })).unwrap();

export const updateWord = (id: ID, patch: WordPatch) =>
  dispatch(api.updateWord.initiate({ id, patch })).unwrap();

export const setLearned = (id: ID, learned: boolean) => updateWord(id, { learned });

export const setLearnedMany = (ids: ID[]) =>
  ids.length ? dispatch(api.markLearned.initiate(ids)).unwrap() : Promise.resolve();

export const deleteWord = (id: ID) => dispatch(api.deleteWord.initiate(id)).unwrap();

// Rules

export const createRule = (setId: ID, input: RuleInput) =>
  dispatch(api.createRule.initiate({ setId, input })).unwrap();

export const updateRule = (id: ID, input: RuleInput) =>
  dispatch(api.updateRule.initiate({ id, input })).unwrap();

export const deleteRule = (id: ID) => dispatch(api.deleteRule.initiate(id)).unwrap();

// Backup and share codes

export const exportAll = () =>
  dispatch(api.exportAll.initiate(undefined, { subscribe: false, forceRefetch: true })).unwrap();

export const previewImport = (file: unknown) => dispatch(api.previewImport.initiate(file)).unwrap();

export const importBackup = (file: unknown) => dispatch(api.importBackup.initiate(file)).unwrap();

export const previewShare = (code: string) =>
  dispatch(api.previewShare.initiate(code, { subscribe: false, forceRefetch: true })).unwrap();

export const importShare = (code: string) => dispatch(api.importShare.initiate(code)).unwrap();

// Word form helpers

export const similarWarning = (code: LanguageCode, term: string, exclude?: ID) =>
  dispatch(api.similarWarning.initiate({ code, term, exclude }, { subscribe: false })).unwrap();

export const searchDictionary = (language: LanguageCode, q: string) =>
  dispatch(api.searchDictionary.initiate({ language, q }, { subscribe: false })).unwrap();

export const dictionaryTranslations = (language: LanguageCode, term: string) =>
  dispatch(api.translations.initiate({ language, term }, { subscribe: false })).unwrap();

/** The set's words as they are on the server now (not from the cache). */
export const loadWords = (setId: ID) =>
  dispatch(api.getWords.initiate(setId, { subscribe: false, forceRefetch: true })).unwrap();
