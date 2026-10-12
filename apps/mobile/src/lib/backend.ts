// Single source of truth for which DataSource + auth mode is active.
// Flip EXPO_PUBLIC_BACKEND=supabase in .env to run against the cloud.
export type Backend = 'local' | 'supabase';
import Constants from 'expo-constants';
const extra = (Constants.expoConfig?.extra ?? {}) as any;
// Cloud by default; only an explicit 'local' opts out. Login is always required either way.
export const BACKEND: Backend =
  (extra.backend || process.env.EXPO_PUBLIC_BACKEND) === 'local' ? 'local' : 'supabase';
export const isCloud = BACKEND === 'supabase';
