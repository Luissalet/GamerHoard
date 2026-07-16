import { parse } from 'csv-parse/sync';
import fs from 'node:fs';
import path from 'node:path';
import type { NormProfile, NormFollow, NormWatch, NormReaction, NormComment, NormList, NormListItem, NormMovie, FollowState } from './types.ts';

const truthy = (v: unknown) => v === 'true' || v === '1' || v === 1 || v === true;
const intOr = (v: unknown, d: number | null = null) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
};

function readCsv(dir: string, file: string): Record<string, string>[] {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return [];
  return parse(fs.readFileSync(p), {
    columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true,
  }) as Record<string, string>[];
}

// trailing integer of a vote_key like "{uuid}-{user_id}-{N}"
const trailingInt = (key: string): number => {
  const m = /(\d+)\s*$/.exec(key || '');
  return m ? parseInt(m[1], 10) : 0;
};

export function parseTvTimeExport(dir: string): NormProfile {
  // ---- the ledger ----
  const v2 = readCsv(dir, 'tracking-prod-records-v2.csv');
  const follows: NormFollow[] = [];
  const watches: NormWatch[] = [];
  for (const r of v2) {
    const key = r.key || '';
    if (key.startsWith('user-series-')) {
      const state: FollowState = truthy(r.is_archived) ? 'archived' : (truthy(r.is_followed) ? 'watching' : 'stopped');
      follows.push({
        tvdbShowId: intOr(r.s_id),
        name: r.series_name || '',
        state,
        isForLater: truthy(r.is_for_later),
        isArchived: truthy(r.is_archived),
        followedAt: r.followed_at || null,
      });
    } else if (key.startsWith('watch-episode-')) {
      const isMovie = truthy(r.is_unitary);
      watches.push({
        kind: isMovie ? 'movie' : 'episode',
        tvdbShowId: intOr(r.s_id),
        tvdbEpId: intOr(r.ep_id),
        season: intOr(r.s_no),
        number: intOr(r.ep_no),
        isSpecial: truthy(r.is_special),
        rewatchCount: intOr(r.rewatch_count, 0) ?? 0,
        runtimeMin: intOr(r.runtime),
        seriesName: r.series_name || null,
        movieName: r.movie_name || null,
        watchedAt: r.created_at || null,
      });
    }
  }

  // ---- reactions ----
  const reactions: NormReaction[] = [];
  for (const r of [...readCsv(dir, 'ratings-live-votes.csv'), ...readCsv(dir, 'ratings-3-prod-episode_votes.csv')]) {
    reactions.push({ kind: 'rating', entityUuid: r.uuid || null, value: trailingInt(r.vote_key),
      seriesName: r.series_name || null, movieName: r.movie_name || null, season: intOr(r.season_number), number: intOr(r.episode_number) });
  }
  for (const r of [...readCsv(dir, 'emotions-live-votes.csv'), ...readCsv(dir, 'emotions-3-prod-episode_votes.csv')]) {
    reactions.push({ kind: 'emotion', entityUuid: r.uuid || null, value: trailingInt(r.vote_key),
      seriesName: r.series_name || null, movieName: r.movie_name || null, season: intOr(r.season_number), number: intOr(r.episode_number) });
  }

  // ---- comments ----
  const comments: NormComment[] = readCsv(dir, 'comments-prod-comments.csv').map((r) => ({
    entityType: (r.entity_type as NormComment['entityType']) || 'show',
    entityUuid: r.entity_uuid || null,
    body: r.text || '',
    isSpoiler: truthy(r.is_spoiler),
    lang: r.lang || null,
    likeCount: intOr(r.like_count, 0) ?? 0,
    createdAt: r.created_at || null,
    seriesName: r.series_name || null,
    movieName: r.movie_name || null,
  }));

  // ---- lists + favorites ----
  // TV Time serializes list items as Go maps. Series items carry a TheTVDB `id` and come as
  // `map[created_at:… id:366925 type:series]`; movie items carry a UUID and no id, as
  // `map[created_at:… type:movie uuid:xxxx]`. (The old parser only matched `type:X uuid:Y`, so
  // it silently dropped EVERY series item.) Unnamed lists get their name from the `collection`
  // row's metadata (Go map keys are alphabetical: … name, order, posters, s_key …).
  const listRows = readCsv(dir, 'lists-prod-lists.csv');
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
    const re = /map\[([^\]]*)\]/g;                  // one entry per map[…] block (no nested brackets here)
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
    if (r.type !== 'list') continue;              // skip the `collection` metadata row
    const sKey = r.s_key || '';
    const items = parseItems(r.objects || '');
    if (sKey === 'favorite-series') {             // the two special lists become favorites, not custom lists
      for (const it of items) if (it.tvdb != null) favoriteShows.push(it.tvdb);
    } else if (sKey === 'favorite-movies') {
      for (const it of items) if (it.uuid) favoriteMovies.push(it.uuid);
    } else {
      lists.push({ sKey, name: r.name || nameBySKey[sKey] || '', description: r.description || null, isPublic: truthy(r.is_public), items });
    }
  }

  // ---- misc ----
  // ---- authoritative per-show watched count (bulk-marks miss the ledger) ----
  const episodesSeenByShow: Record<number, number> = {};
  for (const r of readCsv(dir, 'user_tv_show_data.csv')) {
    const tvdb = intOr(r.tv_show_id); const n = intOr(r.nb_episodes_seen, 0) ?? 0;
    if (tvdb != null) episodesSeenByShow[tvdb] = n;
  }

  // ---- movies (v1 ledger carries title + English slug + release date) ----
  const movies: NormMovie[] = [];
  const v1movies = readCsv(dir, 'tracking-prod-records.csv').filter((r) => r.entity_type === 'movie');
  const baseSlug = (r: Record<string, string>) => (r.alpha_range_key || '').replace(/^(watch|follow|towatch)-alpha-/, '') || null;
  const yearOf = (r: Record<string, string>) => (/^\d{4}/.test(r.release_date || '') ? parseInt((r.release_date || '').slice(0, 4), 10) : null);
  // TV Time uses DIFFERENT slugs for the same movie across follow/watch rows (e.g. watch `dune`
  // vs follow `dune-part-one`, watch `thunderbolts*` vs follow `thunderbolts`), so de-dup pendientes
  // by NORMALIZED TITLE as well as base slug — otherwise watched movies leak into the watchlist.
  const normTitle = (x: string) => (x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const seenSlug = new Set<string>();
  const seenTitle = new Set<string>();
  for (const r of v1movies) {                       // watched
    if (r.type !== 'watch') continue;
    const slug = baseSlug(r); if (slug) seenSlug.add(slug);
    const nt = normTitle(r.movie_name || slug || ''); if (nt) seenTitle.add(nt);
    movies.push({ title: r.movie_name || (slug ? slug.replace(/-/g, ' ') : ''), slug, year: yearOf(r), watchedAt: r.created_at || null, runtimeSec: intOr(r.runtime), uuid: r.uuid || null, releaseDate: (r.release_date || '').slice(0, 10) || null });
  }
  for (const r of v1movies) {                       // saved but not watched -> pendientes
    if (r.type !== 'follow' && r.type !== 'towatch') continue;
    const slug = baseSlug(r); const nt = normTitle(r.movie_name || slug || '');
    if (!slug && !nt) continue;
    if ((slug && seenSlug.has(slug)) || (nt && seenTitle.has(nt))) continue;   // already watched or already listed
    if (slug) seenSlug.add(slug); if (nt) seenTitle.add(nt);
    movies.push({ title: r.movie_name || slug.replace(/-/g, ' '), slug, year: yearOf(r), watchedAt: null, runtimeSec: intOr(r.runtime), uuid: r.uuid || null, releaseDate: (r.release_date || '').slice(0, 10) || null });
  }

  const badges = readCsv(dir, 'user_badge.csv').map((r) => r.badge_id).filter(Boolean);
  const friends = readCsv(dir, 'friend.csv').length;
  const characterVotes = readCsv(dir, 'show_character_episode_vote.csv').length;

  const settings: Record<string, string> = {};
  for (const r of readCsv(dir, 'user_setting.csv')) if (r.name) settings[r.name] = r.value;
  const social = readCsv(dir, 'user_social_data.csv')[0] || {};

  return {
    handle: social.screen_name || null,
    locale: settings.locale || 'en',
    timezone: null,
    darkMode: settings.is_using_dark_mode ? truthy(settings.is_using_dark_mode) : null,
    follows, watches, reactions, characterVotes, comments, lists, favoriteShows, favoriteMovies, movies, badges, friends, settings, episodesSeenByShow,
  };
}
