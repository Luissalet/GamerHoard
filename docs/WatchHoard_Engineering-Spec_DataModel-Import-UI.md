# Watch Hoard — Engineering Spec: Data Model, Import & UI Teardown

*Grounded in a real TV Time GDPR export (51 tables, ~15k tracking records) + 24 screenshots of the live app + a scan of all public TV Time code. Companion to `Watch-Hoard_TV-Time-Successor-Plan.md`.*

**Date:** July 6, 2026

---

## 1. What this document is

The strategic plan said "import your data and keep going." This is the concrete engineering backing for that promise. It reverse-engineers TV Time's actual structure from three primary sources now in the repo:

- **`WatchHoard/tv-time-data/`** — a real GDPR account dump: 51 CSV tables including the full tracking ledger (`tracking-prod-records-v2.csv`, 15,380 rows), follows, comments, ratings, emotions, lists, badges, and settings.
- **`WatchHoard/Screenshots/`** — 24 screenshots of the current app (Shows, Movies, Explore, Profile, the deep Stats screens, and a show detail page).
- **Public code scan** — what exists on GitHub (spoiler: no core source, but enough SDK/wrapper surface to confirm the API).

Treat the `tv-time-data` folder as our **golden import fixture** — build the importer as a test against these exact files.

---

## 2. TV Time's real backend, inferred from the dump

The table set tells a clear architectural story — useful because it shows what a mature version of this product became, and what we can simplify.

**It started as a relational monolith and migrated to DynamoDB microservices.** Two generations of tables coexist in the export:

- **Legacy monolith (MySQL-style):** `user` (one wide row with ~50 columns — FB/Twitter/Tumblr OAuth tokens, notification flags, language), `followed_tv_show`, `episode_comment`, `show_comment`, `show_comment_like`, `friend`. Single-integer `user_id` (e.g. `48723904`), TheTVDB integer show IDs.
- **Newer service tables (DynamoDB-style):** everything with `*-prod-*` / `*-live-*` names and telltale key columns — `hash_key`, `range_key`, `gsi`, `sort_key`, `uuid`, `s_key`, `tenant` (value `tvt`). Distinct services are visible: **tracking** (`tracking-prod-records`, `-v2`, `-count-by-timeframe`), **comments**, **lists**, **notifications**, **ratings**, **emotions**, **recommendations**, **stats**, **where-to-watch**, and a multi-provider **auth** service (`auth-prod-login` with `provider`/`external_id`/`encrypted_secret`).

**Supporting infrastructure** is legible from the telemetry tables: **FCM** push (`device_token.fcm_registration_token`), **CloudFront** image CDN (`d1zfszn0v5ya99.cloudfront.net` in notification payloads), deep links (`tvst://…`, action `com.tozelabs.tvshowtime.NOTIFICATION`), and a marketing/analytics stack — **AppsFlyer** (`_appsflyer_ids`), **Braze/Appboy** and **Apptimize** (`user_setting` flags `is_tracked_on_appboy`, `is_tracked_on_apptimize`).

**Lesson for us:** the two-generation sprawl is exactly the accidental complexity we skip. One PostgreSQL database with clean relational tables replaces this entire zoo. We keep the *concepts* (tracking, reactions, lists, social) and drop the distributed-DynamoDB machinery.

---

## 3. Identity systems (the crux of the import)

Getting IDs right is the whole game. The dump reveals **three** identifier systems:

| Entity | Identifier in export | Maps to TMDB via |
|---|---|---|
| **Shows** | TheTVDB integer, e.g. `tv_show_id`/`s_id` = `70350` (Neon Genesis Evangelion), `281622` | `/find/{id}?external_source=tvdb_id` |
| **Episodes** | TheTVDB integer, e.g. `ep_id`/`episode_id` = `5963112` | `/find` by `tvdb_id` (episode) → else season+ep number |
| **Characters/people** | TheTVDB integer, `show_character_id` = `68370636` | person `/find` by `tvdb_id` |
| **Movies (in tracking)** | TheTVDB "unitary" entry — `s_id` present, `is_unitary=true` | `/find` by `tvdb_id` (movie) |
| **Movies (in social/lists)** | **TV Time UUID + title only**, e.g. `entity_uuid` + `movie_name="A Man Called Otto"` | **title (+year) search** — no external ID |
| **Comments/lists/votes** | TV Time UUIDs (`comment_uuid`, `entity_uuid`, list `objects[].uuid`) | resolve via attached `*_name` + `entity_type` |

