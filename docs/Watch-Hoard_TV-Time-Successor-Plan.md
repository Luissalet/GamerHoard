# Watch Hoard — A Worthy Successor to TV Time

*Open-source. Self-hostable. "Import your data and keep going."*

**Status:** Planning draft · **Date:** July 6, 2026 · **Working name:** Watch Hoard (project: *TV Time reborn*)

---

## 0. TL;DR

TV Time — the 15-year-old, 26M+ install TV & movie tracker — shuts down permanently after **July 15, 2026**, and deletes all user data. Its parent (Whip Media) was bought by a lender that pivoted the company to AI. Millions of people are about to lose years of watch history.

We're building **Watch Hoard**: an open-source, self-hostable successor that is, for v1, *literally TV Time 2*. The hero feature is a **one-click import of the TV Time data export** so refugees keep every episode, timestamp, and reaction and continue tracking without missing a beat. Cross-platform (mobile + web) from day one. The whole ethos is the opposite of what killed TV Time: **you own your data, it's always exportable, and the app can never be taken from you** because you can run it yourself.

The technical spine is well-understood and low-risk: TV Time's export format is documented (below), and **TMDB's `/find` endpoint maps TheTVDB/IMDb IDs → rich metadata for free**, which is the exact primitive the import needs.

> **Companion doc:** `WatchHoard_Engineering-Spec_DataModel-Import-UI.md` reverse-engineers TV Time from a **real 51-table GDPR export + 24 app screenshots** now in the repo (`WatchHoard/`). It carries the authoritative data model, table-by-table import mapping, badge catalog, stats list, and UI screen inventory — and corrects a few assumptions below (see its §11).

---

## 1. Why this exists

On **July 1, 2026**, TV Time announced it will end after **July 15, 2026**. After that date the apps leave the App Store / Play Store, `tvtime.com` goes dark, and **all personal account data is deleted**. Users can pull a copy first via a GDPR self-service export at `gdpr.tvtime.com/gdpr/self-service`.

The official reason: *"it was no longer sustainable to continue operating the service as a free app, and there was not enough demand for a paid app."* The backdrop: Whip Media was acquired by lender **Blue Torch Capital** in early 2025 and refocused on an AI automation product ("Helix"), leaving the consumer app without a home.

**The lesson we bake into the architecture:** a beloved community app died because it was a centralized, ad-free, free service with no durable business model, owned by a company that no longer wanted it. Watch Hoard answers each of those: community-owned code, self-hostable infra (cost distributed to those who run it), an open export format so no future owner can ever hold data hostage, and a lightweight sustainability model (donations + optional hosted tier) rather than a VC-scale burn.

---

## 2. TV Time, dissected

Everything below is what we know at a technical level about the thing we're replacing.

### 2.1 History & ownership

