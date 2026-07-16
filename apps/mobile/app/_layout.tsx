import React, { useEffect, useState } from 'react';
import '../src/pwa';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from '../src/theme';
import { isCloud } from '../src/lib/backend';
import { SessionProvider, useSession } from '../src/auth/session';
import { AuthFlow } from '../src/auth/AuthFlow';
import { SuspendedScreen } from '../src/auth/Suspended';
import { banInfo } from '../src/moderation';
import '../src/i18n';                       // initialise i18next
import { loadStoredLanguage } from '../src/i18n';
import { loadWatchRegion } from '../src/tmdb';

const qc = new QueryClient();

// Restore the saved language before rendering the UI so there's no English→Spanish flash.
function LanguageGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { Promise.all([loadStoredLanguage(), loadWatchRegion()]).finally(() => setReady(true)); }, []);
  if (!ready)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  return <>{children}</>;
}

// When the cloud backend is active, require a signed-in session before the app renders.
// In local mode this component is never mounted, so behavior is unchanged.
function Gate({ children }: { children: React.ReactNode }) {
  const { session, account, loading } = useSession();
  if (loading)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  if (!session) return <AuthFlow />;
  if (banInfo(account?.banned_until).active) return <SuspendedScreen />;
  return <>{children}</>;
}

export default function RootLayout() {
  const content = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="show/[id]" options={{ presentation: 'card' }} />
    </Stack>
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <StatusBar style="light" />
        <LanguageGate>
          {isCloud ? (
            <SessionProvider>
              <Gate>{content}</Gate>
            </SessionProvider>
          ) : (
            content
          )}
        </LanguageGate>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