**The key finding:** watch history (the part that matters most) is keyed by **TheTVDB IDs**, which TMDB's `/find` resolves directly. But the newer **reactions/comments/lists** use opaque **TV Time UUIDs** with only a human-readable `movie_name`/`series_name` attached — so those must be matched to TMDB by **title + type (+ season/episode)**, which is lossy and needs a review queue. Onboarding show IDs in `user_setting` (`71663`=The Simpsons, `305288`=Stranger Things, `327417`=Money Heist…) confirm shows = TheTVDB throughout.

---

## 4. The 51 tables, by domain — and what we do with each

**✅ Import · 🔁 Recompute (don't import) · ⛔ Skip (infra/PII)**

**Core tracking**
- ✅ `tracking-prod-records-v2.csv` [15,380] — the ledger. Row types keyed by `key`: `user-series-{uuid}` = follow state (`is_followed`,`is_for_later`,`is_archived`,`followed_at`,`s_id`); `watch-episode-{…}` = a watch (`ep_id`,`s_id`,`s_no`,`ep_no`,`rewatch_count`,`runtime`,`is_special`,`is_unitary`); `tracking-stats` = account totals.
- ✅ `tracking-prod-records.csv` [9,074] — v1 ledger (`series_id`, `episode_id`, `watch_count`, `watch_date`, `release_date`). Merge/dedupe with v2.
- ✅ `show_seen_episode_latest.csv` [281] — last-seen episode per show. Use to **verify** the progress pointer we derive.
- 🔁 `tracking-prod-count-by-timeframe.csv`, `tracking-deployment-prod-tracks.csv` — derived counts.

**Follows / show state**
- ✅ `followed_tv_show.csv` [317] — `active`, `archived`, `diffusion`, `notification_type`, `notification_offset` (minutes; `1440`=24h), `folder_id`.
- ✅ `user_tv_show_data.csv` [472] — `is_followed`, `is_favorited`, `nb_episodes_seen` (denormalized).
- ✅ `user_show_special_status.csv` [3] — `status` (e.g. `for_later`).
- ✅ `followed_tv_show_source.csv` [12] — where the follow came from (attribution).

**Reactions (three distinct systems — corrects the plan's "no ratings" note)**
- ✅ `ratings-live-votes.csv` [45] + `ratings-3-prod-episode_votes.csv` [4] — **qualitative ratings** (not 1–10 stars). `vote_key = {entity_uuid}-{user_id}-{N}`; N is the rating bucket. UI renders buckets like **"Bad"** and aggregates "most-voted rating per show."
- ✅ `emotions-live-votes.csv` [13] + `emotions-3-prod-episode_votes.csv` [3] — **emotion/feeling** votes. Same `vote_key` shape; N = emotion ID.
- ✅ `show_character_episode_vote.csv` [1] — **favorite character** per episode (`show_character_id`, `episode_id`).
- 🔁 `tv_show_user_emotion_count.csv` — aggregate; recompute.

**Community / comments**
- ✅ `comments-prod-comments.csv` [320] — modern comments: `text`, `entity_type`∈{movie,show,episode}, `entity_uuid`, `is_spoiler`, `spoiler_count`, `like_count`, `reply_count`, `lang`, `report_count`, `sort_key`.
- ✅ `episode_comment.csv`, `show_comment.csv`, `show_comment_like.csv` — legacy comments (`depth`, `parent_comment_id`, `nb_likes`, `extended_comment`, `posted_on_fb/twitter`). Merge into one comment model.
- ✅ `comment_translation.csv` [4] — auto-translations (`source_lang`,`dest_lang`,`translation`,`confidence`) — the multilingual community layer.
- ⛔/✅ `object_report.csv` [1] — moderation reports (import as moderation seed, optional).

**Lists**
- ✅ `lists-prod-lists.csv` [5] — `name`, `description`, `is_public`, `ordering`, and `objects` = array of `{type, uuid, created_at}` (mixes movies/shows/episodes).

**Social graph**
- ✅ `friend.csv` [6] — `friend_id`, `affinity`.
- ✅ `user_connection.csv` [1,200] — connection/activity events.

**Profile / account / settings**
- ✅ `user.csv` [1] — account row: `language`, `timezone`, `default_diffusion`, `default_notification_offset`, notif flags, `public_profile`. (Discard legacy FB/Twitter/Tumblr tokens.)
- ✅ `user_social_data.csv` [1] — `screen_name`, avatar `image_id`, (gender/birthday — **PII, handle carefully**).
- ✅ `user_setting.csv` [13] — KV settings: `locale`, `is_using_dark_mode`, `marketing_opt_in`, `show_ids_in_onboarding`, `last_*` timestamps.
- ✅ `user_personal_data.csv` [4] — KV personal fields.
- ✅ `auth-prod-login.csv` — providers (`provider`,`external_id`); **re-authenticate, never import secrets/hashes.**
- 🔁 `user_statistics.csv`, `stats-prod-cache.csv`, `show_addiction_score.csv`, `user_leaderboard.csv`, `user_last_updated.csv` — all derived; recompute (values are stale/inconsistent across services anyway — e.g. `nb_episodes_watched=0` vs the ledger's 14,611).

**Gamification**
- ✅ `user_badge.csv` [53] — earned badges (see §7 for the parseable ID format).

**Where-to-watch**
- ✅ `where-to-watch-prod-table.csv` [11] — community streaming-availability votes (`network_platform`, `vote_type`). Optional but on-brand.

**Notifications**
- 🔁 `notifications-prod-notifications.csv` [62] — rich notif history (`type`,`object_type`,`object_id`,`html_text`,`url`,`is_read`). Regenerate going forward; optional to import as history.

**⛔ Skip — infra / telemetry / PII** (not useful to a new app, and privacy-sensitive): `ad_identifier`, `_appsflyer_ids`, `ip_address` [432], `_user_creation_ip`, `device_token`, `device_data`, `user_device`, `refresh_token`, `install_tracking`, `installed_app`, `user_session`, `user_platform`, `webhook_data`, `gdpr_requests`, `recommendations-prod-*` (rebuild our own).

---

## 5. Successor data model (PostgreSQL)

Clean relational model that captures everything worth keeping:

```
user(id, handle, email, locale, timezone, avatar_url, banner_url, is_public, created_at)
auth_identity(user_id, provider, external_id)              -- re-auth; no secrets imported

-- Catalog (cached from TMDB, keyed by our id + external ids)
show(id, tmdb_id, tvdb_id, imdb_id, title, status, first_air, network, poster, runtime)
season(id, show_id, number, air_date)
episode(id, show_id, season_number, number, abs_number, title, air_date, runtime, is_special,
        tmdb_id, tvdb_id)
movie(id, tmdb_id, imdb_id, tvdb_id, title, release_date, runtime, poster)
character(id, tmdb_id, tvdb_id, show_id, name)

-- Tracking
follow(user_id, show_id, state ENUM('watching','stopped','archived'),
       is_favorite, followed_at, notif_offset_min, notif_type)
watch(user_id, target_type ENUM('episode','movie'), target_id, watched_at,
      rewatch_index INT, source ENUM('import','manual','scrobble'))   -- PK dedupes rewatches
watchlist(user_id, target_type, target_id, added_at)                  -- TV Time "for later"

-- Reactions
rating(user_id, target_type, target_id, value SMALLINT)               -- qualitative bucket
emotion_vote(user_id, target_type, target_id, emotion_id)
character_vote(user_id, episode_id, character_id, created_at)

-- Community
comment(id, user_id, entity_type ENUM('show','season','episode','movie'), entity_id,
        body, is_spoiler, lang, parent_id, like_count, report_count, created_at)
comment_like(user_id, comment_id, created_at)
comment_translation(comment_id, dest_lang, text, confidence)

-- Lists / social / gamification
list(id, user_id, name, description, is_public, position)
list_item(list_id, target_type, target_id, position, added_at)
friendship(user_id, friend_id, affinity, created_at)
activity(user_id, verb, target_type, target_id, created_at)           -- feed
badge_award(user_id, badge_key, show_id NULL, awarded_at)
notification(user_id, type, entity_type, entity_id, body, url, is_read, created_at)
where_to_watch_vote(user_id, target_type, target_id, platform, vote_type)
user_setting(user_id, key, value)
```

`watch` with a composite PK on `(user_id, target_type, target_id, rewatch_index)` makes the import **idempotent** and preserves rewatches. Stats tables are intentionally absent — they're a materialized view / cache we recompute (§6).

---

## 6. Import spec — field mapping

Pipeline stays as in the plan (ingest → resolve IDs → hydrate catalog → write history → reconcile), now with exact bindings:

| Source CSV | → Target | Mapping notes |
|---|---|---|
| `tracking-prod-records-v2` `key=user-series-*` | `follow` | `s_id`(TVDB)→show; flags → `state`; `followed_at` (µs epoch) |
| `tracking-prod-records-v2` `key=watch-episode-*` | `watch` | `ep_id`(TVDB)→episode; `rewatch_count`→rows; `is_unitary=true`→movie; `runtime` for stats |
| `tracking-prod-records` (v1) | `watch` | merge by `episode_id`/`watch_date`; dedupe against v2 |
| `followed_tv_show` + `user_tv_show_data` + `user_show_special_status` | `follow` | `is_favorited`→`is_favorite`; `notification_offset`→`notif_offset_min`; `status=for_later`→`watchlist` |
| `ratings-live-votes` (+`ratings-3-*`) | `rating` | parse trailing `-N` of `vote_key`; entity via `*_name`+type |
| `emotions-live-votes` (+`emotions-3-*`) | `emotion_vote` | trailing `-N` = `emotion_id` |
| `show_character_episode_vote` | `character_vote` | `show_character_id`,`episode_id` (TVDB) |
| `comments-prod-comments` (+ legacy `episode_comment`,`show_comment`) | `comment` | `entity_type`+`entity_uuid`(+`*_name`); `is_spoiler`,`like_count`,`lang` |
| `show_comment_like` | `comment_like` | |
| `comment_translation` | `comment_translation` | |
| `lists-prod-lists` | `list` + `list_item` | parse `objects[]` → `{type,uuid}`; match by name+type |
| `friend` + `user_connection` | `friendship` / `activity` | `affinity` preserved |
| `user_badge` | `badge_award` | parse ID (§7) |
| `user` + `user_social_data` + `user_setting` + `user_personal_data` | `user` / `user_setting` | avatar via `image_id`→CDN URL; **drop PII we don't need** |
| `where-to-watch-prod-table` | `where_to_watch_vote` | optional |
| stats/rec/infra tables | — | recompute or skip (§4) |

**Reconciliation rules:** episodes match by `tvdb_id`, else by `show + season_number + episode_number`, else air-date; specials (`is_special`) → season 0; anything unresolved (especially UUID+title-only movies) → **review queue**, never a silent guess. Preserve original `watched_at` timestamps verbatim — they power every stat below.

---

## 7. Badge catalog (parsed from real `user_badge` IDs + UI)

Two ID shapes: **global slug** (`chose-emotion`) and **per-show** `{tvdb_show_id}-{type}-{threshold}-bd` (`262954-quick-watcher-10-bd`).

- **Discovery / social badges** (seen in UI): `SHOW OFF` (Rewind {year} share), `AUTHOR` (commented an episode), `EMO` (`chose-emotion`), `JURY` (voted for an actor/character), `ARCHIVIST` (`archived-show`), `PATROL` (`reported-comment` / reported a spoiler), `HIPSTER` (someone liked your comment), `SOCIALIZER` (`commented-show`), `NOMAD` (`used-mobile-version`), `SUPPORTER` (used/liked a comment → `got-comment-like`), `SURFER` (used web version), `MR CLEAN` (cleared watchlist), `MEME` (created a meme), `FEARLESS` (revealed spoiler comments).
- **Watching / "addiction" badges** (per show): `quick-watcher-{3,5,10}`, `marathoner-{3-within-24, 5-within-24, 20-within-48}`, `serial-watcher-{5,10,15,30}`.
- **Empty families to support:** rating badges, comment badges, following badges (counts were 0 for this user but the categories exist).

---

## 8. Stats to regenerate (from the Stats screens)

We recompute all of these from `watch`/`rating`/`comment` (never import the stale caches). The screens show exactly what to produce, for **Series and Movies** independently:

- **Time watched** ("clock"): total (e.g. *8 mo 23 d 22 h* series; *2 mo 21 d 3 h* movies) + last-7-days; bar charts by **week** and by **month**; "compare with people you follow."
- **Totals**: episodes watched (*14,611*), movies watched (*1,059*) + charts.
- **Top marathons** (show · episodes · hours), **shows added** (*455*, "*80 still in production*").
- **Popular genres** (Animation 301, Comedy 249…) and **popular networks** (Netflix 111, Tokyo MX 59…).
- **Ratings voted** (count + most-voted bucket per title), **character votes** (+ top character), **comments** (+ likes earned, comments-over-time chart).
- **Backlog & projections** (the delightful part): pending episodes (*2,039 across 92 started shows*), upcoming-episodes chart, **catch-up rate** (*3.19 eps/week*), **time-to-clear** (*965 h*), and a **projected catch-up date** (*2038-10-09*).
- **Badges**: app-badge grid, hexagonal watching-badge grid, and rating/comment/following counts.

A yearly **"Rewind"** (the `show-off-{year}` badge) is the natural wrapped feature.

---

## 9. UI teardown → screen inventory

From the screenshots, the client needs these screens (bottom nav: **Shows · Movies · Explore · Profile**; dark theme; Spanish shown → **i18n is mandatory**):

1. **Shows → Up Next** — next-episode list, poster/compact toggle, `S|E +N` behind-count, badges (Premiere/New/Last), circular **check-to-watch**; sections "Watch Next" and "Haven't watched in a while."
2. **Shows → Upcoming** — agenda grouped by day with **air time + network** and Aired/New badges.
3. **Movies → Up Next** — poster grid; **Movies → Upcoming** — grouped by release date with day-countdown.
4. **Explore** — sub-tabs **Feed / Discover / Groups / Activity** + search; rich content cards with quick-add and trailers. (**Groups** = community feature to preserve.)
5. **Profile** — banner + avatar + handle + edit; following/followers/comments counts; stats summary (clock + count); **Lists**, **Series**, **Favorite series**, **Movies** carousels; Series/Movies toggle.
6. **Statistics** — the deep multi-card screen in §8 (Series/Movies tabs).
7. **Show detail** — hero art; `seasons • status • network`; **match % badge** (e.g. "T 99%"); **Info / Episodes** tabs; "Continue watching" carousel; all-episodes with **mark-all**; season accordions with **green progress bar** and per-episode watched checks (absolute + relative numbering).
8. **Implied (from data, not screenshotted)** — episode detail with comments + emotion picker + character vote + spoiler wall; movie detail; settings; onboarding show-picker.

---

## 10. Public code scan — what exists, what's reusable

**No core TV Time source is public.** The app (`com.tozelabs.tvshowtime`) ships only as proprietary APKs (APKPure/Uptodown/Aptoide). The official `github.com/tvshowtime` org contains only integrations/SDKs:

- `tvshowtime/tvshowtime-plex-scrobbler` — Python; posts Plex watches to the API (**good reference for our Plex scrobbler**).
- `tvshowtime/tvshowtime-php-sdk` — PHP API client (last touched 2015; documents the OAuth2 API surface).

**Reusable community code (mostly MIT):**
- Exporters/migrators: `Hobo-Ware/tv-time-liberator`, `Portvgal/tv-time-capsule`, `lukearran/TvTimeToTrakt`, `scottymcraig/TVTimeToTraktSync` — **reuse their GDPR-parsing logic** for our importer.
- API wrappers: `onanypoint/tvshowtime-api`, `Lunik/tvshowtime-api` (Python), `EdgarVaguencia/tvtime-api`, `TheIndra55/tvtime-api` (Node), `IAM-marco/scraped-tvtime-api` (keyless scraper).
- Same-name-but-unrelated trackers (not TV Time code): `nofelmahmood/TvTime`, `MirzaBegunic/TvShowTime`, `arunkd13/tvtime-app`, `WinUICommunity/TvTime`.

**Conclusion:** we build the core fresh (which the plan already assumes), but the **API shape and data model are fully recoverable** from the SDKs + wrappers + this GDPR dump — no reverse-engineering of binaries needed. The importer can be prototyped **today** against `WatchHoard/tv-time-data/`.

---

## 11. Corrections to the strategic plan

Fold these back into `Watch-Hoard_TV-Time-Successor-Plan.md`:

1. **Ratings do exist** — as *qualitative buckets* (e.g. "Bad"), plus separate *emotion* votes and *character* votes. (Earlier "no numeric star ratings" was right that there are no 1–10 stars, but there is a rating system.) Model all three.
2. **Movie identity is split** — tracking uses TheTVDB unitary IDs (mappable), but social/lists use TV Time UUIDs + title only (title-match + review queue).
3. **Stats are recomputed, not imported** — the cached stat tables are stale/inconsistent; regenerate from the ledger.
4. **Backend was DynamoDB microservices over a legacy MySQL monolith** — we deliberately collapse both into one Postgres schema.
5. **Groups** (communities) and **where-to-watch** community votes are real features worth keeping on the roadmap.
```