| Year | Event |
|---|---|
| 2011–2012 | Launches as **TVShow Time** in Paris (dev studio *Toze Labs* — the Android package is still `com.tozelabs.tvshowtime`). |
| 2016 | Acquired by **Whip Networks** (Santa Monica). |
| 2017 | Rebrands **TVShow Time → TV Time**. |
| 2018 | Launches **TVLytics**, a viewership-insights product sold to studios/agencies (UTA, Netflix-adjacent deals). |
| 2019 | Acquires **TheTVDB** (its own metadata source), adds **Movies** + dark mode, acquires Mediamorph. |
| 2021 | Wins a Webby (People's Voice, Best Entertainment App). |
| Early 2025 | Whip Media acquired by **Blue Torch Capital**; company pivots to AI. |
| July 15, 2026 | **Service ends; data deleted.** |

Reach at end of life: **~26.4M lifetime installs**, historically 1M+ daily active users, localized into **14 languages**. The consumer app was also the sensor network feeding TVLytics — which is why, once the analytics business was deprioritized, the app lost its reason to exist commercially.

### 2.2 What it did — the feature map we must honor

Four tabs: **Shows · Movies · Discover · Profile**.

- **Tracking core.** Follow shows; a Watch List surfaces *next episode to watch*, *haven't-seen-in-a-while*, and full history. Poster view shows a yellow **progress bar** per show. Mark-watched by swipe or checkmark. Movies get their own watchlist and "upcoming/unreleased" list.
- **Episode & movie pages.** After you mark something watched, the page unlocks: **community comments**, emotional **reactions**, and **favorite-character voting**. Strict **no-spoiler rule** — content stays hidden until you've marked the item watched.
- **Reactions, ratings & character votes.** Confirmed from the real export, TV Time has *three* interaction types: **qualitative ratings** (buckets like "Bad/Good," not 1–10 stars), **emotion/feeling** votes, and **favorite-character** votes. Our data model captures all three (see the engineering spec for the exact schema).
- **Upcoming / agenda.** Calendar of future episodes for followed shows; opt-in **push notifications ~1 hour before airing**.
- **Discover.** Genre filters, show-status filters (ongoing/ended), **Trending** (ranked by comment volume over the last 3 days), **"Most Binged"** (4+ episodes in one day = a "binge session"), and **"Top Shows for You"** recommendations.
- **Profile & stats.** The signature **"TV Time" clock** (total hours watched, computed from watched-episode runtimes), episode/movie counts, graphs, rankings, **badges** (two families: *discovery* badges for using features, *addiction* badges for engaging with shows), **custom lists** (can mix shows + movies), and favorites.
- **Social.** Follow friends; see friends' recent activity; a whole localized community layer (you can filter comments to your chosen languages).
- **Editorial.** Weekly public **Binge Report** and **Streaming Originals Report**.

### 2.3 Data & metadata

All catalog data came from **TheTVDB**, which TV Time *owned* after 2019. Registered users could edit series metadata (characters, air dates, networks) directly. This vertical integration is exactly the fragility we avoid: when the parent unwinds, the metadata source is entangled with it.

**Relevant to us:** TheTVDB's current **v4 API is not free** — it requires either a negotiated licensed contract *or* forcing every one of your users to hold a **$12/year TheTVDB subscription**. For a free, self-hostable app that's a non-starter. We use **TMDB** instead (see §6.4).

### 2.4 The API

TV Time had a real OAuth2 API (`api.tvtime.com/doc`, formerly `api.tvshowtime.com/doc`):

- **OAuth 2.0** only; apps registered by emailing `api@tvtime.com`; no personal-use access.
- Rate limit **~10 requests/min per user**.
- Endpoints seen in third-party wrappers: get user info, to-watch list, agenda, library, discover/trending, **mark episode watched**, is-show-followed, archive-show, is-show-archived.
- Because official access was gated, a small ecosystem of **scraper APIs and wrappers** (Node, Python) grew up around it. Those same communities are now writing exporters — useful prior art and potential collaborators.

### 2.5 The data export — *this is our import contract*

The GDPR export is the single most important technical artifact for us, because "import and keep going" lives or dies on parsing it correctly.

**What the official export contains:** CSV tracking records (files named `tracking-prod-records.csv` and `tracking-prod-records-v2.csv`) covering **episode and movie watch history** — the show/episode, your position, timestamps, favorites, rewatch counts, and reactions — keyed by **TheTVDB IDs**. Ratings are qualitative buckets plus separate emotion and character votes (not 1–10 stars). **A real 51-table export is now in the repo** (`WatchHoard/tv-time-data/`); the engineering spec maps every table field-by-field.

**A clean reference schema** comes from the open-source `tv-time-liberator` exporter (MIT), which normalizes a user's data to IDs that include **both TVDB and IMDb**:

```jsonc
// Shows
{
  "uuid": "c4199ff4-…",
  "id": { "tvdb": 366529, "imdb": "tt10574236" },
  "created_at": "2021-12-25 00:00:00",
  "title": "Station Eleven",
  "status": "stopped",              // following state
  "seasons": [
    { "number": 1,
      "episodes": [
        { "id": { "tvdb": 8815687, "imdb": "tt10579918" },
          "number": 1, "special": false,
          "is_watched": true, "watched_at": "2022-01-03 00:00:00" }
      ] } ]
}

// Movies
{
  "uuid": "978899c4-…",
  "id": { "tvdb": 169, "imdb": "tt0133093" },
  "created_at": "2024-09-13T10:49:58Z",
  "title": "The Matrix",
  "is_watched": false
}
```

**Design implication:** we build our importer against **both** the raw GDPR CSVs *and* this normalized JSON, so a user can feed us whichever they have. The presence of **IMDb IDs alongside TVDB IDs** is a gift — IMDb IDs are the most portable join key across TMDB, Trakt, and Simkl.

**Existing migration tools to learn from / reuse:** `tv-time-liberator`, `tv-time-capsule`, `TvTimeToTrakt` / `TvTimeToTraktSync`, plus JustWatch's and Moviebase's/Hobi's importers. Good open-source citizenship (and speed) argues for reusing MIT-licensed parsers rather than reinventing them.

### 2.6 Why it died — encoded as architectural requirements

| TV Time failure | Watch Hoard requirement |
|---|---|
| Centralized service could be switched off by an owner | **Self-hostable**; no single kill switch |
| Free with no durable model; paid had no demand | **Distributed cost** (self-host) + optional donations/hosted tier |
| Data locked in, then deleted | **Open, documented export**; import *and* export are first-class |
| Metadata source owned by (and entangled with) the dying parent | **Independent free metadata** (TMDB), cached locally |
| Closed API, gated access | **Open, documented public API** from day one |

---

## 3. Product principles

1. **Import and keep going.** The first-run experience *is* the TV Time import. A returning user should see their years of history and their exact next-up episode within minutes.
2. **You own your data.** Every account can export a complete, documented archive at any time. Lock-in is the enemy we were born from.
3. **Faithful first, novel second.** v1 earns trust by re-creating what people already loved. Innovation (auto-scrobbling, etc.) comes *after* parity.
4. **Self-hostable, not self-host-only.** A one-command Docker deploy for tinkerers; a friendly hosted instance for everyone else.
5. **Community-owned.** Open source (AGPL/MIT TBD), public roadmap, contributions welcome — the app belongs to the people who use it.

---

## 4. Competitive landscape — where we fit

| App | Strength | Gap we exploit |
|---|---|---|
| **Trakt** | Huge scrobbling ecosystem (Plex, Kodi, Emby, Infuse, Jellyfin); many 3rd-party apps | Paid VIP for full features; UI dated; big lists lag; not the warm TV Time *community* feel |
| **Simkl** | Free open REST API; TV/Movies/**Anime** as equals; browser auto-scrobble | Weaker social/community; not open source |
| **Serializd** | "Letterboxd for TV," strong reviews/social | TV-only-ish; no self-host; not a faithful tracker for casuals |
| **Letterboxd** | Best-in-class movie social | Movies only |
| **Moviebase / Hobi** | Polished mobile trackers, TV Time importers | Closed source; single-platform lean |

**Our wedge:** none of them is *open-source + self-hostable + a faithful TV Time clone with first-class TV Time import*. That's an unclaimed, emotionally resonant position at exactly the moment 26M users are looking for a new home.

---

## 5. Scope — "TV Time 2" parity

**Phase-1 MVP (the refugee lifeboat).** Accounts & auth; TMDB-backed catalog (shows, seasons, episodes, movies) cached locally; **TV Time import**; follow shows; mark episodes/movies watched with original timestamps; progress bars & next-up; watchlists; **upcoming calendar + air-time notifications**; profile with the **"Watch Time" clock** and core counts; web + mobile from one codebase; Docker self-host.

**Phase-2 (community & delight).** Love/like **reactions**; per-episode **comments** with **no-spoiler walls**; favorite characters; **follow friends** + activity feed; **badges**; Discover (trending, most-binged, recommendations); rich stats + a **Year-in-Review "wrapped."**

**Phase-3 (beat them).** **Auto-scrobbling** — browser extension for Netflix/Disney+/etc. and Plex/Jellyfin webhooks; public API + Trakt/Simkl import; optional ActivityPub federation so instances interoperate.

---

## 6. Architecture

### 6.1 Overview

```
        ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
        │  Mobile app  │   │   Web app    │   │  Browser ext │   (Phase 3)
        │  (Expo/RN)   │   │  (Next.js)   │   │  scrobbler   │
        └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
               └───────── shared TS core ────────────┘
                                   │  (REST/tRPC + OpenAPI)
                          ┌────────▼─────────┐
                          │     API server   │  auth · tracking · social
                          │   (Node/NestJS)  │
                          └───┬─────────┬────┘
             ┌────────────────┘         └───────────────┐
      ┌──────▼──────┐  ┌──────────┐  ┌──────────┐  ┌────▼─────┐
      │ PostgreSQL  │  │  Redis   │  │Meilisearch│  │ Job queue│
      │ (core data) │  │ (cache)  │  │ (search) │  │ (BullMQ) │
      └─────────────┘  └──────────┘  └──────────┘  └────┬─────┘
                                                        │ workers:
                                                        │  • TV Time import
                             ┌──────────────┐           │  • metadata sync (TMDB)
                             │   TMDB API   │◄──────────┘  • airing calendar
                             │ (metadata)   │              • notifications
                             └──────────────┘
```

### 6.2 Client — cross-platform day one

One **TypeScript monorepo** (Turborepo). `apps/mobile` = **Expo / React Native** (iOS + Android), `apps/web` = **Next.js**, sharing a `packages/core` of types, the API client, the import parser, and business logic. React on both sides means real component and logic reuse without maintaining two products. Mobile is offline-first: marking watched enqueues locally and syncs, so the app feels instant on a subway like TV Time did.

*Alternative considered:* **Flutter** (single Dart codebase, superb pixel-parity across mobile/web/desktop). Rejected as primary only because a TypeScript-everywhere stack maximizes the open-source contributor pool and lets the web app, mobile app, and API share one language and one set of types. Revisit if the team is Dart-native.

### 6.3 Backend / API

**Node.js + NestJS** (or Fastify) exposing a versioned REST API with an **OpenAPI** spec (so the public API and the export are first-class, not afterthoughts). **Prisma** as the ORM over **PostgreSQL**. Stateless API containers behind the queue for heavy work.

### 6.4 Metadata pipeline — TMDB, cached

**TMDB is the metadata backbone.** It's free, richly localized (matches TV Time's 14 languages), covers TV + movies + images, and — decisively — its **`/find/{external_id}?external_source=tvdb_id|imdb_id`** endpoint resolves TheTVDB and IMDb IDs to TMDB entities for **movies, shows, seasons, and episodes**. That is the precise bridge from a TV Time export into a live catalog.

We **cache every fetched entity into our own Postgres** (a local "catalog" mirror) for three reasons: resilience (never repeat TV Time's single-source-of-truth mistake), speed, and self-host friendliness (a private instance isn't hammering TMDB). A nightly worker refreshes air dates and "next episode" data. Attribution to TMDB is displayed as their terms require.

### 6.5 Data model (core entities)

| Entity | Key fields |
|---|---|
| `user` | id, handle, email, locale, prefs (languages, notif settings) |
| `show` | id, tmdb_id, tvdb_id, imdb_id, title, status, runtime, poster… (cached from TMDB) |
| `season` / `episode` | show_id, number, air_date, runtime, external ids |
| `movie` | id, tmdb_id, imdb_id, title, release_date, runtime |
| `follow` | user_id, show_id, state (`watching`/`stopped`/`archived`), created_at |
| `watch` | user_id, target (episode_id \| movie_id), **watched_at**, source (`import`/`manual`/`scrobble`) |
| `reaction` | user_id, target, type (`love`/`like`) — *no star scores* |
| `favorite_character` | user_id, show_id/movie_id, character_id |
| `comment` | user_id, episode_id/movie_id, body, spoiler-gated by watch state |
| `list` | user_id, name, items (mixed shows+movies), public? |
| `badge_award` | user_id, badge_key, awarded_at |
| `friendship` / `activity` | follow graph + feed events |

The `watch` table is the crown jewel: preserving `watched_at` from the import is what makes a user's stats, streaks, and "Watch Time" clock survive the move intact.

### 6.6 The import pipeline — the hero feature

A resumable, idempotent background job (BullMQ) with a live progress UI:

1. **Ingest.** User uploads the TV Time GDPR export (ZIP/CSV) *or* the `tv-time-liberator` JSON. We detect format and normalize to one internal shape.
2. **Resolve IDs.** For each item, map **TVDB/IMDb → TMDB** via `/find`. Prefer IMDb ID (most reliable); fall back to TVDB ID; cache every mapping so repeat imports are instant.
3. **Hydrate catalog.** Upsert the show/season/episode/movie from TMDB into our local catalog.
4. **Write history.** Create `follow`, `watch` (with **original `watched_at`**), `reaction` (love/like), favorites, and custom lists. Idempotent on (user, target) so re-running never double-counts.
5. **Reconcile & report.** Produce a summary: X shows, Y episodes, Z movies imported; a **review queue** for the handful that couldn't be matched or where numbering differs.

**Known edge cases (and handling):**
- **Episode-numbering / ordering drift** between TheTVDB (TV Time's world) and TMDB. Match by season+episode number *and* air date; when they disagree, match on the episode's IMDb ID; if still ambiguous, surface it in the review queue rather than guessing.
- **Specials** (`special: true`) — map to TMDB season 0; keep flagged.
- **Anime / alternate orderings** — the classic tracker headache; IMDb-ID-first matching mitigates it, review queue catches the rest.
- **Reactions vs ratings** — import love/like as reactions; never fabricate a star score.
- **Scale** — a heavy user has tens of thousands of episode rows; batch TMDB lookups, cache aggressively, stream progress.

### 6.7 Search, jobs, notifications

**Meilisearch** (self-hostable, typo-tolerant) for instant show/movie/user search. **BullMQ on Redis** for import, metadata refresh, the airing-calendar builder, and notification dispatch. Notifications via push (Expo push / web push) for "airs in ~1 hour," mirroring TV Time.

### 6.8 Self-hosting & the hosted instance

A **`docker compose up`** brings the whole stack (API, Postgres, Redis, Meilisearch, workers, web) online; the operator supplies their own free TMDB key. The **hosted instance** at our domain runs the identical images for non-technical users. Same code, two deployment shapes — the guarantee that the app can never simply vanish.

---

## 7. Recommended tech stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | Turborepo + pnpm | One repo, shared TS packages |
| Mobile | **Expo / React Native** | iOS + Android from shared React; OTA updates |
| Web | **Next.js (React)** | SSR, shares components/logic with mobile |
| Language | **TypeScript everywhere** | Max reuse + largest contributor pool |
| API | **NestJS** (Node) + OpenAPI | Structured, documented, testable |
| ORM/DB | **Prisma + PostgreSQL** | Relational fit for shows→seasons→episodes→watches |
| Cache/queue | **Redis + BullMQ** | Caching + resumable import/metadata jobs |
| Search | **Meilisearch** | Fast, self-hostable |
| Metadata | **TMDB API** (+ local cache) | Free, localized, `/find` by TVDB/IMDb id |
| Auth | Email/password + OAuth (Auth.js/Lucia) | Standard, self-host friendly |
| Deploy | Docker Compose (self-host) / containers (hosted) | Identical images both ways |

*Primary alternative:* Flutter clients over the same Node/Postgres backend, if the team prefers Dart and single-binary parity.

---

## 8. Roadmap

| Phase | Theme | Ships |
|---|---|---|
| **0 — Foundations** (wks 1–3) | Skeleton | Monorepo, auth, TMDB catalog cache, Docker compose, CI |
| **1 — Lifeboat / MVP** (wks 4–10) | *Import & keep going* | **TV Time importer**, follow/track, mark-watched, progress & next-up, watchlists, upcoming calendar + notifications, profile + Watch Time clock, web + mobile, **public export** |
| **2 — Community** (wks 11–20) | Feel like home | Reactions, comments + no-spoiler walls, favorite characters, friends + activity feed, badges, Discover/trending/most-binged, stats & "wrapped" |
| **3 — Beyond** | Beat the incumbents | Auto-scrobble browser extension, Plex/Jellyfin webhooks, public API, Trakt/Simkl import, optional federation |

Timeline assumes a small core team; the open-source model lets Phase-2 breadth parallelize across contributors.

---

## 9. Sustainability (so we don't repeat history)

TV Time died on economics, not popularity. Our defenses:
- **Low fixed cost.** Cached metadata, modest infra, no ad tech to maintain.
- **Distributed cost.** Power users and communities self-host and carry their own compute.
- **Optional funding, not gates.** Donations / OpenCollective / GitHub Sponsors; an optional hosted **"Supporter" tier** for cosmetic/convenience perks — never paywalling core tracking (the thing "no demand for a paid app" taught us).
- **No data moat, on purpose.** Because anyone can leave with a full export, we have to earn retention with quality, not lock-in — which keeps the project honest.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **TMDB terms / rate limits** at scale | Aggressive local caching; attribution; batch lookups; per-instance keys for self-host |
| **Import mismatches** (TVDB↔TMDB numbering, anime) | IMDb-ID-first matching + air-date reconciliation + user review queue |
| **Trademark/branding** | Ship under our own name/assets ("Watch Hoard"); never reuse TV Time's marks; "compatible with your TV Time export" is fine, "TV Time" as our name is not |
| **Community moderation** (comments, spoilers, abuse) | No-spoiler gating built into the schema; report/moderation tools before opening comments at scale |
| **Viral hosted-instance cost spike** | Caching + rate limits + queue backpressure; push heavy users toward self-host |
| **Contributor bandwidth** (open-source stall) | Tight, faithful MVP scope; reuse MIT-licensed exporters; good docs & "good first issues" |
| **The July 15 clock** | Ship the **importer as a standalone tool first** so people can capture data now even before the full app is ready |

---

## 11. Open decisions

- **License:** AGPLv3 (protects the open-source-forever promise against closed forks) vs MIT (max adoption). *Leaning AGPL given the anti-lock-in mission.*
- **Clients:** confirm React Native/Expo vs Flutter.
- **Anime as a first-class pillar** (Simkl's edge) — in or out for v1?
- **Federation** (ActivityPub) — Phase 3 stretch or explicit non-goal?
- **Name** — keep "Watch Hoard," or pick another.

## 12. Immediate next steps

1. **Grab a TV Time export now** (yours + a few volunteers') to use as real import fixtures — the data disappears July 15.
2. Stand up the **monorepo + Docker skeleton** and a TMDB catalog-cache spike.
3. Build the **importer as a standalone CLI/web tool** first (fastest path to real value + de-risks the hero feature).
4. Decide license + client framework (§11) so scaffolding can begin.

---

## Appendix — Sources

- [TV Time is shutting down — official notice (Whip Media support)](https://whipmedia.freshdesk.com/support/solutions/articles/68000029988-tv-time-is-shutting-down)
- [Popular TV-tracking app TV Time is shutting down as company focuses on AI — TechCrunch](https://techcrunch.com/2026/07/02/popular-tv-tracking-app-tv-time-is-shutting-down-as-company-focuses-on-ai/)
- [TV Time — Wikipedia (history, features, metadata)](https://en.wiki