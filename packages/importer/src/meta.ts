// Enrich shows with TMDB status + total episodes + genres + network (for categories & stats).
import fs from 'node:fs';
import path from 'node:path';
import { Tmdb } from './tmdb.ts';

interface Meta { status: string | null; episodes: number | null; genres: string[]; network: string | null; lastAiredSeason: number | null; lastAiredEpisode: number | null }

async function pool<T>(items: T[], worker: (t: T) => Promise<void>, concurrency: number) {
  const q = [...items];
  const run = async (): Promise<void> => { const it = q.shift(); if (it === undefined) return; await worker(it); return run(); };
  await Promise.all(Array.from({ length: concurrency }, run));
}

export async function enrichMeta(seedPath: string, opts: { tmdb: Tmdb; limit?: number; concurrency?: number }) {
  const { tmdb, limit = Infinity, concurrency = 12 } = opts;
  const seed: any = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const cacheFile = path.join(path.dirname(seedPath), '.meta-cache.json');
  const cache: Record<string, Meta | null> = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};

  const targets = seed.shows
    .filter((s: any) => { if (!s.tvdbId) return false; const c = cache[String(s.tvdbId)]; if (c === undefined) return true; if (c === null) return false; return !('lastAiredSeason' in c); })
    .sort((a: any, b: any) => (b.lastWatchedAt ? 1 : 0) - (a.lastWatchedAt ? 1 : 0) || b.watchedEpisodes - a.watchedEpisodes)
    .slice(0, limit);
  let fetched = 0;
  await pool(targets, async (s: any) => {
    try {
      const found = await tmdb.findByTvdb('show', s.tvdbId);
      if (found?.tmdbId) {
        const d: any = await tmdb.getTv(found.tmdbId);
        cache[String(s.tvdbId)] = { status: d?.status ?? null, episodes: d?.number_of_episodes ?? null, genres: (d?.genres ?? []).map((g: any) => g.name), network: d?.networks?.[0]?.name ?? null, lastAiredSeason: d?.last_episode_to_air?.season_number ?? null, lastAiredEpisode: d?.last_episode_to_air?.episode_number ?? null };
      } else cache[String(s.tvdbId)] = null;
    } catch { cache[String(s.tvdbId)] = null; }
    fetched++;
  }, concurrency);

  let withMeta = 0;
  for (const s of seed.shows) {
    const m = cache[String(s.tvdbId)];
    if (m) { s.tmdbStatus = m.status; s.totalEpisodes = m.episodes; s.genres = m.genres; s.network = m.network; s.lastAiredSeason = m.lastAiredSeason; s.lastAiredEpisode = m.lastAiredEpisode; withMeta++; }
  }
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2));
  return { fetched, withMeta, total: seed.shows.length };
}
