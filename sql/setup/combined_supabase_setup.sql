-- =========================================================
-- Combined Supabase setup SQL
-- Generated from canonical sql files in recommended execution order.
-- Copy this whole file into Supabase SQL Editor and run it.
-- Destructive maintenance scripts such as 62_delete_all_users.sql are excluded.
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/00_base_schema_and_rls.sql
-- =========================================================

-- =========================================================
-- CCC Return Bus Reservation Database Update
-- reservations 중심 조회 + campus_admin 권한 보완
-- =========================================================

-- UUID 함수 사용
create extension if not exists "pgcrypto";

-- =========================================================
-- 1. reservations 테이블 보정
-- =========================================================

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  phone text not null,

  district text default '서울지구',
  team text not null,
  campus text not null,

  station_preferences jsonb not null default '[]'::jsonb,

  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'cancelled')),

  confirmed_ticket jsonb,
  data jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 기존 테이블에 누락 컬럼이 있을 경우 보정
alter table reservations
  add column if not exists district text default '서울지구';

alter table reservations
  add column if not exists team text;

alter table reservations
  add column if not exists campus text;

alter table reservations
  add column if not exists station_preferences jsonb default '[]'::jsonb;

alter table reservations
  add column if not exists status text default 'requested';

alter table reservations
  drop constraint if exists reservations_status_check;

alter table reservations
  add constraint reservations_status_check
  check (status in ('requested', 'confirmed', 'cancelled'));

alter table reservations
  add column if not exists confirmed_ticket jsonb;

alter table reservations
  add column if not exists data jsonb;

alter table reservations
  add column if not exists created_at timestamptz default now();

alter table reservations
  add column if not exists updated_at timestamptz default now();

-- 조회 성능용 인덱스
create index if not exists idx_reservations_user_id
  on reservations(user_id);

create index if not exists idx_reservations_campus
  on reservations(campus);

create index if not exists idx_reservations_team
  on reservations(team);

create index if not exists idx_reservations_campus_team
  on reservations(campus, team);

create index if not exists idx_reservations_status
  on reservations(status);

create index if not exists idx_reservations_created_at
  on reservations(created_at desc);

-- 한 사용자당 예약 1개만 허용하고 싶으면 사용
-- 이미 중복 데이터가 있으면 아래 unique 생성이 실패할 수 있음
create unique index if not exists idx_reservations_user_unique
  on reservations(user_id);


-- =========================================================
-- 2. payments 테이블 보정
-- =========================================================

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reservation_id uuid references reservations(id) on delete cascade,

  amount integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'refunded')),

  paid_at timestamptz,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table payments
  add column if not exists reservation_id uuid;

alter table payments
  add column if not exists amount integer default 0;

alter table payments
  add column if not exists status text default 'pending';

alter table payments
  drop constraint if exists payments_status_check;

alter table payments
  add constraint payments_status_check
  check (status in ('pending', 'completed', 'refunded'));

alter table payments
  add column if not exists paid_at timestamptz;

alter table payments
  add column if not exists verified_by uuid;

alter table payments
  add column if not exists verified_at timestamptz;

alter table payments
  add column if not exists notes text;

alter table payments
  add column if not exists created_at timestamptz default now();

alter table payments
  add column if not exists updated_at timestamptz default now();

-- reservation_id 외래키가 없을 경우 추가
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_reservation_id_fkey'
  ) then
    alter table payments
      add constraint payments_reservation_id_fkey
      foreign key (reservation_id)
      references reservations(id)
      on delete cascade;
  end if;
end $$;

-- 예약 1개당 payment 1개만 허용
create unique index if not exists idx_payments_reservation_unique
  on payments(reservation_id)
  where reservation_id is not null;

create index if not exists idx_payments_user_id
  on payments(user_id);

create index if not exists idx_payments_status
  on payments(status);


-- =========================================================
-- 3. admin_roles 테이블 보정
-- =========================================================

create table if not exists admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  role text not null
    check (role in ('campus_admin', 'global_admin')),

  campus text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop index if exists idx_admin_roles_user_unique;

create index if not exists idx_admin_roles_user_id
  on admin_roles(user_id);

create index if not exists idx_admin_roles_campus
  on admin_roles(campus);

create index if not exists idx_admin_roles_role
  on admin_roles(role);


-- =========================================================
-- 4. bus_options 테이블
-- =========================================================

create table if not exists bus_options (
  id uuid primary key default gen_random_uuid(),
  capacity integer not null,
  estimated_price integer not null default 0,
  max_count integer not null default 999 check (max_count > 0),
  notes text,
  created_at timestamptz not null default now()
);


-- =========================================================
-- 5. bus_allocations 테이블
-- =========================================================

create table if not exists bus_allocations (
  id uuid primary key default gen_random_uuid(),
  allocation_name text not null,
  allocation_data jsonb not null,
  total_cost integer not null default 0,
  total_capacity integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 0
);


-- =========================================================
-- 6. updated_at 자동 갱신 함수
-- =========================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_reservations_updated_at on reservations;

create trigger set_reservations_updated_at
before update on reservations
for each row
execute function set_updated_at();

drop trigger if exists set_payments_updated_at on payments;

create trigger set_payments_updated_at
before update on payments
for each row
execute function set_updated_at();

drop trigger if exists set_admin_roles_updated_at on admin_roles;

create trigger set_admin_roles_updated_at
before update on admin_roles
for each row
execute function set_updated_at();


-- =========================================================
-- 7. RLS 활성화
-- =========================================================

alter table reservations enable row level security;
alter table payments enable row level security;
alter table admin_roles enable row level security;
alter table bus_options enable row level security;
alter table bus_allocations enable row level security;


-- =========================================================
-- 8. 기존 정책 정리
-- =========================================================

drop policy if exists "Users can insert own reservations" on reservations;
drop policy if exists "Users can view own reservations" on reservations;
drop policy if exists "Users can update own reservations" on reservations;
drop policy if exists "Users can delete own reservations" on reservations;
drop policy if exists "Campus admins can view campus reservations" on reservations;
drop policy if exists "Global admins can view all reservations" on reservations;
drop policy if exists "Global admins can update reservations" on reservations;

drop policy if exists "Users can view own payments" on payments;
drop policy if exists "Users can insert own payments" on payments;
drop policy if exists "Campus admins can view campus payments" on payments;
drop policy if exists "Campus admins can update campus payments" on payments;
drop policy if exists "Global admins can view all payments" on payments;
drop policy if exists "Global admins can update all payments" on payments;

drop policy if exists "Users can view own admin role" on admin_roles;
drop policy if exists "Global admins can manage admin roles" on admin_roles;
drop policy if exists "Global admins can view admin roles" on admin_roles;

drop policy if exists "Authenticated users can view bus options" on bus_options;
drop policy if exists "Global admins can manage bus options" on bus_options;

drop policy if exists "Global admins can view bus allocations" on bus_allocations;
drop policy if exists "Global admins can manage bus allocations" on bus_allocations;


-- =========================================================
-- 9. reservations RLS 정책
-- =========================================================

-- 일반 사용자: 자기 예약 조회
create policy "Users can view own reservations"
on reservations
for select
to authenticated
using (
  auth.uid() = user_id
);

-- 캠퍼스 관리자: 자기 캠퍼스 예약 전체 조회
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
      and admin_roles.campus = reservations.campus
  )
);

-- 전체 관리자: 모든 예약 조회
create policy "Global admins can view all reservations"
on reservations
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

-- 전체 관리자: 예약 확정, 상태 변경 가능
-- Reservation writes are only allowed through validated SECURITY DEFINER RPCs.
revoke insert, update, delete on table public.reservations from public, anon, authenticated;


-- =========================================================
-- 10. payments RLS 정책
-- =========================================================

-- 일반 사용자: 자기 payment 조회
create policy "Users can view own payments"
on payments
for select
to authenticated
using (
  auth.uid() = user_id
);

-- 캠퍼스 관리자: 자기 캠퍼스 예약에 연결된 payment 조회
create policy "Campus admins can view campus payments"
on payments
for select
to authenticated
using (
  exists (
    select 1
    from reservations
    join admin_roles
      on admin_roles.campus = reservations.campus
    where reservations.id = payments.reservation_id
      and admin_roles.user_id = auth.uid()
      and admin_roles.role = 'campus_admin'
  )
);

-- 캠퍼스 관리자: 자기 캠퍼스 payment 입금 확인 가능
-- 전체 관리자: 모든 payment 조회
create policy "Global admins can view all payments"
on payments
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

-- 전체 관리자: 모든 payment 수정
-- Payment writes are only allowed through validated SECURITY DEFINER RPCs.
revoke insert, update, delete on table public.payments from public, anon, authenticated;


-- =========================================================
-- 11. admin_roles RLS 정책
-- =========================================================

-- 일반 사용자: 자기 관리자 권한 조회 가능
create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  );
$$;

revoke all on function public.is_global_admin() from public;
grant execute on function public.is_global_admin() to authenticated;

create policy "Users can view own admin role"
on admin_roles
for select
to authenticated
using (
  auth.uid() = user_id
);

-- 전체 관리자: 모든 관리자 권한 조회
create policy "Global admins can view admin roles"
on admin_roles
for select
to authenticated
using (public.is_global_admin());

-- 전체 관리자: 관리자 권한 관리
-- Admin role writes are only allowed through validated SECURITY DEFINER RPCs.
revoke insert, update, delete on table public.admin_roles from public, anon, authenticated;


-- =========================================================
-- 12. bus_options RLS 정책
-- =========================================================

-- 로그인 사용자: 버스 옵션 조회 가능
create policy "Authenticated users can view bus options"
on bus_options
for select
to authenticated
using (true);

-- 전체 관리자: 버스 옵션 관리 가능
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


-- =========================================================
-- 13. bus_allocations RLS 정책
-- =========================================================

-- 전체 관리자: 배분안 조회
create policy "Global admins can view bus allocations"
on bus_allocations
for select
to authenticated
using (public.is_global_admin());

-- 전체 관리자: 배분안 관리
revoke insert, update, delete on table public.bus_allocations from public, anon, authenticated;


-- =========================================================
-- 14. 확인용 쿼리
-- =========================================================

-- 예약 전체 확인
-- select id, name, phone, team, campus, status, created_at
-- from reservations
-- order by created_at desc;

-- 캠퍼스/팀 기준 예약 확인
-- select id, name, phone, team, campus, status, created_at
-- from reservations
-- where campus = '서울과기대'
--   and team = '북동'
-- order by created_at desc;

-- 예약 + 입금 연결 확인
-- select
--   r.id as reservation_id,
--   r.name,
--   r.phone,
--   r.team,
--   r.campus,
--   r.status as reservation_status,
--   p.id as payment_id,
--   p.amount,
--   p.status as payment_status,
--   r.created_at
-- from reservations r
-- left join payments p
--   on p.reservation_id = r.id
-- order by r.created_at desc;

-- 관리자 권한 확인
-- select user_id, role, campus
-- from admin_roles;

-- =========================================================
-- END sql/setup/00_base_schema_and_rls.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/01_profiles_organization_stations.sql
-- =========================================================

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

-- =========================================================
-- END sql/setup/01_profiles_organization_stations.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/05_app_settings.sql
-- =========================================================

-- =========================================================
-- Shared app settings
-- Run after 00_base_schema_and_rls.sql.
--
-- Purpose:
-- - central key/value settings table used by multiple features
-- - examples: bus ticket price, first reservation deadline
-- =========================================================

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_settings add column if not exists value jsonb not null default '{}'::jsonb;
alter table app_settings add column if not exists created_at timestamptz not null default now();
alter table app_settings add column if not exists updated_at timestamptz not null default now();

create or replace function set_app_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_app_settings_updated_at on app_settings;

create trigger set_app_settings_updated_at
before update on app_settings
for each row
execute function set_app_settings_updated_at();

insert into app_settings (key, value)
values
  ('bus_ticket_price', '{"price": 0}'::jsonb),
  ('first_reservation_deadline', '{"deadline_at": null}'::jsonb),
  ('seoul_district_transfer_account', '{"account_number": ""}'::jsonb),
  ('participation_targets', '{"rows": [], "targets": {}}'::jsonb),
  ('global_scenario_checklist', '{"checked_step_ids": []}'::jsonb)
on conflict (key) do nothing;

alter table app_settings enable row level security;

drop policy if exists "Authenticated users can view app settings" on app_settings;
drop policy if exists "Global admins can manage app settings" on app_settings;

create policy "Authenticated users can view app settings"
on app_settings
for select
to authenticated
using (true);

create policy "Global admins can manage app settings"
on app_settings
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

-- =========================================================
-- END sql/setup/05_app_settings.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/10_payment_and_price_functions.sql
-- =========================================================

-- =========================================================
-- Payment upsert and bus ticket price functions
-- Run after 05_app_settings.sql.
--
-- Functions used by src/lib/adminService.ts:
-- - upsert_reservation_payment
-- - get_bus_ticket_price
-- - update_bus_ticket_price
-- =========================================================

create extension if not exists "pgcrypto";

insert into app_settings (key, value)
values ('bus_ticket_price', '{"price": 0}'::jsonb)
on conflict (key) do nothing;

-- Payment rows are created and changed only through the authorized RPC below.
drop policy if exists "Users can insert own payments" on public.payments;
drop policy if exists "Campus admins can update campus payments" on public.payments;
drop policy if exists "Global admins can update all payments" on public.payments;

revoke insert, update, delete on table public.payments from public, anon, authenticated;

create or replace function public.upsert_reservation_payment(
  p_payment_id uuid,
  p_reservation_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_status text
)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments;
  v_reservation reservations;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_status not in ('pending', 'completed', 'refunded') then
    raise exception 'Invalid payment status: %', p_status;
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id;

  if v_reservation.id is null then
    raise exception 'Reservation not found.';
  end if;

  if p_user_id is distinct from v_reservation.user_id then
    raise exception 'Payment user does not match the reservation owner.';
  end if;

  if not exists (
    select 1
    from public.admin_roles
    where admin_roles.user_id = auth.uid()
      and (
        admin_roles.role = 'global_admin'
        or (
          admin_roles.role = 'campus_admin'
          and (
            (
              admin_roles.district_id = v_reservation.district_id
              and admin_roles.team_id = v_reservation.team_id
              and admin_roles.campus_id = v_reservation.campus_id
            )
            or (
              admin_roles.district = v_reservation.district
              and admin_roles.team = v_reservation.team
              and admin_roles.campus = v_reservation.campus
            )
          )
        )
      )
  ) then
    raise exception 'Not authorized to manage this reservation payment.';
  end if;

  if p_payment_id is not null then
    update public.payments
    set
      amount = greatest(coalesce(p_amount, 0), 0),
      status = p_status,
      verified_by = case
        when p_status = 'completed' then auth.uid()
        else null
      end,
      verified_at = case
        when p_status = 'completed' then now()
        else null
      end,
      updated_at = now()
    where id = p_payment_id
      and reservation_id = p_reservation_id
      and user_id = v_reservation.user_id
    returning * into v_payment;

    if v_payment.id is not null then
      return v_payment;
    end if;

    raise exception 'Payment does not match the selected reservation.';
  end if;

  insert into public.payments (
    user_id,
    reservation_id,
    amount,
    status,
    verified_by,
    verified_at,
    updated_at
  )
  values (
    v_reservation.user_id,
    p_reservation_id,
    greatest(coalesce(p_amount, 0), 0),
    p_status,
    case when p_status = 'completed' then auth.uid() else null end,
    case when p_status = 'completed' then now() else null end,
    now()
  )
  on conflict (reservation_id)
  where reservation_id is not null
  do update set
    amount = excluded.amount,
    status = excluded.status,
    verified_by = excluded.verified_by,
    verified_at = excluded.verified_at,
    updated_at = now()
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke all on function public.upsert_reservation_payment(
  uuid, uuid, uuid, integer, text
) from public, anon;
grant execute on function public.upsert_reservation_payment(
  uuid, uuid, uuid, integer, text
) to authenticated;

create or replace function get_bus_ticket_price()
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (value ->> 'price')::integer
      from app_settings
      where key = 'bus_ticket_price'
    ),
    0
  );
$$;

create or replace function update_bus_ticket_price(p_price integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price integer := greatest(coalesce(p_price, 0), 0);
begin
  if not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  ) then
    raise exception 'Only global admins can update bus ticket price.';
  end if;

  insert into app_settings (key, value, updated_at)
  values ('bus_ticket_price', jsonb_build_object('price', v_price), now())
  on conflict (key)
  do update set
    value = excluded.value,
    updated_at = now();

  return v_price;
end;
$$;

-- =========================================================
-- END sql/setup/10_payment_and_price_functions.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/20_reservation_deadline.sql
-- =========================================================

-- =========================================================
-- First reservation deadline setting
-- Run after 05_app_settings.sql.
--
-- Stores:
-- - key: first_reservation_deadline
-- - value: { "deadline_at": "ISO timestamp or null" }
-- =========================================================

insert into app_settings (key, value)
values ('first_reservation_deadline', '{"deadline_at": null}'::jsonb)
on conflict (key) do nothing;

-- =========================================================
-- END sql/setup/20_reservation_deadline.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/21_atomic_reservation_save.sql
-- =========================================================

-- =========================================================
-- Atomic user reservation save
-- Run after 20_reservation_deadline.sql.
-- =========================================================

-- User reservation writes must go through the validated RPCs below.
drop policy if exists "Users can insert own reservations" on public.reservations;
drop policy if exists "Users can update own reservations" on public.reservations;
drop policy if exists "Users can delete own reservations" on public.reservations;
drop policy if exists "Global admins can update reservations" on public.reservations;

revoke insert, update, delete on table public.reservations from public, anon, authenticated;

update public.reservations
set
  station_preferences = jsonb_path_query_array(
    station_preferences,
    '$[*] ? (@.rank == 1 || @.rank == 2)'
  ),
  data = jsonb_set(
    coalesce(data, '{}'::jsonb),
    '{stationPreferences}',
    jsonb_path_query_array(
      station_preferences,
      '$[*] ? (@.rank == 1 || @.rank == 2)'
    ),
    true
  ),
  updated_at = now()
where station_preferences is distinct from jsonb_path_query_array(
  station_preferences,
  '$[*] ? (@.rank == 1 || @.rank == 2)'
);

