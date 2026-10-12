import { Platform } from 'react-native';
import { data } from './db';

// Data ownership: export everything Watch Hoard currently holds about you — read LIVE
// from the active data source (local SQLite, web storage, or your cloud account), never
// from a bundled file. Per-episode checkmarks are reconstructible from watched counts.
export async function exportData(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  await data.ready();
  const [profile, shows, movies, upcoming, recent, lists, reviews, badges] = await Promise.all([
    data.getProfile(), data.getShows(), data.getMovies(100000), data.getUpcomingMovies(),
    data.getRecent(100), data.getLists(), data.getReviews(1000), data.getBadges(),
  ]);
  const listsFull = await Promise.all((lists ?? []).map(async (l) => ({ ...l, items: await data.getListItems(l.id) })));
  const seenMovie = new Set((movies ?? []).map((m) => m.uuid));
  const allMovies = [...(movies ?? []), ...(upcoming ?? []).filter((m) => !seenMovie.has(m.uuid))];
  const payload = {
    format: 'watchhoard-export',
    version: 2,
    generatedAt: new Date().toISOString(),
    profile, shows, movies: allMovies, recent, lists: listsFull, reviews, badges,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `watchhoard-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  URL.revokeObjectURL(url);
  return true;
}
