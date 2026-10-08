import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Library } from './library.mjs';

test('activity groups dated sessions, excludes lifetime base and keeps totals beyond ranking limit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gamer-activity-'));
  const path = join(dir, 'library.json'), lib = new Library(path);
  await lib.add({ id: 'a', title: 'Alpha', playtimeMinutes: 900 });
  await lib.add({ id: 'b', title: 'Beta', playtimeMinutes: 600 });
  await lib.add({ id: 'old', title: 'Imported only', playtimeMinutes: 9999 });
  await lib.logSession('a', { sessionId: 'shared', minutes: 60, playedAt: '2026-10-01T00:30:00+02:00' });
  await lib.logSession('a', { sessionId: 'second', minutes: 15, playedAt: '2026-10-01T23:59:59.999Z' });
  await lib.logSession('b', { sessionId: 'shared', minutes: 40, playedAt: '2026-10-01T12:00:00Z' });
  await lib.logSession('b', { sessionId: 'outside', minutes: 500, playedAt: '2026-10-02T00:00:00Z' });
  const bytes = await readFile(path), mtime = (await stat(path)).mtimeMs;
  const report = await lib.activity({ from: '2026-10-01', to: '2026-10-01', limit: 1 });
  assert.deepEqual(report, { source: 'logged_sessions',
    period: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-01T23:59:59.999Z', timezone: 'UTC' },
    totals: { minutes: 55, sessions: 2, games: 2, days: 1 },
    games: [{ gameId: 'b', title: 'Beta', minutes: 40, sessions: 1 }], gamesTruncated: true,
    days: [{ date: '2026-10-01', minutes: 55, sessions: 2 }] });
  assert.deepEqual(await lib.activity({ from: '2026-10-01', to: '2026-10-01', limit: 1 }), report);
  assert.deepEqual(await readFile(path), bytes);
  assert.equal((await stat(path)).mtimeMs, mtime);
  const range = { from: '2026-09-30', to: '2026-10-01' };
  assert.equal((await lib.activity(range)).totals.minutes, 115);
  await lib.logSession('a', { sessionId: 'shared', minutes: 20, playedAt: '2026-10-01T00:30:00+02:00' });
  const corrected = await lib.activity(range);
  assert.equal(corrected.totals.minutes, 75);
  assert.equal(corrected.totals.sessions, 3);
  assert.deepEqual(corrected.days.map(d => d.minutes), [20, 55]);
  assert.deepEqual(corrected, await new Library(path).activity(range));
});

test('activity validates ranges and ranking limits; empty libraries stay empty on disk', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gamer-activity-empty-'));
  const path = join(dir, 'absent.json'), lib = new Library(path);
  assert.deepEqual((await lib.activity()).totals, { minutes: 0, sessions: 0, games: 0, days: 0 });
  assert.deepEqual((await lib.activity()).games, []);
  assert.equal((await lib.activity()).gamesTruncated, false);
  await assert.rejects(stat(path), { code: 'ENOENT' });
  for (const options of [{ from: '2026-02-30' }, { to: '2026-10-01T12:00:00' },
    { from: '2026-10-02', to: '2026-10-01' }, { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: true }, { limit: null }]) {
    await assert.rejects(lib.activity(options));
  }
});
