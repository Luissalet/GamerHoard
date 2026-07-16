// Steam import for GamerHoard.
// Connects a Steam account (via the Steam Web API) and loads owned games with playtime.
//
// Requirements the user must satisfy:
//   1. A Steam Web API key (free): https://steamcommunity.com/dev/apikey
//   2. Their Steam profile set to Public (Game details = Public) so the library is visible.
//
// CORS note: api.steampowered.com does not send CORS headers, so a browser (Expo web) cannot
// call it directly. On a device/emulator (iOS/Android) fetch works with no CORS. For web, set
// EXPO_PUBLIC_STEAM_PROXY to a CORS proxy prefix (it receives the encoded target URL).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { data } from './db';

const extra = (Constants.expoConfig?.extra ?? {}) as any;

const KEY_STORE = 'gh_steam_key';
const ENV_KEY = extra.steamKey || process.env.EXPO_PUBLIC_STEAM_KEY;
const PROXY = extra.steamProxy || process.env.EXPO_PUBLIC_STEAM_PROXY || '';
const API = 'https://api.steampowered.com';

/** Synthetic library id for a Steam game = STEAM_ID_OFFSET + appid (avoids clashing RAWG ids). */
export const STEAM_ID_OFFSET = 2_000_000_000;
export const isSteamId = (id: number) => id >= STEAM_ID_OFFSET;
export const appidOf = (id: number) => id - STEAM_ID_OFFSET;
export const steamHeader = (appid: number) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
export const steamStoreUrl = (appid: number) => `https://store.steampowered.com/app/${appid}/`;

export async function getSteamKey(): Promise<string | null> {
  try { const k = await AsyncStorage.getItem(KEY_STORE); if (k) return k; } catch { /* ignore */ }
  return ENV_KEY || null;
}
export async function setSteamKey(k: string): Promise<void> { try { await AsyncStorage.setItem(KEY_STORE, k.trim()); } catch { /* ignore */ } }

const proxied = (url: string) => (PROXY ? PROXY + encodeURIComponent(url) : url);
async function getJson(url: string): Promise<any | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(proxied(url), { signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export interface SteamOwnedGame { appid: number; name: string; playtime_forever: number; img_icon_url?: string; rtime_last_played?: number }
export interface SteamImportResult { steamid: string; total: number; imported: number; hours: number }

const RE_ID64 = /^\d{17}$/;
/** Accepts a 17-digit SteamID64, a full profile URL, or a vanity name. */
export async function resolveSteamId(input: string, key: string): Promise<string | null> {
  const s = input.trim();
  if (RE_ID64.test(s)) return s;
  const mProf = s.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (mProf) return mProf[1];
  let vanity = s;
  const mVan = s.match(/steamcommunity\.com\/id\/([^/?#]+)/);
  if (mVan) vanity = mVan[1];
  const j = await getJson(`${API}/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${encodeURIComponent(vanity)}`);
  if (j?.response?.success === 1 && j.response.steamid) return String(j.response.steamid);
  return null;
}

export async function getOwnedGames(steamid: string, key: string): Promise<SteamOwnedGame[] | null> {
  const j = await getJson(`${API}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1&format=json`);
  if (!j || !j.response) return null;
  return (j.response.games ?? []) as SteamOwnedGame[];
}

/** Never played -> backlog; played in the last 90 days -> playing; older -> paused.
 *  (The old rule marked EVERY played game as "playing", flooding that section.) */
export function steamStateOf(g: SteamOwnedGame): 'backlog' | 'watching' | 'stopped' {
  const pt = g.playtime_forever || 0;
  if (pt <= 0) return 'backlog';
  const last = g.rtime_last_played || 0;
  const ninetyDaysAgo = Date.now() / 1000 - 90 * 86400;
  return last >= ninetyDaysAgo ? 'watching' : 'stopped';
}

/** Resolve profile -> fetch owned games -> upsert each into the library with playtime. */
export async function importSteamLibrary(profileInput: string, key: string, onProgress?: (done: number, total: number) => void): Promise<SteamImportResult> {
  const steamid = await resolveSteamId(profileInput.trim(), key.trim());
  if (!steamid) throw new Error('PROFILE');
  const games = await getOwnedGames(steamid, key.trim());
  if (games == null) throw new Error('FETCH');
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
