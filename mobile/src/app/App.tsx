import React, { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import BootSplash from 'react-native-bootsplash';
import { RootNavigator } from '../navigation/RootNavigator';
import { ThemeProvider, useAppTheme } from '../theme/ThemeProvider';
import { bootstrap } from './bootstrap';

function ThemedApp() {
  const { isDark, navigationTheme } = useAppTheme();
  return (
    <NavigationContainer
      theme={navigationTheme}
      onReady={() => BootSplash.hide({ fade: true })}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <BottomSheetModalProvider>
        <RootNavigator />
      </BottomSheetModalProvider>
    </NavigationContainer>
  );
}

function StartupError({ error }: { error: Error }) {
  useEffect(() => {
    BootSplash.hide({ fade: true });
  }, []);
  return (
    <View style={styles.error}>
      <Text style={styles.errorTitle}>Could not open the database</Text>
      <Text>{error.message}</Text>
    </View>
  );
}

export default function App() {
  const [startupError] = useState<Error | null>(() => {
    try {
      bootstrap();
      return null;
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {startupError ? (
          <StartupError error={startupError} />
        ) : (
          <ThemeProvider>
            <ThemedApp />
          </ThemeProvider>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  error: { flex: 1, justifyContent: 'center', padding: 24 },
  errorTitle: { fontSize: 17, fontWeight: '600', marginBottom: 8 },
});
