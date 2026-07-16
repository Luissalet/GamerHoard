-- Watch Hoard — in-app announcements (bell icon in the tab headers).
-- Publish a notice by inserting a row (SQL editor / dashboard); every client sees it
-- without redeploying. Unpublish by setting published = false. Idempotent; safe to re-run.

create table if not exists public.announcements (
  id         text primary key,                     -- stable slug, e.g. 'gofundme-2026'
  title      jsonb not null,                       -- {"en": "...", "es": "..."}
  body       jsonb not null,                       -- {"en": "...", "es": "..."}
  href       text,                                 -- internal route ('/donate') or https:// URL
  icon       text not null default 'megaphone',    -- Ionicons name
  published  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

-- Everyone (signed in or not) can read published announcements. Writes only via
-- service role / dashboard — no insert/update/delete policies on purpose.
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select to anon, authenticated
  using (published);

-- Seed: the GoFundMe card.
insert into public.announcements (id, title, body, href, icon)
values (
  'gofundme-2026',
  '{"en": "Help us keep and grow the app ❤️", "es": "Ayúdanos a mantener y hacer crecer la app ❤️"}'::jsonb,
  '{"en": "Watch Hoard is live, but running on limited resources for now. Your support pays for faster data, more storage and more capacity — so everyone can bring their history over. Tap to chip in.", "es": "Watch Hoard está en marcha, pero de momento con recursos limitados. Tu apoyo paga datos más rápidos, más almacenamiento y más capacidad, para que todos puedan traerse su historial. Toca para colaborar."}'::jsonb,
  '/donate',
  'heart'
)
on conflict (id) do nothing;
