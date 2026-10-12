// Local web data source: the browser talks to server/index.mjs, which reads and writes the
// same library file as the Faustus MCP tools (~/.gamerhoard/library.json). There is no
// shared game library. Historical collections reuse the original browser storage adapter.
import type {
  DataSource, Profile, ShowRow, RecentRow, ListRow, ListItemRow, MovieRow, ReviewRow, BadgeRow, AddShow, AddMovie, SteamGame, GameSession,
} from './types';
import { STEAM_OFFSET, apiGameToRow, genreIdsToNames, type ApiGame } from './localapiMap';
import { MemorySource } from './memory';

const BASE = (typeof process !== 'undefined' && (process.env as any)?.EXPO_PUBLIC_GAMERHOARD_URL) || '';

export class LocalApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new LocalApiError(0, 'The local GamerHoard server is not reachable.');
  }
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) throw new LocalApiError(res.status, json?.error || `Request failed (${res.status})`);
  return json as T;
}

export class LocalApiSource extends MemorySource implements DataSource {
  private rows = new Map<number, ShowRow>();
  private okPromise: Promise<void> | null = null;

  /** Pull-through cache of the last rows read, so unchanged metadata writes can be skipped. */
  private remember(rows: ShowRow[]) { for (const r of rows) this.rows.set(r.tvdb_id, r); return rows; }
  private patch(tvdbId: number, body: Record<string, unknown>) {
    return request('PATCH', `/api/games/${tvdbId}`, body).then((g: any) => { if (g?.tvdbId) this.rows.set(g.tvdbId, apiGameToRow(g as ApiGame)); });
  }

