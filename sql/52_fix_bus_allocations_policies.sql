-- =========================================================
-- Fix bus allocations table and RLS policies
-- Run this if remaining seat sales or allocation save fails
-- with "Could not find the table 'public.bus_allocations'".
-- =========================================================

create extension if not exists "pgcrypto";

create table if not exists bus_allocations (
  id uuid primary key default gen_random_uuid(),
  allocation_name text not null,
  allocation_data jsonb not null,
  total_cost integer not null default 0,
  total_capacity integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table bus_allocations
  add column if not exists allocation_name text;

alter table bus_allocations
  add column if not exists allocation_data jsonb;

alter table bus_allocations
  add column if not exists total_cost integer not null default 0;

alter table bus_allocations
  add column if not exists total_capacity integer not null default 0;

alter table bus_allocations
  add column if not exists created_by uuid references auth.users(id);

alter table bus_allocations
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_bus_allocations_created_at
  on bus_allocations(created_at desc);

create index if not exists idx_bus_allocations_created_by
  on bus_allocations(created_by);

alter table bus_allocations enable row level security;

drop policy if exists "Global admins can view bus allocations" on bus_allocations;
drop policy if exists "Global admins can manage bus allocations" on bus_allocations;

create policy "Global admins can view bus allocations"
on bus_allocations
for select
to authenticated
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
);

create policy "Global admins can manage bus allocations"
on bus_allocations
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
  and table_name = 'bus_allocations'
order by ordinal_position;
