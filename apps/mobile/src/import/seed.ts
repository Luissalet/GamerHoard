// In-app port of packages/importer/src/seed.ts + stats.ts — builds the Seed the
// data sources load, straight from the parsed export (no TMDB required; posters
// and genres are backfilled lazily by the app afterwards).
import { makeReader, type Files, type NormProfile } from './parse';

export interface SeedShow { tvdbId: number | null; title: string; state: string; isFavorite: boolean; watchedEpisodes: number; lastSeason: number | null; lastEpisode: number | null; lastWatchedAt: string | null; poster: string | null; network?: string | null; tmdbStatus?: string | null; totalEpisodes?: number | null }
export interface SeedMovie { uuid: string | null; title: string; slug: string | null; year: number | null; watchedAt: string | null; poster: string | null; releaseDate?: string | null; isFavorite?: boolean }
export interface SeedListItem { kind: 'series' | 'movie'; tvdb: number | null; uuid: string | null }
export interface SeedList { name: string; isPublic: boolean; itemCount: number; items: SeedListItem[] }
export interface SeedRecent { kind: 'episode' | 'movie'; title: string; season: number | null; episode: number | null; watchedAt: string | null; poster?: string | null }
export interface SeedReview { text: string; entityType: string; title: string; isSpoiler: boolean; likeCount: number; createdAt: string | null }
export interface SeedBadge { key: string; label: string; group: 'watching' | 'discovery'; showTvdb: number | null }
export interface Seed {
  generatedAt: string;
  profile: { handle: string | null; seriesClock: string | null; episodes: number; moviesClock: string | null; movies: number; showsAdded: number; following: number; lists: number; badges: number; reactions: number; comments: number; characterVotes: number };
  shows: SeedShow[]; movies: SeedMovie[]; recent: SeedRecent[]; reviews: SeedReview[]; badges: SeedBadge[]; lists: SeedList[];
}

// TV Time renders its "clock" with 30-day months and 24-hour days.
export function formatClock(seconds: number): string {
  const totalHours = seconds / 3600;
  let days = Math.floor(totalHours / 24);
  const months = Math.floor(days / 30);
  days -= months * 30;
  const hours = Math.round(totalHours - Math.floor(totalHours / 24) * 24);
  return `${months}mo ${days}d ${hours}h`;
}

function labelBadge(id: string): SeedBadge {
  const per = /^(\d+)-(quick-watcher|marathoner|serial-watcher)-(.+?)-bd$/.exec(id);
  if (per) {
    const [, tvdb, kind, rest] = per;
    const label =
      kind === 'quick-watcher' ? `Quick Watcher ×${rest}` :
      kind === 'serial-watcher' ? `Serial Watcher ×${rest}` :
      `Marathoner (${rest.replace('within-', 'in ').replace(/-/g, ' ')}h)`;
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

export function buildSeed(p: NormProfile, files: Files): Seed {
  // authoritative totals row (key=tracking-stats) → the profile clocks
  const readCsv = makeReader(files);
  const statsRow = readCsv('tracking-prod-records-v2.csv').find((x) => (x.key || '').startsWith('tracking-stats'));
  const seriesClock = statsRow ? formatClock(parseInt(statsRow.total_series_runtime || '0', 10)) : null;
  const moviesClockStats = statsRow ? formatClock(parseInt(statsRow.total_movies_runtime || '0', 10)) : null;
  const reportedEpisodes = statsRow ? parseInt(statsRow.ep_watch_count || '0', 10) : null;

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
  const episodeEvents = p.watches.filter((w) => w.kind === 'episode').length;

  return {
    generatedAt: new Date().toISOString(),
    profile: {
      handle: p.handle, seriesClock, episodes: reportedEpisodes ?? episodeEvents,
      moviesClock: movieSec > 0 ? formatClock(movieSec) : moviesClockStats, movies: p.movies.length,
      showsAdded: p.follows.length, following: p.friends, lists: p.lists.length, badges: p.badges.length,
      reactions: p.reactions, comments: p.comments.length, characterVotes: p.characterVotes,
    },
    shows, movies, recent, reviews, badges,
    lists: p.lists.map((l) => ({ name: l.name, isPublic: l.isPublic, itemCount: l.items.length, items: l.items.map((it) => ({ kind: it.type, tvdb: it.tvdb, uuid: it.uuid })) })),
  };
}

export interface ImportSummary { shows: number; episodes: number; moviesWatched: number; moviesPending: number; favorites: number; lists: number; badges: number; comments: number }
export function summarize(seed: Seed): ImportSummary {
  return {
    shows: seed.shows.length,
    episodes: seed.profile.episodes,
    moviesWatched: seed.movies.filter((m) => m.watchedAt).length,
    moviesPending: seed.movies.filter((m) => !m.watchedAt).length,
    favorites: seed.shows.filter((s) => s.isFavorite).length + seed.movies.filter((m) => m.isFavorite).length,
    lists: seed.lists.length,
    badges: seed.badges.length,
    comments: seed.reviews.length,
  };
}