  ready() {
    if (!this.okPromise) this.okPromise = super.ready().then(() => request<unknown>('GET', '/api/health')).then(() => undefined, (e) => { this.okPromise = null; throw e; });
    return this.okPromise;
  }
  async importData(seed: unknown): Promise<void> {
    if (Array.isArray((seed as any)?.games)) await request('POST', '/api/import', seed);
    else await super.importData(seed);
  }
  private async all(): Promise<ShowRow[]> {
    const out: ShowRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await request<{ total: number; games: ApiGame[] }>('GET', `/api/games?limit=500&offset=${offset}`);
      out.push(...page.games.map(apiGameToRow));
      if (out.length >= page.total || page.games.length === 0) break;
    }
    return this.remember(out);
  }
  async getShows() { return (await this.all()).sort((a, b) => (b.last_watched_at ?? '').localeCompare(a.last_watched_at ?? '')); }
  async getContinueWatching(limit = 20) {
    return (await this.getShows()).filter((s) => s.state === 'watching').slice(0, limit);
  }
  async getFavorites(limit = 60) { return (await this.getShows()).filter((s) => s.is_favorite).slice(0, limit); }
  async getShowById(tvdbId: number) {
    try {
      const row = apiGameToRow(await request<ApiGame>('GET', `/api/games/${tvdbId}`));
      this.rows.set(row.tvdb_id, row);
      return row;
    } catch (e) {
      if (e instanceof LocalApiError && e.status === 404) return null;
      throw e;
    }
  }
  async isShowInLibrary(tvdbId: number) { return (await this.getShowById(tvdbId)) != null; }

  async getRecent(limit = 30): Promise<RecentRow[]> {
    const res = await request<{ sessions: any[] }>('GET', `/api/sessions?limit=${Math.min(500, limit)}`);
    const shared: RecentRow[] = res.sessions.map((s, i) => ({
      id: i + 1, kind: 'game', title: s.title, season: null, episode: null, watched_at: s.playedAt,
      poster: s.coverUrl ?? null, show_tvdb: s.tvdbId ?? null, movie_uuid: null, minutes: s.minutes, notes: s.notes || null,
    }));
    return [...shared, ...await super.getRecent(limit)].sort((a, b) => (b.watched_at || '').localeCompare(a.watched_at || '')).slice(0, limit);
  }
  async getSessions(tvdbId: number): Promise<GameSession[]> {
    const res = await request<{ sessions: GameSession[] }>('GET', `/api/games/${tvdbId}/sessions?limit=50`);
    return res.sessions;
  }
  async logSession(tvdbId: number, s: { minutes: number; playedAt?: string; notes?: string }) {
    await request('POST', `/api/games/${tvdbId}/sessions`, s);
    await this.getShowById(tvdbId);
  }

  async setShowState(tvdbId: number, state: 'backlog' | 'watching' | 'stopped' | 'archived' | 'dropped') {
    const LIB = { backlog: 'backlog', watching: 'playing', stopped: 'paused', archived: 'completed', dropped: 'dropped' } as const;
    await this.patch(tvdbId, { state: LIB[state] });
  }
  async setShowFavorite(tvdbId: number, favorite: boolean) { await this.patch(tvdbId, { favorite }); }
  async setShowRating(tvdbId: number, rating: number | null) { await this.patch(tvdbId, { rating }); }
  async setShowNotes(tvdbId: number, notes: string | null) { await this.patch(tvdbId, { notes: notes ?? '' }); }
  async setShowPoster(tvdbId: number, poster: string | null) { if (poster) await this.patch(tvdbId, { coverUrl: poster }); }
  async setShowGenres(tvdbId: number, genres: string | null) {
    const names = genreIdsToNames(genres);
    const known = this.rows.get(tvdbId);
    if (known && (known.genres ?? '') === (genres ?? '')) return;
    if (names.length) await this.patch(tvdbId, { genres: names });
  }
  async setOwnedPlatforms(tvdbId: number, ownedJson: string | null) {
    let list: unknown = [];
    try { list = ownedJson ? JSON.parse(ownedJson) : []; } catch { /* keep empty */ }
    await this.patch(tvdbId, { ownedPlatforms: Array.isArray(list) ? list : [] });
  }
  async setPlatforms(tvdbId: number, platformsJson: string | null) {
    let list: unknown = [];
    try { list = platformsJson ? JSON.parse(platformsJson) : []; } catch { /* keep empty */ }
    const known = this.rows.get(tvdbId);
    if (known && (known.platforms ?? '') === (platformsJson ?? '')) return;
    await this.patch(tvdbId, { platforms: Array.isArray(list) ? list : [] });
  }
  async setShowMeta(tvdbId: number, m: { tmdb_status: string | null; total_episodes: number | null; network: string | null; last_aired_season: number | null; last_aired_episode: number | null }) {
    const known = this.rows.get(tvdbId);
    if (known && known.total_episodes === m.total_episodes && (known.network ?? null) === (m.network ?? null)) return;
    const body: Record<string, unknown> = { dlcTotal: m.total_episodes };
    if (m.network) body.studio = m.network;
    await this.patch(tvdbId, body);
  }
  async addShow(p: AddShow) {
    const steam = p.tvdb_id >= STEAM_OFFSET;
    const out = await request<{ game: ApiGame }>('POST', '/api/games', {
      title: p.title, state: ({ backlog: 'backlog', watching: 'playing', stopped: 'paused', archived: 'completed', dropped: 'dropped' } as Record<string, string>)[p.state ?? 'backlog'] ?? 'backlog',
      ...(steam ? { steamAppId: p.tvdb_id - STEAM_OFFSET } : p.tvdb_id > 0 && p.tvdb_id < 1_000_000_000 ? { rawgId: p.tvdb_id } : {}),
      coverUrl: p.poster ?? undefined, studio: p.network ?? undefined, dlcTotal: p.total_episodes ?? undefined,
    });
    this.rows.set(out.game.tvdbId, apiGameToRow(out.game));
  }
  async addSteamGame(p: SteamGame) {
    await request('POST', '/api/games', {
      title: p.title, steamAppId: p.steam_appid, playtimeMinutes: p.playtime_minutes, ownedPlatforms: ['PC'], coverUrl: p.poster ?? undefined,
      state: ({ backlog: 'backlog', watching: 'playing', stopped: 'paused' } as Record<string, string>)[p.state] ?? 'backlog',
    });
  }
  async removeShow(tvdbId: number) { await request('DELETE', `/api/games/${tvdbId}`); this.rows.delete(tvdbId); }

  async getWatchedEpisodes(tvdbShow: number) {
    const g = await request<ApiGame>('GET', `/api/games/${tvdbShow}`).catch(() => null);
    return (g?.dlcs ?? []).filter((d) => d.completed && d.number).map((d) => ({ season: 1, episode: d.number as number }));
  }
  async getDlcStates(tvdbShow: number) {
    const g = await request<ApiGame>('GET', `/api/games/${tvdbShow}`).catch(() => null);
    return (g?.dlcs ?? []).map((d) => ({ title: d.title, completed: d.completed, number: d.number }));
  }
  async setEpisodeWatched(tvdbShow: number, _season: number, episode: number, watched: boolean, title?: string) {
    let name = title;
    if (!name) name = (await this.getDlcStates(tvdbShow)).find((d) => d.number === episode)?.title;
    if (!name) throw new LocalApiError(400, 'DLC title is required');
    await request('PUT', `/api/games/${tvdbShow}/dlc`, { title: name, completed: watched, number: episode });
    await this.getShowById(tvdbShow);
  }
  async seedEpState() { /* DLC state lives in the library */ }
  async setProgress() { throw new LocalApiError(400, 'Shared game progress comes from DLC completion and play sessions. Use the browser library for historical episode counters.'); }
  async markWatched(tvdbId: number) { await this.setShowState(tvdbId, 'archived'); }
  async setShowNextAir() { throw new LocalApiError(400, 'Episode air dates belong to the browser or cloud library, not shared games.'); }
  async rewatchEpisode() { throw new LocalApiError(400, 'Log another play session for a shared game. Episode rewatches belong to the browser or cloud library.'); }
  async getEpisodeRewatches() { return []; }

  // Lists, movies, reviews, badges and their writes use MemorySource's original
  // browser persistence, while game writes above keep using the shared native API.
}
