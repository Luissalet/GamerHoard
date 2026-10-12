# GamerHoard

[Español](README.es.md)

A **video game library with web and native apps**. In shared local mode, the web app and MCP tools use the same JSON file (`~/.gamerhoard/library.json`). The historical browser, device and optional cloud data sources remain selectable:

- a **web app** served on your own computer (`http://127.0.0.1:5207`),
- the **MCP tools** that Faustus (or any MCP client) uses from a chat,
- an optional **native app** (Expo, SQLite on the device).

Shared local mode opens without login. Optional Supabase mode retains the original accounts and community features; the native app can use its own SQLite library. This local recovery does not change the public deployment at gamer-hoard.com. Requires Node.js 22 or newer.

## Quick start

```sh
npm run setup        # once: installs the small server dependency (Express)
npm install          # once: installs the web client toolchain
npm run build:web    # once, and after changing the client: builds apps/mobile/dist
npm run server       # starts http://127.0.0.1:5207
```

On Windows, `GamerHoard.bat` does the same and opens the browser. Optional: set `RAWG_API_KEY` (free at rawg.io/apidocs) before starting to enable the online game catalogue (search, covers, DLC lists, "where to play"). Without it the app still works with your library, notes, sessions and Steam import.

The web app and the MCP server read and write the same file and notice each other's changes: a game you mark as completed in the browser is completed for Faustus, and a session Faustus logs shows up in the browser after a refresh.

## What the web app does

- **Games**: home with "Playing now", "Almost done" and recently added, library grid by status (backlog, playing, paused, completed, dropped), search, sort (recent, A-Z, hours), favourites, genre filter and a weighted "what do I play now?" picker. Long-press a game for quick actions.
- **Game page**: one-tap status, rating (1-10), personal notes, owned platforms, DLC checklist (when RAWG knows the DLCs), **play sessions** (minutes and a note per session), Metacritic and store links, trailer, screenshots, similar games.
- **Explore**: search RAWG, trends, new releases, popular and top rated, by genre and platform; add straight to the backlog.
- **Stats and profile**: totals, hours, completion, top genres, platforms and studios, games with most DLC.
- **History**: logged sessions (with minutes) and DLC marked as done.
- **Import from Steam**: profile (vanity name, URL or SteamID64) plus your Steam Web API key. The key is remembered in the browser only; it never goes into the library file.
- **Settings**: language (English or Spanish), install as an app, export the library as JSON.

## Connect to Faustus

Faustus loads [`faustus-plugin.json`](faustus-plugin.json) with `GAMERHOARD_DIR` pointing to this repository. It declares the stdio MCP server (`mcp/server.mjs`), the web app (port 5207, health at `/api/health`, launched with `node server/index.mjs`) and the copilot. For a manual MCP client use `command: node` and `args: ["C:/path/GamerHoard/mcp/server.mjs"]`.

### Faustus copilot

Every page the server sends carries the Faustus button (bottom right). It opens the Faustus chat in a side panel and, with every message, sends the context of what you are looking at (`window.hoardCopilot.context`):

| View | What Faustus receives |
|------|----------------------|
| Game page (`/show/<id>`) | the open game as `active_objects`: library id, title, state, platforms, rating, hours, favourite, DLC done/total, studio, genres; unsaved fields in `view.editor` (notes you typed, minutes of a session not logged yet) |
| Library (`/`) | the games listed on screen (up to 8, in display order) plus the tab, status filter, genre, favourites-only and sort in `view`; the search text in `view.editor` |
| Stats and profile | a summary in `view.summary` (games by status, hours, favourites, most played) |
| Explore | the search text in `view.editor` |
| Steam import | the profile you typed (never the API key) |
| Anything else, or a game that is not in the library | `active_objects: []` |

After each Faustus turn the open lists refresh once without losing what you are typing. Set `HOARD_COPILOT=0` before starting the server to remove the button. The routes are listed in [docs/API.md](docs/API.md).

Each context request captures the screen and pending fields before its native reads finish, so navigating during a request does not mix two views. A filtered library with no matches sends no game objects. Personal notes being edited remain dirty when a turn refresh changes the saved note; the next Save writes the retained local draft.

## MCP tools

