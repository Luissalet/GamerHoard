-- 0010 · Episode rewatch: count re-watches per episode (parity with 0008 for movies).
-- The app increments this when the user answers "Lo he vuelto a ver" on an
-- already-watched episode; unmarking the episode deletes the row (count resets).
alter table app_ep_state add column if not exists rewatch_count integer not null default 0;