create or replace function public.save_user_reservation(
  p_name text,
  p_phone text,
  p_district text,
  p_team text,
  p_campus text,
  p_station_preferences jsonb,
  p_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz;
  v_deadline_value jsonb;
  v_deadline_at timestamptz;
  v_district_id uuid;
  v_team_id uuid;
  v_campus_id uuid;
  v_data jsonb;
  v_reservation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication failed.';
  end if;

  if nullif(trim(p_name), '') is null
    or nullif(trim(p_phone), '') is null
    or nullif(trim(p_district), '') is null
    or nullif(trim(p_team), '') is null
    or nullif(trim(p_campus), '') is null then
    raise exception 'Reservation fields are required.';
  end if;

  if jsonb_typeof(coalesce(p_station_preferences, 'null'::jsonb)) <> 'array' then
    raise exception 'Station preferences must be a JSON array.';
  end if;

  if jsonb_array_length(p_station_preferences) <> 2
    or p_station_preferences -> 0 ->> 'rank' <> '1'
    or p_station_preferences -> 1 ->> 'rank' <> '2' then
    raise exception 'Station preferences must contain first and second choices.';
  end if;

  if nullif(p_station_preferences -> 0 -> 'station' ->> 'id', '') is null
    or nullif(p_station_preferences -> 1 -> 'station' ->> 'id', '') is null
    or p_station_preferences -> 0 -> 'station' ->> 'id'
      = p_station_preferences -> 1 -> 'station' ->> 'id'
    or (
      select count(*)
      from public.stations
      where stations.is_active = true
        and (
          (
            stations.id::text = p_station_preferences -> 0 -> 'station' ->> 'id'
            and stations.name = p_station_preferences -> 0 -> 'station' ->> 'name'
          )
          or (
            stations.id::text = p_station_preferences -> 1 -> 'station' ->> 'id'
            and stations.name = p_station_preferences -> 1 -> 'station' ->> 'name'
          )
        )
    ) <> 2 then
    raise exception 'Station preferences contain invalid or duplicate stations.';
  end if;

  if jsonb_typeof(coalesce(p_data, 'null'::jsonb)) <> 'object' then
    raise exception 'Reservation data must be a JSON object.';
  end if;

  -- Serialize deadline changes with reservation writes.
  select value
  into v_deadline_value
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_value is null then
    raise exception 'Reservation deadline setting is missing.';
  end if;

  v_now := clock_timestamp();
  v_deadline_at :=
    nullif(v_deadline_value ->> 'deadline_at', '')::timestamptz;

  if v_deadline_at is not null and v_deadline_at <= v_now then
    raise exception 'Reservation deadline has passed.';
  end if;

  select district_id, team_id, campus_id
  into v_district_id, v_team_id, v_campus_id
  from public.campus_options
  where district = trim(p_district)
    and team = trim(p_team)
    and campus = trim(p_campus)
  limit 1;

  if v_campus_id is null then
    raise exception 'Invalid reservation organization scope.';
  end if;

  v_data := p_data || jsonb_build_object(
    'name', trim(p_name),
    'phone', trim(p_phone),
    'district', trim(p_district),
    'team', trim(p_team),
    'campus', trim(p_campus),
    'stationPreferences', p_station_preferences,
    'status', 'requested',
    'confirmedTicket', null,
    'requestedAt', v_now::text
  );

  insert into public.reservations as target (
    user_id,
    name,
    phone,
    district_id,
    district,
    team_id,
    team,
    campus_id,
    campus,
    station_preferences,
    status,
    confirmed_ticket,
    data,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    trim(p_name),
    trim(p_phone),
    v_district_id,
    trim(p_district),
    v_team_id,
    trim(p_team),
    v_campus_id,
    trim(p_campus),
    p_station_preferences,
    'requested',
    null,
    v_data,
    v_now,
    v_now
  )
  on conflict (user_id)
  do update set
    name = excluded.name,
    phone = excluded.phone,
    district_id = excluded.district_id,
    district = excluded.district,
    team_id = excluded.team_id,
    team = excluded.team,
    campus_id = excluded.campus_id,
    campus = excluded.campus,
    station_preferences = excluded.station_preferences,
    status = 'requested',
    confirmed_ticket = null,
    data = jsonb_set(
      jsonb_set(
        excluded.data,
        '{requestedAt}',
        case
          when target.status = 'cancelled' then to_jsonb(v_now::text)
          else coalesce(
            target.data -> 'requestedAt',
            to_jsonb(target.created_at::text)
          )
        end,
        true
      ),
      '{updatedAt}',
      to_jsonb(v_now::text),
      true
    ),
    updated_at = v_now
  where target.status in ('requested', 'cancelled')
  returning id into v_reservation_id;

  if v_reservation_id is null then
    raise exception 'Confirmed reservations cannot be changed.';
  end if;

  return v_reservation_id;
end;
$$;

revoke all on function public.save_user_reservation(
  text, text, text, text, text, jsonb, jsonb
) from public, anon;

grant execute on function public.save_user_reservation(
  text, text, text, text, text, jsonb, jsonb
) to authenticated;

create or replace function public.delete_user_reservation()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_deadline_value jsonb;
  v_deadline_at timestamptz;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Authentication failed.';
  end if;

  select value
  into v_deadline_value
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_value is null then
    raise exception 'Reservation deadline setting is missing.';
  end if;

  v_deadline_at :=
    nullif(v_deadline_value ->> 'deadline_at', '')::timestamptz;

  if v_deadline_at is not null and v_deadline_at <= clock_timestamp() then
    raise exception 'Reservation deadline has passed.';
  end if;

  select status
  into v_status
  from public.reservations
  where user_id = v_user_id
  for update;

  if not found then
    return false;
  end if;

  if v_status <> 'requested' then
    raise exception 'Only requested reservations can be deleted.';
  end if;

  delete from public.reservations
  where user_id = v_user_id
    and status = 'requested';

  return found;
end;
$$;

revoke all on function public.delete_user_reservation() from public, anon;
grant execute on function public.delete_user_reservation() to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- Atomic allocation confirmation and cancellation
-- =========================================================

alter table public.bus_allocations
  add column if not exists updated_at timestamptz not null default now();

alter table public.bus_allocations
  add column if not exists revision bigint not null default 0;

create index if not exists idx_bus_allocations_status
  on public.bus_allocations ((allocation_data ->> 'status'));

create or replace function public.acquire_allocation_workspace_lock(
  p_allocation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_current public.bus_allocations%rowtype;
  v_lock_actor text;
  v_lock_expires_at timestamptz;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can edit allocations.';
  end if;
  select * into v_current
  from public.bus_allocations
  where id = p_allocation_id
  for update;
  if not found then
    raise exception 'Allocation workspace not found.';
  end if;
  v_lock_actor := v_current.allocation_data #>> '{editLock,actorId}';
  v_lock_expires_at := nullif(v_current.allocation_data #>> '{editLock,expiresAt}', '')::timestamptz;
  if v_lock_actor is distinct from v_actor_id::text
    and coalesce(v_lock_expires_at, '-infinity'::timestamptz) > v_now then
    return jsonb_build_object('lock_acquired', false, 'row', to_jsonb(v_current));
  end if;
  update public.bus_allocations
  set
    allocation_data = jsonb_set(
      allocation_data,
      '{editLock}',
      jsonb_build_object(
        'actorId', v_actor_id::text,
        'expiresAt', (v_now + interval '15 minutes')::text
      ),
      true
    ),
    updated_at = v_now,
    revision = revision + 1
  where id = p_allocation_id
  returning * into v_current;
  return jsonb_build_object('lock_acquired', true, 'row', to_jsonb(v_current));
end;
$$;

create or replace function public.save_draft_allocation_workspace(
  p_allocation_id uuid,
  p_expected_revision bigint,
  p_allocation_data jsonb,
  p_total_cost integer,
  p_total_capacity integer
)
returns setof public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_current public.bus_allocations%rowtype;
  v_lock_actor text;
  v_lock_expires_at timestamptz;
  v_next_data jsonb;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can edit allocations.';
  end if;
  if jsonb_typeof(p_allocation_data) <> 'object'
    or p_allocation_data ->> 'status' <> 'draft' then
    raise exception 'Invalid draft allocation payload.';
  end if;
  select * into v_current
  from public.bus_allocations
  where id = p_allocation_id
  for update;
  if not found then
    raise exception 'Allocation workspace not found.';
  end if;
  if v_current.revision <> p_expected_revision then
    raise exception 'Allocation workspace changed. Reload before saving.';
  end if;
  v_lock_actor := v_current.allocation_data #>> '{editLock,actorId}';
  v_lock_expires_at := nullif(v_current.allocation_data #>> '{editLock,expiresAt}', '')::timestamptz;
  if v_lock_actor is distinct from v_actor_id::text then
    raise exception 'Allocation workspace lock is owned by another administrator.';
  end if;
  if coalesce(v_lock_expires_at, '-infinity'::timestamptz) <= v_now then
    raise exception 'Allocation workspace lock expired. Reopen the workspace.';
  end if;
  v_next_data := jsonb_set(
    p_allocation_data,
    '{editLock}',
    jsonb_build_object(
      'actorId', v_actor_id::text,
      'expiresAt', (v_now + interval '15 minutes')::text
    ),
    true
  );
  update public.bus_allocations
  set
    allocation_data = v_next_data,
    total_cost = p_total_cost,
    total_capacity = p_total_capacity,
    updated_at = v_now,
    revision = revision + 1
  where id = p_allocation_id;
  return query select * from public.bus_allocations where id = p_allocation_id;
end;
$$;

create or replace function public.delete_draft_allocation_workspace(
  p_allocation_id uuid,
  p_expected_revision bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_current public.bus_allocations%rowtype;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can edit allocations.';
  end if;
  select * into v_current
  from public.bus_allocations
  where id = p_allocation_id
  for update;
  if not found then
    raise exception 'Allocation workspace not found.';
  end if;
  if v_current.revision <> p_expected_revision then
    raise exception 'Allocation workspace changed. Reload before saving.';
  end if;
  if v_current.allocation_data ->> 'status' <> 'draft' then
    raise exception 'Only draft allocations can be deleted.';
  end if;
  if v_current.allocation_data #>> '{editLock,actorId}' is distinct from v_actor_id::text then
    raise exception 'Allocation workspace lock is owned by another administrator.';
  end if;
  delete from public.bus_allocations where id = p_allocation_id;
end;
$$;

create or replace function public.remove_cancelled_passenger_from_confirmed_allocations(
  p_reservation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_current public.bus_allocations%rowtype;
  v_passenger jsonb;
  v_updated_count integer := 0;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can edit allocations.';
  end if;
  for v_current in
    select allocation.*
    from public.bus_allocations allocation
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and exists (
        select 1
        from jsonb_array_elements(allocation.allocation_data -> 'passengers') passenger
        where passenger ->> 'reservationId' = p_reservation_id::text
      )
    for update
  loop
    select passenger into v_passenger
    from jsonb_array_elements(v_current.allocation_data -> 'passengers') passenger
    where passenger ->> 'reservationId' = p_reservation_id::text
    limit 1;
    update public.bus_allocations
    set
      allocation_data = jsonb_set(
        jsonb_set(
          v_current.allocation_data,
          '{passengers}',
          coalesce((
            select jsonb_agg(passenger)
            from jsonb_array_elements(v_current.allocation_data -> 'passengers') passenger
            where passenger ->> 'reservationId' <> p_reservation_id::text
          ), '[]'::jsonb),
          true
        ),
        '{history}',
        coalesce(v_current.allocation_data -> 'history', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'id', 'history-' || floor(extract(epoch from v_now) * 1000)::bigint
              || '-' || substr(md5(random()::text), 1, 7),
            'at', v_now::text,
            'actorId', v_actor_id::text,
            'action', 'passenger_cancelled',
            'detail', coalesce(v_passenger ->> 'name', p_reservation_id::text)
              || ' cancelled; the assigned seat was released.'
          )),
        true
      ),
      updated_at = v_now,
      revision = revision + 1
    where id = v_current.id;
    v_updated_count := v_updated_count + 1;
  end loop;
  return v_updated_count;
end;
$$;

create or replace function public.get_draft_allocation_summaries()
returns table (
  id uuid,
  allocation_name text,
  total_cost integer,
  total_capacity integer,
  created_at timestamptz,
  bus_count integer,
  passenger_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view allocation summaries.';
  end if;
  return query
  select
    allocation.id,
    allocation.allocation_name,
    allocation.total_cost,
    allocation.total_capacity,
    allocation.created_at,
    case when jsonb_typeof(allocation.allocation_data -> 'buses') = 'array'
      then jsonb_array_length(allocation.allocation_data -> 'buses') else 0 end,
    case when jsonb_typeof(allocation.allocation_data -> 'passengers') = 'array'
      then jsonb_array_length(allocation.allocation_data -> 'passengers') else 0 end
  from public.bus_allocations allocation
  where allocation.allocation_data ->> 'status' = 'draft'
  order by allocation.created_at desc;
end;
$$;

create or replace function public.get_confirmed_allocation_summaries()
returns table (
  id uuid,
  allocation_name text,
  total_cost integer,
  total_capacity integer,
  created_at timestamptz,
  bus_count integer,
  passenger_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view allocation summaries.';
  end if;

  return query
  select
    allocation.id,
    allocation.allocation_name,
    allocation.total_cost,
    allocation.total_capacity,
    coalesce(
      nullif(allocation.allocation_data ->> 'confirmedAt', '')::timestamptz,
      allocation.created_at
    ) as created_at,
    case
      when jsonb_typeof(allocation.allocation_data -> 'buses') = 'array'
        then jsonb_array_length(allocation.allocation_data -> 'buses')
      else 0
    end as bus_count,
    case
      when jsonb_typeof(allocation.allocation_data -> 'passengers') = 'array'
        then jsonb_array_length(allocation.allocation_data -> 'passengers')
      else 0
    end as passenger_count
  from public.bus_allocations allocation
  where allocation.allocation_data ->> 'status' = 'confirmed'
  order by coalesce(
    nullif(allocation.allocation_data ->> 'confirmedAt', '')::timestamptz,
    allocation.created_at
  ) desc;
end;
$$;

create or replace function public.validate_allocation_workspace_confirmation(
  p_allocation_id uuid,
  p_allocation_data jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation_status text;
  v_passenger_count integer := 0;
  v_active_reservation_count integer := 0;
  v_payload_valid boolean;
  v_workspace_valid boolean;
  v_bus_details_valid boolean;
  v_assignments_valid boolean;
  v_unique_reservations_valid boolean;
  v_unique_seats_valid boolean;
  v_active_reservations_valid boolean;
  v_details jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can validate allocations.';
  end if;

  select allocation_data ->> 'status'
  into v_allocation_status
  from public.bus_allocations
  where id = p_allocation_id;

  v_payload_valid := coalesce(
    jsonb_typeof(p_allocation_data) = 'object'
    and jsonb_typeof(p_allocation_data -> 'buses') = 'array'
    and jsonb_array_length(p_allocation_data -> 'buses') > 0
    and jsonb_typeof(p_allocation_data -> 'passengers') = 'array'
    and jsonb_array_length(p_allocation_data -> 'passengers') > 0,
    false
  );
  v_workspace_valid := coalesce(
    v_allocation_status in ('draft', 'confirmed'),
    false
  );

  select count(*)
  into v_active_reservation_count
  from public.reservations
  where status is distinct from 'cancelled';

  if not v_payload_valid then
    return jsonb_build_object(
      'valid', false,
      'checked_at', clock_timestamp(),
      'allocation_status', v_allocation_status,
      'passenger_count', 0,
      'active_reservation_count', v_active_reservation_count,
      'details', '[]'::jsonb,
      'checks', jsonb_build_array(
        jsonb_build_object('key', 'workspace_status', 'valid', v_workspace_valid),
        jsonb_build_object('key', 'payload_structure', 'valid', false),
        jsonb_build_object('key', 'bus_details', 'valid', false),
        jsonb_build_object('key', 'assignments', 'valid', false),
        jsonb_build_object('key', 'unique_reservations', 'valid', false),
        jsonb_build_object('key', 'unique_seats', 'valid', false),
        jsonb_build_object('key', 'active_reservations', 'valid', false)
      )
    );
  end if;

  v_passenger_count := jsonb_array_length(p_allocation_data -> 'passengers');

  v_bus_details_valid := not exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'buses') bus
    where nullif(btrim(bus ->> 'id'), '') is null
      or nullif(btrim(bus ->> 'label'), '') is null
      or nullif(btrim(bus ->> 'destination'), '') is null
      or nullif(btrim(bus ->> 'departureTime'), '') is null
      or nullif(btrim(bus ->> 'boardingPlace'), '') is null
      or coalesce(bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
  );

  v_assignments_valid := not exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    left join jsonb_array_elements(p_allocation_data -> 'buses') bus
      on bus ->> 'id' = passenger ->> 'busId'
    where nullif(passenger ->> 'reservationId', '') is null
      or nullif(passenger ->> 'busId', '') is null
      or coalesce(passenger ->> 'seatNumber', '') !~ '^[1-9][0-9]*$'
      or bus is null
      or case
        when coalesce(passenger ->> 'seatNumber', '') ~ '^[1-9][0-9]*$'
          and coalesce(bus ->> 'capacity', '') ~ '^[1-9][0-9]*$'
          then (passenger ->> 'seatNumber')::integer > (bus ->> 'capacity')::integer
        else true
      end
      or not (
        coalesce(passenger -> 'preferences', '[]'::jsonb)
          ? (bus ->> 'destination')
      )
  );

  v_unique_reservations_valid := (
    select count(distinct passenger ->> 'reservationId')
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
  ) = v_passenger_count;

  v_unique_seats_valid := not exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    group by passenger ->> 'busId', passenger ->> 'seatNumber'
    having count(*) > 1
  );

  v_active_reservations_valid :=
    v_active_reservation_count = v_passenger_count
    and not exists (
      select 1
      from public.reservations reservation
      where reservation.status is distinct from 'cancelled'
        and not exists (
          select 1
          from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
          where passenger ->> 'reservationId' = reservation.id::text
        )
    )
    and not exists (
      select 1
      from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
      where not exists (
        select 1
        from public.reservations reservation
        where reservation.id::text = passenger ->> 'reservationId'
          and reservation.status is distinct from 'cancelled'
      )
    );

  select coalesce(jsonb_agg(detail order by sort_order, message), '[]'::jsonb)
  into v_details
  from (
    select
      10 as sort_order,
      bus ->> 'label' as message,
      jsonb_build_object(
        'key', 'bus_details',
        'message', coalesce(nullif(bus ->> 'label', ''), '이름 없는 버스')
          || ': 필수 버스 정보가 누락되었거나 정원이 올바르지 않습니다.',
        'bus_id', bus ->> 'id'
      ) as detail
    from jsonb_array_elements(p_allocation_data -> 'buses') bus
    where nullif(btrim(bus ->> 'id'), '') is null
      or nullif(btrim(bus ->> 'label'), '') is null
      or nullif(btrim(bus ->> 'destination'), '') is null
      or nullif(btrim(bus ->> 'departureTime'), '') is null
      or nullif(btrim(bus ->> 'boardingPlace'), '') is null
      or coalesce(bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'

    union all

    select
      20,
      passenger ->> 'name',
      jsonb_build_object(
        'key', 'assignments',
        'message', coalesce(nullif(passenger ->> 'name', ''), '이름 없는 승객')
          || ': 배차 버스, 좌석 번호 또는 목적지가 올바르지 않습니다.',
        'passenger_id', passenger ->> 'reservationId',
        'bus_id', passenger ->> 'busId'
      )
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    left join jsonb_array_elements(p_allocation_data -> 'buses') bus
      on bus ->> 'id' = passenger ->> 'busId'
    where nullif(passenger ->> 'reservationId', '') is null
      or nullif(passenger ->> 'busId', '') is null
      or coalesce(passenger ->> 'seatNumber', '') !~ '^[1-9][0-9]*$'
      or bus is null
      or case
        when coalesce(passenger ->> 'seatNumber', '') ~ '^[1-9][0-9]*$'
          and coalesce(bus ->> 'capacity', '') ~ '^[1-9][0-9]*$'
          then (passenger ->> 'seatNumber')::integer > (bus ->> 'capacity')::integer
        else true
      end
      or not (
        coalesce(passenger -> 'preferences', '[]'::jsonb)
          ? (bus ->> 'destination')
      )

    union all

    select
      30,
      duplicate.reservation_id,
      jsonb_build_object(
        'key', 'unique_reservations',
        'message', duplicate.passenger_name || ': 같은 예약자가 '
          || duplicate.duplicate_count || '번 포함되어 있습니다.',
        'passenger_id', duplicate.reservation_id
      )
    from (
      select
        passenger ->> 'reservationId' as reservation_id,
        max(coalesce(nullif(passenger ->> 'name', ''), '이름 없는 승객')) as passenger_name,
        count(*) as duplicate_count
      from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
      group by passenger ->> 'reservationId'
      having count(*) > 1
    ) duplicate

    union all

    select
      40,
      duplicate_seat.bus_label || duplicate_seat.seat_number,
      jsonb_build_object(
        'key', 'unique_seats',
        'message', duplicate_seat.bus_label || ': '
          || duplicate_seat.seat_number || '번 좌석에 '
          || duplicate_seat.duplicate_count || '명이 배정되어 있습니다.',
        'bus_id', duplicate_seat.bus_id
      )
    from (
      select
        passenger ->> 'busId' as bus_id,
        max(coalesce(nullif(bus ->> 'label', ''), '이름 없는 버스')) as bus_label,
        passenger ->> 'seatNumber' as seat_number,
        count(*) as duplicate_count
      from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
      left join jsonb_array_elements(p_allocation_data -> 'buses') bus
        on bus ->> 'id' = passenger ->> 'busId'
      group by passenger ->> 'busId', passenger ->> 'seatNumber'
      having count(*) > 1
    ) duplicate_seat

    union all

    select
      50,
      reservation.name,
      jsonb_build_object(
        'key', 'active_reservations',
        'message', reservation.name || ' · ' || reservation.campus || ' · '
          || reservation.team || ': 최신 활성 예약자이나 배차안에 없습니다.',
        'reservation_id', reservation.id::text,
        'requires_refresh', true
      )
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
      and not exists (
        select 1
        from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
        where passenger ->> 'reservationId' = reservation.id::text
      )

    union all

    select
      60,
      passenger ->> 'name',
      jsonb_build_object(
        'key', 'active_reservations',
        'message', coalesce(nullif(passenger ->> 'name', ''), '이름 없는 승객')
          || ': 취소되었거나 최신 활성 예약에서 제외된 승객입니다.',
        'passenger_id', passenger ->> 'reservationId'
      )
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    where not exists (
      select 1
      from public.reservations reservation
      where reservation.id::text = passenger ->> 'reservationId'
        and reservation.status is distinct from 'cancelled'
    )
  ) details;

  return jsonb_build_object(
    'valid',
      v_workspace_valid
      and v_payload_valid
      and v_bus_details_valid
      and v_assignments_valid
      and v_unique_reservations_valid
      and v_unique_seats_valid
      and v_active_reservations_valid,
    'checked_at', clock_timestamp(),
    'allocation_status', v_allocation_status,
    'passenger_count', v_passenger_count,
    'active_reservation_count', v_active_reservation_count,
    'details', v_details,
    'checks', jsonb_build_array(
      jsonb_build_object('key', 'workspace_status', 'valid', v_workspace_valid),
      jsonb_build_object('key', 'payload_structure', 'valid', v_payload_valid),
      jsonb_build_object('key', 'bus_details', 'valid', v_bus_details_valid),
      jsonb_build_object('key', 'assignments', 'valid', v_assignments_valid),
      jsonb_build_object('key', 'unique_reservations', 'valid', v_unique_reservations_valid),
      jsonb_build_object('key', 'unique_seats', 'valid', v_unique_seats_valid),
      jsonb_build_object('key', 'active_reservations', 'valid', v_active_reservations_valid)
    )
  );
end;
$$;

drop function if exists public.save_confirmed_allocation_workspace(
  uuid, jsonb, integer, integer
);

create or replace function public.save_confirmed_allocation_workspace(
  p_allocation_id uuid,
  p_expected_revision bigint,
  p_allocation_data jsonb,
  p_total_cost integer,
  p_total_capacity integer
)
returns setof public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_current_status text;
  v_current_revision bigint;
  v_lock_actor text;
  v_lock_expires_at timestamptz;
  v_passenger_count integer;
  v_updated_count integer;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can confirm allocations.';
  end if;
  if jsonb_typeof(p_allocation_data) <> 'object'
    or jsonb_typeof(p_allocation_data -> 'buses') <> 'array'
    or jsonb_typeof(p_allocation_data -> 'passengers') <> 'array'
    or p_allocation_data ->> 'status' <> 'confirmed' then
    raise exception 'Invalid confirmed allocation payload.';
  end if;

  lock table public.bus_allocations in share row exclusive mode;
  lock table public.reservations in share row exclusive mode;

  select
    allocation_data ->> 'status',
    revision,
    allocation_data #>> '{editLock,actorId}',
    nullif(allocation_data #>> '{editLock,expiresAt}', '')::timestamptz
  into v_current_status, v_current_revision, v_lock_actor, v_lock_expires_at
  from public.bus_allocations
  where id = p_allocation_id
  for update;
  if v_current_status is null or v_current_status not in ('draft', 'confirmed') then
    raise exception 'Only draft or confirmed allocations can be saved as confirmed.';
  end if;
  if v_current_revision <> p_expected_revision then
    raise exception 'Allocation workspace changed. Reload before saving.';
  end if;
  if v_lock_actor is distinct from v_actor_id::text then
    raise exception 'Allocation workspace lock is owned by another administrator.';
  end if;
  if coalesce(v_lock_expires_at, '-infinity'::timestamptz) <= v_now then
    raise exception 'Allocation workspace lock expired. Reopen the workspace.';
  end if;

  v_passenger_count := jsonb_array_length(p_allocation_data -> 'passengers');

  if v_passenger_count = 0
    or jsonb_array_length(p_allocation_data -> 'buses') = 0 then
    raise exception 'Confirmed allocations need at least one bus and passenger.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'buses') bus
    where nullif(btrim(bus ->> 'id'), '') is null
      or nullif(btrim(bus ->> 'label'), '') is null
      or nullif(btrim(bus ->> 'destination'), '') is null
      or nullif(btrim(bus ->> 'departureTime'), '') is null
      or nullif(btrim(bus ->> 'boardingPlace'), '') is null
      or coalesce(bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
  ) then
    raise exception 'Every bus needs valid required details.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    where nullif(passenger ->> 'reservationId', '') is null
      or nullif(passenger ->> 'busId', '') is null
      or coalesce(passenger ->> 'seatNumber', '') !~ '^[1-9][0-9]*$'
  ) then
    raise exception 'Every passenger needs a bus and valid seat number.';
  end if;
  if (
    select count(distinct passenger ->> 'reservationId')
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
  ) <> v_passenger_count then
    raise exception 'Duplicate reservation IDs exist in the allocation.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    left join jsonb_array_elements(p_allocation_data -> 'buses') bus
      on bus ->> 'id' = passenger ->> 'busId'
    where bus is null
      or (passenger ->> 'seatNumber')::integer > (bus ->> 'capacity')::integer
      or not (
        coalesce(passenger -> 'preferences', '[]'::jsonb)
          ? (bus ->> 'destination')
      )
  ) then
    raise exception 'Invalid bus, seat, or destination assignment exists.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    group by passenger ->> 'busId', passenger ->> 'seatNumber'
    having count(*) > 1
  ) then
    raise exception 'Duplicate seat assignments exist.';
  end if;
  if (
    select count(*) from public.reservations
    where status is distinct from 'cancelled'
  ) <> v_passenger_count
    or exists (
      select 1
      from public.reservations reservation
      where reservation.status is distinct from 'cancelled'
        and not exists (
          select 1
          from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
          where passenger ->> 'reservationId' = reservation.id::text
        )
    )
    or exists (
      select 1
      from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
      where not exists (
        select 1
        from public.reservations reservation
        where reservation.id = (passenger ->> 'reservationId')::uuid
          and reservation.status is distinct from 'cancelled'
      )
    ) then
    raise exception 'Active reservations changed after the draft was created.';
  end if;

  with assignments as (
    select
      (passenger ->> 'reservationId')::uuid as reservation_id,
      jsonb_build_object(
        'busNumber', bus ->> 'label',
        'seatNumber', passenger ->> 'seatNumber',
        'departureTime', bus ->> 'departureTime',
        'boardingPlace', bus ->> 'boardingPlace',
        'dropoffStation', bus ->> 'destination',
        'confirmedAt', v_now::text
      ) as ticket
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    join jsonb_array_elements(p_allocation_data -> 'buses') bus
      on bus ->> 'id' = passenger ->> 'busId'
  )
  update public.reservations reservation
  set status = 'confirmed',
      confirmed_ticket = assignments.ticket,
      data = coalesce(reservation.data, '{}'::jsonb) || jsonb_build_object(
        'status', 'confirmed',
        'confirmedTicket', assignments.ticket,
        'updatedAt', v_now::text
      ),
      updated_at = v_now
  from assignments
  where reservation.id = assignments.reservation_id
    and reservation.status is distinct from 'cancelled';
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_passenger_count then
    raise exception 'Not every active reservation was confirmed.';
  end if;

  update public.bus_allocations
  set allocation_data = jsonb_set(
        p_allocation_data,
        '{editLock}',
        jsonb_build_object(
          'actorId', v_actor_id::text,
          'expiresAt', (v_now + interval '15 minutes')::text
        ),
        true
      ),
      total_cost = p_total_cost,
      total_capacity = p_total_capacity,
      updated_at = v_now,
      revision = revision + 1
  where id = p_allocation_id;

  if v_current_status = 'draft' then
    update public.bus_allocations allocation
    set
      allocation_data = jsonb_set(
        jsonb_set(
          jsonb_set(allocation.allocation_data, '{status}', to_jsonb('archived'::text), true),
          '{passengers}',
          coalesce((
            select jsonb_agg(
              passenger.value || jsonb_build_object(
                'reservationId', 'anonymous-' || passenger.ordinality,
                'name', '승객 A-' || lpad(passenger.ordinality::text, 3, '0'),
                'campus', '',
                'team', ''
              )
              order by passenger.ordinality
            )
            from jsonb_array_elements(allocation.allocation_data -> 'passengers')
              with ordinality passenger(value, ordinality)
          ), '[]'::jsonb),
          true
        ),
        '{versions}',
        '[]'::jsonb,
        true
      ) || jsonb_build_object(
        'history',
        coalesce(allocation.allocation_data -> 'history', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'id', 'history-' || floor(extract(epoch from v_now) * 1000)::bigint
              || '-' || substr(md5(random()::text), 1, 7),
            'at', v_now::text,
            'actorId', v_actor_id::text,
            'action', 'archived',
            'detail', '새 배차 확정에 따라 승객 정보를 익명화하고 과거 기록으로 보관했습니다.'
          ))
      ),
      updated_at = v_now,
      revision = revision + 1
    where allocation.id <> p_allocation_id
      and allocation.allocation_data ->> 'status' = 'confirmed';

    delete from public.bus_allocations allocation
    where allocation.id <> p_allocation_id
      and allocation.allocation_data ->> 'status' = 'draft';
  end if;

  return query select * from public.bus_allocations where id = p_allocation_id;
end;
$$;

drop function if exists public.cancel_confirmed_allocation_workspace(
  uuid, jsonb, integer, integer
);

create or replace function public.cancel_confirmed_allocation_workspace(
  p_allocation_id uuid,
  p_expected_revision bigint,
  p_allocation_data jsonb,
  p_total_cost integer,
  p_total_capacity integer
)
returns setof public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_current_status text;
  v_current_revision bigint;
  v_lock_actor text;
  v_lock_expires_at timestamptz;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can cancel confirmed allocations.';
  end if;
  if jsonb_typeof(p_allocation_data) <> 'object'
    or p_allocation_data ->> 'status' <> 'draft' then
    raise exception 'Invalid draft allocation payload.';
  end if;
  lock table public.bus_allocations in share row exclusive mode;
  lock table public.reservations in share row exclusive mode;

  select
    allocation_data ->> 'status',
    revision,
    allocation_data #>> '{editLock,actorId}',
    nullif(allocation_data #>> '{editLock,expiresAt}', '')::timestamptz
  into v_current_status, v_current_revision, v_lock_actor, v_lock_expires_at
  from public.bus_allocations
  where id = p_allocation_id
  for update;
  if v_current_status is null or v_current_status <> 'confirmed' then
    raise exception 'Only confirmed allocations can be cancelled.';
  end if;
  if v_current_revision <> p_expected_revision then
    raise exception 'Allocation workspace changed. Reload before saving.';
  end if;
  if v_lock_actor is distinct from v_actor_id::text then
    raise exception 'Allocation workspace lock is owned by another administrator.';
  end if;
  if coalesce(v_lock_expires_at, '-infinity'::timestamptz) <= v_now then
    raise exception 'Allocation workspace lock expired. Reopen the workspace.';
  end if;

  update public.reservations reservation
  set status = 'requested',
      confirmed_ticket = null,
      data = (coalesce(reservation.data, '{}'::jsonb) - 'confirmedTicket')
        || jsonb_build_object('status', 'requested', 'updatedAt', v_now::text),
      updated_at = v_now
  where reservation.status is distinct from 'cancelled';

  update public.bus_allocations
  set allocation_data = jsonb_set(
        p_allocation_data,
        '{editLock}',
        jsonb_build_object(
          'actorId', v_actor_id::text,
          'expiresAt', (v_now + interval '15 minutes')::text
        ),
        true
      ),
      total_cost = p_total_cost,
      total_capacity = p_total_capacity,
      updated_at = v_now,
      revision = revision + 1
  where id = p_allocation_id;
  return query select * from public.bus_allocations where id = p_allocation_id;
end;
$$;

revoke all on function public.save_confirmed_allocation_workspace(
  uuid, bigint, jsonb, integer, integer
) from public, anon;
grant execute on function public.save_confirmed_allocation_workspace(
  uuid, bigint, jsonb, integer, integer
) to authenticated;
revoke all on function public.cancel_confirmed_allocation_workspace(
  uuid, bigint, jsonb, integer, integer
) from public, anon;
grant execute on function public.cancel_confirmed_allocation_workspace(
  uuid, bigint, jsonb, integer, integer
) to authenticated;
revoke all on function public.acquire_allocation_workspace_lock(uuid) from public, anon;
grant execute on function public.acquire_allocation_workspace_lock(uuid) to authenticated;
revoke all on function public.save_draft_allocation_workspace(
  uuid, bigint, jsonb, integer, integer
) from public, anon;
grant execute on function public.save_draft_allocation_workspace(
  uuid, bigint, jsonb, integer, integer
) to authenticated;
revoke all on function public.delete_draft_allocation_workspace(uuid, bigint)
  from public, anon;
grant execute on function public.delete_draft_allocation_workspace(uuid, bigint)
  to authenticated;
revoke all on function public.remove_cancelled_passenger_from_confirmed_allocations(uuid)
  from public, anon;
grant execute on function public.remove_cancelled_passenger_from_confirmed_allocations(uuid)
  to authenticated;
revoke all on function public.get_draft_allocation_summaries() from public, anon;
grant execute on function public.get_draft_allocation_summaries() to authenticated;
revoke all on function public.get_confirmed_allocation_summaries() from public, anon;
grant execute on function public.get_confirmed_allocation_summaries() to authenticated;
revoke all on function public.validate_allocation_workspace_confirmation(
  uuid, jsonb
) from public, anon;
grant execute on function public.validate_allocation_workspace_confirmation(
  uuid, jsonb
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/21_atomic_reservation_save.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/22_destination_stats_rpc.sql
-- =========================================================

-- =========================================================
-- Destination demand aggregation
-- Run after 21_atomic_reservation_save.sql.
--
-- Aggregates all non-cancelled reservations inside Postgres so allocation demand
-- is not truncated by PostgREST's maximum response row limit.
-- =========================================================

drop function if exists public.get_destination_stats();

create or replace function public.get_destination_stats()
returns table (
  station_name text,
  rank1 bigint,
  rank2 bigint,
  total bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view destination statistics.';
  end if;

  return query
  select
    demand.station_name,
    demand.rank1,
    demand.rank2,
    demand.total
  from (
    select
      preference -> 'station' ->> 'name' as station_name,
      count(*) filter (where (preference ->> 'rank')::integer = 1) as rank1,
      count(*) filter (where (preference ->> 'rank')::integer = 2) as rank2,
      count(*) as total
    from public.reservations
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(reservations.station_preferences) = 'array'
          then reservations.station_preferences
        else '[]'::jsonb
      end
    ) as preference
    where reservations.status is distinct from 'cancelled'
      and nullif(trim(preference -> 'station' ->> 'name'), '') is not null
      and (preference ->> 'rank') ~ '^[12]$'
    group by preference -> 'station' ->> 'name'
  ) as demand
  order by
    demand.rank1 desc,
    demand.rank2 desc,
    demand.station_name;
end;
$$;

revoke all on function public.get_destination_stats() from public, anon;
grant execute on function public.get_destination_stats() to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/22_destination_stats_rpc.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/30_campus_transfer_settlement.sql
-- =========================================================

-- =========================================================
-- Campus transfer additional settlement support
-- Run this in Supabase SQL Editor.
--
-- Purpose:
-- - Keep campus_transfers as the reported snapshot.
-- - Return current reservation/payment totals separately.
-- - Mark rows as "additional settlement needed" when current totals exceed
--   the reported snapshot after a campus already reported a transfer.
-- =========================================================

create table if not exists campus_transfers (
  id uuid primary key default gen_random_uuid(),
  district_id uuid references districts(id),
  team_id uuid references teams(id),
  campus_id uuid references campuses(id),
  district text not null,
  team text not null,
  campus text not null,
  total_people integer not null default 0,
  paid_people integer not null default 0,
  total_amount integer not null default 0,
  status text not null default 'sent'
    check (status in ('sent', 'confirmed')),
  sent_by uuid references auth.users(id),
  sent_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  actual_confirmed_amount integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table campus_transfers add column if not exists district_id uuid references districts(id);
alter table campus_transfers add column if not exists team_id uuid references teams(id);
alter table campus_transfers add column if not exists campus_id uuid references campuses(id);
alter table campus_transfers add column if not exists district text;
alter table campus_transfers add column if not exists team text;
alter table campus_transfers add column if not exists campus text;
alter table campus_transfers
  add column if not exists total_people integer not null default 0;
alter table campus_transfers
  add column if not exists paid_people integer not null default 0;
alter table campus_transfers
  add column if not exists total_amount integer not null default 0;
alter table campus_transfers add column if not exists status text not null default 'sent';

alter table campus_transfers
  drop constraint if exists campus_transfers_status_check;

alter table campus_transfers
  add constraint campus_transfers_status_check
  check (status in ('sent', 'confirmed'));

alter table campus_transfers add column if not exists sent_by uuid references auth.users(id);
alter table campus_transfers
  add column if not exists sent_at timestamptz not null default now();
alter table campus_transfers
  add column if not exists confirmed_by uuid references auth.users(id);
alter table campus_transfers add column if not exists confirmed_at timestamptz;
alter table campus_transfers add column if not exists actual_confirmed_amount integer;
alter table campus_transfers
  add column if not exists created_at timestamptz not null default now();
alter table campus_transfers
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_campus_transfers_campus_unique
  on campus_transfers(district, team, campus);

create index if not exists idx_campus_transfers_scope_ids
  on campus_transfers(district_id, team_id, campus_id);

alter table campus_transfers enable row level security;

drop policy if exists "Admins can view campus transfers" on campus_transfers;
create policy "Admins can view campus transfers"
on campus_transfers
for select
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and (
        admin_roles.role = 'global_admin'
        or (
          admin_roles.role = 'campus_admin'
          and admin_roles.district = campus_transfers.district
          and admin_roles.team = campus_transfers.team
          and admin_roles.campus = campus_transfers.campus
        )
      )
  )
);

drop policy if exists "Global admins can update campus transfers" on campus_transfers;
create policy "Global admins can update campus transfers"
on campus_transfers
for update
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

update campus_transfers
set
  district_id = coalesce(campus_transfers.district_id, campus_options.district_id),
  team_id = coalesce(campus_transfers.team_id, campus_options.team_id),
  campus_id = coalesce(campus_transfers.campus_id, campus_options.campus_id)
from campus_options
where campus_transfers.district = campus_options.district
  and campus_transfers.team = campus_options.team
  and campus_transfers.campus = campus_options.campus
  and (
    campus_transfers.district_id is null
    or campus_transfers.team_id is null
    or campus_transfers.campus_id is null
  );

create or replace function set_campus_transfer_scope_ids()
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

drop trigger if exists set_campus_transfer_scope_ids on campus_transfers;

create trigger set_campus_transfer_scope_ids
before insert or update on campus_transfers
for each row
execute function set_campus_transfer_scope_ids();

create or replace function mark_campus_transfer_sent(
  p_district text,
  p_team text,
  p_campus text,
  p_total_people integer,
  p_paid_people integer,
  p_total_amount integer,
  p_sent_by uuid
)
returns campus_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer campus_transfers;
begin
  if auth.uid() is null or not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and (
        admin_roles.role = 'global_admin'
        or (
          admin_roles.role = 'campus_admin'
          and admin_roles.district = p_district
          and admin_roles.team = p_team
          and admin_roles.campus = p_campus
        )
      )
  ) then
    raise exception 'Not authorized to report this campus transfer.';
  end if;

  insert into campus_transfers (
    district_id,
    team_id,
    campus_id,
    district,
    team,
    campus,
    total_people,
    paid_people,
    total_amount,
    status,
    sent_by,
    sent_at,
    confirmed_by,
    confirmed_at,
    actual_confirmed_amount,
    updated_at
  )
  values (
    (
      select campus_options.district_id
      from campus_options
      where campus_options.district = p_district
        and campus_options.team = p_team
        and campus_options.campus = p_campus
      limit 1
    ),
    (
      select campus_options.team_id
      from campus_options
      where campus_options.district = p_district
        and campus_options.team = p_team
        and campus_options.campus = p_campus
      limit 1
    ),
    (
      select campus_options.campus_id
      from campus_options
      where campus_options.district = p_district
        and campus_options.team = p_team
        and campus_options.campus = p_campus
      limit 1
    ),
    p_district,
    p_team,
    p_campus,
    p_total_people,
    p_paid_people,
    p_total_amount,
    'sent',
    auth.uid(),
    now(),
    null,
    null,
    null,
    now()
  )
  on conflict (district, team, campus)
  do update set
    district_id = excluded.district_id,
    team_id = excluded.team_id,
    campus_id = excluded.campus_id,
    total_people = excluded.total_people,
    paid_people = excluded.paid_people,
    total_amount = excluded.total_amount,
    status = 'sent',
    sent_by = excluded.sent_by,
    sent_at = now(),
    confirmed_by = null,
    confirmed_at = null,
    actual_confirmed_amount = null,
    updated_at = now()
  returning * into v_transfer;

  return v_transfer;
end;
$$;

drop function if exists get_global_campus_transfer_stats();

create function get_global_campus_transfer_stats()
returns table (
  id uuid,
  district text,
  team text,
  campus text,
  campus_admin_name text,
  campus_admin_phone text,
  current_total_people integer,
  current_paid_people integer,
  current_total_amount integer,
  reported_total_people integer,
  reported_paid_people integer,
  reported_total_amount integer,
  actual_confirmed_amount integer,
  additional_amount_due integer,
  has_additional_settlement boolean,
  status text,
  sent_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with active_campuses as (
    select distinct
      campus_options.district,
      campus_options.team,
      campus_options.campus
    from campus_options
  ),
  current_stats as (
    select
      reservations.district,
      reservations.team,
      reservations.campus,
      count(reservations.id)::integer as current_total_people,
      count(payments.id) filter (where payments.status = 'completed')::integer
        as current_paid_people,
      (
        count(reservations.id) * get_bus_ticket_price()
      )::integer as current_total_amount
    from reservations
    left join payments on payments.reservation_id = reservations.id
    where coalesce(reservations.status, 'requested') <> 'cancelled'
    group by reservations.district, reservations.team, reservations.campus
  ),
  campus_admins as (
    select distinct on (admin_roles.district, admin_roles.team, admin_roles.campus)
      admin_roles.district,
      admin_roles.team,
      admin_roles.campus,
      profiles.name as campus_admin_name,
      profiles.phone as campus_admin_phone
    from admin_roles
    left join profiles on profiles.id = admin_roles.user_id
    where admin_roles.role = 'campus_admin'
    order by
      admin_roles.district,
      admin_roles.team,
      admin_roles.campus,
      admin_roles.updated_at desc nulls last,
      admin_roles.created_at desc nulls last
  )
  select
    campus_transfers.id,
    active_campuses.district,
    active_campuses.team,
    active_campuses.campus,
    campus_admins.campus_admin_name,
    campus_admins.campus_admin_phone,
    coalesce(current_stats.current_total_people, 0) as current_total_people,
    coalesce(current_stats.current_paid_people, 0) as current_paid_people,
    coalesce(current_stats.current_total_amount, 0) as current_total_amount,
    coalesce(campus_transfers.total_people, 0) as reported_total_people,
    coalesce(campus_transfers.paid_people, 0) as reported_paid_people,
    coalesce(campus_transfers.total_amount, 0) as reported_total_amount,
    campus_transfers.actual_confirmed_amount,
    greatest(
      coalesce(current_stats.current_total_amount, 0)
        - coalesce(campus_transfers.total_amount, 0),
      0
    )::integer as additional_amount_due,
    (
      campus_transfers.id is not null
      and campus_transfers.status in ('sent', 'confirmed')
      and (
        coalesce(current_stats.current_total_people, 0)
          > coalesce(campus_transfers.total_people, 0)
        or coalesce(current_stats.current_paid_people, 0)
          > coalesce(campus_transfers.paid_people, 0)
        or coalesce(current_stats.current_total_amount, 0)
          > coalesce(campus_transfers.total_amount, 0)
      )
    ) as has_additional_settlement,
    coalesce(campus_transfers.status, 'pending') as status,
    campus_transfers.sent_at
  from active_campuses
  left join current_stats
    on current_stats.district = active_campuses.district
   and current_stats.team = active_campuses.team
   and current_stats.campus = active_campuses.campus
  left join campus_transfers
    on campus_transfers.district = active_campuses.district
   and campus_transfers.team = active_campuses.team
   and campus_transfers.campus = active_campuses.campus
  left join campus_admins
    on campus_admins.district = active_campuses.district
   and campus_admins.team = active_campuses.team
   and campus_admins.campus = active_campuses.campus
  where exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  order by active_campuses.district, active_campuses.team, active_campuses.campus;
$$;

revoke execute on function mark_campus_transfer_sent(
  text, text, text, integer, integer, integer, uuid
) from public, anon;
grant execute on function mark_campus_transfer_sent(
  text, text, text, integer, integer, integer, uuid
) to authenticated;

revoke execute on function get_global_campus_transfer_stats() from public, anon;
grant execute on function get_global_campus_transfer_stats() to authenticated;

-- =========================================================
-- END sql/setup/30_campus_transfer_settlement.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/33_confirm_campus_transfer_amount.sql
-- =========================================================

-- Confirm campus transfer amount through a security definer RPC.
-- Run this in Supabase SQL Editor after the base campus transfer setup.

create or replace function confirm_campus_transfer_amount(
  p_transfer_id uuid,
  p_confirmed_by uuid,
  p_actual_confirmed_amount integer
)
returns campus_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer campus_transfers;
begin
  if auth.uid() is null or not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  ) then
    raise exception 'Only global admins can confirm campus transfers.';
  end if;

  update campus_transfers
  set
    status = 'confirmed',
    confirmed_by = auth.uid(),
    confirmed_at = now(),
    actual_confirmed_amount = greatest(
      coalesce(p_actual_confirmed_amount, 0),
      0
    ),
    updated_at = now()
  where id = p_transfer_id
  returning * into v_transfer;

  if v_transfer.id is null then
    raise exception 'campus transfer not found: %', p_transfer_id;
  end if;

  return v_transfer;
end;
$$;

revoke execute on function confirm_campus_transfer_amount(uuid, uuid, integer)
from public, anon;
grant execute on function confirm_campus_transfer_amount(uuid, uuid, integer)
to authenticated;

-- Ask Supabase/PostgREST to refresh its schema cache immediately.
notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/33_confirm_campus_transfer_amount.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/40_campus_requests_board.sql
-- =========================================================

-- =========================================================
-- Campus request board
-- Run this in Supabase SQL Editor.
--
-- Purpose:
-- - campus admins can submit post-deadline questions/requests
-- - global admins can view, answer, and change status
-- - campus/global admins can exchange messages inside each request
-- =========================================================

create extension if not exists "pgcrypto";

create table if not exists campus_requests (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'etc',
  status text not null default 'open',
  title text not null,
  content text not null,
  admin_response text,
  is_global_notice boolean not null default false,
  district_id uuid references districts(id),
  team_id uuid references teams(id),
  campus_id uuid references campuses(id),
  district text not null,
  team text not null,
  campus text not null,
  created_by uuid not null,
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_requests_type_check check (
    type in (
      'late_signup',
      'notice',
      'cancel_refund',
      'payment_issue',
      'roster_change',
      'transfer_issue',
      'etc'
    )
  ),
  constraint campus_requests_status_check check (
    status in ('open', 'in_progress', 'resolved', 'on_hold')
  )
);

alter table campus_requests add column if not exists type text not null default 'etc';
alter table campus_requests add column if not exists status text not null default 'open';
alter table campus_requests add column if not exists title text not null default '';
alter table campus_requests add column if not exists content text not null default '';
alter table campus_requests add column if not exists admin_response text;
alter table campus_requests add column if not exists is_global_notice boolean not null default false;
alter table campus_requests add column if not exists district_id uuid references districts(id);
alter table campus_requests add column if not exists team_id uuid references teams(id);
alter table campus_requests add column if not exists campus_id uuid references campuses(id);
alter table campus_requests add column if not exists district text not null default '';
alter table campus_requests add column if not exists team text not null default '';
alter table campus_requests add column if not exists campus text not null default '';
alter table campus_requests add column if not exists created_by uuid not null default auth.uid();
alter table campus_requests add column if not exists handled_by uuid;
alter table campus_requests add column if not exists handled_at timestamptz;
alter table campus_requests add column if not exists created_at timestamptz not null default now();
alter table campus_requests add column if not exists updated_at timestamptz not null default now();

alter table campus_requests
  drop constraint if exists campus_requests_type_check;

alter table campus_requests
  add constraint campus_requests_type_check
  check (
    type in (
      'late_signup',
      'notice',
      'cancel_refund',
      'payment_issue',
      'roster_change',
      'transfer_issue',
      'etc'
    )
  );

alter table campus_requests
  drop constraint if exists campus_requests_status_check;

alter table campus_requests
  add constraint campus_requests_status_check
  check (status in ('open', 'in_progress', 'resolved', 'on_hold'));

create index if not exists idx_campus_requests_scope_status
  on campus_requests(district, team, campus, status);

create index if not exists idx_campus_requests_scope_ids_status
  on campus_requests(district_id, team_id, campus_id, status);

create index if not exists idx_campus_requests_created_at
  on campus_requests(created_at desc);

create index if not exists idx_campus_requests_global_notice_created_at
  on campus_requests(is_global_notice, created_at desc);

update campus_requests
set
  district_id = coalesce(campus_requests.district_id, campus_options.district_id),
  team_id = coalesce(campus_requests.team_id, campus_options.team_id),
  campus_id = coalesce(campus_requests.campus_id, campus_options.campus_id)
from campus_options
where campus_requests.district = campus_options.district
  and campus_requests.team = campus_options.team
  and campus_requests.campus = campus_options.campus
  and (
    campus_requests.district_id is null
    or campus_requests.team_id is null
    or campus_requests.campus_id is null
  );

create or replace function set_campus_requests_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_campus_requests_updated_at on campus_requests;

create trigger set_campus_requests_updated_at
before update on campus_requests
for each row
execute function set_campus_requests_updated_at();

create or replace function set_campus_request_scope_ids()
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

drop trigger if exists set_campus_request_scope_ids on campus_requests;

create trigger set_campus_request_scope_ids
before insert or update on campus_requests
for each row
execute function set_campus_request_scope_ids();

alter table campus_requests enable row level security;

drop policy if exists "Admins can view campus requests" on campus_requests;
drop policy if exists "Campus admins can create campus requests" on campus_requests;
drop policy if exists "Global admins can create campus notices" on campus_requests;
drop policy if exists "Global admins can update campus requests" on campus_requests;

create policy "Admins can view campus requests"
on campus_requests
for select
to authenticated
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  or (
    campus_requests.is_global_notice = true
    and exists (
      select 1
      from admin_roles
      where admin_roles.user_id = auth.uid()
        and admin_roles.role = 'campus_admin'
    )
  )
  or exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'campus_admin'
      and (
        (
          admin_roles.district_id = campus_requests.district_id
          and admin_roles.team_id = campus_requests.team_id
          and admin_roles.campus_id = campus_requests.campus_id
        )
        or (
          admin_roles.district = campus_requests.district
          and admin_roles.team = campus_requests.team
          and admin_roles.campus = campus_requests.campus
        )
      )
  )
);

create policy "Campus admins can create campus requests"
on campus_requests
for insert
to authenticated
with check (
  created_by = auth.uid()
  and campus_requests.is_global_notice = false
  and campus_requests.type <> 'notice'
  and exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'campus_admin'
      and (
        (
          admin_roles.district_id = campus_requests.district_id
          and admin_roles.team_id = campus_requests.team_id
          and admin_roles.campus_id = campus_requests.campus_id
        )
        or (
          admin_roles.district = campus_requests.district
          and admin_roles.team = campus_requests.team
          and admin_roles.campus = campus_requests.campus
        )
      )
  )
);

