# GamerHoard

[Español](README.es.md)

A **local video game library** for Faustus, exposed through an MCP stdio server. It has no website, account, domain, Supabase dependency or permanent background service. It requires Node.js 20 or newer and does not need `npm install`.

## Connect to Faustus

Faustus can load [`faustus-plugin.json`](faustus-plugin.json) with `GAMERHOARD_DIR` pointing to this repository. For a manual MCP client, use `command: node` and `args: ["C:/path/GamerHoard/mcp/server.mjs"]`. Run `npm start` to try the stdio server directly; an MCP client normally starts it on demand.

The library lives at `~/.gamerhoard/library.json` (`C:\Users\<user>\.gamerhoard\library.json` on Windows). Set `GAMERHOARD_DATA_FILE` in the MCP process to use another location. This file is the **single source of truth** and is not part of the repository. Copy it for a backup or use `gamer_export_json` for a structured export. Exports create new files and never overwrite an existing one.

## Tools

- `gamer_list`, `gamer_get`: find and inspect games, with status, favorite and platform filters.
- `gamer_add`, `gamer_update`: add games and update status, rating from 1–10, notes, favorites, owned platforms, tags, hours and progress.
- `gamer_dlc`: record expansions and mark them complete.
- `gamer_log_session`, `gamer_sessions`: record local play sessions and query their history. A stable `sessionId` makes repeats update the same session instead of adding time twice. Correcting minutes changes the total by the difference. `playedAt` requires ISO 8601 with a timezone. Filters accept UTC dates or ISO timestamps with inclusive endpoints; `limit` affects returned rows while `total` and `minutes` cover every matching session.
- `gamer_stats`, `gamer_backlog`: summaries and deterministic backlog suggestions.
- `gamer_search_catalog`, `gamer_add_from_catalog`: optional RAWG metadata. Set `RAWG_API_KEY` in Faustus's environment to enable these tools; the local library works without it.
- `gamer_import_steam`: pass a SteamID64 and Steam Web API key **in the call** to import a public library and playtime. Set `syncExistingPlaytime: true` to refresh playtime for existing Steam-linked games, accounting for logged sessions without counting them twice. Notes, state and progress are preserved; games matched only by title remain untouched. Existing games are otherwise preserved. The key is not stored in JSON or logs. Internet access and suitable Steam privacy settings are required.
- `gamer_sync_steam_achievements`: refresh one Steam game's individual achievements, unlocked/total counts, and last sync time through Steam's public Web API. Pass the SteamID64 and Web API key for this call; neither is saved. If the game's schema is unavailable, API names remain available. Games without accessible player achievements leave the previous local snapshot intact. Steam achievements stay separate from manually entered progress.
- `gamer_achievements`: browse the saved achievement names, descriptions and unlock dates, with text/unlocked filters and pagination. `gamer_get` and `gamer_list` show only the compact summary.
- `gamer_import_json`, `gamer_export_json`: additive import and export. GamerHoard exports and the old `watchhoard-export` format are accepted; existing entries are skipped.

Statuses are `backlog`, `playing`, `paused`, `completed` and `dropped`. Sessions are stored in the local JSON and included in imports and exports. Previous or imported playtime remains the base to which sessions add. An import adds missing session IDs but keeps existing ones; use `gamer_log_session` to correct an existing session. Repeated `sessionId` values within one game in an export are rejected before any change.

## Use from a chat

Ask Faustus: “Log the 45 minutes I played Outer Wilds yesterday”, “Correct that session to 35 minutes”, or “What did I play this week, and for how long?” Faustus manages session IDs; you do not need to provide them.

## Verify

```sh
npm test
```

The former Expo and Supabase implementation remains recoverable in Git history but is not part of the active product. Remote projects and ignored `.env` files are untouched.
