// In-app port of packages/importer/src/parse.ts — same logic, but reads the CSVs
// from an in-memory map (basename → text) extracted from the user's GDPR zip.
import { parseCsv } from './csv';

export type FollowState = 'watching' | 'stopped' | 'archived';
export interface NormFollow { tvdbShowId: number | null; name: string; state: FollowState; isForLater: boolean; isArchived: boolean; followedAt: string | null }
export interface NormWatch { kind: 'episode' | 'movie'; tvdbShowId: number | null; tvdbEpId: number | null; season: number | null; number: number | null; isSpecial: boolean; rewatchCount: number; runtimeMin: number | null; seriesName: string | null; movieName: string | null; watchedAt: string | null }
export interface NormComment { entityType: 'show' | 'episode' | 'movie'; entityUuid: string | null; body: string; isSpoiler: boolean; lang: string | null; likeCount: number; createdAt: string | null; seriesName: string | null; movieName: string | null }
export interface NormListItem { type: 'series' | 'movie'; tvdb: number | null; uuid: string | null }
export interface NormList { sKey: string; name: string; description: string | null; isPublic: boolean; items: NormListItem[] }
export interface NormMovie { title: string; slug: string | null; year: number | null; watchedAt: string | null; runtimeSec: number | null; uuid: string | null; releaseDate: string | null }
export interface NormProfile {
  handle: string | null; locale: string;
  follows: NormFollow[]; watches: NormWatch[]; reactions: number; characterVotes: number;
  comments: NormComment[]; lists: NormList[]; favoriteShows: number[]; favoriteMovies: string[];
  movies: NormMovie[]; badges: string[]; friends: number; episodesSeenByShow: Record<number, number>;
}

/** Every CSV the importer consumes — used as the unzip whitelist. */
export const WANTED_FILES = [
  'tracking-prod-records-v2.csv', 'tracking-prod-records.csv',
  'ratings-live-votes.csv', 'ratings-3-prod-episode_votes.csv',
  'emotions-live-votes.csv', 'emotions-3-prod-episode_votes.csv',
  'comments-prod-comments.csv', 'lists-prod-lists.csv',
  'user_tv_show_data.csv', 'user_badge.csv', 'friend.csv',
  'show_character_episode_vote.csv', 'user_setting.csv', 'user_social_data.csv',
];

export type Files = Record<string, string>;

const truthy = (v: unknown) => v === 'true' || v === '1' || v === 1 || v === true;
const intOr = (v: unknown, d: number | null = null) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
};
const trailingInt = (key: string): number => { const m = /(\d+)\s*$/.exec(key || ''); return m ? parseInt(m[1], 10) : 0; };

export function makeReader(files: Files) {
  const cache = new Map<string, Record<string, string>[]>();
  return (name: string): Record<string, string>[] => {
    if (cache.has(name)) return cache.get(name)!;
    const text = files[name];
    const rows = text ? parseCsv(text) : [];
    cache.set(name, rows);
    return rows;
  };
}

