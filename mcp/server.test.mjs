import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('stdio MCP handshake and tool calls persist across server runs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gamerhoard-mcp-'));
  const data = join(dir, 'games.json');
  async function run(messages, mockSteam = null) {
    const script = fileURLToPath(new URL('./server.mjs', import.meta.url));
    const args = mockSteam ? ['--import', new URL('./mock-steam-fetch.mjs', import.meta.url).href, script] : [script];
    const child = spawn(process.execPath, args, { env: { ...process.env, GAMERHOARD_DATA_FILE: data,
      ...(mockSteam ? { GAMERHOARD_MOCK_STEAM_JSON: JSON.stringify(mockSteam) } : {}) }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', errors = '';
    child.stdout.on('data', x => output += x);
    child.stderr.on('data', x => errors += x);
    for (const message of messages) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
    child.stdin.end();
    await new Promise((resolve, reject) => { child.on('exit', code => code === 0 ? resolve() : reject(new Error(`exit ${code}: ${errors}`))); child.on('error', reject); });
    assert.equal(errors, '');
    return output.trim().split('\n').map(JSON.parse);
  }
  const first = await run([
    { id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
    { id: 2, method: 'tools/list' },
    { id: 3, method: 'tools/call', params: { name: 'gamer_add', arguments: { title: 'Portal 2', steamAppId: 620 } } },
    { id: 4, method: 'tools/call', params: { name: 'gamer_log_session', arguments: { id: 'steam:620', sessionId: 'mcp:portal2:001', minutes: 42, playedAt: '2026-09-28T12:00:00+02:00', notes: 'Co-op' } } },
    { id: 5, method: 'tools/call', params: { name: 'gamer_sessions', arguments: { id: 'steam:620', from: '2026-09-28T00:00:00Z' } } },
    { id: 6, method: 'tools/call', params: { name: 'gamer_sessions', arguments: { from: '2026-09-28', to: '2026-09-28', limit: 1 } } },
    { id: 7, method: 'tools/call', params: { name: 'gamer_sync_steam_achievements', arguments: { id: 'steam:620', steamId: '76561198000000000', apiKey: 'synthetic-test-key' } } },
    { id: 8, method: 'tools/call', params: { name: 'gamer_achievements', arguments: { id: 'steam:620', unlocked: false, query: 'second' } } },
    { id: 9, method: 'tools/call', params: { name: 'gamer_get', arguments: { id: 'steam:620' } } },
  ], { playerstats: { success: true, achievements: [{ apiname: 'ONE', achieved: 1, unlocktime: 1720000000 }, { apiname: 'TWO', achieved: 0 }, { apiname: 'THREE', achieved: 1 }] },
    schema: { game: { availableGameStats: { achievements: [{ name: 'ONE', displayName: 'First', description: 'First task' }, { name: 'TWO', displayName: 'Second', description: 'Second task' }] } } } });
  assert.equal(first[0].result.serverInfo.name, 'gamerhoard');
  assert.ok(first[1].result.tools.some(t => t.name === 'gamer_stats'));
  assert.ok(first[1].result.tools.some(t => t.name === 'gamer_log_session'));
  assert.ok(first[1].result.tools.some(t => t.name === 'gamer_sessions'));
  assert.ok(first[1].result.tools.some(t => t.name === 'gamer_sync_steam_achievements'));
  assert.ok(first[1].result.tools.some(t => t.name === 'gamer_achievements'));
  assert.equal(first[1].result.tools.find(t => t.name === 'gamer_achievements').annotations.readOnlyHint, true);
  assert.equal(first[1].result.tools.find(t => t.name === 'gamer_sync_steam_achievements').annotations.readOnlyHint, false);
  assert.equal(JSON.parse(first[2].result.content[0].text).game.title, 'Portal 2');
  assert.equal(JSON.parse(first[3].result.content[0].text).playtimeMinutes, 42);
  const history = JSON.parse(first[4].result.content[0].text);
  assert.equal(history.total, 1);
  assert.equal(history.minutes, 42);
  const globalHistory = JSON.parse(first[5].result.content[0].text);
  assert.equal(globalHistory.sessions[0].title, 'Portal 2');
  assert.equal(globalHistory.sessions[0].gameId, 'steam:620');
  const achievementResult = JSON.parse(first[6].result.content[0].text);
  assert.equal(achievementResult.unlocked, 2);
  assert.equal(achievementResult.total, 3);
  assert.equal(achievementResult.available, true);
  const filtered = JSON.parse(first[7].result.content[0].text);
  assert.equal(filtered.total, 1);
  assert.equal(filtered.achievements[0].name, 'Second');
  assert.equal(filtered.achievements[0].unlocked, false);
  assert.equal(filtered.achievements[0].unlockedAt, null);
  assert.equal(JSON.parse(first[8].result.content[0].text).steamAchievements.items, undefined);
  const saved = await readFile(data, 'utf8');
  assert.ok(!saved.includes('synthetic-test-key'));
  assert.equal(JSON.parse(saved).games[0].steamAchievements.unlocked, 2);
  assert.equal(JSON.parse(saved).games[0].steamAchievements.items[0].name, 'First');
  assert.equal(JSON.parse(saved).games[0].steamAchievements.items[2].name, 'THREE');
  const second = await run([{ id: 7, method: 'tools/call', params: { name: 'gamer_stats', arguments: {} } }]);
  assert.equal(JSON.parse(second[0].result.content[0].text).total, 1);
  assert.equal(JSON.parse(second[0].result.content[0].text).playtimeHours, 0.7);
  const unavailable = await run([{ id: 8, method: 'tools/call', params: { name: 'gamer_sync_steam_achievements', arguments: { id: 'steam:620', steamId: '76561198000000000', apiKey: 'synthetic-test-key' } } }],
    { playerstats: { success: false, error: 'Game has no stats' } });
  assert.equal(JSON.parse(unavailable[0].result.content[0].text).available, false);
  assert.equal(await readFile(data, 'utf8'), saved, 'an unavailable Steam result keeps the previous snapshot');
});

test('Steam import opt-in refresh updates existing playtime once and preserves local work', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gamerhoard-steam-'));
  const data = join(dir, 'games.json');
  const script = fileURLToPath(new URL('./server.mjs', import.meta.url));
  const call = async (messages, minutes) => {
    const child = spawn(process.execPath, ['--import', new URL('./mock-steam-fetch.mjs', import.meta.url).href, script], {
      env: { ...process.env, GAMERHOARD_DATA_FILE: data, GAMERHOARD_MOCK_STEAM_JSON: JSON.stringify({ owned: { response: { games: [
        { appid: 620, name: 'Portal 2', playtime_forever: minutes },
      ] } } }) }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', errors = '';
    child.stdout.on('data', x => output += x);
    child.stderr.on('data', x => errors += x);
    for (const [index, message] of messages.entries()) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: index + 1, method: 'tools/call', params: message }) + '\n');
    child.stdin.end();
    await new Promise((resolve, reject) => { child.on('exit', code => code === 0 ? resolve() : reject(new Error(`exit ${code}: ${errors}`))); child.on('error', reject); });
    assert.equal(errors, '');
    return output.trim().split('\n').map(line => JSON.parse(JSON.parse(line).result.content[0].text));
  };
  const credentials = { steamId: '76561198000000000', apiKey: 'synthetic-test-key' };
  const [first] = await call([{ name: 'gamer_import_steam', arguments: credentials }], 100);
  assert.equal(first.added, 1);
  await call([
    { name: 'gamer_update', arguments: { id: 'steam:620', state: 'playing', notes: 'Keep this', progressPercent: 30 } },
    { name: 'gamer_log_session', arguments: { id: 'steam:620', sessionId: 'portal:1', minutes: 40, playedAt: '2026-09-28T12:00:00Z' } },
  ], 100);
  const [preserved] = await call([{ name: 'gamer_import_steam', arguments: credentials }], 140);
  assert.equal(preserved.playtimeUpdated, 0);
  assert.equal(JSON.parse(await readFile(data, 'utf8')).games[0].playtimeMinutes, 140);
  const [refreshed] = await call([{ name: 'gamer_import_steam', arguments: { ...credentials, syncExistingPlaytime: true } }], 140);
  assert.equal(refreshed.playtimeUpdated, 1);
  const saved = await readFile(data, 'utf8');
  const game = JSON.parse(saved).games[0];
  assert.equal(game.playtimeBaseMinutes, 100);
  assert.equal(game.playtimeMinutes, 140);
  assert.equal(game.steamPlaytimeMinutes, 140);
  assert.equal(game.sessions.length, 1);
  assert.equal(game.state, 'playing');
  assert.equal(game.notes, 'Keep this');
  assert.equal(game.progressPercent, 30);
  assert.ok(!saved.includes(credentials.apiKey));
  const [again] = await call([{ name: 'gamer_import_steam', arguments: { ...credentials, syncExistingPlaytime: true } }], 140);
  assert.equal(again.playtimeUpdated, 0);
  assert.equal(await readFile(data, 'utf8'), saved);
  const [later] = await call([{ name: 'gamer_import_steam', arguments: { ...credentials, syncExistingPlaytime: true } }], 185);
  assert.equal(later.playtimeUpdated, 1);
  assert.equal(JSON.parse(await readFile(data, 'utf8')).games[0].playtimeMinutes, 185);
});
