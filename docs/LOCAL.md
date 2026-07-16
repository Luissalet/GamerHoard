# Running Watch Hoard locally (no cloud)

Watch Hoard runs **fully on-device** right now — no Supabase, no account, no TMDB key. Perfect
until there's a real project to point at.

## Fastest way to see it (Windows / anywhere, just npm)
```bash
cd apps/mobile
npm install
npx expo start        # press w for web, or scan the QR with Expo Go on your phone
```
That's it — your imported profile loads from the on-device database. The steps below are the
monorepo way (run from the repo root) if you prefer.

## How it works
- Your TV Time export lives in `WatchHoard/tv-time-data/`.
- `npm run seed` builds `apps/mobile/assets/seed.json` from it (profile stats, shows + progress,
  recent activity, lists) — computed entirely from the export, no network.
- On first launch the app opens an **on-device SQLite** database (`expo-sqlite`) and seeds it from
  that file. Every read and write — Continue Watching, stats, **mark-watched** — hits local SQLite
  through the `DataSource` interface in `src/db/`.

## Run
```bash
npm install
npm run seed        # (re)build the seed from your export — already committed, so optional
npm run mobile      # press w (web) · i (iOS) · a (Android)
```
Open the app and your real profile is already there: **14,611 episodes, the 8mo 23d 22h clock,
462 shows**, your lists, and your recent activity.

## When you're ready for a backend
The app depends only on the `DataSource` interface (`src/db/types.ts`). To go cloud:
1. Implement a `SupabaseSource` with the same methods (the Postgres schema already exists in
   `supabase/migrations/`).
2. Swap one line in `src/db/index.ts`.

No screen changes. That's the whole point of the interface.

## Adding TMDB (movie posters + fuller metadata)

TVMaze covers TV shows keylessly. **Movies** (and richer show data) come from TMDB, which needs a free key:

1. Make a free account at **themoviedb.org**.
2. **Settings → API → Create → Developer**, fill the short form (personal / hobby is fine).
3. Copy the **API Read Access Token** (the long v4 token).
4. In the repo root, create a file named **`.env`** containing:
   `TMDB_ACCESS_TOKEN=paste-the-long-token-here`
5. Re-run enrichment, then reload: `npm run enrich` then `npm run mobile`.

The app stays keyless at runtime — the token is only used at enrich time to bake poster URLs into `seed.json` (cached in `.poster-cache.json`).
