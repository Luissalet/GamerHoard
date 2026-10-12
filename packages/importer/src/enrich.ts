// Enrich a seed with poster art.
//  • Shows  -> TMDB (find by TheTVDB id) if key set, else/also TVMaze (keyless) fallback.
//  • Movies -> TMDB search by English slug + release year (from the v1 ledger).
// Cached to .poster-cache.json so re-runs are instant and API-friendly.
import fs from 'node:fs';
import path from 'node:path';
import { Tmdb } from './tmdb.ts';

interface Cache { shows: Record<string, string | null>; movies: Record<string, string | null> }

async function tvmaze(tvdb: number): Promise<string | null> {
  const r = await fetch(`https://api.tvmaze.com/lookup/shows?thetvdb=${tvdb}`);
  if (!r.ok) return null;
  const j: any = await r.json();
  return j.image?.medium ?? j.image?.original ?? null;
}
async function pool<T>(items: T[], worker: (t: T) => Promise<void>, concurrency: number) {
  const q = [...items];
  const run = async (): Promise<void> => { const it = q.shift(); if (it === undefined) return; await worker(it); return run(); };
  await Promise.all(Array.from({ length: concurrency }, run));
}
const movieKey = (m: any) => m.uuid || `${m.slug || m.title}|${m.year ?? ''}`;
const movieQuery = (m: any) => (m.slug ? m.slug.replace(/-/g, ' ').replace(/\s*\(\d{4}\)\s*/, '').trim() : m.title);

export async function enrichSeed(
  seedPath: string,
  opts: { limit?: number; concurrency?: number; delayMs?: number; tmdb?: Tmdb | null } = {}
) {
  const { limit = Infinity, concurrency = 4, delayMs = 100, tmdb = null } = opts;
  const seed: any = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const dir = path.dirname(seedPath);
  const cacheFile = path.join(dir, '.poster-cache.json');
  let cache: Cache = { shows: {}, movies: {} };
  if (fs.existsSync(cacheFile)) cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  else if (fs.existsSync(path.join(dir, '.tvmaze-cache.json'))) cache.shows = JSON.parse(fs.readFileSync(path.join(dir, '.tvmaze-cache.json'), 'utf8'));
  cache.shows ??= {}; cache.movies ??= {};

  // ---- shows ----
  const showTargets = seed.shows
    .filter((s: any) => s.tvdbId && !(String(s.tvdbId) in cache.shows))
    .sort((a: any, b: any) => (b.lastWatchedAt ? 1 : 0) - (a.lastWatchedAt ? 1 : 0) || b.watchedEpisodes - a.watchedEpisodes)
    .slice(0, limit);
  let fetchedShows = 0;
  await pool(showTargets, async (s: any) => {
    let poster: string | null = null;
    if (tmdb) { try { const r = await tmdb.findByTvdb('show', s.tvdbId); poster = Tmdb.image(r?.posterPath); } catch { /**/ } }
    if (!poster) { try { poster = await tvmaze(s.tvdbId); } catch { poster = null; } }
    cache.shows[String(s.tvdbId)] = poster; fetchedShows++;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }, concurrency);

  // ---- movies (TMDB search by slug+year) ----
  let fetchedMovies = 0;
  if (tmdb) {
    const targets = (seed.movies || []).filter((m: any) => !(movieKey(m) in cache.movies)).slice(0, limit);
    await pool(targets, async (m: any) => {
      try { const r = await tmdb.searchMovie(movieQuery(m), m.year ?? undefined); cache.movies[movieKey(m)] = Tmdb.image(r?.posterPath); if (r?.releaseDate) m.releaseDate = r.releaseDate; }
      catch { cache.movies[movieKey(m)] = null; }
      fetchedMovies++;
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }, concurrency);
  }

  // ---- apply back to seed ----
  let showsWithPoster = 0, moviesWithPoster = 0;
  for (const s of seed.shows) { const p = cache.shows[String(s.tvdbId)]; s.poster = p ?? null; if (p) showsWithPoster++; }
  for (const m of (seed.movies || [])) { const p = cache.movies[movieKey(m)]; m.poster = p ?? null; if (p) moviesWithPoster++; }
  const showByTitle = new Map<string, string>(); for (const s of seed.shows) if (s.poster) showByTitle.set(s.title, s.poster);
  const movieByTitle = new Map<string, string>(); for (const m of (seed.movies || [])) if (m.poster) movieByTitle.set(m.title, m.poster);
  for (const r of seed.recent) r.poster = (r.kind === 'movie' ? movieByTitle.get(r.title) : showByTitle.get(r.title)) ?? null;

  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2));
  return { fetchedShows, fetchedMovies, showsWithPoster, moviesWithPoster, totalShows: seed.shows.length, totalMovies: (seed.movies || []).length };
}
