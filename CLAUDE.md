# GamerHoard — working agreement for Claude

GamerHoard is a **local, single-user video-game library**: a web app served by `server/index.mjs` (port 5207), MCP tools for Faustus (`mcp/server.mjs`) and an optional native Expo app, all over ONE library file (`~/.gamerhoard/library.json`). Shared mode opens without login; historical optional Supabase accounts and community remain available. Public deployment is unchanged. Metadata is **RAWG**; the hero import is your **Steam** library. User docs: `README.md` / `README.es.md`, REST and copilot routes in `docs/API.md`, product tour in `GAMERHOARD.md` (Spanish).

## Project knowledge graph — READ FIRST

`docs/knowledge-graph/` is a living, auto-generated map of the client:

- **`MAP.md`** — start here: architecture, every screen, the `DataSource` contract with per-backend coverage, external APIs, i18n, "where do I change X?" recipes.
- **`graph.html`** — interactive explorer (open in a browser).
- **`CURATED.md`** — durable human notes (naming semantics, decisions, Steam/RAWG landmines).

Regenerate after any structural change (new screen, `DataSource` method, module, external API): `node docs/knowledge-graph/generate.mjs`.

## The rules that matter most for THIS repo

1. **Inherited names, new semantics.** The client kept an older tracker's schema/method names. A **`show` / `tvdb_id` is a GAME** (RAWG id; Steam games use `2_000_000_000 + appid`; manual games `1_000_000_000 + hash`), an **`episode` is a DLC/expansion**, **`network` is the studio**. `src/tmdb.ts` re-exports `src/rawg.ts`. A grep for "episode" is almost always about DLCs.
2. **One library file, two processes.** `mcp/library.mjs` is the only code that reads and writes `library.json`. The REST server and the MCP stdio server each hold a `Library`; it re-reads when the file's mtime/size changes. Never write the file from anywhere else. Library status names are `backlog | playing | paused | completed | dropped`; the client maps them to `backlog | watching | stopped | archived | dropped` (`apps/mobile/src/db/localapiMap.ts`).
3. **One contract, four data sources.** Screens use the `DataSource` interface (`apps/mobile/src/db/types.ts`): `localapi.ts` (web over the REST server, default), `local.ts` (SQLite, native) and `memory.ts` (browser demo, `EXPO_PUBLIC_BACKEND=memory`). The restored supabase.ts implements the original cloud backend. LocalApiSource composes MemorySource for browser collections while keeping shared game writes on the native API.
4. **Keys stay out of the bundle and the library.** The RAWG key lives in the server environment (`RAWG_API_KEY`) and is added by the `/api/rawg/*` proxy; Steam keys are passed per call and only the browser remembers one (AsyncStorage). Never commit `.env`, keystores or `seed.json`.
5. **Copilot contract.** `window.hoardCopilot` (`src/copilot.ts`, pure builders in `src/copilotContext.ts`, screens register what they show with `useCopilotView`). `context()` always returns `active_objects` (even `[]`), puts unsaved form fields in `view.editor`, never throws and never includes secrets. `onTurnEnd` refreshes via `refreshAllQueries()` (debounced). When you add a screen with a form or a list, register it and extend `copilotContext.test.mjs`.
6. **Git only on the real machine.** If git jams, delete a stale `.git/index.lock`.

## Workflow

1. **Plan first for non-trivial work** (3+ steps or an architectural decision); re-plan when something goes sideways.
2. **Use subagents** for research and parallel analysis.
3. **Verify before "done".** `npm test` (MCP library, REST server, copilot context, manifest), `npm run typecheck`, `npm run build:web`, and drive the running app in a browser. Regenerate the graph.
4. **Prefer the elegant, minimal change.** Root causes, not band-aids.
5. **Keep docs current**: README (both languages), `docs/API.md`, `faustus-plugin.json` and this file whenever behaviour changes.

## Where things live (quick index)

- Server: `server/app.mjs` (routes), `server/mapping.mjs` (ids and views), `server/hoard-commons/` (shared family helpers: guard, SPA serving, copilot relay).
- MCP: `mcp/server.mjs` (tools), `mcp/library.mjs` (storage), `mcp/integrations.mjs` (RAWG and Steam).
- Screens: `apps/mobile/app/**` (Expo Router). `(tabs)` = Games · Explore · Profile; `show/[id]` game page; `stats`, `history`, `settings`, `import`, `language`.
- Data layer: `apps/mobile/src/db/`. Game metadata `src/rawg.ts`, Steam `src/steam.ts`. i18n `src/i18n/{en,es}.ts` (EN is the source of truth; `es.ts` is typed against it).
- Tests: `mcp/*.test.mjs`, `server/*.test.mjs`, `apps/mobile/src/*.test.mjs` (run with `npm test`).
