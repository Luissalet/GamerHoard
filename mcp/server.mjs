#!/usr/bin/env node
import { Library } from './library.mjs';

const db = new Library();
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const S = { type: 'string' }, N = { type: 'number' }, B = { type: 'boolean' }, A = { type: 'array', items: S };
const tools = [
  ['gamer_list', 'Buscar y filtrar juegos de tu biblioteca local.', object({ query: S, state: { type: 'string', enum: ['backlog','playing','paused','completed','dropped'] }, favorite: B, platform: S, limit: N })],
  ['gamer_get', 'Ver una ficha con notas, progreso y DLC.', object({ id: S }, ['id'])],
  ['gamer_achievements', 'Consultar logros individuales de Steam guardados localmente; filtrar por desbloqueados o texto y paginar.', object({ id: S, unlocked: B, query: S, offset: N, limit: N }, ['id'])],
  ['gamer_add', 'Añadir un juego manualmente sin Internet.', object({ title: S, state: S, rawgId: N, steamAppId: N, platforms: A, ownedPlatforms: A, genres: A, playtimeMinutes: N, released: S, coverUrl: S, description: S }, ['title'])],
  ['gamer_search_catalog', 'Buscar metadatos de videojuegos en RAWG. Requiere RAWG_API_KEY y conexión.', object({ query: S, limit: N }, ['query'])],
  ['gamer_add_from_catalog', 'Añadir por ID de RAWG con metadatos. Requiere RAWG_API_KEY y conexión.', object({ rawgId: N, state: S, ownedPlatforms: A }, ['rawgId'])],
  ['gamer_update', 'Actualizar estado, nota de 1 a 10, notas, favorito, plataformas o progreso.', object({ id: S, state: S, rating: { type: ['number','null'] }, notes: S, favorite: B, progressPercent: N, playtimeMinutes: N, ownedPlatforms: A, platforms: A, genres: A, tags: A }, ['id'])],
  ['gamer_dlc', 'Crear o marcar un DLC o expansión.', object({ id: S, title: S, completed: B, notes: S }, ['id','title','completed'])],
  ['gamer_log_session', 'Crear o corregir una sesión. Repetir sessionId no suma tiempo dos veces.', object({ id: S, sessionId: { type: 'string', description: 'Identificador estable y único de esta sesión dentro del juego.' }, minutes: { type: 'number', description: 'Duración absoluta de la sesión en minutos; al corregir, indica el nuevo total.' }, playedAt: { type: 'string', description: 'Fecha y hora ISO 8601 con zona horaria, por ejemplo 2026-09-28T12:00:00Z.' }, notes: S }, ['id','sessionId','minutes','playedAt'])],
  ['gamer_sessions', 'Ver sesiones y total de minutos filtrado de un juego o de toda la biblioteca si se omite id.', object({ id: S, from: { type: 'string', description: 'Inicio inclusivo: día UTC YYYY-MM-DD o fecha/hora ISO 8601 con zona horaria.' }, to: { type: 'string', description: 'Fin inclusivo: día UTC YYYY-MM-DD completo o fecha/hora ISO 8601 con zona horaria.' }, limit: N })],
  ['gamer_stats', 'Estadísticas de la biblioteca local.', object({})],
  ['gamer_backlog', 'Sugerir juegos pendientes o pausados de la propia biblioteca.', object({ genre: S, platform: S, includePaused: B, limit: N })],
  ['gamer_import_steam', 'Importar juegos y horas de Steam con una clave Web API de usuario. Con syncExistingPlaytime=true actualiza las horas de juegos Steam existentes sin duplicar sesiones; conserva notas, estado y progreso. La clave no se guarda.', object({ steamId: S, apiKey: S, syncExistingPlaytime: B }, ['steamId','apiKey'])],
  ['gamer_sync_steam_achievements', 'Actualizar logros individuales y resumen de Steam para un juego. Pasa SteamID64 y Web API key en esta llamada; no se guardan. Sinónimos: logros, achievements, progreso Steam', object({ id: S, steamId: S, apiKey: S }, ['id','steamId','apiKey'])],
  ['gamer_import_json', 'Añadir juegos desde una exportación GamerHoard o la antigua exportación web, sin sustituir los existentes.', object({ path: S }, ['path'])],
  ['gamer_export_json', 'Crear una copia JSON completa en una ruta nueva. Nunca sobrescribe.', object({ path: S }, ['path'])],
].map(([name, description, inputSchema]) => ({ name, description, inputSchema,
  annotations: { readOnlyHint: ['gamer_list', 'gamer_get', 'gamer_achievements', 'gamer_search_catalog', 'gamer_sessions', 'gamer_stats', 'gamer_backlog'].includes(name) } }));