create policy "Global admins can create campus notices"
on campus_requests
for insert
to authenticated
with check (
  created_by = auth.uid()
  and campus_requests.is_global_notice = true
  and campus_requests.type = 'notice'
  and exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
);

drop function if exists create_global_campus_notice(text, text);

create or replace function create_global_campus_notice(
  p_title text,
  p_content text
)
returns campus_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notice campus_requests;
begin
  if not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  ) then
    raise exception 'Only global admins can create campus notices.';
  end if;

  insert into campus_requests (
    type,
    status,
    title,
    content,
    is_global_notice,
    district,
    team,
    campus,
    created_by
  )
  values (
    'notice',
    'open',
    trim(p_title),
    trim(p_content),
    true,
    '전체',
    '전체',
    '전체',
    auth.uid()
  )
  returning * into v_notice;

  return v_notice;
end;
$$;

grant execute on function create_global_campus_notice(text, text) to authenticated;

drop function if exists get_global_campus_notices();

create or replace function get_global_campus_notices()
returns setof campus_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role in ('global_admin', 'campus_admin')
  ) then
    raise exception 'Only admins can view campus notices.';
  end if;

  return query
  select campus_requests.*
  from campus_requests
  where campus_requests.is_global_notice = true
  order by campus_requests.created_at desc;