export function parseTvTimeExport(files: Files): NormProfile {
  const readCsv = makeReader(files);

  // ---- the v2 ledger: follows + episode watches ----
  const v2 = readCsv('tracking-prod-records-v2.csv');
  const follows: NormFollow[] = [];
  const watches: NormWatch[] = [];
  for (const r of v2) {
    const key = r.key || '';
    if (key.startsWith('user-series-')) {
      const state: FollowState = truthy(r.is_archived) ? 'archived' : (truthy(r.is_followed) ? 'watching' : 'stopped');
      follows.push({ tvdbShowId: intOr(r.s_id), name: r.series_name || '', state, isForLater: truthy(r.is_for_later), isArchived: truthy(r.is_archived), followedAt: r.followed_at || null });
    } else if (key.startsWith('watch-episode-')) {
      const isMovie = truthy(r.is_unitary);
      watches.push({
        kind: isMovie ? 'movie' : 'episode', tvdbShowId: intOr(r.s_id), tvdbEpId: intOr(r.ep_id),
        season: intOr(r.s_no), number: intOr(r.ep_no), isSpecial: truthy(r.is_special),
        rewatchCount: intOr(r.rewatch_count, 0) ?? 0, runtimeMin: intOr(r.runtime),
        seriesName: r.series_name || null, movieName: r.movie_name || null, watchedAt: r.created_at || null,
      });
    }
  }

  // ---- reactions (counts only for the profile stats) ----
  const reactions =
    readCsv('ratings-live-votes.csv').length + readCsv('ratings-3-prod-episode_votes.csv').length +
    readCsv('emotions-live-votes.csv').length + readCsv('emotions-3-prod-episode_votes.csv').length;

  // ---- comments ----
  const comments: NormComment[] = readCsv('comments-prod-comments.csv').map((r) => ({
    entityType: (r.entity_type as NormComment['entityType']) || 'show',
    entityUuid: r.entity_uuid || null, body: r.text || '', isSpoiler: truthy(r.is_spoiler),
    lang: r.lang || null, likeCount: intOr(r.like_count, 0) ?? 0, createdAt: r.created_at || null,
    seriesName: r.series_name || null, movieName: r.movie_name || null,
  }));

  // ---- lists + favorites (Go-map dumps; series carry tvdb id, movies a uuid) ----
  const listRows = readCsv('lists-prod-lists.csv');
  const nameBySKey: Record<string, string> = {};
  for (const r of listRows) {
    if (r.s_key !== 'collection') continue;
    const meta = r.lists || '';
    const re = /name:(.+?) order:\S+ posters:\[[^\]]*\] s_key:(\S+) type:list/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(meta))) nameBySKey[m[2]] = m[1];
  }
  const parseItems = (raw: string): NormListItem[] => {
    const items: NormListItem[] = [];
    const re = /map\[([^\]]*)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw || ''))) {
      const body = m[1];
      if (/\btype:series\b/.test(body)) {
        const id = /\bid:(\d+)/.exec(body);
        if (id) items.push({ type: 'series', tvdb: parseInt(id[1], 10), uuid: null });
      } else if (/\btype:movie\b/.test(body)) {
        const u = /\buuid:([0-9a-f-]+)/.exec(body);
        if (u) items.push({ type: 'movie', tvdb: null, uuid: u[1] });
      }
    }
    return items;
  };
  const lists: NormList[] = [];
  const favoriteShows: number[] = [];
  const favoriteMovies: string[] = [];
  for (const r of listRows) {
    if (r.type !== 'list') continue;
    const sKey = r.s_key || '';
    const items = parseItems(r.objects || '');
    if (sKey === 'favorite-series') { for (const it of items) if (it.tvdb != null) favoriteShows.push(it.tvdb); }
    else if (sKey === 'favorite-movies') { for (const it of items) if (it.uuid) favoriteMovies.push(it.uuid); }
    else lists.push({ sKey, name: r.name || nameBySKey[sKey] || '', description: r.description || null, isPublic: truthy(r.is_public), items });
  }

  // ---- authoritative per-show watched count (bulk-marks miss the ledger) ----
  const episodesSeenByShow: Record<number, number> = {};
  for (const r of readCsv('user_tv_show_data.csv')) {
    const tvdb = intOr(r.tv_show_id); const n = intOr(r.nb_episodes_seen, 0) ?? 0;
    if (tvdb != null) episodesSeenByShow[tvdb] = n;
  }

  // ---- movies (v1 ledger: title + English slug + release date) ----
  const movies: NormMovie[] = [];
  const v1movies = readCsv('tracking-prod-records.csv').filter((r) => r.entity_type === 'movie');
  const baseSlug = (r: Record<string, string>) => (r.alpha_range_key || '').replace(/^(watch|follow|towatch)-alpha-/, '') || null;
  const yearOf = (r: Record<string, string>) => (/^\d{4}/.test(r.release_date || '') ? parseInt((r.release_date || '').slice(0, 4), 10) : null);
  // TV Time uses DIFFERENT slugs for the same movie across follow/watch rows — dedup pendientes
  // by NORMALIZED TITLE as well as slug, or watched movies leak into the watchlist.
  const normTitle = (x: string) => (x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const seenSlug = new Set<string>();
  const seenTitle = new Set<string>();
  for (const r of v1movies) {
    if (r.type !== 'watch') continue;
    const slug = baseSlug(r); if (slug) seenSlug.add(slug);
    const nt = normTitle(r.movie_name || slug || ''); if (nt) seenTitle.add(nt);
    movies.push({ title: r.movie_name || (slug ? slug.replace(/-/g, ' ') : ''), slug, year: yearOf(r), watchedAt: r.created_at || null, runtimeSec: intOr(r.runtime), uuid: r.uuid || null, releaseDate: (r.release_date || '').slice(0, 10) || null });
  }
  for (const r of v1movies) {
    if (r.type !== 'follow' && r.type !== 'towatch') continue;
    const slug = baseSlug(r); const nt = normTitle(r.movie_name || slug || '');
    if (!slug && !nt) continue;
    if ((slug && seenSlug.has(slug)) || (nt && seenTitle.has(nt))) continue;
    if (slug) seenSlug.add(slug); if (nt) seenTitle.add(nt);
    movies.push({ title: r.movie_name || (slug as string).replace(/-/g, ' '), slug, year: yearOf(r), watchedAt: null, runtimeSec: intOr(r.runtime), uuid: r.uuid || null, releaseDate: (r.release_date || '').slice(0, 10) || null });
  }

  const badges = readCsv('user_badge.csv').map((r) => r.badge_id).filter(Boolean);
  const friends = readCsv('friend.csv').length;
  const characterVotes = readCsv('show_character_episode_vote.csv').length;
  const settings: Record<string, string> = {};
  for (const r of readCsv('user_setting.csv')) if (r.name) settings[r.name] = r.value;
  const social = readCsv('user_social_data.csv')[0] || {};

  return {
    handle: social.screen_name || null, locale: settings.locale || 'en',
    follows, watches, reactions, characterVotes, comments, lists, favoriteShows, favoriteMovies, movies, badges, friends, episodesSeenByShow,
  };
}
