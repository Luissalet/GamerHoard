import { Platform, AppState } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { switchableAuthStorage } from './authStorage';
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as any;
const url = extra.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const anon = extra.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabaseConfigured = Boolean(url && anon);

// Session persistence goes through switchableAuthStorage, which honours the
// "Keep me signed in" choice: persistent storage when checked (localStorage /
// AsyncStorage), ephemeral when unchecked (sessionStorage / in-memory).
const auth = {
  storage: switchableAuthStorage,
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: Platform.OS === 'web',
};

// React Native's fetch has NO timeout: on a cold radio / stalled connection a request
// (including the auth token refresh at cold start) can hang forever, which used to leave
// the app stuck on the boot spinner until force-closed. Give every request through the
// Supabase client a hard deadline so failures are bounded and retryable.
const FETCH_TIMEOUT_MS = 20000;
const boundedFetch: typeof fetch = (input: any, init?: any) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const callerSignal: AbortSignal | undefined = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) ctrl.abort();
    else callerSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

// One shared client. Safe to import anywhere; only reads env (no network until used).
export const supabase: SupabaseClient = createClient(url || 'http://localhost', anon || 'public-anon-key', {
  auth: auth as any,
  global: { fetch: boundedFetch },
});

// Native: run the token auto-refresh only while the app is foregrounded (the
// Supabase-recommended React Native pattern). Backgrounded timers on Android are
// unreliable and a refresh attempt racing a cold start contributed to boot hangs.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