end;
$$;

grant execute on function get_global_campus_notices() to authenticated;

notify pgrst, 'reload schema';

create policy "Global admins can update campus requests"
on campus_requests
for update
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

create table if not exists campus_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references campus_requests(id) on delete cascade,
  sender_id uuid not null default auth.uid(),
  sender_role text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint campus_request_messages_sender_role_check check (
    sender_role in ('campus_admin', 'global_admin')
  )
);

alter table campus_request_messages
  add column if not exists request_id uuid references campus_requests(id) on delete cascade;
alter table campus_request_messages
  add column if not exists sender_id uuid not null default auth.uid();
alter table campus_request_messages
  add column if not exists sender_role text not null default 'campus_admin';
alter table campus_request_messages
  add column if not exists message text not null default '';
alter table campus_request_messages
  add column if not exists created_at timestamptz not null default now();

alter table campus_request_messages
  drop constraint if exists campus_request_messages_sender_role_check;

alter table campus_request_messages
  add constraint campus_request_messages_sender_role_check
  check (sender_role in ('campus_admin', 'global_admin'));

create index if not exists idx_campus_request_messages_request_created
  on campus_request_messages(request_id, created_at);

alter table campus_request_messages enable row level security;

drop policy if exists "Admins can view campus request messages" on campus_request_messages;
drop policy if exists "Admins can create campus request messages" on campus_request_messages;
drop policy if exists "Admins can update own campus request messages" on campus_request_messages;
drop policy if exists "Admins can delete own campus request messages" on campus_request_messages;

create policy "Admins can view campus request messages"
on campus_request_messages
for select
to authenticated
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  or exists (
    select 1
    from campus_requests
    join admin_roles on admin_roles.user_id = auth.uid()
    where campus_requests.id = campus_request_messages.request_id
      and campus_requests.is_global_notice = true
      and admin_roles.role = 'campus_admin'
  )
  or exists (
    select 1
    from campus_requests
    join admin_roles on admin_roles.user_id = auth.uid()
    where campus_requests.id = campus_request_messages.request_id
      and admin_roles.role = 'campus_admin'
      and (
        (
          admin_roles.district_id = campus_requests.district_id
          and admin_roles.team_id = campus_requests.team_id
          and admin_roles.campus_id = campus_requests.campus_id
        )
        or (
          admin_roles.district = campus_requests.district
          and admin_roles.team = campus_requests.team
          and admin_roles.campus = campus_requests.campus
        )
      )
  )
);

create policy "Admins can create campus request messages"
on campus_request_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and (
    exists (
      select 1
      from admin_roles
      where admin_roles.user_id = auth.uid()
        and admin_roles.role = 'global_admin'
        and campus_request_messages.sender_role = 'global_admin'
    )
    or exists (
      select 1
      from campus_requests
      join admin_roles on admin_roles.user_id = auth.uid()
      where campus_requests.id = campus_request_messages.request_id
        and admin_roles.role = 'campus_admin'
        and (
          (
            admin_roles.district_id = campus_requests.district_id
            and admin_roles.team_id = campus_requests.team_id
            and admin_roles.campus_id = campus_requests.campus_id
          )
          or (
            admin_roles.district = campus_requests.district
            and admin_roles.team = campus_requests.team
            and admin_roles.campus = campus_requests.campus
          )
        )
        and campus_request_messages.sender_role = 'campus_admin'
    )
  )
);

create policy "Admins can update own campus request messages"
on campus_request_messages
for update
to authenticated
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  or (
    sender_id = auth.uid()
    and exists (
      select 1
      from campus_requests
      join admin_roles on admin_roles.user_id = auth.uid()
      where campus_requests.id = campus_request_messages.request_id
        and admin_roles.role = 'campus_admin'
        and (
          (
            admin_roles.district_id = campus_requests.district_id
            and admin_roles.team_id = campus_requests.team_id
            and admin_roles.campus_id = campus_requests.campus_id
          )
          or (
            admin_roles.district = campus_requests.district
            and admin_roles.team = campus_requests.team
            and admin_roles.campus = campus_requests.campus
          )
        )
        and campus_request_messages.sender_role = 'campus_admin'
    )
  )
)
with check (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  or (
    sender_id = auth.uid()
    and exists (
      select 1
      from campus_requests
      join admin_roles on admin_roles.user_id = auth.uid()
      where campus_requests.id = campus_request_messages.request_id
        and admin_roles.role = 'campus_admin'
        and (
          (
            admin_roles.district_id = campus_requests.district_id
            and admin_roles.team_id = campus_requests.team_id
            and admin_roles.campus_id = campus_requests.campus_id
          )
          or (
            admin_roles.district = campus_requests.district
            and admin_roles.team = campus_requests.team
            and admin_roles.campus = campus_requests.campus
          )
        )
        and campus_request_messages.sender_role = 'campus_admin'
    )
  )
);

create policy "Admins can delete own campus request messages"
on campus_request_messages
for delete
to authenticated
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  or (
    sender_id = auth.uid()
    and exists (
      select 1
      from campus_requests
      join admin_roles on admin_roles.user_id = auth.uid()
      where campus_requests.id = campus_request_messages.request_id
        and admin_roles.role = 'campus_admin'
        and (
          (
            admin_roles.district_id = campus_requests.district_id
            and admin_roles.team_id = campus_requests.team_id
            and admin_roles.campus_id = campus_requests.campus_id
          )
          or (
            admin_roles.district = campus_requests.district
            and admin_roles.team = campus_requests.team
            and admin_roles.campus = campus_requests.campus
          )
        )
        and campus_request_messages.sender_role = 'campus_admin'
    )
  )
);

-- =========================================================
-- END sql/setup/40_campus_requests_board.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/41_campus_notice_reads.sql
-- =========================================================

create table if not exists campus_notice_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  notice_id uuid not null references campus_requests(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, notice_id)
);

create index if not exists idx_campus_notice_reads_notice_id
  on campus_notice_reads(notice_id);

alter table campus_notice_reads enable row level security;

drop policy if exists "Users can view own campus notice reads" on campus_notice_reads;
drop policy if exists "Users can create own campus notice reads" on campus_notice_reads;
drop policy if exists "Users can delete own campus notice reads" on campus_notice_reads;

create policy "Users can view own campus notice reads"
on campus_notice_reads
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create own campus notice reads"
on campus_notice_reads
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from campus_requests
    where campus_requests.id = campus_notice_reads.notice_id
      and campus_requests.is_global_notice = true
  )
);

create policy "Users can delete own campus notice reads"
on campus_notice_reads
for delete
to authenticated
using (user_id = auth.uid());

-- =========================================================
-- END sql/setup/41_campus_notice_reads.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/50_home_announcements.sql
-- =========================================================

-- =========================================================
-- Home announcements
-- =========================================================

create table if not exists home_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_home_announcements_published_created_at
  on home_announcements(is_published, created_at desc);

drop trigger if exists set_home_announcements_updated_at on home_announcements;

create trigger set_home_announcements_updated_at
before update on home_announcements
for each row
execute function set_updated_at();

alter table home_announcements enable row level security;

drop policy if exists "Anyone can view published home announcements" on home_announcements;
drop policy if exists "Global admins can view all home announcements" on home_announcements;
drop policy if exists "Global admins can manage home announcements" on home_announcements;

create policy "Anyone can view published home announcements"
on home_announcements
for select
to anon, authenticated
using (is_published = true);

create policy "Global admins can view all home announcements"
on home_announcements
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

create policy "Global admins can manage home announcements"
on home_announcements
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

-- =========================================================
-- END sql/setup/50_home_announcements.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/60_reset_reservation_data.sql
-- =========================================================

-- =========================================================
-- Reset reservation operation data
-- Run this in Supabase SQL Editor.
--
-- Keeps setup data:
-- - districts / teams / campuses
-- - stations
-- - admin_roles
-- - bus_options
-- - app_settings
--
-- Clears selected operation data:
-- - reservations and payments
-- - campus_transfers
-- - bus_allocations
-- - campus_requests and messages
-- =========================================================

drop function if exists reset_reservation_data(
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
);
drop function if exists reset_reservation_data();

create or replace function reset_reservation_data(
  p_reset_reservations boolean default true,
  p_reset_payments boolean default true,
  p_reset_campus_transfers boolean default true,
  p_reset_bus_allocations boolean default true,
  p_reset_campus_requests boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_reservations integer := 0;
  v_deleted_payments integer := 0;
  v_deleted_campus_transfers integer := 0;
  v_deleted_bus_allocations integer := 0;
  v_deleted_campus_requests integer := 0;
  v_deleted_campus_request_messages integer := 0;
begin
  if not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  ) then
    raise exception 'Only global admins can reset reservation data.';
  end if;

  if p_reset_campus_requests then
    delete from campus_request_messages
    where true;
    get diagnostics v_deleted_campus_request_messages = row_count;

    delete from campus_requests
    where true;
    get diagnostics v_deleted_campus_requests = row_count;
  end if;

  if p_reset_campus_transfers then
    delete from campus_transfers
    where true;
    get diagnostics v_deleted_campus_transfers = row_count;
  end if;

  if p_reset_bus_allocations then
    delete from bus_allocations
    where true;
    get diagnostics v_deleted_bus_allocations = row_count;
  end if;

  if p_reset_payments or p_reset_reservations then
    delete from payments
    where true;
    get diagnostics v_deleted_payments = row_count;
  end if;

  if p_reset_reservations then
    delete from reservations
    where true;
    get diagnostics v_deleted_reservations = row_count;
  end if;

  return jsonb_build_object(
    'reservations', v_deleted_reservations,
    'payments', v_deleted_payments,
    'campusTransfers', v_deleted_campus_transfers,
    'busAllocations', v_deleted_bus_allocations,
    'campusRequests', v_deleted_campus_requests,
    'campusRequestMessages', v_deleted_campus_request_messages
  );
end;
$$;

grant execute on function reset_reservation_data(
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/60_reset_reservation_data.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/80_seed_seoul_organization.sql
-- =========================================================

-- =========================================================
-- Seoul district / team / campus overwrite seed
-- Run this in Supabase SQL Editor.
--
-- Naming rules:
-- - district: 서울지구
-- - teams: omit "서울", keep "팀" (동팀, 서팀, ...)
-- - campuses: omit parenthesized suffixes
--
-- This script overwrites Seoul district organization options safely:
-- - deactivates existing teams/campuses under 서울지구
-- - upserts canonical teams/campuses as active rows
-- - recreates campus_options view used by the app
--
-- It does not delete rows because profiles may reference team/campus ids.
-- It does not update reservations/admin_roles text values.
-- =========================================================

begin;

create extension if not exists "pgcrypto";

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

alter table districts add column if not exists sort_order integer not null default 0;
alter table districts add column if not exists is_active boolean not null default true;
alter table districts add column if not exists created_at timestamptz not null default now();
alter table districts add column if not exists updated_at timestamptz not null default now();

alter table teams add column if not exists sort_order integer not null default 0;
alter table teams add column if not exists is_active boolean not null default true;
alter table teams add column if not exists created_at timestamptz not null default now();
alter table teams add column if not exists updated_at timestamptz not null default now();

alter table campuses add column if not exists sort_order integer not null default 0;
alter table campuses add column if not exists is_active boolean not null default true;
alter table campuses add column if not exists created_at timestamptz not null default now();
alter table campuses add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_districts_name_unique
  on districts(name);

create unique index if not exists idx_teams_district_name_unique
  on teams(district_id, name);

create unique index if not exists idx_campuses_team_name_unique
  on campuses(team_id, name);

insert into districts (name, sort_order, is_active)
values ('서울지구', 10, true)
on conflict (name)
do update set
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- Safe overwrite for Seoul organization options.
-- Existing rows are kept for foreign-key safety, but hidden from campus_options.
update campuses
set is_active = false,
    updated_at = now()
where team_id in (
  select teams.id
  from teams
  join districts on districts.id = teams.district_id
  where districts.name = '서울지구'
);

update teams
set is_active = false,
    updated_at = now()
where district_id = (
  select id
  from districts
  where name = '서울지구'
);

with seoul_district as (
  select id
  from districts
  where name = '서울지구'
),
seed_teams(team_name, sort_order) as (
  values
    ('동팀', 10),
    ('서팀', 20),
    ('남팀', 30),
    ('북팀', 40),
    ('중앙팀', 50),
    ('북동팀', 60),
    ('북중앙팀', 70)
)
insert into teams (district_id, name, sort_order, is_active)
select seoul_district.id, seed_teams.team_name, seed_teams.sort_order, true
from seoul_district
cross join seed_teams
on conflict (district_id, name)
do update set
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

with seed_campuses(team_name, campus_name, sort_order) as (
  values
    ('동팀', '서일대학교', 10),
    ('동팀', '세종대학교', 20),
    ('동팀', '한양대학교', 30),
    ('동팀', '한양여자대학교', 40),
    ('동팀', '건국대학교', 50),
    ('동팀', '한국체육대학교', 60),
    ('동팀', '장로회신학대학교', 70),

    ('서팀', '명지전문대학', 10),
    ('서팀', '명지대학교', 20),
    ('서팀', '서강대학교', 30),
    ('서팀', '연세대학교', 40),
    ('서팀', '경기대학교', 50),
    ('서팀', '농협대학교', 60),
    ('서팀', '이화여자대학교', 70),
    ('서팀', '중부대학교', 80),
    ('서팀', '추계예술대학교', 90),
    ('서팀', '한국항공대학교', 100),
    ('서팀', '홍익대학교', 110),

    ('남팀', '서울대학교', 10),
    ('남팀', '숭실대학교', 20),
    ('남팀', '서울교육대학교', 30),
    ('남팀', '중앙대학교', 40),
    ('남팀', '백석예술대학교', 50),
    ('남팀', '동양미래대학교', 60),
    ('남팀', '강서대학교', 70),
    ('남팀', '총신대학교', 80),

    ('북팀', '고려대학교', 10),
    ('북팀', '동덕여자대학교', 20),
    ('북팀', '서경대학교', 30),
    ('북팀', '성신여자대학교', 40),
    ('북팀', '국민대학교', 50),

    ('중앙팀', '숙명여자대학교', 10),
    ('중앙팀', '동국대학교', 20),
    ('중앙팀', '상명대학교', 30),
    ('중앙팀', '숭의여자대학교', 40),

    ('북동팀', '광운대학교', 10),
    ('북동팀', '서울과학기술대학교', 20),
    ('북동팀', '서울여자대학교', 30),
    ('북동팀', '인덕대학교', 40),
    ('북동팀', '한국성서대학교', 50),
    ('북동팀', '경희대학교', 60),
    ('북동팀', '한국외국어대학교', 70),
    ('북동팀', '서울시립대학교', 80),

    ('북중앙팀', '덕성여자대학교', 10),
    ('북중앙팀', '배화여자대학교', 20),
    ('북중앙팀', '성균관대학교', 30),
    ('북중앙팀', '한성대학교', 40)
),
seoul_teams as (
  select teams.id, teams.name
  from teams
  join districts on districts.id = teams.district_id
  where districts.name = '서울지구'
)
insert into campuses (team_id, name, sort_order, is_active)
select seoul_teams.id, seed_campuses.campus_name, seed_campuses.sort_order, true
from seed_campuses
join seoul_teams on seoul_teams.name = seed_campuses.team_name
on conflict (team_id, name)
do update set
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

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

commit;

select
  districts.name as district,
  teams.name as team,
  count(campuses.id) as campus_count
from districts
join teams on teams.district_id = districts.id
join campuses on campuses.team_id = teams.id
where districts.name = '서울지구'
group by districts.name, teams.name, teams.sort_order
order by teams.sort_order;

-- =========================================================
-- END sql/setup/80_seed_seoul_organization.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/82_seed_stations_template.sql
-- =========================================================

-- =========================================================
-- Station options seed template
-- Run after 01_profiles_organization_stations.sql.
--
-- The app needs rows in stations for the user reservation destination picker.
-- Replace/add rows below with the real return-bus destination candidates.
-- Coordinates are optional but enable the "nearby station recommendation"
-- feature in ReservationPage.
-- =========================================================

insert into stations (
  name,
  line,
  address,
  lat,
  lng,
  sort_order,
  is_active
)
values
  ('서울역', '1호선 / 4호선 / 경의중앙선 / 공항철도', '서울특별시 용산구 한강대로 405', 37.5547, 126.9706, 10, true),
  ('고속터미널역', '3호선 / 7호선 / 9호선', '서울특별시 서초구 신반포로 188', 37.5048, 127.0049, 20, true),
  ('사당역', '2호선 / 4호선', '서울특별시 동작구 남부순환로 2089', 37.4766, 126.9816, 30, true),
  ('잠실역', '2호선 / 8호선', '서울특별시 송파구 올림픽로 265', 37.5133, 127.1002, 40, true),
  ('청량리역', '1호선 / 경의중앙선 / 경춘선 / 수인분당선', '서울특별시 동대문구 왕산로 214', 37.5801, 127.0464, 50, true)
on conflict (name)
do update set
  line = excluded.line,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

-- =========================================================
-- END sql/setup/82_seed_stations_template.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/99_finalize_setup.sql
-- =========================================================

-- =========================================================
-- Final setup guarantees and health check
-- =========================================================

create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  );
$$;

revoke all on function public.is_global_admin() from public;
grant execute on function public.is_global_admin() to authenticated;

drop policy if exists "Global admins can view admin roles" on public.admin_roles;
drop policy if exists "Global admins can manage admin roles" on public.admin_roles;

create policy "Global admins can view admin roles"
on public.admin_roles
for select
to authenticated
using (public.is_global_admin());

revoke insert, update, delete on table public.admin_roles from public, anon, authenticated;

