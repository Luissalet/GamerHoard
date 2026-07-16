// External ratings, visible in the app (not just links).
// - IMDb: keyless via the community mirror api.imdbapi.dev (works per-episode too).
// - Rotten Tomatoes + Metacritic: via OMDb when EXPO_PUBLIC_OMDB_KEY is set (free key,
//   omdbapi.com — 1,000 req/day); otherwise those chips just link out.
// - FilmAffinity has no public API: always link-only.
const OMDB_KEY = process.env.EXPO_PUBLIC_OMDB_KEY;

export interface ExternalRatings { imdb: string | null; imdbVotes: number | null; rt: string | null; metacritic: string | null }

const cache = new Map<string, ExternalRatings>();

export async function externalRatings(imdbId: string): Promise<ExternalRatings | null> {
  if (!imdbId) return null;
  const hit = cache.get(imdbId);
  if (hit) return hit;
  const out: ExternalRatings = { imdb: null, imdbVotes: null, rt: null, metacritic: null };

  if (OMDB_KEY) {
    try {
      const r = await fetch(`https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${imdbId}`);
      const j: any = await r.json();
      if (j && j.Response !== 'False') {
        if (j.imdbRating && j.imdbRating !== 'N/A') out.imdb = j.imdbRating;
        if (j.imdbVotes && j.imdbVotes !== 'N/A') out.imdbVotes = parseInt(j.imdbVotes.replace(/,/g, ''), 10) || null;
        for (const x of (j.Ratings ?? [])) {
          if (x.Source === 'Rotten Tomatoes') out.rt = x.Value;
          if (x.Source === 'Metacritic') out.metacritic = (x.Value || '').split('/')[0] || null;
        }
      }
    } catch { /* fall through */ }
  }
  if (!out.imdb) {
    try {
      const r = await fetch(`https://api.imdbapi.dev/titles/${imdbId}`);
      const j: any = await r.json();
      if (j?.rating?.aggregateRating != null) {
        out.imdb = String(j.rating.aggregateRating);
        out.imdbVotes = j.rating.voteCount ?? null;
      }
    } catch { /* keep nulls */ }
  }
  cache.set(imdbId, out);
  return out;
}
