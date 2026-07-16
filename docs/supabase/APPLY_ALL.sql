-- Watch Hoard · esquema completo — PEGA TODO en el SQL Editor de Supabase
-- https://supabase.com/dashboard/project/mqguraohfkncwtzfvkfd/sql/new (una vez; 0003-0007 idempotentes)

-- ================ 0001_init.sql ================
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

-- ================ 0002_rls.sql ================
-- Watch Hoard — Row Level Security (Supabase)
-- Model: catalog is world-readable; personal data is private to its owner; public profiles/
-- comments/public lists are readable by anyone. Assumes Supabase auth (auth.uid()).

-- Tie profiles to Supabase auth users (only on Supabase; guarded so plain-PG tests skip it).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'auth') then
    alter table profiles
      add constraint profiles_auth_fk foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- Catalog: readable by everyone, writable only by service role (importer / metadata sync).
alter table shows      enable row level security;
alter table seasons    enable row level security;
alter table episodes   enable row level security;
alter table movies     enable row level security;
alter table characters enable row level security;

create policy "catalog read"  on shows      for select using (true);
create policy "catalog read"  on seasons    for select using (true);
create policy "catalog read"  on episodes   for select using (true);
create policy "catalog read"  on movies     for select using (true);
create policy "catalog read"  on characters for select using (true);

-- Profiles: public ones are readable by all; you can always read/update your own.
alter table profiles enable row level security;
create policy "profiles read public" on profiles for select using (is_public or id = auth.uid());
create policy "profiles update own"  on profiles for update using (id = auth.uid());
create policy "profiles insert self" on profiles for insert with check (id = auth.uid());

-- Helper: owner-only policy applied to all personal tables.
do $$
declare t text;
begin
  foreach t in array array[
    'follows','watches','watchlist','ratings','emotion_votes','character_votes',
    'comment_likes','lists','friendships','activities','badge_awards',
    'notifications','where_to_watch_votes','profile_settings','import_jobs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "owner all" on %I using (profile_id = auth.uid()) with check (profile_id = auth.uid())', t);
  end loop;
end $$;

-- Comments: owner writes; readable if you own it, it targets a public author, or you can see the thread.
alter table comments enable row level security;
create policy "comments read"   on comments for select using (true);
create policy "comments insert" on comments for insert with check (profile_id = auth.uid());
create policy "comments update" on comments for update using (profile_id = auth.uid());
create policy "comments delete" on comments for delete using (profile_id = auth.uid());

-- List items follow their list's owner.
alter table list_items enable row level security;
create policy "list items owner" on list_items using (
  exists (select 1 from lists l where l.id = list_id and l.profile_id = auth.uid())
) with check (
  exists (select 1 from lists l where l.id = list_id and l.profile_id = auth.uid())
);

-- Public lists are readable by anyone.
create policy "lists read" on lists for select using (is_public or profile_id = auth.uid());

-- ================ 0003_app_user_data.sql ================
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

-- ================ 0004_accounts.sql ================
-- Watch Hoard — accounts on top of the social `profiles` table (0001).
-- Registration = Supabase auth user + a public.profiles row (unique @handle). This is the
-- identity that comments/friends/lists FK to. Idempotent; safe to re-run.

-- 1) Handle availability check, callable BEFORE login (anon) for the signup form.
--    SECURITY DEFINER so it can read profiles past RLS (returns only a boolean).
create or replace function public.is_handle_available(p_handle text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where lower(handle) = lower(trim(p_handle))
  );
$$;
revoke all on function public.is_handle_available(text) from public;
grant execute on function public.is_handle_available(text) to anon, authenticated;

-- 2) Auto-create the profiles row when a new auth user is created. Reads @handle and
--    display name from signup metadata; guarantees a unique, well-formed handle.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_handle text;
  base       text;
  final      text;
  n          int := 0;
