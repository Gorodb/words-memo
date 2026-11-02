/**
 * The website's whole data layer: RTK Query over the backend's routes. The
 * server holds the words (the same rows the phones sync), so nothing is
 * stored in the browser besides the session token and two preferences.
 *
 * Cache tags are coarse on purpose (lists are small): a change to words
 * refetches word lists and set counts, a change to folders refetches folders.
 */
import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { API_URL } from '../config/api';
import type { BackupFile, ID, RuleInput } from '../domain/types';
import { authActions, type AuthState } from '../store/authSlice';
import type {
  DictionaryEntry,
  FolderDetail,
  FolderView,
  ImportPreview,
  LanguageView,
  RuleView,
  Session,
  SetView,
  ShareCreated,
  WordInput,
  WordPatch,
  WordView,
} from './types';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  prepareHeaders: (headers, { getState }) => {
    const { token } = (getState() as { auth: AuthState }).auth;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

/** A revoked session (401 UNAUTHORIZED) signs out here too. */
const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extra,
) => {
  const result = await rawBaseQuery(args, api, extra);
  const code = (result.error?.data as { code?: string } | undefined)?.code;
  if (result.error?.status === 401 && code === 'UNAUTHORIZED') {
    api.dispatch(authActions.signedOut('You were signed out. Sign in again.'));
    api.dispatch(libraryApi.util.resetApiState());
  }
  return result;
};

const TAGS = ['Language', 'Folder', 'Set', 'Word', 'Rule'] as const;
/** Everything that shows words or their counts. */
const WORDS = ['Word', 'Set'] as const;

