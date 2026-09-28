import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

export const DATA_PATH = process.env.GAMERHOARD_DATA_FILE || join(homedir(), '.gamerhoard', 'library.json');
export const STATES = ['backlog', 'playing', 'paused', 'completed', 'dropped'];
const FORMAT = 'gamerhoard-library';
const now = () => new Date().toISOString();
const blank = () => ({ format: FORMAT, version: 1, games: [] });
const str = (v) => typeof v === 'string' ? v.trim() : '';
const unique = (v) => [...new Set((Array.isArray(v) ? v : []).map(str).filter(Boolean))];
const finite = (v, name, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} debe estar entre ${min} y ${max}`);
  return n;
};
function sessionDate(value, name) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  const calendarValid = match && Number(match[2]) >= 1 && Number(match[2]) <= 12 && Number(match[3]) >= 1 && Number(match[3]) <= new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  const clockValid = match && Number(match[4]) <= 23 && Number(match[5]) <= 59 && Number(match[6] || 0) <= 59 && (!match[8] || (Number(match[9]) <= 23 && Number(match[10]) <= 59));
  if (!match || !calendarValid || !clockValid || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} debe ser una fecha ISO 8601 con zona horaria`);
  }
  return new Date(value).toISOString();
}
function filterDate(value, name, endOfDay = false) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${name} debe ser una fecha válida`);
    if (endOfDay) date.setUTCHours(23, 59, 59, 999);
    return date.toISOString();
  }
  return sessionDate(value, name);
}
function sessionTotal(game) { return (Array.isArray(game.sessions) ? game.sessions : []).reduce((sum, s) => sum + s.minutes, 0); }

export class Library {
  constructor(path = DATA_PATH) { this.path = path; this.db = null; }
  async load() {
    if (this.db) return this.db;
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'));
      if (parsed.format !== FORMAT || parsed.version !== 1 || !Array.isArray(parsed.games)) throw new Error('formato no reconocido');
      this.db = parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`No se puede abrir ${this.path}: ${error.message}`);
      this.db = blank();
    }
    return this.db;
  }
  async save() {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(this.db, null, 2) + '\n', { mode: 0o600 });
    await rename(temp, this.path);
  }
  async games() { return (await this.load()).games; }
  async find(id) {
    const game = (await this.games()).find(g => g.id === id || (g.rawgId && String(g.rawgId) === String(id)) || (g.steamAppId && `steam:${g.steamAppId}` === id));
    if (!game) throw new Error(`Juego no encontrado: ${id}`);
    return game;
  }
  async list({ query = '', state, favorite, platform, limit = 100 } = {}) {
    if (state && !STATES.includes(state)) throw new Error('Estado no válido');
    const q = str(query).toLocaleLowerCase();
    const items = (await this.games()).filter(g =>
      (!q || [g.title, g.notes, ...g.genres, ...g.tags].some(v => v.toLocaleLowerCase().includes(q))) &&
      (!state || g.state === state) && (favorite === undefined || g.favorite === favorite) &&
      (!platform || g.ownedPlatforms.some(v => v.toLocaleLowerCase() === platform.toLocaleLowerCase())));
    return { total: items.length, games: items.slice(0, Math.min(500, Math.max(1, Number(limit) || 100))) };
  }
  async add(input) {
    const title = str(input.title);
    if (!title) throw new Error('Falta el título');
    const games = await this.games();
    const rawgId = finite(input.rawgId, 'rawgId', 1);
    const steamAppId = finite(input.steamAppId, 'steamAppId', 1);
    const id = str(input.id) || (steamAppId ? `steam:${steamAppId}` : rawgId ? `rawg:${rawgId}` : randomUUID());
    const existing = games.find(g => g.id === id || g.title.toLocaleLowerCase() === title.toLocaleLowerCase());
    if (existing) return { game: existing, added: false };
    const state = input.state || 'backlog';
    if (!STATES.includes(state)) throw new Error('Estado no válido');
    const date = now();
    const playtimeBaseMinutes = finite(input.playtimeBaseMinutes, 'playtimeBaseMinutes') ?? (finite(input.playtimeMinutes, 'playtimeMinutes') || 0);
    const game = { id, title, state, favorite: false, rating: null, notes: '', ownedPlatforms: unique(input.ownedPlatforms), platforms: unique(input.platforms), genres: unique(input.genres), tags: [], dlcs: [], sessions: [], playtimeBaseMinutes, playtimeMinutes: playtimeBaseMinutes, progressPercent: 0, rawgId: rawgId || null, steamAppId: steamAppId || null, steamAchievements: null, released: str(input.released) || null, coverUrl: str(input.coverUrl) || null, description: str(input.description), addedAt: date, updatedAt: date };
    games.push(game); await this.save();
    return { game, added: true };
  }
  async update(id, patch) {
    const g = await this.find(id);
    const next = { ...g };
    if (patch.state !== undefined) { if (!STATES.includes(patch.state)) throw new Error('Estado no válido'); next.state = patch.state; }
    if (patch.rating !== undefined) next.rating = patch.rating === null ? null : finite(patch.rating, 'rating', 1, 10);
    if (patch.notes !== undefined) next.notes = str(patch.notes);
    if (patch.favorite !== undefined) { if (typeof patch.favorite !== 'boolean') throw new Error('favorite debe ser booleano'); next.favorite = patch.favorite; }
    if (patch.progressPercent !== undefined) next.progressPercent = finite(patch.progressPercent, 'progressPercent', 0, 100);
    if (patch.playtimeMinutes !== undefined) {
      const target = finite(patch.playtimeMinutes, 'playtimeMinutes');
      if (target === undefined) throw new Error('Falta playtimeMinutes');
      const recorded = sessionTotal(next);
      if (target < recorded) throw new Error(`playtimeMinutes no puede ser menor que los ${recorded} minutos de sesiones registradas`);
      next.playtimeBaseMinutes = target - recorded;
      next.playtimeMinutes = target;
    }
    for (const field of ['ownedPlatforms', 'platforms', 'genres', 'tags']) if (patch[field] !== undefined) next[field] = unique(patch[field]);
    next.updatedAt = now();
    Object.assign(g, next); await this.save(); return g;
  }
  async setSteamAchievements(id, unlocked, total) {
    const game = await this.find(id);
    if (!game.steamAppId) throw new Error('Este juego no tiene Steam App ID');
    if (!Number.isInteger(unlocked) || !Number.isInteger(total) || total <= 0 || unlocked < 0 || unlocked > total) {
      throw new Error('Resumen de logros de Steam no válido');
    }
    game.steamAchievements = { unlocked, total, syncedAt: now() };
    game.updatedAt = now();
    await this.save();
    return { gameId: game.id, title: game.title, steamAppId: game.steamAppId, ...game.steamAchievements };
  }
  async dlc(id, { title, completed, notes = '' }) {
    const g = await this.find(id);
    title = str(title);
    if (!title || typeof completed !== 'boolean') throw new Error('Indica título y completed booleano');
    let item = g.dlcs.find(d => d.title.toLocaleLowerCase() === title.toLocaleLowerCase());
    if (item) { item.completed = completed; item.notes = str(notes); }
    else { item = { title, completed, notes: str(notes) }; g.dlcs.push(item); }
    g.updatedAt = now(); await this.save(); return { gameId: g.id, dlc: item };
  }
  async logSession(id, { sessionId, minutes, playedAt, notes } = {}) {
    // Validate the complete input before looking up or changing any stored object.
    sessionId = str(sessionId);
    if (!sessionId) throw new Error('Falta sessionId estable');
    minutes = finite(minutes, 'minutes');
    if (minutes === undefined) throw new Error('Falta minutes');
    playedAt = sessionDate(playedAt, 'playedAt');
    const game = await this.find(id);
    const sessions = Array.isArray(game.sessions) ? game.sessions : [];
    const previous = sessions.find(s => s.sessionId === sessionId);
    const base = Number.isFinite(game.playtimeBaseMinutes) ? game.playtimeBaseMinutes : Math.max(0, (Number(game.playtimeMinutes) || 0) - sessionTotal(game));
    const updated = { sessionId, minutes, playedAt, notes: notes === undefined ? (previous?.notes || '') : str(notes) };
    const nextSessions = previous ? sessions.map(s => s.sessionId === sessionId ? updated : s) : [...sessions, updated];
    // Apply the difference to the preserved imported/manual baseline, so upserts never double-count.
    game.sessions = nextSessions;
    game.playtimeBaseMinutes = base;
    game.playtimeMinutes = base + nextSessions.reduce((sum, s) => sum + s.minutes, 0);
    game.updatedAt = now();
    await this.save();
    return { gameId: game.id, session: updated, created: !previous, playtimeMinutes: game.playtimeMinutes };
  }
  async sessions(id, { from, to, limit = 50 } = {}) {
    const fromDate = from === undefined ? undefined : filterDate(from, 'from');
    const toDate = to === undefined ? undefined : filterDate(to, 'to', true);
    if (fromDate && toDate && fromDate > toDate) throw new Error('from no puede ser posterior a to');
    const pageSize = finite(limit, 'limit', 1, 500) ?? 50;
    const games = id === undefined ? await this.games() : [await this.find(id)];
    const items = games.flatMap(game => (Array.isArray(game.sessions) ? game.sessions : []).map(session => ({ ...session, gameId: game.id, title: game.title })))
      .filter(s => (!fromDate || s.playedAt >= fromDate) && (!toDate || s.playedAt <= toDate))
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
    return { ...(id === undefined ? {} : { gameId: games[0].id, playtimeMinutes: games[0].playtimeMinutes, state: games[0].state }), total: items.length, minutes: items.reduce((sum, s) => sum + s.minutes, 0), sessions: items.slice(0, pageSize) };
  }
  async stats() {
    const games = await this.games();
    const byState = Object.fromEntries(STATES.map(s => [s, games.filter(g => g.state === s).length]));
    const rated = games.filter(g => g.rating !== null);
    const tally = field => Object.entries(games.flatMap(g => g[field]).reduce((a, x) => (a[x] = (a[x] || 0) + 1, a), {})).sort((a,b) => b[1]-a[1]);
    return { total: games.length, byState, favorites: games.filter(g => g.favorite).length, playtimeHours: Math.round(games.reduce((n,g) => n + g.playtimeMinutes, 0) / 60 * 10) / 10, averageRating: rated.length ? Math.round(rated.reduce((n,g) => n + g.rating, 0) / rated.length * 10) / 10 : null, dlcs: { total: games.reduce((n,g) => n + g.dlcs.length, 0), completed: games.reduce((n,g) => n + g.dlcs.filter(d => d.completed).length, 0) }, genres: tally('genres'), ownedPlatforms: tally('ownedPlatforms') };
  }
  async recommend({ genre, platform, includePaused = true, limit = 5 } = {}) {
    const games = (await this.games()).filter(g => (g.state === 'backlog' || (includePaused && g.state === 'paused')) && (!genre || g.genres.some(x => x.toLocaleLowerCase() === genre.toLocaleLowerCase())) && (!platform || g.ownedPlatforms.some(x => x.toLocaleLowerCase() === platform.toLocaleLowerCase())));
    return games.sort((a,b) => (Number(b.favorite)*3 + (b.rating || 0)/10 + Number(b.state === 'paused')) - (Number(a.favorite)*3 + (a.rating || 0)/10 + Number(a.state === 'paused'))).slice(0, Math.min(20, Math.max(1, Number(limit) || 5)));
  }
  async exportTo(path) {
    await this.load();
    if (!path || path === this.path) throw new Error('Indica una ruta de exportación distinta del archivo activo');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ ...this.db, exportedAt: now() }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { path, games: this.db.games.length };
  }
  async importFrom(path) {
    const imported = JSON.parse(await readFile(path, 'utf8'));
    let rows;
    if (imported.format === FORMAT && imported.version === 1 && Array.isArray(imported.games)) rows = imported.games;
    else if (imported.format === 'watchhoard-export' && Array.isArray(imported.shows)) rows = imported.shows.map(s => ({ title: s.title, state: ({ watching: 'playing', stopped: 'paused', archived: 'completed' })[s.state] || 'backlog', rawgId: Number(s.tvdb_id) > 0 && Number(s.tvdb_id) < 2000000000 ? Number(s.tvdb_id) : null, steamAppId: Number(s.steam_appid) || (Number(s.tvdb_id) >= 2000000000 ? Number(s.tvdb_id) - 2000000000 : null), favorite: !!s.is_favorite, rating: s.user_rating, notes: s.notes, playtimeMinutes: s.playtime_minutes, ownedPlatforms: s.owned_platforms, platforms: s.platforms, genres: s.genres, coverUrl: s.poster, progressPercent: s.total_episodes > 0 ? Math.min(100, Math.round((s.watched_episodes || 0) / s.total_episodes * 100)) : 0 }));
    else throw new Error('Formato de importación desconocido');
    // Validate session payloads up front so a bad session cannot leave a half-imported library.
    for (const row of rows) {
      if (!Array.isArray(row.sessions)) continue;
      const seenSessionIds = new Set();
      for (const session of row.sessions) {
        const sessionId = str(session?.sessionId);
        if (!sessionId) throw new Error('Cada sesión importada necesita sessionId estable');
        if (seenSessionIds.has(sessionId)) throw new Error(`sessionId duplicado en la exportación: ${sessionId}`);
        seenSessionIds.add(sessionId);
        const minutes = finite(session.minutes, 'minutes');
        if (minutes === undefined) throw new Error('Falta minutes');
        sessionDate(session.playedAt, 'playedAt');
      }
    }
    let added = 0, skipped = 0;
    for (const row of rows) {
      if (!str(row.title)) { skipped++; continue; }
      const sessions = Array.isArray(row.sessions) ? row.sessions : [];
      const sessionMinutes = sessions.reduce((sum, session) => sum + Number(session.minutes), 0);
      const importedPlaytime = finite(row.playtimeMinutes, 'playtimeMinutes') || 0;
      if (sessionMinutes > importedPlaytime) throw new Error('El tiempo total importado no puede ser menor que la suma de sus sesiones');
      const outcome = await this.add({ ...row, playtimeBaseMinutes: importedPlaytime - sessionMinutes, ownedPlatforms: typeof row.ownedPlatforms === 'string' ? parseArray(row.ownedPlatforms) : row.ownedPlatforms, platforms: typeof row.platforms === 'string' ? parseArray(row.platforms) : row.platforms, genres: typeof row.genres === 'string' ? parseArray(row.genres) : row.genres });
      if (!outcome.added) skipped++;
      const patch = { favorite: !!row.favorite, rating: row.rating == null ? null : Number(row.rating), notes: row.notes || '', progressPercent: row.progressPercent || 0, tags: row.tags || [] };
      if (outcome.added) {
        await this.update(outcome.game.id, patch);
        for (const d of Array.isArray(row.dlcs) ? row.dlcs : []) if (d.title) await this.dlc(outcome.game.id, d);
        added++;
      }
      const existingSessionIds = new Set((Array.isArray(outcome.game.sessions) ? outcome.game.sessions : []).map(session => session.sessionId));
      for (const session of sessions) {
        const sessionId = str(session.sessionId);
        if (existingSessionIds.has(sessionId)) continue;
        await this.logSession(outcome.game.id, session);
        existingSessionIds.add(sessionId);
      }
    }
    return { added, skipped, total: rows.length };
  }
}
function parseArray(value) { try { const v = JSON.parse(value); return Array.isArray(v) ? v : []; } catch { return []; } }
