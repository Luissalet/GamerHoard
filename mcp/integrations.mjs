// RAWG catalogue and Steam Web API helpers shared by the MCP server and the local web server.
// Both call these with their own Library instance; nothing here stores keys.

export async function rawg(path) {
  const key = process.env.RAWG_API_KEY;
  if (!key) throw new Error('Configura RAWG_API_KEY en el entorno de Faustus');
  const url = new URL(`https://api.rawg.io/api${path}`);
  url.searchParams.set('key', key);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`RAWG respondió ${response.status}`);
  return response.json();
}
export async function steamImport(db, { steamId, apiKey, syncExistingPlaytime = false }) {
  if (!/^\d{17}$/.test(steamId) || !apiKey) throw new Error('Indica SteamID64 de 17 cifras y tu Steam Web API key');
  const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('steamid', steamId);
  url.searchParams.set('include_appinfo', 'true');
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Steam respondió ${response.status}`);
  const payload = await response.json();
  const games = payload?.response?.games;
  if (!Array.isArray(games)) throw new Error('Steam no devolvió juegos. Comprueba SteamID, clave y privacidad del perfil.');
  let added = 0, existing = 0, playtimeUpdated = 0, skippedUnlinked = 0;
  for (const game of games) {
    if (!game.name || !game.appid) continue;
    const minutes = Number(game.playtime_forever) || 0;
    const result = await db.add({ title: game.name, steamAppId: game.appid, ownedPlatforms: ['PC'], playtimeMinutes: minutes, state: minutes ? 'paused' : 'backlog', coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg` });
    if (result.added) added++;
    else {
      existing++;
      if (syncExistingPlaytime) {
        if (result.game.steamAppId === game.appid) {
          if ((await db.syncSteamPlaytime(result.game.id, game.appid, minutes)).updated) playtimeUpdated++;
        } else skippedUnlinked++;
      }
    }
  }
  return { total: games.length, added, existing, playtimeUpdated, skippedUnlinked };
}
export async function steamAchievements(db, { id, steamId, apiKey }) {
  if (!/^\d{17}$/.test(steamId) || !apiKey) throw new Error('Indica SteamID64 de 17 cifras y tu Steam Web API key');
  const game = await db.find(id);
  if (!game.steamAppId) throw new Error('Este juego no tiene Steam App ID');
  const url = new URL('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('steamid', steamId);
  url.searchParams.set('appid', String(game.steamAppId));
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error('No se pudo consultar Steam. Comprueba la conexión.'); }
  if (!response.ok) throw new Error(`Steam respondió ${response.status}; comprueba clave y privacidad del perfil.`);
  const stats = (await response.json())?.playerstats;
  if (stats?.success === false || !Array.isArray(stats?.achievements) || !stats.achievements.length) {
    return { gameId: game.id, available: false, reason: 'Steam no ofrece logros consultables para este juego y perfil; se conserva el último resumen local.' };
  }
  const total = stats.achievements.length;
  const unlocked = stats.achievements.filter((item) => item?.achieved === 1 || item?.achieved === true).length;
  const schemaUrl = new URL('https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/');
  schemaUrl.searchParams.set('key', apiKey);
  schemaUrl.searchParams.set('appid', String(game.steamAppId));
  let names = new Map();
  try {
    const schemaResponse = await fetch(schemaUrl, { signal: AbortSignal.timeout(20000) });
    if (schemaResponse.ok) {
      const schema = (await schemaResponse.json())?.game?.availableGameStats?.achievements;
      if (Array.isArray(schema)) names = new Map(schema.filter(item => typeof item.name === 'string').map(item => [item.name, item]));
    }
  } catch { /* Player achievements still work without localized schema. */ }
  const items = stats.achievements.map(item => {
    const apiName = String(item.apiname || '');
    const detail = names.get(apiName);
    const unlocked = item.achieved === 1 || item.achieved === true;
    const seconds = Number(item.unlocktime);
    return { apiName, name: detail?.displayName || item.name || apiName,
      description: detail?.description || item.description || '', unlocked,
      unlockedAt: unlocked && Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null };
  });
  return { available: true, ...(await db.setSteamAchievements(game.id, unlocked, total, items)) };
}

export async function searchCatalog({ query, limit } = {}) {
  const data = await rawg(`/games?search=${encodeURIComponent(query)}&page_size=${Math.min(20, Math.max(1, Number(limit) || 10))}`);
  return data.results.map(g => ({ rawgId: g.id, title: g.name, released: g.released, genres: g.genres?.map(x => x.name) || [], platforms: g.platforms?.map(x => x.platform.name) || [], metacritic: g.metacritic, coverUrl: g.background_image }));
}

export async function addFromCatalog(db, { rawgId, state, ownedPlatforms } = {}) {
  const g = await rawg(`/games/${encodeURIComponent(rawgId)}`);
  return db.add({ title: g.name, rawgId: g.id, state, ownedPlatforms, genres: g.genres?.map(x => x.name), platforms: g.platforms?.map(x => x.platform.name), released: g.released, coverUrl: g.background_image, description: g.description_raw });
}

// Accepts a SteamID64, a profile URL (/profiles/<id> or /id/<vanity>) or a bare vanity name.
export async function resolveSteamId(input, apiKey) {
  const text = String(input ?? '').trim();
  if (/^\d{17}$/.test(text)) return text;
  const profile = /steamcommunity\.com\/profiles\/(\d{17})/i.exec(text);
  if (profile) return profile[1];
  const vanity = (/steamcommunity\.com\/id\/([^/?#\s]+)/i.exec(text)?.[1] ?? text).trim();
  if (!vanity || /[\s/]/.test(vanity) || !apiKey) throw new Error('Indica SteamID64 de 17 cifras y tu Steam Web API key');
  const url = new URL('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('vanityurl', vanity);
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error('No se pudo consultar Steam. Comprueba la conexión.'); }
  if (!response.ok) throw new Error(`Steam respondió ${response.status}; comprueba la clave.`);
  const found = (await response.json())?.response;
  if (found?.success !== 1 || !/^\d{17}$/.test(String(found.steamid))) throw new Error('No se encontró ese perfil de Steam');
  return String(found.steamid);
}