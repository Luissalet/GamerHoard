# GamerHoard — living knowledge graph

A self-updating map of this codebase, meant to get a person (or an AI session)
productive in minutes and to make changes safer. It is **generated from the code**,
so it never drifts: re-run the generator and it reflects reality.

## Files

| File | What it is |
| --- | --- |
| `generate.mjs` | The generator. Zero dependencies. Scans the repo and rebuilds everything below. |
| `MAP.md` | **Start here.** The readable map: orientation, screens, modules, the `DataSource` contract with backend coverage, Edge Functions, migrations, APIs, "where do I change X?" recipes, and gotchas. |
| `graph.html` | Interactive explorer — open in a browser. Force-directed graph with search, type/area filters, and a details panel (imports, used-by, APIs). |
| `graph.json` | Machine-readable nodes + edges + stats. Feed it to tools or scripts. |
| `graph.mermaid` | High-level architecture diagram (Mermaid source). |
| `CURATED.md` | Hand-written durable knowledge (naming semantics, decisions, Steam/RAWG landmines). Edited by humans; injected verbatim into `MAP.md`. |

## Regenerate (this is the "living" part)

```bash
node docs/knowledge-graph/generate.mjs
# or, if wired into package.json:
npm run graph
```

Run it after any structural change — a new screen, a new `DataSource` method, a
migration, an Edge Function, a new module or external API. The map, graph, and
diagram all update. `graph.json` and the generated `MAP.md` are safe to commit so
the current picture travels with the code; only `CURATED.md` and `generate.mjs`
are edited by hand.

## How to use it when working on GamerHoard

1. Read `MAP.md` top-to-bottom once (2 min) — especially the "inherited names, new
   meaning" note (`show`=game, `episode`=DLC, `network`=studio), the `DataSource`
   coverage table, and the change recipes.
2. Open `graph.html`, search for the area you're touching, click a node to see what
   imports it and what it imports.
3. Make the change following the matching recipe. The most common footgun is the
   three-backend contract: a new data op must land in `local.ts`, `memory.ts`, **and**
   `supabase.ts`.
4. Re-run the generator; confirm the coverage table shows ✅✅✅ and the graph looks right.

## Optional: wire `npm run graph`

The generator always works via `node docs/knowledge-graph/generate.mjs`. To add the
shortcut, put this in the repo-root `package.json` `scripts`:

```json
"graph": "node docs/knowledge-graph/generate.mjs"
```
