// GamerHoard game-metadata client — reads from the RAWG Video Games Database
// (https://rawg.io/apidocs). This is the gaming equivalent of Watch Hoard's TMDB reader:
// read-only, deduped in-flight, cached in memory (L1) + AsyncStorage/IndexedDB (L2, 24h TTL).
//
// It intentionally keeps the SAME export names the app already imported from the old
// `tmdb.ts` (showDetails, seasonEpisodes, detailsById, tmdbImg, ...) so every screen keeps
// compiling. Semantics are remapped for games:
//   show  -> game            episode -> DLC/expansion        season -> DLC group
//   "where to watch" -> stores (where to play)               director/creator -> studio/publisher
//   TMDB rating -> Metacritic                                collection -> saga / game series
//
// New gaming code should prefer the friendly aliases at the bottom (gameImg, searchGames, ...).
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as any;

const KEY = extra.rawgKey || process.env.EXPO_PUBLIC_RAWG_KEY;
const BASE = 'https://api.rawg.io/api';
export const rawgConfigured = !!KEY;
/** @deprecated legacy name — use {@link rawgConfigured}. */
export const tmdbConfigured = rawgConfigured;

// ---------- fetch layer: L1 memory -> L2 disk -> network (12s timeout, deduped) ----------
const TTL = 24 * 3600 * 1000;
const DISK_PREFIX = 'rawg1:';
const IS_WEB = Platform.OS === 'web';
const hasIdb = () => typeof (globalThis as any).indexedDB !== 'undefined';
let idbP: Promise<any> | null = null;
function idb(): Promise<any> {
  if (!idbP) idbP = new Promise((resolve, reject) => {
    try {
      const req = (globalThis as any).indexedDB.open('gh-rawg-cache', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
  return idbP;
}
const idbReq = <T,>(r: any): Promise<T> => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
async function kvGet(key: string): Promise<string | null> {
  if (IS_WEB) {
    if (!hasIdb()) return null;
    try { const db = await idb(); return (await idbReq<string>(db.transaction('kv', 'readonly').objectStore('kv').get(key))) ?? null; } catch { return null; }
  }
  try { return await AsyncStorage.getItem(key); } catch { return null; }
}
async function kvSet(key: string, val: string): Promise<void> {
  if (IS_WEB) {
    if (!hasIdb()) return;
    try { const db = await idb(); await idbReq(db.transaction('kv', 'readwrite').objectStore('kv').put(val, key)); } catch { /* ignore */ }
    return;
  }
  try { await AsyncStorage.setItem(key, val); } catch { /* ignore */ }
}
async function kvCount(): Promise<number> {
  if (IS_WEB) {
    if (!hasIdb()) return 0;
    try { const db = await idb(); return await idbReq<number>(db.transaction('kv', 'readonly').objectStore('kv').count()); } catch { return 0; }
  }
  try { return (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(DISK_PREFIX)).length; } catch { return 0; }
}
async function kvClear(): Promise<void> {
  if (IS_WEB) {
    if (!hasIdb()) return;
    try { const db = await idb(); await idbReq(db.transaction('kv', 'readwrite').objectStore('kv').clear()); } catch { /* ignore */ }
    return;
  }
  try { const ks = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(DISK_PREFIX)); if (ks.length) await AsyncStorage.multiRemove(ks); } catch { /* ignore */ }
}
const memCache = new Map<string, any>();
const inflight = new Map<string, Promise<any | null>>();
let purgeScheduled = false;

async function fromDisk(path: string): Promise<any | undefined> {
  try {
    const raw = await kvGet(DISK_PREFIX + path);
    if (!raw) return undefined;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t > TTL) return undefined;
    return v;
  } catch { return undefined; }
}
function toDisk(path: string, v: any) {
  kvSet(DISK_PREFIX + path, JSON.stringify({ t: Date.now(), v })).catch(() => {});
  schedulePurge();
}
function schedulePurge() {
  if (purgeScheduled) return;
  purgeScheduled = true;
  setTimeout(async () => {
    try { if ((await kvCount()) > 8000) await kvClear(); } catch { /* ignore */ }
  }, 8000);
}

const MAX_CONCURRENT = 6;
let active = 0;
const queue: (() => void)[] = [];
async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) { active++; return; }
  await new Promise<void>((r) => queue.push(r));
  active++;
}
function release() { active--; const next = queue.shift(); if (next) next(); }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** RAWG authenticates with a `?key=` query param on every request. */
function withKey(path: string): string {
  if (!KEY) return path;
  return `${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(KEY)}`;
}

