# Phase 3 — the backend-gated features

Everything in the app today runs **locally** on your imported data (SQLite on device, in-memory on
web). The following are designed and ready, but genuinely need a server, so they light up when the
Supabase backend (deferred by choice) lands. The seams already exist: the `DataSource` interface
(`apps/mobile/src/db/types.ts`) and the Postgres schema (`supabase/migrations/`).

- **Live community** — per-episode comments, reactions and no-spoiler walls across *all* users
  (today you see only your own imported comments/reactions). Needs shared storage + RLS (already written).
- **Friends & activity feed** — real social graph and following-feed. Your friend list imports now;
  the live feed needs the backend.
- **Auto-scrobbling** — a browser extension (Netflix/Disney+/…) and Plex/Jellyfin webhooks that mark
  episodes watched automatically. Needs an authenticated ingest endpoint.
- **Public API** — an OpenAPI surface so third-party apps read/write your data (anti-lock-in). Needs the API server.
- **Trakt / Simkl two-way sync** — import from and mirror to other trackers (their APIs + your account).
- **Federation (optional)** — ActivityPub so self-hosted instances interoperate.

### Also queued (local, no backend needed)
- **Genres & networks** on the Stats page — one keyless TVMaze metadata pass (`enrich` can be
  extended to capture `genres`/`network` alongside posters).
- Full episode lists + air dates on show detail (TMDB `/tv/{id}` per followed show).
- Movie ratings/cast on movie detail (TMDB movie details).
