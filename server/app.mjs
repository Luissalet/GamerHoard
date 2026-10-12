// Express app for the local GamerHoard web app. Every route reads and writes the same
// library file as the MCP tools (mcp/library.mjs); no storage logic lives here.
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Library, DATA_PATH } from '../mcp/library.mjs';
import { searchCatalog, addFromCatalog, steamImport, steamAchievements, resolveSteamId } from '../mcp/integrations.mjs';
import * as family from './hoard-link.js';
import { createGuard, installSpa, installErrorHandlers } from './hoard-commons/express.js';
import { findGame, view, tvdbIdOf } from './mapping.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(HERE, '..');
export const DEFAULT_PORT = 5207;
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const RAWG_PATHS = /^\/(games|genres|platforms|developers|publishers)(\/[A-Za-z0-9_.:-]+)*$/;

/** Port, data directory, library file and dist folder from the environment. */
export function resolveConfig(env = process.env) {
  const libraryPath = env.GAMERHOARD_DATA_FILE
    || (env.GAMERHOARD_DATA_DIR ? path.join(env.GAMERHOARD_DATA_DIR, 'library.json') : DATA_PATH);
  const dataDir = env.GAMERHOARD_DATA_DIR || path.dirname(libraryPath);
  const port = Number(env.GAMERHOARD_PORT) || DEFAULT_PORT;
  return { port, dataDir, libraryPath, distDir: env.GAMERHOARD_DIST || path.join(ROOT, 'apps', 'mobile', 'dist'), allowedHosts: env.GAMERHOARD_ALLOWED_HOSTS };
}

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

/** Library errors are Spanish sentences; translate them into HTTP statuses. */
function toHttp(error) {
  const message = String(error?.message ?? error);
  if (error?.status) return error;
  if (/no encontrado/i.test(message)) return httpError(404, message);
  if (/^Configura RAWG_API_KEY/.test(message)) return httpError(503, 'RAWG is not configured. Set RAWG_API_KEY and restart the server.');
  if (/^(RAWG|Steam) respondi|^No se pudo consultar|^Steam no devolvi/.test(message)) return httpError(502, message);
  return httpError(400, message);
}

