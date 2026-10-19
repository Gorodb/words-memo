import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Folder, Languages, Layers, Settings } from 'lucide-react-native';
import { FoldersStack } from './FoldersStack';
import { SetsScreen } from '../screens/sets/SetsScreen';
import { LanguagesScreen } from '../screens/languages/LanguagesScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

type IconProps = { color: string; size: number };

const FoldersIcon = (p: IconProps) => <Folder {...p} />;
const SetsIcon = (p: IconProps) => <Layers {...p} />;
const LanguagesIcon = (p: IconProps) => <Languages {...p} />;
const SettingsIcon = (p: IconProps) => <Settings {...p} />;

export function TabNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen
        name="FoldersTab"
        component={FoldersStack}
        options={{
          title: 'Folders',
          headerShown: false, // the nested stack renders its own header
          tabBarIcon: FoldersIcon,
        }}
      />
      <Tab.Screen
        name="SetsTab"
        component={SetsScreen}
        options={{ title: 'Sets', tabBarIcon: SetsIcon }}
      />
      <Tab.Screen
        name="LanguagesTab"
        component={LanguagesScreen}
        options={{ title: 'Languages', tabBarIcon: LanguagesIcon }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{ title: 'Settings', tabBarIcon: SettingsIcon }}
      />
    </Tab.Navigator>
  );
}
