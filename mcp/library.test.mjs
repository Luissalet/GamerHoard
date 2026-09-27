import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Library } from './library.mjs';

test('persistent library, tracking, DLC, stats and roundtrip export', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gamerhoard-'));
  const file = join(dir, 'library.json');
  const lib = new Library(file);
  const { game, added } = await lib.add({ title: 'Hollow Knight', state: 'backlog', ownedPlatforms: ['PC'], genres: ['Metroidvania'] });
  assert.equal(added, true);
  assert.equal((await lib.add({ title: 'Hollow Knight' })).added, false);
  await lib.update(game.id, { state: 'playing', rating: 9, notes: 'Path of Pain', favorite: true, progressPercent: 60, playtimeMinutes: 120 });
  await lib.dlc(game.id, { title: 'Godmaster', completed: true });
  const reopened = new Library(file);
  assert.equal((await reopened.find(game.id)).notes, 'Path of Pain');
  assert.equal((await reopened.list({ query: 'pain', favorite: true })).total, 1);
  assert.equal((await reopened.stats()).dlcs.completed, 1);
  assert.equal((await reopened.stats()).playtimeHours, 2);
  assert.equal((await reopened.recommend()).length, 0);
  const out = join(dir, 'backup.json');
  await reopened.exportTo(out);
  assert.equal(JSON.parse(await readFile(out, 'utf8')).games.length, 1);
  await assert.rejects(reopened.exportTo(out), /EEXIST/);
  const restored = new Library(join(dir, 'restored.json'));
  assert.deepEqual(await restored.importFrom(out), { added: 1, skipped: 0, total: 1 });
  assert.equal((await restored.find(game.id)).dlcs[0].completed, true);
  assert.deepEqual(await restored.importFrom(out), { added: 0, skipped: 1, total: 1 });
});

test('validation leaves existing record intact', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gamerhoard-'));
  const lib = new Library(join(dir, 'library.json'));
  const { game } = await lib.add({ title: 'Celeste' });
  await assert.rejects(lib.update(game.id, { rating: 11 }), /rating/);
  assert.equal((await lib.find(game.id)).rating, null);
  await assert.rejects(lib.add({ title: '' }), /título/);
  assert.equal((await lib.games()).length, 1);
});

test('legacy web export maps gamer fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gamerhoard-'));
  const source = join(dir, 'old.json');
  await writeFile(source, JSON.stringify({ format: 'watchhoard-export', shows: [{ tvdb_id: 42, title: 'Game', state: 'watching', is_favorite: 1, user_rating: 8, notes: 'Boss', owned_platforms: '["pc"]', genres: '["RPG"]', watched_episodes: 2, total_episodes: 4 }] }));
  const lib = new Library(join(dir, 'new.json'));
  assert.equal((await lib.importFrom(source)).added, 1);
  const game = await lib.find('rawg:42');
  assert.equal(game.state, 'playing');
  assert.equal(game.favorite, true);
  assert.equal(game.rating, 8);
  assert.equal(game.progressPercent, 50);
  assert.deepEqual(game.genres, ['RPG']);
});

