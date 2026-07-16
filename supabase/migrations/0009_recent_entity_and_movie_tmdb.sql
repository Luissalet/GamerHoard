-- Recent events reference their entity directly (no more title-matching for new rows),
-- and library movies cache their resolved TMDB id so fiches stop searching by title.
alter table app_recent add column if not exists show_tvdb integer;
alter table app_recent add column if not exists movie_uuid text;
alter table app_movies add column if not exists tmdb_id integer;