alter table public.districts enable row level security;
alter table public.teams enable row level security;
alter table public.campuses enable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.districts to anon, authenticated;
grant select on table public.teams to anon, authenticated;
grant select on table public.campuses to anon, authenticated;
grant select on table public.campus_options to anon, authenticated;

drop policy if exists "Anyone can view active districts" on public.districts;
drop policy if exists "Anyone can view active teams" on public.teams;
drop policy if exists "Anyone can view active campuses" on public.campuses;

create policy "Anyone can view active districts"
on public.districts
for select
to anon, authenticated
using (is_active = true);

create policy "Anyone can view active teams"
on public.teams
for select
to anon, authenticated
using (is_active = true);

create policy "Anyone can view active campuses"
on public.campuses
for select
to anon, authenticated
using (is_active = true);

grant execute on function public.email_exists(text) to anon, authenticated;

notify pgrst, 'reload schema';

select
  (select count(*) from public.districts where is_active = true) as active_districts,
  (select count(*) from public.teams where is_active = true) as active_teams,
  (select count(*) from public.campuses where is_active = true) as active_campuses;

-- =========================================================
-- END sql/setup/99_finalize_setup.sql
-- =========================================================

-- =========================================================
-- FINAL OVERRIDE sql/setup/60_reset_reservation_data.sql
-- Keeps the combined setup aligned with the expanded reset UI.
-- =========================================================

drop function if exists reset_reservation_data(boolean, boolean, boolean, boolean, boolean);
drop function if exists reset_reservation_data(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean);
drop function if exists reset_reservation_data(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean);
drop function if exists reset_reservation_data();
drop function if exists get_deletable_user_count();

create or replace function get_deletable_user_count()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.admin_roles
    where user_id = auth.uid() and role = 'global_admin'
  ) then
    raise exception 'Only global admins can view deletable user count.';
  end if;
  return (select count(*)::integer from auth.users where id <> auth.uid());
end;
$$;

create or replace function reset_reservation_data(
  p_reset_reservations boolean default true,
  p_reset_payments boolean default true,
  p_reset_campus_transfers boolean default true,
  p_reset_bus_allocations boolean default true,
  p_reset_campus_requests boolean default true,
  p_reset_stations boolean default false,
  p_reset_bus_options boolean default false,
  p_reset_app_settings boolean default false,
  p_reset_home_announcements boolean default false,
  p_reset_campus_admin_roles boolean default false,
  p_reset_organization boolean default false,
  p_reset_user_accounts boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservations integer := 0;
  v_payments integer := 0;
  v_transfers integer := 0;
  v_allocations integer := 0;
  v_requests integer := 0;
  v_messages integer := 0;
  v_stations integer := 0;
  v_bus_options integer := 0;
  v_app_settings integer := 0;
  v_announcements integer := 0;
  v_campus_admins integer := 0;
  v_districts integer := 0;
  v_teams integer := 0;
  v_campuses integer := 0;
  v_user_accounts integer := 0;
begin
  if not exists (
    select 1 from admin_roles
    where user_id = auth.uid() and role = 'global_admin'
  ) then
    raise exception 'Only global admins can reset data.';
  end if;

  if p_reset_organization or p_reset_user_accounts then
    p_reset_reservations := true;
    p_reset_payments := true;
    p_reset_campus_transfers := true;
    p_reset_bus_allocations := true;
    p_reset_campus_requests := true;
    p_reset_campus_admin_roles := true;
  end if;

  if p_reset_campus_requests then
    delete from campus_request_messages where true;
    get diagnostics v_messages = row_count;
    delete from campus_requests where true;
    get diagnostics v_requests = row_count;
  end if;
  if p_reset_campus_transfers then
    delete from campus_transfers where true;
    get diagnostics v_transfers = row_count;
  end if;
  if p_reset_bus_allocations then
    delete from bus_allocations where true;
    get diagnostics v_allocations = row_count;
  end if;
  if p_reset_payments or p_reset_reservations then
    delete from payments where true;
    get diagnostics v_payments = row_count;
  end if;
  if p_reset_reservations then
    delete from reservations where true;
    get diagnostics v_reservations = row_count;
  end if;
  if p_reset_home_announcements then
    delete from home_announcements where true;
    get diagnostics v_announcements = row_count;
  end if;
  if p_reset_stations then
    delete from stations where true;
    get diagnostics v_stations = row_count;
  end if;
  if p_reset_bus_options then
    delete from bus_options where true;
    get diagnostics v_bus_options = row_count;
  end if;
  if p_reset_app_settings then
    delete from app_settings where true;
    get diagnostics v_app_settings = row_count;
    insert into app_settings (key, value)
    values
      ('bus_ticket_price', '{"price": 0}'::jsonb),
      ('first_reservation_deadline', '{"deadline_at": null}'::jsonb),
      ('seoul_district_transfer_account', '{"account_number": ""}'::jsonb),
      ('participation_targets', '{"rows": [], "targets": {}}'::jsonb),
      ('global_scenario_checklist', '{"checked_step_ids": []}'::jsonb)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  if p_reset_campus_admin_roles then
    delete from admin_roles where role = 'campus_admin';
    get diagnostics v_campus_admins = row_count;
  end if;

  if p_reset_organization then
    update admin_roles
    set district_id = null, team_id = null, campus_id = null,
        district = null, team = null, campus = null, updated_at = now()
    where role = 'global_admin';
    update profiles
    set district_id = null, team_id = null, campus_id = null,
        district = null, team = null, campus = null, updated_at = now()
    where district_id is not null or team_id is not null or campus_id is not null
       or district is not null or team is not null or campus is not null;
    select count(*) into v_districts from districts;
    select count(*) into v_teams from teams;
    select count(*) into v_campuses from campuses;
    delete from districts where true;
  end if;

  if p_reset_user_accounts then
    update admin_roles set granted_by = null where granted_by is not null;
    delete from auth.users where id <> auth.uid();
    get diagnostics v_user_accounts = row_count;
  end if;

  return jsonb_build_object(
    'reservations', v_reservations,
    'payments', v_payments,
    'campusTransfers', v_transfers,
    'busAllocations', v_allocations,
    'campusRequests', v_requests,
    'campusRequestMessages', v_messages,
    'stations', v_stations,
    'busOptions', v_bus_options,
    'appSettings', v_app_settings,
    'homeAnnouncements', v_announcements,
    'campusAdminRoles', v_campus_admins,
    'organization', v_districts + v_teams + v_campuses,
    'userAccounts', v_user_accounts
  );
end;
$$;

revoke all on function reset_reservation_data(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function reset_reservation_data(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
revoke all on function get_deletable_user_count() from public;
grant execute on function get_deletable_user_count() to authenticated;
notify pgrst, 'reload schema';

-- =========================================================
-- BEGIN sql/setup/57_atomic_admin_remaining_seat_sale.sql
-- =========================================================

-- =========================================================
-- Atomic remaining-seat sales by global admins
-- Run after 55_atomic_allocation_confirmation.sql.
-- =========================================================

create or replace function public.sell_remaining_seat_as_admin(
  p_allocation_id uuid,
  p_reservation_id uuid,
  p_bus_label text,
  p_departure_time text,
  p_boarding_place text,
  p_seat_number text,
  p_manager_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_allocation_name text;
  v_allocation_data jsonb;
  v_bus jsonb;
  v_bus_id text;
  v_capacity integer;
  v_assigned_count integer;
  v_seat_number integer;
  v_destination text;
  v_sale_marker text;
  v_ticket jsonb;
  v_reservation record;
  v_preferences jsonb;
  v_passenger jsonb;
  v_history_item jsonb;
  v_updated_count integer;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can sell remaining seats.';
  end if;

  if nullif(btrim(p_bus_label), '') is null
    or nullif(btrim(p_departure_time), '') is null
    or nullif(btrim(p_boarding_place), '') is null then
    raise exception 'Bus, departure time, and boarding place are required.';
  end if;

  lock table public.bus_allocations in share row exclusive mode;
  lock table public.reservations in share row exclusive mode;

  select allocation_name, allocation_data
  into v_allocation_name, v_allocation_data
  from public.bus_allocations
  where id = p_allocation_id
    and allocation_data ->> 'status' = 'confirmed'
  for update;

  if v_allocation_data is null then
    raise exception 'The selected allocation is no longer available.';
  end if;

  select bus
  into v_bus
  from jsonb_array_elements(
    coalesce(v_allocation_data -> 'buses', '[]'::jsonb)
  ) bus
  where bus ->> 'label' = p_bus_label
  limit 1;

  if v_bus is null
    or coalesce(v_bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
    or nullif(btrim(v_bus ->> 'id'), '') is null
    or nullif(btrim(v_bus ->> 'destination'), '') is null then
    raise exception 'The selected bus is no longer available.';
  end if;

  v_bus_id := v_bus ->> 'id';
  v_capacity := (v_bus ->> 'capacity')::integer;
  v_destination := v_bus ->> 'destination';

  v_sale_marker := '잔여석 판매 · ' || v_allocation_name;

  select count(*)::integer
  into v_assigned_count
  from jsonb_array_elements(
    coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)
  ) passenger
  where passenger ->> 'busId' = v_bus_id;

  if v_assigned_count >= v_capacity then
    raise exception 'No remaining seats are available on this bus.';
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
    and status is distinct from 'cancelled'
    and confirmed_ticket is null
    and exists (
      select 1
      from jsonb_array_elements(
        coalesce(station_preferences, '[]'::jsonb)
      ) preference
      where preference -> 'station' ->> 'name' = v_destination
    )
  for update;

  if v_reservation.id is null then
    raise exception 'The selected reservation is no longer available.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)
    ) passenger
    where passenger ->> 'reservationId' = p_reservation_id::text
  ) then
    raise exception 'The selected reservation is no longer available.';
  end if;

  if nullif(btrim(coalesce(p_seat_number, '')), '') is not null then
    if btrim(p_seat_number) !~ '^[1-9][0-9]*$'
      or btrim(p_seat_number)::integer > v_capacity then
      raise exception 'The selected seat number is invalid.';
    end if;

    v_seat_number := btrim(p_seat_number)::integer;

    if exists (
      select 1
      from jsonb_array_elements(
        coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)
      ) passenger
      where passenger ->> 'busId' = v_bus_id
        and passenger ->> 'seatNumber' = v_seat_number::text
    ) then
      raise exception 'The selected seat number is already assigned.';
    end if;
  else
    select candidate
    into v_seat_number
    from generate_series(1, v_capacity) candidate
    where not exists (
      select 1
      from jsonb_array_elements(
        coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)
      ) passenger
      where passenger ->> 'busId' = v_bus_id
        and passenger ->> 'seatNumber' = candidate::text
    )
    order by candidate
    limit 1;
  end if;

  if v_seat_number is null then
    raise exception 'No remaining seats are available on this bus.';
  end if;

  v_ticket := jsonb_build_object(
    'busNumber', p_bus_label,
    'seatNumber', v_seat_number::text,
    'departureTime', btrim(p_departure_time),
    'boardingPlace', btrim(p_boarding_place),
    'dropoffStation', v_destination,
    'managerNote', v_sale_marker
      || case
        when nullif(btrim(coalesce(p_manager_note, '')), '') is null then ''
        else ' / ' || btrim(p_manager_note)
      end,
    'confirmedAt', v_now::text
  );

  select coalesce(
    jsonb_agg(
      preference -> 'station' ->> 'name'
      order by case
        when coalesce(preference ->> 'rank', '') ~ '^[1-9][0-9]*$'
          then (preference ->> 'rank')::integer
        else 99
      end
    ),
    jsonb_build_array(v_destination, v_destination)
  )
  into v_preferences
  from jsonb_array_elements(
    coalesce(v_reservation.station_preferences, '[]'::jsonb)
  ) preference
  where nullif(preference -> 'station' ->> 'name', '') is not null;

  v_passenger := jsonb_build_object(
    'reservationId', p_reservation_id::text,
    'name', coalesce(v_reservation.data ->> 'name', v_reservation.name, '-'),
    'campus', coalesce(v_reservation.data ->> 'campus', v_reservation.campus, '-'),
    'team', coalesce(v_reservation.data ->> 'team', v_reservation.team, '-'),
    'preferences', v_preferences,
    'busId', v_bus_id,
    'seatNumber', v_seat_number
  );
  v_history_item := jsonb_build_object(
    'id', 'admin-remaining-seat-' || gen_random_uuid()::text,
    'at', v_now::text,
    'actorId', auth.uid()::text,
    'action', 'admin_remaining_seat_sold',
    'detail', coalesce(v_reservation.data ->> 'name', v_reservation.name, '-')
      || ': ' || p_bus_label || ' ' || v_seat_number || '번 잔여 좌석 판매'
  );

  update public.bus_allocations
  set
    allocation_data = jsonb_set(
      jsonb_set(
        v_allocation_data,
        '{passengers}',
        coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)
          || jsonb_build_array(v_passenger),
        true
      ),
      '{history}',
      coalesce(v_allocation_data -> 'history', '[]'::jsonb)
        || jsonb_build_array(v_history_item),
      true
    ),
    updated_at = v_now,
    revision = revision + 1
  where id = p_allocation_id;

  update public.reservations
  set
    status = 'confirmed',
    confirmed_ticket = v_ticket,
    data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
      'status', 'confirmed',
      'confirmedTicket', v_ticket,
      'updatedAt', v_now::text
    ),
    updated_at = v_now
  where id = p_reservation_id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'The selected reservation could not be confirmed.';
  end if;

  return v_ticket;
end;
$$;

