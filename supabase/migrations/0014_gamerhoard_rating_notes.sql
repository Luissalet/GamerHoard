-- GamerHoard: personal rating (1-10) + free-form notes on library games.
-- Additive and idempotent; the app degrades gracefully if this isn't applied yet.
alter table app_shows add column if not exists user_rating integer;
alter table app_shows add column if not exists notes text;
