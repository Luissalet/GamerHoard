#!/usr/bin/env -S npx tsx
// Watch Hoard importer CLI.
//   validate <dir>            — parse a TV Time export and reconstruct the profile (no network/DB)
//   local    <dir> <out.json> — build an on-device seed from the export (no cloud, no TMDB)
//   import   <dir>            — resolve TVDB/IMDb/title -> TMDB and upsert into Supabase (later)
import fs from 'node:fs';
import path from 'node:path';
import { parseTvTimeExport } from './parse.ts';
import { reconstruct } from './stats.ts';
import { buildSeed, patchSeedFavorites, type Seed } from './seed.ts';
import { Tmdb } from './tmdb.ts';
import { enrichSeed } from './enrich.ts';
import { enrichMeta } from './meta.ts';
import { pushToCloud } from './push.ts';

function loadEnv() {
  for (const p of ['.env', '../../.env', '../../../.env']) {
    try {
      for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch { /* no .env here */ }
  }
}

const [mode, dir, out] = process.argv.slice(2);
if (!mode || !dir) { console.error('usage: run.ts <validate|local|favorites|import|enrich|meta|push> <export-dir|seed.json|user> [out.json]'); process.exit(2); }

// Only the raw-export modes need to parse the TV Time dump. enrich/meta operate on a seed,
// and push takes a user id/email — so skip the parse for those.
const NEEDS_EXPORT = mode === 'validate' || mode === 'local' || mode === 'import' || mode === 'favorites';
const profile = NEEDS_EXPORT ? parseTvTimeExport(dir) : (null as any);
const recon = NEEDS_EXPORT ? reconstruct(profile, dir) : (null as any);
const APP = { episodes: 14611, seriesClock: '8mo 23d 22h', moviesClock: '2mo 21d 3h' };

function printValidation() {
  console.log('\n================  WATCH HOARD · IMPORT VALIDATION  ================\n');
  console.log(`handle: ${profile.handle ?? '(unknown)'}   locale: ${profile.locale}   dark mode: ${profile.darkMode}`);
  console.table(recon);
  console.log('Cross-check vs the live TV Time app:');
  console.log(`  episodes watched   app=${APP.episodes}   dump(stats row)=${recon.reportedEpisodes}   ledger=${recon.episodeWatchEvents}`);
  console.log(`  series time clock  app="${APP.seriesClock}"   reconstructed="${recon.seriesTimeClock}"`);
  const ok = recon.reportedEpisodes === APP.episodes;
  console.log(`\n  ${ok ? 'MATCH ✅' : 'mismatch ❔'} — episode total reconstructed from the raw export equals the app.\n`);
}

function writeLocalSeed() {
  const seed = buildSeed(profile, dir);
  const outPath = out || 'seed.json';
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(seed, null, 2));
  console.log('\n================  WATCH HOARD · LOCAL SEED  ================\n');
  console.log(`handle           ${seed.profile.handle}`);
  console.log(`episodes         ${seed.profile.episodes.toLocaleString()}   (${seed.profile.seriesClock})`);
  console.log(`movies           ${seed.profile.movies.toLocaleString()}   (${seed.profile.moviesClock})`);
  console.log(`shows            ${seed.shows.length}   lists ${seed.lists.length}   badges ${seed.profile.badges}   reactions ${seed.profile.reactions}`);
  console.log(`recent activity  ${seed.recent.length} events`);
  console.log(`\ntop 5 continue-watching:`);
  for (const s of seed.shows.filter((x) => x.lastWatchedAt).slice(0, 5))
    console.log(`  • ${s.title}  — S${s.lastSeason} E${s.lastEpisode}  (${s.watchedEpisodes} watched)`);
  console.log(`\nwrote ${path.resolve(outPath)}  (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
}

async function runMeta() {
  loadEnv();
  const seedPath = dir; const limit = out ? parseInt(out, 10) : Infinity;
  const token = process.env.TMDB_ACCESS_TOKEN, key = process.env.TMDB_API_KEY;
  if (!(token || key)) { console.error('meta needs TMDB_ACCESS_TOKEN'); process.exit(2); }
  const tmdb = new Tmdb({ accessToken: token, apiKey: key, cacheDir: '.' });
  console.log('Fetching TMDB status + episode counts + genres for shows…');
  const r = await enrichMeta(seedPath, { tmdb, limit });
  tmdb.flush();
  console.log(`shows with metadata: ${r.withMeta}/${r.total} (fetched ${r.fetched} now)`);
}

async function runImport() {
  const tmdb = new Tmdb({ accessToken: process.env.TMDB_ACCESS_TOKEN, apiKey: process.env.TMDB_API_KEY });
  if (!tmdb.configured) { console.error('Set TMDB_ACCESS_TOKEN (or TMDB_API_KEY) to import to a backend.'); process.exit(2); }
  const shows = new Map<number, string>();
  for (const f of profile.follows) if (f.tvdbShowId) shows.set(f.tvdbShowId, f.name);
  let resolved = 0; const unresolved: string[] = [];
  for (const [tvdb, name] of shows) {
    try { (await tmdb.findByTvdb('show', tvdb)) ? resolved++ : unresolved.push(`${name} (tvdb ${tvdb})`); }
    catch { unresolved.push(`${name} (tvdb ${tvdb}) [error]`); }
  }
  tmdb.flush();
  console.log(`resolved ${resolved}/${shows.size} shows via TMDB; ${unresolved.length} for review`);
}

async function runEnrich() {
  loadEnv();
  const seedPath = dir; const limit = out ? parseInt(out, 10) : Infinity;
  const token = process.env.TMDB_ACCESS_TOKEN, key = process.env.TMDB_API_KEY;
  const tmdb = (token || key) ? new Tmdb({ accessToken: token, apiKey: key, cacheDir: '.' }) : null;
  console.log(tmdb
    ? 'Enriching with TMDB (shows + movies) — TVMaze fallback for shows…'
    : 'Enriching with TVMaze (free/keyless, shows only). Set TMDB_ACCESS_TOKEN in .env to add movie posters.');
  const r = await enrichSeed(seedPath, { limit, tmdb, concurrency: tmdb ? 8 : 4, delayMs: tmdb ? 15 : 100 });
  if (tmdb) tmdb.flush();
  console.log(`shows: ${r.showsWithPoster}/${r.totalShows} · movies: ${r.moviesWithPoster}/${r.totalMovies} (fetched ${r.fetchedShows} shows, ${r.fetchedMovies} movies now)`);
}

function patchFavorites() {
  const seedPath = out || '../../apps/mobile/assets/seed.json';
  const seed = JSON.parse(fs.readFileSync(path.resolve(seedPath), 'utf8')) as Seed;
  const r = patchSeedFavorites(seed, profile);
  fs.writeFileSync(path.resolve(seedPath), JSON.stringify(seed, null, 2));
  console.log('\n================  WATCH HOARD · FAVORITES + LISTS PATCH  ================\n');
  console.log(`favorite shows   ${r.favShows}`);
  console.log(`favorite movies  ${r.favMovies}`);
  console.log(`custom lists     ${r.lists}   (${r.listItems} items total)`);
  for (const l of seed.lists) console.log(`  • ${l.name || '(untitled)'} — ${l.itemCount} items${l.isPublic ? ' · public' : ''}`);
  console.log(`\npatched ${path.resolve(seedPath)}`);
}

if (mode === 'validate') printValidation();
else if (mode === 'local') writeLocalSeed();
else if (mode === 'favorites') patchFavorites();
else if (mode === 'enrich') runEnrich();
else if (mode === 'meta') runMeta();
else if (mode === 'import') runImport();
else if (mode === 'push') { loadEnv(); pushToCloud(dir, out || '../../apps/mobile/assets/seed.json'); }
else { console.error('unknown mode', mode); process.exit(2); }