export const libraryApi = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: TAGS,
  // Another device may have changed the words meanwhile.
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: build => ({
    // Account
    login: build.mutation<Session, { email: string; password: string }>({
      query: body => ({ url: '/auth/login', method: 'POST', body }),
    }),
    register: build.mutation<Session, { email: string; password: string }>({
      query: body => ({ url: '/auth/register', method: 'POST', body }),
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),

    // Languages
    getLanguages: build.query<LanguageView[], void>({
      query: () => '/languages',
      providesTags: ['Language'],
    }),
    createLanguage: build.mutation<LanguageView, string>({
      query: name => ({ url: '/languages', method: 'POST', body: { name } }),
      invalidatesTags: ['Language'],
    }),
    renameLanguage: build.mutation<void, { code: string; name: string }>({
      query: ({ code, name }) => ({ url: `/languages/${code}`, method: 'PATCH', body: { name } }),
      invalidatesTags: ['Language'],
    }),
    deleteLanguage: build.mutation<void, string>({
      query: code => ({ url: `/languages/${code}`, method: 'DELETE' }),
      invalidatesTags: [...TAGS],
    }),
    languageStats: build.query<{ sets: number; words: number }, string>({
      query: code => `/languages/${code}/stats`,
    }),
    similarWarning: build.query<{ warning: string | null }, { code: string; term: string; exclude?: ID }>({
      query: ({ code, term, exclude }) => ({
        url: `/languages/${code}/similar`,
        params: { term, ...(exclude && { exclude }) },
      }),
      keepUnusedDataFor: 5,
    }),

    // Folders
    getFolders: build.query<FolderView[], string>({
      query: language => ({ url: '/folders', params: { language } }),
      providesTags: ['Folder'],
    }),
    getFolder: build.query<FolderDetail, ID>({
      query: id => `/folders/${id}`,
      providesTags: ['Folder'],
    }),
    getFolderSets: build.query<SetView[], ID>({
      query: id => `/folders/${id}/sets`,
      providesTags: ['Folder', 'Set'],
    }),
    createFolder: build.mutation<FolderView, { languageCode: string; name: string }>({
      query: body => ({ url: '/folders', method: 'POST', body }),
      invalidatesTags: ['Folder'],
    }),
    updateFolder: build.mutation<void, { id: ID; name?: string; pinned?: boolean }>({
      query: ({ id, ...body }) => ({ url: `/folders/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Folder'],
    }),
    /** Shows the new order at once, then saves it. */
    reorderFolders: build.mutation<void, { language: string; ids: ID[] }>({
      query: ({ ids }) => ({ url: '/folders/order', method: 'PUT', body: { ids } }),
      async onQueryStarted({ language, ids }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          libraryApi.util.updateQueryData('getFolders', language, folders => {
            const byId = new Map(folders.map(f => [f.id, f]));
            return ids.flatMap(id => byId.get(id) ?? []);
          }),
        );
        queryFulfilled.catch(patch.undo);
      },
      invalidatesTags: ['Folder'],
    }),
    deleteFolder: build.mutation<void, ID>({
      query: id => ({ url: `/folders/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Folder'],
    }),
    setInFolder: build.mutation<void, { folderId: ID; setId: ID; inFolder: boolean }>({
      query: ({ folderId, setId, inFolder }) => ({
        url: `/folders/${folderId}/sets/${setId}`,
        method: inFolder ? 'PUT' : 'DELETE',
      }),
      invalidatesTags: ['Folder'],
    }),

    // Sets
    getSets: build.query<SetView[], string>({
      query: language => ({ url: '/sets', params: { language } }),
      providesTags: ['Set'],
    }),
    getSet: build.query<SetView, ID>({
      query: id => `/sets/${id}`,
      providesTags: ['Set'],
    }),
    createSet: build.mutation<SetView, { languageCode: string; name: string; folderId?: ID }>({
      query: body => ({ url: '/sets', method: 'POST', body }),
      invalidatesTags: ['Set', 'Folder'],
    }),
    updateSet: build.mutation<void, { id: ID; name?: string; pinned?: boolean }>({
      query: ({ id, ...body }) => ({ url: `/sets/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Set'],
    }),
    deleteSet: build.mutation<void, ID>({
      query: id => ({ url: `/sets/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Set', 'Folder', 'Word', 'Rule'],
    }),
    resetProgress: build.mutation<void, ID>({
      query: id => ({ url: `/sets/${id}/reset-progress`, method: 'POST' }),
      invalidatesTags: [...WORDS],
    }),
    exportSet: build.query<BackupFile, ID>({
      query: id => `/sets/${id}/export`,
      keepUnusedDataFor: 0,
    }),
    shareCode: build.mutation<ShareCreated, ID>({
      query: id => ({ url: `/sets/${id}/share-code`, method: 'POST' }),
    }),
    sampleOutside: build.query<WordView[], { setId: ID; limit: number }>({
      query: ({ setId, limit }) => ({ url: `/sets/${setId}/sample-outside`, params: { limit } }),
      keepUnusedDataFor: 0,
    }),

    // Words
    getWords: build.query<WordView[], ID>({
      query: setId => `/sets/${setId}/words`,
      providesTags: ['Word'],
    }),
    createWord: build.mutation<WordView, { setId: ID; input: WordInput }>({
      query: ({ setId, input }) => ({ url: `/sets/${setId}/words`, method: 'POST', body: input }),
      invalidatesTags: [...WORDS],
    }),
    /** Edit, learned / to learn, star. */
    updateWord: build.mutation<WordView, { id: ID; patch: WordPatch }>({
      query: ({ id, patch }) => ({ url: `/words/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: [...WORDS],
    }),
    deleteWord: build.mutation<void, ID>({
      query: id => ({ url: `/words/${id}`, method: 'DELETE' }),
      invalidatesTags: [...WORDS],
    }),
    markLearned: build.mutation<void, ID[]>({
      query: ids => ({ url: '/words/learned', method: 'POST', body: { ids } }),
      invalidatesTags: [...WORDS],
    }),

    // Rules
    getRules: build.query<RuleView[], ID>({
      query: setId => `/sets/${setId}/rules`,
      providesTags: ['Rule'],
    }),
    createRule: build.mutation<RuleView, { setId: ID; input: RuleInput }>({
      query: ({ setId, input }) => ({ url: `/sets/${setId}/rules`, method: 'POST', body: input }),
      invalidatesTags: ['Rule', 'Set'],
    }),
    updateRule: build.mutation<RuleView, { id: ID; input: RuleInput }>({
      query: ({ id, input }) => ({ url: `/rules/${id}`, method: 'PATCH', body: input }),
      invalidatesTags: ['Rule'],
    }),
    deleteRule: build.mutation<void, ID>({
      query: id => ({ url: `/rules/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Rule', 'Set'],
    }),

    // Backup and share codes
    exportAll: build.query<BackupFile, void>({
      query: () => '/backup/export',
      keepUnusedDataFor: 0,
    }),
    previewImport: build.mutation<ImportPreview, unknown>({
      query: file => ({ url: '/backup/import/preview', method: 'POST', body: file }),
    }),
    importBackup: build.mutation<ImportPreview, unknown>({
      query: file => ({ url: '/backup/import', method: 'POST', body: file }),
      invalidatesTags: [...TAGS],
    }),
    previewShare: build.query<ImportPreview, string>({
      query: code => `/backup/shares/${encodeURIComponent(code)}/preview`,
      keepUnusedDataFor: 0,
    }),
    importShare: build.mutation<ImportPreview, string>({
      query: code => ({ url: `/backup/shares/${encodeURIComponent(code)}/import`, method: 'POST' }),
      invalidatesTags: [...TAGS],
    }),

    // Dictionaries (word suggestions)
    searchDictionary: build.query<DictionaryEntry[], { language: string; q: string }>({
      query: ({ language, q }) => ({ url: `/dictionaries/${language}/search`, params: { q } }),
    }),
    translations: build.query<string[], { language: string; term: string }>({
      query: ({ language, term }) => ({ url: `/dictionaries/${language}/translations`, params: { term } }),
    }),
  }),
});

export const {
  useGetLanguagesQuery,
  useGetFoldersQuery,
  useGetFolderQuery,
  useGetFolderSetsQuery,
  useGetSetsQuery,
  useGetSetQuery,
  useGetWordsQuery,
  useGetRulesQuery,
} = libraryApi;

/** Readable text of a failed request (the server's `message`). */
export function apiErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  const e = error as FetchBaseQueryError;
  if (e && typeof e === 'object' && 'status' in e) {
    const message = (e.data as { message?: unknown } | undefined)?.message;
    if (Array.isArray(message)) {
      return message.join('\n');
    }
    if (typeof message === 'string') {
      return message;
    }
    if (e.status === 'FETCH_ERROR' || e.status === 'TIMEOUT_ERROR') {
      return 'No connection to the server. Check your internet connection.';
    }
    return `Server error (${e.status})`;
  }
  return String(error);
}

/** The server's machine-readable `code` of a failed request. */
export function apiErrorCode(error: unknown): string | undefined {
  return ((error as FetchBaseQueryError | undefined)?.data as { code?: string } | undefined)?.code;
}
