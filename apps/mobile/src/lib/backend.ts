// Single source of truth for which DataSource + auth mode is active.
// Flip EXPO_PUBLIC_BACKEND=supabase in .env to run against the cloud.
export type Backend = 'local' | 'supabase';
import Constants from 'expo-constants';
const extra = (Constants.expoConfig?.extra ?? {}) as any;
export const BACKEND: Backend =
  (extra.backend || process.env.EXPO_PUBLIC_BACKEND) === 'supabase' ? 'supabase' : 'local';
export const isCloud = BACKEND === 'supabase';