async function fetchWithRetry(path: string): Promise<any | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 12000);
      const res = await fetch(BASE + withKey(path), { signal: ctl.signal });
      clearTimeout(timer);
      if (res.status === 429) { await sleep(Math.min((attempt + 1) * 2, 10) * 1000); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      await sleep(800 * (attempt + 1));
    }
  }
  return null;
}

async function get(path: string): Promise<any | null> {
  if (!KEY) return null;
  if (memCache.has(path)) return memCache.get(path);
  const running = inflight.get(path);
  if (running) return running;
  const p = (async () => {
    const disk = await fromDisk(path);
    if (disk !== undefined) { memCache.set(path, disk); return disk; }
    await acquire();
    try {
      const j = await fetchWithRetry(path);
      if (j == null) return null;
      memCache.set(path, j);
      toDisk(path, j);
      return j;
    } finally { release(); }
  })();
  inflight.set(path, p);
  try { return await p; } finally { inflight.delete(path); }
}

// ---------- images ----------
// RAWG returns absolute image URLs, so there is nothing to build — we just pass them
// through. The `size` argument is kept for call-site compatibility and ignored.
export const tmdbImg = (p?: string | null, _size?: 'w185' | 'w342' | 'w500' | 'w780' | 'original'): string | null => p || null;

// ---------- shared types (kept compatible with the old TMDB shapes) ----------
export interface CastMember { id?: number; name: string; character?: string; profile?: string | null }
export interface Provider { name: string; logo: string | null }
export interface RecItem { id: number; kind: 'movie' | 'tv'; title: string; poster: string | null }
export interface PersonRef { id: number; name: string; profile?: string | null }
export interface CompanyRef { id: number; name: string; logo: string | null }
export interface CollectionRef { id: number; name: string }

// ---------- gaming-specific types ----------
export interface StoreLink { id: number; name: string; slug: string; url: string | null }
export interface PlatformRef { id: number; name: string; slug: string }
export interface NameRef { id: number; name: string; slug?: string }

export interface Details {
  overview?: string; genres: string[]; runtime?: number; rating?: number; year?: string;
  network?: string; status?: string; seasons?: number; cast: CastMember[]; director?: string; backdrop?: string | null;
  tmdbId?: number; seasonList?: { number: number; name: string; episodeCount: number }[];
  title?: string; posterPath?: string | null; totalEpisodes?: number | null; lastAiredSeason?: number | null; lastAiredEpisode?: number | null; releaseDate?: string | null;
  trailerKey?: string | null; providers?: Provider[]; recommendations?: RecItem[];
  directors?: PersonRef[]; creators?: PersonRef[]; companies?: CompanyRef[]; collection?: CollectionRef | null;
  // --- GamerHoard additions ---
  metacritic?: number | null;
  platforms?: PlatformRef[];
  parentPlatforms?: PlatformRef[];
  stores?: StoreLink[];
  developers?: NameRef[];
  publishers?: NameRef[];
  website?: string | null;
  esrb?: string | null;
  playtime?: number | null;
  trailerUrl?: string | null;
  dlcCount?: number | null;
}
/** A DLC / expansion, shaped like a TV episode so the existing checklist UI works. */
export interface TmdbEpisode { number: number; name: string; still: string | null; air: string | null }

