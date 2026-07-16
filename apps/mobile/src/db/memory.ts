// Web / SSR fallback: same DataSource contract, backed by the seed JSON held in memory.
// expo-sqlite is a native module (no browser build without WASM + COOP/COEP headers), so on
// web we skip it entirely. Screens are identical; only the storage engine differs.
import type { DataSource, Profile, ShowRow, RecentRow, ListRow, ListItemRow, MovieRow, ReviewRow, BadgeRow, AddShow, AddMovie, SteamGame } from './types';
import seed from '../../assets/seed.json';
import { localToday } from '../dates';

type RawListItem = { kind: 'series' | 'movie'; tvdb: number | null; uuid: string | null };

export class MemorySource implements DataSource {
  private profileRow!: Profile;
  private shows: ShowRow[] = [];
  private recent: RecentRow[] = [];
  private lists: ListRow[] = [];
  private listItemsByList = new Map<number, RawListItem[]>();
  private movies: MovieRow[] = [];
  private reviews: ReviewRow[] = [];
  private badges: BadgeRow[] = [];
  private inited = false;
  private epState = new Map<number, Set<string>>();
  private epSeeded = new Set<number>();
  private addedShows: ShowRow[] = [];
  private addedMovies: MovieRow[] = [];
  private mvChecked = new Set<string>();
  private epRw = new Map<number, Map<string, number>>();

  /** localStorage.setItem that survives QuotaExceeded: evicts any tmdb cache keys and retries. */
  private safeSet(key: string, val: string) {
    const g: any = globalThis as any;
    if (!g.localStorage) return;
    try { g.localStorage.setItem(key, val); return; } catch { /* quota: evict cache below */ }
    try {
      const dead: string[] = [];
      for (let i = 0; i < g.localStorage.length; i++) { const k = g.localStorage.key(i); if (k && k.startsWith('tmdb1:')) dead.push(k); }
      for (const k of dead) g.localStorage.removeItem(k);
      g.localStorage.setItem(key, val);
    } catch { /* still over quota: nothing else we can safely drop */ }
  }

