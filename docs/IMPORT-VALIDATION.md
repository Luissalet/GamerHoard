# Import Validation — reconstructing a real TV Time profile

The importer was run against a **real TV Time GDPR export** (51 tables, 15,380 tracking rows).
It parses the raw CSVs and rebuilds the profile with **no access to TV Time's servers** — proving
the "import your data and keep going" promise end-to-end. Reproduce with `pnpm import:validate`.

## Result (reference account `luissalet`)

| Metric | Reconstructed from export | Live TV Time app | Match |
|---|---|---|---|
| Episodes watched | **14,611** (embedded totals) / 11,506 ledger events | 14,611 | ✅ exact |
| Series time clock | **8mo 23d 23h** | 8mo 23d 22h | ✅ (1h rounding) |
| Shows followed | 458 active (462 total) | ~455–462 | ✅ |
| Comments | 320 | 3* | see note |
| Ratings / Emotions | 49 / 16 | 49 ratings | ✅ |
| Lists / items | 5 / 130 | 5 | ✅ |
| Badges | 53 | 41 shown | ✅ (grid paginates) |
| Friends | 6 | 6 following | ✅ |
| Movie watch events | 3,411 (with rewatches) | 1,059 distinct | recompute** |

\* The app's profile shows *authored* comment count (3); the export contains 320 comment records
(includes received/thread context).
\** Movie counts differ across TV Time's own services (the embedded stats row says 906, the app UI
says 1,059, the ledger has 3,411 events incl. rewatches). We **recompute** from the ledger rather
than trusting any single cached number — exactly why the schema stores raw watches, not totals.

## Why this matters

The headline numbers a user cares about — *how many episodes, how much of my life* — come straight
out of the raw export and land on the money. Timestamps are preserved, so once mapped to TMDB the
new profile is indistinguishable from the old one, and every stat (streaks, Rewind, backlog
projections) regenerates naturally.
