import React, { useEffect, useState } from 'react';
import '../src/pwa';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from '../src/theme';
import '../src/i18n';                       // initialise i18next
import { loadStoredLanguage } from '../src/i18n';
import { installCopilot } from '../src/copilot';

const qc = new QueryClient();

// Faustus copilot hook (web): window.hoardCopilot, read by the launcher the local server injects.
installCopilot();

// Restore the saved language before rendering the UI so there's no English→Spanish flash.
function LanguageGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { loadStoredLanguage().finally(() => setReady(true)); }, []);
  if (!ready)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  return <>{children}</>;
}

// Local single-user app: no accounts and no login. The data lives in the shared library file.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <StatusBar style="light" />
        <LanguageGate>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="show/[id]" options={{ presentation: 'card' }} />
          </Stack>
        </LanguageGate>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
