# @watchhoard/importer

Turns a **TV Time GDPR export** into Watch Hoard data. This is the hero feature: *import your
data and keep going.*

## Two modes
- `pnpm validate` — parse the export and **reconstruct your profile** (episode counts, the
  "time watched" clock, follows, reactions, lists, badges). No network, no database. Use it to
  prove an export is readable end-to-end.
- `pnpm import` — resolve TheTVDB/IMDb ids (and movie titles) to **TMDB** and upsert everything
  into Supabase. Requires `TMDB_ACCESS_TOKEN` and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

## How it maps (see the engineering spec for the full table)
- shows/episodes → TheTVDB ids → TMDB `/find?external_source=tvdb_id`
- movies in the social/list services → title match (no external id in the export)
- watch history preserves original timestamps; the `watches` unique constraint makes re-imports idempotent.

Point it at a folder of the TV Time CSVs (e.g. the sibling `tv-time-data/`).
