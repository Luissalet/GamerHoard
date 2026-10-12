#!/usr/bin/env node
/*
 * GamerHoard — living knowledge-graph generator.
 *
 * Zero dependencies. Scans the monorepo and rebuilds a machine-readable graph
 * (graph.json), an interactive explorer (graph.html), an architecture diagram
 * (graph.mermaid), and a navigable written map (MAP.md).
 *
 * Run from anywhere:  node docs/knowledge-graph/generate.mjs
 * or, if wired in package.json:  npm run graph
 *
 * The script derives everything from the code, so it stays accurate as the app
 * evolves. Durable human knowledge that can't be derived (gotchas, decisions)
 * lives in CURATED.md next to this file and is injected into MAP.md verbatim.
 *
 * GamerHoard is a fork of Watch Hoard repurposed for video games: many internal
 * names are inherited with new semantics (a "show" is a GAME, an "episode" is a
 * DLC/expansion, `network` is the studio/publisher). RAWG replaces TMDB and a
 * Steam import replaces the TV Time import. See CURATED.md for the full mapping.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');           // docs/knowledge-graph -> repo root
const OUT = HERE;
const MOBILE = path.join(REPO, 'apps', 'mobile');
const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'android', 'ios', '.turbo', 'build', '.next', 'coverage', '.temp']);
const PKG_SCOPES = ['@gamerhoard/', '@watchhoard/']; // fork keeps some @watchhoard/* package names

// ----------------------------------------------------------------------------- helpers
const toPosix = (p) => p.split(path.sep).join('/');
const rel = (p) => toPosix(path.relative(REPO, p));
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const loc = (src) => (src ? src.split('\n').length : 0);

function walk(dir, exts, acc = []) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    if (e.name.startsWith('.') && e.name !== '.env.example') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, exts, acc);
    } else if (!exts || exts.some((x) => e.name.endsWith(x))) {
      acc.push(full);
    }
  }
  return acc;
}

// Pull the leading `//` comment block from a source file as a one-line description.
function topComment(src) {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    let l = lines[i].trim();
    if (i === 0 && l.startsWith('#!')) continue;
    if (l.startsWith('//')) { out.push(l.replace(/^\/+\s?/, '').trim()); continue; }
    if (l.startsWith('/*')) {
      // block comment: gather until */
      let j = i, buf = [];
      for (; j < Math.min(lines.length, i + 25); j++) {
        let t = lines[j].replace(/^\s*\/?\*+\/?/, '').replace(/\*+\/\s*$/, '').trim();
        if (t) buf.push(t);
        if (lines[j].includes('*/')) break;
      }
      if (buf.length) return clean(buf.join(' '));
      break;
    }
    if (out.length) break;
    if (l === '') { if (out.length) break; else continue; }
    break;
  }
  return clean(out.join(' '));
}
function clean(s) {
  s = (s || '').replace(/\s+/g, ' ').trim();
  // first sentence, capped
  const dot = s.search(/\.(\s|$)/);
  if (dot > 20 && dot < 180) s = s.slice(0, dot + 1);
  if (s.length > 200) s = s.slice(0, 197) + '…';
  return s;
}

// ----------------------------------------------------------------------------- nodes/edges
const nodes = [];
const edges = [];
const byFile = new Map();      // rel file path -> node id (for import resolution)
const idset = new Set();
function addNode(n) {
  if (idset.has(n.id)) return n.id;
  idset.add(n.id);
  nodes.push(n);
  if (n.file) byFile.set(n.file, n.id);
  return n.id;
}
function addEdge(from, to, type) {
  if (!from || !to || from === to) return;
  edges.push({ from, to, type });
}

// ----------------------------------------------------------------------------- routes (Expo Router)
function routeUrl(relFromApp) {
  let p = relFromApp.replace(/\.(tsx|ts|jsx|js)$/, '');
  const segs = p.split('/').filter((s) => !/^\(.*\)$/.test(s)); // drop (group) segments
  let last = segs[segs.length - 1];
  if (last === 'index') segs.pop();
  let uUrl = '/' + segs.join('/');
  if (uUrl.length > 1 && uUrl.endsWith('/')) uUrl = uUrl.slice(0, -1);
  return uUrl || '/';
}
function collectRoutes() {
  const appDir = path.join(MOBILE, 'app');
  if (!exists(appDir)) return;
  for (const f of walk(appDir, ['.tsx', '.ts'])) {
    const r = rel(f);
    const relApp = toPosix(path.relative(appDir, f));
    const base = path.basename(f);
    const src = read(f);
    const desc = topComment(src);
    let kind = 'route';
    if (base === '_layout.tsx' || base === '_layout.ts') kind = 'layout';
    else if (base.startsWith('+')) kind = 'special';
    const group = (relApp.match(/\(([^)]+)\)/) || [])[1] || null;
    const dynamic = /\[[^\]]+\]/.test(relApp);
    const uUrl = kind === 'route' ? routeUrl(relApp) : null;
    const id = 'route:' + relApp;
    addNode({
      id, type: 'route', kind, area: 'route',
      label: kind === 'route' ? (uUrl === '/' ? '/ (home)' : uUrl) : relApp,
      file: r, url: uUrl, group, dynamic, loc: loc(src), desc,
    });
  }
}

// ----------------------------------------------------------------------------- src modules
const AREA_BY_DIR = { db: 'data', auth: 'auth', import: 'import', i18n: 'i18n', lib: 'lib' };
function moduleArea(relFromSrc, base) {
  const dir = relFromSrc.includes('/') ? relFromSrc.split('/')[0] : '';
  if (AREA_BY_DIR[dir]) return AREA_BY_DIR[dir];
  // root-level src files: components (.tsx) vs feature-logic (.ts)
  return base.endsWith('.tsx') ? 'ui' : 'feature';
}
function collectModules(root, areaOverride) {
  const srcDir = path.join(root, 'src');
  if (!exists(srcDir)) return;
  for (const f of walk(srcDir, ['.ts', '.tsx'])) {
    if (f.endsWith('.d.ts')) continue;
    const r = rel(f);
    const relSrc = toPosix(path.relative(srcDir, f));
    const base = path.basename(f);
    const src = read(f);
    const area = areaOverride || moduleArea(relSrc, base);
    const id = 'mod:' + r;
    addNode({
      id, type: 'module', area,
      label: relSrc, file: r, loc: loc(src), desc: topComment(src),
    });
  }
}

