import React, { useState } from 'react';
import { Landing } from './Landing';
import { AuthScreen } from './AuthScreen';

type Mode = 'signin' | 'signup';

// Unauthenticated entry: show the landing hero first, then hand off to the
// login/register form. Mounted by the Gate only when cloud mode is active.
export function AuthFlow() {
  const [view, setView] = useState<'landing' | 'auth'>('landing');
  const [mode, setMode] = useState<Mode>('signup');

  if (view === 'landing') {
    return <Landing onStart={(m) => { setMode(m); setView('auth'); }} />;
  }
  return <AuthScreen initialMode={mode} onBack={() => setView('landing')} />;
}
