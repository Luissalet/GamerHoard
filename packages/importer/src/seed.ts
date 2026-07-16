// Build a compact, on-device seed from a TV Time export — no cloud, no TMDB required.
import type { NormProfile } from './types.ts';
import { reconstruct, formatClock } from './stats.ts';

export interface SeedShow { tvdbId: number | null; title: string; state: string; isFavorite: boolean; watchedEpisodes: number; lastSeason: number | null; lastEpisode: number | null; lastWatchedAt: string | null; poster: string | null; genres?: string[]; network?: string | null; tmdbStatus?: string | null; totalEpisodes?: number | null; }
export interface SeedMovie { uuid: string | null; title: string; slug: string | null; year: number | null; watchedAt: string | null; poster: string | null; releaseDate?: string | null; isFavorite?: boolean; }
export interface SeedListItem { kind: 'series' | 'movie'; tvdb: number | null; uuid: string | null; }
export interface SeedList { name: string; isPublic: boolean; itemCount: number; items: SeedListItem[]; }
export interface SeedRecent { kind: 'episode' | 'movie'; title: string; season: number | null; episode: number | null; watchedAt: string | null; poster?: string | null; }
export interface SeedReview { text: string; entityType: string; title: string; isSpoiler: boolean; likeCount: number; createdAt: string | null; }
export interface SeedBadge { key: string; label: string; group: 'watching' | 'discovery'; showTvdb: number | null; }
export interface Seed {
  generatedAt: string;
  profile: { handle: string | null; seriesClock: string | null; episodes: number; moviesClock: string | null; movies: number; showsAdded: number; following: number; lists: number; badges: number; reactions: number; comments: number; characterVotes: number };
  shows: SeedShow[];
  movies: SeedMovie[];
  recent: SeedRecent[];
  reviews: SeedReview[];
  badges: SeedBadge[];
  lists: SeedList[];
}

// Patch an ALREADY-BUILT seed (with baked-in posters/metadata) with favorites + list items,
// without rebuilding from scratch (which would drop the enriched posters). Idempotent.
export function patchSeedFavorites(seed: Seed, p: NormProfile): { favShows: number; favMovies: number; lists: number; listItems: number } {
  const favShows = new Set(p.favoriteShows);
  const favMovies = new Set(p.favoriteMovies);
  let fShows = 0, fMovies = 0;
  for (const s of seed.shows) { const on = s.tvdbId != null && favShows.has(s.tvdbId); s.isFavorite = on; if (on) fShows++; }
  const haveMovie = new Set(seed.movies.map((m) => m.uuid));
  for (const m of seed.movies) { const on = m.uuid != null && favMovies.has(m.uuid); m.isFavorite = on; if (on) fMovies++; }
  // Safety net: a favorite whose movie isn't already in the seed gets added (unwatched) so it still shows.
  for (const nm of p.movies) {
    if (nm.uuid && favMovies.has(nm.uuid) && !haveMovie.has(nm.uuid)) {
      seed.movies.push({ uuid: nm.uuid, title: nm.title, slug: nm.slug, year: nm.year, watchedAt: nm.watchedAt, poster: null, releaseDate: nm.releaseDate ?? null, isFavorite: true });
      haveMovie.add(nm.uuid); fMovies++;
    }
  }
  seed.lists = p.lists.map((l) => ({
    name: l.name, isPublic: l.isPublic, itemCount: l.items.length,
    items: l.items.map((it) => ({ kind: it.type, tvdb: it.tvdb, uuid: it.uuid })),
  }));
  seed.profile.lists = seed.lists.length;
  return { favShows: fShows, favMovies: fMovies, lists: seed.lists.length, listItems: seed.lists.reduce((n, l) => n + l.items.length, 0) };
}

function labelBadge(id: string): SeedBadge {
  const per = /^(\d+)-(quick-watcher|marathoner|serial-watcher)-(.+?)-bd$/.exec(id);
  if (per) {
    const [, tvdb, kind, rest] = per;
    const label =
      kind === 'quick-watcher' ? `Quick Watcher ×${rest}` :
      kind === 'serial-watcher' ? `Serial Watcher ×${rest}` :
      `Marathoner (${rest.replace('within-', 'in ').replace(/-/g, ' ')}h)`.replace('in ', 'in ').replace('h)h)', 'h)');
    return { key: id, label, group: 'watching', showTvdb: parseInt(tvdb, 10) };
  }
  const map: Record<string, string> = {
    'chose-emotion': 'Emo — chose an emotion', 'commented-episode': 'Author — commented an episode',
    'commented-show': 'Socializer — commented a show', 'got-comment-like': 'Hipster — got a comment like',
    'reported-comment': 'Patrol — reported a spoiler', 'voted-character': 'Jury — voted for a character',
    'archived-show': 'Archivist — archived a show', 'used-mobile-version': 'Nomad — used the mobile app',
    'used-web-version': 'Surfer — used the web app',
  };
  const showoff = /^show-off-(\d{4})$/.exec(id);
  if (showoff) return { key: id, label: `Rewind ${showoff[1]}`, group: 'discovery', showTvdb: null };
  const label = map[id] ?? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { key: id, label, group: 'discovery', showTvdb: null };
}

