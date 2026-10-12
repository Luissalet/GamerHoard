// Pure context builders for the Faustus copilot (window.hoardCopilot.context). No React Native
// imports and no relative value imports, so `node --test` can load this file directly.
import type { ApiGame } from './db/localapiMap';
import type { ShowRow, ListRow, Profile } from './db/types';

export interface ActiveObject { kind: string; object_id: string; title?: string; [key: string]: unknown }
export interface EditorState { kind: string; dirty: boolean; fields: Record<string, unknown> }
/** What a mounted screen tells the copilot about itself. */
export interface ViewRegistration {
  view?: Record<string, unknown>;
  editor?: { kind: string; fields: Record<string, unknown> };
  /** Library games currently listed on screen (tvdbId, in display order). */
  visibleIds?: number[];
}
export interface RouteInfo { page: string; gameId: number | null; listId?: number | null }

const PAGES: Record<string, string> = {
  '/': 'library', '/explore': 'explore', '/profile': 'profile', '/stats': 'stats',
  '/history': 'history', '/settings': 'settings', '/import': 'steam-import', '/language': 'language',
};

export function routeInfo(pathname: string | null | undefined): RouteInfo {
  const p = ((pathname || '/').split('?')[0].replace(/\/+$/, '')) || '/';
  const m = p.match(/^\/show\/(\d+)$/);
  if (m) return { page: 'game', gameId: Number(m[1]) };
  if (/^\/show\//.test(p)) return { page: 'game', gameId: null };
  const list = p.match(/^\/list\/(\d+)$/);
  if (list) return { page: 'list', gameId: null, listId: Number(list[1]) };
  if (/^\/list\//.test(p)) return { page: 'list', gameId: null, listId: null };
  return { page: PAGES[p] ?? 'other', gameId: null };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Small, stable summary of one library game. */
export function gameObject(g: ApiGame): ActiveObject {
  const done = (g.dlcs ?? []).filter((d) => d.completed).length;
  const total = Math.max(g.dlcTotal ?? 0, (g.dlcs ?? []).length);
  const platforms = (g.ownedPlatforms?.length ? g.ownedPlatforms : g.platforms) ?? [];
  const o: ActiveObject = { kind: 'game', object_id: g.id, title: g.title, state: g.state };
  if (platforms.length) o.platforms = platforms.slice(0, 6);
  if (g.rating != null) o.rating = g.rating;
  if (g.playtimeMinutes) o.hours = round1(g.playtimeMinutes / 60);
  if (g.favorite) o.favorite = true;
  if (total > 0) o.dlc = `${done}/${total}`;
  if (g.studio) o.studio = g.studio;
  if (g.genres?.length) o.genres = g.genres.slice(0, 5);
  return o;
}

export function statsSummary(games: ApiGame[]) {
  const by: Record<string, number> = {};
  let minutes = 0, favorites = 0;
  for (const g of games) { by[g.state] = (by[g.state] ?? 0) + 1; minutes += g.playtimeMinutes || 0; if (g.favorite) favorites++; }
  const top = [...games].sort((a, b) => (b.playtimeMinutes || 0) - (a.playtimeMinutes || 0)).slice(0, 5)
    .filter((g) => g.playtimeMinutes > 0).map((g) => ({ title: g.title, hours: round1(g.playtimeMinutes / 60) }));
  return { games: games.length, by_state: by, hours: Math.round(minutes / 60), favorites, most_played: top };
}

/** Merge what every mounted screen registered into one view fragment. */
export function mergeRegistrations(regs: ViewRegistration[]): ViewRegistration {
  const out: ViewRegistration = {};
  for (const r of regs) {
    if (r.view) out.view = { ...(out.view ?? {}), ...r.view };
    if (r.visibleIds) out.visibleIds = r.visibleIds;
    if (r.editor) out.editor = { kind: out.editor?.kind ?? r.editor.kind, fields: { ...(out.editor?.fields ?? {}), ...r.editor.fields } };
  }
  return out;
}

const nonEmpty = (fields: Record<string, unknown>) => Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null && String(v).trim() !== ''));

export interface ContextInput {
  pathname: string;
  /** The game of a /show/<id> page (null when it is not in the library). */
  game?: ApiGame | null;
  /** The whole library (library, profile and stats views). */
  games?: ApiGame[];
  registered?: ViewRegistration;
  limit?: number;
  list?: ListRow | null;
  profile?: Profile | null;
  backend?: string;
}

export interface CopilotContext { active_objects: ActiveObject[]; view: Record<string, unknown> }

export function buildContext(input: ContextInput): CopilotContext {
  const route = routeInfo(input.pathname);
  const reg = input.registered ?? {};
  const limit = input.limit ?? 8;
  const games = input.games ?? [];
  let objects: ActiveObject[] = [];
  const view: Record<string, unknown> = { page: route.page, ...(reg.view ?? {}) };
  if (input.backend) view.backend = input.backend;

  if (route.page === 'game') {
    if (input.game) objects = [gameObject(input.game)];
  } else if (route.page === 'library') {
    const byId = new Map(games.map((g) => [g.tvdbId, g]));
    const ordered = reg.visibleIds !== undefined
      ? reg.visibleIds.map((id) => byId.get(id)).filter((g): g is ApiGame => !!g)
      : [...games].sort((a, b) => Number(b.state === 'playing') - Number(a.state === 'playing'));
    objects = ordered.slice(0, limit).map(gameObject);
    view.total_games = games.length;
  } else if (route.page === 'list') {
    if (input.list) objects = [{ kind: 'list', object_id: String(input.list.id), title: input.list.name, items: input.list.item_count, public: !!input.list.is_public }];
  } else if (route.page === 'stats' || route.page === 'profile') {
    view.summary = statsSummary(games);
    if (route.page === 'profile' && input.profile) view.profile = { ...input.profile };
  }

  if (reg.editor) {
    const fields = nonEmpty(reg.editor.fields);
    if (Object.keys(fields).length) view.editor = { kind: reg.editor.kind, dirty: true, fields } satisfies EditorState;
  }
  return { active_objects: objects, view };
}
