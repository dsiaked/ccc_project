-- =========================================================
-- CCC Summer campus mapping
-- =========================================================

alter table public.profiles
  drop constraint if exists profiles_account_source_check;

alter table public.profiles
  add constraint profiles_account_source_check
  check (account_source in ('self_signup', 'admin_created', 'ccc_summer'));

alter table public.ccc_summer_user_links
  add column if not exists univ_no bigint,
  add column if not exists univ_name text,
  add column if not exists branch_no bigint,
  add column if not exists branch_name text;

create table if not exists public.ccc_summer_campus_mappings (
  univ_no bigint primary key,
  univ_name text,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  mapped_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_ccc_summer_campus_mappings_campus_id
  on public.ccc_summer_campus_mappings(campus_id);

alter table public.ccc_summer_campus_mappings enable row level security;

revoke all on table public.ccc_summer_campus_mappings
from public, anon, authenticated;

grant select, insert, update, delete on table public.ccc_summer_campus_mappings
to service_role;

comment on table public.ccc_summer_campus_mappings is
  'Private reusable mapping from CCC Summer university numbers to bus campuses.';

notify pgrst, 'reload schema';