begin
  raw_handle := coalesce(nullif(new.raw_user_meta_data->>'handle', ''), split_part(new.email, '@', 1), 'user');
  base := lower(regexp_replace(raw_handle, '[^a-zA-Z0-9_]', '', 'g'));
  base := left(base, 20);
  if base is null or char_length(base) < 3 then
    base := 'user' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  final := base;
  while exists (select 1 from public.profiles where lower(handle) = lower(final)) loop
    n := n + 1;
    final := left(base, 16) || n::text;
  end loop;
  insert into public.profiles (id, handle, display_name)
  values (new.id, final, nullif(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ================ 0005_social_graph_and_reviews.sql ================
-- Watch Hoard — social graph (followers, Instagram/Twitter-style) + content reviews.
-- Idempotent. Follows reference profiles(id) (= auth.users id) so PostgREST can join profiles.

-- ===================== FOLLOW GRAPH =====================
-- Asymmetric follows. status: 'accepted' (public targets, instant) | 'pending' (private targets).
create table if not exists user_follows (
  follower_id  uuid not null references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  status       text not null default 'accepted' check (status in ('accepted','pending')),
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);
create index if not exists user_follows_following_idx on user_follows (following_id, status);
create index if not exists user_follows_follower_idx  on user_follows (follower_id, status);

alter table user_follows enable row level security;
-- Read: edges that involve you, or edges pointing at a public account (so anyone can browse a
-- public account's followers/following). Writes go through the SECURITY DEFINER RPCs below only.
drop policy if exists "follows visible" on user_follows;
create policy "follows visible" on user_follows for select using (
  follower_id = auth.uid()
  or following_id = auth.uid()
  or exists (select 1 from profiles p where p.id = following_id and p.is_public)
);

-- follow: accepted if target is public, else pending (request). Idempotent.
create or replace function public.follow_user(target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); is_pub boolean; st text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if target = me then raise exception 'cannot follow yourself'; end if;
  select is_public into is_pub from profiles where id = target;
  if is_pub is null then raise exception 'no such profile'; end if;
  st := case when is_pub then 'accepted' else 'pending' end;
  insert into user_follows (follower_id, following_id, status) values (me, target, st)
    on conflict (follower_id, following_id) do nothing;
  select status into st from user_follows where follower_id = me and following_id = target;
  return st;
end $$;

create or replace function public.unfollow_user(target uuid)
returns void language sql security definer set search_path = public as $$
  delete from user_follows where follower_id = auth.uid() and following_id = target;
$$;

-- The private account approves/rejects a pending follower.
create or replace function public.respond_follow_request(follower uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if accept then
    update user_follows set status = 'accepted' where follower_id = follower and following_id = me and status = 'pending';
  else
    delete from user_follows where follower_id = follower and following_id = me and status = 'pending';
  end if;
end $$;

-- Accepted-edge counts for a profile (aggregate; bypasses RLS so counts are complete).
create or replace function public.follow_counts(target uuid)
returns table (followers integer, following integer)
language sql security definer set search_path = public as $$
  select
    (select count(*)::int from user_follows where following_id = target and status = 'accepted'),
    (select count(*)::int from user_follows where follower_id  = target and status = 'accepted');
$$;

revoke all on function public.follow_user(uuid), public.unfollow_user(uuid),
  public.respond_follow_request(uuid, boolean), public.follow_counts(uuid) from public;
grant execute on function public.follow_user(uuid), public.unfollow_user(uuid),
  public.respond_follow_request(uuid, boolean), public.follow_counts(uuid) to authenticated;

-- ===================== CONTENT REVIEWS =====================
-- One review (rating 1-5 and/or text) per user per title. Titles are addressed by the SAME keys
-- the app uses: shows by tvdb_id (as text), movies by uuid (e.g. 'tmdb:603'). No catalog needed.
create table if not exists content_reviews (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null references profiles(id) on delete cascade,
  entity_type      text not null check (entity_type in ('show','movie')),
  entity_key       text not null,
  rating           smallint check (rating between 1 and 5),
  body             text,
  contains_spoiler boolean not null default false,
  like_count       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (author_id, entity_type, entity_key),
  constraint review_not_empty check (rating is not null or (body is not null and length(trim(body)) > 0))
);
create index if not exists content_reviews_entity_idx on content_reviews (entity_type, entity_key, created_at desc);
create index if not exists content_reviews_author_idx on content_reviews (author_id, created_at desc);

alter table content_reviews enable row level security;
-- Visible if: it's yours, the author is public, or you're an accepted follower of the author.
drop policy if exists "reviews visible" on content_reviews;
create policy "reviews visible" on content_reviews for select using (
  author_id = auth.uid()
  or exists (select 1 from profiles p where p.id = author_id and p.is_public)
  or exists (select 1 from user_follows f where f.following_id = author_id and f.follower_id = auth.uid() and f.status = 'accepted')
);
drop policy if exists "reviews insert own" on content_reviews;
create policy "reviews insert own" on content_reviews for insert with check (author_id = auth.uid());
drop policy if exists "reviews update own" on content_reviews;
create policy "reviews update own" on content_reviews for update using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "reviews delete own" on content_reviews;
create policy "reviews delete own" on content_reviews for delete using (author_id = auth.uid());

-- ===================== REVIEW LIKES =====================
create table if not exists review_likes (
  review_id  uuid not null references content_reviews(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, profile_id)
);
alter table review_likes enable row level security;
drop policy if exists "review likes owner" on review_likes;
create policy "review likes owner" on review_likes using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- keep content_reviews.like_count in sync
create or replace function public.bump_review_like()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update content_reviews set like_count = like_count + 1 where id = new.review_id; return new;
  elsif tg_op = 'DELETE' then
    update content_reviews set like_count = greatest(0, like_count - 1) where id = old.review_id; return old;
  end if; return null;
end $$;
drop trigger if exists review_like_count on review_likes;
create trigger review_like_count after insert or delete on review_likes
  for each row execute function public.bump_review_like();

-- ===================== PROFILE DISCOVERABILITY =====================
-- Profiles are a public directory: any signed-in user can read basic profile rows (handle,
-- name, avatar, bio, is_public) so people are discoverable and can send follow requests
-- (Instagram-style). PRIVACY lives in CONTENT: content_reviews RLS is followers-only for
-- private authors, and the per-user library tables (app_*) are private to their owner.
-- is_public only controls whether follows auto-accept and whether your activity is visible.
drop policy if exists "profiles read public" on profiles;
drop policy if exists "profiles read followers" on profiles;
drop policy if exists "profiles readable" on profiles;
create policy "profiles readable" on profiles for select using (auth.uid() is not null);



-- ================ 0006_favorites_and_list_items.sql ================
-- 0006 · favorites + list items for the per-user app_* mirror (matches the local SQLite v7).
-- Idempotent: safe to run repeatedly.

-- Favorite movies (shows already have app_shows.is_favorite from 0003).
alter table app_movies add column if not exists is_favorite integer not null default 0;

-- Items belonging to a user's custom list (series by TheTVDB id, movies by TV Time uuid).
create table if not exists app_list_items (
  id         bigint generated always as identity primary key,
  profile_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  list_id    bigint not null,
  kind       text not null,          -- 'series' | 'movie'
  tvdb_id    integer,
  uuid       text,
  ord        integer not null default 0
);
create index if not exists app_list_items_list_idx on app_list_items (profile_id, list_id, ord);

-- RLS: owner-only, same policy shape as the other app_* tables.
alter table app_list_items enable row level security;
drop policy if exists "owner all" on app_list_items;
create policy "owner all" on app_list_items using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ================ 0007_phase4_social_plus.sql ================
-- 0007 · Phase 4: episode comments, friends activity feed, genre filters, avatar storage.
-- Idempotent: safe to re-run.

-- ---------- 1) Episode-level comments ----------
-- content_reviews was constrained to show|movie; episodes use entity_key 'tvdb:season:episode'.
alter table content_reviews drop constraint if exists content_reviews_entity_type_check;
alter table content_reviews add constraint content_reviews_entity_type_check
  check (entity_type in ('show','movie','episode'));

-- ---------- 2) Friends activity feed ----------
create table if not exists activity_events (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references profiles(id) on delete cascade,
  verb        text not null check (verb in ('watched_episode','watched_movie','added_show','added_movie','reviewed','followed')),
  entity_type text check (entity_type in ('show','movie','episode','user')),
  entity_key  text,
  title       text,
  poster      text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists activity_events_actor_idx on activity_events (actor_id, created_at desc);
create index if not exists activity_events_created_idx on activity_events (created_at desc);
alter table activity_events enable row level security;

drop policy if exists "activity insert self" on activity_events;
create policy "activity insert self" on activity_events
  for insert with check (actor_id = auth.uid());

-- Visible to: yourself, anyone if the actor is public, or accepted followers of the actor.
drop policy if exists "activity visible" on activity_events;
create policy "activity visible" on activity_events
  for select using (
    actor_id = auth.uid()
    or exists (select 1 from profiles p where p.id = actor_id and p.is_public)
    or exists (select 1 from user_follows f
               where f.follower_id = auth.uid() and f.following_id = actor_id and f.status = 'accepted')
  );

drop policy if exists "activity delete self" on activity_events;
create policy "activity delete self" on activity_events
  for delete using (actor_id = auth.uid());

-- ---------- 3) Genre filters (mirror tables) ----------
alter table app_shows  add column if not exists genres text;
alter table app_movies add column if not exists genres text;

-- ---------- 4) Avatar storage policies (bucket 'avatars' already created) ----------
-- Path convention: {auth.uid()}/avatar.<ext>. Public read; owners write inside their folder.
-- NOTE: storage schema only exists on Supabase (skip this block in plain-Postgres tests).
drop policy if exists "avatar read" on storage.objects;
create policy "avatar read" on storage.objects
  for select using (bucket_id = 'avatars');
drop policy if exists "avatar write own" on storage.objects;
create policy "avatar write own" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar update own" on storage.objects;
create policy "avatar update own" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar delete own" on storage.objects;
create policy "avatar delete own" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ================ 0008_movie_rewatch.sql ================
-- 0008 · Movie rewatch: count re-watches per movie ("La he vuelto a ver").
alter table app_movies add column if not exists rewatch_count integer not null default 0;

-- ================ 0009_recent_entity_and_movie_tmdb.sql ================
-- Recent events reference their entity directly (no more title-matching for new rows),
-- and library movies cache their resolved TMDB id so fiches stop searching by title.
alter table app_recent add column if not exists show_tvdb integer;
alter table app_recent add column if not exists movie_uuid text;
alter table app_movies add column if not exists tmdb_id integer;

-- ================ 0010_episode_rewatch.sql ================
-- 0010 · Episode rewatch: count re-watches per episode (parity with 0008 for movies).
-- The app increments this when the user answers "Lo he vuelto a ver" on an
-- already-watched episode; unmarking the episode deletes the row (count resets).
alter table app_ep_state add column if not exists rewatch_count integer not null default 0;

-- ================ 0011_announcements.sql ================
-- Watch Hoard — in-app announcements (bell icon in the tab headers).
-- Publish a notice by inserting a row (SQL editor / dashboard); every client sees it
-- without redeploying. Unpublish by setting published = false. Idempotent; safe to re-run.

create table if not exists public.announcements (
  id         text primary key,                     -- stable slug, e.g. 'gofundme-2026'
  title      jsonb not null,                       -- {"en": "...", "es": "..."}
  body       jsonb not null,                       -- {"en": "...", "es": "..."}
  href       text,                                 -- internal route ('/donate') or https:// URL
  icon       text not null default 'megaphone',    -- Ionicons name
  published  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

-- Everyone (signed in or not) can read published announcements. Writes only via
-- service role / dashboard — no insert/update/delete policies on purpose.
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select to anon, authenticated
  using (published);

-- Seed: the GoFundMe card.
insert into public.announcements (id, title, body, href, icon)
values (
  'gofundme-2026',
  '{"en": "Help us keep and grow the app ❤️", "es": "Ayúdanos a mantener y hacer crecer la app ❤️"}'::jsonb,
  '{"en": "Watch Hoard is live, but running on limited resources for now. Your support pays for faster data, more storage and more capacity — so everyone can bring their history over. Tap to chip in.", "es": "Watch Hoard está en marcha, pero de momento con recursos limitados. Tu apoyo paga datos más rápidos, más almacenamiento y más capacidad, para que todos puedan traerse su historial. Toca para colaborar."}'::jsonb,
  '/donate',
  'heart'
)
on conflict (id) do nothing;

-- ================ 0012_moderation.sql ================
-- 0012 · Moderation & Play/App Store compliance: blocks, reports, staff roles, bans,
-- account deletion. Idempotent; safe to re-run.
--
-- After applying, make yourself admin once:
--   update profiles set role = 'admin' where handle = 'YOUR_HANDLE';

-- ===================== 1) ROLES + BANS ON PROFILES =====================
alter table profiles add column if not exists role text not null default 'user';
do $$ begin
  alter table profiles add constraint profiles_role_check check (role in ('user','moderator','admin'));
exception when duplicate_object then null; end $$;
alter table profiles add column if not exists banned_until timestamptz;

-- Staff check (SECURITY DEFINER so RLS policies can call it without recursion).
create or replace function public.is_staff(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_uid and role in ('moderator','admin'));
$$;

create or replace function public.is_banned(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_uid and banned_until is not null and banned_until > now());
$$;

-- ===================== 2) USER BLOCKS =====================
create table if not exists user_blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on user_blocks (blocked_id);
alter table user_blocks enable row level security;
-- You manage and see only YOUR block list. Being blocked is never directly visible.
drop policy if exists "blocks owner" on user_blocks;
create policy "blocks owner" on user_blocks using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- Any block edge between two users, in either direction (for content RLS).
create or replace function public.blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- Blocking also tears down the social edges in both directions.
create or replace function public.block_user(target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if target = me then raise exception 'cannot block yourself'; end if;
  if not exists (select 1 from profiles where id = target) then raise exception 'no such profile'; end if;
  insert into user_blocks (blocker_id, blocked_id) values (me, target) on conflict do nothing;
  delete from user_follows
    where (follower_id = me and following_id = target)
       or (follower_id = target and following_id = me);
end $$;

create or replace function public.unblock_user(target uuid)
returns void language sql security definer set search_path = public as $$
  delete from user_blocks where blocker_id = auth.uid() and blocked_id = target;
$$;

-- follow_user (0005) redefined with block + ban guards. Same signature; grants persist.
create or replace function public.follow_user(target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); is_pub boolean; st text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if target = me then raise exception 'cannot follow yourself'; end if;
  if public.is_banned(me) then raise exception 'account suspended'; end if;
  if public.blocked_between(me, target) then raise exception 'blocked'; end if;
  select is_public into is_pub from profiles where id = target;
  if is_pub is null then raise exception 'no such profile'; end if;
  st := case when is_pub then 'accepted' else 'pending' end;
  insert into user_follows (follower_id, following_id, status) values (me, target, st)
    on conflict (follower_id, following_id) do nothing;
  select status into st from user_follows where follower_id = me and following_id = target;
  return st;
end $$;

-- ===================== 3) REPORTS =====================
create table if not exists reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references profiles(id) on delete cascade,
  target_type       text not null check (target_type in ('user','review','activity')),
  target_profile_id uuid not null references profiles(id) on delete cascade,
  target_review_id  uuid references content_reviews(id) on delete set null,
  reason            text not null check (reason in ('spam','harassment','hate','sexual','violence','impersonation','other')),
  details           text,
  content_snapshot  text,          -- server-side copy of the reported text at report time
  status            text not null default 'pending' check (status in ('pending','actioned','dismissed')),
  created_at        timestamptz not null default now(),
  reviewed_by       uuid references profiles(id) on delete set null,
  reviewed_at       timestamptz,
  resolution        text
);
create index if not exists reports_status_idx   on reports (status, created_at desc);
create index if not exists reports_reporter_idx on reports (reporter_id, created_at desc);
alter table reports enable row level security;
-- Read: your own reports, or all of them if you are staff. Writes ONLY via the RPCs below
-- (submit_report snapshots content server-side; mod_resolve_report gates on staff).
drop policy if exists "reports read" on reports;
create policy "reports read" on reports for select
  using (reporter_id = auth.uid() or public.is_staff(auth.uid()));

