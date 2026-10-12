import type { ShowRow } from './db/types';
import type { ApiGame } from './db/localapiMap';
const platforms = (text: string | null | undefined): string[] => {
  try { const value = JSON.parse(text || '[]'); return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : []; }
  catch { return []; }
};

/** Historical sources identify their games by tvdb_id; do not invent a shared-library UUID. */
export function sourceGame(row: ShowRow): ApiGame {
  return {
    id: String(row.tvdb_id), tvdbId: row.tvdb_id, title: row.title,
    state: ({ watching: 'playing', stopped: 'paused', archived: 'completed' } as Record<string, string>)[row.state] || row.state,
    favorite: !!row.is_favorite, rating: row.user_rating ?? null, notes: row.notes || '',
    ownedPlatforms: platforms(row.owned_platforms),
    platforms: platforms(row.platforms), genres: [], tags: [], dlcs: [],
    playtimeMinutes: row.playtime_minutes || 0, progressPercent: 0,
    rawgId: row.steam_appid ? null : row.tvdb_id, steamAppId: row.steam_appid || null,
    released: null, coverUrl: row.poster, description: '', studio: row.network,
    addedAt: '', updatedAt: row.last_watched_at || '',
  };
}
