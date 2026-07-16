# Watch Hoard 🍿

**An open-source, self-hostable successor to TV Time.** The famous TV & movie tracker shuts down
and deletes all user data after **July 15, 2026**. Watch Hoard is the lifeboat: *import your TV
Time export and keep going* — on iOS, Android, and web, from one codebase.

> Built to be the opposite of what killed TV Time: your data is always yours, always exportable,
> and the app can never be switched off because you can run it yourself.

Status: **feature-rich and nearly launch-ready.** The importer, a full tracking app (shows, movies,
episodes, calendar, stats, lists) and the social layer are built. It runs **fully local by default**
(on-device SQLite, no account) and flips to a **Supabase cloud mode** (accounts, friends, reviews)
behind the same data interface.

**❤️ Support the project:** Watch Hoard is free and open source —
[donate on GoFundMe](https://www.gofundme.com/f/create-an-alternative-to-tv-time) to help us keep it running.

---

## What already works

- ✅ **Database schema** — a clean Postgres/Supabase schema (25 tables, RLS, idempotent tracking) that
  replaces TV Time's MySQL-monolith + DynamoDB-microservice sprawl. Validated by executing it in Postgres.
- ✅ **Import engine** (`packages/importer`) — parses a real TV Time GDPR export and reconstructs the
  profile. On the reference account it reproduces **14,611 episodes** and the **"8mo 23d 22h" time
  clock** exactly. Resolves TheTVDB/IMDb ids → TMDB; idempotent re-imports.
- ✅ **Cross-platform app** (`apps/mobile`) — Expo Router app (iOS + Android + web) with a modern dark
  design system and the four-tab TV Time layout (Shows · Movies · Explore · Profile).
- ✅ **Tracking** — per-episode check-offs, Watch Next, Up Next (air dates), movie watchlist with
  release countdowns, rewatches, favorites, lists, a month calendar (aired + upcoming), and full
  watch history (every event linked to its show/movie).
- ✅ **Rich fiches** — synopsis, genres, ratings (TMDB/IMDb/RT/Metacritic), trailer, where-to-watch
  by configurable country, cast, director/creator, production companies, collections/sagas and
  recommendations — **everything is clickable**: person pages (filmography as actor/director),
  studio pages (their movies & shows), genre → Explore.
- ✅ **Discover** — trending/popular/top-rated/upcoming rows, genre browsing, search for shows,
  movies **and people**.
- ✅ **Social (cloud mode)** — accounts with public/private profiles, follows + requests, friends
  feed, reviews with spoiler walls, share links.
- ✅ **Fast + polished** — persistent TMDB cache (offline-friendly relaunches), request dedup,
  virtualized lists everywhere, full **English/Spanish localization** (UI *and* metadata), PWA
  install, stats dashboards (genres, networks, years), TV Time badges & comments preserved.

## Architecture

```
  Expo app (iOS · Android · Web)  ─┐
        one React/TS codebase       ├─►  Supabase  (Postgres + Auth + Storage + Realtime)
  Importer CLI (TV Time → TMDB) ──┘         └── RLS: catalog public, personal data private
                    │                     TMDB (metadata, cached into Postgres)
                    └── your tv-time-data/ GDPR export
```

| Layer | Choice | Why |
|---|---|---|
| App | **Expo + Expo Router** (React Native) | iOS, Android, **and** web from one TS codebase; ships to both stores |
| Lists/UI | FlashList, expo-image, TanStack Query | fast, modern, smooth |
| Backend | **Supabase** (Postgres) | free to start, open-source, **self-hostable**, scales to paid |
| Metadata | **TMDB** (cached) | free, localized, resolves TVDB/IMDb ids |
| Auth | Supabase Auth + RLS | per-row ownership, public profiles/lists |
| Mono-repo | pnpm + Turborepo | shared types across app/importer/api |

Full rationale + data model + UI teardown live in [`docs/`](./docs).

## Repo layout

```
watchhoard/
├─ apps/mobile/          Expo app (iOS · Android · web)
├─ packages/
│  ├─ core/              shared domain types + helpers
│  └─ importer/          TV Time GDPR → TMDB → Supabase  (the hero feature)
├─ supabase/migrations/  0001_init.sql (schema) · 0002_rls.sql (security)
├─ docs/                 strategy plan · engineering spec · import validation
└─ docker-compose.yml    bare-Postgres self-host (or use `supabase start`)
```

## Quickstart

```bash
npm install

# 1) Run the app on YOUR imported data — fully local (on-device SQLite), no backend needed
npm run seed                      # build the seed from ../tv-time-data (already committed)
npm run mobile                    # then press w (web), i (iOS), a (Android)

# 2) Prove the importer on a TV Time export (no backend needed)
npm run import:validate           # reads ../tv-time-data, reconstructs the profile

# 3) (LATER) Stand up a cloud backend when you have a real project
# supabase start              # applies supabase/migrations; then add a SupabaseSource (see docs/LOCAL.md)
```

Copy `.env.example` → `.env` and fill Supabase + TMDB keys to enable the live backend and a real import.

## The import (why it's the whole point)

A TV Time GDPR export is 51 CSV tables. The importer:
1. parses the tracking ledger, follows, reactions, comments, lists, and badges;
2. resolves **TheTVDB ids → TMDB** (`/find?external_source=tvdb_id`); movies with only a title are
   matched by name into a review queue;
3. upserts catalog + history, **preserving original watch timestamps**;
4. is **idempotent** — a unique constraint on `watches` means re-running never double-counts.

Reproduce the validation any time with `npm run import:validate` (see [`docs/IMPORT-VALIDATION.md`](./docs/IMPORT-VALIDATION.md)).

## Data hosting & cost model (start at $0, pay only when it grows)

- **Today: $0.** Supabase free tier (Postgres + Auth), TMDB free, Expo Go / EAS free builds, web
  deployed as static (Vercel/Cloudflare Pages free). Only a domain (~$12/yr) is optional.
- **When it grows:** Supabase Pro (~$25/mo) for more database + auth; scale storage/compute as needed.
- **Escape hatch:** because it's plain Postgres behind Supabase, you can self-host the whole stack
  (`supabase start` / Docker) and pay your own server bill — never a per-user tax, never a kill switch.

## Shipping to the App Store & Play Store

The app is EAS-ready (`app.json` has bundle id `app.watchhoard`, new architecture on):

```bash
npm i -g eas-cli && eas login
eas build:configure
eas build -p ios       # → App Store Connect  (needs Apple Developer, $99/yr)
eas build -p android   # → Play Console        (needs Google Play, $25 once)
eas submit -p ios      # upload the build
eas submit -p android
# Web:
npx expo export -p web && <deploy the ./dist folder to any static host>
```

## Roadmap

- **Phase 1 — Lifeboat:** ✅ done — import + core tracking + Up Next + calendar + profile/stats + web & mobile.
- **Phase 2 — Community:** mostly done — friends & feed, reviews + spoiler walls, share links. Missing: episode reactions, favorite characters, Rewind, push notifications.
- **Phase 3 — Beat them:** auto-scrobble (browser + Plex/Jellyfin), public API, Trakt/Simkl import, optional federation.

## Support & contact

Questions, bug reports, ideas — reach out:

- **X:** [@MyBookHoard](https://x.com/MyBookHoard)
- **Email:** [watchhoard@gmail.com](mailto:watchhoard@gmail.com)

## License

**AGPL-3.0-or-later** — chosen so every hosted fork stays open. Watch Hoard can never be quietly
closed the way TV Time was.
