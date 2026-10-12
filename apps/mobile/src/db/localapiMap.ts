// Pure mapping between the library JSON served by server/index.mjs and the rows the screens use.
// Kept free of React Native imports so node --test can load it.
import type { ShowRow } from './types';

export const STEAM_OFFSET = 2_000_000_000;

/** A game as GET /api/games returns it (library fields + tvdbId, lastPlayedAt, sessionCount). */
export interface ApiGame {
  id: string; tvdbId: number; title: string; state: string; favorite: boolean; rating: number | null; notes: string;
  ownedPlatforms: string[]; platforms: string[]; genres: string[]; tags: string[];
  dlcs: { title: string; completed: boolean; notes?: string; number?: number }[];
  playtimeMinutes: number; progressPercent: number; rawgId: number | null; steamAppId: number | null;
  released: string | null; coverUrl: string | null; description: string; studio?: string | null; dlcTotal?: number | null;
  addedAt: string; updatedAt: string; lastPlayedAt?: string | null; sessionCount?: number;
  steamAchievements?: { unlocked: number; total: number; syncedAt?: string } | null;
}

export const UI_STATE: Record<string, string> = { backlog: 'backlog', playing: 'watching', paused: 'stopped', completed: 'archived', dropped: 'dropped' };
export const LIB_STATE: Record<string, string> = { backlog: 'backlog', watching: 'playing', stopped: 'paused', archived: 'completed', dropped: 'dropped' };

/** RAWG's fixed genre catalogue, so genre filters work without a RAWG key. */
export const GENRES: Record<number, string> = {
  4: 'Action', 51: 'Indie', 3: 'Adventure', 5: 'RPG', 10: 'Strategy', 2: 'Shooter', 40: 'Casual', 14: 'Simulation', 7: 'Puzzle',
  11: 'Arcade', 83: 'Platformer', 1: 'Racing', 59: 'Massively Multiplayer', 15: 'Sports', 6: 'Fighting', 19: 'Family',
  28: 'Board Games', 34: 'Educational', 17: 'Card',
};
const GENRE_IDS = new Map(Object.entries(GENRES).map(([id, name]) => [name.toLowerCase(), Number(id)]));

export const genreNamesToIds = (names: string[]): string =>
  names.map((n) => GENRE_IDS.get(String(n).toLowerCase())).filter((n): n is number => n != null).join(',');
export const genreIdsToNames = (ids: string | null | undefined): string[] =>
  (ids ? ids.split(',') : []).map((s) => GENRES[Number(s)]).filter(Boolean);

/** Platform names written by Faustus ("PlayStation 5") and slugs written by the UI ("playstation5") compare equal. */
export const platformSlug = (value: string): string => String(value).toLowerCase().replace(/\s+/g, '');

export function apiGameToRow(g: ApiGame): ShowRow {
  const done = g.dlcs.filter((d) => d.completed).length;
  const total = Math.max(g.dlcTotal ?? 0, g.dlcs.length) || null;
  return {
    tvdb_id: g.tvdbId, title: g.title, state: UI_STATE[g.state] ?? 'backlog', is_favorite: g.favorite ? 1 : 0,
    watched_episodes: done, last_season: null, last_episode: null, last_watched_at: g.lastPlayedAt ?? g.updatedAt ?? g.addedAt,
    poster: g.coverUrl, tmdb_status: null, total_episodes: total, network: g.studio ?? null,
    last_aired_season: null, last_aired_episode: null, next_air_date: null, next_season: null, next_episode: null, na_checked: 1,
    // '' means "resolved, none known": the genre backfill (RAWG lookups) is skipped for these rows.
    genres: genreNamesToIds(g.genres),
    owned_platforms: g.ownedPlatforms.length ? JSON.stringify(g.ownedPlatforms.map(platformSlug)) : null,
    platforms: g.platforms.length ? JSON.stringify(g.platforms.map(platformSlug)) : null,
    playtime_minutes: g.playtimeMinutes || null, steam_appid: g.steamAppId, user_rating: g.rating, notes: g.notes || null,
  };
}