export function buildSeed(p: NormProfile, dir: string): Seed {
  const recon = reconstruct(p, dir);
  const favShows = new Set(p.favoriteShows);
  const favMovies = new Set(p.favoriteMovies);
  type Agg = { title: string; count: number; lastAt: string | null; lastS: number | null; lastE: number | null };
  const byShow = new Map<number, Agg>();
  for (const w of p.watches) {
    if (w.kind !== 'episode' || w.tvdbShowId == null) continue;
    const a = byShow.get(w.tvdbShowId) ?? { title: w.seriesName ?? '', count: 0, lastAt: null, lastS: null, lastE: null };
    a.count += 1; if (w.seriesName) a.title = w.seriesName;
    if (w.watchedAt && (!a.lastAt || w.watchedAt > a.lastAt)) a.lastAt = w.watchedAt;
    if (w.season != null && w.season >= 1 && (a.lastS == null || w.season > a.lastS || (w.season === a.lastS && (w.number ?? 0) > (a.lastE ?? 0)))) { a.lastS = w.season; a.lastE = w.number; }
    byShow.set(w.tvdbShowId, a);
  }
  const shows: SeedShow[] = p.follows.map((f) => {
    const a = f.tvdbShowId != null ? byShow.get(f.tvdbShowId) : undefined;
    const nbSeen = f.tvdbShowId != null ? (p.episodesSeenByShow[f.tvdbShowId] ?? 0) : 0;
    return { tvdbId: f.tvdbShowId, title: f.name || a?.title || 'Untitled', state: f.state, isFavorite: f.tvdbShowId != null && favShows.has(f.tvdbShowId),
      watchedEpisodes: Math.max(a?.count ?? 0, nbSeen), lastSeason: a?.lastS ?? null, lastEpisode: a?.lastE ?? null, lastWatchedAt: a?.lastAt ?? null, poster: null };
  });
  for (const [tvdb, a] of byShow) if (!shows.some((s) => s.tvdbId === tvdb))
    shows.push({ tvdbId: tvdb, title: a.title, state: 'watching', isFavorite: favShows.has(tvdb), watchedEpisodes: Math.max(a.count, p.episodesSeenByShow[tvdb] ?? 0), lastSeason: a.lastS, lastEpisode: a.lastE, lastWatchedAt: a.lastAt, poster: null });
  shows.sort((x, y) => (y.lastWatchedAt ?? '').localeCompare(x.lastWatchedAt ?? ''));

  const movies: SeedMovie[] = p.movies.map((m) => ({ uuid: m.uuid, title: m.title, slug: m.slug, year: m.year, watchedAt: m.watchedAt, poster: null, releaseDate: m.releaseDate ?? null, isFavorite: m.uuid != null && favMovies.has(m.uuid) }))
    .sort((a, b) => (b.watchedAt ?? '').localeCompare(a.watchedAt ?? ''));
  const movieSec = p.movies.reduce((n, m) => n + (m.runtimeSec ?? 0), 0);

  const epEvents: SeedRecent[] = p.watches.filter((w) => w.kind === 'episode' && w.seriesName && w.watchedAt).map((w) => ({ kind: 'episode' as const, title: w.seriesName!, season: w.season, episode: w.number, watchedAt: w.watchedAt }));
  const mvEvents: SeedRecent[] = p.movies.filter((m) => m.title && m.watchedAt).map((m) => ({ kind: 'movie' as const, title: m.title, season: null, episode: null, watchedAt: m.watchedAt }));
  const recent = [...epEvents, ...mvEvents].sort((a, b) => (b.watchedAt ?? '').localeCompare(a.watchedAt ?? '')).slice(0, 40);

  const reviews: SeedReview[] = p.comments.map((c) => ({ text: c.body, entityType: c.entityType, title: c.movieName || c.seriesName || '', isSpoiler: c.isSpoiler, likeCount: c.likeCount, createdAt: c.createdAt }))
    .filter((r) => r.text && r.text.trim()).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const badges = p.badges.map(labelBadge);

  return {
    generatedAt: new Date().toISOString(),
    profile: { handle: p.handle, seriesClock: recon.seriesTimeClock ?? null, episodes: recon.reportedEpisodes ?? recon.episodeWatchEvents,
      moviesClock: movieSec > 0 ? formatClock(movieSec) : (recon.moviesTimeClock ?? null), movies: p.movies.length, showsAdded: p.follows.length,
      following: p.friends, lists: recon.lists, badges: recon.badges, reactions: recon.reactionsRatings + recon.reactionsEmotions, comments: recon.comments, characterVotes: p.characterVotes },
    shows, movies, recent, reviews, badges,
    lists: p.lists.map((l) => ({
      name: l.name, isPublic: l.isPublic, itemCount: l.items.length,
      items: l.items.map((it) => ({ kind: it.type, tvdb: it.tvdb, uuid: it.uuid })),
    })),
  };
}
