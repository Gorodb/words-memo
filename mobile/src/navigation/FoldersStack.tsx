import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FoldersScreen } from '../screens/folders/FoldersScreen';
import { FolderScreen } from '../screens/folders/FolderScreen';
import type { FoldersStackParamList } from './types';

const Stack = createNativeStackNavigator<FoldersStackParamList>();

export function FoldersStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Folders"
        component={FoldersScreen}
        options={{ title: 'Folders' }}
      />
      <Stack.Screen
        name="Folder"
        component={FolderScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
    </Stack.Navigator>
  );
}
