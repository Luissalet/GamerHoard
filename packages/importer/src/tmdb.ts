// Minimal TMDB client. Resolves TheTVDB ids and movie titles -> TMDB posters/metadata.
// Auth: TMDB v4 read token (TMDB_ACCESS_TOKEN) or v3 key (TMDB_API_KEY). Disk-cached.
import fs from 'node:fs';
import path from 'node:path';

type Kind = 'show' | 'movie' | 'episode';
export interface Resolved { kind: Kind; tmdbId: number; title?: string; posterPath?: string | null; overview?: string; network?: string; status?: string; releaseDate?: string | null }

export class Tmdb {
  private base = 'https://api.themoviedb.org/3';
  private headers: Record<string, string>;
  private key?: string;
  private cache: Record<string, unknown> = {};
  private cacheFile: string;

  constructor(opts: { accessToken?: string; apiKey?: string; cacheDir?: string } = {}) {
    this.headers = opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {};
    this.key = opts.apiKey;
    this.cacheFile = path.join(opts.cacheDir || '.', '.tmdb-cache.json');
    try { this.cache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8')); } catch { /* cold */ }
  }
  get configured() { return !!(this.headers.Authorization || this.key); }
  static image(p?: string | null, size: 'w342' | 'w500' | 'original' = 'w342') { return p ? `https://image.tmdb.org/t/p/${size}${p}` : null; }

  private async get(pathname: string, params: Record<string, string> = {}) {
    const url = new URL(this.base + pathname);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (this.key) url.searchParams.set('api_key', this.key);
    const ck = url.toString();
    if (ck in this.cache) return this.cache[ck];
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`TMDB ${res.status} ${pathname}`);
    const json = await res.json();
    this.cache[ck] = json;
    return json;
  }
  flush() { try { fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache)); } catch { /* ignore */ } }

  async findByTvdb(kind: Kind, tvdbId: number): Promise<Resolved | null> {
    const r: any = await this.get(`/find/${tvdbId}`, { external_source: 'tvdb_id' });
    if (kind === 'show' && r.tv_results?.[0]) { const t = r.tv_results[0]; return { kind, tmdbId: t.id, title: t.name, posterPath: t.poster_path, overview: t.overview }; }
    if (kind === 'movie' && r.movie_results?.[0]) { const m = r.movie_results[0]; return { kind, tmdbId: m.id, title: m.title, posterPath: m.poster_path, overview: m.overview }; }
    return null;
  }
  async getTv(id: number): Promise<any> { return this.get(`/tv/${id}`); }
  async searchMovie(title: string, year?: number): Promise<Resolved | null> {
    const r: any = await this.get('/search/movie', year ? { query: title, year: String(year) } : { query: title });
    const hit = r.results?.[0];
    return hit ? { kind: 'movie', tmdbId: hit.id, title: hit.title, posterPath: hit.poster_path, overview: hit.overview, releaseDate: hit.release_date ?? null } : null;
  }
}