create or replace function public.submit_report(
  p_target_type text, p_target_profile uuid, p_target_review uuid,
  p_reason text, p_details text
) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); snap text; author uuid; rid uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_target_profile = me then raise exception 'cannot report yourself'; end if;
  if p_target_review is not null then
    select author_id,
           coalesce(body, '') || case when rating is not null then ' [*' || rating || ']' else '' end
      into author, snap from content_reviews where id = p_target_review;
    if author is null then raise exception 'no such review'; end if;
    p_target_profile := author;  -- trust the DB, not the client
  end if;
  if (select count(*) from reports where reporter_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'report limit reached';
  end if;
  insert into reports (reporter_id, target_type, target_profile_id, target_review_id, reason, details, content_snapshot)
  values (me, p_target_type, p_target_profile, p_target_review, p_reason, nullif(trim(coalesce(p_details,'')), ''), snap)
  returning id into rid;
  return rid;
end $$;

-- ===================== 4) MOD ACTIONS =====================
-- p_action: 'dismiss' | 'delete_content' | 'ban' | 'delete_and_ban'.
-- p_ban_days null = permanent ban.
create or replace function public.mod_resolve_report(
  p_report uuid, p_action text, p_ban_days int default null, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r reports%rowtype;
begin
  if not public.is_staff(me) then raise exception 'not authorized'; end if;
  if p_action not in ('dismiss','delete_content','ban','delete_and_ban') then raise exception 'bad action'; end if;
  select * into r from reports where id = p_report;
  if r.id is null then raise exception 'no such report'; end if;
  if p_action in ('delete_content','delete_and_ban') and r.target_review_id is not null then
    delete from content_reviews where id = r.target_review_id;
  end if;
  if p_action in ('ban','delete_and_ban') then
    if exists (select 1 from profiles where id = r.target_profile_id and role = 'admin') then
      raise exception 'cannot ban an admin';
    end if;
    update profiles
      set banned_until = case when p_ban_days is null then 'infinity'::timestamptz
                              else now() + make_interval(days => p_ban_days) end
      where id = r.target_profile_id;
  end if;
  update reports
    set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
        reviewed_by = me, reviewed_at = now(), resolution = coalesce(p_note, p_action)
    where id = p_report;
end $$;

-- Direct ban/unban outside a report (staff). p_days: null = permanent, 0 = unban.
create or replace function public.mod_set_ban(p_user uuid, p_days int)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not public.is_staff(me) then raise exception 'not authorized'; end if;
  if exists (select 1 from profiles where id = p_user and role = 'admin') then raise exception 'cannot ban an admin'; end if;
  update profiles set banned_until =
    case when p_days is null then 'infinity'::timestamptz
         when p_days <= 0 then null
         else now() + make_interval(days => p_days) end
    where id = p_user;
end $$;

-- Admin-only: appoint/demote moderators.
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not exists (select 1 from profiles where id = me and role = 'admin') then raise exception 'not authorized'; end if;
  if p_role not in ('user','moderator') then raise exception 'bad role'; end if;
  if exists (select 1 from profiles where id = p_user and role = 'admin') then raise exception 'cannot change an admin'; end if;
  update profiles set role = p_role where id = p_user;
end $$;

-- ===================== 5) BLOCK + BAN AWARE CONTENT RLS =====================
-- Reviews: hidden between blocked pairs; hidden while the author is banned (except to the
-- author and to staff). Banned users cannot write.
drop policy if exists "reviews visible" on content_reviews;
create policy "reviews visible" on content_reviews for select using (
  author_id = auth.uid()
  or public.is_staff(auth.uid())
  or (
    not public.blocked_between(author_id, auth.uid())
    and not public.is_banned(author_id)
    and (
      exists (select 1 from profiles p where p.id = author_id and p.is_public)
      or exists (select 1 from user_follows f where f.following_id = author_id and f.follower_id = auth.uid() and f.status = 'accepted')
    )
  )
);
drop policy if exists "reviews insert own" on content_reviews;
create policy "reviews insert own" on content_reviews for insert
  with check (author_id = auth.uid() and not public.is_banned(auth.uid()));
