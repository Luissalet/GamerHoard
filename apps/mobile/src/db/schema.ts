// Local (on-device) SQLite schema — a pragmatic mirror of the Postgres schema in
// supabase/migrations. Same names/shape so the Supabase DataSource drops in later
// (see ./index.ts) with no screen changes.
export const SCHEMA = `
create table if not exists profile (
  id integer primary key check (id = 1),
  handle text, series_clock text, episodes integer default 0, movies_clock text, movies integer default 0,
  shows_added integer default 0, following integer default 0, lists integer default 0,
  badges integer default 0, reactions integer default 0, comments integer default 0, character_votes integer default 0
);
create table if not exists shows (
  tvdb_id integer primary key,
  title text not null,
  state text not null default 'watching',
  is_favorite integer not null default 0,
  watched_episodes integer not null default 0,
  last_season integer, last_episode integer, last_watched_at text, poster text, tmdb_status text, total_episodes integer, network text, last_aired_season integer, last_aired_episode integer,
  owned_platforms text, platforms text, playtime_minutes integer, steam_appid integer,
  user_rating integer, notes text
);
create index if not exists shows_last_idx on shows (last_watched_at desc);
create table if not exists recent_watches (
  id integer primary key autoincrement,
  kind text not null, title text, season integer, episode integer, watched_at text
);
create table if not exists ep_state (
  tvdb_show_id integer not null, season integer not null, episode integer not null,
  primary key (tvdb_show_id, season, episode)
);
create table if not exists movies (
  id integer primary key autoincrement,
  uuid text, title text not null, slug text, year integer, watched_at text, poster text, release_date text,
  is_favorite integer not null default 0
);
create index if not exists movies_watched_idx on movies (watched_at desc);
create table if not exists reviews (
  id integer primary key autoincrement, text text not null, entity_type text, title text, is_spoiler integer default 0, like_count integer default 0, created_at text
);
create table if not exists badges (
  id integer primary key autoincrement, key text, label text not null, grp text, show_tvdb integer
);
create table if not exists lists (
  id integer primary key autoincrement,
  name text not null, is_public integer not null default 0, item_count integer not null default 0
);
create table if not exists list_items (
  id integer primary key autoincrement,
  list_id integer not null, kind text not null, tvdb_id integer, uuid text
);
create index if not exists list_items_list_idx on list_items (list_id);
`;
