import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Library } from './library.mjs';

const fresh = async () => new Library(join(await mkdtemp(join(tmpdir(), 'gamerhoard-shared-')), 'library.json'));

test('a Library instance picks up changes written by another process', async () => {
  const first = await fresh();
  await first.add({ title: 'Outer Wilds' });
  const second = new Library(first.path);
  await second.update((await second.find('Outer Wilds').catch(() => null))?.id ?? (await second.games())[0].id, { state: 'completed' });
  assert.equal((await first.games())[0].state, 'completed', 'first instance must re-read the changed file');
  await first.add({ title: 'Hades' });
  assert.deepEqual((await second.games()).map(g => g.title), ['Outer Wilds', 'Hades']);
});

test('remove deletes one game by id, rawg id or steam id and persists', async () => {
  const lib = await fresh();
  const a = (await lib.add({ title: 'A', rawgId: 11 })).game;
  await lib.add({ title: 'B', steamAppId: 620 });
  await lib.add({ title: 'C' });
  assert.deepEqual(await lib.remove('11'), { removed: true, gameId: a.id, title: 'A' });
  assert.equal((await lib.remove('steam:620')).title, 'B');
  const reread = new Library(lib.path);
  assert.deepEqual((await reread.games()).map(g => g.title), ['C']);
  await assert.rejects(lib.remove('nope'), /no encontrado/);
});

test('dlc keeps an optional catalogue position without changing title based updates', async () => {
  const lib = await fresh();
  const { game } = await lib.add({ title: 'Game' });
  await lib.dlc(game.id, { title: 'Expansion', completed: false, number: 2 });
  assert.equal((await lib.find(game.id)).dlcs[0].number, 2);
  await lib.dlc(game.id, { title: 'expansion', completed: true });
  const [dlc] = (await lib.find(game.id)).dlcs;
  assert.deepEqual({ completed: dlc.completed, number: dlc.number }, { completed: true, number: 2 });
  await lib.dlc(game.id, { title: 'Manual', completed: true });
  assert.equal((await lib.find(game.id)).dlcs[1].number, undefined);
});

test('add and update keep studio, DLC total and cover; list pages with an offset', async () => {
  const lib = await fresh();
  for (const title of ['A', 'B', 'C']) await lib.add({ title, studio: 'Studio X', dlcTotal: 4 });
  const [first] = await lib.games();
  assert.deepEqual([first.studio, first.dlcTotal], ['Studio X', 4]);
  await lib.update(first.id, { coverUrl: 'https://img.example/a.jpg', studio: 'Other', dlcTotal: null, released: '2020-01-02' });
  const row = await lib.find(first.id);
  assert.deepEqual([row.coverUrl, row.studio, row.dlcTotal, row.released], ['https://img.example/a.jpg', 'Other', null, '2020-01-02']);
  await assert.rejects(lib.update(first.id, { dlcTotal: -1 }), /dlcTotal/);
  const page = await lib.list({ limit: 2, offset: 2 });
  assert.deepEqual([page.total, page.games.map(g => g.title)], [3, ['C']]);
});