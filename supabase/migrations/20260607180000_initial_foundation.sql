-- ===== sql/setup/00_base_schema_and_rls.sql =====

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

-- 캠퍼스 회계 순장님: 자기 캠퍼스 예약 전체 조회
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

-- 캠퍼스 회계 순장님: 자기 캠퍼스 예약에 연결된 payment 조회
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

-- 캠퍼스 회계 순장님: 자기 캠퍼스 payment 입금 확인 가능
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



-- ===== sql/setup/01_profiles_organization_stations.sql =====

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



-- ===== sql/setup/02_auth_profile_trigger.sql =====

-- Run this patch on an existing Supabase project.
-- It creates profiles in the same transaction as new Auth users, so signup
-- does not depend on a browser session or profiles RLS.

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
      hint = 'Run this patch once in the Supabase Dashboard SQL Editor as the postgres role. Do not change the owner of auth.users.';
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

notify pgrst, 'reload schema';



-- ===== sql/setup/03_email_exists_rpc.sql =====

-- Run this patch in the Supabase SQL Editor for the project used by the app.
-- Current app project: pjbvxoesgwhbxfsfjliw

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

notify pgrst, 'reload schema';



-- ===== sql/setup/04_fix_admin_roles_rls_recursion.sql =====

-- Fix authenticated requests failing with:
-- infinite recursion detected in policy for relation "admin_roles"

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

notify pgrst, 'reload schema';



-- ===== sql/setup/22_destination_stats_rpc.sql =====

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



-- ===== sql/setup/40_campus_requests_board.sql =====

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



-- ===== sql/setup/41_campus_notice_reads.sql =====

-- =========================================================
-- Per-user campus notice read state
-- Run after 40_campus_requests_board.sql.
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



-- ===== sql/setup/50_home_announcements.sql =====

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

revoke insert, update, delete on table public.home_announcements from public, anon, authenticated;



-- ===== sql/setup/51_fix_bus_options_policies.sql =====

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
  add column if not exists max_count integer not null default 999;

alter table bus_options
  add column if not exists notes text;

alter table bus_options
  add column if not exists created_at timestamptz not null default now();

alter table bus_options
  drop constraint if exists bus_options_max_count_positive;

alter table bus_options
  add constraint bus_options_max_count_positive check (max_count > 0);

alter table bus_options enable row level security;

drop policy if exists "Authenticated users can view bus options" on bus_options;
drop policy if exists "Global admins can manage bus options" on bus_options;

create policy "Authenticated users can view bus options"
on bus_options
for select
to authenticated
using (true);

revoke insert, update, delete on table public.bus_options from public, anon, authenticated;

notify pgrst, 'reload schema';

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bus_options'
order by ordinal_position;



-- ===== sql/setup/54_fix_destination_stats_all_active_reservations.sql =====

-- Include every non-cancelled reservation in allocation demand.
-- Run this patch on existing databases where confirmed reservations are
-- missing from the allocation calculation.

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



