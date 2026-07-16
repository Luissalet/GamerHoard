-- Watch Hoard — per-user app tables (the tracking core the app reads/writes today).
-- These MIRROR the on-device SQLite shape 1:1 (same column names/types) so the
-- SupabaseSource is a faithful drop-in for LocalSource. Every row is owned by a
-- Supabase auth user (profile_id = auth.uid()) and protected by RLS.
--
-- The rich normalized social schema (0001) stays for Phase 3 (comments, follows
-- graph, federation). This file is what powers cloud sync of your library now.
-- Idempotent: safe to run more than once.

-- ---------- profile (one row per user) ----------
create table if not exists app_profile (
  profile_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  handle          text,
  series_clock    text,
  episodes        integer not null default 0,
  movies_clock    text,
  movies          integer not null default 0,
  shows_added     integer not null default 0,
  following       integer not null default 0,
  lists           integer not null default 0,
  badges          integer not null default 0,
  reactions       integer not null default 0,
  comments        integer not null default 0,
  character_votes integer not null default 0
);

-- ---------- shows (denormalized, UI-shaped) ----------
create table if not exists app_shows (
  profile_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tvdb_id            integer not null,
  title              text not null,
  state              text not null default 'watching',
  is_favorite        integer not null default 0,
  watched_episodes   integer not null default 0,
  last_season        integer,
  last_episode       integer,
  last_watched_at    text,
  poster             text,
  tmdb_status        text,
  total_episodes     integer,
  network            text,
  last_aired_season  integer,
  last_aired_episode integer,
  next_air_date      text,
  next_season        integer,
  next_episode       integer,
  na_checked         integer not null default 0,
  primary key (profile_id, tvdb_id)
);
create index if not exists app_shows_last_idx on app_shows (profile_id, last_watched_at desc);

-- ---------- per-episode watched state ----------
create table if not exists app_ep_state (
  profile_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tvdb_show_id  integer not null,
  season        integer not null,   -- sentinel row season=-1,episode=-1 marks "seeded from TMDB"
  episode       integer not null,
  primary key (profile_id, tvdb_show_id, season, episode)
);

-- ---------- movies ----------
create table if not exists app_movies (
  profile_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  uuid         text not null,
  title        text not null,
  slug         text,
  year         integer,
  watched_at   text,
  poster       text,
  release_date text,
  rd_checked   integer not null default 0,
  primary key (profile_id, uuid)
);
create index if not exists app_movies_watched_idx on app_movies (profile_id, watched_at desc);

-- ---------- reviews ----------
create table if not exists app_reviews (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text        text not null,
  entity_type text,
  title       text,
  is_spoiler  integer not null default 0,
  like_count  integer not null default 0,
  created_at  text
);
create index if not exists app_reviews_created_idx on app_reviews (profile_id, created_at desc);

-- ---------- badges ----------
create table if not exists app_badges (
  id         bigint generated always as identity primary key,
  profile_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text,
  label      text not null,
  grp        text,
  show_tvdb  integer
);
create index if not exists app_badges_profile_idx on app_badges (profile_id);

-- ---------- lists ----------
create table if not exists app_lists (
  id         bigint generated always as identity primary key,
  profile_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  is_public  integer not null default 0,
  item_count integer not null default 0
);
create index if not exists app_lists_profile_idx on app_lists (profile_id);

-- ---------- recent activity ----------
create table if not exists app_recent (
  id         bigint generated always as identity primary key,
  profile_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null,
  title      text,
  season     integer,
  episode    integer,
  watched_at text,
  poster     text
);
create index if not exists app_recent_idx on app_recent (profile_id, watched_at desc);

-- ---------- Row Level Security: each user sees only their own rows ----------
do $$
declare t text;
begin
  foreach t in array array[
    'app_profile','app_shows','app_ep_state','app_movies',
    'app_reviews','app_badges','app_lists','app_recent'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "owner all" on %I', t);
    execute format(
      'create policy "owner all" on %I using (profile_id = auth.uid()) with check (profile_id = auth.uid())', t
    );
  end loop;
end $$;
