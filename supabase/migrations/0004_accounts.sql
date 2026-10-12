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
