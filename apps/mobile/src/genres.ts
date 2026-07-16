// Library genre support: id<->name maps (localized) + lazy TMDB backfill of the
// `genres` column (comma-joined TMDB genre ids; '' = resolved but none/unknown).
import { data, type ShowRow, type MovieRow } from './db';
import { tvLite, movieLiteById, movieLiteByTitle, genreList, tmdbImg } from './tmdb';

export async function genreNameMap(lang: string): Promise<Record<number, string>> {
  const [tv, mv] = await Promise.all([genreList('tv', lang), genreList('movie', lang)]);
  const m: Record<number, string> = {};
  for (const g of [...tv, ...mv]) m[g.id] = g.name;
  return m;
}

export const parseGenres = (g?: string | null): number[] =>
  g ? g.split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];

/** Distinct genre ids present in a set of library rows. */
export function libraryGenres(rows: { genres?: string | null }[]): number[] {
  const s = new Set<number>();
  for (const r of rows) for (const id of parseGenres(r.genres)) s.add(id);
  return [...s];
}

/** Resolve + persist genres for shows missing them; fills missing posters on the way
 *  (fresh imports arrive posterless — this dresses the library progressively). */
export async function backfillShowGenres(shows: ShowRow[], max = 60): Promise<boolean> {
  const need = shows.filter((sh) => sh.genres == null || !sh.poster).slice(0, max);
  let changed = false;
  for (let i = 0; i < need.length; i += 5) {
    await Promise.all(need.slice(i, i + 5).map(async (sh) => {
      try {
        const lite = await tvLite(sh.tvdb_id);
        if (sh.genres == null) {
          const val = lite ? lite.genreIds.join(',') : '';
          await data.setShowGenres(sh.tvdb_id, val);
          sh.genres = val; changed = true;
        }
        if (!sh.poster && lite?.posterPath) {
          const url = tmdbImg(lite.posterPath, 'w342');
          if (url) { await data.setShowPoster(sh.tvdb_id, url); sh.poster = url; changed = true; }
        }
      } catch { /* skip */ }
    }));
  }
  return changed;
}

/** Resolve + persist genres for movies missing them. Returns true if anything changed. */
export async function backfillMovieGenres(movies: MovieRow[], max = 60): Promise<boolean> {
  const need = movies.filter((m) => (m.genres == null || !m.poster) && m.uuid).slice(0, max);
  let changed = false;
  for (let i = 0; i < need.length; i += 5) {
    await Promise.all(need.slice(i, i + 5).map(async (m) => {
      try {
        const lite = m.uuid!.startsWith('tmdb:')
          ? await movieLiteById(Number(m.uuid!.slice(5)))
          : await movieLiteByTitle((m.slug || m.title).replace(/-/g, ' '), m.year);
        if (m.genres == null) {
          const val = lite ? lite.genreIds.join(',') : '';
          await data.setMovieGenres(m.uuid!, val);
          m.genres = val; changed = true;
        }
        if (!m.poster && lite?.posterPath) {
          const url = tmdbImg(lite.posterPath, 'w342');
          if (url) { await data.setMoviePoster(m.uuid!, url); m.poster = url; changed = true; }
        }
      } catch { /* skip */ }
    }));
  }
  return changed;
}
