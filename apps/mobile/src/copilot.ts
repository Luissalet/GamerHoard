import { Platform } from 'react-native';
import { BACKEND } from './lib/backend';
import { buildContext, routeInfo, type CopilotContext } from './copilotContext';
import { registeredView } from './copilotRegistry';
import { refreshAllQueries } from './useData';
import type { ApiGame } from './db/localapiMap';

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
    const route = routeInfo(pathname);
    let game: ApiGame | null = null;
    let games: ApiGame[] = [];
    if (BACKEND === 'localapi') {
      if (route.page === 'game' && route.gameId) game = await getJson<ApiGame>(`/api/games/${route.gameId}`);
      else if (['library', 'stats', 'profile'].includes(route.page)) games = (await getJson<{ games: ApiGame[] }>('/api/games?limit=500'))?.games ?? [];
    }
    return buildContext({ pathname, game, games, registered: registeredView() });
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
