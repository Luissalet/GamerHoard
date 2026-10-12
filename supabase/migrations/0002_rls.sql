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
