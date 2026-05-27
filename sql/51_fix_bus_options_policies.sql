-- =========================================================
-- Fix bus options table and RLS policies
-- Run this if the admin allocation page fails to add bus options.
-- =========================================================

create extension if not exists "pgcrypto";

create table if not exists bus_options (
  id uuid primary key default gen_random_uuid(),
  capacity integer not null,
  estimated_price integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table bus_options
  add column if not exists capacity integer;

alter table bus_options
  add column if not exists estimated_price integer not null default 0;

alter table bus_options
  add column if not exists notes text;

alter table bus_options
  add column if not exists created_at timestamptz not null default now();

alter table bus_options enable row level security;

drop policy if exists "Authenticated users can view bus options" on bus_options;
drop policy if exists "Global admins can manage bus options" on bus_options;

create policy "Authenticated users can view bus options"
on bus_options
for select
to authenticated
using (true);

create policy "Global admins can manage bus options"
on bus_options
for all
to authenticated
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
)
with check (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
);

notify pgrst, 'reload schema';

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bus_options'
order by ordinal_position;
