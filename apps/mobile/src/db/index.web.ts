// Web data source. Never imports ./local (keeps expo-sqlite out of the web bundle).
// local (default) -> in-memory (MemorySource);  supabase -> cloud (see ./supabase).
import { BACKEND } from '../lib/backend';
import type { DataSource } from './types';
import { MemorySource } from './memory';
import { SupabaseSource } from './supabase';

export const data: DataSource = BACKEND === 'supabase' ? new SupabaseSource() : new MemorySource();
export * from './types';
