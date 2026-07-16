// One-shot bulk poster/genre resolver for freshly imported libraries.
// The CLI importer used to bake posters into seed.json; the in-app importer creates rows
// posterless, so this sweeps EVERYTHING missing with bounded concurrency (TMDB allows ~50 rps;
// we stay well under). Module-level singleton: safe to kick from several screens.
import { data, type MovieRow } from './db';
import { tvLite, movieLiteById, movieLiteByTitle, tmdbImg, tmdbConfigured } from './tmdb';

export type SweepProgress = { done: number; total: number };

let running: Promise<number> | null = null;
let checkedThisSession = false;

async function gatherJobs() {
  await data.ready();
  const [shows, movies, upcoming] = await Promise.all([data.getShows(), data.getMovies(100000), data.getUpcomingMovies()]);
  const seen = new Set<string>();
  const mv: MovieRow[] = [...movies, ...upcoming].filter((m) => { if (!m.uuid || seen.has(m.uuid)) return false; seen.add(m.uuid); return true; });
  return {
    shows: shows.filter((s) => !s.poster || s.genres == null || s.tmdb_status == null || s.total_episodes == null),
    movies: mv.filter((m) => !m.poster || m.genres == null),
  };
}

export async function needsSweep(): Promise<boolean> {
  if (!tmdbConfigured || checkedThisSession) return false;
  checkedThisSession = true;
  const { shows, movies } = await gatherJobs();
  return shows.length + movies.length > 0;
}

export function sweepMissingPosters(onProgress?: (p: SweepProgress) => void): Promise<number> {
  if (running) return running;
  running = (async () => {
    const { shows, movies } = await gatherJobs();
    type Job = { kind: 'show' | 'movie'; row: any };
    const jobs: Job[] = [...shows.map((row) => ({ kind: 'show' as const, row })), ...movies.map((row) => ({ kind: 'movie' as const, row }))];
    const total = jobs.length;
    let done = 0, found = 0, idx = 0;
    onProgress?.({ done, total });
    const worker = async () => {
      while (idx < jobs.length) {
        const j = jobs[idx++];
        try {
          if (j.kind === 'show') {
            const lite = await tvLite(j.row.tvdb_id);
            if (!j.row.poster) {
              const url = tmdbImg(lite?.posterPath ?? null, 'w342');
              if (url) { await data.setShowPoster(j.row.tvdb_id, url); found++; }
            }
            if (j.row.genres == null) await data.setShowGenres(j.row.tvdb_id, lite ? lite.genreIds.join(',') : '');
            if (lite && (j.row.tmdb_status == null || j.row.total_episodes == null)) {
              await data.setShowMeta(j.row.tvdb_id, { tmdb_status: lite.status ?? null, total_episodes: lite.totalEpisodes ?? null, network: lite.network ?? null, last_aired_season: lite.lastAiredSeason ?? null, last_aired_episode: lite.lastAiredEpisode ?? null });
            }
          } else {
            const u: string = j.row.uuid;
            const lite = u.startsWith('tmdb:')
              ? await movieLiteById(Number(u.slice(5)))
              : await movieLiteByTitle((j.row.slug || j.row.title).replace(/-/g, ' '), j.row.year);
            if (!j.row.poster) {
              const url = tmdbImg(lite?.posterPath ?? null, 'w342');
              if (url) { await data.setMoviePoster(u, url); found++; }
            }
            if (j.row.genres == null) await data.setMovieGenres(u, lite ? lite.genreIds.join(',') : '');
          }
        } catch { /* skip this row */ }
        done++;
        onProgress?.({ done, total });
      }
    };
    await Promise.all(Array.from({ length: 8 }, () => worker()));
    running = null;
    checkedThisSession = false;   // a later needsSweep() re-checks (e.g. new import in same session)
    return found;
  })();
  return running;
}
