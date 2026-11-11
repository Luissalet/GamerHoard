#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Library } from './library.mjs';
import { searchCatalog, addFromCatalog, steamImport, steamAchievements } from './integrations.mjs';

const db = new Library();
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const S = { type: 'string' }, N = { type: 'number' }, B = { type: 'boolean' }, A = { type: 'array', items: S };
const tools = [
  ['gamer_list', 'Buscar y filtrar juegos de tu biblioteca local.', object({ query: S, state: { type: 'string', enum: ['backlog','playing','paused','completed','dropped'] }, favorite: B, platform: S, limit: N, offset: N })],
  ['gamer_get', 'Ver una ficha con notas, progreso y DLC.', object({ id: S }, ['id'])],
  ['gamer_achievements', 'Consultar logros individuales de Steam guardados localmente; filtrar por desbloqueados o texto y paginar.', object({ id: S, unlocked: B, query: S, offset: N, limit: N }, ['id'])],
  ['gamer_add', 'Añadir un juego manualmente sin Internet.', object({ title: S, state: S, rawgId: N, steamAppId: N, platforms: A, ownedPlatforms: A, genres: A, playtimeMinutes: N, released: S, coverUrl: S, description: S }, ['title'])],
  ['gamer_search_catalog', 'Buscar metadatos de videojuegos en RAWG. Requiere RAWG_API_KEY y conexión.', object({ query: S, limit: N }, ['query'])],
  ['gamer_add_from_catalog', 'Añadir por ID de RAWG con metadatos. Requiere RAWG_API_KEY y conexión.', object({ rawgId: N, state: S, ownedPlatforms: A }, ['rawgId'])],
  ['gamer_update', 'Actualizar estado, nota de 1 a 10, notas, favorito, plataformas, progreso, portada, estudio o total de DLC conocidos.', object({ id: S, state: S, rating: { type: ['number','null'] }, notes: S, favorite: B, progressPercent: N, playtimeMinutes: N, ownedPlatforms: A, platforms: A, genres: A, tags: A, coverUrl: S, studio: S, dlcTotal: { type: ['number','null'] } }, ['id'])],
  ['gamer_dlc', 'Crear o marcar un DLC o expansión.', object({ id: S, title: S, completed: B, notes: S }, ['id','title','completed'])],
  ['gamer_log_session', 'Crear o corregir una sesión. Repetir sessionId no suma tiempo dos veces.', object({ id: S, sessionId: { type: 'string', description: 'Identificador estable y único de esta sesión dentro del juego.' }, minutes: { type: 'number', description: 'Duración absoluta de la sesión en minutos; al corregir, indica el nuevo total.' }, playedAt: { type: 'string', description: 'Fecha y hora ISO 8601 con zona horaria, por ejemplo 2026-09-28T12:00:00Z.' }, notes: S }, ['id','sessionId','minutes','playedAt'])],
  ['gamer_sessions', 'Ver sesiones y total de minutos filtrado de un juego o de toda la biblioteca si se omite id.', object({ id: S, from: { type: 'string', description: 'Inicio inclusivo: día UTC YYYY-MM-DD o fecha/hora ISO 8601 con zona horaria.' }, to: { type: 'string', description: 'Fin inclusivo: día UTC YYYY-MM-DD completo o fecha/hora ISO 8601 con zona horaria.' }, limit: N })],
  ['gamer_stats', 'Estadísticas de la biblioteca local.', object({})],
  ['gamer_activity', 'Resumen de actividad o replay por período: minutos y sesiones por juego y día UTC. Solo sesiones fechadas; excluye horas históricas importadas. limit recorta juegos, nunca totales ni días.', object({ from: { type: 'string', description: 'Inicio inclusivo: día UTC YYYY-MM-DD o ISO 8601 con zona horaria.' }, to: { type: 'string', description: 'Fin inclusivo: día UTC completo o ISO 8601 con zona horaria.' }, limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Máximo de juegos en el ranking; por defecto 10.' } })],
  ['gamer_backlog', 'Sugerir juegos pendientes o pausados de la propia biblioteca.', object({ genre: S, platform: S, includePaused: B, limit: N })],
  ['gamer_import_steam', 'Importar juegos y horas de Steam con una clave Web API de usuario. Con syncExistingPlaytime=true actualiza las horas de juegos Steam existentes sin duplicar sesiones; conserva notas, estado y progreso. La clave no se guarda.', object({ steamId: S, apiKey: S, syncExistingPlaytime: B }, ['steamId','apiKey'])],
  ['gamer_sync_steam_achievements', 'Actualizar logros individuales y resumen de Steam para un juego. Pasa SteamID64 y Web API key en esta llamada; no se guardan. Sinónimos: logros, achievements, progreso Steam', object({ id: S, steamId: S, apiKey: S }, ['id','steamId','apiKey'])],
  ['gamer_remove', 'Eliminar un juego de la biblioteca local. Irreversible: exige confirm=true.', object({ id: S, confirm: B }, ['id','confirm'])],
  ['gamer_import_json', 'Añadir juegos desde una exportación GamerHoard o la antigua exportación web, sin sustituir los existentes.', object({ path: S }, ['path'])],
  ['gamer_export_json', 'Crear una copia JSON completa en una ruta nueva. Nunca sobrescribe.', object({ path: S }, ['path'])],
].map(([name, description, inputSchema]) => ({ name, description, inputSchema,
  annotations: { readOnlyHint: ['gamer_list', 'gamer_get', 'gamer_achievements', 'gamer_search_catalog', 'gamer_sessions', 'gamer_stats', 'gamer_activity', 'gamer_backlog'].includes(name) } }));

// Skills: procedures from the family's library copied beside the data (the hub keeps the copy). HOARD_SKILLS=0 turns them off.
let shelf = { shelfSkills: () => [], readSkill: () => { throw new Error('No hay skills.'); }, skillsInstructions: (dir, text) => text };
try { shelf = await import('../server/hoard-commons/express.js'); } catch { /* without the shared code there are none */ }
const SKILLS_DIR = process.env.HOARD_SKILLS === '0' ? '' : (process.env.GAMERHOARD_SKILLS_DIR
  || (process.env.GAMERHOARD_DATA_FILE ? join(dirname(process.env.GAMERHOARD_DATA_FILE), 'skills') : join(dirname(dirname(fileURLToPath(import.meta.url))), 'data', 'skills')));
const carried = SKILLS_DIR ? shelf.shelfSkills(SKILLS_DIR) : [];
if (carried.length) tools.push(
  { name: 'skills_list', description: 'The skills this app carries: procedures from the family skill library for the work done here. Read the one that fits with skill_read before starting.', inputSchema: object({}), annotations: { readOnlyHint: true } },
  { name: 'skill_read', description: 'One of this app\'s skills in full: the procedure to follow, its pitfalls and how to verify the result.', inputSchema: object({ slug: S, file: S }, ['slug']), annotations: { readOnlyHint: true } });
function skillCall(name, a) {
  if (!carried.length) return undefined;
  if (name === 'skills_list') return { skills: shelf.shelfSkills(SKILLS_DIR).map(({ slug, name: title, description, version, files }) => ({ slug, name: title ?? slug, description: description ?? '', version: version ?? '', files: files ?? [] })) };
  if (name === 'skill_read') return shelf.readSkill(SKILLS_DIR, a.slug, a.file);
  return undefined;
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
    case 'gamer_search_catalog': return searchCatalog(a);
    case 'gamer_add_from_catalog': return addFromCatalog(db, a);
    case 'gamer_update': { const { id, ...patch } = a; return db.update(id, patch); }
    case 'gamer_dlc': { const { id, ...patch } = a; return db.dlc(id, patch); }
    case 'gamer_log_session': { const { id, ...session } = a; return db.logSession(id, session); }
    case 'gamer_sessions': { const { id, ...filters } = a; return db.sessions(id, filters); }
    case 'gamer_stats': return db.stats();
    case 'gamer_activity': return db.activity(a);
    case 'gamer_backlog': return (await db.recommend(a)).map(compactGame);
    case 'gamer_import_steam': return steamImport(db, a);
    case 'gamer_sync_steam_achievements': return steamAchievements(db, a);
    case 'gamer_remove': if (a.confirm !== true) throw new Error('Indica confirm=true para eliminar el juego'); return db.remove(a.id);
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
    if (method === 'initialize') result = { protocolVersion: params.protocolVersion || '2025-03-26', capabilities: { tools: { listChanged: false }, ...(carried.length ? { prompts: { listChanged: false } } : {}) }, serverInfo: { name: 'gamerhoard', version: '1.0.0' },
      ...(carried.length ? { instructions: shelf.skillsInstructions(SKILLS_DIR, '') } : {}) };
    else if (method === 'ping') result = {};
    else if (method === 'tools/list') result = { tools };
    else if (method === 'tools/call') {
      try { result = { content: [{ type: 'text', text: JSON.stringify(skillCall(params.name, params.arguments || {}) ?? await call(params.name, params.arguments || {})) }] }; }
      catch (error) { result = { isError: true, content: [{ type: 'text', text: error.message }] }; }
    } else if (carried.length && method === 'prompts/list') result = { prompts: carried.map((s) => ({ name: `skill-${s.slug}`, description: String(s.description ?? '').slice(0, 300) })) };
    else if (carried.length && method === 'prompts/get') result = { messages: [{ role: 'user', content: { type: 'text', text: shelf.readSkill(SKILLS_DIR, params.name).text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n/, '') } }] };
    else { send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Método desconocido: ${method}` } }); return; }
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
