import type { ShowRow } from './db';
// GamerHoard library buckets, driven by the game's state:
//   backlog  -> not_started (Pendiente)      watching -> watching (Jugando)
//   stopped  -> paused (Pausado)             archived -> finished (Completado)
//   dropped  -> dropped (Abandonado)
// `up_to_date` is kept in the type for compatibility but is derived from DLC completion.
export type Category = 'watching' | 'not_started' | 'paused' | 'up_to_date' | 'finished' | 'dropped';
export type GameState = 'backlog' | 'watching' | 'stopped' | 'archived' | 'dropped';

/** All DLCs/expansions owned (when the game has any). */
export function isCaughtUp(s: ShowRow): boolean {
  const total = s.total_episodes ?? 0;
  return total > 0 && s.watched_episodes >= total;
}
export function categoryOf(s: ShowRow): Category {
  switch (s.state) {
    case 'stopped': return 'paused';
    case 'archived': return 'finished';
    case 'dropped': return 'dropped';
    case 'backlog': return 'not_started';
    default: return 'watching';
  }
}
// Order of category sections/filters. Labels resolve via i18n key `categories.<key>`.
export const CATEGORIES: { key: Category }[] = [
  { key: 'watching' },
  { key: 'not_started' },
  { key: 'paused' },
  { key: 'finished' },
  { key: 'dropped' },
];
export function progress(s: ShowRow): { frac: number; color: 'watching' | 'up_to_date' | 'finished' | 'none' } {
  const cat = categoryOf(s);
  const total = s.total_episodes ?? 0;
  if (cat === 'finished') return { frac: 1, color: 'finished' };
  if (cat === 'not_started' || cat === 'dropped') return { frac: 0, color: 'none' };
  // For games with DLCs, show how many you own/completed; otherwise a light half bar while playing.
  if (total > 0) return { frac: Math.min(1, s.watched_episodes / total), color: 'watching' };
  return cat === 'paused' ? { frac: 0, color: 'none' } : { frac: 0.5, color: 'watching' };
}
