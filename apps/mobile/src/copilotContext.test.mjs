import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeInfo, gameObject, statsSummary, mergeRegistrations, buildContext } from './copilotContext.ts';

const game = (over = {}) => ({
  id: 'g-1', tvdbId: 1001, title: 'Hades', state: 'playing', favorite: true, rating: 9, notes: '',
  ownedPlatforms: ['pc'], platforms: ['pc', 'switch'], genres: ['Action', 'Indie'], tags: [],
  dlcs: [{ title: 'A', completed: true }, { title: 'B', completed: false }], playtimeMinutes: 150, progressPercent: 0,
  rawgId: 1001, steamAppId: null, released: null, coverUrl: null, description: '', studio: 'Supergiant', dlcTotal: 3,
  addedAt: '2026-01-01', updatedAt: '2026-01-02', ...over,
});

test('routeInfo maps screens and game pages', () => {
  assert.deepEqual(routeInfo('/'), { page: 'library', gameId: null });
  assert.deepEqual(routeInfo('/show/1001'), { page: 'game', gameId: 1001 });
  assert.deepEqual(routeInfo('/show/'), { page: 'other', gameId: null });
  assert.deepEqual(routeInfo('/show/abc'), { page: 'game', gameId: null });
  assert.equal(routeInfo('/stats/').page, 'stats');
  assert.equal(routeInfo('/import').page, 'steam-import');
  assert.equal(routeInfo(undefined).page, 'library');
  assert.equal(routeInfo('/nope').page, 'other');
});

test('gameObject carries the library id and a small summary', () => {
  const o = gameObject(game());
  assert.equal(o.kind, 'game');
  assert.equal(o.object_id, 'g-1');
  assert.equal(o.title, 'Hades');
  assert.equal(o.state, 'playing');
  assert.equal(o.hours, 2.5);
  assert.equal(o.dlc, '1/3');
  assert.equal(o.studio, 'Supergiant');
  assert.deepEqual(o.platforms, ['pc']);
  const bare = gameObject(game({ favorite: false, rating: null, playtimeMinutes: 0, dlcs: [], dlcTotal: null, studio: null, genres: [], ownedPlatforms: [], platforms: [] }));
  assert.deepEqual(Object.keys(bare).sort(), ['kind', 'object_id', 'state', 'title']);
});

test('game page: the open game, or [] when it is not in the library', () => {
  const ctx = buildContext({ pathname: '/show/1001', game: game() });
  assert.equal(ctx.view.page, 'game');
  assert.equal(ctx.active_objects.length, 1);
  assert.equal(ctx.active_objects[0].object_id, 'g-1');
  assert.deepEqual(buildContext({ pathname: '/show/999999', game: null }).active_objects, []);
});

test('library: visible games in screen order, playing first without registration', () => {
  const games = [game({ id: 'a', tvdbId: 1, state: 'backlog', title: 'A' }), game({ id: 'b', tvdbId: 2, title: 'B' }), game({ id: 'c', tvdbId: 3, state: 'completed', title: 'C' })];
  const shown = buildContext({ pathname: '/', games, registered: { visibleIds: [3, 1, 777] } });
  assert.deepEqual(shown.active_objects.map((o) => o.object_id), ['c', 'a']);
  assert.equal(shown.view.total_games, 3);
  const fallback = buildContext({ pathname: '/', games });
  assert.equal(fallback.active_objects[0].object_id, 'b');
  assert.equal(buildContext({ pathname: '/', games, limit: 1 }).active_objects.length, 1);
});

test('unsaved form fields go in view.editor, empty ones are dropped', () => {
  const reg = mergeRegistrations([
    { view: { tab: 'info' } },
    { editor: { kind: 'game', fields: { notes: 'remember the boss' } } },
    { editor: { kind: 'game', fields: { session_minutes: '45', session_notes: '' } } },
  ]);
  const ctx = buildContext({ pathname: '/show/1', game: game(), registered: reg });
  assert.equal(ctx.view.tab, 'info');
  assert.deepEqual(ctx.view.editor, { kind: 'game', dirty: true, fields: { notes: 'remember the boss', session_minutes: '45' } });
  const none = buildContext({ pathname: '/show/1', game: game(), registered: { editor: { kind: 'game', fields: { notes: '  ' } } } });
  assert.equal('editor' in none.view, false);
});

test('stats and profile get a summary, never a list of objects', () => {
  const games = [game({ playtimeMinutes: 600 }), game({ id: 'b', tvdbId: 2, state: 'backlog', favorite: false, playtimeMinutes: 0 })];
  const s = statsSummary(games);
  assert.equal(s.games, 2);
  assert.equal(s.hours, 10);
  assert.deepEqual(s.by_state, { playing: 1, backlog: 1 });
  assert.equal(s.favorites, 1);
  assert.deepEqual(s.most_played, [{ title: 'Hades', hours: 10 }]);
  const ctx = buildContext({ pathname: '/stats', games });
  assert.deepEqual(ctx.active_objects, []);
  assert.equal(ctx.view.summary.games, 2);
});

test('explore search text is reported as an editor field; unknown pages stay empty', () => {
  const ctx = buildContext({ pathname: '/explore', registered: { editor: { kind: 'search', fields: { query: 'zelda' } } } });
  assert.deepEqual(ctx.active_objects, []);
  assert.deepEqual(ctx.view.editor, { kind: 'search', dirty: true, fields: { query: 'zelda' } });
  assert.deepEqual(buildContext({ pathname: '/whatever' }).active_objects, []);
});
