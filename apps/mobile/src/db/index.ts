// Native (iOS/Android) data source: on-device SQLite. Web uses index.web.ts instead, so
// expo-sqlite is never pulled into the web bundle.
import type { DataSource } from './types';
import { LocalSource } from './local';
import { SupabaseSource } from './supabase';
import { BACKEND } from '../lib/backend';

export const data: DataSource = BACKEND === 'supabase' ? new SupabaseSource() : new LocalSource();
export * from './types';
