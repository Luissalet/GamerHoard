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