// ---------- mappers ----------
const yearOf = (d?: string | null) => (d || '').slice(0, 4);
function mapGame(g: any): DiscoverItem {
  return { id: g.id, kind: 'tv', title: g.name, poster: g.background_image ?? null, year: yearOf(g.released) };
}
const mapStores = (g: any): StoreLink[] =>
  ((g?.stores ?? []) as any[])
    .map((s) => ({ id: s.store?.id ?? s.id, name: s.store?.name ?? '', slug: s.store?.slug ?? '', url: s.url_en || s.url || null }))
    .filter((s) => s.name);
const mapPlatforms = (arr: any[]): PlatformRef[] =>
  (arr ?? []).map((p) => ({ id: p.platform?.id ?? p.id, name: p.platform?.name ?? p.name, slug: p.platform?.slug ?? p.slug })).filter((p) => p.name);
const mapNameRefs = (arr: any[]): NameRef[] => (arr ?? []).map((x) => ({ id: x.id, name: x.name, slug: x.slug }));
const ratingTo10 = (g: any): number | undefined => (typeof g?.rating === 'number' && g.rating > 0 ? Math.round(g.rating * 2 * 10) / 10 : undefined);

/** Build the rich Details object shown on a game screen. */
function buildDetails(g: any, dlcCount = 0): Details {
  const stores = mapStores(g);
  return {
    overview: g.description_raw || undefined,
    genres: (g.genres ?? []).map((x: any) => x.name),
    rating: ratingTo10(g),
    metacritic: g.metacritic ?? null,
    year: yearOf(g.released),
    releaseDate: g.released ?? null,
    backdrop: g.background_image ?? null,
    posterPath: g.background_image ?? null,
    tmdbId: g.id,
    title: g.name,
    cast: [],
    platforms: mapPlatforms(g.platforms ?? []),
    parentPlatforms: mapPlatforms(g.parent_platforms ?? []),
    stores,
    providers: stores.map((s) => ({ name: s.name, logo: null })),
    developers: mapNameRefs(g.developers ?? []),
    publishers: mapNameRefs(g.publishers ?? []),
    // Feed the shared CrewCompanies component (studio / publisher chips).
    companies: [...mapNameRefs(g.developers ?? []), ...mapNameRefs(g.publishers ?? [])].slice(0, 6).map((c) => ({ id: c.id, name: c.name, logo: null })),
    website: g.website || null,
    esrb: g.esrb_rating?.name ?? null,
    playtime: g.playtime ?? null,
    dlcCount,
    seasonList: dlcCount > 0 ? [{ number: 1, name: 'DLC', episodeCount: dlcCount }] : [],
    status: g.tba ? 'TBA' : (g.released && g.released > new Date().toISOString().slice(0, 10) ? 'Upcoming' : 'Released'),
  };
}