revoke all on function public.sell_remaining_seat_as_admin(
  uuid, uuid, text, text, text, text, text
) from public, anon;
grant execute on function public.sell_remaining_seat_as_admin(
  uuid, uuid, text, text, text, text, text
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/57_atomic_admin_remaining_seat_sale.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/58_simulation_runtime.sql
-- =========================================================

insert into public.app_settings (key, value)
values ('simulation_enabled', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.simulation_stage_runs (
  id uuid primary key default gen_random_uuid(),
  stage text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  requested_by uuid not null references auth.users(id),
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_simulation_stage_runs_started_at
  on public.simulation_stage_runs(started_at desc);

alter table public.simulation_stage_runs enable row level security;

drop policy if exists "Global admins can view simulation stage runs"
  on public.simulation_stage_runs;

create policy "Global admins can view simulation stage runs"
on public.simulation_stage_runs
for select
to authenticated
using (public.is_global_admin());

revoke all on table public.simulation_stage_runs from public, anon;
grant select on table public.simulation_stage_runs to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/58_simulation_runtime.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/63_admin_delete_user_account.sql
-- =========================================================

create or replace function public.delete_user_account_as_admin(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_reservation_ids text[];
  v_allocation public.bus_allocations%rowtype;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can delete user accounts.';
  end if;

  if p_user_id is null then
    raise exception 'A user ID is required.';
  end if;

  if p_user_id = v_actor_id then
    raise exception 'The currently signed-in account cannot be deleted.';
  end if;

  perform 1
  from auth.users
  where id = p_user_id
  for update;

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.admin_roles
    where user_id = p_user_id
      and role = 'global_admin'
  ) then
    raise exception 'Global admin accounts cannot be deleted.';
  end if;

  select coalesce(array_agg(id::text), array[]::text[])
  into v_reservation_ids
  from public.reservations
  where user_id = p_user_id;

  for v_allocation in
    select allocation.*
    from public.bus_allocations allocation
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and exists (
        select 1
        from jsonb_array_elements(
          coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)
        ) passenger
        where passenger ->> 'reservationId' = any(v_reservation_ids)
      )
    for update
  loop
    update public.bus_allocations
    set
      allocation_data = jsonb_set(
        jsonb_set(
          v_allocation.allocation_data,
          '{passengers}',
          coalesce((
            select jsonb_agg(passenger.value order by passenger.ordinality)
            from jsonb_array_elements(
              coalesce(v_allocation.allocation_data -> 'passengers', '[]'::jsonb)
            )
              with ordinality passenger(value, ordinality)
            where not (passenger.value ->> 'reservationId' = any(v_reservation_ids))
          ), '[]'::jsonb),
          true
        ),
        '{history}',
        coalesce(v_allocation.allocation_data -> 'history', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'id', 'history-' || gen_random_uuid()::text,
            'at', v_now::text,
            'actorId', v_actor_id::text,
            'action', 'user_account_deleted',
            'detail', 'Deleted user was removed from the confirmed allocation.'
          )),
        true
      ),
      updated_at = v_now,
      revision = revision + 1
    where id = v_allocation.id;
  end loop;

  update public.payments
  set verified_by = null
  where verified_by = p_user_id;

  update public.bus_allocations
  set created_by = null
  where created_by = p_user_id;

  update public.admin_roles
  set granted_by = null
  where granted_by = p_user_id;

  update public.campus_transfers
  set
    sent_by = case when sent_by = p_user_id then null else sent_by end,
    confirmed_by = case when confirmed_by = p_user_id then null else confirmed_by end
  where sent_by = p_user_id
    or confirmed_by = p_user_id;

  update public.campus_requests
  set handled_by = null
  where handled_by = p_user_id;

  delete from public.campus_requests
  where created_by = p_user_id;

  delete from public.campus_request_messages
  where sender_id = p_user_id;

  if to_regclass('public.simulation_stage_runs') is not null then
    execute 'delete from public.simulation_stage_runs where requested_by = $1'
      using p_user_id;
  end if;

  delete from auth.users
  where id = p_user_id;

  return found;
end;
$$;

revoke all on function public.delete_user_account_as_admin(uuid)
from public, anon;
grant execute on function public.delete_user_account_as_admin(uuid)
to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/63_admin_delete_user_account.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/64_allocation_workspace_versions.sql
-- =========================================================

create table if not exists public.allocation_workspace_versions (
  id text primary key,
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  revision bigint not null,
  label text not null,
  actor_id text not null,
  changes jsonb not null default '[]'::jsonb,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_allocation_workspace_versions_allocation_created
  on public.allocation_workspace_versions(allocation_id, created_at desc);

alter table public.allocation_workspace_versions enable row level security;
revoke all on table public.allocation_workspace_versions from public, anon, authenticated;

insert into public.allocation_workspace_versions (
  id, allocation_id, revision, label, actor_id, changes, snapshot, created_at
)
select
  version.value ->> 'id',
  allocation.id,
  version.ordinality,
  coalesce(nullif(version.value ->> 'label', ''), 'Legacy save ' || version.ordinality),
  coalesce(nullif(version.value ->> 'actorId', ''), 'unknown'),
  coalesce(history.value -> 'changes', '[]'::jsonb),
  jsonb_build_object(
    'buses', coalesce(version.value -> 'buses', '[]'::jsonb),
    'passengers', coalesce(version.value -> 'passengers', '[]'::jsonb)
  ),
  coalesce(nullif(version.value ->> 'createdAt', '')::timestamptz, allocation.created_at)
from public.bus_allocations allocation
cross join lateral jsonb_array_elements(
  coalesce(allocation.allocation_data -> 'versions', '[]'::jsonb)
) with ordinality version(value, ordinality)
left join lateral (
  select history_item.value
  from jsonb_array_elements(
    coalesce(allocation.allocation_data -> 'history', '[]'::jsonb)
  ) history_item(value)
  where history_item.value ->> 'versionId' = version.value ->> 'id'
  limit 1
) history on true
where nullif(version.value ->> 'id', '') is not null
on conflict (id) do nothing;

update public.bus_allocations
set allocation_data = jsonb_set(
  allocation_data - 'versions', '{schemaVersion}', '2'::jsonb, true
)
where allocation_data ? 'versions'
   or (
     allocation_data ? 'buses'
     and allocation_data ? 'passengers'
     and allocation_data ->> 'schemaVersion' is distinct from '2'
   );

create or replace function public.store_allocation_workspace_version(
  p_allocation_id uuid,
  p_revision bigint,
  p_allocation_data jsonb,
  p_version_id text,
  p_version_label text,
  p_version_changes jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.allocation_workspace_versions (
    id, allocation_id, revision, label, actor_id, changes, snapshot
  )
  values (
    p_version_id,
    p_allocation_id,
    p_revision,
    p_version_label,
    auth.uid()::text,
    coalesce(p_version_changes, '[]'::jsonb),
    jsonb_build_object(
      'buses', coalesce(p_allocation_data -> 'buses', '[]'::jsonb),
      'passengers', coalesce(p_allocation_data -> 'passengers', '[]'::jsonb)
    )
  );

  delete from public.allocation_workspace_versions version
  where version.id in (
    select old_version.id
    from public.allocation_workspace_versions old_version
    where old_version.allocation_id = p_allocation_id
    order by old_version.created_at desc, old_version.id desc
    offset 20
  );
end;
$$;

create or replace function public.get_allocation_workspace_versions(p_allocation_id uuid)
returns table (id text, created_at timestamptz, actor_id text, label text, changes jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation versions.';
  end if;

  return query
  select version.id, version.created_at, version.actor_id, version.label, version.changes
  from public.allocation_workspace_versions version
  where version.allocation_id = p_allocation_id
  order by version.created_at desc, version.id desc;
end;
$$;

create or replace function public.get_allocation_workspace_version_snapshot(p_version_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation versions.';
  end if;

  select version.snapshot into v_snapshot
  from public.allocation_workspace_versions version
  where version.id = p_version_id;

  if v_snapshot is null then
    raise exception 'Allocation workspace version not found.';
  end if;
  return v_snapshot;
end;
$$;

create or replace function public.save_draft_allocation_workspace_v2(
  p_allocation_id uuid, p_expected_revision bigint, p_allocation_data jsonb,
  p_total_cost integer, p_total_capacity integer, p_version_id text,
  p_version_label text, p_version_changes jsonb
)
returns setof public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved public.bus_allocations%rowtype;
begin
  select * into v_saved
  from public.save_draft_allocation_workspace(
    p_allocation_id, p_expected_revision, p_allocation_data - 'versions',
    p_total_cost, p_total_capacity
  );
  perform public.store_allocation_workspace_version(
    p_allocation_id, v_saved.revision, p_allocation_data,
    p_version_id, p_version_label, p_version_changes
  );
  return next v_saved;
end;
$$;

create or replace function public.save_confirmed_allocation_workspace_v2(
  p_allocation_id uuid, p_expected_revision bigint, p_allocation_data jsonb,
  p_total_cost integer, p_total_capacity integer, p_version_id text,
  p_version_label text, p_version_changes jsonb
)
returns setof public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved public.bus_allocations%rowtype;
begin
  select * into v_saved
  from public.save_confirmed_allocation_workspace(
    p_allocation_id, p_expected_revision, p_allocation_data - 'versions',
    p_total_cost, p_total_capacity
  );
  perform public.store_allocation_workspace_version(
    p_allocation_id, v_saved.revision, p_allocation_data,
    p_version_id, p_version_label, p_version_changes
  );
  return next v_saved;
end;
$$;

create or replace function public.cancel_confirmed_allocation_workspace_v2(
  p_allocation_id uuid, p_expected_revision bigint, p_allocation_data jsonb,
  p_total_cost integer, p_total_capacity integer, p_version_id text,
  p_version_label text, p_version_changes jsonb
)
returns setof public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved public.bus_allocations%rowtype;
begin
  select * into v_saved
  from public.cancel_confirmed_allocation_workspace(
    p_allocation_id, p_expected_revision, p_allocation_data - 'versions',
    p_total_cost, p_total_capacity
  );
  perform public.store_allocation_workspace_version(
    p_allocation_id, v_saved.revision, p_allocation_data,
    p_version_id, p_version_label, p_version_changes
  );
  return next v_saved;
end;
$$;

revoke all on function public.store_allocation_workspace_version(
  uuid, bigint, jsonb, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.get_allocation_workspace_versions(uuid) from public, anon;
grant execute on function public.get_allocation_workspace_versions(uuid) to authenticated;
revoke all on function public.get_allocation_workspace_version_snapshot(text) from public, anon;
grant execute on function public.get_allocation_workspace_version_snapshot(text) to authenticated;
revoke all on function public.save_draft_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from public, anon;
grant execute on function public.save_draft_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) to authenticated;
revoke all on function public.save_confirmed_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from public, anon;
grant execute on function public.save_confirmed_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) to authenticated;
revoke all on function public.cancel_confirmed_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from public, anon;
grant execute on function public.cancel_confirmed_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/64_allocation_workspace_versions.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/65_canonical_reservation_status.sql
-- =========================================================

create or replace function public.sync_reservation_canonical_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status <> 'confirmed' then
    new.confirmed_ticket := null;
  end if;

  new.data := jsonb_set(
    coalesce(new.data, '{}'::jsonb),
    '{status}',
    to_jsonb(new.status),
    true
  );

  if new.confirmed_ticket is null then
    new.data := new.data - 'confirmedTicket';
  else
    new.data := jsonb_set(
      new.data,
      '{confirmedTicket}',
      new.confirmed_ticket,
      true
    );
  end if;

  return new;
end;
$$;

update public.reservations
set status = 'requested'
where status is null;

alter table public.reservations
  alter column status set default 'requested';

alter table public.reservations
  alter column status set not null;

drop trigger if exists sync_reservation_canonical_fields
  on public.reservations;

create trigger sync_reservation_canonical_fields
before insert or update of status, confirmed_ticket, data
on public.reservations
for each row
execute function public.sync_reservation_canonical_fields();

update public.reservations
set data = data
where coalesce(data ->> 'status', '') is distinct from status
  or data -> 'confirmedTicket' is distinct from confirmed_ticket
  or (status <> 'confirmed' and confirmed_ticket is not null);

revoke all on function public.sync_reservation_canonical_fields() from public, anon;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/65_canonical_reservation_status.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/66_atomic_admin_personal_ticket.sql
-- =========================================================

create or replace function public.update_personal_ticket_as_admin(
  p_reservation_id uuid,
  p_next_status text,
  p_ticket jsonb default null
)
returns setof public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_reservation public.reservations%rowtype;
  v_allocation public.bus_allocations%rowtype;
  v_target_allocation_id uuid;
  v_target_bus jsonb;
  v_bus_match_count integer := 0;
  v_seat_number integer;
  v_preferences jsonb;
  v_passenger jsonb;
  v_passengers jsonb;
  v_ticket jsonb;
  v_action text;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can manage personal tickets.';
  end if;
  if p_next_status not in ('requested', 'confirmed', 'cancelled') then
    raise exception 'Invalid reservation status.';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;
  if not found then
    raise exception 'Reservation not found.';
  end if;

  perform 1
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;

  if p_next_status = 'confirmed' then
    if jsonb_typeof(coalesce(p_ticket, 'null'::jsonb)) <> 'object'
      or nullif(btrim(p_ticket ->> 'busNumber'), '') is null
      or coalesce(p_ticket ->> 'seatNumber', '') !~ '^[1-9][0-9]*$' then
      raise exception 'A valid bus and seat number are required.';
    end if;

    v_seat_number := (p_ticket ->> 'seatNumber')::integer;
    select count(*) into v_bus_match_count
    from public.bus_allocations allocation
    cross join lateral jsonb_array_elements(
      coalesce(allocation.allocation_data -> 'buses', '[]'::jsonb)
    ) bus
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and bus ->> 'label' = btrim(p_ticket ->> 'busNumber');

    if v_bus_match_count = 0 then
      raise exception 'The selected bus does not exist in the confirmed allocation.';
    end if;
    if v_bus_match_count > 1 then
      raise exception 'The selected bus name is duplicated in confirmed allocations.';
    end if;

    select allocation.id, bus
    into v_target_allocation_id, v_target_bus
    from public.bus_allocations allocation
    cross join lateral jsonb_array_elements(
      coalesce(allocation.allocation_data -> 'buses', '[]'::jsonb)
    ) bus
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and bus ->> 'label' = btrim(p_ticket ->> 'busNumber')
    limit 1;

    if coalesce(v_target_bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
      or v_seat_number > (v_target_bus ->> 'capacity')::integer then
      raise exception 'The selected seat number exceeds the bus capacity.';
    end if;
    if exists (
      select 1
      from public.bus_allocations allocation
      cross join lateral jsonb_array_elements(
        coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)
      ) passenger
      where allocation.id = v_target_allocation_id
        and passenger ->> 'reservationId' <> p_reservation_id::text
        and passenger ->> 'busId' = v_target_bus ->> 'id'
        and passenger ->> 'seatNumber' = v_seat_number::text
    ) then
      raise exception 'The selected seat number is already assigned.';
    end if;

    select coalesce(
      jsonb_agg(preference -> 'station' ->> 'name' order by (preference ->> 'rank')::integer),
      '[]'::jsonb
    )
    into v_preferences
    from jsonb_array_elements(coalesce(v_reservation.station_preferences, '[]'::jsonb))
      preference;

    v_passenger := jsonb_build_object(
      'reservationId', p_reservation_id::text,
      'name', coalesce(v_reservation.name, '-'),
      'phone', coalesce(v_reservation.phone, '-'),
      'campus', coalesce(v_reservation.campus, '-'),
      'team', coalesce(v_reservation.team, '-'),
      'preferences', v_preferences,
      'busId', v_target_bus ->> 'id',
      'seatNumber', v_seat_number
    );
    v_ticket := jsonb_strip_nulls(jsonb_build_object(
      'busNumber', v_target_bus ->> 'label',
      'seatNumber', v_seat_number::text,
      'departureTime', v_target_bus ->> 'departureTime',
      'boardingPlace', v_target_bus ->> 'boardingPlace',
      'dropoffStation', v_target_bus ->> 'destination',
      'managerNote', nullif(btrim(p_ticket ->> 'managerNote'), ''),
      'confirmedAt', coalesce(
        nullif(v_reservation.confirmed_ticket ->> 'confirmedAt', ''),
        v_now::text
      )
    ));
    v_action := 'personal_ticket_confirmed';
  elsif p_next_status = 'cancelled' then
    v_action := 'personal_ticket_reservation_cancelled';
  else
    v_action := 'personal_ticket_cleared';
  end if;

  for v_allocation in
    select allocation.*
    from public.bus_allocations allocation
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and (
        allocation.id = v_target_allocation_id
        or exists (
          select 1
          from jsonb_array_elements(
            coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)
          ) passenger
          where passenger ->> 'reservationId' = p_reservation_id::text
        )
      )
  loop
    select coalesce(jsonb_agg(passenger.value order by passenger.ordinality), '[]'::jsonb)
    into v_passengers
    from jsonb_array_elements(
      coalesce(v_allocation.allocation_data -> 'passengers', '[]'::jsonb)
    ) with ordinality passenger(value, ordinality)
    where passenger.value ->> 'reservationId' <> p_reservation_id::text;

    if p_next_status = 'confirmed' and v_allocation.id = v_target_allocation_id then
      v_passengers := v_passengers || jsonb_build_array(v_passenger);
    end if;

    update public.bus_allocations
    set
      allocation_data = jsonb_set(
        jsonb_set(v_allocation.allocation_data, '{passengers}', v_passengers, true),
        '{history}',
        coalesce(v_allocation.allocation_data -> 'history', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'id', 'history-' || gen_random_uuid()::text,
            'at', v_now::text,
            'actorId', v_actor_id::text,
            'action', v_action,
            'detail', coalesce(v_reservation.name, p_reservation_id::text)
              || ' personal ticket was synchronized.'
          )),
        true
      ),
      updated_at = v_now,
      revision = revision + 1
    where id = v_allocation.id;
  end loop;

  update public.reservations
  set
    status = p_next_status,
    confirmed_ticket = case when p_next_status = 'confirmed' then v_ticket else null end,
    data = jsonb_set(
      coalesce(data, '{}'::jsonb),
      '{updatedAt}',
      to_jsonb(v_now::text),
      true
    ),
    updated_at = v_now
  where id = p_reservation_id;

  return query select * from public.reservations where id = p_reservation_id;
end;
$$;

revoke all on function public.update_personal_ticket_as_admin(uuid, text, jsonb)
  from public, anon;
grant execute on function public.update_personal_ticket_as_admin(uuid, text, jsonb)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/66_atomic_admin_personal_ticket.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/67_reservations_rpc_only_writes.sql
-- =========================================================

-- Reservation writes are only allowed through validated SECURITY DEFINER RPCs.
drop policy if exists "Users can insert own reservations" on public.reservations;
drop policy if exists "Users can update own reservations" on public.reservations;
drop policy if exists "Users can delete own reservations" on public.reservations;
drop policy if exists "Global admins can update reservations" on public.reservations;

revoke insert, update, delete on table public.reservations from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/67_reservations_rpc_only_writes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/68_payments_rpc_only_writes.sql
-- =========================================================

-- Payment writes are only allowed through validated SECURITY DEFINER RPCs.
drop policy if exists "Users can insert own payments" on public.payments;
drop policy if exists "Campus admins can update campus payments" on public.payments;
drop policy if exists "Global admins can update all payments" on public.payments;

revoke insert, update, delete on table public.payments from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/68_payments_rpc_only_writes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/70_admin_personal_ticket_page.sql
-- =========================================================

create or replace function public.get_admin_personal_ticket_page(
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default '',
  p_status text default 'all',
  p_ticket text default 'all',
  p_admin_role text default 'all',
  p_campus_issue text default 'all',
  p_campus text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_search text := trim(coalesce(p_search, ''));
  v_result jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage personal tickets.';
  end if;

  with reservation_people as (
    select
      coalesce(nullif(r.data ->> 'id', ''), r.id::text) as id,
      r.id as db_id,
      r.user_id,
      p.email,
      coalesce(nullif(r.data ->> 'name', ''), nullif(r.name, ''), p.name, '') as name,
      coalesce(nullif(r.data ->> 'phone', ''), nullif(r.phone, ''), p.phone, '') as phone,
      coalesce(nullif(r.data ->> 'district', ''), nullif(r.district, ''), p.district, '') as district,
      coalesce(nullif(r.data ->> 'team', ''), nullif(r.team, ''), p.team, '') as team,
      coalesce(nullif(r.data ->> 'campus', ''), nullif(r.campus, ''), p.campus, '') as campus,
      coalesce(r.data -> 'stationPreferences', r.station_preferences, '[]'::jsonb) as station_preferences,
      coalesce(r.status, nullif(r.data ->> 'status', ''), 'requested') as status,
      pay.status as payment_status,
      coalesce(
        nullif(r.confirmed_ticket, 'null'::jsonb),
        nullif(r.data -> 'confirmedTicket', 'null'::jsonb)
      ) as confirmed_ticket,
      coalesce(nullif(r.data ->> 'requestedAt', ''), r.created_at::text, '') as requested_at,
      coalesce(nullif(r.data ->> 'updatedAt', ''), r.updated_at::text) as updated_at,
      r.data as raw_data,
      true as has_reservation
    from public.reservations r
    left join public.profiles p on p.id = r.user_id
    left join public.payments pay on pay.reservation_id = r.id
  ),
  not_applied_people as (
    select
      'profile-' || p.id::text,
      null::uuid,
      p.id,
      p.email,
      coalesce(p.name, ''),
      coalesce(p.phone, ''),
      coalesce(p.district, ''),
      coalesce(p.team, ''),
      coalesce(p.campus, ''),
      '[]'::jsonb,
      'not_applied'::text,
      null::text,
      null::jsonb,
      ''::text,
      null::text,
      null::jsonb,
      false
    from public.profiles p
    where not exists (
      select 1 from public.reservations r where r.user_id = p.id
    )
  ),
  people as (
    select * from reservation_people
    union all
    select * from not_applied_people
  ),
  people_with_roles as (
    select
      person.*,
      coalesce(roles.admin_roles, '[]'::jsonb) as admin_roles,
      coalesce(roles.role_names, array[]::text[]) as role_names,
      (
        (person.has_reservation and person.status <> 'cancelled' and person.payment_status is distinct from 'completed')
        or person.status = 'not_applied'
      ) as has_campus_issue
    from people person
    left join lateral (
      select
        jsonb_agg(
          jsonb_build_object(
            'id', ar.id,
            'user_id', ar.user_id,
            'role', ar.role,
            'district', ar.district,
            'team', ar.team,
            'campus', ar.campus
          )
          order by ar.role, ar.id
        ) as admin_roles,
        array_agg(ar.role) as role_names
      from public.admin_roles ar
      where ar.user_id = person.user_id
    ) roles on true
  ),
  filtered as (
    select *
    from people_with_roles person
    where
      (p_status = 'all' or person.status = p_status)
      and (
        p_ticket = 'all'
        or (p_ticket = 'not_applied' and person.status = 'not_applied')
        or (p_ticket = 'confirmed' and person.confirmed_ticket is not null)
        or (
          p_ticket = 'pending'
          and person.has_reservation
          and person.status <> 'cancelled'
          and person.confirmed_ticket is null
        )
      )
      and (p_campus = 'all' or person.campus = p_campus)
      and (p_campus_issue = 'all' or person.has_campus_issue)
      and (
        p_admin_role = 'all'
        or (p_admin_role = 'general' and cardinality(person.role_names) = 0)
        or p_admin_role = any(person.role_names)
      )
      and (
        v_search = ''
        or concat_ws(
          ' ',
          person.name,
          person.email,
          person.phone,
          person.district,
          person.team,
          person.campus,
          person.station_preferences::text,
          person.confirmed_ticket::text
        ) ilike '%' || replace(v_search, '%', '\%') || '%'
      )
  ),
  page_rows as (
    select *
    from filtered
    order by campus collate "default", team collate "default", name collate "default", user_id
    offset (v_page - 1) * v_page_size
    limit v_page_size
  ),
  summary as (
    select
      count(*)::integer as total,
      count(*) filter (where status <> 'not_applied')::integer as applied,
      count(*) filter (where status not in ('cancelled', 'not_applied') and confirmed_ticket is not null)::integer as confirmed,
      count(*) filter (where status not in ('cancelled', 'not_applied') and confirmed_ticket is null)::integer as pending,
      count(*) filter (where status = 'cancelled')::integer as cancelled,
      count(*) filter (where status = 'not_applied')::integer as not_applied
    from people_with_roles
  ),
  campus_summary as (
    select
      campus as name,
      count(*) filter (where has_campus_issue)::integer as issue_count,
      count(*) filter (where status = 'not_applied')::integer as not_applied_count,
      count(*) filter (
        where has_reservation and status <> 'cancelled' and payment_status is distinct from 'completed'
      )::integer as unpaid_count
    from people_with_roles
    where campus <> ''
    group by campus
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', row.id,
            'db_id', row.db_id,
            'user_id', row.user_id,
            'email', row.email,
            'name', row.name,
            'phone', row.phone,
            'district', row.district,
            'team', row.team,
            'campus', row.campus,
            'station_preferences', row.station_preferences,
            'status', row.status,
            'payment_status', row.payment_status,
            'confirmed_ticket', row.confirmed_ticket,
            'requested_at', row.requested_at,
            'updated_at', row.updated_at,
            'raw_data', row.raw_data,
            'has_reservation', row.has_reservation,
            'admin_roles', row.admin_roles
          )
          order by row.campus collate "default", row.team collate "default", row.name collate "default", row.user_id
        )
        from page_rows row
      ),
      '[]'::jsonb
    ),
    'total', (select total from summary),
    'filtered_total', (select count(*) from filtered),
    'summary', (select to_jsonb(summary) from summary),
    'campuses',
    coalesce(
      (
        select jsonb_agg(to_jsonb(campus_summary) order by name collate "default")
        from campus_summary
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_admin_personal_ticket_page(integer, integer, text, text, text, text, text, text) from public, anon;
grant execute on function public.get_admin_personal_ticket_page(integer, integer, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/70_admin_personal_ticket_page.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/69_admin_roles_rpc_only_writes.sql
-- =========================================================

create or replace function public.assign_campus_admin_as_global_admin(
  p_user_id uuid,
  p_district text,
  p_team text,
  p_campus text
)
returns public.admin_roles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.admin_roles;
  v_district_id uuid;
  v_team_id uuid;
  v_campus_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can assign campus admins.';
  end if;

  if p_user_id is null then
    raise exception 'A user ID is required.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found.';
  end if;

  select district_id, team_id, campus_id
  into v_district_id, v_team_id, v_campus_id
  from public.campus_options
  where district = nullif(trim(p_district), '')
    and team = nullif(trim(p_team), '')
    and campus = nullif(trim(p_campus), '')
  limit 1;

  if v_campus_id is null then
    raise exception 'Active campus scope not found.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'admin_roles:campus:' || v_district_id::text || ':' || v_team_id::text || ':' || v_campus_id::text,
      0
    )
  );

  delete from public.admin_roles
  where role = 'campus_admin'
    and district_id = v_district_id
    and team_id = v_team_id
    and campus_id = v_campus_id;

  insert into public.admin_roles (
    user_id, role, district, team, campus,
    district_id, team_id, campus_id, granted_by, updated_at
  )
  values (
    p_user_id, 'campus_admin', trim(p_district), trim(p_team), trim(p_campus),
    v_district_id, v_team_id, v_campus_id, auth.uid(), now()
  )
  returning * into v_role;

  return v_role;
end;
$$;

create or replace function public.cancel_campus_admin_as_global_admin(
  p_admin_role_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can cancel campus admins.';
  end if;

  if p_admin_role_id is null then
    raise exception 'An admin role ID is required.';
  end if;

  delete from public.admin_roles
  where id = p_admin_role_id
    and role = 'campus_admin'
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Campus admin role not found.';
  end if;

  return true;
end;
$$;

revoke all on function public.assign_campus_admin_as_global_admin(uuid, text, text, text)
  from public, anon;
grant execute on function public.assign_campus_admin_as_global_admin(uuid, text, text, text)
  to authenticated;

revoke all on function public.cancel_campus_admin_as_global_admin(uuid)
  from public, anon;
grant execute on function public.cancel_campus_admin_as_global_admin(uuid)
  to authenticated;

drop policy if exists "Global admins can manage admin roles" on public.admin_roles;
revoke insert, update, delete on table public.admin_roles from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/69_admin_roles_rpc_only_writes.sql
-- =========================================================

-- Run sql/setup/71_admin_setup_rpc_only_writes.sql after this combined setup.
-- Run sql/setup/72_app_settings_announcements_rpc_only.sql after this combined setup.
-- Run sql/setup/73_campus_transfers_rpc_only_writes.sql after this combined setup.
-- Run sql/setup/74_bus_allocations_rpc_only_writes.sql after this combined setup.

-- ===== 75_campus_admin_manage_users_page.sql =====
-- =========================================================
-- Server-paginated user list for campus administrator management.
-- =========================================================

create or replace function public.get_campus_admin_manage_users_page(
  p_district text default null,
  p_team text default null,
  p_campus text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  name text,
  phone text,
  district text,
  team text,
  campus text,
  role text,
  admin_role_id uuid,
  managed_campuses jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage campus administrators.';
  end if;

  return query
  with candidate_ids as (
    select profile.id
    from public.profiles profile
    where (nullif(trim(p_district), '') is null or profile.district = trim(p_district))
      and (nullif(trim(p_team), '') is null or profile.team = trim(p_team))
      and (nullif(trim(p_campus), '') is null or profile.campus = trim(p_campus))

    union

    select admin_role.user_id
    from public.admin_roles admin_role
    where admin_role.role = 'campus_admin'
      and (nullif(trim(p_district), '') is null or admin_role.district = trim(p_district))
      and (nullif(trim(p_team), '') is null or admin_role.team = trim(p_team))
      and (nullif(trim(p_campus), '') is null or admin_role.campus = trim(p_campus))
  ),
  candidates as (
    select
      profile.id,
      profile.email,
      profile.name,
      profile.phone,
      profile.district,
      profile.team,
      profile.campus,
      count(*) over () as total_count
    from public.profiles profile
    join candidate_ids candidate on candidate.id = profile.id
    order by profile.name asc nulls last, profile.email asc nulls last, profile.id
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    candidate.id as user_id,
    candidate.email,
    coalesce(candidate.name, '이름 없음') as name,
    candidate.phone,
    coalesce(selected_role.district, candidate.district) as district,
    coalesce(selected_role.team, candidate.team) as team,
    coalesce(selected_role.campus, candidate.campus) as campus,
    selected_role.role,
    selected_role.id as admin_role_id,
    coalesce(managed_roles.scopes, '[]'::jsonb) as managed_campuses,
    candidate.total_count
  from candidates candidate
  left join lateral (
    select admin_role.id, admin_role.role, admin_role.district, admin_role.team, admin_role.campus
    from public.admin_roles admin_role
    where admin_role.user_id = candidate.id
    order by
      case
        when admin_role.role = 'global_admin' then 0
        when admin_role.role = 'campus_admin'
          and admin_role.district is not distinct from nullif(trim(p_district), '')
          and admin_role.team is not distinct from nullif(trim(p_team), '')
          and admin_role.campus is not distinct from nullif(trim(p_campus), '')
          then 1
        else 2
      end,
      admin_role.updated_at desc nulls last,
      admin_role.created_at desc nulls last
    limit 1
  ) selected_role on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', admin_role.id,
        'district', admin_role.district,
        'team', admin_role.team,
        'campus', admin_role.campus
      )
      order by admin_role.district, admin_role.team, admin_role.campus
    ) as scopes
    from public.admin_roles admin_role
    where admin_role.user_id = candidate.id
      and admin_role.role = 'campus_admin'
  ) managed_roles on true
  order by candidate.name asc nulls last, candidate.email asc nulls last, candidate.id;
end;
$$;

revoke all on function public.get_campus_admin_manage_users_page(text, text, text, integer, integer)
from public, anon;
grant execute on function public.get_campus_admin_manage_users_page(text, text, text, integer, integer)
to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- 76_exact_allocation_optimization_jobs.sql
-- =========================================================

-- =========================================================
-- Exact allocation optimizer configuration and job queue
-- =========================================================

insert into public.app_settings (key, value)
values (
  'allocation_optimizer_config',
  jsonb_build_object(
    'capacity', 45,
    'price', 0,
    'recommended_minimum_passengers', 36
  )
)
on conflict (key) do nothing;

create table if not exists public.allocation_optimization_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'PENDING'
    check (
      status in (
        'PENDING',
        'RUNNING',
        'CANCEL_REQUESTED',
        'CANCELLED',
        'OPTIMAL',
        'INFEASIBLE',
        'FAILED'
      )
    ),
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancel_requested_at timestamptz,
  input_hash text not null,
  input_snapshot jsonb not null,
  progress integer not null default 0 check (progress between 0 and 100),
  current_phase text,
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  best_known_bus_count integer check (best_known_bus_count >= 0),
  proven_bus_count integer check (proven_bus_count >= 0),
  result jsonb,
  diagnostics jsonb,
  error_message text,
  worker_id text,
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_allocation_optimization_one_active_job
  on public.allocation_optimization_jobs ((true))
  where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED');

create index if not exists idx_allocation_optimization_jobs_requested
  on public.allocation_optimization_jobs (requested_at desc);

create table if not exists public.allocation_optimization_events (
  id bigint generated by default as identity primary key,
  job_id uuid not null
    references public.allocation_optimization_jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  event_type text not null,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists idx_allocation_optimization_events_job_created
  on public.allocation_optimization_events(job_id, created_at);

alter table public.allocation_optimization_jobs enable row level security;
alter table public.allocation_optimization_events enable row level security;

revoke all on table public.allocation_optimization_jobs
  from public, anon, authenticated;
revoke all on table public.allocation_optimization_events
  from public, anon, authenticated;

create or replace function public.set_allocation_optimization_job_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_allocation_optimization_job_updated_at
  on public.allocation_optimization_jobs;
create trigger set_allocation_optimization_job_updated_at
before update on public.allocation_optimization_jobs
for each row execute function public.set_allocation_optimization_job_updated_at();

revoke all on function public.set_allocation_optimization_job_updated_at()
  from public, anon, authenticated;

create or replace function public.get_allocation_optimizer_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimizer configuration.';
  end if;

  select value
  into v_config
  from public.app_settings
  where key = 'allocation_optimizer_config';

  return coalesce(
    v_config,
    jsonb_build_object(
      'capacity', 45,
      'price', 0,
      'recommended_minimum_passengers', 36
    )
  );
end;
$$;

create or replace function public.save_allocation_optimizer_config(
  p_capacity integer,
  p_price integer,
  p_recommended_minimum_passengers integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can update allocation optimizer configuration.';
  end if;
  if p_capacity <= 0 then
    raise exception 'Bus capacity must be positive.';
  end if;
  if p_price < 0 then
    raise exception 'Bus price cannot be negative.';
  end if;
  if p_recommended_minimum_passengers <= 0
    or p_recommended_minimum_passengers > p_capacity then
    raise exception 'Recommended minimum passengers must be between 1 and capacity.';
  end if;
  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Allocation optimizer configuration cannot change during an active job.';
  end if;

  v_config := jsonb_build_object(
    'capacity', p_capacity,
    'price', p_price,
    'recommended_minimum_passengers', p_recommended_minimum_passengers
  );

  insert into public.app_settings (key, value)
  values ('allocation_optimizer_config', v_config)
  on conflict (key) do update
  set value = excluded.value;

  return v_config;
end;
$$;

create or replace function public.create_allocation_optimization_job()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_config jsonb;
  v_passengers jsonb;
  v_snapshot jsonb;
  v_invalid_reservations text;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can create allocation optimization jobs.';
  end if;
  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Another allocation optimization job is already active.';
  end if;

  v_config := public.get_allocation_optimizer_config();
  if coalesce((v_config ->> 'capacity')::integer, 0) <= 0
    or coalesce((v_config ->> 'price')::integer, -1) < 0
    or coalesce((v_config ->> 'recommended_minimum_passengers')::integer, 0) <= 0 then
    raise exception 'Allocation optimizer configuration is invalid.';
  end if;

  with active_reservations as (
    select
      reservation.id,
      coalesce(nullif(reservation.data ->> 'campus', ''), nullif(reservation.campus, '')) as campus,
      coalesce(nullif(reservation.data ->> 'team', ''), nullif(reservation.team, '')) as team,
      case
        when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
          then reservation.data -> 'stationPreferences'
        else coalesce(reservation.station_preferences, '[]'::jsonb)
      end as preferences
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
  ),
  normalized as (
    select
      active.id,
      active.campus,
      active.team,
      active.preferences,
      active.preferences #>> '{0,station,name}' as first_choice,
      active.preferences #>> '{1,station,name}' as second_choice
    from active_reservations active
  )
  select string_agg(normalized.id::text, ', ' order by normalized.id::text)
  into v_invalid_reservations
  from normalized
  where normalized.campus is null
    or normalized.team is null
    or jsonb_typeof(normalized.preferences) <> 'array'
    or case
      when jsonb_typeof(normalized.preferences) = 'array'
        then jsonb_array_length(normalized.preferences) <> 2
      else true
    end
    or nullif(normalized.first_choice, '') is null
    or nullif(normalized.second_choice, '') is null
    or normalized.first_choice = normalized.second_choice;

  if v_invalid_reservations is not null then
    raise exception 'Active reservations have invalid allocation data: %',
      v_invalid_reservations;
  end if;

  with active_reservations as (
    select
      reservation.id,
      coalesce(nullif(reservation.data ->> 'campus', ''), reservation.campus, '-') as campus,
      coalesce(nullif(reservation.data ->> 'team', ''), reservation.team, '-') as team,
      case
        when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
          then reservation.data -> 'stationPreferences'
        else coalesce(reservation.station_preferences, '[]'::jsonb)
      end as preferences,
      reservation.created_at
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'reservation_id', active.id::text,
        'campus', active.campus,
        'team', active.team,
        'first_choice', active.preferences #>> '{0,station,name}',
        'second_choice', active.preferences #>> '{1,station,name}'
      )
      order by active.created_at, active.id
    ),
    '[]'::jsonb
  )
  into v_passengers
  from active_reservations active;

  if jsonb_array_length(v_passengers) = 0 then
    raise exception 'No active reservations are available for optimization.';
  end if;

  v_snapshot := jsonb_build_object(
    'schema_version', 1,
    'bus', v_config,
    'passengers', v_passengers
  );

  begin
    insert into public.allocation_optimization_jobs (
      status,
      requested_by,
      input_hash,
      input_snapshot
    )
    values (
      'PENDING',
      auth.uid(),
      md5(v_snapshot::text),
      v_snapshot
    )
    returning id into v_job_id;
  exception
    when unique_violation then
      raise exception 'Another allocation optimization job is already active.';
  end;

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    v_job_id,
    'JOB_CREATED',
    jsonb_build_object(
      'requested_by', auth.uid()::text,
      'passenger_count', jsonb_array_length(v_passengers),
      'input_hash', md5(v_snapshot::text)
    )
  );

  return v_job_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Allocation optimizer configuration contains invalid numbers.';
