import * as SQLite from 'expo-sqlite';
import { SCHEMA } from './schema';
import type { DataSource, Profile, ShowRow, RecentRow, ListRow, ListItemRow, MovieRow, ReviewRow, BadgeRow, AddShow, AddMovie, SteamGame } from './types';
import seed from '../../assets/seed.json';
import { localToday } from '../dates';

// LocalSource — on-device SQLite, seeded once from the TV Time import (assets/seed.json).
export class LocalSource implements DataSource {
  private db: SQLite.SQLiteDatabase | null = null;

  async ready() {
    if (this.db) return;
    // v7: adds movies.is_favorite + list_items and imports TV Time favorites/lists — clean re-seed.
    const db = await SQLite.openDatabaseAsync('gamerhoard-v1.db');
    await db.execAsync(SCHEMA);
    // GamerHoard: platform ownership + available-platforms cache on the games (shows) table.
    for (const col of ['owned_platforms text', 'platforms text', 'playtime_minutes integer', 'steam_appid integer', 'user_rating integer', 'notes text']) { try { await db.execAsync(`alter table shows add column ${col}`); } catch { /* exists */ } }
    try { await db.execAsync('alter table movies add column release_date text'); } catch { /* column exists */ }
    try { await db.execAsync('alter table movies add column rd_checked integer default 0'); } catch { /* column exists */ }
    try { await db.execAsync('alter table movies add column is_favorite integer not null default 0'); } catch { /* column exists */ }
    for (const col of ['next_air_date text', 'next_season integer', 'next_episode integer', 'na_checked integer default 0', 'genres text']) { try { await db.execAsync(`alter table shows add column ${col}`); } catch { /* exists */ } }
    try { await db.execAsync('alter table movies add column genres text'); } catch { /* column exists */ }
    try { await db.execAsync('alter table recent_watches add column poster text'); } catch { /* column exists */ }
    try { await db.execAsync('alter table movies add column rewatch_count integer not null default 0'); } catch { /* column exists */ }
    // Speed up the recent-activity title joins + history sort on big TV Time imports.
    try { await db.execAsync('create index if not exists shows_title_idx on shows (title); create index if not exists movies_title_idx on movies (title); create index if not exists recent_at_idx on recent_watches (watched_at desc)'); } catch { /* ignore */ }
    for (const col of ['show_tvdb integer', 'movie_uuid text']) { try { await db.execAsync(`alter table recent_watches add column ${col}`); } catch { /* exists */ } }
    try { await db.execAsync('alter table movies add column tmdb_id integer'); } catch { /* column exists */ }
    try { await db.execAsync('alter table ep_state add column rewatch_count integer not null default 0'); } catch { /* column exists */ }
    await db.execAsync('create table if not exists app_meta (key text primary key, value text)');
    const cleared = await db.getFirstAsync<{ value: string }>("select value from app_meta where key = 'cleared'");
    if (cleared?.value !== '1') {
      const row = await db.getFirstAsync<{ c: number }>('select count(*) as c from profile');
      if (!row || row.c === 0) await this.seed(db);
    }
    // One-shot: persist entity refs on imported TV Time events (title-match), so history
    // links survive later renames/removals instead of being resolved live on every read.
    try {
      const done = await db.getFirstAsync<{ value: string }>("select value from app_meta where key = 'recent_backfill_v1'");
      if (done?.value !== '1') {
        await db.execAsync(`update recent_watches set show_tvdb = (select s.tvdb_id from shows s where s.title = recent_watches.title limit 1) where kind = 'episode' and show_tvdb is null`);
        await db.execAsync(`update recent_watches set movie_uuid = (select m.uuid from movies m where m.title = recent_watches.title limit 1) where kind = 'movie' and movie_uuid is null`);
        await db.runAsync("insert or replace into app_meta (key, value) values ('recent_backfill_v1', '1')");
      }
    } catch { /* ignore */ }
    this.db = db;
  }

  private async seed(db: SQLite.SQLiteDatabase) { await this.seedFrom(db, seed as any); }

