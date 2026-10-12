# GamerHoard — working agreement for Claude

GamerHoard is a cross-platform (iOS / Android / web, one Expo Router codebase) **video-game tracker** — a fork of Watch Hoard repurposed for games. Metadata is **RAWG**; the hero import is your **Steam** library. Product tour: `GAMERHOARD.md` (Spanish).

## Project knowledge graph — READ FIRST

This repo maintains a living, auto-generated map of itself in `docs/knowledge-graph/`:

- **`docs/knowledge-graph/MAP.md`** — start here. Architecture, every screen, the `DataSource` contract with per-backend coverage, Edge Functions, all migrations/tables, external APIs, i18n, and "where do I change X?" recipes.
- **`docs/knowledge-graph/graph.html`** — interactive explorer (open in a browser): search, filter by type/area, click a node to see what imports it and what it imports.
- **`docs/knowledge-graph/CURATED.md`** — durable human notes (naming semantics, decisions, Steam/RAWG landmines).

Regenerate after any structural change (new screen, `DataSource` method, migration, Edge Function, module, or external API):

```
node docs/knowledge-graph/generate.mjs   # or: npm run graph
```

## The rules that matter most for THIS repo

1. **Inherited names, new semantics.** GamerHoard kept Watch Hoard's schema/method names to minimise churn. A **`show` / `tvdb_id` is a GAME** (RAWG id; Steam games use `2_000_000_000 + appid`), an **`episode` is a DLC/expansion**, **`network` is the studio/publisher**, and `movie*` / `person` / `episode/[key]` are largely legacy. `src/tmdb.ts` re-exports `src/rawg.ts`. Read the mapping table in `CURATED.md` before touching data code — a grep for "episode" is almost always about DLCs.
2. **One contract, three backends.** Every data operation goes through the `DataSource` interface (`apps/mobile/src/db/types.ts`) and must be implemented in **all three** backends — `local.ts` (SQLite/native), `memory.ts` (localStorage/web), `supabase.ts` (cloud). The coverage table in `MAP.md` verifies this; ✅✅✅ or it's a bug.
3. **Cloud is the default.** `src/lib/backend.ts` resolves to `supabase` unless `EXPO_PUBLIC_BACKEND=local`; login is always required. `app.config.js` bakes public client defaults so CI builds boot — never put server secrets there.
4. **Steam import is server-side.** Client flow in `src/steam.ts`; the actual Steam API calls + the Web API key live in the `supabase/functions/steam-auth` Edge Function. Never ship the Steam key in the client; never call `api.steampowered.com` from web (no CORS).
5. **Git only on the real machine.** The Cowork mount can corrupt `.git` on write. If git jams, delete a stale `.git/index.lock` on the machine.

## Workflow

1. **Plan first for non-trivial work** (3+ steps or an architectural decision). If something goes sideways, stop and re-plan rather than pushing on.
2. **Use subagents** to offload research, exploration, and parallel analysis and keep the main context clean.
3. **Verify before "done."** Never mark work complete without proving it: run the typecheck (`npm run typecheck` in `apps/mobile`), regenerate the graph and confirm the coverage table, check behavior. Ask yourself: would a staff engineer approve this?
4. **Prefer the elegant, minimal change.** Touch only what's necessary; find root causes, not band-aids. For non-trivial changes, pause and ask "is there a cleaner way?" — but don't over-engineer simple fixes.
5. **Capture lessons.** After a correction from the user, write down the rule so the same mistake doesn't recur, and check `docs/knowledge-graph/CURATED.md` / project memory for prior decisions before starting.

## Where things live (quick index)

- Screens: `apps/mobile/app/**` (Expo Router, file-based). `(tabs)` = Games · Explore · Profile.
- Data layer: `apps/mobile/src/db/` (`types.ts` contract, `local.ts` / `memory.ts` / `supabase.ts` backends, `schema.ts` SQLite).
- Game metadata: `src/rawg.ts` (RAWG client, cached). Steam: `src/steam.ts` + `supabase/functions/steam-auth`.
- Feature logic: `src/*.ts` (social, moderation, ratings, stats, notifications…). UI: `src/*.tsx`.
- i18n: `src/i18n/{en,es}.ts` (EN is source of truth). Migrations: `supabase/migrations/` (0013/0014 = game fields).

_When in doubt, open `docs/knowledge-graph/MAP.md` and the interactive `graph.html`, then follow the matching change recipe._