end;
$$;

create or replace function public.get_allocation_optimization_job(
  p_job_id uuid
)
returns table (
  id uuid,
  status text,
  requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  progress integer,
  current_phase text,
  elapsed_seconds integer,
  best_known_bus_count integer,
  proven_bus_count integer,
  result jsonb,
  diagnostics jsonb,
  error_message text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;

  return query
  select
    job.id,
    job.status,
    job.requested_at,
    job.started_at,
    job.completed_at,
    job.progress,
    job.current_phase,
    job.elapsed_seconds,
    job.best_known_bus_count,
    job.proven_bus_count,
    job.result,
    job.diagnostics,
    job.error_message
  from public.allocation_optimization_jobs job
  where job.id = p_job_id;
end;
$$;

create or replace function public.get_recent_allocation_optimization_jobs(
  p_limit integer default 20
)
returns table (
  id uuid,
  status text,
  requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  progress integer,
  current_phase text,
  elapsed_seconds integer,
  best_known_bus_count integer,
  proven_bus_count integer,
  error_message text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;

  return query
  select
    job.id,
    job.status,
    job.requested_at,
    job.started_at,
    job.completed_at,
    job.progress,
    job.current_phase,
    job.elapsed_seconds,
    job.best_known_bus_count,
    job.proven_bus_count,
    job.error_message
  from public.allocation_optimization_jobs job
  order by job.requested_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

create or replace function public.cancel_allocation_optimization_job(
  p_job_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can cancel allocation optimization jobs.';
  end if;

  update public.allocation_optimization_jobs job
  set
    status = case
      when job.status = 'PENDING' then 'CANCELLED'
      when job.status = 'RUNNING' then 'CANCEL_REQUESTED'
      else job.status
    end,
    cancel_requested_at = case
      when job.status in ('PENDING', 'RUNNING') then now()
      else job.cancel_requested_at
    end,
    completed_at = case
      when job.status = 'PENDING' then now()
      else job.completed_at
    end
  where job.id = p_job_id
  returning status into v_status;

  if v_status is null then
    raise exception 'Allocation optimization job not found.';
  end if;

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    p_job_id,
    'CANCEL_REQUESTED',
    jsonb_build_object('requested_by', auth.uid()::text, 'next_status', v_status)
  );

  return v_status;
end;
$$;

revoke all on function public.get_allocation_optimizer_config()
  from public, anon;
revoke all on function public.save_allocation_optimizer_config(integer, integer, integer)
  from public, anon;
revoke all on function public.create_allocation_optimization_job()
  from public, anon;
revoke all on function public.get_allocation_optimization_job(uuid)
  from public, anon;
revoke all on function public.get_recent_allocation_optimization_jobs(integer)
  from public, anon;
revoke all on function public.cancel_allocation_optimization_job(uuid)
  from public, anon;

grant execute on function public.get_allocation_optimizer_config()
  to authenticated;
grant execute on function public.save_allocation_optimizer_config(integer, integer, integer)
  to authenticated;
grant execute on function public.create_allocation_optimization_job()
  to authenticated;
grant execute on function public.get_allocation_optimization_job(uuid)
  to authenticated;
grant execute on function public.get_recent_allocation_optimization_jobs(integer)
  to authenticated;
grant execute on function public.cancel_allocation_optimization_job(uuid)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- 77_create_draft_from_exact_optimization.sql
-- =========================================================

-- =========================================================
-- Create a draft only from a validated OPTIMAL job result
-- =========================================================

create or replace function public.create_allocation_draft_from_optimal_job(
  p_job_id uuid,
  p_allocation_name text
)
returns public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.allocation_optimization_jobs%rowtype;
  v_result jsonb;
  v_snapshot jsonb;
  v_config jsonb;
  v_buses jsonb;
  v_passengers jsonb;
  v_route_plan jsonb;
  v_workspace jsonb;
  v_created public.bus_allocations;
  v_now timestamptz := clock_timestamp();
  v_passenger_count integer;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can create allocation drafts.';
  end if;
  if nullif(btrim(p_allocation_name), '') is null then
    raise exception 'Allocation name is required.';
  end if;

  select *
  into v_job
  from public.allocation_optimization_jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'Allocation optimization job not found.';
  end if;
  if v_job.status <> 'OPTIMAL' or jsonb_typeof(v_job.result) <> 'object' then
    raise exception 'Only OPTIMAL allocation optimization jobs can create drafts.';
  end if;
  if exists (
    select 1
    from public.bus_allocations allocation
    where allocation.allocation_data ->> 'sourceOptimizationJobId' = p_job_id::text
      and allocation.allocation_data ->> 'status' in ('draft', 'confirmed')
  ) then
    raise exception 'An allocation draft already exists for this optimization job.';
  end if;

  v_result := v_job.result;
  v_snapshot := v_job.input_snapshot;
  v_config := v_snapshot -> 'bus';
  v_passenger_count := jsonb_array_length(v_snapshot -> 'passengers');

  if v_config is distinct from public.get_allocation_optimizer_config() then
    raise exception 'Allocation optimizer configuration changed after calculation.';
  end if;
  if jsonb_typeof(v_result -> 'buses') <> 'array'
    or jsonb_typeof(v_result -> 'assignments') <> 'array'
    or v_result ->> 'status' <> 'OPTIMAL'
    or coalesce(v_result ->> 'total_buses', '') !~ '^[1-9][0-9]*$'
    or coalesce(v_result ->> 'total_cost', '') !~ '^[0-9]+$'
    or coalesce(v_result ->> 'second_choice_count', '') !~ '^[0-9]+$'
    or jsonb_array_length(v_result -> 'buses') <> (v_result ->> 'total_buses')::integer
    or jsonb_array_length(v_result -> 'assignments') <> v_passenger_count then
    raise exception 'Optimal allocation result structure is invalid.';
  end if;
  if (v_result ->> 'total_cost')::integer
    <> (v_result ->> 'total_buses')::integer * (v_config ->> 'price')::integer then
    raise exception 'Optimal allocation result cost is invalid.';
  end if;
  if v_job.proven_bus_count is distinct from (v_result ->> 'total_buses')::integer
    or (
      select count(distinct bus ->> 'bus_id')
      from jsonb_array_elements(v_result -> 'buses') bus
    ) <> jsonb_array_length(v_result -> 'buses')
    or (
      select count(*)
      from jsonb_array_elements(v_result -> 'assignments') assignment
      where assignment ->> 'preference_rank' = '2'
    ) <> (v_result ->> 'second_choice_count')::integer then
    raise exception 'Optimal allocation proof metadata is invalid.';
  end if;

  if (
    select count(*)
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
  ) <> v_passenger_count
    or exists (
      select 1
      from public.reservations reservation
      where reservation.status is distinct from 'cancelled'
        and not exists (
          select 1
          from jsonb_array_elements(v_snapshot -> 'passengers') passenger
          where passenger ->> 'reservation_id' = reservation.id::text
            and passenger ->> 'campus' = coalesce(
              nullif(reservation.data ->> 'campus', ''),
              reservation.campus,
              '-'
            )
            and passenger ->> 'team' = coalesce(
              nullif(reservation.data ->> 'team', ''),
              reservation.team,
              '-'
            )
            and passenger ->> 'first_choice' = (
              case
                when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
                  then reservation.data -> 'stationPreferences'
                else coalesce(reservation.station_preferences, '[]'::jsonb)
              end
            ) #>> '{0,station,name}'
            and passenger ->> 'second_choice' = (
              case
                when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
                  then reservation.data -> 'stationPreferences'
                else coalesce(reservation.station_preferences, '[]'::jsonb)
              end
            ) #>> '{1,station,name}'
        )
    ) then
    raise exception 'Active reservations changed after optimization.';
  end if;

  if (
    select count(distinct assignment ->> 'reservation_id')
    from jsonb_array_elements(v_result -> 'assignments') assignment
  ) <> v_passenger_count
    or exists (
      select 1
      from jsonb_array_elements(v_result -> 'assignments') assignment
      left join jsonb_array_elements(v_snapshot -> 'passengers') passenger
        on passenger ->> 'reservation_id' = assignment ->> 'reservation_id'
      left join jsonb_array_elements(v_result -> 'buses') bus
        on bus ->> 'bus_id' = assignment ->> 'bus_id'
      where passenger is null
        or bus is null
        or assignment ->> 'destination' <> bus ->> 'destination'
        or assignment ->> 'destination' not in (
          passenger ->> 'first_choice',
          passenger ->> 'second_choice'
        )
        or coalesce(assignment ->> 'seat_number', '') !~ '^[1-9][0-9]*$'
        or coalesce(bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
        or (assignment ->> 'seat_number')::integer > (bus ->> 'capacity')::integer
        or case
          when assignment ->> 'destination' = passenger ->> 'first_choice'
            then assignment ->> 'preference_rank' <> '1'
          else assignment ->> 'preference_rank' <> '2'
        end
    ) then
    raise exception 'Optimal allocation assignments are invalid.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_result -> 'assignments') assignment
    group by assignment ->> 'bus_id', assignment ->> 'seat_number'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(v_result -> 'buses') bus
    left join lateral (
      select count(*) as passenger_count
      from jsonb_array_elements(v_result -> 'assignments') assignment
      where assignment ->> 'bus_id' = bus ->> 'bus_id'
    ) assigned on true
    where nullif(bus ->> 'bus_id', '') is null
      or nullif(bus ->> 'label', '') is null
      or nullif(bus ->> 'destination', '') is null
      or coalesce(bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
      or coalesce(bus ->> 'price', '') !~ '^[0-9]+$'
      or (bus ->> 'capacity')::integer <> (v_config ->> 'capacity')::integer
      or (bus ->> 'price')::integer <> (v_config ->> 'price')::integer
      or assigned.passenger_count = 0
      or assigned.passenger_count > (bus ->> 'capacity')::integer
  ) then
    raise exception 'Optimal allocation buses or seats are invalid.';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', bus ->> 'bus_id',
      'label', bus ->> 'label',
      'capacity', (bus ->> 'capacity')::integer,
      'price', (bus ->> 'price')::integer,
      'destination', bus ->> 'destination',
      'departureTime', '',
      'boardingPlace', '',
      'minimumPassengers', (v_config ->> 'recommended_minimum_passengers')::integer
    )
    order by bus ->> 'bus_id'
  )
  into v_buses
  from jsonb_array_elements(v_result -> 'buses') bus;

  select jsonb_agg(
    jsonb_build_object(
      'reservationId', reservation.id::text,
      'name', coalesce(nullif(reservation.data ->> 'name', ''), reservation.name, '-'),
      'phone', coalesce(nullif(reservation.data ->> 'phone', ''), reservation.phone, '-'),
      'campus', passenger ->> 'campus',
      'team', passenger ->> 'team',
      'preferences', jsonb_build_array(
        passenger ->> 'first_choice',
        passenger ->> 'second_choice'
      ),
      'busId', assignment ->> 'bus_id',
      'seatNumber', (assignment ->> 'seat_number')::integer
    )
    order by reservation.created_at, reservation.id
  )
  into v_passengers
  from jsonb_array_elements(v_result -> 'assignments') assignment
  join jsonb_array_elements(v_snapshot -> 'passengers') passenger
    on passenger ->> 'reservation_id' = assignment ->> 'reservation_id'
  join public.reservations reservation
    on reservation.id::text = assignment ->> 'reservation_id'
  where reservation.status is distinct from 'cancelled';

  select jsonb_agg(
    jsonb_build_object(
      'busLabel', bus ->> 'label',
      'capacity', (bus ->> 'capacity')::integer,
      'price', (bus ->> 'price')::integer,
      'passengerCount', assigned.passenger_count,
      'emptySeats', (bus ->> 'capacity')::integer - assigned.passenger_count,
      'destinations', jsonb_build_array(
        jsonb_build_object(
          'name', bus ->> 'destination',
          'passengerCount', assigned.passenger_count,
          'rank2Demand', assigned.second_choice_count
        )
      )
    )
    order by bus ->> 'bus_id'
  )
  into v_route_plan
  from jsonb_array_elements(v_result -> 'buses') bus
  cross join lateral (
    select
      count(*)::integer as passenger_count,
      count(*) filter (where assignment ->> 'preference_rank' = '2')::integer
        as second_choice_count
    from jsonb_array_elements(v_result -> 'assignments') assignment
    where assignment ->> 'bus_id' = bus ->> 'bus_id'
  ) assigned;

  v_workspace := jsonb_build_object(
    'schemaVersion', 2,
    'status', 'draft',
    'sourceOptimizationJobId', p_job_id::text,
    'optimalBaseline', jsonb_build_object(
      'totalBuses', (v_result ->> 'total_buses')::integer,
      'totalCost', (v_result ->> 'total_cost')::integer,
      'secondChoiceCount', (v_result ->> 'second_choice_count')::integer,
      'inputHash', v_job.input_hash
    ),
    'sourceAllocation', jsonb_build_object(
      'combination', jsonb_build_array(
        jsonb_build_object(
          'count', (v_result ->> 'total_buses')::integer,
          'capacity', (v_config ->> 'capacity')::integer,
          'price', (v_config ->> 'price')::integer
        )
      ),
      'totalCost', (v_result ->> 'total_cost')::integer,
      'totalCapacity',
        (v_result ->> 'total_buses')::integer * (v_config ->> 'capacity')::integer,
      'totalBuses', (v_result ->> 'total_buses')::integer,
      'efficiency',
        (100.0 * v_passenger_count)
          / ((v_result ->> 'total_buses')::integer * (v_config ->> 'capacity')::integer),
      'emptySeats',
        (v_result ->> 'total_buses')::integer * (v_config ->> 'capacity')::integer
          - v_passenger_count,
      'costPerPerson',
        case when v_passenger_count > 0
          then (v_result ->> 'total_cost')::numeric / v_passenger_count
          else 0
        end,
      'qualityScore', 0,
      'routePlan', v_route_plan
    ),
    'buses', v_buses,
    'passengers', v_passengers,
    'optimization', jsonb_build_object(
      'mode', '정확 최저비용',
      'firstChoiceWeight', 0,
      'costWeight', 1
    ),
    'allowMinimumPassengerOverride', false,
    'history', jsonb_build_array(
      jsonb_build_object(
        'id', 'history-' || replace(gen_random_uuid()::text, '-', ''),
        'at', v_now,
        'actorId', auth.uid()::text,
        'action', 'exact_draft_created',
        'detail', '최적해 증명이 완료된 정확 최저비용 배차안으로 임시 배차안을 생성했습니다.'
      )
    )
  );

  v_created := public.create_bus_allocation_as_global_admin(
    btrim(p_allocation_name),
    v_workspace
  );

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    p_job_id,
    'DRAFT_CREATED',
    jsonb_build_object(
      'allocation_id', v_created.id::text,
      'created_by', auth.uid()::text
    )
  );

  return v_created;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Optimal allocation result contains invalid numbers.';
end;
$$;

revoke all on function public.create_allocation_draft_from_optimal_job(uuid, text)
  from public, anon;
