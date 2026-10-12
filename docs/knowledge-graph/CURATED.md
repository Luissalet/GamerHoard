> Hand-maintained durable knowledge that the generator can't read from code.
> Edit this file freely; `generate.mjs` injects it verbatim into `MAP.md`.

### North star & positioning
GamerHoard is a **local, single-user video-game library**. One JSON file (`~/.gamerhoard/library.json`) is shared by a web app (served by `server/index.mjs`), the Faustus MCP tools (`mcp/server.mjs`) and, separately, a native Expo app with its own SQLite. Shared mode opens without login; historical optional cloud mode is retained and public deployment is unchanged. Metadata comes from **RAWG**; the hero import is your **Steam** library. User docs: `README.md` / `README.es.md`; REST and copilot routes: `docs/API.md`; product tour (Spanish): `GAMERHOARD.md`.

### Inherited names, new semantics — the thing that trips everyone up
The client began as an older series tracker and **kept its schema/method names** with game meaning. Internalise this map or every grep result will mislead you:

| Code name | Actually means |
| --- | --- |
| `show` / `ShowRow` / `tvdb_id` | **a game** (id = RAWG id; Steam games `2_000_000_000 + appid`; manual games `1_000_000_000 + hash`) |
| `episode` / `ep_state` / `watched_episodes` | **a DLC / expansion** (same checklist UI) |
| `network` | **studio / publisher** |
| `season` | **DLC group** |
| "where to watch" | **where to play** (stores: Steam, PSN, Xbox, GOG…) |
| TMDB rating | **Metacritic** (+ link-outs to OpenCritic, HowLongToBeat…) |
| `movie*` methods | **legacy stubs**; the web data source returns empty lists |
| `src/tmdb.ts` | a **shim** that re-exports `src/rawg.ts` so old imports keep compiling |

### Runtime modes
- **Web (default)** → `LocalApiSource` (`src/db/localapi.ts`): the browser talks to the local server, which reads and writes the shared library file. `EXPO_PUBLIC_BACKEND=memory` gives a browser-only demo.
- **Native** → `LocalSource` (SQLite on the device, seeded from `assets/seed.json`, created empty from `seed.sample.json` by `scripts/ensure-seed.js`). It does **not** read the computer's library file.
- There is no cloud backend and no login. `app.config.js` carries no keys; the RAWG key comes from the server environment (web) or `EXPO_PUBLIC_RAWG_KEY` (native builds).

### Game states
Library states `backlog | playing | paused | completed | dropped` ↔ UI states `backlog | watching | stopped | archived | dropped` (`db/localapiMap.ts`); `src/categories.ts` maps UI states to the buckets (Pendiente, Jugando, Pausado, Completado, Abandonado). DLC completion drives the progress bar. DLC are stored by title in the library; the optional `number` keeps the RAWG catalogue position so the checklist matches DLC marked through Faustus.

### Steam import — the must-knows
- Screen `app/import.tsx` → `importSteam(profile, key)` in `src/steam.ts` → web: `POST /api/steam/import` (the server calls Steam, no CORS problem); native: direct Steam Web API calls.
- The profile can be a SteamID64, a profile URL or a vanity name. The Web API key is typed by the user, remembered only in AsyncStorage/localStorage and never written to the library file or logs. Needs the profile's "Game details" set to Public.
- **ID offset:** a Steam game's id = `STEAM_ID_OFFSET (2_000_000_000) + appid`. Use `isSteamId` / `appidOf`.
- **State from playtime:** never played → `backlog`; played in the last 90 days → `playing`; older → `paused`.
- Achievements: MCP tools and `GET /api/games/:id/achievements`; no UI.

### RAWG client (`src/rawg.ts`)
Read-only, in-flight deduped, two-tier cache (memory → AsyncStorage/IndexedDB, 24h TTL), 12s timeout. Web calls go to `/api/rawg/*` (server adds the key; allow-listed paths only); native calls `https://api.rawg.io/api` with `EXPO_PUBLIC_RAWG_KEY`. Ids from 1e9 up have no RAWG record and are never requested. Keeps the old TMDB export names on purpose.

### Faustus copilot
`window.hoardCopilot` (`src/copilot.ts`) is installed from the root layout (web only). Pure builders live in `src/copilotContext.ts`; mounted screens register what they show (visible games, unsaved form fields) with `useCopilotView` (`src/copilotRegistry.ts`). `onTurnEnd` and `hoard:copilot-turn-end` call `refreshAllQueries()` (debounced) so lists refresh without remounting forms. The launcher, the relay routes and the injection come from `server/hoard-commons` (vendored family helpers).

### Landmines
- **Four data sources, one contract.** Any `DataSource` method must exist in `local.ts`, `localapi.ts`, `memory.ts` and `supabase.ts`. The coverage table in `MAP.md` catches a miss.
- **One library file, two processes.** Only `mcp/library.mjs` touches it; both processes re-read it when mtime/size changes. REST calls are serialised.
- **Web vs native split.** `src/db/index.ts` vs `src/db/index.web.ts` keep `expo-sqlite` out of the web bundle. Never import `./local` from web code.
- **Real `node_modules` for the web build.** A junction to another checkout makes `expo export` write asset paths outside `dist`.
- **Never commit** `.env`, keystores or `assets/seed.json` (personal data).

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