drop policy if exists "reviews update own" on content_reviews;
create policy "reviews update own" on content_reviews for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid() and not public.is_banned(auth.uid()));

-- Activity feed: same gating.
drop policy if exists "activity visible" on activity_events;
create policy "activity visible" on activity_events for select using (
  actor_id = auth.uid()
  or (
    not public.blocked_between(actor_id, auth.uid())
    and not public.is_banned(actor_id)
    and (
      exists (select 1 from profiles p where p.id = actor_id and p.is_public)
      or exists (select 1 from user_follows f where f.follower_id = auth.uid() and f.following_id = actor_id and f.status = 'accepted')
    )
  )
);
drop policy if exists "activity insert self" on activity_events;
create policy "activity insert self" on activity_events for insert
  with check (actor_id = auth.uid() and not public.is_banned(auth.uid()));

-- ===================== 6) ACCOUNT DELETION (Play requirement) =====================
-- Deletes the auth user; every table cascades from auth.users / profiles. Avatar files
-- are removed too (guarded: storage schema only exists on Supabase).
create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  begin
    delete from storage.objects where bucket_id = 'avatars' and (storage.foldername(name))[1] = me::text;
  exception when undefined_table or invalid_schema_name or undefined_function then null; end;
  delete from auth.users where id = me;