async function rawg(path) {
  const key = process.env.RAWG_API_KEY;
  if (!key) throw new Error('Configura RAWG_API_KEY en el entorno de Faustus');
  const url = new URL(`https://api.rawg.io/api${path}`);
  url.searchParams.set('key', key);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`RAWG respondió ${response.status}`);
  return response.json();
}
async function steamImport({ steamId, apiKey, syncExistingPlaytime = false }) {
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
async function steamAchievements({ id, steamId, apiKey }) {
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
function compactGame(game) {
  if (!game?.steamAchievements?.items) return game;
  const { items: _items, ...summary } = game.steamAchievements;
  return { ...game, steamAchievements: summary };
}
export async function call(name, a = {}) {
  switch (name) {
    case 'gamer_list': { const result = await db.list(a); return { ...result, games: result.games.map(compactGame) }; }
    case 'gamer_get': return compactGame(await db.find(a.id));
    case 'gamer_achievements': { const { id, ...filters } = a; return db.achievements(id, filters); }
    case 'gamer_add': return db.add(a);
    case 'gamer_search_catalog': {
      const data = await rawg(`/games?search=${encodeURIComponent(a.query)}&page_size=${Math.min(20, Math.max(1, Number(a.limit) || 10))}`);
      return data.results.map(g => ({ rawgId: g.id, title: g.name, released: g.released, genres: g.genres?.map(x => x.name) || [], platforms: g.platforms?.map(x => x.platform.name) || [], metacritic: g.metacritic, coverUrl: g.background_image }));
    }
    case 'gamer_add_from_catalog': {
      const g = await rawg(`/games/${encodeURIComponent(a.rawgId)}`);
      return db.add({ title: g.name, rawgId: g.id, state: a.state, ownedPlatforms: a.ownedPlatforms, genres: g.genres?.map(x => x.name), platforms: g.platforms?.map(x => x.platform.name), released: g.released, coverUrl: g.background_image, description: g.description_raw });
    }
    case 'gamer_update': { const { id, ...patch } = a; return db.update(id, patch); }
    case 'gamer_dlc': { const { id, ...patch } = a; return db.dlc(id, patch); }
    case 'gamer_log_session': { const { id, ...session } = a; return db.logSession(id, session); }
    case 'gamer_sessions': { const { id, ...filters } = a; return db.sessions(id, filters); }
    case 'gamer_stats': return db.stats();
    case 'gamer_backlog': return (await db.recommend(a)).map(compactGame);
    case 'gamer_import_steam': return steamImport(a);
    case 'gamer_sync_steam_achievements': return steamAchievements(a);
    case 'gamer_import_json': return db.importFrom(a.path);
    case 'gamer_export_json': return db.exportTo(a.path);
    default: throw new Error(`Herramienta desconocida: ${name}`);
  }
}

function send(message) { process.stdout.write(JSON.stringify(message) + '\n'); }
async function handle(request) {
  const { id, method, params = {} } = request;
  if (id === undefined) return;
  try {
    let result;
    if (method === 'initialize') result = { protocolVersion: params.protocolVersion || '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'gamerhoard', version: '1.0.0' } };
    else if (method === 'ping') result = {};
    else if (method === 'tools/list') result = { tools };
    else if (method === 'tools/call') {
      try { result = { content: [{ type: 'text', text: JSON.stringify(await call(params.name, params.arguments || {})) }] }; }
      catch (error) { result = { isError: true, content: [{ type: 'text', text: error.message }] }; }
    } else { send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Método desconocido: ${method}` } }); return; }
    send({ jsonrpc: '2.0', id, result });
  } catch (error) { send({ jsonrpc: '2.0', id, error: { code: -32603, message: error.message } }); }
}
let buffer = '';
let queue = Promise.resolve();
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let pos;
  while ((pos = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, pos).trim(); buffer = buffer.slice(pos + 1);
    if (line) { try { const request = JSON.parse(line); queue = queue.then(() => handle(request)); } catch (error) { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: error.message } }); } }
  }
});
