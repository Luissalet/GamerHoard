// Steam import for the local app. You give a SteamID64, profile URL or vanity name plus your own
// Steam Web API key (a key can read its owner's library even when the profile is private).
//   web     -> POST /api/steam/import on the local server, which writes the shared library
//   native  -> the Steam Web API is called straight from the device and rows go to SQLite
// The key is only sent to Steam (directly or through the local server). The browser or phone
// remembers it for next time; the library file never contains it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { data } from './db';
import { BACKEND } from './lib/backend';

const KEY_STORE = 'gh_steam_key';
const ID_STORE = 'gh_steam_id';

/** Synthetic library id for a Steam game = STEAM_ID_OFFSET + appid (avoids clashing RAWG ids). */
export const STEAM_ID_OFFSET = 2_000_000_000;
export const isSteamId = (id: number) => id >= STEAM_ID_OFFSET;
export const appidOf = (id: number) => id - STEAM_ID_OFFSET;
export const steamHeader = (appid: number) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
export const steamStoreUrl = (appid: number) => `https://store.steampowered.com/app/${appid}/`;

export async function getSteamKey(): Promise<string | null> {
  try { return (await AsyncStorage.getItem(KEY_STORE)) || null; } catch { return null; }
}
export async function getSteamProfile(): Promise<string | null> {
  try { return (await AsyncStorage.getItem(ID_STORE)) || null; } catch { return null; }
}
async function remember(profile: string, key: string) {
  try { await AsyncStorage.multiSet([[KEY_STORE, key.trim()], [ID_STORE, profile.trim()]]); } catch { /* ignore */ }
}

export interface SteamOwnedGame { appid: number; name: string; playtime_forever: number; rtime_last_played?: number }
export interface SteamImportResult { total: number; added: number; existing: number; updated: number }

/** Never played -> backlog; played in the last 90 days -> playing; older -> paused. */
export function steamStateOf(g: SteamOwnedGame): 'backlog' | 'watching' | 'stopped' {
  const pt = g.playtime_forever || 0;
  if (pt <= 0) return 'backlog';
  const last = g.rtime_last_played || 0;
  const ninetyDaysAgo = Date.now() / 1000 - 90 * 86400;
  return last >= ninetyDaysAgo ? 'watching' : 'stopped';
}

async function timedJson(url: string, init?: RequestInit): Promise<{ status: number; json: any }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    return { status: res.status, json: await res.json().catch(() => null) };
  } catch { throw new Error('SERVER'); } finally { clearTimeout(timer); }
}

async function resolveNative(profile: string, key: string): Promise<string> {
  const text = profile.trim();
  if (/^\d{17}$/.test(text)) return text;
  const byId = /steamcommunity\.com\/profiles\/(\d{17})/i.exec(text);
  if (byId) return byId[1];
  const vanity = /steamcommunity\.com\/id\/([^/?#\s]+)/i.exec(text)?.[1] ?? text;
  const { json } = await timedJson(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(key)}&vanityurl=${encodeURIComponent(vanity)}`);
  if (json?.response?.success !== 1) throw new Error('PROFILE');
  return String(json.response.steamid);
}

async function importNative(profile: string, key: string, onProgress?: (done: number, total: number) => void): Promise<SteamImportResult> {
  const steamid = await resolveNative(profile, key);
  const { status, json } = await timedJson(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(key)}&steamid=${steamid}&include_appinfo=true&include_played_free_games=true`);
  if (status !== 200) throw new Error('FETCH');
  const games = json?.response?.games as SteamOwnedGame[] | undefined;
  if (!Array.isArray(games)) throw new Error('PRIVATE');
  await data.ready();
  let added = 0, existing = 0;
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const had = await data.isShowInLibrary(STEAM_ID_OFFSET + g.appid);
    await data.addSteamGame({
      tvdb_id: STEAM_ID_OFFSET + g.appid, title: g.name, poster: steamHeader(g.appid), steam_appid: g.appid,
      playtime_minutes: g.playtime_forever || 0, state: steamStateOf(g), owned_platforms: '["pc"]',
    });
    if (had) existing++; else added++;
    if (onProgress && (i % 5 === 0 || i === games.length - 1)) onProgress(i + 1, games.length);
  }
  return { total: games.length, added, existing, updated: existing };
}

async function importViaServer(profile: string, key: string): Promise<SteamImportResult> {
  const { status, json } = await timedJson('/api/steam/import', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ steamId: profile.trim(), apiKey: key.trim(), syncExistingPlaytime: true }),
  });
  if (status === 200 && json) return { total: json.total, added: json.added, existing: json.existing, updated: json.playtimeUpdated };
  const message = String(json?.error ?? '');
  if (/perfil|profile/i.test(message) && /encontr|find|resolve/i.test(message)) throw new Error('PROFILE');
  if (/privacidad|private|no devolvi/i.test(message)) throw new Error('PRIVATE');
  if (status === 0 || status >= 500 && status !== 502) throw new Error('SERVER');
  throw new Error(status === 400 ? 'NEEDBOTH' : 'FETCH');
}

/** Import (and refresh the playtime of) the Steam library of `profile`. Throws NEEDBOTH, PROFILE, PRIVATE, FETCH or SERVER. */
export async function importSteam(profile: string, key: string, onProgress?: (done: number, total: number) => void): Promise<SteamImportResult> {
  if (!profile.trim() || !key.trim()) throw new Error('NEEDBOTH');
  const result = BACKEND === 'localapi' ? await importViaServer(profile, key) : await importNative(profile.trim(), key.trim(), onProgress);
  await remember(profile, key);
  return result;
}