// ----------------------------------------------------------------------------- import edges + API usage
const API_SIGNS = [
  { id: 'api:rawg', label: 'RAWG', host: 'api.rawg.io', signs: ['api.rawg.io', 'rawg.io'], keyless: false, note: 'Primary game metadata: games, DLCs, genres, platforms, stores (where to play), Metacritic, screenshots, similar. Free key. Cached (mem + disk, 24h).' },
  { id: 'api:steam', label: 'Steam', host: 'steampowered.com', signs: ['api.steampowered.com', 'steamcommunity.com', 'store.steampowered.com', 'steamstatic.com'], keyless: false, note: 'Library import (owned games + playtime) via the steam-auth Edge Function — "Sign in through Steam" (OpenID). Also store links + CDN header images. Key is a function secret, never in the client.' },
  { id: 'api:supabase', label: 'Supabase', host: '*.supabase.co', signs: ['supabase.co', '@supabase/supabase-js', 'createClient(', '/functions/v1/'], keyless: false, note: 'Cloud backend: Postgres + Auth + Storage + Edge Functions. Default backend (cloud-first; login always required).' },
  { id: 'api:tmdb', label: 'TMDB (legacy)', host: 'image.tmdb.org', signs: ['image.tmdb.org', 'api.themoviedb.org'], keyless: false, note: 'Vestigial from Watch Hoard. src/tmdb.ts is a shim re-exporting rawg.ts; only the image-URL helper lingers in packages/core.' },
];
function ensureApiNodes() {
  for (const a of API_SIGNS) addNode({ id: a.id, type: 'api', area: 'api', label: a.label, host: a.host, keyless: a.keyless, desc: a.note });
}
function resolveRel(fromFile, spec) {
  const base = path.resolve(path.dirname(path.join(REPO, fromFile)), spec);
  const cands = [base, base + '.tsx', base + '.ts', base + '.web.tsx', base + '.web.ts',
    path.join(base, 'index.tsx'), path.join(base, 'index.ts')];
  for (const c of cands) { const rr = rel(c); if (byFile.has(rr)) return byFile.get(rr); }
  return null;
}
function scanImportsAndApis() {
  const importRe = /(?:import[^'"]*?from\s*|import\s*|export[^'"]*?from\s*)['"]([^'"]+)['"]|(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const n of nodes) {
    if (n.type !== 'module' && n.type !== 'route') continue;
    const src = read(path.join(REPO, n.file));
    if (!src) continue;
    // imports
    const seen = new Set();
    let m;
    importRe.lastIndex = 0;
    while ((m = importRe.exec(src))) {
      const spec = m[1] || m[2];
      if (!spec) continue;
      if (spec.startsWith('.')) {
        const to = resolveRel(n.file, spec);
        if (to && !seen.has(to)) { addEdge(n.id, to, 'imports'); seen.add(to); }
      } else {
        const scope = PKG_SCOPES.find((s) => spec.startsWith(s));
        if (scope) {
          const pkg = spec.slice(scope.length).split('/')[0];
          const to = 'pkg:' + pkg;
          if (idset.has(to) && !seen.has(to)) { addEdge(n.id, to, 'imports'); seen.add(to); }
        }
      }
    }
    // external APIs
    for (const a of API_SIGNS) {
      if (a.signs.some((s) => src.includes(s))) addEdge(n.id, a.id, 'uses-api');
    }
    // Edge Function calls (functions/v1/<name>)
    for (const fm of src.matchAll(/functions\/v1\/([a-z0-9-]+)/g)) {
      const to = 'fn:' + fm[1];
      if (idset.has(to)) addEdge(n.id, to, 'calls');
    }
  }
}

// ----------------------------------------------------------------------------- Supabase Edge Functions
function collectFunctions() {
  const dir = path.join(REPO, 'supabase', 'functions');
  const out = [];
  if (!exists(dir)) return out;
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue;
    const idx = path.join(dir, e.name, 'index.ts');
    if (!exists(idx)) continue;
    const src = read(idx);
    const id = 'fn:' + e.name;
    addNode({ id, type: 'function', area: 'edge', label: e.name, file: 'supabase/functions/' + e.name + '/index.ts', loc: loc(src), desc: topComment(src) });
    out.push({ name: e.name, loc: loc(src), desc: topComment(src) });
  }
  return out;
}

// ----------------------------------------------------------------------------- data source contract
function collectDataSource() {
  const typesPath = path.join(MOBILE, 'src', 'db', 'types.ts');
  const src = read(typesPath);
  const methods = [];
  const mIf = src.match(/export interface DataSource\s*\{([\s\S]*?)\n\}/);
  if (mIf) {
    const body = mIf[1];
    const re = /^\s*([a-zA-Z_]\w*)\s*\(/gm;
    let m;
    while ((m = re.exec(body))) methods.push(m[1]);
  }
  // implementations
  const impls = [
    { key: 'local', file: 'apps/mobile/src/db/local.ts', label: 'LocalSource (SQLite / native)' },
    { key: 'memory', file: 'apps/mobile/src/db/memory.ts', label: 'MemorySource (web)' },
    { key: 'supabase', file: 'apps/mobile/src/db/supabase.ts', label: 'SupabaseSource (cloud)' },
  ];
  const implSrc = {};
  for (const im of impls) implSrc[im.key] = read(path.join(REPO, im.file));
  const rows = methods.map((name) => {
    const cov = {};
    for (const im of impls) {
      const re = new RegExp('(^|\\n)\\s*(?:async\\s+)?' + name + '\\s*(\\(|=|:)');
      cov[im.key] = re.test(implSrc[im.key] || '');
    }
    return { name, cov };
  });
  // row/entity types
  const types = [];
  const tre = /export interface (\w+)\s*\{/g;
  let tm;
  while ((tm = tre.exec(src))) if (tm[1] !== 'DataSource') types.push(tm[1]);
  return { methods: rows, impls, types };
}

// ----------------------------------------------------------------------------- migrations
function collectMigrations() {
  const dir = path.join(REPO, 'supabase', 'migrations');
  const out = [];
  if (!exists(dir)) return out;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const src = read(path.join(dir, f));
    const tables = [...src.matchAll(/create table(?:\s+if not exists)?\s+(?:public\.)?["']?(\w+)/gi)].map((m) => m[1]);
    const funcs = [...src.matchAll(/create(?:\s+or\s+replace)?\s+function\s+(?:public\.)?["']?(\w+)/gi)].map((m) => m[1]);
    const policies = (src.match(/create policy/gi) || []).length;
    const triggers = [...src.matchAll(/create(?:\s+or\s+replace)?\s+trigger\s+(\w+)/gi)].map((m) => m[1]);
    const alters = [...src.matchAll(/alter table\s+(?:if exists\s+)?(?:public\.)?["']?(\w+)/gi)].map((m) => m[1]);
    const id = 'mig:' + f;
    addNode({ id, type: 'migration', area: 'db', label: f, file: 'supabase/migrations/' + f, tables, funcs, policies, triggers, loc: loc(src) });
    for (const t of new Set(tables)) {
      const tid = 'tbl:' + t;
      addNode({ id: tid, type: 'table', area: 'db', label: t });
      addEdge(id, tid, 'defines');
    }
    out.push({ file: f, tables, funcs, policies, triggers, alters: [...new Set(alters)] });
  }
  return out;
}

// ----------------------------------------------------------------------------- packages
function collectPackages() {
  const out = [];
  const manifests = [
    { dir: REPO, id: 'pkg:root' },
    { dir: MOBILE, id: 'pkg:mobile' },
    { dir: path.join(REPO, 'packages', 'core'), id: 'pkg:core' },
    { dir: path.join(REPO, 'packages', 'importer'), id: 'pkg:importer' },
  ];
  const nameOf = {};
  for (const man of manifests) {
    const pj = read(path.join(man.dir, 'package.json'));
    if (!pj) continue;
    let j = {};
    try { j = JSON.parse(pj); } catch { }
    nameOf[man.id] = j.name || path.basename(man.dir);
    const info = {
      id: man.id, name: j.name || path.basename(man.dir), version: j.version || '',
      scripts: Object.keys(j.scripts || {}), deps: Object.keys(j.dependencies || {}),
      dir: rel(man.dir) || '.', description: j.description || '',
    };
    out.push(info);
  }
  // package nodes for the two libraries (referenced by @gamerhoard/* or @watchhoard/*)
  addNode({ id: 'pkg:core', type: 'package', area: 'core', label: nameOf['pkg:core'] || '@gamerhoard/core', file: 'packages/core' });
  addNode({ id: 'pkg:importer', type: 'package', area: 'importer', label: nameOf['pkg:importer'] || '@gamerhoard/importer', file: 'packages/importer' });
  return out;
}

// ----------------------------------------------------------------------------- i18n
function collectI18n() {
  const dir = path.join(MOBILE, 'src', 'i18n');
  const langs = [];
  for (const code of ['en', 'es', 'fr', 'de', 'pt']) {
    const src = read(path.join(dir, code + '.ts'));
    if (!src) continue;
    const leaf = (src.match(/^\s*[a-zA-Z_]\w*\s*:\s*(['"`])/gm) || []).length;
    langs.push({ code, keys: leaf });
  }
  return langs;
}

// ----------------------------------------------------------------------------- env
function collectEnv() {
  const vars = new Set();
  for (const p of [path.join(MOBILE, '.env.example'), path.join(REPO, '.env.example')]) {
    const src = read(p);
    for (const m of src.matchAll(/^\s*([A-Z0-9_]+)\s*=/gm)) vars.add(m[1]);
  }
  return [...vars].sort();
}

// ----------------------------------------------------------------------------- build
ensureApiNodes();
collectRoutes();
collectModules(MOBILE);
collectModules(path.join(REPO, 'packages', 'core'), 'core');
collectModules(path.join(REPO, 'packages', 'importer'), 'importer');
const packages = collectPackages();
const functions = collectFunctions();
const migrations = collectMigrations();
scanImportsAndApis();
const ds = collectDataSource();
const i18n = collectI18n();
const envVars = collectEnv();

// degree (for node sizing in the explorer)
const deg = new Map();
for (const e of edges) { deg.set(e.from, (deg.get(e.from) || 0) + 1); deg.set(e.to, (deg.get(e.to) || 0) + 1); }
for (const n of nodes) n.deg = deg.get(n.id) || 0;

const stats = {
  routes: nodes.filter((n) => n.type === 'route' && n.kind === 'route').length,
  layouts: nodes.filter((n) => n.type === 'route' && n.kind !== 'route').length,
  modules: nodes.filter((n) => n.type === 'module').length,
  methods: ds.methods.length,
  migrations: migrations.length,
  tables: nodes.filter((n) => n.type === 'table').length,
  apis: nodes.filter((n) => n.type === 'api').length,
  functions: nodes.filter((n) => n.type === 'function').length,
  edges: edges.length,
  languages: i18n.length,
  i18nKeys: i18n[0] ? i18n[0].keys : 0,
};

const graph = { generatedAt: new Date().toISOString(), repo: 'GamerHoard', stats, nodes, edges, dataSource: ds, migrations, packages, functions, i18n, envVars };

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'graph.json'), JSON.stringify(graph, null, 2));
fs.writeFileSync(path.join(OUT, 'graph.mermaid'), buildMermaid(stats, ds));
fs.writeFileSync(path.join(OUT, 'graph.html'), buildHtml(graph));
fs.writeFileSync(path.join(OUT, 'MAP.md'), buildMap(graph));

console.log('GamerHoard knowledge graph regenerated:');
console.log('  ' + JSON.stringify(stats));
console.log('  nodes=' + nodes.length + ' edges=' + edges.length);
console.log('  -> graph.json / graph.html / graph.mermaid / MAP.md in ' + toPosix(rel(OUT)));

// ============================================================================= MERMAID
function buildMermaid(s, ds) {
  const L = [];
  L.push('%% GamerHoard architecture — auto-generated by docs/knowledge-graph/generate.mjs');
  L.push('flowchart TD');
  L.push('  User([User])');
  L.push('  subgraph UI["UI · Expo Router (' + s.routes + ' screens)"]');
  L.push('    Tabs["(tabs): Games · Explore · Profile"]');
  L.push('    Detail["Detail fiches: game · studio · list · u/handle"]');
  L.push('    Settings["Settings · account · moderation · legal"]');
  L.push('  end');
  L.push('  subgraph DATA["Data layer · DataSource contract (' + s.methods + ' methods)"]');
  L.push('    DS{{"DataSource (types.ts)"}}');
  L.push('    Local["LocalSource · SQLite (native)"]');
  L.push('    Mem["MemorySource · localStorage (web)"]');
  L.push('    Sup["SupabaseSource · cloud"]');
  L.push('  end');
  L.push('  subgraph EXT["External metadata (cached)"]');
  L.push('    RAWG[/RAWG/]');
  L.push('    Steam[/Steam/]');
  L.push('  end');
  L.push('  subgraph CLOUD["Supabase (default backend)"]');
  L.push('    PG[("Postgres · ' + s.tables + ' tables · ' + s.migrations + ' migrations")]');
  L.push('    Auth["Auth"]');
  L.push('    Store["Storage · avatars"]');
  L.push('    Fn["Edge Fn · steam-auth"]');
  L.push('  end');
  L.push('  IMP["Steam import · owned games + playtime"]');
  L.push('  User --> UI');
  L.push('  Tabs --> DS');
  L.push('  Detail --> DS');
  L.push('  Settings --> DS');
  L.push('  DS -->|default = supabase| Sup');
  L.push('  DS -->|EXPO_PUBLIC_BACKEND=local · native| Local');
  L.push('  DS -->|local · web| Mem');
  L.push('  Sup --> PG');
  L.push('  Sup --> Auth');
  L.push('  Sup --> Store');
  L.push('  Sup --> Fn');
  L.push('  Detail --> RAWG');
  L.push('  IMP -->|Sign in through Steam| Fn');
  L.push('  Fn --> Steam');
  L.push('  IMP -->|addSteamGame| DS');
  L.push('  RAWG -.enrich.-> IMP');
  return L.join('\n') + '\n';
}

// ============================================================================= MAP.md
function mdTable(headers, rows) {
  const h = '| ' + headers.join(' | ') + ' |';
  const sep = '| ' + headers.map(() => '---').join(' | ') + ' |';
  const body = rows.map((r) => '| ' + r.map((c) => String(c == null ? '' : c).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |').join('\n');
  return [h, sep, body].join('\n');
}
function grpMethods(methods) {
  const buckets = [
    ['Lifecycle & import', ['ready', 'clearData', 'reimport', 'importData']],
    ['Reads — library', ['getProfile', 'getContinueWatching', 'getShows', 'getShowById', 'getMovies', 'getUpcomingMovies', 'getMovieByUuid', 'getReviews', 'getBadges', 'getFavorites', 'getFavoriteMovies', 'getRecent']],
    ['Lists', ['getLists', 'getListById', 'getListItems', 'createList', 'renameList', 'deleteList', 'addToList', 'removeFromList']],
    ['Play state & progress (game / DLCs)', ['logRecent', 'setShowState', 'markWatched', 'setProgress', 'getWatchedEpisodes', 'seedEpState', 'setEpisodeWatched', 'setEpisodesWatchedBulk', 'setShowNextAir']],
    ['Replay', ['rewatchMovie', 'rewatchEpisode', 'getEpisodeRewatches']],
    ['Library membership', ['addShow', 'addMovie', 'setMovieWatched', 'removeShow', 'removeMovie', 'isShowInLibrary', 'isMovieInLibrary']],
    ['Metadata & posters', ['setShowMeta', 'setShowPoster', 'setShowGenres', 'setMoviePoster', 'setMovieGenres', 'setMovieReleaseDate', 'setMovieTmdbId', 'getUncheckedPendientes', 'markMovieChecked']],
    ['Games — platforms · Steam · rating · notes', ['setOwnedPlatforms', 'setPlatforms', 'addSteamGame', 'setShowRating', 'setShowNotes']],
    ['Favorites', ['setShowFavorite', 'setMovieFavorite']],
  ];
  const known = new Set(buckets.flatMap((b) => b[1]));
  const map = new Map(methods.map((m) => [m.name, m]));
  const out = [];
  for (const [title, names] of buckets) {
    const rows = names.filter((n) => map.has(n)).map((n) => methodRow(map.get(n)));
    if (rows.length) out.push({ title, rows });
  }
  const others = methods.filter((m) => !known.has(m.name));
  if (others.length) out.push({ title: 'Other', rows: others.map(methodRow) });
  return out;
}
function methodRow(m) {
  const c = (b) => (b ? '✅' : '—');
  return ['`' + m.name + '`', c(m.cov.local), c(m.cov.memory), c(m.cov.supabase)];
}
function buildMap(g) {
  const s = g.stats;
  const P = [];
  P.push('# GamerHoard — Living Knowledge Graph');
  P.push('');
  P.push('> Auto-generated map of the codebase. Regenerate with `node docs/knowledge-graph/generate.mjs` (or `npm run graph`).');
  P.push('> Last generated: **' + g.generatedAt + '**');
  P.push('');
  P.push('Open **`graph.html`** in a browser for the interactive, clickable version. This file is the readable companion.');
  P.push('');
  P.push('## What this app is (60-second orientation)');
  P.push('');
  P.push('GamerHoard is a cross-platform (iOS / Android / web, one Expo Router codebase) video-game tracker — a fork of Watch Hoard repurposed from TV to games. You build a library of games, track their state (**Pendiente · Jugando · Pausado · Completado**), tick off **DLCs/expansions**, mark which **platforms** you own each game on, rate them and keep private notes. Metadata comes from **RAWG** (cached); the hero import is your **Steam** library (owned games + playtime), handled server-side by the `steam-auth` Edge Function.');
  P.push('');
  P.push('**Inherited names, new meaning (read this or you WILL be confused):** GamerHoard keeps Watch Hoard\'s schema names to minimise churn. A **`show` / `tvdb_id` is a GAME** (RAWG id; Steam games use `2_000_000_000 + appid`), an **`episode` is a DLC/expansion**, **`network` is the studio/publisher**, and the `movie*` methods are largely legacy. `src/tmdb.ts` is a shim that re-exports `src/rawg.ts`.');
  P.push('');
  P.push('**The one abstraction that matters:** every screen talks to a single `DataSource` interface (`apps/mobile/src/db/types.ts`, ' + s.methods + ' methods). Three interchangeable implementations satisfy it — `LocalSource` (SQLite, native), `MemorySource` (localStorage, web), `SupabaseSource` (cloud). The active one is chosen at load time by `EXPO_PUBLIC_BACKEND` in `src/db/index.ts` (native) / `index.web.ts` (web); **cloud is the default and only an explicit `local` opts out.** **If you add a data operation, you implement it in all three.**');
  P.push('');
  // stats
  P.push('## At a glance');
  P.push('');
  P.push(mdTable(['Metric', 'Count'], [
    ['Screens (routes)', s.routes], ['Layouts / special files', s.layouts],
    ['Source modules', s.modules], ['DataSource methods', s.methods],
    ['Supabase migrations', s.migrations], ['DB tables (created)', s.tables],
    ['Edge Functions', s.functions], ['External APIs', s.apis],
    ['Languages (i18n)', s.languages + ' (' + s.i18nKeys + ' keys)'],
    ['Graph nodes / edges', g.nodes.length + ' / ' + g.edges.length],
  ]));
  P.push('');
  P.push('## Architecture');
  P.push('');
  P.push('```mermaid');
  P.push(buildMermaid(s, g.dataSource).trim());
  P.push('```');
  P.push('');
  // routes
  P.push('## Screens (Expo Router)');
  P.push('');
  P.push('File-based routing under `apps/mobile/app/`. `(tabs)` is a layout group (not part of the URL). Some routes (`movie`, `episode`, `person`) are inherited from Watch Hoard and may be legacy.');
  P.push('');
  const routes = g.nodes.filter((n) => n.type === 'route' && n.kind === 'route').sort((a, b) => a.url.localeCompare(b.url));
  P.push(mdTable(['Route', 'File', 'What it is'], routes.map((r) => ['`' + r.url + '`', '`' + r.file.replace('apps/mobile/app/', '') + '`', r.desc || ''])));
  P.push('');
  // modules by area
  P.push('## Source modules by area');
  P.push('');
  const areas = [
    ['data', 'Data layer (`src/db/`) — the DataSource contract + backends'],
    ['auth', 'Auth & session (`src/auth/`)'],
    ['import', 'In-app importer (`src/import/`)'],
    ['feature', 'Feature logic (`src/*.ts`) — RAWG, Steam, social, ratings, stats…'],
    ['ui', 'UI components (`src/*.tsx`)'],
    ['lib', 'Low-level libs (`src/lib/`)'],
    ['i18n', 'Internationalization (`src/i18n/`)'],
    ['core', 'Shared package (`packages/core`)'],
    ['importer', 'CLI importer (`packages/importer`)'],
  ];
  for (const [key, title] of areas) {
    const mods = g.nodes.filter((n) => n.type === 'module' && n.area === key).sort((a, b) => a.label.localeCompare(b.label));
    if (!mods.length) continue;
    P.push('### ' + title);
    P.push('');
    P.push(mdTable(['Module', 'Purpose'], mods.map((m) => ['`' + m.file.replace('apps/mobile/src/', '').replace('packages/', '') + '`', m.desc || ''])));
    P.push('');
  }
  // data contract
  P.push('## The data contract (`DataSource`)');
  P.push('');
  P.push('Every method must exist in all three backends. Coverage below is auto-checked against `local.ts` / `memory.ts` / `supabase.ts`. A `—` means the method looks missing in that backend — usually a bug or a deliberate no-op worth confirming.');
  P.push('');
  P.push('Entity/row types: ' + g.dataSource.types.map((t) => '`' + t + '`').join(', ') + '.');
  P.push('');
  for (const grp of grpMethods(g.dataSource.methods)) {
    P.push('**' + grp.title + '**');
    P.push('');
    P.push(mdTable(['Method', 'Local', 'Memory', 'Supabase'], grp.rows));
    P.push('');
  }
  // edge functions
  if (g.functions.length) {
    P.push('## Supabase Edge Functions');
    P.push('');
    P.push('Server-side Deno functions under `supabase/functions/`. They hold secrets the client must never see (e.g. the Steam Web API key) and terminate third-party auth.');
    P.push('');
    P.push(mdTable(['Function', 'What it does'], g.functions.map((f) => ['`' + f.name + '`', f.desc || ''])));
    P.push('');
  }
  // migrations
  P.push('## Database migrations & tables');
  P.push('');
  P.push('Applied in Supabase (cloud mode). `docs/supabase/APPLY_ALL.sql` bundles them. The on-device SQLite schema mirrors the `app_*` tables (see `src/db/schema.ts`). The GamerHoard-specific columns arrived in `0013` (`owned_platforms`, `platforms`, `playtime_minutes`, `steam_appid`) and `0014` (`user_rating`, `notes`).');
  P.push('');
  P.push(mdTable(['#', 'Migration', 'Creates tables', 'Functions / RPCs', 'Policies'], g.migrations.map((m) => [
    m.file.slice(0, 4), '`' + m.file + '`',
    (m.tables.length ? m.tables.join(', ') : (m.alters.length ? '(alters ' + m.alters.join(', ') + ')' : '')),
    m.funcs.join(', '), m.policies || '',
  ])));
  P.push('');
  // apis
  P.push('## External APIs');
  P.push('');
  const apis = g.nodes.filter((n) => n.type === 'api');
  const usedBy = (aid) => g.edges.filter((e) => e.to === aid && e.type === 'uses-api').map((e) => e.from.replace('mod:apps/mobile/src/', '').replace('route:', '')).slice(0, 8);
  P.push(mdTable(['API', 'Host', 'Key?', 'Used by (modules)', 'Purpose'], apis.map((a) => [
    a.label, '`' + a.host + '`', a.keyless ? 'keyless' : 'key', usedBy(a.id).map((x) => '`' + x + '`').join(', '), a.desc || '',
  ])));
  P.push('');
  // i18n + env
  P.push('## i18n & configuration');
  P.push('');
  P.push('Languages: ' + g.i18n.map((l) => l.code + ' (' + l.keys + ' keys)').join(', ') + '. Default English; EN is the source of truth — other locales are typed against it so `tsc` catches missing keys. Add strings in `src/i18n/{en,es}.ts` and reference them with the t() helper.');
  P.push('');
  if (g.envVars.length) {
    P.push('Environment variables (names only; see `.env.example`): ' + g.envVars.map((v) => '`' + v + '`').join(', ') + '.');
    P.push('');
  }
  // change recipes (baked-in durable how-tos)
  P.push('## Change recipes — "where do I edit X?"');
  P.push('');
  P.push(CHANGE_RECIPES());
  P.push('');
  P.push('## Gotchas & landmines');
  P.push('');
  P.push(GOTCHAS());
  P.push('');
  // curated injection
  const curated = read(path.join(OUT, 'CURATED.md'));
  if (curated.trim()) {
    P.push('## Curated notes');
    P.push('');
    P.push('<!-- Hand-maintained. Edit CURATED.md; the generator injects it here verbatim. -->');
    P.push('');
    P.push(curated.trim());
    P.push('');
  }
  P.push('---');
  P.push('');
  P.push('_This map is generated. Don\'t edit it by hand — edit `CURATED.md` for durable notes, or the code itself, then run `node docs/knowledge-graph/generate.mjs`._');
  return P.join('\n') + '\n';
}

function CHANGE_RECIPES() { return [
  '**Add a new data operation (e.g. a new user action that persists):**',
  '1. Add the method signature to the `DataSource` interface in `src/db/types.ts`.',
  '2. Implement it in **all three** backends: `src/db/local.ts` (SQLite), `src/db/memory.ts` (localStorage snapshot map), `src/db/supabase.ts` (cloud).',
  '3. If it needs a new column/table: add a guarded `alter table` in `LocalSource.ready()`, add/extend the localStorage map in `memory.ts`, and add a Supabase migration under `supabase/migrations/` (then regenerate `docs/supabase/APPLY_ALL.sql`). Follow the `0013`/`0014` pattern and degrade gracefully if the migration isn\'t applied yet. Bump the SQLite DB version / web storage key if the shape changes and a reseed is needed.',
  '4. Call it from the screen. The coverage table above should show ✅✅✅ after — re-run the generator to confirm.',
  '',
  '**Add a new screen:** create `apps/mobile/app/<route>.tsx` (or `app/<group>/[param].tsx` for dynamic). Expo Router picks it up by filename. Add nav from wherever it should be reachable, add its strings to i18n, and (if new route) it appears in the graph on regenerate. `.expo/types/router.d.ts` regenerates on `expo start -c`.',
  '',
  '**Add a language:** create `src/i18n/<code>.ts` typed as the EN dict, register it in `src/i18n/index.ts` (`LANGS`, `resources`, `addResourceBundle`), and it shows up in the language picker.',
  '',
  '**Add / change game metadata (RAWG):** work in `src/rawg.ts` (the RAWG client — cached, deduped). It intentionally keeps the old TMDB export names (`showDetails`, `detailsById`, …) so screens keep compiling; new code should prefer the game aliases (`gameImg`, `searchGames`, …). If you add a new fetched host, register it in the `API_SIGNS` array of `generate.mjs` so the graph tracks it.',
  '',
  '**Touch the Steam import:** client flow is `src/steam.ts`; the actual API calls + secret live in the `supabase/functions/steam-auth` Edge Function. Never put the Steam Web API key in the client. Owned games become library rows via `addSteamGame` (`tvdb_id = STEAM_ID_OFFSET + appid`).',
  '',
  '**Add a Supabase-only feature (social, moderation…):** write the migration (tables + RLS + `security definer` RPCs), mirror the client calls in `src/social.ts` / `src/moderation.ts`, gate the UI behind `isCloud` from `src/lib/backend.ts`. RLS must be enforcement-tested with a non-superuser role.',
].join('\n'); }

function GOTCHAS() { return [
  '- **Inherited names, new semantics.** `show`/`tvdb_id` = **game**, `episode`/`ep_state` = **DLC**, `network` = **studio/publisher**; `movie*` methods are mostly legacy. `src/tmdb.ts` re-exports `src/rawg.ts`. Grep results for "show"/"episode" are almost always about games/DLCs.',
  '- **Three backends, one contract.** Forgetting one of `local`/`memory`/`supabase` is the most common bug. The coverage table catches it.',
  '- **Cloud is the DEFAULT.** `src/lib/backend.ts` resolves to `supabase` unless `EXPO_PUBLIC_BACKEND=local`; login is always required. `app.config.js` bakes *public* defaults (Supabase URL + anon key + RAWG key) so CI/Cloudflare builds boot even with no `.env`. Never bake server secrets there.',
  '- **Steam IDs are offset.** A Steam-imported game\'s library id is `STEAM_ID_OFFSET (2_000_000_000) + appid` to avoid clashing with RAWG ids. Use `isSteamId` / `appidOf` from `src/steam.ts`.',
  '- **Steam import is server-side.** Default path is "Sign in through Steam" (OpenID) via the `steam-auth` Edge Function — no client key, no CORS proxy. `api.steampowered.com` sends no CORS headers, so never call it straight from web.',
  '- **Web vs native split:** `src/db/index.ts` (native, SQLite) vs `src/db/index.web.ts` (web, Memory) keep `expo-sqlite` out of the web bundle. Never import `./local` from web code.',
  '- **Root package.json scope drift.** The repo-root `package.json` still targets `@watchhoard/mobile` in its `mobile`/`web` scripts, but the app workspace is `@gamerhoard/mobile` — those root scripts won\'t resolve. Run from `apps/mobile` (`npx expo start`) or fix the workspace scope.',
  '- **Secrets live in `.env` (gitignored), never the repo.** App reads `apps/mobile/.env` / the root `.env` (`EXPO_PUBLIC_*`); server scripts + the Edge Function read service/Steam secrets set out-of-band.',
  '- **On this Cowork mount, git write commands can corrupt `.git`** — do git only on the real machine. A stale `.git/index.lock` sometimes lingers and blocks VS Code\'s git; delete it on the machine if git gets stuck.',
].join('\n'); }

// ============================================================================= HTML EXPLORER
function buildHtml(g) {
  const payload = { nodes: g.nodes, edges: g.edges, stats: g.stats, generatedAt: g.generatedAt };
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GamerHoard · Knowledge Graph</title>
<style>
  :root{ --bg:#0b0e14; --panel:#11151f; --line:#1e2432; --ink:#e6e9ef; --dim:#8891a3; --gold:#66c0f4; }
  *{ box-sizing:border-box; }
  html,body{ margin:0; height:100%; background:var(--bg); color:var(--ink);
    font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; overflow:hidden; }
  #app{ display:flex; height:100vh; }
  #panel{ width:264px; flex:0 0 264px; background:var(--panel); border-right:1px solid var(--line);
    padding:14px; overflow:auto; }
  #panel h1{ font-size:15px; margin:0 0 2px; letter-spacing:.2px; }
  #panel h1 b{ color:var(--gold); }
  .sub{ color:var(--dim); font-size:11px; margin-bottom:12px; }
  .chips{ display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
  .chip{ background:#161b27; border:1px solid var(--line); border-radius:20px; padding:3px 9px; font-size:11px; color:var(--dim); }
  .chip b{ color:var(--ink); }
  input#q{ width:100%; padding:8px 10px; background:#0d1119; border:1px solid var(--line); border-radius:8px;
    color:var(--ink); font-size:12px; margin-bottom:14px; }
  input#q::placeholder{ color:#5c6577; }
  .sec{ font-size:10px; text-transform:uppercase; letter-spacing:.8px; color:#5c6577; margin:12px 0 6px; }
  label.row{ display:flex; align-items:center; gap:8px; padding:3px 0; cursor:pointer; font-size:12px; }
  label.row .dot{ width:10px; height:10px; border-radius:50%; flex:0 0 10px; }
  label.row .n{ margin-left:auto; color:#5c6577; font-size:11px; }
  #stageWrap{ flex:1; position:relative; }
  svg#stage{ width:100%; height:100%; display:block; cursor:grab; }
  svg#stage:active{ cursor:grabbing; }
  #tip{ position:absolute; pointer-events:none; background:#0d1119ee; border:1px solid var(--line);
    border-radius:8px; padding:7px 10px; font-size:11px; max-width:260px; color:var(--ink); display:none; z-index:9; box-shadow:0 6px 24px #0008; }
  #tip .t{ color:var(--gold); font-weight:600; margin-bottom:2px; }
  #tip .m{ color:var(--dim); }
  #details{ position:absolute; right:12px; top:12px; width:300px; max-height:calc(100% - 24px); overflow:auto;
    background:#0d1119f2; border:1px solid var(--line); border-radius:12px; padding:14px; display:none; z-index:8; box-shadow:0 8px 30px #0009; }
  #details h2{ font-size:14px; margin:0 0 2px; color:var(--gold); word-break:break-word; }
  #details .k{ color:#5c6577; font-size:10px; text-transform:uppercase; letter-spacing:.6px; margin:12px 0 4px; }
  #details .path{ font-family:ui-monospace,Menlo,Consolas,monospace; font-size:11px; color:#9fb2d0; word-break:break-all; }
  #details .d{ color:var(--dim); font-size:12px; margin-top:6px; }
  #details ul{ margin:4px 0 0; padding-left:16px; }
  #details li{ font-size:11px; margin:2px 0; cursor:pointer; color:#c3ccdb; }
  #details li:hover{ color:var(--gold); }
  #close{ position:absolute; right:10px; top:8px; color:#5c6577; cursor:pointer; font-size:16px; }
  .hint{ position:absolute; left:12px; bottom:10px; color:#454e60; font-size:11px; pointer-events:none; }
</style>
</head>
<body>
<div id="app">
  <div id="panel">
    <h1>Gamer<b>Hoard</b> · graph</h1>
    <div class="sub" id="gen"></div>
    <div class="chips" id="chips"></div>
    <input id="q" placeholder="Search files, routes, tables…" autocomplete="off">
    <div class="sec">Node types</div>
    <div id="types"></div>
    <div class="sec">Areas</div>
    <div id="areas"></div>
    <label class="row" style="margin-top:12px"><input type="checkbox" id="lbl"> <span>Show all labels</span></label>
  </div>
  <div id="stageWrap">
    <svg id="stage"></svg>
    <div id="tip"></div>
    <div id="details"><span id="close">×</span><div id="dbody"></div></div>
    <div class="hint">drag nodes · scroll to zoom · drag background to pan · click a node to focus</div>
  </div>
</div>
<script>
var DATA = ${json};
(function(){
  var SVGNS='http://www.w3.org/2000/svg';
  function mk(t){ return document.createElementNS(SVGNS,t); }
  function el(id){ return document.getElementById(id); }
  var AREA={ route:'#66c0f4', data:'#4ea1ff', feature:'#7bd88f', ui:'#c792ea', auth:'#ff9e64', import:'#f78c6c', i18n:'#64d2ff', lib:'#8a8f98', api:'#ff6b9d', db:'#ffcb6b', edge:'#f5c518', core:'#9ece6a', importer:'#b48ead' };
  var AREANAME={ route:'Screens', data:'Data layer', feature:'Feature logic', ui:'UI components', auth:'Auth', import:'Importer (app)', i18n:'i18n', lib:'Libs', api:'External API', db:'Database', edge:'Edge Function', core:'core pkg', importer:'importer pkg' };
  function color(n){ return AREA[n.area]||'#9aa5b8'; }

  var nodes = DATA.nodes.map(function(n){ return Object.assign({},n); });
  var byId={}; nodes.forEach(function(n){ byId[n.id]=n; });
  var edges = DATA.edges.filter(function(e){ return byId[e.from] && byId[e.to]; });
  var adj={}; nodes.forEach(function(n){ adj[n.id]=[]; });
  edges.forEach(function(e){ adj[e.from].push({id:e.to,type:e.type,dir:'out'}); adj[e.to].push({id:e.from,type:e.type,dir:'in'}); });

  var svg=el('stage');
  var rect=svg.getBoundingClientRect();
  var W=rect.width||1000, H=rect.height||700;
  var view=mk('g'); svg.appendChild(view);
  var gE=mk('g'); view.appendChild(gE);
  var gN=mk('g'); view.appendChild(gN);

  nodes.forEach(function(n){ n.x=W/2+(Math.random()-0.5)*W*0.7; n.y=H/2+(Math.random()-0.5)*H*0.7; n.vx=0; n.vy=0;
    n.r=4+Math.min(15, Math.sqrt((n.deg||1))*2.3); });

  var lineEls=edges.map(function(e){ var l=mk('line');
    l.setAttribute('stroke', e.type==='uses-api'?'#ff6b9d':(e.type==='defines'?'#ffcb6b':(e.type==='calls'?'#f5c518':'#2b3346')));
    l.setAttribute('stroke-width', e.type==='imports'?0.7:1.1);
    if(e.type!=='imports') l.setAttribute('stroke-dasharray','3,3');
    l.setAttribute('opacity',0.45); gE.appendChild(l); e._el=l; return l; });

  var sel=null;
  var nodeEls=nodes.map(function(n){ var c=mk('circle'); c.setAttribute('r',n.r);
    c.setAttribute('fill',color(n)); c.setAttribute('stroke','#0b0e14'); c.setAttribute('stroke-width',1.2);
    c.style.cursor='pointer';
    c.addEventListener('mouseenter',function(ev){ tip(n,ev); }); c.addEventListener('mousemove',function(ev){ moveTip(ev); });
    c.addEventListener('mouseleave',hideTip);
    c.addEventListener('mousedown',function(ev){ ev.stopPropagation(); startDrag(n,ev); });
    c.addEventListener('click',function(ev){ ev.stopPropagation(); if(!n._moved) select(n); n._moved=false; });
    gN.appendChild(c); n._el=c; return c; });

  var labelEls=nodes.map(function(n){ var t=mk('text'); t.textContent=shortLabel(n);
    t.setAttribute('font-size',9); t.setAttribute('fill','#c8ccd4'); t.setAttribute('text-anchor','middle');
    t.setAttribute('pointer-events','none'); t.setAttribute('paint-order','stroke'); t.setAttribute('stroke','#0b0e14'); t.setAttribute('stroke-width',2.4);
    gN.appendChild(t); n._lbl=t; return t; });

  function shortLabel(n){
    if(n.type==='route') return n.url||n.label;
    if(n.type==='api') return n.label;
    if(n.type==='function') return 'fn:'+n.label;
    if(n.type==='migration') return (n.label||'').slice(0,4);
    if(n.type==='table') return n.label;
    if(n.type==='package') return n.label;
    var f=(n.file||n.label||'').split('/'); return f[f.length-1];
  }

  // ---- force sim
  var alpha=1, cooling=true;
  function step(){
    var REP=900, SPRING=0.03, LEN=46, GRAV=0.015;
    for(var i=0;i<nodes.length;i++){ var a=nodes[i]; if(a===drag) continue;
      for(var j=i+1;j<nodes.length;j++){ var b=nodes[j];
        var dx=a.x-b.x, dy=a.y-b.y, d2=dx*dx+dy*dy+0.01; var d=Math.sqrt(d2);
        var f=REP/d2; var fx=f*dx/d, fy=f*dy/d;
        a.vx+=fx; a.vy+=fy; b.vx-=fx; b.vy-=fy;
      }
    }
    edges.forEach(function(e){ var a=byId[e.from], b=byId[e.to];
      var dx=b.x-a.x, dy=b.y-a.y; var d=Math.sqrt(dx*dx+dy*dy)+0.01;
      var f=SPRING*(d-LEN); var fx=f*dx/d, fy=f*dy/d;
      if(a!==drag){ a.vx+=fx; a.vy+=fy; } if(b!==drag){ b.vx-=fx; b.vy-=fy; }
    });
    nodes.forEach(function(n){ if(n===drag) return;
      n.vx+=(W/2-n.x)*GRAV*0.1; n.vy+=(H/2-n.y)*GRAV*0.1;
      n.vx*=0.86; n.vy*=0.86; n.x+=n.vx*alpha; n.y+=n.vy*alpha;
    });
    if(cooling){ alpha*=0.985; if(alpha<0.03){ alpha=0.03; cooling=false; } }
    render();
  }
  function render(){
    edges.forEach(function(e){ var a=byId[e.from], b=byId[e.to]; e._el.setAttribute('x1',a.x); e._el.setAttribute('y1',a.y); e._el.setAttribute('x2',b.x); e._el.setAttribute('y2',b.y); });
    nodes.forEach(function(n){ n._el.setAttribute('cx',n.x); n._el.setAttribute('cy',n.y);
      if(n._lbl.style.display!=='none'){ n._lbl.setAttribute('x',n.x); n._lbl.setAttribute('y',n.y-n.r-3); } });
  }
  var showAll=false;
  function updateLabels(){
    nodes.forEach(function(n){ var on = showAll || n.type==='api' || n.type==='function' || (n.deg||0)>=9 || n===sel || (sel&&adj[sel.id].some(function(x){return x.id===n.id;}));
      n._lbl.style.display = (on && n._vis!==false) ? '' : 'none'; });
  }
  function loop(){ step(); requestAnimationFrame(loop); }
  loop();

  // ---- zoom / pan
  var tx=0, ty=0, sc=1;
  function applyView(){ view.setAttribute('transform','translate('+tx+','+ty+') scale('+sc+')'); }
  svg.addEventListener('wheel',function(ev){ ev.preventDefault(); var r=svg.getBoundingClientRect();
    var mx=ev.clientX-r.left, my=ev.clientY-r.top; var f=ev.deltaY<0?1.12:0.89; var ns=Math.max(0.2,Math.min(4,sc*f));
    tx=mx-(mx-tx)*(ns/sc); ty=my-(my-ty)*(ns/sc); sc=ns; applyView(); },{passive:false});
  var panning=false, px=0, py=0;
  svg.addEventListener('mousedown',function(ev){ panning=true; px=ev.clientX; py=ev.clientY; deselect(); });
  window.addEventListener('mousemove',function(ev){
    if(drag){ var p=toGraph(ev); drag.x=p.x; drag.y=p.y; drag.vx=0; drag.vy=0; drag._moved=true; alpha=Math.max(alpha,0.3); cooling=true; return; }
    if(panning){ tx+=ev.clientX-px; ty+=ev.clientY-py; px=ev.clientX; py=ev.clientY; applyView(); }
  });
  window.addEventListener('mouseup',function(){ panning=false; if(drag){ drag=null; } });
  function toGraph(ev){ var r=svg.getBoundingClientRect(); return { x:(ev.clientX-r.left-tx)/sc, y:(ev.clientY-r.top-ty)/sc }; }

  // ---- drag node
  var drag=null;
  function startDrag(n,ev){ drag=n; n._moved=false; }

  // ---- tooltip
  var tipEl=el('tip');
  function tip(n,ev){ tipEl.innerHTML='<div class="t">'+esc(shortLabel(n))+'</div><div class="m">'+esc(n.type+(n.area&&AREANAME[n.area]?' · '+AREANAME[n.area]:''))+'</div>'+(n.desc?'<div style="margin-top:4px">'+esc(n.desc)+'</div>':''); tipEl.style.display='block'; moveTip(ev); }
  function moveTip(ev){ var r=svg.getBoundingClientRect(); tipEl.style.left=(ev.clientX-r.left+14)+'px'; tipEl.style.top=(ev.clientY-r.top+14)+'px'; }
  function hideTip(){ tipEl.style.display='none'; }

  // ---- selection + details
  function select(n){ sel=n; var nb={}; adj[n.id].forEach(function(x){ nb[x.id]=x; });
    nodes.forEach(function(m){ var on = m===n || nb[m.id]; m._el.setAttribute('opacity', on?1:0.12); m._el.setAttribute('stroke', m===n?'#fff':'#0b0e14'); m._el.setAttribute('stroke-width', m===n?2.4:1.2); });
    edges.forEach(function(e){ var on = e.from===n.id||e.to===n.id; e._el.setAttribute('opacity', on?0.9:0.04); });
    updateLabels(); showDetails(n);
  }
  function deselect(){ if(!sel) return; sel=null; nodes.forEach(function(m){ m._el.setAttribute('opacity',1); m._el.setAttribute('stroke','#0b0e14'); m._el.setAttribute('stroke-width',1.2); }); edges.forEach(function(e){ e._el.setAttribute('opacity',0.45); }); el('details').style.display='none'; updateLabels(); }
  el('close').addEventListener('click',deselect);
  function showDetails(n){
    var d=el('dbody'); var out='<h2>'+esc(shortLabel(n))+'</h2>';
    out+='<div class="path" style="color:'+color(n)+'">'+esc(n.type)+(n.area?' · '+esc(AREANAME[n.area]||n.area):'')+'</div>';
    if(n.file){ out+='<div class="k">File</div><div class="path">'+esc(n.file)+'</div>'; }
    if(n.url){ out+='<div class="k">Route</div><div class="path">'+esc(n.url)+'</div>'; }
    if(n.host){ out+='<div class="k">Host</div><div class="path">'+esc(n.host)+(n.keyless?' (keyless)':' (needs key)')+'</div>'; }
    if(n.tables&&n.tables.length){ out+='<div class="k">Creates tables</div><div class="path">'+esc(n.tables.join(', '))+'</div>'; }
    if(n.funcs&&n.funcs.length){ out+='<div class="k">Functions</div><div class="path">'+esc(n.funcs.join(', '))+'</div>'; }
    if(n.desc){ out+='<div class="d">'+esc(n.desc)+'</div>'; }
    var outs=adj[n.id].filter(function(x){return x.dir==='out';});
    var ins=adj[n.id].filter(function(x){return x.dir==='in';});
    if(outs.length){ out+='<div class="k">Imports / uses ('+outs.length+')</div><ul>'+outs.slice(0,40).map(function(x){ return '<li data-id="'+esc(x.id)+'">'+esc(shortLabel(byId[x.id]))+'<span style="color:#5c6577"> · '+x.type+'</span></li>'; }).join('')+'</ul>'; }
    if(ins.length){ out+='<div class="k">Used by ('+ins.length+')</div><ul>'+ins.slice(0,40).map(function(x){ return '<li data-id="'+esc(x.id)+'">'+esc(shortLabel(byId[x.id]))+'</li>'; }).join('')+'</ul>'; }
    d.innerHTML=out; el('details').style.display='block';
    Array.prototype.forEach.call(d.querySelectorAll('li[data-id]'),function(li){ li.addEventListener('click',function(){ var t=byId[li.getAttribute('data-id')]; if(t) select(t); }); });
  }
  svg.addEventListener('click',deselect);

  // ---- filters
  var typeSet={}, areaSet={};
  nodes.forEach(function(n){ typeSet[n.type]=(typeSet[n.type]||0)+1; areaSet[n.area]=(areaSet[n.area]||0)+1; });
  var typeOn={}, areaOn={};
  Object.keys(typeSet).forEach(function(t){ typeOn[t]=true; });
  Object.keys(areaSet).forEach(function(a){ areaOn[a]=true; });
  function buildFilters(){
    var tp=el('types'); tp.innerHTML='';
    Object.keys(typeSet).sort().forEach(function(t){ tp.appendChild(filterRow('t',t,t,'#8891a3',typeSet[t])); });
    var ar=el('areas'); ar.innerHTML='';
    Object.keys(areaSet).sort(function(a,b){return areaSet[b]-areaSet[a];}).forEach(function(a){ ar.appendChild(filterRow('a',a,AREANAME[a]||a,AREA[a]||'#9aa5b8',areaSet[a])); });
  }
  function filterRow(kind,key,name,col,count){ var l=document.createElement('label'); l.className='row';
    var cb=document.createElement('input'); cb.type='checkbox'; cb.checked=true;
    cb.addEventListener('change',function(){ (kind==='t'?typeOn:areaOn)[key]=cb.checked; applyFilter(); });
    var dot=document.createElement('span'); dot.className='dot'; dot.style.background=col;
    var nm=document.createElement('span'); nm.textContent=name;
    var ct=document.createElement('span'); ct.className='n'; ct.textContent=count;
    l.appendChild(cb); l.appendChild(dot); l.appendChild(nm); l.appendChild(ct); return l; }
  function applyFilter(){
    nodes.forEach(function(n){ var vis=typeOn[n.type]!==false && areaOn[n.area]!==false; n._vis=vis;
      n._el.style.display=vis?'':'none'; });
    edges.forEach(function(e){ var vis=byId[e.from]._vis!==false && byId[e.to]._vis!==false; e._el.style.display=vis?'':'none'; });
    updateLabels();
  }

  // ---- search
  el('q').addEventListener('input',function(){ var q=this.value.trim().toLowerCase();
    nodes.forEach(function(n){ if(!q){ if(!sel) n._el.setAttribute('opacity', n._vis===false?0:1); n._el.setAttribute('stroke-width',1.2); return; }
      var hay=((n.file||'')+' '+(n.label||'')+' '+(n.url||'')+' '+(n.desc||'')).toLowerCase();
      var hit=hay.indexOf(q)>=0; n._el.setAttribute('opacity', hit?1:0.08); n._el.setAttribute('stroke', hit?'#fff':'#0b0e14'); n._el.setAttribute('stroke-width', hit?2.4:1.2);
      n._lbl.style.display=(hit && n._vis!==false)?'':'none'; });
    if(!q) updateLabels();
  });

  el('lbl').addEventListener('change',function(){ showAll=this.checked; updateLabels(); });

  // ---- chrome
  el('gen').textContent='generated '+(DATA.generatedAt||'').replace('T',' ').slice(0,16)+' · '+nodes.length+' nodes · '+edges.length+' edges';
  var s=DATA.stats; var chips=[['screens',s.routes],['modules',s.modules],['DataSource',s.methods+' m'],['migrations',s.migrations],['tables',s.tables],['edge fns',s.functions],['APIs',s.apis],['langs',s.languages]];
  el('chips').innerHTML=chips.map(function(c){ return '<span class="chip"><b>'+c[1]+'</b> '+c[0]+'</span>'; }).join('');
  buildFilters(); updateLabels();
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
})();
</script>
</body>
</html>`;
}
