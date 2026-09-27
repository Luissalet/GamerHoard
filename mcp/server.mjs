#!/usr/bin/env node
import { Library } from './library.mjs';

const db = new Library();
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const S = { type: 'string' }, N = { type: 'number' }, B = { type: 'boolean' }, A = { type: 'array', items: S };
const tools = [
  ['gamer_list', 'Buscar y filtrar juegos de tu biblioteca local.', object({ query: S, state: { type: 'string', enum: ['backlog','playing','paused','completed','dropped'] }, favorite: B, platform: S, limit: N })],
  ['gamer_get', 'Ver una ficha con notas, progreso y DLC.', object({ id: S }, ['id'])],
  ['gamer_add', 'Añadir un juego manualmente sin Internet.', object({ title: S, state: S, rawgId: N, steamAppId: N, platforms: A, ownedPlatforms: A, genres: A, playtimeMinutes: N, released: S, coverUrl: S, description: S }, ['title'])],
  ['gamer_search_catalog', 'Buscar metadatos de videojuegos en RAWG. Requiere RAWG_API_KEY y conexión.', object({ query: S, limit: N }, ['query'])],
  ['gamer_add_from_catalog', 'Añadir por ID de RAWG con metadatos. Requiere RAWG_API_KEY y conexión.', object({ rawgId: N, state: S, ownedPlatforms: A }, ['rawgId'])],
  ['gamer_update', 'Actualizar estado, nota de 1 a 10, notas, favorito, plataformas o progreso.', object({ id: S, state: S, rating: { type: ['number','null'] }, notes: S, favorite: B, progressPercent: N, playtimeMinutes: N, ownedPlatforms: A, platforms: A, genres: A, tags: A }, ['id'])],
  ['gamer_dlc', 'Crear o marcar un DLC o expansión.', object({ id: S, title: S, completed: B, notes: S }, ['id','title','completed'])],
  ['gamer_stats', 'Estadísticas de la biblioteca local.', object({})],
  ['gamer_backlog', 'Sugerir juegos pendientes o pausados de la propia biblioteca.', object({ genre: S, platform: S, includePaused: B, limit: N })],
  ['gamer_import_steam', 'Importar juegos y horas de Steam con una clave Web API de usuario. La clave no se guarda.', object({ steamId: S, apiKey: S }, ['steamId','apiKey'])],
  ['gamer_import_json', 'Añadir juegos desde una exportación GamerHoard o la antigua exportación web, sin sustituir los existentes.', object({ path: S }, ['path'])],
  ['gamer_export_json', 'Crear una copia JSON completa en una ruta nueva. Nunca sobrescribe.', object({ path: S }, ['path'])],
].map(([name, description, inputSchema]) => ({ name, description, inputSchema }));

async function rawg(path) {
  const key = process.env.RAWG_API_KEY;
  if (!key) throw new Error('Configura RAWG_API_KEY en el entorno de Faustus');
  const url = new URL(`https://api.rawg.io/api${path}`);
  url.searchParams.set('key', key);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`RAWG respondió ${response.status}`);
  return response.json();
}
async function steamImport({ steamId, apiKey }) {
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
  let added = 0, existing = 0;
  for (const game of games) {
    if (!game.name || !game.appid) continue;
    const result = await db.add({ title: game.name, steamAppId: game.appid, ownedPlatforms: ['PC'], playtimeMinutes: game.playtime_forever || 0, state: game.playtime_forever ? 'paused' : 'backlog', coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg` });
    if (result.added) added++; else existing++;
  }
  return { total: games.length, added, existing };
}
export async function call(name, a = {}) {
  switch (name) {
    case 'gamer_list': return db.list(a);
    case 'gamer_get': return db.find(a.id);
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
    case 'gamer_stats': return db.stats();
    case 'gamer_backlog': return db.recommend(a);
    case 'gamer_import_steam': return steamImport(a);
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
