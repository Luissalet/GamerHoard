import { parse } from 'csv-parse/sync';
import fs from 'node:fs';
import path from 'node:path';
import type { NormProfile } from './types.ts';

// TV Time renders its "clock" with 30-day months and 24-hour days.
export function formatClock(seconds: number): string {
  const totalHours = seconds / 3600;
  let days = Math.floor(totalHours / 24);
  const months = Math.floor(days / 30);
  days -= months * 30;
  const hours = Math.round(totalHours - Math.floor(totalHours / 24) * 24);
  return `${months}mo ${days}d ${hours}h`;
}

export interface Reconstructed {
  showsFollowedActive: number;
  watchlist: number;
  archived: number;
  episodeWatchEvents: number;
  movieWatchEvents: number;
  reactionsRatings: number;
  reactionsEmotions: number;
  comments: number;
  lists: number;
  listItems: number;
  badges: number;
  friends: number;
  seriesTimeClock?: string;
  moviesTimeClock?: string;
  reportedEpisodes?: number;
  reportedMovies?: number;
}

export function reconstruct(p: NormProfile, dir?: string): Reconstructed {
  const r: Reconstructed = {
    showsFollowedActive: p.follows.filter((f) => f.state === 'watching').length,
    watchlist: p.follows.filter((f) => f.isForLater).length,
    archived: p.follows.filter((f) => f.isArchived).length,
    episodeWatchEvents: p.watches.filter((w) => w.kind === 'episode').length,
    movieWatchEvents: p.watches.filter((w) => w.kind === 'movie').length,
    reactionsRatings: p.reactions.filter((x) => x.kind === 'rating').length,
    reactionsEmotions: p.reactions.filter((x) => x.kind === 'emotion').length,
    comments: p.comments.length,
    lists: p.lists.length,
    listItems: p.lists.reduce((n, l) => n + l.items.length, 0),
    badges: p.badges.length,
    friends: p.friends,
  };
  // TV Time embeds an authoritative totals row (key=tracking-stats) — use it for the clock.
  if (dir) {
    const f = path.join(dir, 'tracking-prod-records-v2.csv');
    if (fs.existsSync(f)) {
      const rows = parse(fs.readFileSync(f), { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true }) as Record<string, string>[];
      const s = rows.find((x) => (x.key || '').startsWith('tracking-stats'));
      if (s) {
        r.seriesTimeClock = formatClock(parseInt(s.total_series_runtime || '0', 10));
        r.moviesTimeClock = formatClock(parseInt(s.total_movies_runtime || '0', 10));
        r.reportedEpisodes = parseInt(s.ep_watch_count || '0', 10);
        r.reportedMovies = parseInt(s.movie_watch_count || '0', 10);
      }
    }
  }
  return r;
}
