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
  created_at timestamptz not null default now()
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

-- 일반 사용자: 자기 예약 생성
create policy "Users can insert own reservations"
on reservations
for insert
to authenticated
with check (
  auth.uid() = user_id
);

-- 일반 사용자: 자기 예약 조회
create policy "Users can view own reservations"
on reservations
for select
to authenticated
using (
  auth.uid() = user_id
);

-- 일반 사용자: 자기 예약 수정
-- 확정 전까지만 수정 가능하게 제한
create policy "Users can update own reservations"
on reservations
for update
to authenticated
using (
  auth.uid() = user_id
  and status = 'requested'
)
with check (
  auth.uid() = user_id
  and status = 'requested'
);

-- 일반 사용자: 자기 예약 삭제
-- 확정 전까지만 삭제 가능
create policy "Users can delete own reservations"
on reservations
for delete
to authenticated
using (
  auth.uid() = user_id
  and status = 'requested'
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
create policy "Global admins can update reservations"
on reservations
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

-- 일반 사용자: 자기 payment 생성
create policy "Users can insert own payments"
on payments
for insert
to authenticated
with check (
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
create policy "Campus admins can update campus payments"
on payments
for update
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
)
with check (
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
create policy "Global admins can update all payments"
on payments
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
create policy "Global admins can manage admin roles"
on admin_roles
for all
to authenticated
using (public.is_global_admin())
with check (public.is_global_admin());


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
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
);

-- 전체 관리자: 배분안 관리
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

create policy "Campus admins can update campus payments"
on payments
for update
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
)
with check (
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

create or replace function upsert_reservation_payment(
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
begin
  if p_status not in ('pending', 'completed', 'refunded') then
    raise exception 'Invalid payment status: %', p_status;
  end if;

  if p_payment_id is not null then
    update payments
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
    returning * into v_payment;

    if v_payment.id is not null then
      return v_payment;
    end if;
  end if;

  insert into payments (
    user_id,
    reservation_id,
    amount,
    status,
    verified_by,
    verified_at,
    updated_at
  )
  values (
    p_user_id,
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
) from public;

grant execute on function public.save_user_reservation(
  text, text, text, text, text, jsonb, jsonb
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- Atomic allocation confirmation and cancellation
-- =========================================================

create index if not exists idx_bus_allocations_status
  on public.bus_allocations ((allocation_data ->> 'status'));

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

create or replace function public.save_confirmed_allocation_workspace(
  p_allocation_id uuid,
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

  select allocation_data ->> 'status'
  into v_current_status
  from public.bus_allocations
  where id = p_allocation_id
  for update;
  if v_current_status is null or v_current_status not in ('draft', 'confirmed') then
    raise exception 'Only draft or confirmed allocations can be saved as confirmed.';
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
  set allocation_data = p_allocation_data,
      total_cost = p_total_cost,
      total_capacity = p_total_capacity
  where id = p_allocation_id;

  if v_current_status = 'draft' then
    update public.bus_allocations allocation
    set allocation_data =
      jsonb_set(
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
      )
    where allocation.id <> p_allocation_id
      and allocation.allocation_data ->> 'status' = 'confirmed';

    delete from public.bus_allocations allocation
    where allocation.id <> p_allocation_id
      and allocation.allocation_data ->> 'status' = 'draft';
  end if;

  return query select * from public.bus_allocations where id = p_allocation_id;
end;
$$;

create or replace function public.cancel_confirmed_allocation_workspace(
  p_allocation_id uuid,
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

  select allocation_data ->> 'status'
  into v_current_status
  from public.bus_allocations
  where id = p_allocation_id
  for update;
  if v_current_status is null or v_current_status <> 'confirmed' then
    raise exception 'Only confirmed allocations can be cancelled.';
  end if;

  update public.reservations reservation
  set status = 'requested',
      confirmed_ticket = null,
      data = (coalesce(reservation.data, '{}'::jsonb) - 'confirmedTicket')
        || jsonb_build_object('status', 'requested', 'updatedAt', v_now::text),
      updated_at = v_now
  where reservation.status is distinct from 'cancelled';

  update public.bus_allocations
  set allocation_data = p_allocation_data,
      total_cost = p_total_cost,
      total_capacity = p_total_capacity
  where id = p_allocation_id;
  return query select * from public.bus_allocations where id = p_allocation_id;
end;
$$;

revoke all on function public.save_confirmed_allocation_workspace(
  uuid, jsonb, integer, integer
) from public, anon;
grant execute on function public.save_confirmed_allocation_workspace(
  uuid, jsonb, integer, integer
) to authenticated;
revoke all on function public.cancel_confirmed_allocation_workspace(
  uuid, jsonb, integer, integer
) from public, anon;
grant execute on function public.cancel_confirmed_allocation_workspace(
  uuid, jsonb, integer, integer
) to authenticated;
revoke all on function public.get_draft_allocation_summaries() from public, anon;
grant execute on function public.get_draft_allocation_summaries() to authenticated;
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

create policy "Global admins can manage admin roles"
on public.admin_roles
for all
to authenticated
using (public.is_global_admin())
with check (public.is_global_admin());

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