grant execute on function public.create_allocation_draft_from_optimal_job(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- 78_out_of_preference_admin_override.sql
-- =========================================================

-- =========================================================
-- Allow explicitly acknowledged out-of-preference admin edits
-- =========================================================

create or replace function public.prepare_allocation_preference_override(
  p_allocation_data jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_set(
    p_allocation_data,
    '{passengers}',
    coalesce(
      (
        select jsonb_agg(
          case
            when bus is not null
              and not (
                coalesce(passenger.value -> 'preferences', '[]'::jsonb)
                  ? (bus ->> 'destination')
              )
              then jsonb_set(
                passenger.value,
                '{preferences}',
                coalesce(passenger.value -> 'preferences', '[]'::jsonb)
                  || to_jsonb(bus ->> 'destination'),
                true
              )
            else passenger.value
          end
          order by passenger.ordinality
        )
        from jsonb_array_elements(p_allocation_data -> 'passengers')
          with ordinality passenger(value, ordinality)
        left join jsonb_array_elements(p_allocation_data -> 'buses') bus
          on bus ->> 'id' = passenger.value ->> 'busId'
      ),
      '[]'::jsonb
    ),
    true
  );
$$;

revoke all on function public.prepare_allocation_preference_override(jsonb)
  from public, anon, authenticated;

create or replace function public.validate_allocation_workspace_confirmation_v2(
  p_allocation_id uuid,
  p_allocation_data jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_out_of_preference boolean;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can validate allocations.';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_allocation_data -> 'passengers', '[]'::jsonb))
      passenger
    left join jsonb_array_elements(coalesce(p_allocation_data -> 'buses', '[]'::jsonb))
      bus on bus ->> 'id' = passenger ->> 'busId'
    where bus is not null
      and not (
        coalesce(passenger -> 'preferences', '[]'::jsonb)
          ? (bus ->> 'destination')
      )
  )
  into v_has_out_of_preference;

  if v_has_out_of_preference
    and coalesce((p_allocation_data ->> 'allowOutOfPreferenceOverride')::boolean, false)
      is not true then
    return public.validate_allocation_workspace_confirmation(
      p_allocation_id,
      p_allocation_data
    );
  end if;

  return public.validate_allocation_workspace_confirmation(
    p_allocation_id,
    public.prepare_allocation_preference_override(p_allocation_data)
  );
exception
  when invalid_text_representation then
    return public.validate_allocation_workspace_confirmation(
      p_allocation_id,
      p_allocation_data
    );
end;
$$;

create or replace function public.save_confirmed_allocation_workspace_v3(
  p_allocation_id uuid,
  p_expected_revision bigint,
  p_allocation_data jsonb,
  p_total_cost integer,
  p_total_capacity integer,
  p_version_id text,
  p_version_label text,
  p_version_changes jsonb
)
returns setof public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved public.bus_allocations%rowtype;
  v_final_data jsonb;
  v_sanitized_data jsonb;
  v_out_of_preference_ids jsonb := '[]'::jsonb;
  v_has_out_of_preference boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can confirm allocations.';
  end if;

  select
    coalesce(jsonb_agg(to_jsonb(passenger ->> 'reservationId')), '[]'::jsonb),
    count(*) > 0
  into v_out_of_preference_ids, v_has_out_of_preference
  from jsonb_array_elements(coalesce(p_allocation_data -> 'passengers', '[]'::jsonb))
    passenger
  left join jsonb_array_elements(coalesce(p_allocation_data -> 'buses', '[]'::jsonb))
    bus on bus ->> 'id' = passenger ->> 'busId'
  where bus is not null
    and not (
      coalesce(passenger -> 'preferences', '[]'::jsonb)
        ? (bus ->> 'destination')
    );

  if v_has_out_of_preference
    and coalesce((p_allocation_data ->> 'allowOutOfPreferenceOverride')::boolean, false)
      is not true then
    raise exception 'Out-of-preference assignments require explicit global-admin acknowledgement.';
  end if;

  v_final_data := p_allocation_data - 'versions';
  if v_has_out_of_preference then
    v_final_data := jsonb_set(
      v_final_data,
      '{outOfPreferenceAcknowledgement}',
      jsonb_build_object(
        'actorId', auth.uid()::text,
        'at', v_now,
        'passengerIds', v_out_of_preference_ids
      ),
      true
    );
    v_final_data := jsonb_set(
      v_final_data,
      '{history}',
      coalesce(v_final_data -> 'history', '[]'::jsonb)
        || jsonb_build_array(
          jsonb_build_object(
            'id', 'history-' || replace(gen_random_uuid()::text, '-', ''),
            'at', v_now,
            'actorId', auth.uid()::text,
            'action', 'out_of_preference_acknowledged',
            'detail',
              jsonb_array_length(v_out_of_preference_ids)::text
                || '명의 1·2지망 외 배정을 확인하고 승인했습니다.'
          )
        ),
      true
    );
  else
    v_final_data := v_final_data - 'outOfPreferenceAcknowledgement';
  end if;

  v_sanitized_data := public.prepare_allocation_preference_override(v_final_data);

  select *
  into v_saved
  from public.save_confirmed_allocation_workspace_v2(
    p_allocation_id,
    p_expected_revision,
    v_sanitized_data,
    p_total_cost,
    p_total_capacity,
    p_version_id,
    p_version_label,
    p_version_changes
  );

  v_final_data := jsonb_set(
    v_final_data,
    '{editLock}',
    coalesce(v_saved.allocation_data -> 'editLock', '{}'::jsonb),
    true
  );

  update public.bus_allocations
  set allocation_data = v_final_data
  where id = p_allocation_id
  returning * into v_saved;

  update public.allocation_workspace_versions
  set snapshot = jsonb_build_object(
    'buses', coalesce(v_final_data -> 'buses', '[]'::jsonb),
    'passengers', coalesce(v_final_data -> 'passengers', '[]'::jsonb)
  )
  where id = p_version_id
    and allocation_id = p_allocation_id;

  return next v_saved;
exception
  when invalid_text_representation then
    raise exception 'Out-of-preference acknowledgement value is invalid.';
end;
$$;

revoke all on function public.validate_allocation_workspace_confirmation_v2(uuid, jsonb)
  from public, anon;
revoke all on function public.save_confirmed_allocation_workspace_v3(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from public, anon;

grant execute on function public.validate_allocation_workspace_confirmation_v2(uuid, jsonb)
  to authenticated;
grant execute on function public.save_confirmed_allocation_workspace_v3(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- BEGIN sql/setup/80_notice_audience_and_lifecycle.sql
-- =========================================================

-- Targeted campus notices and announcement lifecycle controls.

alter table public.campus_requests
  add column if not exists is_archived boolean not null default false;

create table if not exists public.campus_notice_targets (
  notice_id uuid not null references public.campus_requests(id) on delete cascade,
  district text not null,
  team text not null,
  campus text not null,
  created_at timestamptz not null default now(),
  primary key (notice_id, district, team, campus)
);

create index if not exists idx_campus_notice_targets_scope
  on public.campus_notice_targets(district, team, campus);

alter table public.campus_notice_targets enable row level security;

insert into public.campus_notice_targets (notice_id, district, team, campus)
select notice.id, option.district, option.team, option.campus
from public.campus_requests notice
cross join public.campus_options option
where notice.is_global_notice = true
on conflict do nothing;

drop policy if exists "Admins can view campus notice targets" on public.campus_notice_targets;
create policy "Admins can view campus notice targets"
on public.campus_notice_targets
for select
to authenticated
using (
  public.is_global_admin()
  or exists (
    select 1
    from public.admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'campus_admin'
      and admin_roles.district = campus_notice_targets.district
      and admin_roles.team = campus_notice_targets.team
      and admin_roles.campus = campus_notice_targets.campus
  )
);

drop policy if exists "Admins can view campus requests" on public.campus_requests;
create policy "Admins can view campus requests"
on public.campus_requests
for select
to authenticated
using (
  public.is_global_admin()
  or (
    campus_requests.is_global_notice = true
    and campus_requests.is_archived = false
    and exists (
      select 1
      from public.admin_roles
      where admin_roles.user_id = auth.uid()
        and admin_roles.role = 'campus_admin'
        and exists (
          select 1
          from public.campus_notice_targets
          where campus_notice_targets.notice_id = campus_requests.id
            and campus_notice_targets.district = admin_roles.district
            and campus_notice_targets.team = admin_roles.team
            and campus_notice_targets.campus = admin_roles.campus
        )
    )
  )
  or (
    campus_requests.is_global_notice = false
    and exists (
      select 1
      from public.admin_roles
      where admin_roles.user_id = auth.uid()
        and admin_roles.role = 'campus_admin'
        and admin_roles.district = campus_requests.district
        and admin_roles.team = campus_requests.team
        and admin_roles.campus = campus_requests.campus
    )
  )
);

create or replace function public.get_global_campus_notices()
returns setof public.campus_requests
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role in ('global_admin', 'campus_admin')
  ) then
    raise exception 'Only admins can view campus notices.';
  end if;

  return query
  select notice.*
  from public.campus_requests notice
  where notice.is_global_notice = true
    and (
      public.is_global_admin()
      or (
        notice.is_archived = false
        and exists (
          select 1
          from public.campus_notice_targets target
          join public.admin_roles role
            on role.user_id = auth.uid()
           and role.role = 'campus_admin'
           and role.district = target.district
           and role.team = target.team
           and role.campus = target.campus
          where target.notice_id = notice.id
        )
      )
    )
  order by notice.created_at desc;
end;
$$;

create or replace function public.create_targeted_campus_notice(
  p_title text,
  p_content text,
  p_targets jsonb
)
returns public.campus_requests
language plpgsql security definer set search_path = public
as $$
declare
  v_notice public.campus_requests;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create campus notices.';
  end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_content), '') is null then
    raise exception 'Notice title and content are required.';
  end if;
  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 then
    raise exception 'At least one campus target is required.';
  end if;

  insert into public.campus_requests (
    type, status, title, content, is_global_notice,
    district, team, campus, created_by
  )
  values ('notice', 'open', trim(p_title), trim(p_content), true, '대상 지정', '대상 지정', '대상 지정', auth.uid())
  returning * into v_notice;

  insert into public.campus_notice_targets (notice_id, district, team, campus)
  select distinct
    v_notice.id,
    trim(target ->> 'district'),
    trim(target ->> 'team'),
    trim(target ->> 'campus')
  from jsonb_array_elements(p_targets) target
  where nullif(trim(target ->> 'district'), '') is not null
    and nullif(trim(target ->> 'team'), '') is not null
    and nullif(trim(target ->> 'campus'), '') is not null;

  if not exists (
    select 1 from public.campus_notice_targets where notice_id = v_notice.id
  ) then
    raise exception 'No valid campus targets were provided.';
  end if;

  return v_notice;
end;
$$;

create or replace function public.update_targeted_campus_notice(
  p_notice_id uuid,
  p_title text,
  p_content text,
  p_targets jsonb,
  p_archived boolean default false
)
returns public.campus_requests
language plpgsql security definer set search_path = public
as $$
declare
  v_notice public.campus_requests;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can update campus notices.';
  end if;

  update public.campus_requests
  set title = trim(p_title),
      content = trim(p_content),
      is_archived = p_archived,
      updated_at = now()
  where id = p_notice_id and is_global_notice = true
  returning * into v_notice;

  if v_notice.id is null then raise exception 'Campus notice not found.'; end if;

  delete from public.campus_notice_targets where notice_id = p_notice_id;
  insert into public.campus_notice_targets (notice_id, district, team, campus)
  select distinct p_notice_id, trim(target ->> 'district'), trim(target ->> 'team'), trim(target ->> 'campus')
  from jsonb_array_elements(p_targets) target
  where nullif(trim(target ->> 'district'), '') is not null
    and nullif(trim(target ->> 'team'), '') is not null
    and nullif(trim(target ->> 'campus'), '') is not null;

  delete from public.campus_notice_reads where notice_id = p_notice_id;
  return v_notice;
end;
$$;

revoke all on function public.create_targeted_campus_notice(text, text, jsonb) from public, anon;
revoke all on function public.update_targeted_campus_notice(uuid, text, text, jsonb, boolean) from public, anon;
grant execute on function public.create_targeted_campus_notice(text, text, jsonb) to authenticated;
grant execute on function public.update_targeted_campus_notice(uuid, text, text, jsonb, boolean) to authenticated;

alter table public.home_announcements
  add column if not exists is_archived boolean not null default false,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists publish_start_at timestamptz,
  add column if not exists publish_end_at timestamptz;

drop policy if exists "Anyone can view published home announcements" on public.home_announcements;
create policy "Anyone can view published home announcements"
on public.home_announcements
for select
to anon, authenticated
using (
  is_published = true
  and is_archived = false
  and (publish_start_at is null or publish_start_at <= now())
  and (publish_end_at is null or publish_end_at > now())
);

create or replace function public.update_home_announcement_as_global_admin(
  p_id uuid,
  p_title text,
  p_content text,
  p_is_published boolean,
  p_is_archived boolean,
  p_is_pinned boolean,
  p_publish_start_at timestamptz,
  p_publish_end_at timestamptz
)
returns public.home_announcements
language plpgsql security definer set search_path = public
as $$
declare v_row public.home_announcements;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update home announcements.'; end if;
  update public.home_announcements
  set title = trim(p_title),
      content = trim(p_content),
      is_published = p_is_published,
      is_archived = p_is_archived,
      is_pinned = p_is_pinned,
      publish_start_at = p_publish_start_at,
      publish_end_at = p_publish_end_at,
      updated_at = now()
  where id = p_id
  returning * into v_row;
  if v_row.id is null then raise exception 'Home announcement not found.'; end if;
  return v_row;
end;
$$;

revoke all on function public.update_home_announcement_as_global_admin(uuid, text, text, boolean, boolean, boolean, timestamptz, timestamptz) from public, anon;
grant execute on function public.update_home_announcement_as_global_admin(uuid, text, text, boolean, boolean, boolean, timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/80_notice_audience_and_lifecycle.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/91_atomic_campus_request_workflow.sql
-- =========================================================

-- =========================================================
-- Atomic campus request creation and global-admin responses
-- =========================================================

create or replace function public.create_campus_request_with_message(
  p_type text,
  p_title text,
  p_content text,
  p_district text,
  p_team text,
  p_campus text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role public.admin_roles%rowtype;
  v_request public.campus_requests%rowtype;
  v_message public.campus_request_messages%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.';
  end if;
  if p_type not in (
    'late_signup',
    'cancel_refund',
    'payment_issue',
    'roster_change',
    'transfer_issue',
    'etc'
  ) then
    raise exception 'Campus request type is invalid.';
  end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_content), '') is null then
    raise exception 'Campus request title and content are required.';
  end if;

  select admin_role.*
  into v_role
  from public.admin_roles admin_role
  where admin_role.user_id = v_actor_id
    and admin_role.role = 'campus_admin'
    and admin_role.district = p_district
    and admin_role.team = p_team
    and admin_role.campus = p_campus
  limit 1;

  if v_role.id is null then
    raise exception 'Only the matching campus administrator can create this request.';
  end if;

  insert into public.campus_requests (
    type,
    status,
    title,
    content,
    is_global_notice,
    district_id,
    team_id,
    campus_id,
    district,
    team,
    campus,
    created_by
  )
  values (
    p_type,
    'open',
    btrim(p_title),
    btrim(p_content),
    false,
    v_role.district_id,
    v_role.team_id,
    v_role.campus_id,
    p_district,
    p_team,
    p_campus,
    v_actor_id
  )
  returning * into v_request;

  insert into public.campus_request_messages (
    request_id,
    sender_id,
    sender_role,
    message
  )
  values (
    v_request.id,
    v_actor_id,
    'campus_admin',
    btrim(p_content)
  )
  returning * into v_message;

  return jsonb_build_object(
    'request', to_jsonb(v_request),
    'message', to_jsonb(v_message)
  );
end;
$$;

create or replace function public.update_campus_request_status_with_response(
  p_request_id uuid,
  p_status text,
  p_admin_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_previous_response text;
  v_response text := nullif(btrim(coalesce(p_admin_response, '')), '');
  v_request public.campus_requests%rowtype;
  v_message public.campus_request_messages%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.';
  end if;
  if not public.is_global_admin() then
    raise exception 'Only global administrators can process campus requests.';
  end if;
  if p_status not in ('open', 'in_progress', 'resolved', 'on_hold') then
    raise exception 'Campus request status is invalid.';
  end if;

  select request.admin_response
  into v_previous_response
  from public.campus_requests request
  where request.id = p_request_id
    and request.is_global_notice = false
  for update;

  if not found then
    raise exception 'Campus request not found.';
  end if;
  if p_status = 'resolved'
    and v_response is null
    and not exists (
      select 1
      from public.campus_request_messages message
      where message.request_id = p_request_id
        and message.sender_role = 'global_admin'
    )
  then
    raise exception 'A global administrator response is required before resolving a request.';
  end if;

  update public.campus_requests
  set
    status = p_status,
    admin_response = v_response,
    handled_by = v_actor_id,
    handled_at = case when p_status = 'resolved' then clock_timestamp() else null end,
    updated_at = clock_timestamp()
  where id = p_request_id
  returning * into v_request;

  if v_request.status is distinct from p_status then
    raise exception 'Campus request status update failed.';
  end if;

  if v_response is not null
    and v_response is distinct from nullif(btrim(coalesce(v_previous_response, '')), '')
  then
    insert into public.campus_request_messages (
      request_id,
      sender_id,
      sender_role,
      message
    )
    values (
      p_request_id,
      v_actor_id,
      'global_admin',
      v_response
    )
    returning * into v_message;
  end if;

  return jsonb_build_object(
    'request', to_jsonb(v_request),
    'message', case when v_message.id is null then null else to_jsonb(v_message) end
  );
end;
$$;

revoke all on function public.create_campus_request_with_message(
  text, text, text, text, text, text
) from public, anon;
revoke all on function public.update_campus_request_status_with_response(
  uuid, text, text
) from public, anon;

grant execute on function public.create_campus_request_with_message(
  text, text, text, text, text, text
) to authenticated;
grant execute on function public.update_campus_request_status_with_response(
  uuid, text, text
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/91_atomic_campus_request_workflow.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/92_campus_request_read_and_audit.sql
-- =========================================================

-- =========================================================
-- Campus request read state, audit history, and realtime support
-- =========================================================

create table if not exists public.campus_request_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null references public.campus_requests(id) on delete cascade,
  read_at timestamptz not null default clock_timestamp(),
  primary key (user_id, request_id)
);

create index if not exists idx_campus_request_reads_request
  on public.campus_request_reads(request_id);

alter table public.campus_request_reads enable row level security;

drop policy if exists "Admins can view own campus request reads" on public.campus_request_reads;
drop policy if exists "Admins can create own campus request reads" on public.campus_request_reads;
drop policy if exists "Admins can update own campus request reads" on public.campus_request_reads;

create policy "Admins can view own campus request reads"
on public.campus_request_reads for select to authenticated
using (user_id = auth.uid());

create policy "Admins can create own campus request reads"
on public.campus_request_reads for insert to authenticated
with check (user_id = auth.uid());

create policy "Admins can update own campus request reads"
on public.campus_request_reads for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.campus_request_audit_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.campus_requests(id) on delete cascade,
  message_id uuid,
  actor_id uuid,
  action text not null check (
    action in ('status_changed', 'response_changed', 'message_updated', 'message_deleted')
  ),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_campus_request_audit_logs_request_created
  on public.campus_request_audit_logs(request_id, created_at desc);

alter table public.campus_request_audit_logs enable row level security;

drop policy if exists "Global admins can view campus request audit logs" on public.campus_request_audit_logs;
create policy "Global admins can view campus request audit logs"
on public.campus_request_audit_logs for select to authenticated
using (public.is_global_admin());

grant select on public.campus_request_audit_logs to authenticated;

create or replace function public.audit_campus_request_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.campus_request_audit_logs (
      request_id, actor_id, action, before_data, after_data
    )
    values (
      old.id, auth.uid(), 'status_changed',
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status)
    );
  end if;

  if new.admin_response is distinct from old.admin_response then
    insert into public.campus_request_audit_logs (
      request_id, actor_id, action, before_data, after_data
    )
    values (
      old.id, auth.uid(), 'response_changed',
      jsonb_build_object('admin_response', old.admin_response),
      jsonb_build_object('admin_response', new.admin_response)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_campus_request_change on public.campus_requests;
create trigger audit_campus_request_change
after update on public.campus_requests
for each row execute function public.audit_campus_request_change();

create or replace function public.audit_campus_request_message_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.message is distinct from old.message then
    insert into public.campus_request_audit_logs (
      request_id, message_id, actor_id, action, before_data, after_data
    )
    values (
      old.request_id, old.id, auth.uid(), 'message_updated',
      jsonb_build_object('message', old.message),
      jsonb_build_object('message', new.message)
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.campus_request_audit_logs (
      request_id, message_id, actor_id, action, before_data
    )
    values (
      old.request_id, old.id, auth.uid(), 'message_deleted',
      jsonb_build_object(
        'sender_id', old.sender_id,
        'sender_role', old.sender_role,
        'message', old.message,
        'created_at', old.created_at
      )
    );
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists audit_campus_request_message_change
  on public.campus_request_messages;
create trigger audit_campus_request_message_change
after update or delete on public.campus_request_messages
for each row execute function public.audit_campus_request_message_change();

create or replace function public.mark_campus_request_read(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if not exists (
    select 1
    from public.campus_requests request
    join public.admin_roles role on role.user_id = auth.uid()
    where request.id = p_request_id
      and (
        role.role = 'global_admin'
        or (
          role.role = 'campus_admin'
          and role.district = request.district
          and role.team = request.team
          and role.campus = request.campus
        )
      )
  ) then
    raise exception 'Campus request not found or inaccessible.';
  end if;

  insert into public.campus_request_reads (user_id, request_id, read_at)
  values (auth.uid(), p_request_id, clock_timestamp())
  on conflict (user_id, request_id)
  do update set read_at = excluded.read_at;
end;
$$;

create or replace function public.get_unread_campus_request_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct request.id
  from public.campus_requests request
  join public.admin_roles role on role.user_id = auth.uid()
  left join public.campus_request_reads read_state
    on read_state.user_id = auth.uid()
   and read_state.request_id = request.id
  where request.is_global_notice = false
    and (
      role.role = 'global_admin'
      or (
        role.role = 'campus_admin'
        and role.district = request.district
        and role.team = request.team
        and role.campus = request.campus
      )
    )
    and exists (
      select 1
      from public.campus_request_messages message
      where message.request_id = request.id
        and message.created_at > coalesce(read_state.read_at, '-infinity'::timestamptz)
        and (
          (role.role = 'global_admin' and message.sender_role = 'campus_admin')
          or (role.role = 'campus_admin' and message.sender_role = 'global_admin')
        )
    );
$$;

revoke all on function public.mark_campus_request_read(uuid) from public, anon;
revoke all on function public.get_unread_campus_request_ids() from public, anon;
revoke all on function public.audit_campus_request_change() from public, anon, authenticated;
revoke all on function public.audit_campus_request_message_change() from public, anon, authenticated;
grant execute on function public.mark_campus_request_read(uuid) to authenticated;
grant execute on function public.get_unread_campus_request_ids() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'campus_requests'
  ) then
    alter publication supabase_realtime add table public.campus_requests;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'campus_request_messages'
  ) then
    alter publication supabase_realtime add table public.campus_request_messages;
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/92_campus_request_read_and_audit.sql
-- =========================================================