export function createApp({ libraryPath, dataDir, distDir, port = null, allowedHosts, env = process.env, fetchImpl = globalThis.fetch, serveStatic = true } = {}) {
  const config = resolveConfig(env);
  libraryPath = libraryPath || config.libraryPath;
  dataDir = dataDir || (libraryPath === config.libraryPath ? config.dataDir : path.dirname(libraryPath));
  distDir = distDir || config.distDir;
  const library = new Library(libraryPath);
  family.configure({ app: 'gamerhoard', dataDir });

  // The library file is read-modify-written whole, so API calls run one at a time.
  let tail = Promise.resolve();
  const serial = (fn) => {
    const run = tail.then(fn, fn);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
  const route = (fn) => (req, res, next) => serial(async () => fn(req, res)).catch((error) => next(toHttp(error)));
  const rawgKey = () => String(env.RAWG_API_KEY || env.EXPO_PUBLIC_RAWG_KEY || '').trim();
  // The shared catalogue helpers read RAWG_API_KEY from process.env.
  const withRawgKey = async (fn) => {
    if (!rawgKey()) throw httpError(503, 'RAWG is not configured. Set RAWG_API_KEY and restart the server.');
    const previous = process.env.RAWG_API_KEY;
    process.env.RAWG_API_KEY = rawgKey();
    try { return await fn(); } finally { if (previous === undefined) delete process.env.RAWG_API_KEY; else process.env.RAWG_API_KEY = previous; }
  };
  const gameById = async (id) => {
    const game = findGame(await library.games(), id);
    if (!game) throw httpError(404, `Juego no encontrado: ${id}`);
    return game;
  };
  const bool = (value) => (value === undefined ? undefined : value === 'true' || value === '1' || value === true);

  const app = express();
  app.disable('x-powered-by');
  app.use(createGuard({ port, allowedHosts: allowedHosts ?? config.allowedHosts }));
  app.use(express.json({ limit: '25mb' }));
  const api = express.Router();

  api.get('/health', route(async (req, res) => {
    res.json({ ok: true, service: 'gamerhoard', app: 'gamerhoard', version: VERSION, games: (await library.games()).length, dataFile: libraryPath, rawg: Boolean(rawgKey()) });
  }));
  api.get('/config', route(async (req, res) => {
    res.json({ backend: 'localapi', version: VERSION, dataFile: libraryPath, rawg: Boolean(rawgKey()), steam: 'per-call-key' });
  }));

  api.get('/games', route(async (req, res) => {
    const { query, state, favorite, platform, limit, offset } = req.query;
    const found = await library.list({ query, state, favorite: bool(favorite), platform, limit: limit ?? 500, offset });
    res.json({ total: found.total, games: found.games.map((g) => view(g, { withSessions: false })) });
  }));
  api.post('/games', route(async (req, res) => {
    const body = req.body || {};
    const out = await library.add(body);
    res.status(out.added ? 201 : 200).json({ added: out.added, game: view(out.game) });
  }));
  api.get('/games/:id', route(async (req, res) => res.json(view(await gameById(req.params.id)))));
  api.patch('/games/:id', route(async (req, res) => {
    const game = await gameById(req.params.id);
    res.json(view(await library.update(game.id, req.body || {})));
  }));
  api.delete('/games/:id', route(async (req, res) => {
    const game = await gameById(req.params.id);
    res.json(await library.remove(game.id));
  }));
  api.put('/games/:id/dlc', route(async (req, res) => {
    const game = await gameById(req.params.id);
    res.json(await library.dlc(game.id, req.body || {}));
  }));
  api.get('/games/:id/sessions', route(async (req, res) => {
    const game = await gameById(req.params.id);
    const { from, to, limit } = req.query;
    res.json(await library.sessions(game.id, { from, to, limit }));
  }));
  api.post('/games/:id/sessions', route(async (req, res) => {
    const game = await gameById(req.params.id);
    const body = { ...(req.body || {}) };
    if (!body.sessionId) body.sessionId = `web-${Date.now().toString(36)}`;
    if (!body.playedAt) body.playedAt = new Date().toISOString();
    res.status(201).json(await library.logSession(game.id, body));
  }));
  api.get('/games/:id/achievements', route(async (req, res) => {
    const game = await gameById(req.params.id);
    const { unlocked, query, offset, limit } = req.query;
    res.json(await library.achievements(game.id, { unlocked: bool(unlocked), query, offset, limit }));
  }));
  api.post('/games/:id/steam-achievements', route(async (req, res) => {
    const game = await gameById(req.params.id);
    const { steamId, apiKey } = req.body || {};
    res.json(await steamAchievements(library, { id: game.id, steamId: await resolveSteamId(steamId, apiKey), apiKey }));
  }));

  api.get('/sessions', route(async (req, res) => {
    const { from, to, limit } = req.query;
    const found = await library.sessions(undefined, { from, to, limit });
    const games = new Map((await library.games()).map((g) => [g.id, g]));
    res.json({ ...found, sessions: found.sessions.map((s) => ({ ...s, tvdbId: games.has(s.gameId) ? tvdbIdOf(games.get(s.gameId)) : null, coverUrl: games.get(s.gameId)?.coverUrl ?? null })) });
  }));
  api.get('/stats', route(async (req, res) => res.json(await library.stats())));
  api.get('/activity', route(async (req, res) => {
    const { from, to, limit } = req.query;
    res.json(await library.activity({ from, to, ...(limit === undefined ? {} : { limit: Number(limit) }) }));
  }));
  api.get('/backlog', route(async (req, res) => {
    const { genre, platform, includePaused, limit } = req.query;
    res.json((await library.recommend({ genre, platform, includePaused: bool(includePaused), limit })).map((g) => view(g, { withSessions: false })));
  }));

  api.post('/steam/import', route(async (req, res) => {
    const { steamId, apiKey, syncExistingPlaytime } = req.body || {};
    res.json(await steamImport(library, { steamId: await resolveSteamId(steamId, apiKey), apiKey, syncExistingPlaytime: syncExistingPlaytime === true }));
  }));

  api.get('/catalog/search', route(async (req, res) => {
    res.json(await withRawgKey(() => searchCatalog({ query: String(req.query.q || req.query.query || ''), limit: req.query.limit })));
  }));
  api.post('/catalog/add', route(async (req, res) => {
    const out = await withRawgKey(() => addFromCatalog(library, req.body || {}));
    res.status(out.added ? 201 : 200).json({ added: out.added, game: view(out.game) });
  }));
  // RAWG passthrough for the screens (discovery, details, DLCs). The key stays on the server.
  api.get(/^\/rawg(\/.*)$/, async (req, res, next) => {
    try {
      const rest = req.params[0];
      if (rest.includes('..') || !RAWG_PATHS.test(rest)) throw httpError(400, 'Path not allowed');
      if (!rawgKey()) throw httpError(503, 'RAWG is not configured. Set RAWG_API_KEY and restart the server.');
      const url = new URL(`https://api.rawg.io/api${rest}`);
      for (const [name, value] of Object.entries(req.query)) if (name !== 'key' && typeof value === 'string') url.searchParams.set(name, value);
      url.searchParams.set('key', rawgKey());
      let upstream;
      try { upstream = await fetchImpl(url, { signal: AbortSignal.timeout(12000) }); }
      catch { throw httpError(502, 'RAWG could not be reached'); }
      res.status(upstream.status).type('application/json').send(await upstream.text());
    } catch (error) { next(toHttp(error)); }
  });

  api.get('/export', route(async (req, res) => {
    const db = await library.load();
    res.setHeader('Content-Disposition', `attachment; filename="gamerhoard-library-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({ ...db, exportedAt: new Date().toISOString() });
  }));
  api.post('/import', route(async (req, res) => {
    const tmp = path.join(os.tmpdir(), `gamerhoard-import-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(req.body ?? {}), { mode: 0o600 });
    try { res.json(await library.importFrom(tmp)); } finally { fs.rmSync(tmp, { force: true }); }
  }));

  app.use('/api', api);
  if (serveStatic && fs.existsSync(distDir)) installSpa(app, distDir, { express });
  else app.all(/^\/api(\/.*)?$/, (req, res) => res.status(404).json({ error: 'Not found.', code: 'not_found' }));
  // Expected failures (a missing key, a bad request) carry expose=true and are not logged as crashes.
  installErrorHandlers(app, { log: { error: (message, error) => { if (!error?.expose) console.error(message, error); } } });
  return { app, library, libraryPath, dataDir, distDir };
}