- `gamer_list`, `gamer_get`: find and inspect games, with status, favourite and platform filters and paging (`offset`).
- `gamer_add`, `gamer_update`: add games and update status, rating from 1 to 10, notes, favourites, owned platforms, tags, hours, progress, cover, studio and DLC total.
- `gamer_remove`: delete a game from the library. Requires `confirm: true`.
- `gamer_dlc`: record expansions and mark them complete (an optional `number` keeps the catalogue position so the web checklist matches).
- `gamer_log_session`, `gamer_sessions`: record local play sessions and query their history. A stable `sessionId` makes repeats update the same session instead of adding time twice. Correcting minutes changes the total by the difference. `playedAt` requires ISO 8601 with a timezone. Filters accept UTC dates or ISO timestamps with inclusive endpoints; `limit` affects returned rows while `total` and `minutes` cover every matching session.
- `gamer_stats`, `gamer_backlog`: summaries and deterministic backlog suggestions.
- `gamer_activity`: a local activity recap for an inclusive date range, ranked by minutes per game and grouped by UTC day. Only dated sessions count. See [Activity recaps](docs/ACTIVITY.md).
- `gamer_search_catalog`, `gamer_add_from_catalog`: optional RAWG metadata (needs `RAWG_API_KEY` in the MCP process).
- `gamer_import_steam`: pass a SteamID64 and Steam Web API key **in the call** to import a public library and playtime. `syncExistingPlaytime: true` refreshes playtime of existing Steam-linked games without counting logged sessions twice. The key is not stored in JSON or logs.
- `gamer_sync_steam_achievements`, `gamer_achievements`: refresh and browse one Steam game's individual achievements.
- `gamer_import_json`, `gamer_export_json`: additive import and export. GamerHoard exports and the old `watchhoard-export` format are accepted; existing entries are skipped. Exports create new files and never overwrite one.

Statuses are `backlog`, `playing`, `paused`, `completed` and `dropped`. The web app shows them as Backlog, Playing, Paused, Completed and Dropped.

## Configuration

| Variable | Default | Meaning |
|----------|---------|---------|
| `GAMERHOARD_PORT` | `5207` | port of the web app |
| `GAMERHOARD_DATA_FILE` | `~/.gamerhoard/library.json` | library file (shared by server and MCP; set it in both) |
| `GAMERHOARD_DATA_DIR` | folder of the library | where the copilot keeps its small state |
| `GAMERHOARD_DIST` | `apps/mobile/dist` | built web client |
| `GAMERHOARD_ALLOWED_HOSTS` | local names only | extra host names accepted |
| `RAWG_API_KEY` | none | enables the online catalogue; stays on the server |
| `HOARD_FAUSTUS_URL` | `http://127.0.0.1:7000` | where the copilot reaches Faustus |
| `HOARD_COPILOT` | on | `0` removes the Faustus button |

The library file is the single source of truth and is not part of the repository: copy it for a backup, or use Settings > Export data or `gamer_export_json`.

## Native app

`apps/mobile` is an Expo project. The native build keeps its own SQLite database on the device (it does not read the computer's library file) and calls RAWG directly with `EXPO_PUBLIC_RAWG_KEY` from `apps/mobile/.env`. Copy `apps/mobile/.env.example` first. The web app is the one that shares data with Faustus.

## Verify

```sh
npm test             # MCP library, REST server, copilot context, plugin manifest
npm run typecheck    # the Expo client
```

## Limits

- Native MCP tools operate on the shared local game library. They do not claim access to a browser collection or a cloud account. Original lists, reviews, account/social screens, movies, badges, import parsers and Supabase source are recovered. Their historical game-metadata compatibility stubs remain as before; this does not add a new movie/person catalogue provider.
- The web UI does not show Steam achievements (the MCP tools and `/api/games/<id>/achievements` do).
- In shared mode, Clear data clears browser collections while retaining shared games. The UI states this boundary and offers exports for both. Other original modes retain their own clear operation.
- Online metadata (covers, DLC lists, trailers) needs `RAWG_API_KEY`.

## Recovered data sources

Settings lets the web user choose the shared Faustus library, the historical browser library, or the cloud account. `EXPO_PUBLIC_BACKEND=localapi` remains the web default; `memory` and historical `local` use MemorySource on web, `local` uses SQLite on native, and `supabase` selects SupabaseSource on either platform. Cloud mode reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from configuration and uses the original login flow. Shared/browser modes neither require login nor refresh a cloud session. The cloud landing page provides a way back to the shared library.

Shared games and sessions still use the native REST/MCP library. Lists, movies and other historical browser collections reuse MemorySource and its existing localStorage keys, including persisted changes after reopening. A game can be added to a restored custom list from its detail page. Cloud social/account functions use the recovered Supabase client/schema; browser collections are not advertised as published or synced. The original Steam account flow remains available in cloud mode alongside the current manual/profile import. Native unsupported episode-counter writes report their domain limitation instead of silently reporting success.

`packages/` and `supabase/` are recovered historical source; no migrations, deployment, provider accounts or real credentials are run by this restoration. iOS/Android runtime and real cloud connectivity need their configured environment; typechecking and deterministic client contract fixtures are separate from such live validation.
