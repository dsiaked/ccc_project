-- =========================================================
-- Profiles, organization options, station options, and scope-aware policies
-- Run after 00_base_schema_and_rls.sql.
--
-- This file collects SQL that the app uses but was previously scattered or
-- missing as a standalone setup file:
-- - profiles table used by signup/header/admin search
-- - districts/teams/campuses tables and campus_options view used by signup
-- - stations table used by reservation destination selection
-- - admin_roles district/team/campus scope columns used by campus admin scoping
-- - id columns for a safer long-term organization reference path
-- - scope-aware campus admin RLS policies
-- =========================================================

create extension if not exists "pgcrypto";

-- =========================================================
-- 1. profiles
-- =========================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  phone text,
  district_id uuid,
  district text,
  team_id uuid,
  team text,
  campus_id uuid,
  campus text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles add column if not exists email text;
alter table profiles add column if not exists name text;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists district_id uuid;
alter table profiles add column if not exists district text;
alter table profiles add column if not exists team_id uuid;
alter table profiles add column if not exists team text;
alter table profiles add column if not exists campus_id uuid;
alter table profiles add column if not exists campus text;
alter table profiles add column if not exists created_at timestamptz not null default now();
alter table profiles add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_profiles_email_unique
  on profiles(email)
  where email is not null;

create index if not exists idx_profiles_scope
  on profiles(district, team, campus);

create or replace function public.email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users
    where lower(auth.users.email) = lower(trim(p_email))
  );
$$;

revoke all on function public.email_exists(text) from public;
grant execute on function public.email_exists(text) to anon, authenticated;

-- Create the application profile in the same transaction as the Auth user.
-- This also works when email confirmation is enabled and signup has no session yet.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, email, name, phone,
    district_id, district, team_id, team, campus_id, campus,
    updated_at
  )
  values (
    new.id,
    lower(new.email),
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'phone',
    nullif(new.raw_user_meta_data ->> 'district_id', '')::uuid,
    new.raw_user_meta_data ->> 'district',
    nullif(new.raw_user_meta_data ->> 'team_id', '')::uuid,
    new.raw_user_meta_data ->> 'team',
    nullif(new.raw_user_meta_data ->> 'campus_id', '')::uuid,
    new.raw_user_meta_data ->> 'campus',
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    phone = excluded.phone,
    district_id = excluded.district_id,
    district = excluded.district,
    team_id = excluded.team_id,
    team = excluded.team,
    campus_id = excluded.campus_id,
    campus = excluded.campus,
    updated_at = now();

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ) then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();
  end if;
exception
  when insufficient_privilege then
    raise exception using
      message = 'Cannot create auth.users trigger with the current database role.',
      hint = 'Run this setup once in the Supabase Dashboard SQL Editor as the postgres role. Do not change the owner of auth.users.';
end $$;

insert into public.profiles (
  id, email, name, phone,
  district_id, district, team_id, team, campus_id, campus,
  updated_at
)
select
  users.id,
  lower(users.email),
  users.raw_user_meta_data ->> 'name',
  users.raw_user_meta_data ->> 'phone',
  nullif(users.raw_user_meta_data ->> 'district_id', '')::uuid,
  users.raw_user_meta_data ->> 'district',
  nullif(users.raw_user_meta_data ->> 'team_id', '')::uuid,
  users.raw_user_meta_data ->> 'team',
  nullif(users.raw_user_meta_data ->> 'campus_id', '')::uuid,
  users.raw_user_meta_data ->> 'campus',
  now()
from auth.users as users
where not exists (
  select 1 from public.profiles where profiles.id = users.id
)
on conflict (id) do nothing;

-- =========================================================
-- 2. organization options
-- =========================================================