end $$;

-- ===================== 7) GRANTS =====================
revoke all on function
  public.is_staff(uuid), public.is_banned(uuid), public.blocked_between(uuid, uuid),
  public.block_user(uuid), public.unblock_user(uuid),
  public.submit_report(text, uuid, uuid, text, text),
  public.mod_resolve_report(uuid, text, int, text), public.mod_set_ban(uuid, int),
  public.admin_set_role(uuid, text), public.delete_account()
from public;
grant execute on function
  public.is_staff(uuid), public.is_banned(uuid), public.blocked_between(uuid, uuid),
  public.block_user(uuid), public.unblock_user(uuid),
  public.submit_report(text, uuid, uuid, text, text),
  public.mod_resolve_report(uuid, text, int, text), public.mod_set_ban(uuid, int),
  public.admin_set_role(uuid, text), public.delete_account()
to authenticated;


-- ============================================================
--  GamerHoard — game-specific fields on app_shows (migration 0013)
-- ============================================================
alter table app_shows add column if not exists owned_platforms  text;
alter table app_shows add column if not exists platforms        text;
alter table app_shows add column if not exists playtime_minutes integer;
alter table app_shows add column if not exists steam_appid      integer;
create index if not exists app_shows_steam_idx on app_shows (profile_id, steam_appid);

-- ============================================================
--  GamerHoard — personal rating + notes (migration 0014)
-- ============================================================
alter table app_shows add column if not exists user_rating integer;
alter table app_shows add column if not exists notes       text;
