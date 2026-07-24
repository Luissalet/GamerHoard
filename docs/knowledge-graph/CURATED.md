> Hand-maintained durable knowledge that the generator can't read from code.
> Edit this file freely; `generate.mjs` injects it verbatim into `MAP.md`.

### North star & positioning
GamerHoard is a cross-platform **video-game tracker** — a fork of **Watch Hoard** repurposed from TV/movies to games. You build a library of games, set each one's state (**Pendiente · Jugando · Pausado · Completado**), tick off **DLCs/expansions**, record which **platforms** you own each game on, give it your own rating (1–10, shown as 5 stars) and private notes. Metadata comes from **RAWG** (https://rawg.io); the hero onboarding is importing your **Steam** library (owned games + hours played). See `GAMERHOARD.md` for the product tour (in Spanish).

### Inherited names, new semantics — the thing that trips everyone up
To minimise churn against the Watch Hoard base, GamerHoard **kept the old schema/method names** and gave them game meaning. Internalise this map or every grep result will mislead you:

| Code name | Actually means |
| --- | --- |
| `show` / `ShowRow` / `tvdb_id` | **a game** (id = RAWG id; Steam-imported games use `2_000_000_000 + appid`) |
| `episode` / `ep_state` / `watched_episodes` | **a DLC / expansion** (same checklist UI) |
| `network` | **studio / publisher** |
| `season` | **DLC group** |
| "where to watch" | **where to play** (stores: Steam, PSN, Xbox, GOG…) |
| TMDB rating | **Metacritic** (+ link-outs to OpenCritic, HowLongToBeat…) |
| `movie*` methods/routes, `person`, `episode/[key]` | **largely legacy** from Watch Hoard; games flow through the `show`/game paths |
| `src/tmdb.ts` | a **shim** that re-exports `src/rawg.ts` so old imports keep compiling |

New game code should prefer the friendly aliases at the bottom of `rawg.ts` (`gameImg`, `searchGames`, …) over the inherited TMDB-style names.

### Runtime modes (note: cloud is the DEFAULT here)
Unlike Watch Hoard, GamerHoard is **cloud-first**. `src/lib/backend.ts` resolves the backend to `supabase` **unless** `EXPO_PUBLIC_BACKEND=local` is set explicitly; **login is always required** either way.
- **Cloud (default)** → `SupabaseSource`. Accounts + library sync + the whole social/moderation layer.
- **Local opt-out** (`EXPO_PUBLIC_BACKEND=local`) → native = `LocalSource` (SQLite), web = `MemorySource` (localStorage). On-device, no cloud.
- `app.config.js` bakes **public** client defaults (Supabase URL + publishable anon key + RAWG key) so a build always boots — even with no `.env` (e.g. the Cloudflare CI build, where `.env` is gitignored). **Never** put server secrets (service_role, Steam key, etc.) there.

### Game states (the state machine)
`src/categories.ts` is the source of truth. Stored `state` → UI bucket:
- `backlog` → **not_started** (Pendiente)
- `watching` → **watching** (Jugando)
- `stopped` → **paused** (Pausado)
- `archived` → **finished** (Completado)

DLC completion drives the progress bar; a game with DLCs shows how many you own/finished, otherwise a half bar while playing.

