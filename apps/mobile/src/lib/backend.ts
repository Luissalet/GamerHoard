// Single source of truth for which DataSource is active.
//   localapi  web served by server/index.mjs: reads and writes the library Faustus uses (default on web)
//   memory    browser-only demo data (EXPO_PUBLIC_BACKEND=memory)
//   local     historical SQLite on native; historical memory source on web
//   supabase  the historical account and cloud data source (explicit opt-in)
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { selectBackend } from './backendMode';
export type { Backend } from './backendMode';
const extra = (Constants.expoConfig?.extra ?? {}) as any;
const configured = String(extra.backend || process.env.EXPO_PUBLIC_BACKEND || '');
const STORAGE_KEY = 'gamerhoard_backend_v1';
let selected = '';
if (Platform.OS === 'web') {
  try { selected = (globalThis as any).localStorage?.getItem(STORAGE_KEY) || ''; } catch { /* use configured mode */ }
}
const requested = ['localapi', 'memory', 'local', 'supabase'].includes(selected) ? selected : configured;
export const BACKEND = selectBackend(requested, Platform.OS);
export const isCloud = BACKEND === 'supabase';

export function chooseBrowserBackend(backend: 'localapi' | 'memory' | 'supabase') {
  if (Platform.OS !== 'web') return;
  (globalThis as any).localStorage.setItem(STORAGE_KEY, backend);
  (globalThis as any).location.reload();
}
