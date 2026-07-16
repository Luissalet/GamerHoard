// Push a local seed.json into the cloud app_* tables (0003) for one user.
// Uses the SERVICE (secret) key, so it bypasses RLS — server-only, never ship this in the app.
//   run.ts push <email-or-user-uuid> [seed.json]
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function pushToCloud(target: string, seedPath: string) {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env'); process.exit(2); }
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Resolve the target user's id: accept a UUID directly, or look up by email (admin API).
  let uid = target;
  if (!UUID_RE.test(target)) {
    let found: string | undefined;
    for (let page = 1; page <= 20 && !found; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      if (error) { console.error('No pude listar usuarios:', error.message); process.exit(2); }
      found = data.users.find((u: any) => (u.email || '').toLowerCase() === target.toLowerCase())?.id;
      if (data.users.length < 200) break;
    }
    if (!found) { console.error(`No hay usuario con email "${target}". Regístrate en la app primero, o pasa el UID.`); process.exit(2); }
    uid = found;
  }
  console.log(`Objetivo: profile_id ${uid}`);

  const seed: any = JSON.parse(fs.readFileSync(path.resolve(seedPath), 'utf8'));
  const p = seed.profile || {};

  // Clean slate for this user, so the push is idempotent (safe to re-run).
  for (const t of ['app_ep_state', 'app_shows', 'app_movies', 'app_recent', 'app_list_items', 'app_lists', 'app_reviews', 'app_badges'])
    await sb.from(t).delete().eq('profile_id', uid);

  const { error: pErr } = await sb.from('app_profile').upsert({
    profile_id: uid, handle: p.handle ?? null, series_clock: p.seriesClock ?? null, episodes: p.episodes ?? 0,
    movies_clock: p.moviesClock ?? null, movies: p.movies ?? 0, shows_added: p.showsAdded ?? 0, following: p.following ?? 0,
    lists: p.lists ?? 0, badges: p.badges ?? 0, reactions: p.reactions ?? 0, comments: p.comments ?? 0, character_votes: p.characterVotes ?? 0,
  }, { onConflict: 'profile_id' });
  if (pErr) { console.error('Error en app_profile:', pErr.message); process.exit(2); }

  const insert = async (table: string, rows: any[]) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from(table).insert(rows.slice(i, i + 500));
      if (error) { console.error(`Error insertando en ${table}:`, error.message); process.exit(2); }
    }
    console.log(`  ${table.padEnd(12)} ${rows.length}`);
  };

  const dedup = (rows: any[], keyf: (r: any) => any) => { const s = new Set(); return rows.filter((r) => { const k = keyf(r); if (s.has(k)) return false; s.add(k); return true; }); };

  const shows = dedup((seed.shows || []).map((s: any, i: number) => ({
    profile_id: uid, tvdb_id: s.tvdbId ?? (900000000 + i), title: s.title, state: s.state ?? 'watching',
    is_favorite: s.isFavorite ? 1 : 0, watched_episodes: s.watchedEpisodes ?? 0, last_season: s.lastSeason ?? null,
    last_episode: s.lastEpisode ?? null, last_watched_at: s.lastWatchedAt ?? null, poster: s.poster ?? null,
    tmdb_status: s.tmdbStatus ?? null, total_episodes: s.totalEpisodes ?? null, network: s.network ?? null,
    last_aired_season: s.lastAiredSeason ?? null, last_aired_episode: s.lastAiredEpisode ?? null,
  })), (r) => r.tvdb_id);

  const movies = dedup((seed.movies || []).map((m: any, i: number) => ({
    profile_id: uid, uuid: m.uuid ?? `noid:${i}`, title: m.title, slug: m.slug ?? null, year: m.year ?? null,
    watched_at: m.watchedAt ?? null, poster: m.poster ?? null, release_date: m.releaseDate ?? null, is_favorite: m.isFavorite ? 1 : 0,
  })), (r) => r.uuid);

  const recent = (seed.recent || []).map((r: any) => ({ profile_id: uid, kind: r.kind, title: r.title ?? null, season: r.season ?? null, episode: r.episode ?? null, watched_at: r.watchedAt ?? null, poster: r.poster ?? null }));
  const reviews = (seed.reviews || []).map((r: any) => ({ profile_id: uid, text: r.text, entity_type: r.entityType ?? null, title: r.title ?? null, is_spoiler: r.isSpoiler ? 1 : 0, like_count: r.likeCount ?? 0, created_at: r.createdAt ?? null }));
  const badges = (seed.badges || []).map((b: any) => ({ profile_id: uid, key: b.key ?? null, label: b.label, grp: b.group ?? null, show_tvdb: b.showTvdb ?? null }));

  console.log('Subiendo…');
  await insert('app_shows', shows);
  await insert('app_movies', movies);
  await insert('app_recent', recent);
  // Lists use a generated identity id, so insert each and keep the returned id to attach its items.
  let listItemsPushed = 0;
  for (const l of (seed.lists || [])) {
    const { data: row, error } = await sb.from('app_lists')
      .insert({ profile_id: uid, name: l.name, is_public: l.isPublic ? 1 : 0, item_count: l.itemCount ?? 0 }).select('id').single();
    if (error) { console.error('Error insertando en app_lists:', error.message); process.exit(2); }
    const itemRows = (l.items || []).map((it: any, i: number) => ({ profile_id: uid, list_id: (row as any).id, kind: it.kind, tvdb_id: it.tvdb ?? null, uuid: it.uuid ?? null, ord: i }));
    if (itemRows.length) { const { error: e2 } = await sb.from('app_list_items').insert(itemRows); if (e2) { console.error('Error insertando en app_list_items:', e2.message); process.exit(2); } listItemsPushed += itemRows.length; }
  }
  console.log(`  app_lists    ${(seed.lists || []).length} (${listItemsPushed} items)`);
  await insert('app_reviews', reviews);
  await insert('app_badges', badges);
  console.log(`\n✅ Push completo. Abre la app con EXPO_PUBLIC_BACKEND=supabase e inicia sesión como ${target}.`);
}
