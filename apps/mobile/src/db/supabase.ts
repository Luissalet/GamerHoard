import { supabase } from '../lib/supabase';
import i18n from '../i18n';
import { localToday } from '../dates';
import type {
  DataSource, Profile, ShowRow, RecentRow, ListRow, ListItemRow, MovieRow, ReviewRow, BadgeRow, AddShow, AddMovie, SteamGame,
} from './types';

// SupabaseSource — cloud DataSource. Mirrors LocalSource method-for-method against the
// per-user app_* tables (0003_app_user_data.sql). Same column names/types as the local
// SQLite, so screens behave identically. Every row is scoped to the signed-in user;
// RLS enforces it and we also filter by profile_id for correctness.
const nowIso = () => new Date().toISOString();
/** Cloud writes must never fail silently: log the PostgREST error and raise it. */
function must(op: string, r: { error: { message: string; code?: string } | null }) {
  if (r.error) {
    console.error(`[WatchHoard] ${op} failed:`, r.error.code ?? '', r.error.message);
    throw new Error(`${op}: ${r.error.message}`);
  }
}
const today = () => localToday();

export class SupabaseSource implements DataSource {
  private uid: string | null = null;
  private readyP: Promise<void> | null = null;

  async ready() {
    if (this.readyP) return this.readyP;
    this.readyP = (async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) { this.readyP = null; throw new Error(i18n.t('reviews.errNoSession')); }
      this.uid = user.id;
      // Ensure a profile row exists so getProfile() isn't null on a fresh account.
      await supabase.from('app_profile').upsert({ profile_id: this.uid }, { onConflict: 'profile_id', ignoreDuplicates: true });
    })();
    return this.readyP;
  }
  private u(): string { if (!this.uid) throw new Error('call ready() first'); return this.uid; }
  /** Supabase caps every query at ~1000 rows; big TV Time libraries exceed that, which made
   *  newly added titles invisible in lists (while direct by-id lookups still found them).
   *  Page with .range() until a short page arrives. */
  private async fetchAll<T>(table: string, orderCol?: string): Promise<T[]> {
    const out: T[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      let q = supabase.from(table).select('*').eq('profile_id', this.u()).range(from, from + page - 1);
      if (orderCol) q = q.order(orderCol, { ascending: false, nullsFirst: false });
      const { data, error } = await q;
      if (error) { console.error('[WatchHoard]', table, 'fetch failed:', error.message); break; }
      const rows = (data as unknown as T[]) ?? [];
      out.push(...rows);
      if (rows.length < page) break;
    }
    return out;
  }
  private base(table: string) { return supabase.from(table).select('*').eq('profile_id', this.u()); }

  async clearData() {
    const uid = this.u();
    for (const t of ['app_ep_state', 'app_shows', 'app_movies', 'app_recent', 'app_lists', 'app_list_items', 'app_reviews', 'app_badges'])
      await supabase.from(t).delete().eq('profile_id', uid);
    await supabase.from('app_profile')
      .update({ episodes: 0, movies: 0, shows_added: 0, following: 0, lists: 0, badges: 0, reactions: 0, comments: 0, character_votes: 0 })
      .eq('profile_id', uid);
  }
  async reimport() { /* cloud re-import happens through importData (in-app importer) */ }

  // In-app importer: replace this user's app_* rows with a freshly parsed export.
  // Same mapping as the server-side push script, but through the user's own session (RLS-scoped).
  async importData(seedObj: unknown) {
    await this.ready();
    const uid = this.u();
    const seed: any = seedObj;
    const p = seed.profile || {};
    for (const t of ['app_ep_state', 'app_shows', 'app_movies', 'app_recent', 'app_list_items', 'app_lists', 'app_reviews', 'app_badges'])
      await supabase.from(t).delete().eq('profile_id', uid);

    const { error: pErr } = await supabase.from('app_profile').upsert({
      profile_id: uid, handle: p.handle ?? null, series_clock: p.seriesClock ?? null, episodes: p.episodes ?? 0,
      movies_clock: p.moviesClock ?? null, movies: p.movies ?? 0, shows_added: p.showsAdded ?? 0, following: p.following ?? 0,
      lists: p.lists ?? 0, badges: p.badges ?? 0, reactions: p.reactions ?? 0, comments: p.comments ?? 0, character_votes: p.characterVotes ?? 0,
    }, { onConflict: 'profile_id' });
    if (pErr) throw new Error(pErr.message);

    // Older cloud DBs can miss recently-migrated columns (0007+). Strip the missing
    // column and retry so one pending migration never fails the whole import.
    const insert = async (table: string, rows: any[]) => {
      let batch = rows;
      for (let i = 0; i < batch.length; i += 500) {
        for (let tries = 0; ; tries++) {
          const { error } = await supabase.from(table).insert(batch.slice(i, i + 500));
          if (!error) break;
          const m = /find the '(\w+)' column/i.exec(error.message);
          if (m && tries < 8) {
            console.warn(`[WatchHoard] ${table}.${m[1]} missing in cloud schema (apply latest migrations); importing without it`);
            batch = batch.map((r) => { const c = { ...r }; delete c[m[1]]; return c; });
            continue;
          }
          throw new Error(table + ': ' + error.message);
        }
      }
    };
    const dedup = (rows: any[], keyf: (r: any) => any) => { const s = new Set(); return rows.filter((r) => { const k = keyf(r); if (s.has(k)) return false; s.add(k); return true; }); };

    await insert('app_shows', dedup((seed.shows || []).map((s: any, i: number) => ({
      profile_id: uid, tvdb_id: s.tvdbId ?? (900000000 + i), title: s.title, state: s.state ?? 'watching',
      is_favorite: s.isFavorite ? 1 : 0, watched_episodes: s.watchedEpisodes ?? 0, last_season: s.lastSeason ?? null,
      last_episode: s.lastEpisode ?? null, last_watched_at: s.lastWatchedAt ?? null, poster: s.poster ?? null,
      tmdb_status: s.tmdbStatus ?? null, total_episodes: s.totalEpisodes ?? null, network: s.network ?? null,
      last_aired_season: s.lastAiredSeason ?? null, last_aired_episode: s.lastAiredEpisode ?? null,
      genres: s.genres ?? null, next_air_date: s.nextAirDate ?? null, next_season: s.nextSeason ?? null, next_episode: s.nextEpisode ?? null,
    })), (r) => r.tvdb_id));
    await insert('app_movies', dedup((seed.movies || []).map((m: any, i: number) => ({
      profile_id: uid, uuid: m.uuid ?? `noid:${i}`, title: m.title, slug: m.slug ?? null, year: m.year ?? null,
      watched_at: m.watchedAt ?? null, poster: m.poster ?? null, release_date: m.releaseDate ?? null, is_favorite: m.isFavorite ? 1 : 0,
      genres: m.genres ?? null, tmdb_id: m.tmdbId ?? null, rewatch_count: m.rewatchCount ?? 0,
    })), (r) => r.uuid));
    await insert('app_recent', (seed.recent || []).map((r: any) => ({ profile_id: uid, kind: r.kind, title: r.title ?? null, season: r.season ?? null, episode: r.episode ?? null, watched_at: r.watchedAt ?? null, poster: r.poster ?? null, show_tvdb: r.showTvdb ?? null, movie_uuid: r.movieUuid ?? null })));
    for (const l of (seed.lists || [])) {
      const { data: row, error } = await supabase.from('app_lists')
        .insert({ profile_id: uid, name: l.name, is_public: l.isPublic ? 1 : 0, item_count: l.itemCount ?? 0 }).select('id').single();
      if (error) throw new Error('app_lists: ' + error.message);
      const items = (l.items || []).map((it: any, i: number) => ({ profile_id: uid, list_id: (row as any).id, kind: it.kind, tvdb_id: it.tvdb ?? null, uuid: it.uuid ?? null, ord: i }));
      if (items.length) { const { error: e2 } = await supabase.from('app_list_items').insert(items); if (e2) throw new Error('app_list_items: ' + e2.message); }
    }
    await insert('app_reviews', (seed.reviews || []).map((r: any) => ({ profile_id: uid, text: r.text, entity_type: r.entityType ?? null, title: r.title ?? null, is_spoiler: r.isSpoiler ? 1 : 0, like_count: r.likeCount ?? 0, created_at: r.createdAt ?? null })));
    await insert('app_badges', (seed.badges || []).map((b: any) => ({ profile_id: uid, key: b.key ?? null, label: b.label, grp: b.group ?? null, show_tvdb: b.showTvdb ?? null })));
  }

  async getProfile() {
    const { data } = await supabase.from('app_profile').select('*').eq('profile_id', this.u()).maybeSingle();
    return (data as unknown as Profile) ?? null;
  }
  async getContinueWatching(limit = 20) {
    const { data } = await this.base('app_shows').not('last_watched_at', 'is', null)
      .order('last_watched_at', { ascending: false }).limit(limit);
    return (data as unknown as ShowRow[]) ?? [];
  }
  async getShows() {
    return this.fetchAll<ShowRow>('app_shows', 'last_watched_at');
  }
  async getShowById(tvdbId: number) {
    const { data } = await this.base('app_shows').eq('tvdb_id', tvdbId).maybeSingle();
    return (data as unknown as ShowRow) ?? null;
  }
  async getFavorites(limit = 60) {
    const { data } = await this.base('app_shows').eq('is_favorite', 1).order('last_watched_at', { ascending: false, nullsFirst: false }).limit(limit);
    return (data as unknown as ShowRow[]) ?? [];
  }
  async getFavoriteMovies(limit = 60) {
    const { data } = await this.base('app_movies').eq('is_favorite', 1).order('watched_at', { ascending: false, nullsFirst: false }).limit(limit);
    return (data as unknown as MovieRow[]) ?? [];
  }
  async getRecent(limit = 30) {
    const { data } = await this.base('app_recent').order('watched_at', { ascending: false, nullsFirst: false }).limit(limit);
    const rows = (data as unknown as RecentRow[]) ?? [];
    // Resolve poster + entity link by title (imported events carry neither). Chunked `in`
    // filters keep the querystring short on large histories.
    const epTitles = [...new Set(rows.filter((r) => r.kind === 'episode' && r.show_tvdb == null).map((r) => r.title))];
    const mvTitles = [...new Set(rows.filter((r) => r.kind === 'movie' && !r.movie_uuid).map((r) => r.title))];
    const chunk = <T,>(a: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
    const showByTitle = new Map<string, { tvdb_id: number; poster: string | null }>();
    const movieByTitle = new Map<string, { uuid: string | null; poster: string | null }>();
    for (const ts of chunk(epTitles, 50)) {
      const { data: ss } = await this.base('app_shows').in('title', ts);
      for (const s of (ss as any[]) ?? []) if (!showByTitle.has(s.title)) showByTitle.set(s.title, { tvdb_id: s.tvdb_id, poster: s.poster ?? null });
    }
    for (const ts of chunk(mvTitles, 50)) {
      const { data: ms } = await this.base('app_movies').in('title', ts);
      for (const m of (ms as any[]) ?? []) if (!movieByTitle.has(m.title)) movieByTitle.set(m.title, { uuid: m.uuid ?? null, poster: m.poster ?? null });
    }
    return rows.map((r) => {
      const s = r.kind === 'episode' ? showByTitle.get(r.title) : undefined;
      const m = r.kind === 'movie' ? movieByTitle.get(r.title) : undefined;
      return { ...r, poster: r.poster ?? s?.poster ?? m?.poster ?? null, show_tvdb: r.show_tvdb ?? s?.tvdb_id ?? null, movie_uuid: r.movie_uuid ?? m?.uuid ?? null };
    });
  }
  async getLists() {
    const { data } = await this.base('app_lists').order('item_count', { ascending: false });
    return (data as unknown as ListRow[]) ?? [];
  }
  async getListById(listId: number) {
    const { data } = await this.base('app_lists').eq('id', listId).maybeSingle();
    return (data as unknown as ListRow) ?? null;
  }
  async getListItems(listId: number): Promise<ListItemRow[]> {
    const { data } = await supabase.from('app_list_items').select('kind,tvdb_id,uuid,ord')
      .eq('profile_id', this.u()).eq('list_id', listId).order('ord');
    const items = (data as { kind: 'series' | 'movie'; tvdb_id: number | null; uuid: string | null }[]) ?? [];
    const shows = await this.getShows();
    const movies = await this.allMovies();
    return items.map((it): ListItemRow => {
      if (it.kind === 'series') {
        const s = shows.find((x) => x.tvdb_id === it.tvdb_id);
        return { kind: 'series', tvdb_id: it.tvdb_id, uuid: null, title: s?.title ?? '', poster: s?.poster ?? null, year: null, watched_at: null, last_watched_at: s?.last_watched_at ?? null };
      }
      const m = movies.find((x) => x.uuid === it.uuid);
      return { kind: 'movie', tvdb_id: null, uuid: it.uuid, title: m?.title ?? '', poster: m?.poster ?? null, year: m?.year ?? null, watched_at: m?.watched_at ?? null, last_watched_at: null };
    });
  }
  async setShowMeta(tvdbId: number, m: { tmdb_status: string | null; total_episodes: number | null; network: string | null; last_aired_season: number | null; last_aired_episode: number | null }) {
    await supabase.from('app_shows').update({ tmdb_status: m.tmdb_status, total_episodes: m.total_episodes, network: m.network, last_aired_season: m.last_aired_season, last_aired_episode: m.last_aired_episode })
      .eq('profile_id', this.u()).eq('tvdb_id', tvdbId);
  }
  async setMovieTmdbId(uuid: string, tmdbId: number | null) {
    await supabase.from('app_movies').update({ tmdb_id: tmdbId }).eq('profile_id', this.u()).eq('uuid', uuid);
  }
  async rewatchMovie(uuid: string) {
    const uid = this.u();
    const { data: row } = await supabase.from('app_movies').select('rewatch_count').eq('profile_id', uid).eq('uuid', uuid).maybeSingle();
    await supabase.from('app_movies').update({ watched_at: new Date().toISOString(), rewatch_count: ((row as any)?.rewatch_count ?? 0) + 1 }).eq('profile_id', uid).eq('uuid', uuid);
  }
  async rewatchEpisode(tv: number, season: number, episode: number) {
    const uid = this.u();
    const { data: row, error } = await supabase.from('app_ep_state').select('rewatch_count')
      .eq('profile_id', uid).eq('tvdb_show_id', tv).eq('season', season).eq('episode', episode).maybeSingle();
    if (error) { console.warn('[WatchHoard] app_ep_state.rewatch_count: apply supabase/migrations/0010'); return; }
    await supabase.from('app_ep_state').update({ rewatch_count: ((row as any)?.rewatch_count ?? 0) + 1 })
      .eq('profile_id', uid).eq('tvdb_show_id', tv).eq('season', season).eq('episode', episode);
  }
  async getEpisodeRewatches(tv: number) {
    const { data, error } = await supabase.from('app_ep_state').select('season,episode,rewatch_count')
      .eq('profile_id', this.u()).eq('tvdb_show_id', tv).gte('season', 1).gt('rewatch_count', 0);
    if (error) return []; // column not migrated yet (0010)
    return (data as { season: number; episode: number; rewatch_count: number }[]) ?? [];
  }
  async logRecent(e: { kind: 'episode' | 'movie'; title: string; season?: number | null; episode?: number | null; poster?: string | null; tvdb?: number | null; uuid?: string | null }) {
    const r = await supabase.from('app_recent').insert({ profile_id: this.u(), kind: e.kind, title: e.title, season: e.season ?? null, episode: e.episode ?? null, watched_at: new Date().toISOString(), poster: e.poster ?? null, show_tvdb: e.tvdb ?? null, movie_uuid: e.uuid ?? null });
    // Missing migration 0009 must not break the watch action itself — retry without the new columns.
    if (r.error && /show_tvdb|movie_uuid/.test(r.error.message)) {
      console.warn('[WatchHoard] app_recent: apply supabase/migrations/0009 (falling back to legacy insert)');
      await supabase.from('app_recent').insert({ profile_id: this.u(), kind: e.kind, title: e.title, season: e.season ?? null, episode: e.episode ?? null, watched_at: new Date().toISOString(), poster: e.poster ?? null });
    } else if (r.error) console.error('[WatchHoard] app_recent insert failed:', r.error.message);
  }
  async setShowState(tvdbId: number, state: 'backlog' | 'watching' | 'stopped' | 'archived') {
    await supabase.from('app_shows').update({ state }).eq('profile_id', this.u()).eq('tvdb_id', tvdbId);
  }
  async createList(name: string, isPublic = false) {
    const { data } = await supabase.from('app_lists').insert({ profile_id: this.u(), name, is_public: isPublic ? 1 : 0, item_count: 0 }).select('id').single();
    return (data as any)?.id ?? null;
  }
  async renameList(listId: number, name: string) {
    await supabase.from('app_lists').update({ name }).eq('profile_id', this.u()).eq('id', listId);
  }
  async deleteList(listId: number) {
    await supabase.from('app_list_items').delete().eq('profile_id', this.u()).eq('list_id', listId);
    await supabase.from('app_lists').delete().eq('profile_id', this.u()).eq('id', listId);
  }
  private async recountList(listId: number) {
    const { count } = await supabase.from('app_list_items').select('*', { count: 'exact', head: true }).eq('profile_id', this.u()).eq('list_id', listId);
    await supabase.from('app_lists').update({ item_count: count ?? 0 }).eq('profile_id', this.u()).eq('id', listId);
  }
  async addToList(listId: number, it: { kind: 'series' | 'movie'; tvdb?: number | null; uuid?: string | null }) {
    const uid = this.u();
    let dup = supabase.from('app_list_items').select('*', { count: 'exact', head: true }).eq('profile_id', uid).eq('list_id', listId).eq('kind', it.kind);
    dup = it.kind === 'series' ? dup.eq('tvdb_id', it.tvdb ?? -1) : dup.eq('uuid', it.uuid ?? '');
    const { count } = await dup;
    if ((count ?? 0) > 0) return;
    await supabase.from('app_list_items').insert({ profile_id: uid, list_id: listId, kind: it.kind, tvdb_id: it.tvdb ?? null, uuid: it.uuid ?? null, ord: Date.now() % 1000000 });
    await this.recountList(listId);
  }
  async removeFromList(listId: number, it: { kind: 'series' | 'movie'; tvdb?: number | null; uuid?: string | null }) {
    const uid = this.u();
    let q = supabase.from('app_list_items').delete().eq('profile_id', uid).eq('list_id', listId).eq('kind', it.kind);
    q = it.kind === 'series' ? q.eq('tvdb_id', it.tvdb ?? -1) : q.eq('uuid', it.uuid ?? '');
    await q;
    await this.recountList(listId);
  }
  async setShowFavorite(tvdbId: number, favorite: boolean) {
    await supabase.from('app_shows').update({ is_favorite: favorite ? 1 : 0 }).eq('profile_id', this.u()).eq('tvdb_id', tvdbId);
  }
  async setMovieFavorite(uuid: string, favorite: boolean) {
    await supabase.from('app_movies').update({ is_favorite: favorite ? 1 : 0 }).eq('profile_id', this.u()).eq('uuid', uuid);
  }
  private async allMovies(): Promise<MovieRow[]> {
    return this.fetchAll<MovieRow>('app_movies', 'watched_at');
  }
  private byWatchedDesc(a: MovieRow, b: MovieRow) { // nulls last, like SQLite ORDER BY watched_at DESC
    if (!a.watched_at && !b.watched_at) return 0;
    if (!a.watched_at) return 1; if (!b.watched_at) return -1;
    return a.watched_at < b.watched_at ? 1 : a.watched_at > b.watched_at ? -1 : 0;
  }
  async getMovies(limit = 120) {
    const t = today();
    return (await this.allMovies())
      .filter((m) => !(m.watched_at == null && m.release_date != null && m.release_date > t))
      .sort((a, b) => this.byWatchedDesc(a, b)).slice(0, limit);
  }
  async getUpcomingMovies() {
    const t = today();
    return (await this.allMovies())
      .filter((m) => m.watched_at == null && m.release_date != null && m.release_date > t)
      .sort((a, b) => (a.release_date! < b.release_date! ? -1 : a.release_date! > b.release_date! ? 1 : 0));
  }
  async getMovieByUuid(uuid: string) {
    const { data } = await this.base('app_movies').eq('uuid', uuid).maybeSingle();
    return (data as unknown as MovieRow) ?? null;
  }
  async getReviews(limit = 50) {
    const { data } = await this.base('app_reviews').order('created_at', { ascending: false, nullsFirst: false }).limit(limit);
    return (data as unknown as ReviewRow[]) ?? [];
  }
  async getBadges() {
    const { data } = await this.base('app_badges').order('grp', { nullsFirst: false }).order('label');
    return (data as unknown as BadgeRow[]) ?? [];
  }

  async setProgress(tvdbId: number, lastSeason: number, lastEpisode: number, watchedEpisodes: number) {
    await supabase.from('app_shows')
      .update({ last_season: lastSeason, last_episode: lastEpisode, watched_episodes: watchedEpisodes, last_watched_at: nowIso() })
      .eq('profile_id', this.u()).eq('tvdb_id', tvdbId);
  }
  async getWatchedEpisodes(tv: number) {
    const { data } = await supabase.from('app_ep_state').select('season,episode')
      .eq('profile_id', this.u()).eq('tvdb_show_id', tv).gte('season', 0);
    return (data as { season: number; episode: number }[]) ?? [];
  }
  async seedEpState(tv: number, eps: { season: number; episode: number }[]) {
    const uid = this.u();
    const { data: marker } = await supabase.from('app_ep_state').select('season')
      .eq('profile_id', uid).eq('tvdb_show_id', tv).eq('season', -1).maybeSingle();
    if (marker) return;
    const rows = [{ profile_id: uid, tvdb_show_id: tv, season: -1, episode: -1 },
      ...eps.map((e) => ({ profile_id: uid, tvdb_show_id: tv, season: e.season, episode: e.episode }))];
    await supabase.from('app_ep_state').upsert(rows, { onConflict: 'profile_id,tvdb_show_id,season,episode', ignoreDuplicates: true });
    await this.recountShow(tv);
  }
  async setEpisodeWatched(tv: number, season: number, episode: number, watched: boolean) {
    const uid = this.u();
    if (watched)
      await supabase.from('app_ep_state').upsert([{ profile_id: uid, tvdb_show_id: tv, season, episode }],
        { onConflict: 'profile_id,tvdb_show_id,season,episode', ignoreDuplicates: true });
    else
      await supabase.from('app_ep_state').delete().eq('profile_id', uid).eq('tvdb_show_id', tv).eq('season', season).eq('episode', episode);
    await this.recountShow(tv);
  }
  private async recountShow(tv: number) {
    const uid = this.u();
    const { data } = await supabase.from('app_ep_state').select('season,episode')
      .eq('profile_id', uid).eq('tvdb_show_id', tv).gte('season', 1);
    const rows = (data as { season: number; episode: number }[]) ?? [];
    const c = rows.length;
    const last = rows.slice().sort((a, b) => (b.season - a.season) || (b.episode - a.episode))[0];
    await supabase.from('app_shows')
      .update({ watched_episodes: c, last_season: last?.season ?? null, last_episode: last?.episode ?? null, last_watched_at: nowIso() })
      .eq('profile_id', uid).eq('tvdb_id', tv);
  }
  async addShow(p: AddShow) {
    must('app_shows upsert', await supabase.from('app_shows').upsert([{
      profile_id: this.u(), tvdb_id: p.tvdb_id, title: p.title, state: p.state ?? 'backlog', is_favorite: 0, watched_episodes: 0,
      poster: p.poster, tmdb_status: p.tmdb_status, total_episodes: p.total_episodes, network: p.network,
      last_aired_season: p.last_aired_season, last_aired_episode: p.last_aired_episode, last_watched_at: nowIso(),
    }], { onConflict: 'profile_id,tvdb_id', ignoreDuplicates: true }));
  }
  async addMovie(p: AddMovie) {
    must('app_movies upsert', await supabase.from('app_movies').upsert([{
      profile_id: this.u(), uuid: p.uuid, title: p.title, slug: p.slug, year: p.year, watched_at: null, poster: p.poster, release_date: p.release_date,
    }], { onConflict: 'profile_id,uuid', ignoreDuplicates: true }));
  }
  async isShowInLibrary(tvdbId: number) {
    const { count } = await supabase.from('app_shows').select('*', { count: 'exact', head: true }).eq('profile_id', this.u()).eq('tvdb_id', tvdbId);
    return (count ?? 0) > 0;
  }
  async isMovieInLibrary(uuid: string) {
    const { count } = await supabase.from('app_movies').select('*', { count: 'exact', head: true }).eq('profile_id', this.u()).eq('uuid', uuid);
    return (count ?? 0) > 0;
  }
  async setMovieWatched(p: AddMovie, watched: boolean) {
    const uid = this.u();
    const at = watched ? nowIso() : null;
    const { count } = await supabase.from('app_movies').select('*', { count: 'exact', head: true }).eq('profile_id', uid).eq('uuid', p.uuid);
    if ((count ?? 0) > 0) must('app_movies update', await supabase.from('app_movies').update({ watched_at: at }).eq('profile_id', uid).eq('uuid', p.uuid));
    else if (watched) must('app_movies insert', await supabase.from('app_movies').insert([{ profile_id: uid, uuid: p.uuid, title: p.title, slug: p.slug, year: p.year, watched_at: at, poster: p.poster, release_date: p.release_date }]));
  }
  async setMovieReleaseDate(uuid: string, releaseDate: string | null) {
    must('app_movies release_date', await supabase.from('app_movies').update({ release_date: releaseDate }).eq('profile_id', this.u()).eq('uuid', uuid));
  }
  async setMoviePoster(uuid: string, poster: string | null) {
    await supabase.from('app_movies').update({ poster }).eq('profile_id', this.u()).eq('uuid', uuid);
  }
  async setShowPoster(tvdbId: number, poster: string | null) {
    await supabase.from('app_shows').update({ poster }).eq('profile_id', this.u()).eq('tvdb_id', tvdbId);
  }
  async setShowGenres(tvdbId: number, genres: string | null) {
    await supabase.from('app_shows').update({ genres }).eq('profile_id', this.u()).eq('tvdb_id', tvdbId);
  }
  async setOwnedPlatforms(tvdbId: number, ownedJson: string | null) {
    try { await supabase.from('app_shows').update({ owned_platforms: ownedJson }).eq('profile_id', this.u()).eq('tvdb_id', tvdbId); } catch { /* column may not exist yet */ }
  }
  async setShowRating(tvdbId: number, rating: number | null) {
    try { await supabase.from('app_shows').update({ user_rating: rating }).eq('profile_id', this.u()).eq('tvdb_id', tvdbId); } catch { /* column may not exist yet (apply 0014) */ }
  }
  async setShowNotes(tvdbId: number, notes: string | null) {
    try { await supabase.from('app_shows').update({ notes }).eq('profile_id', this.u()).eq('tvdb_id', tvdbId); } catch { /* column may not exist yet (apply 0014) */ }
  }
  async setPlatforms(tvdbId: number, platformsJson: string | null) {
    try { await supabase.from('app_shows').update({ platforms: platformsJson }).eq('profile_id', this.u()).eq('tvdb_id', tvdbId); } catch { /* column may not exist yet */ }
  }
  async addSteamGame(p: SteamGame) {
    try { await supabase.from('app_shows').upsert({ profile_id: this.u(), tvdb_id: p.tvdb_id, title: p.title, state: p.state, poster: p.poster, owned_platforms: p.owned_platforms, playtime_minutes: p.playtime_minutes, steam_appid: p.steam_appid, last_watched_at: nowIso() }, { onConflict: 'profile_id,tvdb_id' }); } catch { /* columns may not exist yet */ }
  }
  async setMovieGenres(uuid: string, genres: string | null) {
    await supabase.from('app_movies').update({ genres }).eq('profile_id', this.u()).eq('uuid', uuid);
  }
  async getUncheckedPendientes() {
    const { data } = await this.base('app_movies').is('watched_at', null).eq('rd_checked', 0);
    return (data as unknown as MovieRow[]) ?? [];
  }
  async markMovieChecked(uuid: string) {
    await supabase.from('app_movies').update({ rd_checked: 1 }).eq('profile_id', this.u()).eq('uuid', uuid);
  }
  async setShowNextAir(tvdbId: number, date: string | null, season: number | null, episode: number | null) {
    await supabase.from('app_shows').update({ next_air_date: date, next_season: season, next_episode: episode, na_checked: 1 })
      .eq('profile_id', this.u()).eq('tvdb_id', tvdbId);
  }
  async removeShow(tvdbId: number) {
    const uid = this.u();
    await supabase.from('app_shows').delete().eq('profile_id', uid).eq('tvdb_id', tvdbId);
    await supabase.from('app_ep_state').delete().eq('profile_id', uid).eq('tvdb_show_id', tvdbId);
  }
  async removeMovie(uuid: string) {
    await supabase.from('app_movies').delete().eq('profile_id', this.u()).eq('uuid', uuid);
  }
  async markWatched(tvdbId: number) {
    const uid = this.u();
    const { data: s } = await supabase.from('app_shows').select('watched_episodes,last_episode').eq('profile_id', uid).eq('tvdb_id', tvdbId).maybeSingle();
    if (s) await supabase.from('app_shows').update({
      watched_episodes: (s.watched_episodes ?? 0) + 1, last_episode: (s.last_episode ?? 0) + 1, last_watched_at: nowIso(),
    }).eq('profile_id', uid).eq('tvdb_id', tvdbId);
    const { data: p } = await supabase.from('app_profile').select('episodes').eq('profile_id', uid).maybeSingle();
    await supabase.from('app_profile').update({ episodes: (p?.episodes ?? 0) + 1 }).eq('profile_id', uid);
  }
}
