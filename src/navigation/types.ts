import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ID } from '../domain/types';
import type { StudyModeId } from '../features/study/modes';

export type FoldersStackParamList = {
  Folders: undefined;
  Folder: { folderId: ID; title: string };
};

export type TabParamList = {
  FoldersTab: NavigatorScreenParams<FoldersStackParamList>;
  SetsTab: undefined;
  LanguagesTab: undefined;
  SettingsTab: undefined;
};

/** Screens pushed above the tab bar, reachable from both Folders and Sets tabs. */
export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Set: { setId: ID; title: string };
  Study: { wordIds: ID[]; modeId: StudyModeId };
  /** Flashcards over the set's words that are not learned yet. */
  Flashcards: { setId: ID };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
