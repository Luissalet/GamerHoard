# GamerHoard local API

`node server/index.mjs` (default `http://127.0.0.1:5207`) serves the built web client and a small REST API over the same library file as the MCP tools (`~/.gamerhoard/library.json`, or `GAMERHOARD_DATA_FILE`). Only local requests are accepted (`GAMERHOARD_ALLOWED_HOSTS` adds host names). Errors are `{ "error": "..." }` with the HTTP status.

Games are returned in the library shape plus `tvdbId`, a numeric id the web client uses: the RAWG id, `2000000000 + appid` for Steam games, or a stable hash for manual games. `:id` accepts the library id, the numeric `tvdbId`, a RAWG id or a Steam app id.

## Library

| Route | Purpose |
|-------|---------|
| `GET /api/health` | `{ ok, service: "gamerhoard", version, games, dataFile, rawg }` |
| `GET /api/config` | backend name, library path, whether a RAWG key is set |
| `GET /api/games?query&state&favorite&platform&limit&offset` | `{ total, games }` |
| `POST /api/games` | add a game (`title` required; `state`, `rawgId`, `steamAppId`, `platforms`, `genres`, `coverUrl`, `studio`, `dlcTotal`, ...). 201 when added, 200 when it already existed |
| `GET /api/games/:id` | one game with its DLC list |
| `PATCH /api/games/:id` | change `state`, `favorite`, `rating`, `notes`, `ownedPlatforms`, `platforms`, `genres`, `tags`, `progressPercent`, `coverUrl`, `studio`, `released`, `dlcTotal`, ... Only the fields sent change |
| `DELETE /api/games/:id` | remove the game |
| `PUT /api/games/:id/dlc` | `{ title, completed, number? }` mark a DLC |
| `GET /api/games/:id/sessions?from&to&limit` | play sessions of a game |
| `POST /api/games/:id/sessions` | `{ minutes, playedAt?, notes?, sessionId? }` log a session (id and time are filled in when missing) |
| `GET /api/games/:id/achievements?unlocked&query&offset&limit` | saved Steam achievements; `summary` contains the global snapshot `{ unlocked, total }` or null, while `total` counts filtered results independently of paging. `available` distinguishes an individual list from a summary-only or absent snapshot; `syncedAt` is its saved timestamp. Also returned by `gamer_achievements`. |
| `POST /api/games/:id/steam-achievements` | `{ steamId, apiKey }` refresh them (the key is not stored) |
| `GET /api/sessions?from&to&limit` | sessions of every game |
| `GET /api/stats` | library statistics |
| `GET /api/activity?from&to&limit` | activity recap |
| `GET /api/backlog?genre&platform&includePaused&limit` | backlog suggestions |
| `GET /api/export` | the whole library as JSON |
| `POST /api/import` | additive import of a library JSON |

## Catalogue and Steam

| Route | Purpose |
|-------|---------|
| `POST /api/steam/import` | `{ steamId, apiKey, syncExistingPlaytime? }`; `steamId` can be a SteamID64, a profile URL or a vanity name |
| `GET /api/catalog/search?q&limit` | RAWG search (503 without `RAWG_API_KEY`) |
| `POST /api/catalog/add` | add a RAWG game by id |
| `GET /api/rawg/<games\|genres\|platforms\|developers\|publishers>/...` | proxy to RAWG; the key is added by the server and any `key` sent by the client is dropped |

## Faustus copilot

Installed automatically by the shared server helpers after `family.configure`:

| Route | Purpose |
|-------|---------|
| `GET /api/copilot/info` | app id and name, panel URL, Faustus settings URL (503 when Faustus is not configured) |
| `GET /api/copilot/panel.js` | the `faustus-chat` element, relayed from Faustus |
| `ALL /api/copilot/proxy` | relay of the chat requests, including streaming |
| `GET /api/copilot/launcher.js` | the floating button and side panel, injected as `<script type="module">` into every HTML page |

The client side is `window.hoardCopilot` (`apps/mobile/src/copilot.ts`, context builders in `apps/mobile/src/copilotContext.ts`):

- `context(base)` returns `{ active_objects, view }`; see the table in the README. It never throws.
- `onTurnEnd(detail)` and the `hoard:copilot-turn-end` event refresh the mounted lists once (debounced) and keep unsaved form input.

`HOARD_COPILOT=0` disables the injection. `faustus-plugin.json` lists the context keys under `x-family.copilot`.

## Recovered data sources

Settings lets the web user choose the shared Faustus library, the historical browser library, or the cloud account. `EXPO_PUBLIC_BACKEND=localapi` remains the web default; `memory` and historical `local` use MemorySource on web, `local` uses SQLite on native, and `supabase` selects SupabaseSource on either platform. Cloud mode reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from configuration and uses the original login flow. Shared/browser modes neither require login nor refresh a cloud session. The cloud landing page provides a way back to the shared library.

Shared games and sessions still use the native REST/MCP library. Lists, movies and other historical browser collections reuse MemorySource and its existing localStorage keys, including persisted changes after reopening. A game can be added to a restored custom list from its detail page. Cloud social/account functions use the recovered Supabase client/schema; browser collections are not advertised as published or synced. The original Steam account flow remains available in cloud mode alongside the current manual/profile import. Native unsupported episode-counter writes report their domain limitation instead of silently reporting success.

`packages/` and `supabase/` are recovered historical source; no migrations, deployment, provider accounts or real credentials are run by this restoration. iOS/Android runtime and real cloud connectivity need their configured environment; typechecking and deterministic client contract fixtures are separate from such live validation.

Copilot context identifies the selected backend. Real custom lists are read through the active DataSource; missing/new lists yield no object. Profile metadata is read from the active source. Games in original sources retain their actual numeric IDs, without inventing native shared-library UUIDs. The R2 stable snapshot, empty-filter and dirty-note fixes are retained.