create table if not exists districts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  district_id uuid not null references districts(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campuses (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_districts_name_unique
  on districts(name);

create unique index if not exists idx_teams_district_name_unique
  on teams(district_id, name);

create unique index if not exists idx_campuses_team_name_unique
  on campuses(team_id, name);

create or replace view campus_options as
select
  districts.id as district_id,
  districts.name as district,
  teams.id as team_id,
  teams.name as team,
  campuses.id as campus_id,
  campuses.name as campus,
  districts.sort_order as district_sort_order,
  teams.sort_order as team_sort_order,
  campuses.sort_order as campus_sort_order
from districts
join teams on teams.district_id = districts.id
join campuses on campuses.team_id = teams.id
where districts.is_active = true
  and teams.is_active = true
  and campuses.is_active = true;

-- =========================================================
-- 3. stations
-- =========================================================

create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  line text,
  address text,
  lat double precision,
  lng double precision,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table stations add column if not exists line text;
alter table stations add column if not exists address text;
alter table stations add column if not exists lat double precision;
alter table stations add column if not exists lng double precision;
alter table stations add column if not exists sort_order integer not null default 0;
alter table stations add column if not exists is_active boolean not null default true;
alter table stations add column if not exists created_at timestamptz not null default now();
alter table stations add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_stations_name_unique
  on stations(name);

create index if not exists idx_stations_active_sort
  on stations(is_active, sort_order, name);

-- =========================================================
-- 4. admin/reservation scope columns
-- =========================================================

alter table admin_roles add column if not exists district text;
alter table admin_roles add column if not exists team text;
alter table admin_roles add column if not exists campus text;
alter table admin_roles add column if not exists district_id uuid references districts(id);
alter table admin_roles add column if not exists team_id uuid references teams(id);
alter table admin_roles add column if not exists campus_id uuid references campuses(id);
alter table admin_roles add column if not exists granted_by uuid references auth.users(id);

create index if not exists idx_admin_roles_scope
  on admin_roles(role, district, team, campus);

create index if not exists idx_admin_roles_scope_ids
  on admin_roles(role, district_id, team_id, campus_id);

drop index if exists idx_admin_roles_user_unique;

create unique index if not exists idx_admin_roles_global_admin_unique
  on admin_roles(user_id, role)
  where role = 'global_admin';

create unique index if not exists idx_admin_roles_user_campus_scope_unique
  on admin_roles(user_id, role, district, team, campus)
  where role = 'campus_admin'
    and district is not null
    and team is not null
    and campus is not null;

create unique index if not exists idx_admin_roles_campus_scope_unique
  on admin_roles(role, district, team, campus)
  where role = 'campus_admin'
    and district is not null
    and team is not null
    and campus is not null;

alter table reservations add column if not exists district_id uuid;
alter table reservations add column if not exists team_id uuid;
alter table reservations add column if not exists campus_id uuid;

create index if not exists idx_reservations_scope_ids
  on reservations(district_id, team_id, campus_id);

create index if not exists idx_profiles_scope_ids
  on profiles(district_id, team_id, campus_id);

create or replace function set_admin_role_scope_ids()
returns trigger as $$
begin
  if new.district_id is null
    or new.team_id is null
    or new.campus_id is null
  then
    select
      campus_options.district_id,
      campus_options.team_id,
      campus_options.campus_id
    into
      new.district_id,
      new.team_id,
      new.campus_id
    from campus_options
    where campus_options.district = new.district
      and campus_options.team = new.team
      and campus_options.campus = new.campus
    limit 1;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists set_admin_role_scope_ids on admin_roles;

create trigger set_admin_role_scope_ids
before insert or update on admin_roles
for each row
execute function set_admin_role_scope_ids();

update profiles
set
  district_id = coalesce(profiles.district_id, campus_options.district_id),
  team_id = coalesce(profiles.team_id, campus_options.team_id),
  campus_id = coalesce(profiles.campus_id, campus_options.campus_id)
from campus_options
where profiles.district = campus_options.district
  and profiles.team = campus_options.team
  and profiles.campus = campus_options.campus
  and (
    profiles.district_id is null
    or profiles.team_id is null
    or profiles.campus_id is null
  );

update reservations
set
  district_id = coalesce(reservations.district_id, campus_options.district_id),
  team_id = coalesce(reservations.team_id, campus_options.team_id),
  campus_id = coalesce(reservations.campus_id, campus_options.campus_id)
from campus_options
where reservations.district = campus_options.district
  and reservations.team = campus_options.team
  and reservations.campus = campus_options.campus
  and (
    reservations.district_id is null
    or reservations.team_id is null
    or reservations.campus_id is null
  );

update admin_roles
set
  district_id = coalesce(admin_roles.district_id, campus_options.district_id),
  team_id = coalesce(admin_roles.team_id, campus_options.team_id),
  campus_id = coalesce(admin_roles.campus_id, campus_options.campus_id)
from campus_options
where admin_roles.district = campus_options.district
  and admin_roles.team = campus_options.team
  and admin_roles.campus = campus_options.campus
  and (
    admin_roles.district_id is null
    or admin_roles.team_id is null
    or admin_roles.campus_id is null
  );

-- =========================================================
-- 5. updated_at triggers
-- =========================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_profiles_updated_at on profiles;
create trigger set_profiles_updated_at
before update on profiles
for each row
execute function set_updated_at();

drop trigger if exists set_districts_updated_at on districts;
create trigger set_districts_updated_at
before update on districts
for each row
execute function set_updated_at();

drop trigger if exists set_teams_updated_at on teams;
create trigger set_teams_updated_at
before update on teams
for each row
execute function set_updated_at();

drop trigger if exists set_campuses_updated_at on campuses;
create trigger set_campuses_updated_at
before update on campuses
for each row
execute function set_updated_at();

drop trigger if exists set_stations_updated_at on stations;
create trigger set_stations_updated_at
before update on stations
for each row
execute function set_updated_at();

-- =========================================================
-- 6. RLS and policies
-- =========================================================

alter table profiles enable row level security;
alter table districts enable row level security;
alter table teams enable row level security;
alter table campuses enable row level security;
alter table stations enable row level security;

drop policy if exists "Users can insert own profile" on profiles;
drop policy if exists "Users can view own profile" on profiles;
drop policy if exists "Users can update own profile" on profiles;
drop policy if exists "Global admins can view all profiles" on profiles;
drop policy if exists "Global admins can manage profiles" on profiles;

create policy "Users can insert own profile"
on profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "Users can view own profile"
on profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Users can update own profile"
on profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Global admins can view all profiles"
on profiles
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

create policy "Global admins can manage profiles"
on profiles
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

drop policy if exists "Authenticated users can view districts" on districts;
drop policy if exists "Authenticated users can view teams" on teams;
drop policy if exists "Authenticated users can view campuses" on campuses;
drop policy if exists "Anyone can view active districts" on districts;
drop policy if exists "Anyone can view active teams" on teams;
drop policy if exists "Anyone can view active campuses" on campuses;
drop policy if exists "Global admins can manage districts" on districts;
drop policy if exists "Global admins can manage teams" on teams;
drop policy if exists "Global admins can manage campuses" on campuses;

create policy "Anyone can view active districts"
on districts for select to anon, authenticated using (is_active = true);

create policy "Anyone can view active teams"
on teams for select to anon, authenticated using (is_active = true);

create policy "Anyone can view active campuses"
on campuses for select to anon, authenticated using (is_active = true);

create policy "Global admins can manage districts"
on districts for all to authenticated
using (
  exists (
    select 1 from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
)
with check (
  exists (
    select 1 from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
);

create policy "Global admins can manage teams"
on teams for all to authenticated
using (
  exists (
    select 1 from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
)
with check (
  exists (
    select 1 from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
);

create policy "Global admins can manage campuses"
on campuses for all to authenticated
using (
  exists (
    select 1 from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
)
with check (
  exists (
    select 1 from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
);

drop policy if exists "Authenticated users can view stations" on stations;
drop policy if exists "Global admins can manage stations" on stations;

create policy "Authenticated users can view stations"
on stations for select to authenticated using (is_active = true);

create policy "Global admins can manage stations"
on stations for all to authenticated
using (
  exists (
    select 1 from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
)
with check (
  exists (
    select 1 from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
);

-- Replace older campus-only policies with district/team/campus scoped policies.
drop policy if exists "Campus admins can view campus reservations" on reservations;
drop policy if exists "Campus admins can view campus payments" on payments;
drop policy if exists "Campus admins can update campus payments" on payments;

create policy "Campus admins can view campus reservations"
on reservations
for select
to authenticated
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'campus_admin'
      and (
        (
          admin_roles.district_id = reservations.district_id
          and admin_roles.team_id = reservations.team_id
          and admin_roles.campus_id = reservations.campus_id
        )
        or (
          admin_roles.district = reservations.district
          and admin_roles.team = reservations.team
          and admin_roles.campus = reservations.campus
        )
      )
  )
);

create policy "Campus admins can view campus payments"
on payments
for select
to authenticated
using (
  exists (
    select 1
    from reservations
    join admin_roles
      on (
        (
          admin_roles.district_id = reservations.district_id
          and admin_roles.team_id = reservations.team_id
          and admin_roles.campus_id = reservations.campus_id
        )
        or (
          admin_roles.district = reservations.district
          and admin_roles.team = reservations.team
          and admin_roles.campus = reservations.campus
        )
      )
    where reservations.id = payments.reservation_id
      and admin_roles.user_id = auth.uid()
      and admin_roles.role = 'campus_admin'
  )
);

-- Payment writes are only allowed through validated SECURITY DEFINER RPCs.
revoke insert, update, delete on table public.payments from public, anon, authenticated;
