-- =========================================================
-- CCC Summer identity links
-- =========================================================
-- Keep the external subject identifier and staff classification private.
-- The service-role-only handoff function owns all reads and writes.

create table if not exists public.ccc_summer_user_links (
  subject_id text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  is_staff boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  last_synced_at timestamptz not null default clock_timestamp(),
  constraint ccc_summer_user_links_subject_id_not_blank
    check (nullif(btrim(subject_id), '') is not null)
);

create index if not exists idx_ccc_summer_user_links_user_id
  on public.ccc_summer_user_links(user_id);

alter table public.ccc_summer_user_links enable row level security;

revoke all on table public.ccc_summer_user_links
from public, anon, authenticated;

grant select, insert, update, delete on table public.ccc_summer_user_links
to service_role;

comment on table public.ccc_summer_user_links is
  'Private mapping between CCC Summer subjects and Supabase Auth users.';
comment on column public.ccc_summer_user_links.is_staff is
  'Informational CCC Summer staff classification; never grants admin access.';

notify pgrst, 'reload schema';
