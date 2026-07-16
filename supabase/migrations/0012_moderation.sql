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