// ---------- Discover / lists ----------
export interface DiscoverItem { id: number; kind: 'tv' | 'movie'; title: string; poster: string | null; year?: string }
function mapList(results: any[]): DiscoverItem[] {
  return (results ?? []).filter((r) => r && r.background_image).map(mapGame);
}
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const daysAhead = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export async function searchMulti(query: string): Promise<DiscoverItem[]> {
  if (!query.trim()) return [];
  const r = await get(`/games?search=${encodeURIComponent(query)}&page_size=24&search_precise=true`);
  return mapList(r?.results ?? []);
}
/** Trending = most-added over the last 30 days. */
export async function trending(): Promise<DiscoverItem[]> {
  const r = await get(`/games?dates=${daysAgo(30)},${today()}&ordering=-added&page_size=20`);
  return mapList(r?.results ?? []);
}
export async function popularList(_kind?: 'tv' | 'movie'): Promise<DiscoverItem[]> {
  const r = await get(`/games?dates=${daysAgo(365)},${today()}&ordering=-added&page_size=20`);
  return mapList(r?.results ?? []);
}
export async function topRatedList(_kind?: 'tv' | 'movie'): Promise<DiscoverItem[]> {
  const r = await get(`/games?ordering=-metacritic&metacritic=85,100&page_size=20`);
  return mapList(r?.results ?? []);
}
/** Newest actual releases (last 30 days, newest first) — complements trending. */
export async function newReleases(): Promise<DiscoverItem[]> {
  const r = await get(`/games?dates=${daysAgo(30)},${today()}&ordering=-released&page_size=20`);
  return mapList(r?.results ?? []);
}
export async function upcomingMovies(): Promise<DiscoverItem[]> {
  const r = await get(`/games?dates=${daysAhead(1)},${daysAhead(365)}&ordering=released&page_size=20`);
  return mapList((r?.results ?? []).filter((x: any) => (x.released || '') > today()));
}
export async function upcomingShows(): Promise<DiscoverItem[]> { return upcomingMovies(); }

// ---------- Genres ----------
export interface GenreDef { id: number; name: string }
export async function genreList(_kind: 'tv' | 'movie', _lang: string): Promise<GenreDef[]> {
  const d = await get(`/genres?page_size=40`);
  return ((d?.results ?? []) as any[]).map((g) => ({ id: g.id, name: g.name }));
}
export async function discoverByGenres(_kind: 'tv' | 'movie', genreIds: number[]): Promise<DiscoverItem[]> {
  if (!genreIds.length) return [];
  const r = await get(`/games?genres=${genreIds.join(',')}&ordering=-added&page_size=40`);
  return mapList(r?.results ?? []);
}

// ---------- Platforms (available consoles / systems) ----------
export interface PlatformDef { id: number; name: string; slug: string }
export async function platformList(): Promise<PlatformDef[]> {
  const d = await get(`/platforms/lists/parents?page_size=50`);
  return ((d?.results ?? []) as any[]).map((p) => ({ id: p.id, name: p.name, slug: p.slug }));
}
export async function discoverByPlatform(parentPlatformId: number): Promise<DiscoverItem[]> {
  const r = await get(`/games?parent_platforms=${parentPlatformId}&ordering=-added&page_size=40`);
  return mapList(r?.results ?? []);
}

// ---------- Game detail ----------
export async function showDetails(gameId: number): Promise<Details | null> {
  const g = await get(`/games/${gameId}`); if (!g) return null;
  const add = await get(`/games/${gameId}/additions?page_size=40`);
  const dlcCount = (add?.results ?? []).length;
  const det = buildDetails(g, dlcCount);
  // Real store URLs (the detail payload only carries store metadata).
  const st = await get(`/games/${gameId}/stores`);
  if (st?.results?.length && det.stores) {
    const byStore = new Map<number, string>((st.results as any[]).map((r) => [r.store_id, r.url]));
    det.stores = det.stores.map((s) => ({ ...s, url: byStore.get(s.id) ?? s.url }));
    det.providers = det.stores.map((s) => ({ name: s.name, logo: null }));
  }
  // First trailer clip, if any.
  const mv = await get(`/games/${gameId}/movies`);
  const clip = mv?.results?.[0];
  det.trailerUrl = clip?.data?.max || clip?.data?.['480'] || null;
  // Similar games ("also played").
  const sug = await get(`/games/${gameId}/game-series?page_size=12`);
  det.recommendations = ((sug?.results ?? []) as any[]).filter((x) => x.background_image).slice(0, 12).map((x) => ({ id: x.id, kind: 'tv' as const, title: x.name, poster: x.background_image }));
  return det;
}

/** DLCs / expansions of a game, shaped as "episodes" for the existing checklist UI. */
export async function seasonEpisodes(gameId: number, _seasonNumber: number): Promise<TmdbEpisode[]> {
  const d = await get(`/games/${gameId}/additions?page_size=40`);
  return ((d?.results ?? []) as any[]).map((x, i) => ({ number: i + 1, name: x.name, still: x.background_image ?? null, air: x.released ?? null }));
}

