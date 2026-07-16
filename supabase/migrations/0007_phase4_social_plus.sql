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
