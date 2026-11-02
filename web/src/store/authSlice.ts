import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/** The signed-in account. The website needs one: the words live on the server. */
export interface AuthState {
  token: string | null;
  email: string | null;
  /** Why the site signed out by itself (e.g. the session was revoked). */
  message: string | null;
}

export const initialAuthState: AuthState = { token: null, email: null, message: null };

const authSlice = createSlice({
  name: 'auth',
  initialState: initialAuthState,
  reducers: {
    signedIn: (_state, action: PayloadAction<{ token: string; email: string }>) => ({
      ...action.payload,
      message: null,
    }),
    signedOut: (_state, action: PayloadAction<string | undefined>) => ({
      ...initialAuthState,
      message: action.payload ?? null,
    }),
  },
});

export const authActions = authSlice.actions;
export const authReducer = authSlice.reducer;
