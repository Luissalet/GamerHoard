-- GamerHoard — game-specific fields on the per-user library (app_shows).
-- Idempotent: safe to run more than once. Adds the columns the app writes for games:
--   owned_platforms / platforms : JSON arrays of platform slugs (owned vs available)
--   playtime_minutes / steam_appid : set when a game is imported from Steam
alter table app_shows add column if not exists owned_platforms  text;
alter table app_shows add column if not exists platforms        text;
alter table app_shows add column if not exists playtime_minutes integer;
alter table app_shows add column if not exists steam_appid      integer;
create index if not exists app_shows_steam_idx on app_shows (profile_id, steam_appid);
