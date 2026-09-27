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
