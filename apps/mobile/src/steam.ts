// Steam import for GamerHoard. Two paths, both handled server-side by the
// `steam-auth` Edge Function (so no CORS proxy and no key in the client bundle):
//
//   • importSteamLibrary()  — DEFAULT. "Sign in through Steam" (OpenID). No key,
//     no profile typing. Needs the user's "Game details" privacy = Public.
//   • importSteamManual()   — HIDDEN fallback for PRIVATE profiles. The user pastes
//     their own Steam Web API key + profile; a key can read its owner's library
//     even when private. The key is sent once to the function, never stored server-side.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { data } from './db';

// Finish any auth session that was pending when the app (re)loaded — needed on web.
WebBrowser.maybeCompleteAuthSession();

const extra = (Constants.expoConfig?.extra ?? {}) as any;
const SUPABASE_URL = String(extra.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const FN = `${SUPABASE_URL}/functions/v1/steam-auth`;
const KEY_STORE = 'gh_steam_key';

/** Synthetic library id for a Steam game = STEAM_ID_OFFSET + appid (avoids clashing RAWG ids). */
export const STEAM_ID_OFFSET = 2_000_000_000;
export const isSteamId = (id: number) => id >= STEAM_ID_OFFSET;
export const appidOf = (id: number) => id - STEAM_ID_OFFSET;
export const steamHeader = (appid: number) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
export const steamStoreUrl = (appid: number) => `https://store.steampowered.com/app/${appid}/`;

/** Locally-remembered API key for the manual fallback (never leaves the device except to our function). */
export async function getSteamKey(): Promise<string | null> {
  try { return (await AsyncStorage.getItem(KEY_STORE)) || null; } catch { return null; }
}
export async function setSteamKey(k: string): Promise<void> {
  try { await AsyncStorage.setItem(KEY_STORE, k.trim()); } catch { /* ignore */ }
}

export interface SteamOwnedGame { appid: number; name: string; playtime_forever: number; img_icon_url?: string; rtime_last_played?: number }
export interface SteamImportResult { steamid: string; total: number; imported: number; hours: number }

/** Never played -> backlog; played in the last 90 days -> playing; older -> paused. */
export function steamStateOf(g: SteamOwnedGame): 'backlog' | 'watching' | 'stopped' {
  const pt = g.playtime_forever || 0;
  if (pt <= 0) return 'backlog';
  const last = g.rtime_last_played || 0;
  const ninetyDaysAgo = Date.now() / 1000 - 90 * 86400;
  return last >= ninetyDaysAgo ? 'watching' : 'stopped';
}

interface SteamToken { sid: string; exp: string; sig: string }

/** Upsert a fetched owned-games list into the library (shared by both import paths). */
async function importGames(games: SteamOwnedGame[], steamid: string, onProgress?: (done: number, total: number) => void): Promise<SteamImportResult> {
  await data.ready();
  let imported = 0, minutes = 0;
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const pt = g.playtime_forever || 0;
    minutes += pt;
    await data.addSteamGame({
      tvdb_id: STEAM_ID_OFFSET + g.appid, title: g.name, poster: steamHeader(g.appid),
      steam_appid: g.appid, playtime_minutes: pt,
      state: steamStateOf(g), owned_platforms: '["pc"]',
    });
    imported++;
    if (onProgress && (i % 5 === 0 || i === games.length - 1)) onProgress(i + 1, games.length);
  }
  return { steamid, total: games.length, imported, hours: Math.round(minutes / 60) };
}

function parseReturn(url: string): URLSearchParams {
  const frag = url.includes('#') ? url.slice(url.indexOf('#') + 1) : url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  return new URLSearchParams(frag);
}

/** Open "Sign in through Steam" and return a short-lived, signed SteamID.
 *  Throws 'CONFIG' (no backend url), 'CANCELLED' (user closed), 'VERIFY' (Steam rejected). */
async function loginWithSteam(): Promise<SteamToken> {
  if (!SUPABASE_URL) throw new Error('CONFIG');
  const redirectUri = Linking.createURL('steam-return');
  const startUrl = `${FN}?app=${encodeURIComponent(redirectUri)}`;
  const res = await WebBrowser.openAuthSessionAsync(startUrl, redirectUri);
  if (res.type !== 'success' || !res.url) throw new Error('CANCELLED');
  const p = parseReturn(res.url);
  if (p.get('error')) throw new Error('VERIFY');
  const sid = p.get('sid') ?? '', exp = p.get('exp') ?? '', sig = p.get('sig') ?? '';
  if (!sid || !exp || !sig) throw new Error('VERIFY');
  return { sid, exp, sig };
}

/** Exchange a signed SteamID for the owned-games list (server uses its own key). */
async function fetchOwnedGames(tok: SteamToken): Promise<SteamOwnedGame[]> {
  const u = `${FN}?stage=games&sid=${encodeURIComponent(tok.sid)}&exp=${encodeURIComponent(tok.exp)}&sig=${encodeURIComponent(tok.sig)}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(u, { signal: ctl.signal });
    if (!r.ok) throw new Error('FETCH');
    const j = await r.json().catch(() => null);
    if (j?.private) throw new Error('PRIVATE');
    if (!Array.isArray(j?.games)) throw new Error('FETCH');
    return j.games as SteamOwnedGame[];
  } finally {
    clearTimeout(timer);
  }
}

/** DEFAULT flow: sign in through Steam → fetch owned games → upsert into the library. */
export async function importSteamLibrary(onProgress?: (done: number, total: number) => void): Promise<SteamImportResult> {
  const tok = await loginWithSteam();
  const games = await fetchOwnedGames(tok);
  return importGames(games, tok.sid, onProgress);
}

/** FALLBACK flow: user's own API key + profile (works on private profiles).
 *  Throws 'CONFIG', 'NEEDBOTH', 'PROFILE' (unresolvable), or 'FETCH' (bad key / API error). */
export async function importSteamManual(profile: string, key: string, onProgress?: (done: number, total: number) => void): Promise<SteamImportResult> {
  if (!SUPABASE_URL) throw new Error('CONFIG');
  if (!profile.trim() || !key.trim()) throw new Error('NEEDBOTH');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  let j: any = null;
  try {
    const r = await fetch(FN, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'manual', key: key.trim(), profile: profile.trim() }),
      signal: ctl.signal,
    });
    j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error === 'profile' ? 'PROFILE' : j?.error === 'need_both' ? 'NEEDBOTH' : 'FETCH');
  } finally {
    clearTimeout(timer);
  }
  if (!Array.isArray(j?.games)) throw new Error('FETCH');
  await setSteamKey(key);
  return importGames(j.games as SteamOwnedGame[], String(j.steamid ?? ''), onProgress);
}
