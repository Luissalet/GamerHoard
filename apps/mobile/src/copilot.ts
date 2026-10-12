import { Platform } from 'react-native';
import { BACKEND } from './lib/backend';
import { buildContext, routeInfo, type CopilotContext } from './copilotContext';
import { registeredView } from './copilotRegistry';
import { refreshAllQueries } from './useData';
import type { ApiGame } from './db/localapiMap';
import { data } from './db';
import { sourceGame } from './sourceGame';

// Faustus copilot hook (web only). The launcher injected by the local server calls
// window.hoardCopilot.context(base) on every turn and onTurnEnd(detail) after it.
//   - context(): real objects open in the view, read from the same REST API the screens use.
//   - onTurnEnd(): refresh the mounted lists once (debounced) without remounting forms.

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    return res.ok ? ((await res.json()) as T) : null;
  } catch { return null; }
}

async function context(_base?: unknown): Promise<CopilotContext> {
  try {
    const pathname = (globalThis as any).location?.pathname ?? '/';
    // Keep the screen and its pending fields together while native reads resolve.
    const registered = structuredClone(registeredView());
    const route = routeInfo(pathname);
    let game: ApiGame | null = null;
    let games: ApiGame[] = [];
    let list = null;
    let profile = null;
    if (BACKEND === 'localapi') {
      if (route.page === 'game' && route.gameId) game = await getJson<ApiGame>(`/api/games/${route.gameId}`);
      else if (['library', 'stats', 'profile'].includes(route.page)) games = (await getJson<{ games: ApiGame[] }>('/api/games?limit=500'))?.games ?? [];
    } else {
      if (route.page === 'game' && route.gameId) {
        const row = await data.getShowById(route.gameId);
        game = row ? sourceGame(row) : null;
      } else if (['library', 'stats', 'profile'].includes(route.page)) games = (await data.getShows()).map(sourceGame);
    }
    if (route.page === 'list' && route.listId != null) list = await data.getListById(route.listId);
    if (route.page === 'profile') profile = await data.getProfile();
    return buildContext({ pathname, game, games, list, profile, backend: BACKEND, registered });
  } catch {
    return { active_objects: [], view: { page: 'unknown' } };
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; refreshAllQueries(); }, 250);
}

export function installCopilot() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const w = window as any;
  if (w.__gamerhoardCopilotInstalled) return;
  w.__gamerhoardCopilotInstalled = true;
  w.hoardCopilot = { context, onTurnEnd: () => scheduleRefresh() };
  window.addEventListener('hoard:copilot-turn-end', scheduleRefresh);
}