test('sessions persist, upsert idempotently, apply corrections and filter totals independently of page limit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gamerhoard-sessions-'));
  const file = join(dir, 'library.json');
  const lib = new Library(file);
  const { game } = await lib.add({ title: 'Outer Wilds', playtimeMinutes: 600 });
  const first = { sessionId: 'local:outerwilds:001', minutes: 40, playedAt: '2026-09-01T20:00:00+02:00', notes: 'First loop' };
  const second = { sessionId: 'local:outerwilds:002', minutes: 30, playedAt: '2026-09-03T20:00:00Z' };
  await lib.logSession(game.id, first);
  await lib.logSession(game.id, second);
  assert.equal((await lib.find(game.id)).playtimeMinutes, 670);
  assert.equal((await lib.logSession(game.id, first)).created, false);
  assert.equal((await lib.find(game.id)).playtimeMinutes, 670);
  await lib.logSession(game.id, { ...first, minutes: 55, notes: 'Corrected duration' });
  assert.equal((await lib.find(game.id)).playtimeMinutes, 685);
  await lib.logSession(game.id, { sessionId: first.sessionId, minutes: 55, playedAt: first.playedAt });
  assert.equal((await lib.find(game.id)).sessions[0].notes, 'Corrected duration', 'duration corrections preserve omitted notes');

  const reopened = new Library(file);
  const filtered = await reopened.sessions(game.id, { from: '2026-09-02T00:00:00Z', to: '2026-09-04T00:00:00Z', limit: 1 });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.minutes, 30);
  assert.equal(filtered.sessions.length, 1);
  const all = await reopened.sessions(game.id, { limit: 1 });
  assert.equal(all.total, 2);
  assert.equal(all.minutes, 85);
  assert.equal(all.sessions.length, 1);

  const before = structuredClone(await reopened.find(game.id));
  const fileBeforeInvalidCalls = await readFile(file, 'utf8');
  await assert.rejects(reopened.logSession(game.id, { ...first, minutes: -5 }), /minutes/);
  await assert.rejects(reopened.logSession(game.id, { ...first, playedAt: '2026-09-01T20:00:00' }), /zona horaria/);
  await assert.rejects(reopened.logSession(game.id, { ...first, playedAt: '2026-02-30T20:00:00Z' }), /ISO 8601/);
  await assert.rejects(reopened.sessions(game.id, { from: '2026-09-04', to: '2026-09-03' }), /posterior/);
  await assert.rejects(reopened.update(game.id, { playtimeMinutes: null }), /Falta playtimeMinutes/);
  assert.deepEqual(await reopened.find(game.id), before);
  assert.equal(await readFile(file, 'utf8'), fileBeforeInvalidCalls);

  const { game: other } = await reopened.add({ title: 'Tunic' });
  await reopened.logSession(other.id, { sessionId: 'tunic:1', minutes: 12, playedAt: '2026-09-03T12:00:00Z' });
  const global = await reopened.sessions(undefined, { from: '2026-09-03', to: '2026-09-03', limit: 1 });
  assert.equal(global.total, 2);
  assert.equal(global.minutes, 42);
  assert.equal(global.sessions.length, 1);
  assert.ok(global.sessions[0].gameId && global.sessions[0].title);
});

test('session JSON import/export preserves legacy playtime baseline and merges session ids without double-counting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gamerhoard-session-roundtrip-'));
  const file = join(dir, 'library.json');
  const lib = new Library(file);
  const { game } = await lib.add({ id: 'outer-wilds', title: 'Outer Wilds', playtimeMinutes: 300 });
  await lib.logSession(game.id, { sessionId: 'portable:001', minutes: 25, playedAt: '2026-09-10T18:00:00Z' });
  const out = join(dir, 'backup.json');
  await lib.exportTo(out);
  const exported = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(exported.games[0].sessions.length, 1);
  const restored = new Library(join(dir, 'restored.json'));
  await restored.importFrom(out);
  assert.equal((await restored.find(game.id)).playtimeMinutes, 325);
  await restored.importFrom(out);
  assert.equal((await restored.find(game.id)).playtimeMinutes, 325);
  await restored.logSession(game.id, { sessionId: 'portable:001', minutes: 35, playedAt: '2026-09-10T18:00:00Z' });
  assert.equal((await restored.find(game.id)).playtimeMinutes, 335);
  await restored.importFrom(out);
  assert.equal((await restored.find(game.id)).playtimeMinutes, 335, 'reimport must not replace a corrected existing session');
  const paddedPath = join(dir, 'padded-session.json');
  exported.games[0].sessions[0].sessionId = ' portable:001 ';
  await writeFile(paddedPath, JSON.stringify(exported));
  await restored.importFrom(paddedPath);
  assert.equal((await restored.find(game.id)).playtimeMinutes, 335, 'normalized ids must also preserve existing corrections');

  const duplicatePath = join(dir, 'duplicate-session.json');
  await writeFile(duplicatePath, JSON.stringify({ format: 'gamerhoard-library', version: 1, games: [{ id: 'bad', title: 'Must Not Import', playtimeMinutes: 20, sessions: [
    { sessionId: 'duplicate', minutes: 5, playedAt: '2026-09-10T18:00:00Z' },
    { sessionId: 'duplicate', minutes: 5, playedAt: '2026-09-10T19:00:00Z' },
  ] }] }));
  await assert.rejects(restored.importFrom(duplicatePath), /sessionId duplicado/);
  assert.equal((await restored.list()).games.some(item => item.id === 'bad'), false);

  const oldPath = join(dir, 'old.json');
  await writeFile(oldPath, JSON.stringify({ format: 'gamerhoard-library', version: 1, games: [{ id: 'old', title: 'Old Game', playtimeMinutes: 90 }] }));
  const old = new Library(oldPath);
  const oldGame = await old.find('old');
  assert.deepEqual((await old.sessions(oldGame.id)).sessions, []);
  await old.logSession('old', { sessionId: 'old:001', minutes: 10, playedAt: '2026-09-10T18:00:00Z' });
  assert.equal((await old.find('old')).playtimeMinutes, 100);
});
