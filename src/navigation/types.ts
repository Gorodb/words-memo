import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ID } from '../domain/types';

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
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