  private async seedFrom(db: SQLite.SQLiteDatabase, src: any) {
    const p = src.profile;
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `insert into profile (id,handle,series_clock,episodes,movies_clock,movies,shows_added,following,lists,badges,reactions,comments,character_votes)
         values (1,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.handle, p.seriesClock, p.episodes, p.moviesClock, p.movies, p.showsAdded, p.following, p.lists, p.badges, p.reactions, p.comments, p.characterVotes ?? 0]
      );
      for (const s of src.shows) {
        await db.runAsync(
          `insert or replace into shows (tvdb_id,title,state,is_favorite,watched_episodes,last_season,last_episode,last_watched_at,poster,tmdb_status,total_episodes,network,last_aired_season,last_aired_episode,genres,next_air_date,next_season,next_episode)
           values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [s.tvdbId ?? Math.floor(Math.random() * 1e9), s.title, s.state, s.isFavorite ? 1 : 0, s.watchedEpisodes, s.lastSeason, s.lastEpisode, s.lastWatchedAt, s.poster ?? null, s.tmdbStatus ?? null, s.totalEpisodes ?? null, s.network ?? null, s.lastAiredSeason ?? null, s.lastAiredEpisode ?? null, s.genres ?? null, s.nextAirDate ?? null, s.nextSeason ?? null, s.nextEpisode ?? null]
        );
      }
      for (const r of src.recent)
        await db.runAsync(`insert into recent_watches (kind,title,season,episode,watched_at,poster,show_tvdb,movie_uuid) values (?,?,?,?,?,?,?,?)`, [r.kind, r.title, r.season, r.episode, r.watchedAt, r.poster ?? null, r.showTvdb ?? null, r.movieUuid ?? null]);
      for (const l of src.lists) {
        const res = await db.runAsync(`insert into lists (name,is_public,item_count) values (?,?,?)`, [l.name, l.isPublic ? 1 : 0, l.itemCount]);
        const listId = res.lastInsertRowId;
        for (const it of (l.items ?? []))
          await db.runAsync(`insert into list_items (list_id,kind,tvdb_id,uuid) values (?,?,?,?)`, [listId, it.kind, it.tvdb ?? null, it.uuid ?? null]);
      }
      for (const m of (src.movies || []))
        await db.runAsync(`insert into movies (uuid,title,slug,year,watched_at,poster,release_date,is_favorite,genres,rewatch_count,tmdb_id) values (?,?,?,?,?,?,?,?,?,?,?)`, [m.uuid ?? null, m.title, m.slug ?? null, m.year ?? null, m.watchedAt ?? null, m.poster ?? null, m.releaseDate ?? null, m.isFavorite ? 1 : 0, m.genres ?? null, m.rewatchCount ?? 0, m.tmdbId ?? null]);
      for (const r of (src.reviews || []))
        await db.runAsync(`insert into reviews (text,entity_type,title,is_spoiler,like_count,created_at) values (?,?,?,?,?,?)`, [r.text, r.entityType ?? null, r.title ?? null, r.isSpoiler ? 1 : 0, r.likeCount ?? 0, r.createdAt ?? null]);
      for (const b of (src.badges || []))
        await db.runAsync(`insert into badges (key,label,grp,show_tvdb) values (?,?,?,?)`, [b.key ?? null, b.label, b.group ?? null, b.showTvdb ?? null]);
    });
  }

  async clearData() {
    const db = this.q();
    await db.withTransactionAsync(async () => {
      for (const t of ['ep_state', 'shows', 'movies', 'recent_watches', 'lists', 'list_items', 'reviews', 'badges', 'profile']) await db.runAsync(`delete from ${t}`);
      await db.runAsync("insert or replace into app_meta (key, value) values ('cleared', '1')");
    });
  }
  async importData(seedObj: unknown) {
    await this.ready();
    const db = this.q();
    await db.withTransactionAsync(async () => {
      for (const t of ['ep_state', 'shows', 'movies', 'recent_watches', 'lists', 'list_items', 'reviews', 'badges', 'profile']) await db.runAsync(`delete from ${t}`);
      await db.runAsync("delete from app_meta where key = 'cleared'");
      await db.runAsync("delete from app_meta where key = 'recent_backfill_v1'");
    });
    await this.seedFrom(db, seedObj as any);
    // Link the freshly imported history rows to their shows/movies right away.
    try {
      await db.execAsync(`update recent_watches set show_tvdb = (select s.tvdb_id from shows s where s.title = recent_watches.title limit 1) where kind = 'episode' and show_tvdb is null`);
      await db.execAsync(`update recent_watches set movie_uuid = (select m.uuid from movies m where m.title = recent_watches.title limit 1) where kind = 'movie' and movie_uuid is null`);
      await db.runAsync("insert or replace into app_meta (key, value) values ('recent_backfill_v1', '1')");
    } catch { /* ignore */ }
  }
  async reimport() {
    if (this.db) { try { await this.db.closeAsync(); } catch { /* ignore */ } this.db = null; }
    try { await SQLite.deleteDatabaseAsync('watchhoard-v7.db'); } catch { /* ignore */ }
    await this.ready();
  }
  private q<T>() { if (!this.db) throw new Error('call ready() first'); return this.db; }
  async getProfile() { return this.q().getFirstAsync<Profile>('select * from profile where id=1'); }
  async getContinueWatching(limit = 20) { return this.q().getAllAsync<ShowRow>('select * from shows where last_watched_at is not null order by last_watched_at desc limit ?', [limit]); }
  async getShows() { return this.q().getAllAsync<ShowRow>('select * from shows order by last_watched_at desc'); }
  async getShowById(tvdbId: number) { return this.q().getFirstAsync<ShowRow>('select * from shows where tvdb_id = ?', [tvdbId]); }
  async getFavorites(limit = 60) { return this.q().getAllAsync<ShowRow>('select * from shows where is_favorite = 1 order by last_watched_at desc limit ?', [limit]); }
  async getFavoriteMovies(limit = 60) { return this.q().getAllAsync<MovieRow>('select * from movies where is_favorite = 1 order by watched_at desc limit ?', [limit]); }
  // New events store their entity id; imported TV Time events fall back to a title match.
  async getRecent(limit = 30) {
    return this.q().getAllAsync<RecentRow>(
      `select r.id, r.kind, r.title, r.season, r.episode, r.watched_at,
              coalesce(r.poster, s.poster, m.poster) as poster,
              coalesce(r.show_tvdb, s.tvdb_id) as show_tvdb,
              coalesce(r.movie_uuid, m.uuid) as movie_uuid
         from recent_watches r
         left join shows s  on r.kind = 'episode' and (s.tvdb_id = r.show_tvdb or (r.show_tvdb is null and s.title = r.title))
         left join movies m on r.kind = 'movie'  and (m.uuid = r.movie_uuid or (r.movie_uuid is null and m.title = r.title))
        group by r.id
        order by r.watched_at desc limit ?`, [limit]);
  }
  async getLists() { return this.q().getAllAsync<ListRow>('select * from lists order by item_count desc'); }
  async getListById(listId: number) { return this.q().getFirstAsync<ListRow>('select * from lists where id = ?', [listId]); }
  async getListItems(listId: number) {
    return this.q().getAllAsync<ListItemRow>(
      `select li.kind as kind, li.tvdb_id as tvdb_id, li.uuid as uuid,
              coalesce(s.title, m.title, '') as title,
              coalesce(s.poster, m.poster) as poster,
              m.year as year, m.watched_at as watched_at, s.last_watched_at as last_watched_at
         from list_items li
         left join shows s  on li.kind = 'series' and s.tvdb_id = li.tvdb_id
         left join movies m on li.kind = 'movie'  and m.uuid    = li.uuid
        where li.list_id = ? order by li.id asc`, [listId]);
  }
  async setShowMeta(tvdbId: number, m: { tmdb_status: string | null; total_episodes: number | null; network: string | null; last_aired_season: number | null; last_aired_episode: number | null }) {
    await this.q().runAsync('update shows set tmdb_status=?, total_episodes=?, network=?, last_aired_season=?, last_aired_episode=? where tvdb_id=?',
      [m.tmdb_status, m.total_episodes, m.network, m.last_aired_season, m.last_aired_episode, tvdbId]);
  }
  async rewatchMovie(uuid: string) {
    await this.q().runAsync('update movies set watched_at=?, rewatch_count=coalesce(rewatch_count,0)+1 where uuid=?', [new Date().toISOString(), uuid]);
  }
  async rewatchEpisode(tv: number, season: number, episode: number) {
    await this.q().runAsync('update ep_state set rewatch_count = coalesce(rewatch_count,0)+1 where tvdb_show_id=? and season=? and episode=?', [tv, season, episode]);
  }
  async getEpisodeRewatches(tv: number) {
    return this.q().getAllAsync<{ season: number; episode: number; rewatch_count: number }>('select season, episode, coalesce(rewatch_count,0) as rewatch_count from ep_state where tvdb_show_id=? and season>=1 and coalesce(rewatch_count,0)>0', [tv]);
  }
  async logRecent(e: { kind: 'episode' | 'movie'; title: string; season?: number | null; episode?: number | null; poster?: string | null; tvdb?: number | null; uuid?: string | null }) {
    await this.q().runAsync('insert into recent_watches (kind,title,season,episode,watched_at,poster,show_tvdb,movie_uuid) values (?,?,?,?,?,?,?,?)',
      [e.kind, e.title, e.season ?? null, e.episode ?? null, new Date().toISOString(), e.poster ?? null, e.tvdb ?? null, e.uuid ?? null]);
  }
  async setShowState(tvdbId: number, state: 'backlog' | 'watching' | 'stopped' | 'archived') {
    await this.q().runAsync('update shows set state=? where tvdb_id=?', [state, tvdbId]);
  }
  async createList(name: string, isPublic = false) {
    const r = await this.q().runAsync('insert into lists (name,is_public,item_count) values (?,?,0)', [name, isPublic ? 1 : 0]);
    return r.lastInsertRowId ?? null;
  }
  async renameList(listId: number, name: string) { await this.q().runAsync('update lists set name=? where id=?', [name, listId]); }
  async deleteList(listId: number) {
    await this.q().runAsync('delete from list_items where list_id=?', [listId]);
    await this.q().runAsync('delete from lists where id=?', [listId]);
  }
  async addToList(listId: number, it: { kind: 'series' | 'movie'; tvdb?: number | null; uuid?: string | null }) {
    const db = this.q();
    const dup = await db.getFirstAsync<{ c: number }>('select count(*) as c from list_items where list_id=? and kind=? and (tvdb_id is ? or tvdb_id=?) and (uuid is ? or uuid=?)', [listId, it.kind, it.tvdb ?? null, it.tvdb ?? -1, it.uuid ?? null, it.uuid ?? '']);
    if ((dup?.c ?? 0) > 0) return;
    await db.runAsync('insert into list_items (list_id,kind,tvdb_id,uuid) values (?,?,?,?)', [listId, it.kind, it.tvdb ?? null, it.uuid ?? null]);
    await db.runAsync('update lists set item_count = item_count + 1 where id=?', [listId]);
  }
  async removeFromList(listId: number, it: { kind: 'series' | 'movie'; tvdb?: number | null; uuid?: string | null }) {
    const db = this.q();
    const r = it.kind === 'series'
      ? await db.runAsync('delete from list_items where list_id=? and kind=? and tvdb_id=?', [listId, it.kind, it.tvdb ?? -1])
      : await db.runAsync('delete from list_items where list_id=? and kind=? and uuid=?', [listId, it.kind, it.uuid ?? '']);
    if ((r.changes ?? 0) > 0) await db.runAsync('update lists set item_count = max(0, item_count - ?) where id=?', [r.changes, listId]);
  }
  async setShowFavorite(tvdbId: number, favorite: boolean) { await this.q().runAsync('update shows set is_favorite = ? where tvdb_id = ?', [favorite ? 1 : 0, tvdbId]); }
  async setMovieFavorite(uuid: string, favorite: boolean) { await this.q().runAsync('update movies set is_favorite = ? where uuid = ?', [favorite ? 1 : 0, uuid]); }
  async getMovies(limit = 120) { const t = localToday(); return this.q().getAllAsync<MovieRow>('select * from movies where not (watched_at is null and release_date is not null and release_date > ?) order by watched_at desc limit ?', [t, limit]); }
  async getUpcomingMovies() { const t = localToday(); return this.q().getAllAsync<MovieRow>('select * from movies where watched_at is null and release_date is not null and release_date > ? order by release_date asc', [t]); }
  async getMovieByUuid(uuid: string) { return this.q().getFirstAsync<MovieRow>('select * from movies where uuid = ?', [uuid]); }
  async getReviews(limit = 50) { return this.q().getAllAsync<ReviewRow>('select * from reviews order by created_at desc limit ?', [limit]); }
  async getBadges() { return this.q().getAllAsync<BadgeRow>('select * from badges order by grp, label'); }

  async setProgress(tvdbId: number, lastSeason: number, lastEpisode: number, watchedEpisodes: number) {
    await this.q().runAsync(`update shows set last_season=?, last_episode=?, watched_episodes=?, last_watched_at=? where tvdb_id=?`, [lastSeason, lastEpisode, watchedEpisodes, new Date().toISOString(), tvdbId]);
  }
  async getWatchedEpisodes(tv: number) { return this.q().getAllAsync<{ season: number; episode: number }>('select season, episode from ep_state where tvdb_show_id = ? and season >= 0', [tv]); }
  async seedEpState(tv: number, eps: { season: number; episode: number }[]) {
    const db = this.q();
    const seeded = await db.getFirstAsync('select 1 as x from ep_state where tvdb_show_id = ? and season = -1', [tv]);
    if (seeded) return;
    await db.withTransactionAsync(async () => {
      await db.runAsync('insert or ignore into ep_state (tvdb_show_id,season,episode) values (?,-1,-1)', [tv]);
      for (const e of eps) await db.runAsync('insert or ignore into ep_state (tvdb_show_id,season,episode) values (?,?,?)', [tv, e.season, e.episode]);
    });
    await this.recountShow(tv);
  }
  async setEpisodeWatched(tv: number, season: number, episode: number, watched: boolean) {
    const db = this.q();
    if (watched) await db.runAsync('insert or ignore into ep_state (tvdb_show_id,season,episode) values (?,?,?)', [tv, season, episode]);
    else await db.runAsync('delete from ep_state where tvdb_show_id=? and season=? and episode=?', [tv, season, episode]);
    await this.recountShow(tv);
  }
  private async recountShow(tv: number) {
    const db = this.q();
    const c = (await db.getFirstAsync<{ c: number }>('select count(*) as c from ep_state where tvdb_show_id=? and season>=1', [tv]))?.c ?? 0;
    const last = await db.getFirstAsync<{ season: number; episode: number }>('select season, episode from ep_state where tvdb_show_id=? and season>=1 order by season desc, episode desc limit 1', [tv]);
    await db.runAsync('update shows set watched_episodes=?, last_season=?, last_episode=?, last_watched_at=? where tvdb_id=?', [c, last?.season ?? null, last?.episode ?? null, new Date().toISOString(), tv]);
  }
  async addShow(p: AddShow) {
    // Games land in the backlog by default; last_watched_at is stamped so new adds
    // surface at the top of "recent" ordering instead of sinking to the bottom.
    await this.q().runAsync('insert or ignore into shows (tvdb_id,title,state,is_favorite,watched_episodes,poster,tmdb_status,total_episodes,network,last_aired_season,last_aired_episode,last_watched_at) values (?,?,?,0,0,?,?,?,?,?,?,?)', [p.tvdb_id, p.title, p.state ?? 'backlog', p.poster, p.tmdb_status, p.total_episodes, p.network, p.last_aired_season, p.last_aired_episode, new Date().toISOString()]);
  }
  async addMovie(p: AddMovie) {
    await this.q().runAsync('insert or ignore into movies (uuid,title,slug,year,watched_at,poster,release_date) values (?,?,?,?,?,?,?)', [p.uuid, p.title, p.slug, p.year, null, p.poster, p.release_date]);
  }
  async isShowInLibrary(tvdbId: number) { return !!(await this.q().getFirstAsync('select 1 as x from shows where tvdb_id = ?', [tvdbId])); }
  async setMovieWatched(p: AddMovie, watched: boolean) {
    const at = watched ? new Date().toISOString() : null;
    const exists = await this.q().getFirstAsync('select 1 as x from movies where uuid = ?', [p.uuid]);
    if (exists) await this.q().runAsync('update movies set watched_at = ? where uuid = ?', [at, p.uuid]);
    else if (watched) await this.q().runAsync('insert into movies (uuid,title,slug,year,watched_at,poster,release_date) values (?,?,?,?,?,?,?)', [p.uuid, p.title, p.slug, p.year, at, p.poster, p.release_date]);
  }
  async setMovieReleaseDate(uuid: string, releaseDate: string | null) { await this.q().runAsync('update movies set release_date = ? where uuid = ?', [releaseDate, uuid]); }
  async setMoviePoster(uuid: string, poster: string | null) { await this.q().runAsync('update movies set poster = ? where uuid = ?', [poster, uuid]); }
  async setMovieTmdbId(uuid: string, tmdbId: number | null) { await this.q().runAsync('update movies set tmdb_id = ? where uuid = ?', [tmdbId, uuid]); }
  async setShowPoster(tvdbId: number, poster: string | null) { await this.q().runAsync('update shows set poster = ? where tvdb_id = ?', [poster, tvdbId]); }
  async setShowGenres(tvdbId: number, genres: string | null) { await this.q().runAsync('update shows set genres = ? where tvdb_id = ?', [genres, tvdbId]); }
  async setOwnedPlatforms(tvdbId: number, ownedJson: string | null) { await this.q().runAsync('update shows set owned_platforms = ? where tvdb_id = ?', [ownedJson, tvdbId]); }
  async setPlatforms(tvdbId: number, platformsJson: string | null) { await this.q().runAsync('update shows set platforms = ? where tvdb_id = ?', [platformsJson, tvdbId]); }
  async addSteamGame(p: SteamGame) {
    const db = this.q();
    await db.runAsync('insert or ignore into shows (tvdb_id,title,state,is_favorite,watched_episodes,poster,owned_platforms,playtime_minutes,steam_appid,last_watched_at) values (?,?,?,0,0,?,?,?,?,?)', [p.tvdb_id, p.title, p.state, p.poster, p.owned_platforms, p.playtime_minutes, p.steam_appid, new Date().toISOString()]);
    await db.runAsync('update shows set playtime_minutes=?, steam_appid=?, poster=coalesce(poster,?), owned_platforms=coalesce(owned_platforms,?) where tvdb_id=?', [p.playtime_minutes, p.steam_appid, p.poster, p.owned_platforms, p.tvdb_id]);
  }
  async setShowRating(tvdbId: number, rating: number | null) { await this.q().runAsync('update shows set user_rating = ? where tvdb_id = ?', [rating, tvdbId]); }
  async setShowNotes(tvdbId: number, notes: string | null) { await this.q().runAsync('update shows set notes = ? where tvdb_id = ?', [notes, tvdbId]); }
  async setMovieGenres(uuid: string, genres: string | null) { await this.q().runAsync('update movies set genres = ? where uuid = ?', [genres, uuid]); }
  async getUncheckedPendientes() { return this.q().getAllAsync<MovieRow>('select * from movies where watched_at is null and (rd_checked is null or rd_checked = 0)'); }
  async markMovieChecked(uuid: string) { await this.q().runAsync('update movies set rd_checked = 1 where uuid = ?', [uuid]); }
  async isMovieInLibrary(uuid: string) { return !!(await this.q().getFirstAsync('select 1 as x from movies where uuid = ?', [uuid])); }
  async setShowNextAir(tvdbId: number, date: string | null, season: number | null, episode: number | null) {
    await this.q().runAsync('update shows set next_air_date=?, next_season=?, next_episode=?, na_checked=1 where tvdb_id=?', [date, season, episode, tvdbId]);
  }
  async removeShow(tvdbId: number) {
    await this.q().runAsync('delete from shows where tvdb_id = ?', [tvdbId]);
    await this.q().runAsync('delete from ep_state where tvdb_show_id = ?', [tvdbId]);
  }
  async removeMovie(uuid: string) { await this.q().runAsync('delete from movies where uuid = ?', [uuid]); }
  async markWatched(tvdbId: number) {
    const db = this.q();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `update shows set watched_episodes = watched_episodes + 1,
           last_episode = coalesce(last_episode,0) + 1,
           last_watched_at = ? where tvdb_id = ?`,
        [new Date().toISOString(), tvdbId]
      );
      await db.runAsync(`update profile set episodes = episodes + 1 where id = 1`);
    });
  }
}
