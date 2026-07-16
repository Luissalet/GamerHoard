-- Watch Hoard — core schema (PostgreSQL / Supabase)
-- One clean relational database replacing TV Time's MySQL-monolith + DynamoDB-microservice sprawl.
-- Pure Postgres: runs on Supabase, plain Postgres, or self-hosted. RLS lives in 0002_rls.sql.

create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists pg_trgm;       -- fuzzy title search (movies matched by name)

-- ---------- enums ----------
create type follow_state   as enum ('watching', 'stopped', 'archived');
create type target_type    as enum ('episode', 'movie');
create type entity_type    as enum ('show', 'season', 'episode', 'movie');
create type list_item_type as enum ('show', 'movie', 'episode');
create type watch_source   as enum ('import', 'manual', 'scrobble');

-- ---------- identity ----------
-- On Supabase, profiles.id references auth.users(id). The FK is added in 0002 so this file
-- also applies on a plain Postgres (no auth schema) for testing/self-host.
create table profiles (
  id           uuid primary key default gen_random_uuid(),
  handle       text unique not null,
  display_name text,
  avatar_url   text,
  banner_url   text,
  bio          text,
  locale       text not null default 'en',
  timezone     text not null default 'UTC',
  is_public    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------- catalog (cached from TMDB) ----------
create table shows (
  id          uuid primary key default gen_random_uuid(),
  tmdb_id     integer unique,
  tvdb_id     integer,
  imdb_id     text,
  title       text not null,
  overview    text,
  status      text,
  first_air   date,
  network     text,
  poster_path text,
  backdrop_path text,
  runtime_min integer,
  genres      text[] default '{}',
  synced_at   timestamptz not null default now()
);
create index shows_tvdb_idx on shows (tvdb_id);
create index shows_title_trgm on shows using gin (title gin_trgm_ops);

create table seasons (
  id          uuid primary key default gen_random_uuid(),
  show_id     uuid not null references shows(id) on delete cascade,
  number      integer not null,
  title       text,
  air_date    date,
  unique (show_id, number)
);

create table episodes (
  id            uuid primary key default gen_random_uuid(),
  show_id       uuid not null references shows(id) on delete cascade,
  season_number integer not null,
  number        integer not null,
  abs_number    integer,
  title         text,
  overview      text,
  air_date      date,
  runtime_min   integer,
  is_special    boolean not null default false,
  tmdb_id       integer,
  tvdb_id       integer,
  unique (show_id, season_number, number)
);
create index episodes_tvdb_idx on episodes (tvdb_id);
create index episodes_show_idx on episodes (show_id);

create table movies (
  id          uuid primary key default gen_random_uuid(),
  tmdb_id     integer unique,
  tvdb_id     integer,
  imdb_id     text,
  title       text not null,
  overview    text,
  release_date date,
  runtime_min integer,
  poster_path text,
  backdrop_path text,
  genres      text[] default '{}',
  synced_at   timestamptz not null default now()
);
create index movies_title_trgm on movies using gin (title gin_trgm_ops);

create table characters (
  id       uuid primary key default gen_random_uuid(),
  tmdb_id  integer,
  tvdb_id  integer,
  show_id  uuid references shows(id) on delete cascade,
  name     text not null
);
create index characters_tvdb_idx on characters (tvdb_id);

-- ---------- tracking ----------
create table follows (
  profile_id      uuid not null references profiles(id) on delete cascade,
  show_id         uuid not null references shows(id) on delete cascade,
  state           follow_state not null default 'watching',
  is_favorite     boolean not null default false,
  notif_offset_min integer,          -- minutes before air (TV Time default 1440 = 24h)
  notif_type      integer,
  followed_at     timestamptz not null default now(),
  primary key (profile_id, show_id)
);
create index follows_profile_idx on follows (profile_id);

-- The ledger. rewatch_index=0 is the first watch; 1,2… are rewatches.
create table watches (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles(id) on delete cascade,
  target_type   target_type not null,
  episode_id    uuid references episodes(id) on delete cascade,
  movie_id      uuid references movies(id) on delete cascade,
  rewatch_index integer not null default 0,
  watched_at    timestamptz,
  source        watch_source not null default 'import',
  created_at    timestamptz not null default now(),
  constraint watch_target_ck check (
    (target_type = 'episode' and episode_id is not null and movie_id is null) or
    (target_type = 'movie'   and movie_id   is not null and episode_id is null)
  ),
  -- idempotent import: one row per (user, target, rewatch). NULLS NOT DISTINCT so the
  -- always-NULL unused target column doesn't defeat de-duplication.
  constraint watches_uq unique nulls not distinct (profile_id, target_type, episode_id, movie_id, rewatch_index)
);
create index watches_profile_time_idx on watches (profile_id, watched_at desc);
create index watches_episode_idx on watches (episode_id);
create index watches_movie_idx on watches (movie_id);

create table watchlist (
  profile_id  uuid not null references profiles(id) on delete cascade,
  item_type   list_item_type not null,
  show_id     uuid references shows(id) on delete cascade,
  movie_id    uuid references movies(id) on delete cascade,
  episode_id  uuid references episodes(id) on delete cascade,
  added_at    timestamptz not null default now(),
  unique nulls not distinct (profile_id, item_type, show_id, movie_id, episode_id)
);

-- ---------- reactions (three distinct systems, per the real export) ----------
create table ratings (          -- qualitative bucket (e.g. 1..5), NOT free-form stars
  profile_id  uuid not null references profiles(id) on delete cascade,
  target_type target_type not null,
  episode_id  uuid references episodes(id) on delete cascade,
  movie_id    uuid references movies(id) on delete cascade,
  value       smallint not null,
  created_at  timestamptz not null default now(),
  unique nulls not distinct (profile_id, target_type, episode_id, movie_id)
);

create table emotion_votes (    -- "feelings" reactions
  profile_id  uuid not null references profiles(id) on delete cascade,
  target_type target_type not null,
  episode_id  uuid references episodes(id) on delete cascade,
  movie_id    uuid references movies(id) on delete cascade,
  emotion_id  integer not null,
  created_at  timestamptz not null default now(),
  unique nulls not distinct (profile_id, target_type, episode_id, movie_id, emotion_id)
);

create table character_votes (
  profile_id   uuid not null references profiles(id) on delete cascade,
  episode_id   uuid not null references episodes(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (profile_id, episode_id, character_id)
);

-- ---------- community ----------
create table comments (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  entity_type entity_type not null,
  show_id     uuid references shows(id) on delete cascade,
  episode_id  uuid references episodes(id) on delete cascade,
  movie_id    uuid references movies(id) on delete cascade,
  body        text not null,
  is_spoiler  boolean not null default false,
  lang        text,
  parent_id   uuid references comments(id) on delete cascade,
  like_count  integer not null default 0,
  report_count integer not null default 0,
  created_at  timestamptz not null default now()
);
create index comments_entity_idx on comments (entity_type, show_id, episode_id, movie_id);

create table comment_likes (
  profile_id uuid not null references profiles(id) on delete cascade,
  comment_id uuid not null references comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, comment_id)
);

create table comment_translations (
  comment_id uuid not null references comments(id) on delete cascade,
  dest_lang  text not null,
  body       text not null,
  confidence real,
  primary key (comment_id, dest_lang)
);

-- ---------- lists / social / gamification ----------
create table lists (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  name        text not null,
  description text,
  is_public   boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create table list_items (
  list_id    uuid not null references lists(id) on delete cascade,
  item_type  list_item_type not null,
  show_id    uuid references shows(id) on delete cascade,
  movie_id   uuid references movies(id) on delete cascade,
  episode_id uuid references episodes(id) on delete cascade,
  position   integer not null default 0,
  added_at   timestamptz not null default now()
);
create index list_items_list_idx on list_items (list_id);

create table friendships (
  profile_id uuid not null references profiles(id) on delete cascade,
  friend_id  uuid not null references profiles(id) on delete cascade,
  affinity   real,
  created_at timestamptz not null default now(),
  primary key (profile_id, friend_id)
);

create table activities (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  verb        text not null,          -- watched | rated | commented | followed | listed
  target_type text,
  target_id   uuid,
  created_at  timestamptz not null default now()
);
create index activities_profile_time_idx on activities (profile_id, created_at desc);

create table badge_awards (
  profile_id uuid not null references profiles(id) on delete cascade,
  badge_key  text not null,           -- e.g. 'marathoner-5-within-24' or 'commented-episode'
  show_id    uuid references shows(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (profile_id, badge_key, show_id)
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  type        text not null,
  entity_type text,
  entity_id   uuid,
  body        text,
  url         text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_profile_idx on notifications (profile_id, is_read, created_at desc);

create table where_to_watch_votes (
  profile_id  uuid not null references profiles(id) on delete cascade,
  target_type target_type not null,
  episode_id  uuid references episodes(id) on delete cascade,
  movie_id    uuid references movies(id) on delete cascade,
  platform    text not null,
  vote_type   text,
  created_at  timestamptz not null default now()
);

create table profile_settings (
  profile_id uuid not null references profiles(id) on delete cascade,
  key        text not null,
  value      jsonb,
  primary key (profile_id, key)
);

-- ---------- import bookkeeping (idempotent, resumable migrations) ----------
create table import_jobs (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  status      text not null default 'pending',   -- pending|running|done|failed
  source      text not null default 'tvtime-gdpr',
  totals      jsonb,                              -- reconstructed counts
  unresolved  jsonb,                              -- review queue (unmatched titles)
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

-- ---------- external-id resolution cache (TVDB/IMDb/title -> our catalog) ----------
create table id_map (
  source      text not null,        -- tvdb | imdb | title
  external_id text not null,
  kind        entity_type not null,
  show_id     uuid references shows(id) on delete cascade,
  episode_id  uuid references episodes(id) on delete cascade,
  movie_id    uuid references movies(id) on delete cascade,
  primary key (source, external_id, kind)
);
