-- 0008 · Movie rewatch: count re-watches per movie ("La he vuelto a ver").
alter table app_movies add column if not exists rewatch_count integer not null default 0;
