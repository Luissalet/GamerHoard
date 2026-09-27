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
    { id: 3, method: 'tools/call', params: { name: 'gamer_add', arguments: { title: 'Portal 2' } } },
  ]);
  assert.equal(first[0].result.serverInfo.name, 'gamerhoard');
  assert.ok(first[1].result.tools.some(t => t.name === 'gamer_stats'));
  assert.equal(JSON.parse(first[2].result.content[0].text).game.title, 'Portal 2');
  const second = await run([{ id: 4, method: 'tools/call', params: { name: 'gamer_stats', arguments: {} } }]);
  assert.equal(JSON.parse(second[0].result.content[0].text).total, 1);
});