export interface AddPayload {
  kind: 'tv' | 'movie';
  tvdb_id?: number | null; title: string; poster: string | null;
  tmdb_status?: string | null; total_episodes?: number | null; network?: string | null;
  last_aired_season?: number | null; last_aired_episode?: number | null;
  uuid?: string; slug?: string | null; year?: number | null;
}
export async function detailsById(_kind: 'tv' | 'movie', id: number): Promise<{ details: Details; add: AddPayload } | null> {
  const g = await get(`/games/${id}`); if (!g) return null;
  const add2 = await get(`/games/${id}/additions?page_size=40`);
  const dlcCount = (add2?.results ?? []).length;
  const details = buildDetails(g, dlcCount);
  const primaryStudio = (g.publishers?.[0]?.name) || (g.developers?.[0]?.name) || null;
  const add: AddPayload = {
    kind: 'tv', tvdb_id: g.id, title: g.name, poster: g.background_image ?? null,
    tmdb_status: details.status ?? null, total_episodes: dlcCount, network: primaryStudio,
    last_aired_season: dlcCount > 0 ? 1 : null, last_aired_episode: dlcCount > 0 ? dlcCount : null,
  };
  return { details, add };
}

// ---------- lite lookups (poster/genre backfill on library rows) ----------
export interface LiteInfo {
  tmdbId: number; backdrop: string | null; posterPath: string | null; genreIds: number[]; rating: number | null;
  status?: string | null; totalEpisodes?: number | null; network?: string | null;
  lastAiredSeason?: number | null; lastAiredEpisode?: number | null;
}
function liteOf(g: any): LiteInfo {
  return {
    tmdbId: g.id, backdrop: g.background_image ?? null, posterPath: g.background_image ?? null,
    genreIds: (g.genres ?? []).map((x: any) => x.id), rating: g.metacritic ?? null,
    status: null, totalEpisodes: null, network: (g.publishers?.[0]?.name ?? null),
    lastAiredSeason: null, lastAiredEpisode: null,
  };
}
export async function tvLite(gameId: number): Promise<LiteInfo | null> { const g = await get(`/games/${gameId}`); return g ? liteOf(g) : null; }
export async function movieLiteById(gameId: number): Promise<LiteInfo | null> { return tvLite(gameId); }
export async function movieLiteByTitle(title: string, _year?: number | null): Promise<LiteInfo | null> {
  const r = await get(`/games?search=${encodeURIComponent(title)}&page_size=1&search_precise=true`);
  const hit = r?.results?.[0]; return hit ? tvLite(hit.id) : null;
}

// ---------- misc compatibility shims (no direct game equivalent) ----------
export async function nextAirForTvdb(_id: number): Promise<{ date: string; season: number; episode: number } | null> { return null; }
export async function tvdbForTmdb(id: number): Promise<number | null> { return id; }
export async function movieReleaseDate(gameId: number): Promise<string | null> { const g = await get(`/games/${gameId}`); return g?.released || null; }
export async function resolveMovieRelease(query: string, _year?: number | null): Promise<{ releaseDate: string | null; poster: string | null } | null> {
  const r = await get(`/games?search=${encodeURIComponent(query)}&page_size=1&search_precise=true`);
  const hit = r?.results?.[0]; if (!hit) return null;
  return { releaseDate: hit.released || null, poster: hit.background_image ?? null };
}
export async function movieDetails(query: string, _year?: number | null): Promise<Details | null> {
  const r = await get(`/games?search=${encodeURIComponent(query)}&page_size=1&search_precise=true`);
  const hit = r?.results?.[0]; if (!hit) return null;
  return showDetails(hit.id);
}
export async function imdbIdFor(_kind: 'tv' | 'movie', _id: number): Promise<string | null> { return null; }
export interface EpisodeInfo { name: string | null; overview: string | null; still: string | null; air: string | null; rating: number | null; votes: number | null; imdbId: string | null; runtime: number | null }
export async function episodeDetails(_id: number, _season: number, _episode: number): Promise<EpisodeInfo | null> { return null; }

