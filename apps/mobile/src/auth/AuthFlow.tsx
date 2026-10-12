import React, { useState } from 'react';
import { Landing } from './Landing';
import { AuthScreen } from './AuthScreen';
import { View, Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { chooseBrowserBackend } from '../lib/backend';
import { colors, font, space } from '../theme';

type Mode = 'signin' | 'signup';

// Unauthenticated entry: show the landing hero first, then hand off to the
// login/register form. Mounted by the Gate only when cloud mode is active.
export function AuthFlow() {
  const [view, setView] = useState<'landing' | 'auth'>('landing');
  const [mode, setMode] = useState<Mode>('signup');
  const { t } = useTranslation();

  if (view === 'landing') {
    return <View style={{ flex: 1 }}><Pressable onPress={() => chooseBrowserBackend('localapi')} style={{ padding: space(3), backgroundColor: colors.surface }}><Text style={font.body}>{t('settings.sharedLibrary')}</Text></Pressable><Landing onStart={(m) => { setMode(m); setView('auth'); }} /></View>;
  }
  return <AuthScreen initialMode={mode} onBack={() => setView('landing')} />;
}
