import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Library } from '../mcp/library.mjs';
import { createApp, resolveConfig } from './app.mjs';
import { tvdbIdOf, findGame, view, STEAM_OFFSET } from './mapping.mjs';

process.env.HOARD_FAUSTUS_URL = 'http://127.0.0.1:1';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerhoard-server-'));
const dist = path.join(root, 'dist');
fs.mkdirSync(dist);
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><body><div id="root"></div></body></html>');
const libraryPath = path.join(root, 'data', 'library.json');
const rawgCalls = [];
const fakeRawg = async (url) => {
  rawgCalls.push(String(url));
  return new Response(JSON.stringify({ results: [{ id: 1, name: 'Fake' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const made = createApp({ libraryPath, dataDir: path.join(root, 'data'), distDir: dist, env: {}, fetchImpl: fakeRawg });
let server, base;
before(async () => {
  server = await new Promise((resolve) => { const s = made.app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections?.(); server.close(); fs.rmSync(root, { recursive: true, force: true }); });

const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
};

test('ids: rawg, steam and manual games get stable distinct numbers', () => {
  assert.equal(tvdbIdOf({ id: 'rawg:3498', rawgId: 3498 }), 3498);
  assert.equal(tvdbIdOf({ id: 'steam:620', steamAppId: 620 }), STEAM_OFFSET + 620);
  const manual = tvdbIdOf({ id: 'f3b1' });
  assert.equal(manual, tvdbIdOf({ id: 'f3b1' }));
  assert.ok(manual >= 1_000_000_000 && manual < STEAM_OFFSET);
  const games = [{ id: 'rawg:5', rawgId: 5 }, { id: 'steam:620', steamAppId: 620 }, { id: 'custom' }];
  assert.equal(findGame(games, 'custom').id, 'custom');
  assert.equal(findGame(games, '5').id, 'rawg:5');
  assert.equal(findGame(games, String(STEAM_OFFSET + 620)).id, 'steam:620');
  assert.equal(findGame(games, '999'), null);
});

test('view hides achievement lists and sessions are optional', () => {
  const game = { id: 'a', sessions: [{ sessionId: 's', minutes: 5, playedAt: '2026-01-02T00:00:00.000Z' }], steamAchievements: { unlocked: 1, total: 2, items: [{}, {}] } };
  const row = view(game, { withSessions: false });
  assert.equal(row.sessions, undefined);
  assert.equal(row.sessionCount, 1);
  assert.equal(row.lastPlayedAt, '2026-01-02T00:00:00.000Z');
  assert.deepEqual(row.steamAchievements, { unlocked: 1, total: 2 });
});

test('resolveConfig reads port, data dir and library file from the environment', () => {
  const dir = path.join(root, 'cfg');
  const cfg = resolveConfig({ GAMERHOARD_PORT: '6111', GAMERHOARD_DATA_DIR: dir });
  assert.equal(cfg.port, 6111);
  assert.equal(cfg.libraryPath, path.join(dir, 'library.json'));
  assert.equal(cfg.dataDir, dir);
  assert.equal(resolveConfig({}).port, 5207);
  assert.equal(resolveConfig({ GAMERHOARD_DATA_FILE: path.join(dir, 'x.json') }).dataDir, dir);
});

test('library CRUD over REST writes the shared file and is visible to the MCP library', async () => {
  assert.equal((await call('GET', '/api/health')).json.games, 0);
  const created = await call('POST', '/api/games', { title: 'Outer Wilds', rawgId: 3498, state: 'playing', genres: ['Adventure'], ownedPlatforms: ['PC'] });
  assert.equal(created.status, 201);
  assert.equal(created.json.game.tvdbId, 3498);
  const manual = await call('POST', '/api/games', { title: 'Paper Game' });
  assert.ok(manual.json.game.tvdbId > 1_000_000_000);

  const list = await call('GET', '/api/games');
  assert.equal(list.json.total, 2);
  assert.equal(list.json.games[0].sessions, undefined);

  const patched = await call('PATCH', '/api/games/3498', { state: 'completed', rating: 9, notes: 'Loop', favorite: true });
  assert.equal(patched.json.state, 'completed');
  const onDisk = JSON.parse(fs.readFileSync(libraryPath, 'utf8')).games.find((g) => g.rawgId === 3498);
  assert.deepEqual([onDisk.state, onDisk.rating, onDisk.notes, onDisk.favorite], ['completed', 9, 'Loop', true]);

  // Another process (the MCP server) changes the same file; the next request sees it.
  const mcp = new Library(libraryPath);
  await mcp.update('rawg:3498', { state: 'paused' });
  assert.equal((await call('GET', '/api/games/3498')).json.state, 'paused');

  assert.equal((await call('PATCH', '/api/games/3498', { state: 'nope' })).status, 400);
  assert.equal((await call('GET', '/api/games/424242')).status, 404);
  assert.equal((await call('GET', '/api/games?state=paused')).json.total, 1);
  assert.equal((await call('GET', '/api/games?favorite=true')).json.total, 1);

  assert.equal((await call('DELETE', `/api/games/${manual.json.game.tvdbId}`)).json.title, 'Paper Game');
  assert.equal((await call('GET', '/api/games')).json.total, 1);
});

test('sessions, dlc, stats, activity and backlog', async () => {
  const dlc = await call('PUT', '/api/games/3498/dlc', { title: 'Echoes of the Eye', completed: true, number: 1 });
  assert.equal(dlc.json.dlc.number, 1);
  const logged = await call('POST', '/api/games/3498/sessions', { sessionId: 'a', minutes: 45, playedAt: '2026-10-01T10:00:00Z' });
  assert.equal(logged.status, 201);
  assert.equal((await call('POST', '/api/games/3498/sessions', { sessionId: 'a', minutes: 30, playedAt: '2026-10-01T10:00:00Z' })).json.playtimeMinutes, 30);
  const auto = await call('POST', '/api/games/3498/sessions', { minutes: 10 });
  assert.equal(auto.status, 201);
  assert.match(auto.json.session.sessionId, /^web-/);
  const sessions = await call('GET', '/api/sessions?limit=5');
  assert.equal(sessions.json.sessions[0].tvdbId, 3498);
  assert.equal((await call('GET', '/api/games/3498/sessions')).json.total, 2);
  assert.equal((await call('GET', '/api/stats')).json.total, 1);
  assert.equal((await call('GET', '/api/activity?from=2026-10-01&to=2026-10-01')).json.totals.minutes, 30);
  await call('PATCH', '/api/games/3498', { state: 'backlog' });
  assert.equal((await call('GET', '/api/backlog')).json.length, 1);
  assert.equal((await call('POST', '/api/games/3498/sessions', { minutes: -4 })).status, 400);
});

test('catalogue and RAWG routes keep the key on the server', async () => {
  assert.equal((await call('GET', '/api/catalog/search?q=zelda')).status, 503);
  assert.equal((await call('GET', '/api/rawg/games?search=a')).status, 503);
  const keyed = createApp({ libraryPath, dataDir: path.join(root, 'data'), distDir: dist, env: { RAWG_API_KEY: 'k-123' }, fetchImpl: fakeRawg, serveStatic: false });
  const s = await new Promise((resolve) => { const x = keyed.app.listen(0, '127.0.0.1', () => resolve(x)); });
  try {
    const url = `http://127.0.0.1:${s.address().port}`;
    const res = await fetch(`${url}/api/rawg/games?search=zelda&key=client`);
    assert.equal(res.status, 200);
    const sent = new URL(rawgCalls.at(-1));
    assert.equal(sent.pathname, '/api/games');
    assert.equal(sent.searchParams.get('search'), 'zelda');
    assert.equal(sent.searchParams.get('key'), 'k-123');
    assert.equal((await fetch(`${url}/api/rawg/users`)).status, 400);
    assert.equal((await fetch(`${url}/api/rawg/games/1/additions?page_size=40`)).status, 200);
    const cfg = await (await fetch(`${url}/api/config`)).json();
    assert.equal(cfg.rawg, true);
    assert.equal(JSON.stringify(cfg).includes('k-123'), false);
  } finally { s.close(); }
});

test('Steam import resolves a vanity name and writes games', async () => {
  const real = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url, options) => {
    const text = String(url);
    if (!text.startsWith('https://api.steampowered.com/')) return real(url, options);
    urls.push(text);
    const body = text.includes('ResolveVanityURL') ? { response: { success: 1, steamid: '76561198000000000' } }
      : { response: { games: [{ appid: 620, name: 'Portal 2', playtime_forever: 120 }] } };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    const out = await call('POST', '/api/steam/import', { steamId: 'gabe', apiKey: 'steam-key' });
    assert.equal(out.json.added, 1);
    assert.ok(urls[0].includes('ResolveVanityURL'));
    const row = (await call('GET', `/api/games/${STEAM_OFFSET + 620}`)).json;
    assert.deepEqual([row.title, row.playtimeMinutes], ['Portal 2', 120]);
    assert.equal((await call('POST', '/api/steam/import', { steamId: '   ', apiKey: '' })).status, 400);
  } finally { globalThis.fetch = real; }
});

test('export and import round trip', async () => {
  const exported = await call('GET', '/api/export');
  assert.equal(exported.json.format, 'gamerhoard-library');
  const fresh = createApp({ libraryPath: path.join(root, 'other', 'library.json'), dataDir: path.join(root, 'other'), distDir: dist, env: {}, serveStatic: false });
  const s = await new Promise((resolve) => { const x = fresh.app.listen(0, '127.0.0.1', () => resolve(x)); });
  try {
    const res = await fetch(`http://127.0.0.1:${s.address().port}/api/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(exported.json) });
    assert.equal((await res.json()).added, exported.json.games.length);
  } finally { s.close(); }
});

test('serves the SPA with the Faustus launcher and the copilot routes', async () => {
  const page = await call('GET', '/game/3498');
  assert.equal(page.status, 200);
  assert.ok(page.text.includes('/api/copilot/launcher.js'), 'launcher tag injected');
  const launcher = await call('GET', '/api/copilot/launcher.js');
  assert.equal(launcher.status, 200);
  assert.ok(launcher.text.includes('hoardCopilot'));
  const info = await call('GET', '/api/copilot/info');
  assert.equal(info.status, 503);
  assert.equal(info.json.code, 'copilot_unavailable');
  assert.equal((await call('GET', '/api/unknown')).status, 404);
});

test('rejects foreign hosts', async () => {
  const res = await new Promise((resolve, reject) => {
    const url = new URL(base + '/api/health');
    import('node:http').then(({ default: http }) => {
      http.get({ host: url.hostname, port: url.port, path: url.pathname, headers: { Host: 'evil.example' } }, (r) => resolve(r.statusCode)).on('error', reject);
    });
  });
  assert.equal(res, 403);
});