  private emptyProfile(): Profile { return { handle: null, series_clock: null, episodes: 0, movies_clock: null, movies: 0, shows_added: 0, following: 0, lists: 0, badges: 0, reactions: 0, comments: 0, character_votes: 0 }; }
  // The user's own import (localStorage) beats the bundled sample seed.
  private importedSeed(): any | null {
    try {
      const raw = (globalThis as any).localStorage?.getItem('wh_seed_v1');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  async ready() {
    if (this.inited) return;
    try { if ((globalThis as any).localStorage?.getItem('wh_cleared') === '1') { this.profileRow = this.emptyProfile(); this.inited = true; return; } } catch { /* ignore */ }
    const s: any = this.importedSeed() ?? seed;
    this.profileRow = {
      handle: s.profile.handle, series_clock: s.profile.seriesClock, episodes: s.profile.episodes,
      movies_clock: s.profile.moviesClock, movies: s.profile.movies, shows_added: s.profile.showsAdded,
      following: s.profile.following, lists: s.profile.lists, badges: s.profile.badges,
      reactions: s.profile.reactions, comments: s.profile.comments, character_votes: s.profile.characterVotes ?? 0,
    };
    this.shows = s.shows.map((x: any, i: number) => ({
      tvdb_id: x.tvdbId ?? -(i + 1), title: x.title, state: x.state, is_favorite: x.isFavorite ? 1 : 0,
      watched_episodes: x.watchedEpisodes, last_season: x.lastSeason, last_episode: x.lastEpisode, last_watched_at: x.lastWatchedAt, poster: x.poster ?? null, tmdb_status: x.tmdbStatus ?? null, total_episodes: x.totalEpisodes ?? null, network: x.network ?? null, last_aired_season: x.lastAiredSeason ?? null, last_aired_episode: x.lastAiredEpisode ?? null, next_air_date: x.nextAirDate ?? null, next_season: x.nextSeason ?? null, next_episode: x.nextEpisode ?? null, na_checked: 0,
    }));
    this.recent = s.recent.map((x: any, i: number) => ({ id: i + 1, kind: x.kind, title: x.title, season: x.season, episode: x.episode, watched_at: x.watchedAt, poster: x.poster ?? null }));
    this.lists = s.lists.map((x: any, i: number) => ({ id: i + 1, name: x.name, is_public: x.isPublic ? 1 : 0, item_count: x.itemCount }));
    this.listItemsByList = new Map(s.lists.map((x: any, i: number) => [i + 1, (x.items ?? []) as RawListItem[]]));
    this.movies = (s.movies || []).map((x: any) => ({ uuid: x.uuid ?? null, title: x.title, slug: x.slug ?? null, year: x.year ?? null, watched_at: x.watchedAt ?? null, poster: x.poster ?? null, release_date: x.releaseDate ?? null, is_favorite: x.isFavorite ? 1 : 0 }));
    this.reviews = (s.reviews || []).map((x: any, i: number) => ({ id: i + 1, text: x.text, entity_type: x.entityType ?? null, title: x.title ?? null, is_spoiler: x.isSpoiler ? 1 : 0, like_count: x.likeCount ?? 0, created_at: x.createdAt ?? null }));
    this.badges = (s.badges || []).map((x: any, i: number) => ({ id: i + 1, key: x.key ?? null, label: x.label, grp: x.group ?? null, show_tvdb: x.showTvdb ?? null }));
    this.loadPersisted();
    // One-shot: persist entity refs on imported events (see LocalSource.ready).
    try {
      const g: any = globalThis as any;
      if (g.localStorage && g.localStorage.getItem('wh_recent_backfill_v1') !== '1') {
        const showByTitle = new Map(this.shows.map((x) => [x.title, x.tvdb_id]));
        const movieByTitle = new Map(this.movies.map((x) => [x.title, x.uuid]));
        let changed = false;
        for (const r of this.recent) {
          if (r.kind === 'episode' && r.show_tvdb == null && showByTitle.has(r.title)) { r.show_tvdb = showByTitle.get(r.title)!; changed = true; }
          if (r.kind === 'movie' && !r.movie_uuid && movieByTitle.has(r.title)) { r.movie_uuid = movieByTitle.get(r.title) ?? null; changed = true; }
        }
        if (changed) this.persistRecent();
        g.localStorage.setItem('wh_recent_backfill_v1', '1');
      }
    } catch { /* ignore */ }
    this.inited = true;
  }

  async importData(seedObj: unknown) {
    const g: any = globalThis as any;
    try {
      this.safeSet('wh_seed_v1', JSON.stringify(seedObj));
      g.localStorage?.removeItem('wh_state_v3');
      g.localStorage?.removeItem('wh_lists_v1');
      g.localStorage?.removeItem('wh_recent_v1');
      g.localStorage?.removeItem('wh_cleared');
      g.localStorage?.removeItem('wh_recent_backfill_v1');
    } catch { /* storage full or unavailable: keep going in-memory */ }
    // reset in-memory state and re-init from the imported seed
    this.inited = false;
    this.epState = new Map(); this.epSeeded = new Set(); this.addedShows = []; this.addedMovies = []; this.mvChecked = new Set(); this.epRw = new Map();
    this.shows = []; this.recent = []; this.lists = []; this.listItemsByList = new Map(); this.movies = []; this.reviews = []; this.badges = [];
    await this.ready();
  }

  private loadPersisted() {
    try {
      const g: any = globalThis as any;
      if (!g.localStorage) return;
      const raw = g.localStorage.getItem('wh_state_v3');
      if (!raw) return;
      const st = JSON.parse(raw);
      for (const [tv, keys] of Object.entries(st.eps ?? {})) this.epState.set(Number(tv), new Set(keys as string[]));
      this.epSeeded = new Set((st.seeded ?? []).map(Number));
      for (const sh of (st.added?.shows ?? [])) if (!this.shows.some((x) => x.tvdb_id === sh.tvdb_id)) { this.shows.push(sh); this.addedShows.push(sh); }
      for (const mv of (st.added?.movies ?? [])) if (!this.movies.some((x) => x.uuid === mv.uuid)) { this.movies.unshift(mv); this.addedMovies.push(mv); }
      for (const sh of this.shows) { const o = st.shows?.[sh.tvdb_id]; if (o) { sh.watched_episodes = o.w; sh.last_season = o.ls; sh.last_episode = o.le; sh.last_watched_at = o.at; sh.next_air_date = o.nad ?? null; sh.next_season = o.nas ?? null; sh.next_episode = o.nae ?? null; sh.na_checked = o.nac ?? 0; if (o.p !== undefined && o.p !== null) sh.poster = o.p; if (o.g !== undefined) sh.genres = o.g; if (o.stt) sh.state = o.stt; if (o.tst !== undefined && o.tst !== null) sh.tmdb_status = o.tst; if (o.tot !== undefined && o.tot !== null) sh.total_episodes = o.tot; if (o.net !== undefined && o.net !== null) sh.network = o.net; if (o.las !== undefined && o.las !== null) sh.last_aired_season = o.las; if (o.lae !== undefined && o.lae !== null) sh.last_aired_episode = o.lae; if (o.op !== undefined) sh.owned_platforms = o.op; if (o.plt !== undefined) sh.platforms = o.plt; if (o.pm !== undefined) sh.playtime_minutes = o.pm; if (o.sa !== undefined) sh.steam_appid = o.sa; if (o.ur !== undefined) sh.user_rating = o.ur; if (o.nt !== undefined) sh.notes = o.nt; } }
      for (const m of this.movies) { if (m.uuid && st.mw && m.uuid in st.mw) m.watched_at = st.mw[m.uuid]; if (m.uuid && st.mp && m.uuid in st.mp) m.poster = st.mp[m.uuid]; if (m.uuid && st.mg && m.uuid in st.mg) m.genres = st.mg[m.uuid]; if (m.uuid && st.mrc && m.uuid in st.mrc) m.rewatch_count = st.mrc[m.uuid]; if (m.uuid && st.mtid && m.uuid in st.mtid) m.tmdb_id = st.mtid[m.uuid]; if (m.uuid && st.mrd && m.uuid in st.mrd) m.release_date = st.mrd[m.uuid]; }
      this.mvChecked = new Set((st.checked ?? []) as string[]);
      for (const [tv, m] of Object.entries(st.epr ?? {})) this.epRw.set(Number(tv), new Map(Object.entries(m as Record<string, number>)));
      if (st.favShows) { const f = new Set<number>(st.favShows as number[]); for (const sh of this.shows) sh.is_favorite = f.has(sh.tvdb_id) ? 1 : 0; }
      if (st.favMovies) { const f = new Set<string>(st.favMovies as string[]); for (const m of this.movies) m.is_favorite = m.uuid && f.has(m.uuid) ? 1 : 0; }
      try {
        const rawRecent = g.localStorage.getItem('wh_recent_v1');
        if (rawRecent) { const rr = JSON.parse(rawRecent); if (Array.isArray(rr) && rr.length) this.recent = rr; }
      } catch { /* ignore */ }
      try {
        const rawLists = g.localStorage.getItem('wh_lists_v1');
        if (rawLists) { const lf = JSON.parse(rawLists); this.lists = lf.lists ?? this.lists; this.listItemsByList = new Map(lf.items ?? []); }
      } catch { /* ignore */ }
    } catch { /* ignore */ }
  }
  private persist() {
    try {
      const g: any = globalThis as any;
      if (!g.localStorage) return;
      const eps: Record<string, string[]> = {};
      for (const [tv, set] of this.epState) eps[tv] = [...set];
      const shows: Record<string, any> = {};
      for (const sh of this.shows) shows[sh.tvdb_id] = { w: sh.watched_episodes, ls: sh.last_season, le: sh.last_episode, at: sh.last_watched_at, nad: sh.next_air_date, nas: sh.next_season, nae: sh.next_episode, nac: sh.na_checked, p: sh.poster, g: sh.genres ?? null, stt: sh.state, tst: sh.tmdb_status, tot: sh.total_episodes, net: sh.network, las: sh.last_aired_season, lae: sh.last_aired_episode, op: sh.owned_platforms ?? null, plt: sh.platforms ?? null, pm: sh.playtime_minutes ?? null, sa: sh.steam_appid ?? null, ur: sh.user_rating ?? null, nt: sh.notes ?? null };
      const mw: Record<string, string | null> = {};
      for (const m of this.movies) if (m.uuid) mw[m.uuid] = m.watched_at;
      const mrc: Record<string, number> = {};
      for (const m of this.movies) if (m.uuid && (m.rewatch_count ?? 0) > 0) mrc[m.uuid] = m.rewatch_count as number;
      const mp: Record<string, string | null> = {};
      for (const m of this.movies) if (m.uuid && m.poster) mp[m.uuid] = m.poster;
      const mg: Record<string, string | null> = {};
      for (const m of this.movies) if (m.uuid && m.genres != null) mg[m.uuid] = m.genres;
      const mtid: Record<string, number | null> = {};
      for (const m of this.movies) if (m.uuid && m.tmdb_id != null) mtid[m.uuid] = m.tmdb_id;
      const mrd: Record<string, string | null> = {};
      for (const m of this.movies) if (m.uuid && m.release_date != null) mrd[m.uuid] = m.release_date;
      const epr: Record<string, Record<string, number>> = {};
      for (const [tv, m] of this.epRw) if (m.size) epr[tv] = Object.fromEntries(m);
      const favShows = this.shows.filter((s) => s.is_favorite).map((s) => s.tvdb_id);
      const favMovies = this.movies.filter((m) => m.is_favorite && m.uuid).map((m) => m.uuid);
      this.safeSet('wh_state_v3', JSON.stringify({ eps, seeded: [...this.epSeeded], shows, mw, mrc, mp, mg, mtid, mrd, epr, checked: [...this.mvChecked], favShows, favMovies, added: { shows: this.addedShows, movies: this.addedMovies } }));
    } catch { /* ignore */ }
  }

  async clearData() {
    try { const ls = (globalThis as any).localStorage; ls?.setItem('wh_cleared', '1'); ls?.removeItem('wh_state_v3'); } catch { /* ignore */ }
    this.profileRow = this.emptyProfile();
    this.shows = []; this.recent = []; this.lists = []; this.listItemsByList = new Map(); this.movies = []; this.reviews = []; this.badges = [];
    this.epState = new Map(); this.epSeeded = new Set(); this.addedShows = []; this.addedMovies = []; this.mvChecked = new Set(); this.epRw = new Map();
    this.inited = true;
  }
  async reimport() {
    try { const ls = (globalThis as any).localStorage; ls?.removeItem('wh_cleared'); ls?.removeItem('wh_state_v3'); } catch { /* ignore */ }
    this.inited = false;
    this.shows = []; this.recent = []; this.lists = []; this.listItemsByList = new Map(); this.movies = []; this.reviews = []; this.badges = [];
    this.epState = new Map(); this.epSeeded = new Set(); this.addedShows = []; this.addedMovies = []; this.mvChecked = new Set(); this.epRw = new Map();
    await this.ready();
  }
  async getProfile() { return this.profileRow; }
  async getContinueWatching(limit = 20) {
    return this.shows.filter((s) => s.last_watched_at).sort((a, b) => (b.last_watched_at ?? '').localeCompare(a.last_watched_at ?? '')).slice(0, limit);
  }
  async getShows() { return [...this.shows].sort((a, b) => (b.last_watched_at ?? '').localeCompare(a.last_watched_at ?? '')); }
  async getShowById(tvdbId: number) { return this.shows.find((x) => x.tvdb_id === tvdbId) ?? null; }
  async getFavorites(limit = 60) { return this.shows.filter((s) => s.is_favorite).sort((a, b) => (b.last_watched_at ?? '').localeCompare(a.last_watched_at ?? '')).slice(0, limit); }
  async getFavoriteMovies(limit = 60) { return this.movies.filter((m) => m.is_favorite).sort((a, b) => (b.watched_at ?? '').localeCompare(a.watched_at ?? '')).slice(0, limit); }
  async getRecent(limit = 30) {
    // New events carry their entity id; imported ones fall back to a title match.
    const showByTitle = new Map(this.shows.map((s) => [s.title, s]));
    const movieByTitle = new Map(this.movies.map((m) => [m.title, m]));
    return this.recent.slice(0, limit).map((r) => {
      const s = r.kind === 'episode' ? (r.show_tvdb != null ? this.shows.find((x) => x.tvdb_id === r.show_tvdb) : showByTitle.get(r.title)) : undefined;
      const m = r.kind === 'movie' ? (r.movie_uuid ? this.movies.find((x) => x.uuid === r.movie_uuid) : movieByTitle.get(r.title)) : undefined;
      return { ...r, poster: r.poster ?? s?.poster ?? m?.poster ?? null, show_tvdb: r.show_tvdb ?? s?.tvdb_id ?? null, movie_uuid: r.movie_uuid ?? m?.uuid ?? null };
    });
  }
  async getLists() { return [...this.lists].sort((a, b) => b.item_count - a.item_count); }
  async getListById(listId: number) { return this.lists.find((l) => l.id === listId) ?? null; }
  async getListItems(listId: number): Promise<ListItemRow[]> {
    const raw = this.listItemsByList.get(listId) ?? [];
    return raw.map((it): ListItemRow => {
      if (it.kind === 'series') {
        const s = this.shows.find((x) => x.tvdb_id === it.tvdb);
        return { kind: 'series', tvdb_id: it.tvdb, uuid: null, title: s?.title ?? '', poster: s?.poster ?? null, year: null, watched_at: null, last_watched_at: s?.last_watched_at ?? null };
      }
      const m = this.movies.find((x) => x.uuid === it.uuid);
      return { kind: 'movie', tvdb_id: null, uuid: it.uuid, title: m?.title ?? '', poster: m?.poster ?? null, year: m?.year ?? null, watched_at: m?.watched_at ?? null, last_watched_at: null };
    });
  }
  private persistRecent() {
    try { this.safeSet('wh_recent_v1', JSON.stringify(this.recent.slice(0, 150))); } catch { /* ignore */ }
  }
  async setShowMeta(tvdbId: number, m: { tmdb_status: string | null; total_episodes: number | null; network: string | null; last_aired_season: number | null; last_aired_episode: number | null }) {
    const sh = this.shows.find((x) => x.tvdb_id === tvdbId);
    if (sh) { sh.tmdb_status = m.tmdb_status; sh.total_episodes = m.total_episodes; sh.network = m.network; sh.last_aired_season = m.last_aired_season; sh.last_aired_episode = m.last_aired_episode; this.persist(); }
  }
  async rewatchMovie(uuid: string) {
    const m = this.movies.find((x) => x.uuid === uuid);
    if (m) { m.watched_at = new Date().toISOString(); m.rewatch_count = (m.rewatch_count ?? 0) + 1; this.persist(); }
  }
  async logRecent(e: { kind: 'episode' | 'movie'; title: string; season?: number | null; episode?: number | null; poster?: string | null; tvdb?: number | null; uuid?: string | null }) {
    const id = this.recent.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    this.recent.unshift({ id, kind: e.kind, title: e.title, season: e.season ?? null, episode: e.episode ?? null, watched_at: new Date().toISOString(), poster: e.poster ?? null, show_tvdb: e.tvdb ?? null, movie_uuid: e.uuid ?? null });
    this.persistRecent();
  }
  async rewatchEpisode(tv: number, season: number, episode: number) {
    let m = this.epRw.get(tv); if (!m) { m = new Map(); this.epRw.set(tv, m); }
    const k = `${season}:${episode}`; m.set(k, (m.get(k) ?? 0) + 1); this.persist();
  }
  async getEpisodeRewatches(tv: number) {
    const m = this.epRw.get(tv) ?? new Map<string, number>();
    return [...m.entries()].map(([k, n]) => { const [se, ep] = k.split(':').map(Number); return { season: se, episode: ep, rewatch_count: n }; }).filter((r) => r.season >= 1 && r.rewatch_count > 0);
  }
  async setShowState(tvdbId: number, state: 'backlog' | 'watching' | 'stopped' | 'archived') {
    const sh = this.shows.find((x) => x.tvdb_id === tvdbId);
    if (sh) { sh.state = state; this.persist(); }
  }
  private persistLists() {
    try { this.safeSet('wh_lists_v1', JSON.stringify({ lists: this.lists, items: [...this.listItemsByList.entries()] })); } catch { /* ignore */ }
  }
  async createList(name: string, isPublic = false) {
    const id = this.lists.reduce((m, l) => Math.max(m, l.id), 0) + 1;
    this.lists.push({ id, name, is_public: isPublic ? 1 : 0, item_count: 0 });
    this.listItemsByList.set(id, []);
    this.persistLists();
    return id;
  }
  async renameList(listId: number, name: string) { const l = this.lists.find((x) => x.id === listId); if (l) { l.name = name; this.persistLists(); } }
  async deleteList(listId: number) {
    this.lists = this.lists.filter((x) => x.id !== listId);
    this.listItemsByList.delete(listId);
    this.persistLists();
  }
  async addToList(listId: number, it: { kind: 'series' | 'movie'; tvdb?: number | null; uuid?: string | null }) {
    const l = this.lists.find((x) => x.id === listId); if (!l) return;
    const arr = this.listItemsByList.get(listId) ?? [];
    if (arr.some((x) => x.kind === it.kind && (it.kind === 'series' ? x.tvdb === (it.tvdb ?? null) : x.uuid === (it.uuid ?? null)))) return;
    arr.push({ kind: it.kind, tvdb: it.tvdb ?? null, uuid: it.uuid ?? null });
    this.listItemsByList.set(listId, arr);
    l.item_count = arr.length;
    this.persistLists();
  }
  async removeFromList(listId: number, it: { kind: 'series' | 'movie'; tvdb?: number | null; uuid?: string | null }) {
    const l = this.lists.find((x) => x.id === listId); if (!l) return;
    const arr = (this.listItemsByList.get(listId) ?? []).filter((x) => !(x.kind === it.kind && (it.kind === 'series' ? x.tvdb === (it.tvdb ?? null) : x.uuid === (it.uuid ?? null))));
    this.listItemsByList.set(listId, arr);
    l.item_count = arr.length;
    this.persistLists();
  }
  async setShowFavorite(tvdbId: number, favorite: boolean) { const s = this.shows.find((x) => x.tvdb_id === tvdbId); if (s) { s.is_favorite = favorite ? 1 : 0; this.persist(); } }
  async setMovieFavorite(uuid: string, favorite: boolean) { const m = this.movies.find((x) => x.uuid === uuid); if (m) { m.is_favorite = favorite ? 1 : 0; this.persist(); } }
  async getMovies(limit = 120) { const t = localToday(); return this.movies.filter((m) => !(m.watched_at == null && m.release_date != null && m.release_date > t)).sort((a, b) => (b.watched_at ?? '').localeCompare(a.watched_at ?? '')).slice(0, limit); }
  async getUpcomingMovies() { const t = localToday(); return this.movies.filter((m) => m.watched_at == null && m.release_date != null && m.release_date > t).sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? '')); }
  async getMovieByUuid(uuid: string) { return this.movies.find((m) => m.uuid === uuid) ?? null; }
  async getReviews(limit = 50) { return [...this.reviews].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, limit); }
  async getBadges() { return [...this.badges].sort((a, b) => (a.grp ?? '').localeCompare(b.grp ?? '') || a.label.localeCompare(b.label)); }
  async setProgress(tvdbId: number, lastSeason: number, lastEpisode: number, watchedEpisodes: number) {
    const sh = this.shows.find((x) => x.tvdb_id === tvdbId);
    if (sh) { sh.last_season = lastSeason; sh.last_episode = lastEpisode; sh.watched_episodes = watchedEpisodes; sh.last_watched_at = new Date().toISOString(); }
    this.persist();
  }
  async getWatchedEpisodes(tv: number) { const set = this.epState.get(tv) ?? new Set<string>(); return [...set].map((k) => { const [se, ep] = k.split(':').map(Number); return { season: se, episode: ep }; }); }
  async seedEpState(tv: number, eps: { season: number; episode: number }[]) {
    if (this.epSeeded.has(tv)) return; this.epSeeded.add(tv);
    this.epState.set(tv, new Set(eps.map((e) => `${e.season}:${e.episode}`))); this.recountShow(tv);
  }
  async setEpisodeWatched(tv: number, season: number, episode: number, watched: boolean) {
    let set = this.epState.get(tv); if (!set) { set = new Set(); this.epState.set(tv, set); }
    const k = `${season}:${episode}`; if (watched) set.add(k); else { set.delete(k); this.epRw.get(tv)?.delete(k); } this.recountShow(tv);
  }
  private recountShow(tv: number) {
    const set = this.epState.get(tv) ?? new Set<string>(); const sh = this.shows.find((x) => x.tvdb_id === tv); if (!sh) return;
    let count = 0, ls = 0, le = 0;
    for (const k of set) { const [se, ep] = k.split(':').map(Number); if (se >= 1) { count++; if (se > ls || (se === ls && ep > le)) { ls = se; le = ep; } } }
    sh.watched_episodes = count; sh.last_season = ls || null; sh.last_episode = le || null; sh.last_watched_at = new Date().toISOString();
    this.persist();
  }
  async addShow(p: AddShow) {
    if (this.shows.some((x) => x.tvdb_id === p.tvdb_id)) return;
    const row: ShowRow = { tvdb_id: p.tvdb_id, title: p.title, state: p.state ?? 'backlog', is_favorite: 0, watched_episodes: 0, last_season: null, last_episode: null, last_watched_at: new Date().toISOString(), poster: p.poster, tmdb_status: p.tmdb_status, total_episodes: p.total_episodes, network: p.network, last_aired_season: p.last_aired_season, last_aired_episode: p.last_aired_episode, next_air_date: null, next_season: null, next_episode: null, na_checked: 0 };
    this.shows.push(row); this.addedShows.push(row); this.persist();
  }
  async addMovie(p: AddMovie) {
    if (this.movies.some((x) => x.uuid === p.uuid)) return;
    const row: MovieRow = { uuid: p.uuid, title: p.title, slug: p.slug, year: p.year, watched_at: null, poster: p.poster, release_date: p.release_date, is_favorite: 0 };
    this.movies.unshift(row); this.addedMovies.push(row); this.persist();
  }
  async isShowInLibrary(tvdbId: number) { return this.shows.some((x) => x.tvdb_id === tvdbId); }
  async setMovieWatched(p: AddMovie, watched: boolean) {
    const at = watched ? new Date().toISOString() : null;
    let row = this.movies.find((m) => m.uuid === p.uuid);
    if (row) row.watched_at = at;
    else if (watched) { row = { uuid: p.uuid, title: p.title, slug: p.slug, year: p.year, watched_at: at, poster: p.poster, release_date: p.release_date, is_favorite: 0 }; this.movies.unshift(row); this.addedMovies.push(row); }
    this.persist();
  }
  async setMovieReleaseDate(uuid: string, releaseDate: string | null) { const m = this.movies.find((x) => x.uuid === uuid); if (m && m.release_date !== releaseDate) { m.release_date = releaseDate; this.persist(); } }
  async setMoviePoster(uuid: string, poster: string | null) { const m = this.movies.find((x) => x.uuid === uuid); if (m && poster && m.poster !== poster) { m.poster = poster; this.persist(); } }
  async setMovieTmdbId(uuid: string, tmdbId: number | null) { const m = this.movies.find((x) => x.uuid === uuid); if (m && m.tmdb_id !== tmdbId) { m.tmdb_id = tmdbId; this.persist(); } }
  async setShowPoster(tvdbId: number, poster: string | null) { const sh = this.shows.find((x) => x.tvdb_id === tvdbId); if (sh && poster && sh.poster !== poster) { sh.poster = poster; this.persist(); } }
  async setShowGenres(tvdbId: number, genres: string | null) { const sh = this.shows.find((x) => x.tvdb_id === tvdbId); if (sh) { sh.genres = genres; this.persist(); } }
  async setOwnedPlatforms(tvdbId: number, ownedJson: string | null) { const sh = this.shows.find((x) => x.tvdb_id === tvdbId); if (sh) { sh.owned_platforms = ownedJson; this.persist(); } }
  async setPlatforms(tvdbId: number, platformsJson: string | null) { const sh = this.shows.find((x) => x.tvdb_id === tvdbId); if (sh) { sh.platforms = platformsJson; this.persist(); } }
  async addSteamGame(p: SteamGame) {
    let row = this.shows.find((x) => x.tvdb_id === p.tvdb_id);
    if (row) { row.playtime_minutes = p.playtime_minutes; row.steam_appid = p.steam_appid; if (!row.poster) row.poster = p.poster; if (!row.owned_platforms) row.owned_platforms = p.owned_platforms; }
    else { row = { tvdb_id: p.tvdb_id, title: p.title, state: p.state, is_favorite: 0, watched_episodes: 0, last_season: null, last_episode: null, last_watched_at: new Date().toISOString(), poster: p.poster, tmdb_status: null, total_episodes: null, network: null, last_aired_season: null, last_aired_episode: null, next_air_date: null, next_season: null, next_episode: null, na_checked: 0, owned_platforms: p.owned_platforms, platforms: null, playtime_minutes: p.playtime_minutes, steam_appid: p.steam_appid }; this.shows.push(row); this.addedShows.push(row); }
    this.persist();
  }
  async setShowRating(tvdbId: number, rating: number | null) { const sh = this.shows.find((x) => x.tvdb_id === tvdbId); if (sh) { sh.user_rating = rating; this.persist(); } }
  async setShowNotes(tvdbId: number, notes: string | null) { const sh = this.shows.find((x) => x.tvdb_id === tvdbId); if (sh) { sh.notes = notes; this.persist(); } }
  async setMovieGenres(uuid: string, genres: string | null) { const m = this.movies.find((x) => x.uuid === uuid); if (m) { m.genres = genres; this.persist(); } }
  async getUncheckedPendientes() { return this.movies.filter((m) => m.watched_at == null && m.uuid != null && !this.mvChecked.has(m.uuid)); }
  async markMovieChecked(uuid: string) { if (!this.mvChecked.has(uuid)) { this.mvChecked.add(uuid); this.persist(); } }
  async isMovieInLibrary(uuid: string) { return this.movies.some((x) => x.uuid === uuid); }
  async setShowNextAir(tvdbId: number, date: string | null, season: number | null, episode: number | null) {
    const sh = this.shows.find((x) => x.tvdb_id === tvdbId);
    if (sh) { sh.next_air_date = date; sh.next_season = season; sh.next_episode = episode; sh.na_checked = 1; this.persist(); }
  }
  async removeShow(tvdbId: number) {
    this.shows = this.shows.filter((x) => x.tvdb_id !== tvdbId);
    this.addedShows = this.addedShows.filter((x) => x.tvdb_id !== tvdbId);
    this.epState.delete(tvdbId); this.epSeeded.delete(tvdbId); this.epRw.delete(tvdbId); this.persist();
  }
  async removeMovie(uuid: string) {
    this.movies = this.movies.filter((x) => x.uuid !== uuid);
    this.addedMovies = this.addedMovies.filter((x) => x.uuid !== uuid); this.persist();
  }
  async markWatched(tvdbId: number) {
    const s = this.shows.find((x) => x.tvdb_id === tvdbId);
    if (s) { s.watched_episodes += 1; s.last_episode = (s.last_episode ?? 0) + 1; s.last_watched_at = new Date().toISOString(); }
    if (this.profileRow) this.profileRow.episodes += 1;
    this.persist();
  }
}
