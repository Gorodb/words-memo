import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TabNavigator } from './TabNavigator';
import { SetScreen } from '../screens/sets/SetScreen';
import { FlashcardsScreen } from '../screens/study/FlashcardsScreen';
import { StudyScreen } from '../screens/study/StudyScreen';
import { StudyWordsScreen } from '../screens/study/StudyWordsScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Tabs"
        component={TabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Set"
        component={SetScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
      <Stack.Screen name="Study" component={StudyScreen} />
      <Stack.Screen
        name="StudyWords"
        component={StudyWordsScreen}
        // No swipe back on iOS: leaving by accident would lose the game.
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="Flashcards"
        component={FlashcardsScreen}
        // No swipe-down to dismiss on iOS: it would fight the card swipes.
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