### Steam import — the must-knows
Steam is the hero import (replaces Watch Hoard's TV Time import). It runs **server-side** through the `steam-auth` Supabase Edge Function so no Steam key or CORS proxy ever touches the client:
- **Default path:** "Sign in through Steam" (OpenID) — `importSteamLibrary()`. No key, no typing. Needs the user's Steam **"Game details" privacy = Public**.
- **Fallback (private profiles):** `importSteamManual()` — the user pastes their own Steam Web API key + profile; a key can read its owner's library even when private. The key is sent to the function once, never stored server-side.
- **ID offset:** a Steam game's library id = `STEAM_ID_OFFSET (2_000_000_000) + appid` to avoid clashing with RAWG ids. Use `isSteamId` / `appidOf` from `src/steam.ts`.
- **State from playtime:** never played → `backlog`; played in the last 90 days → `watching`; older → `stopped`.
- **CORS:** `api.steampowered.com` sends no CORS headers — never call it straight from web; that's why the Edge Function exists.
- **Function secrets** (set out-of-band, not in `.env`): `STEAM_WEB_API_KEY` (https://steamcommunity.com/dev/apikey), `STEAM_AUTH_SECRET` (HMAC-signs the SteamID between login and fetch), optional `STEAM_ALLOWED_HOSTS` (allowed web redirect hosts).

### RAWG client (`src/rawg.ts`)
Read-only, in-flight deduped, two-tier cache (L1 memory → L2 AsyncStorage/IndexedDB, 24h TTL), 12s timeout. Base `https://api.rawg.io/api`, key from `EXPO_PUBLIC_RAWG_KEY`. Keeps the old TMDB export names on purpose so screens keep compiling; remaps semantics to games (see the table above).

### Database
Supabase Postgres (cloud). `docs/supabase/APPLY_ALL.sql` bundles every migration for the SQL Editor; individual migrations live in `supabase/migrations/`. The GamerHoard-specific columns were added late on `app_shows`:
- **0013** — `owned_platforms`, `platforms`, `playtime_minutes`, `steam_appid`
- **0014** — `user_rating`, `notes`

New Supabase methods (`setOwnedPlatforms`, `setPlatforms`, `addSteamGame`, `setShowRating`, `setShowNotes`) degrade gracefully if 0013/0014 aren't applied yet. The on-device SQLite schema mirrors the `app_*` tables (`src/db/schema.ts`), with guarded `alter table`s in `LocalSource.ready()`.

### Deploy / infra
- **Web deploy = Cloudflare Worker** (source: repo-root `deployment info`):
  - Build: `cd apps/mobile && npx expo export -p web`
  - Deploy (production): `cd apps/mobile && npx wrangler deploy`
  - Non-production branch: `npx wrangler versions upload`
  - `apps/mobile/wrangler.jsonc` holds the Worker config; keep the SPA fallback on or deep links 404.
- **Run locally:** `cd apps/mobile && npx expo start -c`, then press `w` (web) / `a` (Android) / `i` (iOS) — see `execinstructions.txt`. Always run from `apps/mobile`; the repo-root `npm` scripts still point at the old `@watchhoard/*` scope.
- Supabase project ref baked into `app.config.js` public defaults: `jfbvovwrmpenrbnqauxt` (URL + publishable anon key are client-safe; RLS protects data). `STEAM_ALLOWED_HOSTS` example references `gamerhoard.pages.dev`.

### Landmines
- **Root `package.json` scope drift.** The repo-root manifest still names `@watchhoard/mobile` in its `mobile`/`web` scripts, but the app workspace is `@gamerhoard/mobile` — so those root scripts won't resolve. Run from `apps/mobile` (`npx expo start`) or fix the workspace scope. (`packages/core` and `packages/importer` are also still `@watchhoard/*`.)
- **Three backends, one contract.** Any `DataSource` method must be implemented in `local.ts`, `memory.ts`, **and** `supabase.ts`. The coverage table in `MAP.md` catches a miss.
- **Web vs native split.** `src/db/index.ts` (native/SQLite) vs `src/db/index.web.ts` (web/Memory) keep `expo-sqlite` out of the web bundle. Never import `./local` from web code.
- **Git only on the real machine.** The Cowork mount can corrupt `.git` on write; a stale `.git/index.lock` sometimes lingers and blocks VS Code's git — delete it on the machine if git gets stuck.
- **Secrets in `.env` (gitignored), never the repo.** Client reads `EXPO_PUBLIC_*`; server scripts / the Edge Function read service + Steam secrets set out-of-band.

### The deep-dive docs (read these for detail)
- `docs/Watch-Hoard_TV-Time-Successor-Plan.md`, `docs/WatchHoard_Engineering-Spec_DataModel-Import-UI.md` — inherited strategy + data model / import mapping (Watch Hoard context).
- `docs/CONNECT-SUPABASE.md`, `docs/PHASE3.md`, `docs/PHASE4.md`, `docs/AUDIT-2026-07-09.md`, `docs/LOCAL.md`, `docs/IMPORT-VALIDATION.md`.
- `docs/supabase/APPLY_ALL.sql` — all migrations bundled for the SQL Editor.
- `supabase/functions/steam-auth/README.md` — the Steam auth function contract.

### Open decisions / to confirm
Confirm the deploy target + domain from `deployment info`; decide whether to fix the `@watchhoard/*` → `@gamerhoard/*` scope drift in the root/packages manifests; games achievements + a releases calendar are noted as pending in `GAMERHOARD.md`.


## Migración a Expo SDK 56 (2026-07-24) — target API 36 de Play

Play exige targetSdk 36 (Android 16) desde el 2026-08-31. GamerHoard saltó de SDK 52 a
**SDK 56** (RN 0.85, React 19.2, **Nueva Arquitectura obligatoria** — la legacy se eliminó
en SDK 55). Nota: WatchHoard quedó en SDK 54 (rama `expo-sdk54-api36`), así que los
gemelos divergen de SDK a partir de aquí.

Qué cambió (receta = la de bookhoard-v2 del mismo día):

- `app.json`: fuera `newArchEnabled` (ya no existe); el splash top-level pasó al plugin
  `expo-splash-screen` con `image` (obligatoria en SDK 56 — sin ella el build de Android
  falla con `resource drawable/splashscreen_logo not found`).
- `package.json`: deps alineadas con `npx expo install --fix`; TS `~6.0.3` +
  `@types/react ~19.2`; `react-native-reanimated@4.3.1` y `react-native-worklets@0.8.3`
  **pineados como deps directas** (los arrastra expo-router 56 con peer `*`; sin pin, npm
  coge worklets 0.11 que expo-modules-core marca invalid). `intl-pluralrules` añadido e
  importado como PRIMERA línea de `src/i18n/index.ts` (Hermes no trae Intl.PluralRules;
  sin él, las claves `_one/_other` renderizan crudas en Android — bug ya pagado en BookHoard).
- Lockfile **regenerado entero** (node_modules raíz+workspaces y package-lock borrados):
  el lock viejo dejaba módulos nativos duplicados (react 18/19, RN 0.76/0.85) — si
  expo-doctor acusa "duplicate native modules", esa es la cura.
- FlashList v2 (new-arch only): `estimatedItemSize` eliminado (8 usos en 6 archivos).
- `StyleSheet.absoluteFillObject` ya no existe en RN 0.85 → `...StyleSheet.absoluteFill`
  (account, person/[id], u/[handle]).
- Edge-to-edge obligatorio: tab bar con `height: 84 + insets.bottom` + `paddingBottom`
  en `app/(tabs)/_layout.tsx`.
- `tsconfig.json` sin `baseUrl` (deprecado en TS 6).
- **`apps/mobile/scripts/shorten-cxx.init.gradle`** (nuevo): al compilar Android, pasar
  `-I ..\scripts\shorten-cxx.init.gradle` a gradlew — mueve los `.cxx` de CMake a
  `C:\_cxx\gh\<módulo>` porque los .o replican la ruta absoluta del repo y revientan
  MAX_PATH 260 (síntoma: `ninja: manifest 'build.ninja' still dirty after 100 tries`,
  visto con react-native-worklets en bookhoard-v2). NO usar unidades `subst` como
  atajo: el codegen de RN hace `fs.realpath` y muere con "different roots".
- Avisos de expo-doctor que quedan y son esperables: (1) "app.json + app.config.js" —
  falso positivo, `app.config.js` hace spread de `appJson.expo`; (2) metro
  `disableHierarchicalLookup` — override intencional del monorepo.

Verificado: `tsc --noEmit` ✓ (con canary), `npx expo export --platform web` ✓, expo-doctor
19/21 (los 2 de arriba), knowledge graph regenerado. Pendiente (humano): build Android
release + prueba en device (edge-to-edge, Steam import, SQLite local backend en la
nueva arquitectura) y subida a Play cuando toque.
