import { Platform } from 'react-native';
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

// One shared client. Safe to import anywhere; only reads env (no network until used).
export const supabase: SupabaseClient = createClient(url || 'http://localhost', anon || 'public-anon-key', {
  auth: auth as any,
});
