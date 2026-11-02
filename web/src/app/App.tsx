import { useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useNavigate,
  useParams,
} from 'react-router';
import { FolderPage } from '../pages/folders/FolderPage';
import { FoldersPage } from '../pages/folders/FoldersPage';
import { LanguagesPage } from '../pages/languages/LanguagesPage';
import { SetPage } from '../pages/sets/SetPage';
import { openImportByCode, SetsPage } from '../pages/sets/SetsPage';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { FlashcardsPage } from '../pages/study/FlashcardsPage';
import { StudyPage } from '../pages/study/StudyPage';
import { StudyWordsPage } from '../pages/study/StudyWordsPage';
import { store, useAppSelector } from '../store';
import { DialogHost } from '../ui/DialogHost';
import { Layout } from './Layout';
import { SignInPage } from './SignInPage';
import { useApplyTheme } from './theme';

/** Signed out, every address shows the sign-in page and stays as it is. */
function Root() {
  useApplyTheme();
  const signedIn = useAppSelector(s => s.auth.token !== null);
  return (
    <>
      {signedIn ? <Outlet /> : <SignInPage />}
      <DialogHost />
    </>
  );
}

/** `/s/<CODE>`: a share link opens Import by code with the code filled in. */
function ShareLink() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) {
      return; // StrictMode runs effects twice
    }
    opened.current = true;
    navigate('/sets', { replace: true });
    openImportByCode(store.getState().settings.activeLanguage, code);
  }, [code, navigate]);
  return null;
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Navigate to="/folders" replace /> },
          { path: 'folders', element: <FoldersPage /> },
          { path: 'folders/:folderId', element: <FolderPage /> },
          { path: 'sets', element: <SetsPage /> },
          { path: 'sets/:setId', element: <SetPage /> },
          { path: 'languages', element: <LanguagesPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      // Learning screens cover the navigation, like on the phone.
      { path: 'sets/:setId/study/:modeId', element: <StudyPage /> },
      { path: 'sets/:setId/study-words', element: <StudyWordsPage /> },
      { path: 'sets/:setId/flashcards', element: <FlashcardsPage /> },
      { path: 's/:code', element: <ShareLink /> },
      { path: '*', element: <Navigate to="/folders" replace /> },
    ],
  },
]);

export function App() {
  return (
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
}
