import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { useDispatch, useSelector } from 'react-redux';
import { libraryApi } from '../api/api';
import { startLiveUpdates } from '../api/liveUpdates';
import { authReducer, initialAuthState, type AuthState } from './authSlice';
import {
  initialSettingsState,
  settingsReducer,
  type SettingsState,
} from './settingsSlice';

/**
 * Only the session and two preferences stay in the browser (localStorage);
 * the words themselves are always read from the server.
 */
const STORAGE_KEY = 'words-memo.session';

interface Saved {
  auth: Pick<AuthState, 'token' | 'email'>;
  settings: SettingsState;
}

function load(): Saved | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return text ? (JSON.parse(text) as Saved) : null;
  } catch {
    return null;
  }
}

const saved = load();

export const store = configureStore({
  reducer: {
    auth: authReducer,
    settings: settingsReducer,
    [libraryApi.reducerPath]: libraryApi.reducer,
  },
  preloadedState: {
    auth: { ...initialAuthState, ...saved?.auth },
    settings: { ...initialSettingsState, ...saved?.settings },
  },
  middleware: getDefault => getDefault().concat(libraryApi.middleware),
});

setupListeners(store.dispatch);
// Changes made on phones or in other tabs show up here as they happen.
startLiveUpdates(store);

let last: string | null = null;
store.subscribe(() => {
  const { auth, settings } = store.getState();
  const next = JSON.stringify({
    auth: { token: auth.token, email: auth.email },
    settings,
  } satisfies Saved);
  if (next !== last) {
    last = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode: the session just isn't remembered
    }
  }
});

// Signing in or out in another tab.
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY) {
    window.location.reload();
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
