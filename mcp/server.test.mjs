import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('stdio MCP handshake and tool calls persist across server runs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gamerhoard-mcp-'));
  const data = join(dir, 'games.json');
  async function run(messages) {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], { env: { ...process.env, GAMERHOARD_DATA_FILE: data }, stdio: ['pipe', 'pipe', 'pipe'] });
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
  ]);
  assert.equal(first[0].result.serverInfo.name, 'gamerhoard');
  assert.ok(first[1].result.tools.some(t => t.name === 'gamer_stats'));
  assert.ok(first[1].result.tools.some(t => t.name === 'gamer_log_session'));
  assert.ok(first[1].result.tools.some(t => t.name === 'gamer_sessions'));
  assert.equal(JSON.parse(first[2].result.content[0].text).game.title, 'Portal 2');
  assert.equal(JSON.parse(first[3].result.content[0].text).playtimeMinutes, 42);
  const history = JSON.parse(first[4].result.content[0].text);
  assert.equal(history.total, 1);
  assert.equal(history.minutes, 42);
  const globalHistory = JSON.parse(first[5].result.content[0].text);
  assert.equal(globalHistory.sessions[0].title, 'Portal 2');
  assert.equal(globalHistory.sessions[0].gameId, 'steam:620');
  const second = await run([{ id: 7, method: 'tools/call', params: { name: 'gamer_stats', arguments: {} } }]);
  assert.equal(JSON.parse(second[0].result.content[0].text).total, 1);
  assert.equal(JSON.parse(second[0].result.content[0].text).playtimeHours, 0.7);
});
