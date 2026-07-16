// Upsert resolved catalog + a user's tracking into Supabase (service-role).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function makeClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to import.');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function upsertShow(db: SupabaseClient, s: { tmdb_id: number; tvdb_id?: number; title: string }) {
  const { data, error } = await db.from('shows').upsert(s, { onConflict: 'tmdb_id' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
export async function upsertMovie(db: SupabaseClient, m: { tmdb_id: number; title: string }) {
  const { data, error } = await db.from('movies').upsert(m, { onConflict: 'tmdb_id' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
// batch insert watches (idempotent thanks to the unique constraint; ignore duplicates)
export async function insertWatches(db: SupabaseClient, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const { error } = await db.from('watches').upsert(rows, { onConflict: 'profile_id,target_type,episode_id,movie_id,rewatch_index', ignoreDuplicates: true });
  if (error) throw error;
}