// ---------- Screenshots (photo gallery + poster picker) ----------
export async function backdropImages(_kind: 'movie' | 'tv', gameId: number): Promise<string[]> {
  const d = await get(`/games/${gameId}/screenshots?page_size=20`);
  return ((d?.results ?? []) as any[]).map((s) => s.image).filter(Boolean);
}
export interface PosterOption { path: string; lang: string | null }
export async function posterOptions(_kind: 'tv' | 'movie', gameId: number): Promise<PosterOption[]> {
  const d = await get(`/games/${gameId}/screenshots?page_size=20`);
  return ((d?.results ?? []) as any[]).map((s) => ({ path: s.image as string, lang: null })).filter((o) => o.path);
}

// ---------- Saga / game series (the "collection" analogue) ----------
export interface CollectionPart { id: number; title: string; poster: string | null; year?: string }
export async function collectionParts(gameId: number): Promise<CollectionPart[]> {
  const d = await get(`/games/${gameId}/game-series?page_size=30`);
  return ((d?.results ?? []) as any[])
    .filter((p) => p.background_image)
    .sort((a, b) => (a.released || '9999').localeCompare(b.released || '9999'))
    .map((p) => ({ id: p.id, title: p.name, poster: p.background_image, year: yearOf(p.released) }));
}

// ---------- Studios / publishers (the "company" analogue) ----------
export interface CompanyInfo { id: number; name: string; logo: string | null; country?: string | null; headquarters?: string | null }
export async function companyDetails(id: number): Promise<CompanyInfo | null> {
  const d = await get(`/developers/${id}`);
  if (!d) return null;
  return { id, name: d.name, logo: d.image_background ?? null, country: null, headquarters: null };
}
export async function companyTitles(id: number): Promise<{ movies: DiscoverItem[]; shows: DiscoverItem[] }> {
  const g = await get(`/games?developers=${id}&ordering=-added&page_size=20`);
  return { movies: [], shows: mapList(g?.results ?? []) };
}

// ---------- People (no equivalent on RAWG — kept as safe stubs) ----------
export interface PersonHit { id: number; name: string; profile: string | null; department?: string }
export async function searchPeople(_query: string): Promise<PersonHit[]> { return []; }
export interface PersonCredit { id: number; kind: 'movie' | 'tv'; title: string; poster: string | null; year?: string; role?: string }
export interface PersonInfo {
  id: number; name: string; profile: string | null; department?: string;
  birthday?: string | null; deathday?: string | null; placeOfBirth?: string | null; bio?: string;
  actedIn: PersonCredit[]; directed: PersonCredit[];
}
export async function personDetails(_id: number): Promise<PersonInfo | null> { return null; }

// ---------- Region (used by Settings — kept for compatibility) ----------
let region: string | null = null;
export async function loadWatchRegion(): Promise<void> { /* no-op for games */ }
export function getWatchRegion(): string | null { return region; }
export async function setWatchRegion(code: string | null): Promise<void> { region = code; }

// ============================================================================
//  Friendly gaming aliases — prefer these in new GamerHoard code.
// ============================================================================
export const gameImg = tmdbImg;
export const searchGames = searchMulti;
export const trendingGames = trending;
export const popularGames = popularList;
export const topRatedGames = topRatedList;
export const upcomingGames = upcomingMovies;
export const gameDetails = showDetails;
export const gameDlcs = seasonEpisodes;
export const gameSeries = collectionParts;
export const studioDetails = companyDetails;
export const studioGames = companyTitles;
