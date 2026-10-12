// Native (iOS/Android) data source. Web uses index.web.ts instead, so expo-sqlite is
// never pulled into the web bundle. Backend is chosen at load time by EXPO_PUBLIC_BACKEND:
//   local (default) -> on-device SQLite;  supabase -> cloud (see ./supabase).
import { BACKEND } from '../lib/backend';
import type { DataSource } from './types';
import { LocalSource } from './local';
import { SupabaseSource } from './supabase';

export const data: DataSource = BACKEND === 'supabase' ? new SupabaseSource() : new LocalSource();
export * from './types';
