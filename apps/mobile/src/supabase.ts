import { createClient } from '@supabase/supabase-js';
// Falls back to a null client when env isn't set, so the app runs on mock data out of the box.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && anon ? createClient(url, anon) : null;
export const hasBackend = !!supabase;
