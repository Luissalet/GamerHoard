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
