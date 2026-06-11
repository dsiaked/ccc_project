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
  ('global_scenario_checklist', '{"checked_step_ids": []}'::jsonb),
  ('simulation_enabled', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

alter table app_settings enable row level security;

drop policy if exists "Authenticated users can view app settings" on app_settings;
drop policy if exists "Global admins can manage app settings" on app_settings;

create policy "Authenticated users can view app settings"
on app_settings
for select
to authenticated
using (true);

revoke insert, update, delete on table public.app_settings from public, anon, authenticated;

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
revoke insert, update, delete on table public.campus_transfers from public, anon, authenticated;

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

revoke insert, update, delete on table public.home_announcements from public, anon, authenticated;

-- =========================================================
-- END sql/setup/50_home_announcements.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/55_atomic_allocation_confirmation.sql
-- =========================================================

-- =========================================================
-- Atomic allocation confirmation and cancellation
-- Run after 52_fix_bus_allocations_policies.sql.
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

  select *
  into v_current
  from public.bus_allocations
  where id = p_allocation_id
  for update;

  if not found then
    raise exception 'Allocation workspace not found.';
  end if;

  v_lock_actor := v_current.allocation_data #>> '{editLock,actorId}';
  v_lock_expires_at := nullif(
    v_current.allocation_data #>> '{editLock,expiresAt}',
    ''
  )::timestamptz;

  if v_lock_actor is distinct from v_actor_id::text
    and coalesce(v_lock_expires_at, '-infinity'::timestamptz) > v_now then
    return jsonb_build_object(
      'lock_acquired', false,
      'row', to_jsonb(v_current)
    );
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

  return jsonb_build_object(
    'lock_acquired', true,
    'row', to_jsonb(v_current)
  );
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

  select *
  into v_current
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
  v_lock_expires_at := nullif(
    v_current.allocation_data #>> '{editLock,expiresAt}',
    ''
  )::timestamptz;

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

  return query
  select *
  from public.bus_allocations
  where id = p_allocation_id;
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

  select *
  into v_current
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

  delete from public.bus_allocations
  where id = p_allocation_id;
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
    select passenger
    into v_passenger
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
        'message', coalesce(nullif(passenger ->> 'name', ''), '이름 없는 탑승자')
          || ': 배차 버스, 좌석번호 또는 목적지가 올바르지 않습니다.',
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
        max(coalesce(nullif(passenger ->> 'name', ''), '이름 없는 탑승자')) as passenger_name,
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
        'message', coalesce(nullif(passenger ->> 'name', ''), '이름 없는 탑승자')
          || ': 취소되었거나 최신 활성 예약에서 제외된 탑승자입니다.',
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

  perform pg_advisory_xact_lock(hashtextextended('allocation-confirmation', 0));

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
    select count(*)
    from public.reservations
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
  set
    status = 'confirmed',
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
  set
    allocation_data = jsonb_set(
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
          jsonb_set(
            allocation.allocation_data,
            '{status}',
            to_jsonb('archived'::text),
            true
          ),
          '{passengers}',
          coalesce(
            (
              select jsonb_agg(
                passenger.value || jsonb_build_object(
                  'reservationId', 'anonymous-' || passenger.ordinality,
                  'name', '탑승자 A-' || lpad(passenger.ordinality::text, 3, '0'),
                  'campus', '',
                  'team', ''
                )
                order by passenger.ordinality
              )
              from jsonb_array_elements(allocation.allocation_data -> 'passengers')
                with ordinality passenger(value, ordinality)
            ),
            '[]'::jsonb
          ),
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
            'detail', '새 배차 확정에 따라 탑승자 정보를 익명화하고 과거 기록으로 보관했습니다.'
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

  return query
  select *
  from public.bus_allocations
  where id = p_allocation_id;
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

  perform pg_advisory_xact_lock(hashtextextended('allocation-confirmation', 0));

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
  set
    status = 'requested',
    confirmed_ticket = null,
    data = (coalesce(reservation.data, '{}'::jsonb) - 'confirmedTicket')
      || jsonb_build_object(
        'status', 'requested',
        'updatedAt', v_now::text
      ),
    updated_at = v_now
  where reservation.status is distinct from 'cancelled';

  update public.bus_allocations
  set
    allocation_data = jsonb_set(
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

  return query
  select *
  from public.bus_allocations
  where id = p_allocation_id;
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
-- END sql/setup/55_atomic_allocation_confirmation.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/60_reset_reservation_data.sql
-- =========================================================

-- =========================================================
-- Reset operation and selected setup data
-- Run this in Supabase SQL Editor.
--
-- Always protects the currently signed-in global admin account and profile.
--
-- Organization reset also clears dependent operation data and campus_admin
-- roles before deleting districts / teams / campuses.
-- =========================================================

drop function if exists reset_reservation_data(
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
);
drop function if exists reset_reservation_data(
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
);
drop function if exists reset_reservation_data(
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
);
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
  v_deleted_reservations integer := 0;
  v_deleted_payments integer := 0;
  v_deleted_campus_transfers integer := 0;
  v_deleted_bus_allocations integer := 0;
  v_deleted_campus_requests integer := 0;
  v_deleted_campus_request_messages integer := 0;
  v_deleted_stations integer := 0;
  v_deleted_bus_options integer := 0;
  v_deleted_app_settings integer := 0;
  v_deleted_home_announcements integer := 0;
  v_deleted_campus_admin_roles integer := 0;
  v_deleted_districts integer := 0;
  v_deleted_teams integer := 0;
  v_deleted_campuses integer := 0;
  v_deleted_user_accounts integer := 0;
begin
  if not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
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
    get diagnostics v_deleted_campus_request_messages = row_count;

    delete from campus_requests where true;
    get diagnostics v_deleted_campus_requests = row_count;
  end if;

  if p_reset_campus_transfers then
    delete from campus_transfers where true;
    get diagnostics v_deleted_campus_transfers = row_count;
  end if;

  if p_reset_bus_allocations then
    delete from bus_allocations where true;
    get diagnostics v_deleted_bus_allocations = row_count;
  end if;

  if p_reset_payments or p_reset_reservations then
    delete from payments where true;
    get diagnostics v_deleted_payments = row_count;
  end if;

  if p_reset_reservations then
    delete from reservations where true;
    get diagnostics v_deleted_reservations = row_count;
  end if;

  if p_reset_home_announcements then
    delete from home_announcements where true;
    get diagnostics v_deleted_home_announcements = row_count;
  end if;

  if p_reset_stations then
    delete from stations where true;
    get diagnostics v_deleted_stations = row_count;
  end if;

  if p_reset_bus_options then
    delete from bus_options where true;
    get diagnostics v_deleted_bus_options = row_count;
  end if;

  if p_reset_app_settings then
    delete from app_settings where true;
    get diagnostics v_deleted_app_settings = row_count;

    insert into app_settings (key, value)
    values
      ('bus_ticket_price', '{"price": 0}'::jsonb),
      ('first_reservation_deadline', '{"deadline_at": null}'::jsonb),
      ('seoul_district_transfer_account', '{"account_number": ""}'::jsonb),
      ('participation_targets', '{"rows": [], "targets": {}}'::jsonb),
      ('global_scenario_checklist', '{"checked_step_ids": []}'::jsonb)
    on conflict (key) do update set
      value = excluded.value,
      updated_at = now();
  end if;

  if p_reset_campus_admin_roles then
    delete from admin_roles where role = 'campus_admin';
    get diagnostics v_deleted_campus_admin_roles = row_count;
  end if;

  if p_reset_organization then
    update admin_roles
    set
      district_id = null,
      team_id = null,
      campus_id = null,
      district = null,
      team = null,
      campus = null,
      updated_at = now()
    where role = 'global_admin';

    update profiles
    set
      district_id = null,
      team_id = null,
      campus_id = null,
      district = null,
      team = null,
      campus = null,
      updated_at = now()
    where
      district_id is not null
      or team_id is not null
      or campus_id is not null
      or district is not null
      or team is not null
      or campus is not null;

    select count(*) into v_deleted_districts from districts;
    select count(*) into v_deleted_teams from teams;
    select count(*) into v_deleted_campuses from campuses;

    delete from districts where true;
  end if;

  if p_reset_user_accounts then
    update admin_roles set granted_by = null where granted_by is not null;

    delete from auth.users where id <> auth.uid();
    get diagnostics v_deleted_user_accounts = row_count;
  end if;

  return jsonb_build_object(
    'reservations', v_deleted_reservations,
    'payments', v_deleted_payments,
    'campusTransfers', v_deleted_campus_transfers,
    'busAllocations', v_deleted_bus_allocations,
    'campusRequests', v_deleted_campus_requests,
    'campusRequestMessages', v_deleted_campus_request_messages,
    'stations', v_deleted_stations,
    'busOptions', v_deleted_bus_options,
    'appSettings', v_deleted_app_settings,
    'homeAnnouncements', v_deleted_home_announcements,
    'campusAdminRoles', v_deleted_campus_admin_roles,
    'organization', v_deleted_districts + v_deleted_teams + v_deleted_campuses,
    'userAccounts', v_deleted_user_accounts
  );
end;
$$;

revoke all on function reset_reservation_data(
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) from public;

grant execute on function reset_reservation_data(
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;

revoke all on function get_deletable_user_count() from public;
grant execute on function get_deletable_user_count() to authenticated;

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
grant execute on function public.get_destination_stats() to authenticated;

notify pgrst, 'reload schema';

select
  (select count(*) from public.districts where is_active = true) as active_districts,
  (select count(*) from public.teams where is_active = true) as active_teams,
  (select count(*) from public.campuses where is_active = true) as active_campuses;

-- =========================================================
-- END sql/setup/99_finalize_setup.sql
-- =========================================================

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

-- =========================================================
-- Simulation runtime safety and stage execution history
-- Run after 05_app_settings.sql and 99_finalize_setup.sql.
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

-- =========================================================
-- Delete one application user as a global admin
-- Run this in Supabase SQL Editor.
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

-- =========================================================
-- Store allocation workspace versions outside the hot row.
-- Run after 55_atomic_allocation_confirmation.sql.
-- =========================================================

create table if not exists public.allocation_workspace_versions (
  id text primary key,
  allocation_id uuid not null
    references public.bus_allocations(id) on delete cascade,
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

-- Move legacy embedded versions before removing them from the frequently updated row.
insert into public.allocation_workspace_versions (
  id,
  allocation_id,
  revision,
  label,
  actor_id,
  changes,
  snapshot,
  created_at
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
  coalesce(
    nullif(version.value ->> 'createdAt', '')::timestamptz,
    allocation.created_at
  )
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
  allocation_data - 'versions',
  '{schemaVersion}',
  '2'::jsonb,
  true
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
    id,
    allocation_id,
    revision,
    label,
    actor_id,
    changes,
    snapshot
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

create or replace function public.get_allocation_workspace_versions(
  p_allocation_id uuid
)
returns table (
  id text,
  created_at timestamptz,
  actor_id text,
  label text,
  changes jsonb
)
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
  select
    version.id,
    version.created_at,
    version.actor_id,
    version.label,
    version.changes
  from public.allocation_workspace_versions version
  where version.allocation_id = p_allocation_id
  order by version.created_at desc, version.id desc;
end;
$$;

create or replace function public.get_allocation_workspace_version_snapshot(
  p_version_id text
)
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

  select version.snapshot
  into v_snapshot
  from public.allocation_workspace_versions version
  where version.id = p_version_id;

  if v_snapshot is null then
    raise exception 'Allocation workspace version not found.';
  end if;

  return v_snapshot;
end;
$$;

create or replace function public.save_draft_allocation_workspace_v2(
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
begin
  select *
  into v_saved
  from public.save_draft_allocation_workspace(
    p_allocation_id,
    p_expected_revision,
    p_allocation_data - 'versions',
    p_total_cost,
    p_total_capacity
  );

  perform public.store_allocation_workspace_version(
    p_allocation_id,
    v_saved.revision,
    p_allocation_data,
    p_version_id,
    p_version_label,
    p_version_changes
  );

  return next v_saved;
end;
$$;

create or replace function public.save_confirmed_allocation_workspace_v2(
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
begin
  select *
  into v_saved
  from public.save_confirmed_allocation_workspace(
    p_allocation_id,
    p_expected_revision,
    p_allocation_data - 'versions',
    p_total_cost,
    p_total_capacity
  );

  perform public.store_allocation_workspace_version(
    p_allocation_id,
    v_saved.revision,
    p_allocation_data,
    p_version_id,
    p_version_label,
    p_version_changes
  );

  return next v_saved;
end;
$$;

create or replace function public.cancel_confirmed_allocation_workspace_v2(
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
begin
  select *
  into v_saved
  from public.cancel_confirmed_allocation_workspace(
    p_allocation_id,
    p_expected_revision,
    p_allocation_data - 'versions',
    p_total_cost,
    p_total_capacity
  );

  perform public.store_allocation_workspace_version(
    p_allocation_id,
    v_saved.revision,
    p_allocation_data,
    p_version_id,
    p_version_label,
    p_version_changes
  );

  return next v_saved;
end;
$$;

revoke all on function public.store_allocation_workspace_version(
  uuid, bigint, jsonb, text, text, jsonb
) from public, anon, authenticated;

revoke all on function public.get_allocation_workspace_versions(uuid)
  from public, anon;
grant execute on function public.get_allocation_workspace_versions(uuid)
  to authenticated;

revoke all on function public.get_allocation_workspace_version_snapshot(text)
  from public, anon;
grant execute on function public.get_allocation_workspace_version_snapshot(text)
  to authenticated;

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

-- =========================================================
-- Keep reservation status and confirmed ticket columns canonical.
-- JSON fields remain compatibility mirrors for older clients.
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

-- =========================================================
-- Atomically keep personal tickets and confirmed allocations in sync.
-- Run after 65_canonical_reservation_status.sql.
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

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found.';
  end if;

  -- Serialize all personal-ticket changes with confirmed allocation changes.
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

    select count(*)
    into v_bus_match_count
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
        jsonb_set(
          v_allocation.allocation_data,
          '{passengers}',
          v_passengers,
          true
        ),
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

  return query
  select *
  from public.reservations
  where id = p_reservation_id;
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

-- =========================================================
-- Reservations RPC-only writes
-- Run after all reservation write RPCs.
-- =========================================================

-- Keep direct table writes closed even if a broad table grant exists.
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

-- =========================================================
-- Payments RPC-only writes
-- Run after all payment write RPCs.
-- =========================================================

-- Keep direct table writes closed even if a broad table grant exists.
drop policy if exists "Users can insert own payments" on public.payments;
drop policy if exists "Campus admins can update campus payments" on public.payments;
drop policy if exists "Global admins can update all payments" on public.payments;

revoke insert, update, delete on table public.payments from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/68_payments_rpc_only_writes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/69_admin_roles_rpc_only_writes.sql
-- =========================================================

-- =========================================================
-- Admin roles RPC-only writes
-- Run after organization setup and admin role RLS fixes.
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
    user_id,
    role,
    district,
    team,
    campus,
    district_id,
    team_id,
    campus_id,
    granted_by,
    updated_at
  )
  values (
    p_user_id,
    'campus_admin',
    trim(p_district),
    trim(p_team),
    trim(p_campus),
    v_district_id,
    v_team_id,
    v_campus_id,
    auth.uid(),
    now()
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

-- =========================================================
-- Combined Supabase setup SQL
-- Generated from canonical sql files in recommended execution order.
-- Copy this whole file into Supabase SQL Editor and run it.
-- Destructive maintenance scripts such as 62_delete_all_users.sql are excluded.
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
-- BEGIN sql/setup/70_admin_personal_ticket_page.sql
-- =========================================================

-- =========================================================
-- Server-paginated global-admin personal ticket list.
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
      coalesce(nullif(reservation.data ->> 'id', ''), reservation.id::text) as id,
      reservation.id as db_id,
      reservation.user_id,
      profile.email,
      coalesce(
        nullif(reservation.data ->> 'name', ''),
        nullif(reservation.name, ''),
        profile.name,
        ''
      ) as name,
      coalesce(
        nullif(reservation.data ->> 'phone', ''),
        nullif(reservation.phone, ''),
        profile.phone,
        ''
      ) as phone,
      coalesce(
        nullif(reservation.data ->> 'district', ''),
        nullif(reservation.district, ''),
        profile.district,
        ''
      ) as district,
      coalesce(
        nullif(reservation.data ->> 'team', ''),
        nullif(reservation.team, ''),
        profile.team,
        ''
      ) as team,
      coalesce(
        nullif(reservation.data ->> 'campus', ''),
        nullif(reservation.campus, ''),
        profile.campus,
        ''
      ) as campus,
      coalesce(
        reservation.data -> 'stationPreferences',
        reservation.station_preferences,
        '[]'::jsonb
      ) as station_preferences,
      coalesce(reservation.status, nullif(reservation.data ->> 'status', ''), 'requested') as status,
      payment.status as payment_status,
      coalesce(
        nullif(reservation.confirmed_ticket, 'null'::jsonb),
        nullif(reservation.data -> 'confirmedTicket', 'null'::jsonb)
      ) as confirmed_ticket,
      coalesce(nullif(reservation.data ->> 'requestedAt', ''), reservation.created_at::text, '') as requested_at,
      coalesce(nullif(reservation.data ->> 'updatedAt', ''), reservation.updated_at::text) as updated_at,
      reservation.data as raw_data,
      true as has_reservation
    from public.reservations reservation
    left join public.profiles profile on profile.id = reservation.user_id
    left join public.payments payment on payment.reservation_id = reservation.id
  ),
  not_applied_people as (
    select
      'profile-' || profile.id::text as id,
      null::uuid as db_id,
      profile.id as user_id,
      profile.email,
      coalesce(profile.name, '') as name,
      coalesce(profile.phone, '') as phone,
      coalesce(profile.district, '') as district,
      coalesce(profile.team, '') as team,
      coalesce(profile.campus, '') as campus,
      '[]'::jsonb as station_preferences,
      'not_applied'::text as status,
      null::text as payment_status,
      null::jsonb as confirmed_ticket,
      ''::text as requested_at,
      null::text as updated_at,
      null::jsonb as raw_data,
      false as has_reservation
    from public.profiles profile
    where not exists (
      select 1
      from public.reservations reservation
      where reservation.user_id = profile.id
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
            'id', admin_role.id,
            'user_id', admin_role.user_id,
            'role', admin_role.role,
            'district', admin_role.district,
            'team', admin_role.team,
            'campus', admin_role.campus
          )
          order by admin_role.role, admin_role.id
        ) as admin_roles,
        array_agg(admin_role.role) as role_names
      from public.admin_roles admin_role
      where admin_role.user_id = person.user_id
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
      count(*) filter (
        where status not in ('cancelled', 'not_applied') and confirmed_ticket is not null
      )::integer as confirmed,
      count(*) filter (
        where status not in ('cancelled', 'not_applied') and confirmed_ticket is null
      )::integer as pending,
      count(*) filter (
        where status not in ('cancelled', 'not_applied') and payment_status = 'completed'
      )::integer as paid,
      count(*) filter (where status = 'cancelled')::integer as cancelled,
      count(*) filter (where status = 'not_applied')::integer as not_applied
    from people_with_roles
  ),
  campus_summary as (
    select
      person.campus as name,
      count(*) filter (where has_campus_issue)::integer as issue_count,
      count(*) filter (where status = 'not_applied')::integer as not_applied_count,
      count(*) filter (
        where has_reservation and status <> 'cancelled' and payment_status is distinct from 'completed'
      )::integer as unpaid_count,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'user_id', admin_role.user_id,
              'name', coalesce(profile.name, ''),
              'phone', coalesce(profile.phone, ''),
              'email', profile.email
            )
            order by coalesce(profile.name, ''), admin_role.user_id
          )
          from public.admin_roles admin_role
          left join public.profiles profile on profile.id = admin_role.user_id
          where admin_role.role = 'campus_admin'
            and coalesce(admin_role.campus, '') = person.campus
        ),
        '[]'::jsonb
      ) as admins
    from people_with_roles person
    where person.campus <> ''
    group by person.campus
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
-- BEGIN sql/setup/71_admin_setup_rpc_only_writes.sql
-- =========================================================

-- =========================================================
-- Admin setup RPC-only writes
-- Bus options, organization, and stations.
-- =========================================================

create or replace function public.upsert_bus_option_as_global_admin(
  p_id uuid,
  p_capacity integer,
  p_estimated_price integer,
  p_max_count integer,
  p_notes text
)
returns public.bus_options
language plpgsql security definer set search_path = public
as $$
declare v_row public.bus_options;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage bus options.'; end if;
  if coalesce(p_capacity, 0) < 1 then raise exception 'Capacity must be positive.'; end if;
  if coalesce(p_estimated_price, -1) < 0 then raise exception 'Estimated price cannot be negative.'; end if;
  if coalesce(p_max_count, 0) < 1 then raise exception 'Maximum count must be positive.'; end if;

  if p_id is null then
    insert into public.bus_options (capacity, estimated_price, max_count, notes)
    values (p_capacity, p_estimated_price, p_max_count, nullif(trim(p_notes), ''))
    returning * into v_row;
  else
    update public.bus_options
    set capacity = p_capacity,
        estimated_price = p_estimated_price,
        max_count = p_max_count,
        notes = nullif(trim(p_notes), '')
    where id = p_id
    returning * into v_row;
    if v_row.id is null then raise exception 'Bus option not found.'; end if;
  end if;
  return v_row;
end;
$$;

create or replace function public.delete_bus_option_as_global_admin(p_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage bus options.'; end if;
  delete from public.bus_options where id = p_id;
  if not found then raise exception 'Bus option not found.'; end if;
  return true;
end;
$$;

create or replace function public.create_campus_scope_as_global_admin(
  p_district text,
  p_team text,
  p_campus text
)
returns public.campuses
language plpgsql security definer set search_path = public
as $$
declare
  v_district_id uuid;
  v_team_id uuid;
  v_campus public.campuses;
  v_district text := nullif(trim(p_district), '');
  v_team text := nullif(trim(p_team), '');
  v_campus_name text := nullif(trim(p_campus), '');
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage organization.'; end if;
  if v_district is null or v_team is null or v_campus_name is null then
    raise exception 'District, team, and campus are required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('organization:' || v_district || ':' || v_team || ':' || v_campus_name, 0));

  insert into public.districts (name, is_active)
  values (v_district, true)
  on conflict (name) do update set is_active = true
  returning id into v_district_id;

  insert into public.teams (district_id, name, is_active)
  values (v_district_id, v_team, true)
  on conflict (district_id, name) do update set is_active = true
  returning id into v_team_id;

  if exists (select 1 from public.campuses where team_id = v_team_id and name = v_campus_name) then
    raise exception 'Campus already exists.';
  end if;

  insert into public.campuses (team_id, name, is_active)
  values (v_team_id, v_campus_name, true)
  returning * into v_campus;
  return v_campus;
end;
$$;

create or replace function public.upsert_station_as_global_admin(
  p_id uuid,
  p_name text,
  p_line text,
  p_address text,
  p_lat double precision,
  p_lng double precision
)
returns public.stations
language plpgsql security definer set search_path = public
as $$
declare v_row public.stations; v_name text := nullif(trim(p_name), '');
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage stations.'; end if;
  if v_name is null then raise exception 'Station name is required.'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'Invalid latitude.'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'Invalid longitude.'; end if;

  if p_id is null then
    insert into public.stations (name, line, address, lat, lng, is_active)
    values (v_name, nullif(trim(p_line), ''), nullif(trim(p_address), ''), p_lat, p_lng, true)
    returning * into v_row;
  else
    update public.stations
    set name = v_name, line = nullif(trim(p_line), ''), address = nullif(trim(p_address), ''), lat = p_lat, lng = p_lng
    where id = p_id
    returning * into v_row;
    if v_row.id is null then raise exception 'Station not found.'; end if;
  end if;
  return v_row;
end;
$$;

create or replace function public.delete_station_as_global_admin(p_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage stations.'; end if;
  delete from public.stations where id = p_id;
  if not found then raise exception 'Station not found.'; end if;
  return true;
end;
$$;

revoke all on function public.upsert_bus_option_as_global_admin(uuid, integer, integer, integer, text) from public, anon;
revoke all on function public.delete_bus_option_as_global_admin(uuid) from public, anon;
revoke all on function public.create_campus_scope_as_global_admin(text, text, text) from public, anon;
revoke all on function public.upsert_station_as_global_admin(uuid, text, text, text, double precision, double precision) from public, anon;
revoke all on function public.delete_station_as_global_admin(uuid) from public, anon;
grant execute on function public.upsert_bus_option_as_global_admin(uuid, integer, integer, integer, text) to authenticated;
grant execute on function public.delete_bus_option_as_global_admin(uuid) to authenticated;
grant execute on function public.create_campus_scope_as_global_admin(text, text, text) to authenticated;
grant execute on function public.upsert_station_as_global_admin(uuid, text, text, text, double precision, double precision) to authenticated;
grant execute on function public.delete_station_as_global_admin(uuid) to authenticated;

drop policy if exists "Global admins can manage bus options" on public.bus_options;
drop policy if exists "Global admins can manage districts" on public.districts;
drop policy if exists "Global admins can manage teams" on public.teams;
drop policy if exists "Global admins can manage campuses" on public.campuses;
drop policy if exists "Global admins can manage stations" on public.stations;
revoke insert, update, delete on table public.bus_options, public.districts, public.teams, public.campuses, public.stations
  from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/71_admin_setup_rpc_only_writes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/72_app_settings_announcements_rpc_only.sql
-- =========================================================

-- =========================================================
-- App settings and home announcements RPC-only writes
-- =========================================================

create or replace function public.update_app_setting_as_global_admin(
  p_key text,
  p_value jsonb
)
returns public.app_settings
language plpgsql security definer set search_path = public
as $$
declare v_row public.app_settings;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update app settings.'; end if;
  if p_key not in (
    'first_reservation_deadline',
    'seoul_district_transfer_account',
    'participation_targets',
    'global_scenario_checklist',
    'simulation_enabled'
  ) then raise exception 'Setting key is not editable through this RPC.'; end if;
  if jsonb_typeof(p_value) <> 'object' then raise exception 'Setting value must be a JSON object.'; end if;

  if p_key = 'first_reservation_deadline'
    and p_value ->> 'deadline_at' is not null then
    perform (p_value ->> 'deadline_at')::timestamptz;
  elsif p_key = 'seoul_district_transfer_account'
    and jsonb_typeof(p_value -> 'account_number') <> 'string' then
    raise exception 'Account number must be a string.';
  elsif p_key = 'participation_targets'
    and (jsonb_typeof(p_value -> 'rows') <> 'array' or jsonb_typeof(p_value -> 'targets') <> 'object') then
    raise exception 'Invalid participation targets.';
  elsif p_key = 'global_scenario_checklist'
    and jsonb_typeof(p_value -> 'checked_step_ids') <> 'array' then
    raise exception 'Invalid scenario checklist.';
  elsif p_key = 'simulation_enabled'
    and jsonb_typeof(p_value -> 'enabled') <> 'boolean' then
    raise exception 'Simulation enabled must be boolean.';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.create_home_announcement_as_global_admin(
  p_title text,
  p_content text
)
returns public.home_announcements
language plpgsql security definer set search_path = public
as $$
declare v_row public.home_announcements;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can create home announcements.'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Announcement title is required.'; end if;
  if nullif(trim(p_content), '') is null then raise exception 'Announcement content is required.'; end if;

  insert into public.home_announcements (title, content, created_by, is_published)
  values (trim(p_title), trim(p_content), auth.uid(), true)
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.update_app_setting_as_global_admin(text, jsonb) from public, anon;
revoke all on function public.create_home_announcement_as_global_admin(text, text) from public, anon;
grant execute on function public.update_app_setting_as_global_admin(text, jsonb) to authenticated;
grant execute on function public.create_home_announcement_as_global_admin(text, text) to authenticated;

drop policy if exists "Global admins can manage app settings" on public.app_settings;
drop policy if exists "Global admins can manage home announcements" on public.home_announcements;
revoke insert, update, delete on table public.app_settings, public.home_announcements from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/72_app_settings_announcements_rpc_only.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/73_campus_transfers_rpc_only_writes.sql
-- =========================================================

-- =========================================================
-- Campus transfers RPC-only writes
-- =========================================================

create or replace function public.revert_campus_transfer_confirmation_as_global_admin(
  p_transfer_id uuid
)
returns public.campus_transfers
language plpgsql security definer set search_path = public
as $$
declare v_transfer public.campus_transfers;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can revert campus transfers.';
  end if;

  update public.campus_transfers
  set status = 'sent',
      confirmed_by = null,
      confirmed_at = null,
      actual_confirmed_amount = null,
      updated_at = now()
  where id = p_transfer_id
  returning * into v_transfer;

  if v_transfer.id is null then raise exception 'Campus transfer not found.'; end if;
  return v_transfer;
end;
$$;

revoke all on function public.revert_campus_transfer_confirmation_as_global_admin(uuid) from public, anon;
grant execute on function public.revert_campus_transfer_confirmation_as_global_admin(uuid) to authenticated;

drop policy if exists "Global admins can update campus transfers" on public.campus_transfers;
revoke insert, update, delete on table public.campus_transfers from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/73_campus_transfers_rpc_only_writes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/74_bus_allocations_rpc_only_writes.sql
-- =========================================================

-- =========================================================
-- Bus allocations RPC-only writes and canonical totals
-- =========================================================

create or replace function public.set_bus_allocation_canonical_totals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_items jsonb;
begin
  if jsonb_typeof(new.allocation_data) <> 'object' then
    raise exception 'Allocation data must be a JSON object.';
  end if;

  if jsonb_typeof(new.allocation_data -> 'buses') = 'array' then
    v_items := new.allocation_data -> 'buses';
  elsif jsonb_typeof(new.allocation_data -> 'routePlan') = 'array' then
    v_items := new.allocation_data -> 'routePlan';
  else
    raise exception 'Allocation data must contain buses or routePlan.';
  end if;

  select
    coalesce(sum(greatest(coalesce((item ->> 'price')::integer, 0), 0)), 0),
    coalesce(sum(greatest(coalesce((item ->> 'capacity')::integer, 0), 0)), 0)
  into new.total_cost, new.total_capacity
  from jsonb_array_elements(v_items) item;

  return new;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Allocation bus price and capacity must be valid integers.';
end;
$$;

drop trigger if exists set_bus_allocation_canonical_totals on public.bus_allocations;
create trigger set_bus_allocation_canonical_totals
before insert or update of allocation_data, total_cost, total_capacity
on public.bus_allocations
for each row execute function public.set_bus_allocation_canonical_totals();

create or replace function public.create_bus_allocation_as_global_admin(
  p_allocation_name text,
  p_allocation_data jsonb
)
returns public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bus_allocations;
  v_status text;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create allocations.';
  end if;

  if nullif(trim(p_allocation_name), '') is null then
    raise exception 'Allocation name is required.';
  end if;
  if jsonb_typeof(p_allocation_data) <> 'object' then
    raise exception 'Allocation data must be a JSON object.';
  end if;

  v_status := p_allocation_data ->> 'status';
  if v_status is not null and v_status <> 'draft' then
    raise exception 'New allocation workspaces must be drafts.';
  end if;
  if jsonb_typeof(p_allocation_data -> 'buses') <> 'array'
    and jsonb_typeof(p_allocation_data -> 'routePlan') <> 'array' then
    raise exception 'Allocation data must contain buses or routePlan.';
  end if;

  insert into public.bus_allocations (
    allocation_name,
    allocation_data,
    total_cost,
    total_capacity,
    created_by,
    revision,
    updated_at
  )
  values (
    trim(p_allocation_name),
    p_allocation_data - 'versions',
    0,
    0,
    auth.uid(),
    0,
    now()
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_bus_allocation_as_global_admin(text, jsonb)
  from public, anon;
grant execute on function public.create_bus_allocation_as_global_admin(text, jsonb)
  to authenticated;

drop policy if exists "Global admins can manage bus allocations" on public.bus_allocations;
revoke insert, update, delete on table public.bus_allocations from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/74_bus_allocations_rpc_only_writes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/75_campus_admin_manage_users_page.sql
-- =========================================================

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
-- END sql/setup/75_campus_admin_manage_users_page.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/76_exact_allocation_optimization_jobs.sql
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
-- END sql/setup/76_exact_allocation_optimization_jobs.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/77_create_draft_from_exact_optimization.sql
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
-- END sql/setup/77_create_draft_from_exact_optimization.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/78_out_of_preference_admin_override.sql
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
-- END sql/setup/78_out_of_preference_admin_override.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/79_single_bus_option.sql
-- =========================================================

-- =========================================================
-- Restrict bus option management to the single bus type
-- supported by the exact allocation optimizer.
-- =========================================================

create or replace function public.upsert_bus_option_as_global_admin(
  p_id uuid,
  p_capacity integer,
  p_estimated_price integer,
  p_max_count integer,
  p_notes text
)
returns public.bus_options
language plpgsql security definer set search_path = public
as $$
declare v_row public.bus_options;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage bus options.'; end if;
  if coalesce(p_capacity, 0) < 1 then raise exception 'Capacity must be positive.'; end if;
  if coalesce(p_estimated_price, -1) < 0 then raise exception 'Estimated price cannot be negative.'; end if;
  if coalesce(p_max_count, 0) < 1 then raise exception 'Maximum count must be positive.'; end if;

  if p_id is null then
    lock table public.bus_options in share row exclusive mode;
    if exists (select 1 from public.bus_options) then
      raise exception 'Only one bus option can be registered.';
    end if;

    insert into public.bus_options (capacity, estimated_price, max_count, notes)
    values (p_capacity, p_estimated_price, p_max_count, nullif(trim(p_notes), ''))
    returning * into v_row;
  else
    update public.bus_options
    set capacity = p_capacity,
        estimated_price = p_estimated_price,
        max_count = p_max_count,
        notes = nullif(trim(p_notes), '')
    where id = p_id
    returning * into v_row;
    if v_row.id is null then raise exception 'Bus option not found.'; end if;
  end if;
  return v_row;
end;
$$;

-- =========================================================
-- END sql/setup/79_single_bus_option.sql
-- =========================================================

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
-- BEGIN sql/setup/80_remaining_seat_payment_workflow.sql
-- =========================================================

-- =========================================================
-- Remaining-seat payment workflow
-- - Users temporarily hold an automatically assigned seat.
-- - Only a global administrator can confirm payment and issue the ticket.
-- - Users and global administrators can cancel a pending hold.
-- =========================================================

insert into public.app_settings (key, value)
values ('remaining_seat_sales', '{"enabled": true, "hidden_bus_ids": []}'::jsonb)
on conflict (key) do nothing;

drop function if exists public.get_available_remaining_seats();
drop function if exists public.claim_remaining_seat(uuid, text);
drop function if exists public.sell_remaining_seat_as_admin(
  uuid, uuid, text, text, text, text, text
);

create or replace function public.get_available_remaining_seats()
returns table (
  allocation_id uuid,
  allocation_name text,
  bus_id text,
  bus_label text,
  destination text,
  departure_time text,
  boarding_place text,
  capacity integer,
  remaining_seats integer,
  price integer,
  transfer_account text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_deadline_at timestamptz;
  v_sales_setting jsonb := '{"enabled": true, "hidden_bus_ids": []}'::jsonb;
  v_price integer := 0;
  v_transfer_account text := '';
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.';
  end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline';

  select value into v_sales_setting
  from public.app_settings
  where key = 'remaining_seat_sales';

  select greatest(coalesce((value ->> 'price')::integer, 0), 0)
  into v_price
  from public.app_settings
  where key = 'bus_ticket_price';

  select coalesce(value ->> 'account_number', '')
  into v_transfer_account
  from public.app_settings
  where key = 'seoul_district_transfer_account';

  if v_deadline_at is null
    or v_deadline_at > clock_timestamp()
    or not coalesce((v_sales_setting ->> 'enabled')::boolean, true) then
    return;
  end if;

  if exists (
    select 1
    from public.reservations
    where user_id = v_actor_id
      and status <> 'cancelled'
  ) then
    return;
  end if;

  return query
  select
    allocation.id,
    allocation.allocation_name,
    bus ->> 'id',
    bus ->> 'label',
    bus ->> 'destination',
    bus ->> 'departureTime',
    bus ->> 'boardingPlace',
    (bus ->> 'capacity')::integer,
    (bus ->> 'capacity')::integer - (
      select count(*)::integer
      from jsonb_array_elements(coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)) passenger
      where passenger ->> 'busId' = bus ->> 'id'
    ),
    v_price,
    v_transfer_account
  from public.bus_allocations allocation
  cross join lateral jsonb_array_elements(coalesce(allocation.allocation_data -> 'buses', '[]'::jsonb)) bus
  where allocation.allocation_data ->> 'status' = 'confirmed'
    and coalesce(bus ->> 'capacity', '') ~ '^[1-9][0-9]*$'
    and not (coalesce(v_sales_setting -> 'hidden_bus_ids', '[]'::jsonb) ? (bus ->> 'id'))
    and (bus ->> 'capacity')::integer > (
      select count(*)::integer
      from jsonb_array_elements(coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)) passenger
      where passenger ->> 'busId' = bus ->> 'id'
    )
  order by bus ->> 'destination', bus ->> 'label';
end;
$$;

create or replace function public.claim_remaining_seat(
  p_allocation_id uuid,
  p_bus_id text,
  p_depositor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_deadline_at timestamptz;
  v_sales_setting jsonb := '{"enabled": true, "hidden_bus_ids": []}'::jsonb;
  v_allocation_name text;
  v_allocation_data jsonb;
  v_bus jsonb;
  v_capacity integer;
  v_seat_number integer;
  v_reservation_id uuid := gen_random_uuid();
  v_profile record;
  v_claim jsonb;
  v_reservation_data jsonb;
  v_passenger jsonb;
  v_price integer := 0;
  v_transfer_account text := '';
  v_existing_reservation_status text;
begin
  if v_actor_id is null then raise exception 'Authentication is required.'; end if;
  if nullif(btrim(p_depositor_name), '') is null then raise exception 'Depositor name is required.'; end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz into v_deadline_at
  from public.app_settings where key = 'first_reservation_deadline';
  select value into v_sales_setting from public.app_settings where key = 'remaining_seat_sales';
  select greatest(coalesce((value ->> 'price')::integer, 0), 0) into v_price
  from public.app_settings where key = 'bus_ticket_price';
  select coalesce(value ->> 'account_number', '') into v_transfer_account
  from public.app_settings where key = 'seoul_district_transfer_account';

  if v_deadline_at is null or v_deadline_at > v_now then
    raise exception 'Remaining seats are available only after the deadline.';
  end if;
  if not coalesce((v_sales_setting ->> 'enabled')::boolean, true) then
    raise exception 'Remaining seat sales are closed.';
  end if;
  if coalesce(v_sales_setting -> 'hidden_bus_ids', '[]'::jsonb) ? p_bus_id then
    raise exception 'The selected bus is not open for remaining seat sales.';
  end if;

  lock table public.bus_allocations in share row exclusive mode;
  lock table public.reservations in share row exclusive mode;

  select id, status
  into v_reservation_id, v_existing_reservation_status
  from public.reservations
  where user_id = v_actor_id
  for update;

  if found and v_existing_reservation_status <> 'cancelled' then
    raise exception 'A reservation already exists for this user.';
  end if;
  if not found then
    v_reservation_id := gen_random_uuid();
  end if;

  select allocation_name, allocation_data into v_allocation_name, v_allocation_data
  from public.bus_allocations
  where id = p_allocation_id and allocation_data ->> 'status' = 'confirmed'
  for update;
  if v_allocation_data is null then raise exception 'The confirmed allocation is no longer available.'; end if;

  select bus into v_bus
  from jsonb_array_elements(coalesce(v_allocation_data -> 'buses', '[]'::jsonb)) bus
  where bus ->> 'id' = p_bus_id limit 1;
  if v_bus is null then raise exception 'The selected bus is not available.'; end if;

  v_capacity := (v_bus ->> 'capacity')::integer;
  select candidate into v_seat_number
  from generate_series(1, v_capacity) candidate
  where not exists (
    select 1
    from jsonb_array_elements(coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)) passenger
    where passenger ->> 'busId' = p_bus_id and passenger ->> 'seatNumber' = candidate::text
  )
  order by candidate limit 1;
  if v_seat_number is null then raise exception 'No remaining seats are available on this bus.'; end if;

  select name, phone, district_id, district, team_id, team, campus_id, campus
  into v_profile from public.profiles where id = v_actor_id;
  if not found or nullif(btrim(v_profile.name), '') is null or nullif(btrim(v_profile.phone), '') is null then
    raise exception 'Complete your profile before selecting a remaining seat.';
  end if;

  v_claim := jsonb_build_object(
    'allocationId', p_allocation_id::text, 'allocationName', v_allocation_name,
    'busId', p_bus_id, 'busLabel', v_bus ->> 'label',
    'destination', v_bus ->> 'destination', 'departureTime', v_bus ->> 'departureTime',
    'boardingPlace', v_bus ->> 'boardingPlace', 'seatNumber', v_seat_number::text,
    'amount', v_price, 'depositorName', btrim(p_depositor_name),
    'transferAccount', v_transfer_account, 'status', 'pending_payment',
    'requestedAt', v_now::text
  );
  v_reservation_data := jsonb_build_object(
    'id', v_reservation_id::text, 'name', v_profile.name, 'phone', v_profile.phone,
    'district', coalesce(v_profile.district, ''), 'team', coalesce(v_profile.team, ''),
    'campus', coalesce(v_profile.campus, ''), 'stationPreferences', '[]'::jsonb,
    'status', 'requested', 'remainingSeatClaim', v_claim, 'requestedAt', v_now::text
  );

  insert into public.reservations (
    id, user_id, name, phone, district_id, district, team_id, team, campus_id, campus,
    station_preferences, status, confirmed_ticket, data, created_at, updated_at
  ) values (
    v_reservation_id, v_actor_id, v_profile.name, v_profile.phone,
    v_profile.district_id, coalesce(v_profile.district, ''), v_profile.team_id,
    coalesce(v_profile.team, ''), v_profile.campus_id, coalesce(v_profile.campus, ''),
    '[]'::jsonb, 'requested', null, v_reservation_data, v_now, v_now
  )
  on conflict (id) do update set
    name = excluded.name,
    phone = excluded.phone,
    district_id = excluded.district_id,
    district = excluded.district,
    team_id = excluded.team_id,
    team = excluded.team,
    campus_id = excluded.campus_id,
    campus = excluded.campus,
    station_preferences = excluded.station_preferences,
    status = excluded.status,
    confirmed_ticket = null,
    data = excluded.data,
    updated_at = excluded.updated_at;

  delete from public.payments where reservation_id = v_reservation_id;
  insert into public.payments (user_id, reservation_id, amount, status, notes, updated_at)
  values (v_actor_id, v_reservation_id, v_price, 'pending', '잔여좌석 입금자명: ' || btrim(p_depositor_name), v_now);

  v_passenger := jsonb_build_object(
    'reservationId', v_reservation_id::text, 'name', v_profile.name,
    'phone', v_profile.phone, 'campus', coalesce(v_profile.campus, ''),
    'team', coalesce(v_profile.team, ''), 'preferences', jsonb_build_array(v_bus ->> 'destination'),
    'busId', p_bus_id, 'seatNumber', v_seat_number, 'remainingSeatStatus', 'pending_payment'
  );
  update public.bus_allocations
  set allocation_data = jsonb_set(
    v_allocation_data, '{passengers}',
    coalesce(v_allocation_data -> 'passengers', '[]'::jsonb) || jsonb_build_array(v_passenger), true
  )
  where id = p_allocation_id;

  return v_claim;
end;
$$;

create or replace function public.confirm_remaining_seat_payment(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_reservation public.reservations;
  v_claim jsonb;
  v_ticket jsonb;
  v_allocation_data jsonb;
begin
  if not exists (
    select 1 from public.admin_roles where user_id = v_actor_id and role = 'global_admin'
  ) then raise exception 'Only global admins can confirm remaining seat payments.'; end if;

  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  v_claim := v_reservation.data -> 'remainingSeatClaim';
  if v_reservation.id is null or v_claim ->> 'status' <> 'pending_payment' then
    raise exception 'Pending remaining seat claim not found.';
  end if;

  select allocation_data into v_allocation_data
  from public.bus_allocations where id = (v_claim ->> 'allocationId')::uuid for update;
  if v_allocation_data is null then raise exception 'The confirmed allocation is no longer available.'; end if;

  v_ticket := jsonb_build_object(
    'busNumber', v_claim ->> 'busLabel', 'seatNumber', v_claim ->> 'seatNumber',
    'departureTime', v_claim ->> 'departureTime', 'boardingPlace', v_claim ->> 'boardingPlace',
    'dropoffStation', v_claim ->> 'destination', 'managerNote', '마감 후 잔여좌석 · 서울지구 입금 확인',
    'confirmedAt', v_now::text
  );
  v_claim := jsonb_set(jsonb_set(v_claim, '{status}', '"confirmed"'::jsonb), '{confirmedAt}', to_jsonb(v_now::text));

  update public.reservations set
    status = 'confirmed', confirmed_ticket = v_ticket,
    data = jsonb_set(jsonb_set(jsonb_set(data, '{status}', '"confirmed"'::jsonb), '{confirmedTicket}', v_ticket, true), '{remainingSeatClaim}', v_claim, true),
    updated_at = v_now
  where id = p_reservation_id;

  update public.payments set
    status = 'completed', paid_at = v_now, verified_by = v_actor_id, verified_at = v_now, updated_at = v_now
  where reservation_id = p_reservation_id;

  update public.bus_allocations
  set allocation_data = jsonb_set(
    v_allocation_data, '{passengers}',
    (
      select coalesce(jsonb_agg(case when passenger ->> 'reservationId' = p_reservation_id::text then passenger - 'remainingSeatStatus' else passenger end), '[]'::jsonb)
      from jsonb_array_elements(coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)) passenger
    ), true
  )
  where id = (v_claim ->> 'allocationId')::uuid;

  return v_ticket;
end;
$$;

create or replace function public.cancel_remaining_seat_claim(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_reservation public.reservations;
  v_claim jsonb;
  v_allocation_data jsonb;
  v_is_global_admin boolean;
begin
  select exists (
    select 1 from public.admin_roles where user_id = v_actor_id and role = 'global_admin'
  ) into v_is_global_admin;
  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  v_claim := v_reservation.data -> 'remainingSeatClaim';

  if v_reservation.id is null or v_claim ->> 'status' <> 'pending_payment' then
    raise exception 'Pending remaining seat claim not found.';
  end if;
  if v_reservation.user_id is distinct from v_actor_id and not v_is_global_admin then
    raise exception 'Not authorized to cancel this remaining seat claim.';
  end if;

  select allocation_data into v_allocation_data
  from public.bus_allocations where id = (v_claim ->> 'allocationId')::uuid for update;
  if v_allocation_data is not null then
    update public.bus_allocations
    set allocation_data = jsonb_set(
      v_allocation_data, '{passengers}',
      (
        select coalesce(jsonb_agg(passenger), '[]'::jsonb)
        from jsonb_array_elements(coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)) passenger
        where passenger ->> 'reservationId' <> p_reservation_id::text
      ), true
    )
    where id = (v_claim ->> 'allocationId')::uuid;
  end if;

  delete from public.reservations where id = p_reservation_id;
  return true;
end;
$$;

create or replace function public.update_remaining_seat_sales_settings(
  p_enabled boolean,
  p_hidden_bus_ids jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value jsonb;
begin
  if not exists (
    select 1 from public.admin_roles where user_id = auth.uid() and role = 'global_admin'
  ) then raise exception 'Only global admins can update remaining seat sales settings.'; end if;
  if jsonb_typeof(coalesce(p_hidden_bus_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'Hidden bus ids must be an array.';
  end if;

  v_value := jsonb_build_object('enabled', coalesce(p_enabled, false), 'hidden_bus_ids', coalesce(p_hidden_bus_ids, '[]'::jsonb));
  insert into public.app_settings (key, value, updated_at)
  values ('remaining_seat_sales', v_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v_value;
end;
$$;

revoke all on function public.get_available_remaining_seats() from public;
grant execute on function public.get_available_remaining_seats() to authenticated;
revoke all on function public.claim_remaining_seat(uuid, text, text) from public;
grant execute on function public.claim_remaining_seat(uuid, text, text) to authenticated;
revoke all on function public.confirm_remaining_seat_payment(uuid) from public;
grant execute on function public.confirm_remaining_seat_payment(uuid) to authenticated;
revoke all on function public.cancel_remaining_seat_claim(uuid) from public;
grant execute on function public.cancel_remaining_seat_claim(uuid) to authenticated;
revoke all on function public.update_remaining_seat_sales_settings(boolean, jsonb) from public;
grant execute on function public.update_remaining_seat_sales_settings(boolean, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/80_remaining_seat_payment_workflow.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/80_detailed_allocation_optimization_jobs.sql
-- =========================================================

-- =========================================================
-- Split the proven minimum-cost baseline from optional detailed balancing
-- =========================================================

alter table public.allocation_optimization_jobs
  add column if not exists optimization_scope text not null default 'BASELINE'
    check (optimization_scope in ('BASELINE', 'DETAILED')),
  add column if not exists source_job_id uuid
    references public.allocation_optimization_jobs(id) on delete set null;

create index if not exists idx_allocation_optimization_jobs_source
  on public.allocation_optimization_jobs(source_job_id);

create or replace function public.create_detailed_allocation_optimization_job(
  p_source_job_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.allocation_optimization_jobs%rowtype;
  v_job_id uuid;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can create detailed allocation jobs.';
  end if;
  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Another allocation optimization job is already active.';
  end if;

  select *
  into v_source
  from public.allocation_optimization_jobs
  where id = p_source_job_id;

  if v_source.id is null
    or v_source.status <> 'OPTIMAL'
    or v_source.optimization_scope <> 'BASELINE'
    or jsonb_typeof(v_source.result) <> 'object' then
    raise exception 'A completed baseline allocation job is required.';
  end if;

  insert into public.allocation_optimization_jobs (
    status,
    requested_by,
    input_hash,
    input_snapshot,
    optimization_scope,
    source_job_id
  )
  values (
    'PENDING',
    auth.uid(),
    v_source.input_hash,
    v_source.input_snapshot,
    'DETAILED',
    v_source.id
  )
  returning id into v_job_id;

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    v_job_id,
    'DETAILED_JOB_CREATED',
    jsonb_build_object(
      'requested_by', auth.uid()::text,
      'source_job_id', v_source.id::text
    )
  );

  return v_job_id;
end;
$$;

drop function if exists public.get_allocation_optimization_job(uuid);
create function public.get_allocation_optimization_job(p_job_id uuid)
returns table (
  id uuid,
  optimization_scope text,
  source_job_id uuid,
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
    job.id, job.optimization_scope, job.source_job_id, job.status,
    job.requested_at, job.started_at, job.completed_at, job.progress,
    job.current_phase, job.elapsed_seconds, job.best_known_bus_count,
    job.proven_bus_count, job.result, job.diagnostics, job.error_message
  from public.allocation_optimization_jobs job
  where job.id = p_job_id;
end;
$$;

drop function if exists public.get_recent_allocation_optimization_jobs(integer);
create function public.get_recent_allocation_optimization_jobs(p_limit integer default 20)
returns table (
  id uuid,
  optimization_scope text,
  source_job_id uuid,
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
    job.id, job.optimization_scope, job.source_job_id, job.status,
    job.requested_at, job.started_at, job.completed_at, job.progress,
    job.current_phase, job.elapsed_seconds, job.best_known_bus_count,
    job.proven_bus_count, job.error_message
  from public.allocation_optimization_jobs job
  order by job.requested_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

revoke all on function public.create_detailed_allocation_optimization_job(uuid)
  from public, anon;
grant execute on function public.create_detailed_allocation_optimization_job(uuid)
  to authenticated;
grant execute on function public.get_allocation_optimization_job(uuid)
  to authenticated;
grant execute on function public.get_recent_allocation_optimization_jobs(integer)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/80_detailed_allocation_optimization_jobs.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/81_immediate_allocation_job_cancel.sql
-- =========================================================

-- =========================================================
-- Make allocation optimization cancellation immediate
-- =========================================================

create or replace function public.cancel_allocation_optimization_job(
  p_job_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_status text;
  v_status text;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can cancel allocation optimization jobs.';
  end if;

  select job.status
  into v_previous_status
  from public.allocation_optimization_jobs job
  where job.id = p_job_id
  for update;

  if v_previous_status is null then
    raise exception 'Allocation optimization job not found.';
  end if;

  update public.allocation_optimization_jobs job
  set
    status = case
      when job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED') then 'CANCELLED'
      else job.status
    end,
    current_phase = case
      when job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED') then 'cancelled'
      else job.current_phase
    end,
    cancel_requested_at = case
      when job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
        then coalesce(job.cancel_requested_at, now())
      else job.cancel_requested_at
    end,
    completed_at = case
      when job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED') then now()
      else job.completed_at
    end
  where job.id = p_job_id
  returning status into v_status;

  if v_previous_status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED') then
    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      p_job_id,
      'CANCELLED',
      jsonb_build_object(
        'requested_by', auth.uid()::text,
        'previous_status', v_previous_status
      )
    );
  end if;

  return v_status;
end;
$$;

revoke all on function public.cancel_allocation_optimization_job(uuid)
  from public, anon;
grant execute on function public.cancel_allocation_optimization_job(uuid)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/81_immediate_allocation_job_cancel.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/84_instant_allocation_result_reuse.sql
-- =========================================================

-- =========================================================
-- Reuse unchanged optimal allocation results before launching a worker
-- =========================================================

do $$
begin
  if to_regprocedure(
    'public.create_uncached_allocation_optimization_job()'
  ) is null then
    alter function public.create_allocation_optimization_job()
      rename to create_uncached_allocation_optimization_job;
  end if;
end;
$$;

revoke all on function public.create_uncached_allocation_optimization_job()
  from public, anon, authenticated;

create or replace function public.create_allocation_optimization_job()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_job public.allocation_optimization_jobs%rowtype;
  v_reusable public.allocation_optimization_jobs%rowtype;
begin
  v_job_id := public.create_uncached_allocation_optimization_job();

  select *
  into v_job
  from public.allocation_optimization_jobs
  where id = v_job_id;

  select reusable.*
  into v_reusable
  from public.allocation_optimization_jobs reusable
  where reusable.id <> v_job.id
    and reusable.status = 'OPTIMAL'
    and reusable.optimization_scope = 'BASELINE'
    and reusable.input_hash = v_job.input_hash
    and reusable.input_snapshot = v_job.input_snapshot
    and jsonb_typeof(reusable.result) = 'object'
  order by reusable.completed_at desc
  limit 1;

  if v_reusable.id is not null then
    update public.allocation_optimization_jobs
    set
      status = 'OPTIMAL',
      started_at = now(),
      completed_at = now(),
      progress = 100,
      current_phase = 'completed',
      elapsed_seconds = 0,
      best_known_bus_count = v_reusable.best_known_bus_count,
      proven_bus_count = v_reusable.proven_bus_count,
      result = v_reusable.result,
      diagnostics = v_reusable.diagnostics,
      error_message = null
    where id = v_job.id
      and status = 'PENDING';

    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      v_job.id,
      'JOB_RESULT_REUSED',
      jsonb_build_object('source_job_id', v_reusable.id::text)
    );
  end if;

  return v_job.id;
end;
$$;

do $$
begin
  if to_regprocedure(
    'public.create_uncached_detailed_allocation_optimization_job(uuid)'
  ) is null then
    alter function public.create_detailed_allocation_optimization_job(uuid)
      rename to create_uncached_detailed_allocation_optimization_job;
  end if;
end;
$$;

revoke all on function public.create_uncached_detailed_allocation_optimization_job(uuid)
  from public, anon, authenticated;

create or replace function public.create_detailed_allocation_optimization_job(
  p_source_job_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_job public.allocation_optimization_jobs%rowtype;
  v_reusable public.allocation_optimization_jobs%rowtype;
begin
  v_job_id := public.create_uncached_detailed_allocation_optimization_job(
    p_source_job_id
  );

  select *
  into v_job
  from public.allocation_optimization_jobs
  where id = v_job_id;

  select reusable.*
  into v_reusable
  from public.allocation_optimization_jobs reusable
  where reusable.id <> v_job.id
    and reusable.status = 'OPTIMAL'
    and reusable.optimization_scope = 'DETAILED'
    and reusable.input_hash = v_job.input_hash
    and reusable.input_snapshot = v_job.input_snapshot
    and jsonb_typeof(reusable.result) = 'object'
  order by reusable.completed_at desc
  limit 1;

  if v_reusable.id is not null then
    update public.allocation_optimization_jobs
    set
      status = 'OPTIMAL',
      started_at = now(),
      completed_at = now(),
      progress = 100,
      current_phase = 'completed',
      elapsed_seconds = 0,
      best_known_bus_count = v_reusable.best_known_bus_count,
      proven_bus_count = v_reusable.proven_bus_count,
      result = v_reusable.result,
      diagnostics = v_reusable.diagnostics,
      error_message = null
    where id = v_job.id
      and status = 'PENDING';

    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      v_job.id,
      'JOB_RESULT_REUSED',
      jsonb_build_object('source_job_id', v_reusable.id::text)
    );
  end if;

  return v_job.id;
end;
$$;

revoke all on function public.create_allocation_optimization_job()
  from public, anon;
revoke all on function public.create_detailed_allocation_optimization_job(uuid)
  from public, anon;
grant execute on function public.create_allocation_optimization_job()
  to authenticated;
grant execute on function public.create_detailed_allocation_optimization_job(uuid)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/84_instant_allocation_result_reuse.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/85_passenger_boarding_confirmation.sql
-- =========================================================

-- =========================================================
-- Passenger boarding confirmation
-- The onboard leader checks the passenger's signed-in ticket screen.
-- =========================================================

alter table public.reservations
  add column if not exists boarding_confirmed_at timestamptz;

create index if not exists idx_reservations_boarding_confirmed_at
  on public.reservations(boarding_confirmed_at)
  where boarding_confirmed_at is not null;

create or replace function public.reset_boarding_confirmation_on_ticket_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from new.status
    or old.confirmed_ticket is distinct from new.confirmed_ticket then
    new.boarding_confirmed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists reset_boarding_confirmation_on_ticket_change
  on public.reservations;

create trigger reset_boarding_confirmation_on_ticket_change
before update of status, confirmed_ticket on public.reservations
for each row
execute function public.reset_boarding_confirmation_on_ticket_change();

create or replace function public.confirm_my_boarding()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_confirmed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  update public.reservations
  set boarding_confirmed_at = coalesce(boarding_confirmed_at, clock_timestamp())
  where user_id = v_user_id
    and status = 'confirmed'
    and jsonb_typeof(confirmed_ticket) = 'object'
  returning boarding_confirmed_at into v_confirmed_at;

  if v_confirmed_at is null then
    raise exception 'A confirmed ticket is required before boarding confirmation.';
  end if;

  return v_confirmed_at;
end;
$$;

revoke all on function public.confirm_my_boarding() from public, anon;
grant execute on function public.confirm_my_boarding() to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/85_passenger_boarding_confirmation.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/85_allocation_result_reuse_status.sql
-- =========================================================

-- =========================================================
-- Expose whether an allocation result was reused
-- =========================================================

alter table public.allocation_optimization_jobs
  add column if not exists result_reused boolean not null default false;

update public.allocation_optimization_jobs job
set result_reused = true
where exists (
  select 1
  from public.allocation_optimization_events event
  where event.job_id = job.id
    and event.event_type = 'JOB_RESULT_REUSED'
);

create or replace function public.mark_allocation_job_result_reused()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type = 'JOB_RESULT_REUSED' then
    update public.allocation_optimization_jobs
    set result_reused = true
    where id = new.job_id;
  end if;
  return new;
end;
$$;

drop trigger if exists mark_allocation_job_result_reused
  on public.allocation_optimization_events;
create trigger mark_allocation_job_result_reused
after insert on public.allocation_optimization_events
for each row execute function public.mark_allocation_job_result_reused();

revoke all on function public.mark_allocation_job_result_reused()
  from public, anon, authenticated;

drop function if exists public.get_allocation_optimization_job(uuid);
create function public.get_allocation_optimization_job(p_job_id uuid)
returns table (
  id uuid,
  optimization_scope text,
  source_job_id uuid,
  status text,
  requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  progress integer,
  current_phase text,
  elapsed_seconds integer,
  best_known_bus_count integer,
  proven_bus_count integer,
  result_reused boolean,
  result jsonb,
  diagnostics jsonb,
  error_message text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;
  return query
  select
    job.id, job.optimization_scope, job.source_job_id, job.status,
    job.requested_at, job.started_at, job.completed_at, job.progress,
    job.current_phase, job.elapsed_seconds, job.best_known_bus_count,
    job.proven_bus_count, job.result_reused, job.result, job.diagnostics,
    job.error_message
  from public.allocation_optimization_jobs job
  where job.id = p_job_id;
end;
$$;

drop function if exists public.get_recent_allocation_optimization_jobs(integer);
create function public.get_recent_allocation_optimization_jobs(p_limit integer default 20)
returns table (
  id uuid,
  optimization_scope text,
  source_job_id uuid,
  status text,
  requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  progress integer,
  current_phase text,
  elapsed_seconds integer,
  best_known_bus_count integer,
  proven_bus_count integer,
  result_reused boolean,
  error_message text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;
  return query
  select
    job.id, job.optimization_scope, job.source_job_id, job.status,
    job.requested_at, job.started_at, job.completed_at, job.progress,
    job.current_phase, job.elapsed_seconds, job.best_known_bus_count,
    job.proven_bus_count, job.result_reused, job.error_message
  from public.allocation_optimization_jobs job
  order by job.requested_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

grant execute on function public.get_allocation_optimization_job(uuid)
  to authenticated;
grant execute on function public.get_recent_allocation_optimization_jobs(integer)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/85_allocation_result_reuse_status.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/86_detailed_allocation_resume_and_skip.sql
-- =========================================================

-- =========================================================
-- Resume detailed allocation jobs and skip selected secondary phases
-- =========================================================

alter table public.allocation_optimization_jobs
  add column if not exists detailed_settings jsonb not null default '{}'::jsonb,
  add column if not exists resume_from_job_id uuid
    references public.allocation_optimization_jobs(id) on delete set null;

create index if not exists idx_allocation_optimization_jobs_resume
  on public.allocation_optimization_jobs(resume_from_job_id);

drop function if exists public.create_detailed_allocation_optimization_job(uuid);
drop function if exists public.create_uncached_detailed_allocation_optimization_job(uuid);

create function public.create_detailed_allocation_optimization_job(
  p_source_job_id uuid,
  p_skipped_phases text[],
  p_resume_from_job_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.allocation_optimization_jobs%rowtype;
  v_resume public.allocation_optimization_jobs%rowtype;
  v_reusable public.allocation_optimization_jobs%rowtype;
  v_job_id uuid;
  v_base_source_job_id uuid;
  v_skipped_phases text[];
  v_settings jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can create detailed allocation jobs.';
  end if;
  if exists (
    select 1 from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Another allocation optimization job is already active.';
  end if;

  select * into v_source
  from public.allocation_optimization_jobs
  where id = p_source_job_id;

  if v_source.id is null
    or v_source.status <> 'OPTIMAL'
    or jsonb_typeof(v_source.result) <> 'object' then
    raise exception 'A completed optimal allocation job is required.';
  end if;

  v_base_source_job_id := case
    when v_source.optimization_scope = 'BASELINE' then v_source.id
    else v_source.source_job_id
  end;
  if v_base_source_job_id is null then
    raise exception 'A baseline source job is required.';
  end if;

  select coalesce(array_agg(phase order by phase), '{}'::text[])
  into v_skipped_phases
  from (
    select distinct unnest(coalesce(p_skipped_phases, '{}'::text[])) as phase
  ) phases
  where phase = any(array[
    'campus_bus_uses',
    'campus_distribution_imbalance',
    'campus_isolated_groups',
    'campus_odd_groups',
    'team_bus_uses',
    'team_distribution_imbalance',
    'destination_occupancy_imbalance'
  ]::text[]);

  if cardinality(v_skipped_phases) <> cardinality(coalesce(p_skipped_phases, '{}'::text[])) then
    raise exception 'Detailed allocation skipped phases contain an invalid value.';
  end if;

  v_settings := jsonb_build_object('skipped_phases', to_jsonb(v_skipped_phases));

  if p_resume_from_job_id is not null then
    select * into v_resume
    from public.allocation_optimization_jobs
    where id = p_resume_from_job_id
      and status = 'OPTIMAL'
      and optimization_scope = 'DETAILED'
      and input_snapshot = v_source.input_snapshot;
  else
    select * into v_resume
    from public.allocation_optimization_jobs
    where status = 'OPTIMAL'
      and optimization_scope = 'DETAILED'
      and input_snapshot = v_source.input_snapshot
    order by completed_at desc
    limit 1;
  end if;

  insert into public.allocation_optimization_jobs (
    status, requested_by, input_hash, input_snapshot, optimization_scope,
    source_job_id, detailed_settings, resume_from_job_id
  )
  values (
    'PENDING', auth.uid(), v_source.input_hash, v_source.input_snapshot, 'DETAILED',
    v_base_source_job_id, v_settings, v_resume.id
  )
  returning id into v_job_id;

  select reusable.* into v_reusable
  from public.allocation_optimization_jobs reusable
  where reusable.id <> v_job_id
    and reusable.status = 'OPTIMAL'
    and reusable.optimization_scope = 'DETAILED'
    and reusable.input_snapshot = v_source.input_snapshot
    and reusable.detailed_settings = v_settings
    and jsonb_typeof(reusable.result) = 'object'
  order by reusable.completed_at desc
  limit 1;

  if v_reusable.id is not null then
    update public.allocation_optimization_jobs
    set status = 'OPTIMAL', started_at = now(), completed_at = now(),
      progress = 100, current_phase = 'completed', elapsed_seconds = 0,
      best_known_bus_count = v_reusable.best_known_bus_count,
      proven_bus_count = v_reusable.proven_bus_count,
      result = v_reusable.result, diagnostics = v_reusable.diagnostics,
      error_message = null
    where id = v_job_id and status = 'PENDING';

    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      v_job_id, 'JOB_RESULT_REUSED',
      jsonb_build_object('source_job_id', v_reusable.id::text)
    );
  else
    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      v_job_id, 'DETAILED_JOB_CREATED',
      jsonb_build_object(
        'source_job_id', v_base_source_job_id::text,
        'resume_from_job_id', v_resume.id::text,
        'skipped_phases', to_jsonb(v_skipped_phases)
      )
    );
  end if;

  return v_job_id;
end;
$$;

drop function if exists public.get_allocation_optimization_job(uuid);
create function public.get_allocation_optimization_job(p_job_id uuid)
returns table (
  id uuid, optimization_scope text, source_job_id uuid, resume_from_job_id uuid,
  detailed_settings jsonb, status text, requested_at timestamptz,
  started_at timestamptz, completed_at timestamptz, progress integer,
  current_phase text, elapsed_seconds integer, best_known_bus_count integer,
  proven_bus_count integer, result_reused boolean, result jsonb,
  diagnostics jsonb, error_message text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;
  return query
  select job.id, job.optimization_scope, job.source_job_id, job.resume_from_job_id,
    job.detailed_settings, job.status, job.requested_at, job.started_at,
    job.completed_at, job.progress, job.current_phase, job.elapsed_seconds,
    job.best_known_bus_count, job.proven_bus_count, job.result_reused,
    job.result, job.diagnostics, job.error_message
  from public.allocation_optimization_jobs job where job.id = p_job_id;
end;
$$;

drop function if exists public.get_recent_allocation_optimization_jobs(integer);
create function public.get_recent_allocation_optimization_jobs(p_limit integer default 20)
returns table (
  id uuid, optimization_scope text, source_job_id uuid, resume_from_job_id uuid,
  detailed_settings jsonb, status text, requested_at timestamptz,
  started_at timestamptz, completed_at timestamptz, progress integer,
  current_phase text, elapsed_seconds integer, best_known_bus_count integer,
  proven_bus_count integer, result_reused boolean, error_message text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;
  return query
  select job.id, job.optimization_scope, job.source_job_id, job.resume_from_job_id,
    job.detailed_settings, job.status, job.requested_at, job.started_at,
    job.completed_at, job.progress, job.current_phase, job.elapsed_seconds,
    job.best_known_bus_count, job.proven_bus_count, job.result_reused,
    job.error_message
  from public.allocation_optimization_jobs job
  order by job.requested_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

revoke all on function public.create_detailed_allocation_optimization_job(uuid, text[], uuid)
  from public, anon;
grant execute on function public.create_detailed_allocation_optimization_job(uuid, text[], uuid)
  to authenticated;
grant execute on function public.get_allocation_optimization_job(uuid) to authenticated;
grant execute on function public.get_recent_allocation_optimization_jobs(integer) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/86_detailed_allocation_resume_and_skip.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/87_boarding_management.sql
-- =========================================================

-- =========================================================
-- Boarding manager role and live boarding management
-- =========================================================

alter table public.admin_roles
  drop constraint if exists admin_roles_role_check;

alter table public.admin_roles
  add constraint admin_roles_role_check
  check (role in ('campus_admin', 'global_admin', 'boarding_manager'));

create unique index if not exists idx_admin_roles_boarding_manager_unique
  on public.admin_roles(user_id, role)
  where role = 'boarding_manager';

create or replace function public.is_boarding_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_roles
    where user_id = auth.uid()
      and role in ('global_admin', 'boarding_manager')
  );
$$;

revoke all on function public.is_boarding_manager() from public, anon;
grant execute on function public.is_boarding_manager() to authenticated;

create or replace function public.assign_boarding_manager_as_global_admin(
  p_user_id uuid
)
returns public.admin_roles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.admin_roles;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can assign boarding managers.';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found.';
  end if;

  insert into public.admin_roles (user_id, role, granted_by, updated_at)
  values (p_user_id, 'boarding_manager', auth.uid(), clock_timestamp())
  on conflict (user_id, role) where role = 'boarding_manager'
  do update set granted_by = excluded.granted_by, updated_at = excluded.updated_at
  returning * into v_role;

  return v_role;
end;
$$;

create or replace function public.cancel_boarding_manager_as_global_admin(
  p_user_id uuid
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
    raise exception 'Only global admins can cancel boarding managers.';
  end if;

  delete from public.admin_roles
  where user_id = p_user_id and role = 'boarding_manager'
  returning id into v_deleted_id;

  return v_deleted_id is not null;
end;
$$;

create or replace function public.get_boarding_manager_users(
  p_search text default ''
)
returns table (
  user_id uuid,
  name text,
  email text,
  phone text,
  district text,
  team text,
  campus text,
  is_boarding_manager boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage boarding managers.';
  end if;

  return query
  select
    profile.id,
    coalesce(profile.name, '이름 없음'),
    profile.email,
    profile.phone,
    profile.district,
    profile.team,
    profile.campus,
    exists (
      select 1 from public.admin_roles role
      where role.user_id = profile.id and role.role = 'boarding_manager'
    )
  from public.profiles profile
  where nullif(trim(p_search), '') is null
    or concat_ws(' ', profile.name, profile.email, profile.phone, profile.campus)
      ilike '%' || trim(p_search) || '%'
  order by
    exists (
      select 1 from public.admin_roles role
      where role.user_id = profile.id and role.role = 'boarding_manager'
    ) desc,
    profile.name asc nulls last
  limit 200;
end;
$$;

alter table public.reservations
  add column if not exists boarding_status text not null default 'unchecked';
alter table public.reservations
  add column if not exists boarding_status_updated_at timestamptz;
alter table public.reservations
  add column if not exists boarding_status_updated_by uuid references auth.users(id) on delete set null;
alter table public.reservations
  add column if not exists boarding_no_show_departure_id uuid;

alter table public.reservations
  drop constraint if exists reservations_boarding_status_check;
alter table public.reservations
  add constraint reservations_boarding_status_check
  check (boarding_status in ('unchecked', 'boarded', 'no_show'));

update public.reservations
set boarding_status = 'boarded',
    boarding_status_updated_at = coalesce(boarding_status_updated_at, boarding_confirmed_at)
where boarding_confirmed_at is not null
  and boarding_status = 'unchecked';

create table if not exists public.boarding_status_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  note text
);

create table if not exists public.boarding_bus_departures (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  bus_id text not null,
  bus_label text not null,
  departed_at timestamptz not null default now(),
  departed_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null
);

create unique index if not exists idx_boarding_active_bus_departure
  on public.boarding_bus_departures(allocation_id, bus_id)
  where cancelled_at is null;

create or replace function public.reset_bus_departures_on_allocation_cancel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.allocation_data ->> 'status' = 'confirmed'
    and new.allocation_data ->> 'status' <> 'confirmed' then
    update public.boarding_bus_departures
    set cancelled_at = clock_timestamp(), cancelled_by = auth.uid()
    where allocation_id = new.id and cancelled_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_bus_departures_on_allocation_cancel
  on public.bus_allocations;
create trigger reset_bus_departures_on_allocation_cancel
after update of allocation_data on public.bus_allocations
for each row
execute function public.reset_bus_departures_on_allocation_cancel();

alter table public.reservations
  drop constraint if exists reservations_boarding_no_show_departure_id_fkey;
alter table public.reservations
  add constraint reservations_boarding_no_show_departure_id_fkey
  foreign key (boarding_no_show_departure_id)
  references public.boarding_bus_departures(id)
  on delete set null;

create or replace function public.reset_boarding_confirmation_on_ticket_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from new.status
    or old.confirmed_ticket is distinct from new.confirmed_ticket then
    new.boarding_confirmed_at := null;
    new.boarding_status := 'unchecked';
    new.boarding_status_updated_at := null;
    new.boarding_status_updated_by := null;
    new.boarding_no_show_departure_id := null;
  end if;
  return new;
end;
$$;

create or replace function public.confirm_my_boarding()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation public.reservations%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;

  select * into v_reservation
  from public.reservations
  where user_id = v_user_id and status = 'confirmed' and confirmed_ticket is not null
  for update;

  if not found then
    raise exception 'A confirmed ticket is required before boarding confirmation.';
  end if;

  if v_reservation.boarding_status <> 'boarded' then
    update public.reservations
    set boarding_status = 'boarded',
        boarding_confirmed_at = v_now,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = v_user_id,
        boarding_no_show_departure_id = null
    where id = v_reservation.id;

    insert into public.boarding_status_events (
      reservation_id, from_status, to_status, actor_id, note
    ) values (
      v_reservation.id, v_reservation.boarding_status, 'boarded', v_user_id, '탑승 확인'
    );
  end if;

  return coalesce(v_reservation.boarding_confirmed_at, v_now);
end;
$$;

create or replace function public.set_passenger_boarding_status(
  p_reservation_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.reservations%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;

  select * into v_current from public.reservations
  where id = p_reservation_id and status = 'confirmed' and confirmed_ticket is not null
  for update;
  if not found then raise exception 'Confirmed passenger not found.'; end if;
  if v_current.boarding_status = p_status then return; end if;
  if p_status = 'no_show' and not exists (
    select 1
    from public.boarding_bus_departures departure
    join public.bus_allocations allocation on allocation.id = departure.allocation_id
    where departure.cancelled_at is null
      and allocation.allocation_data ->> 'status' = 'confirmed'
      and departure.bus_label = v_current.confirmed_ticket ->> 'busNumber'
  ) then
    raise exception 'No-show status is available after bus departure.';
  end if;

  update public.reservations
  set boarding_status = p_status,
      boarding_confirmed_at = case when p_status = 'boarded' then v_now else null end,
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null
  where id = p_reservation_id;

  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  ) values (
    p_reservation_id, v_current.boarding_status, p_status, auth.uid(), '탑승 관리 간사님 상태 변경'
  );
end;
$$;

create or replace function public.mark_boarding_bus_departed(p_bus_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_departure_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then raise exception 'Only boarding managers can mark departure.'; end if;

  select * into v_allocation from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Bus not found.'; end if;

  insert into public.boarding_bus_departures (
    allocation_id, bus_id, bus_label, departed_at, departed_by
  ) values (
    v_allocation.id, p_bus_id, v_bus ->> 'label', v_now, auth.uid()
  ) returning id into v_departure_id;

  with changed as (
    update public.reservations
    set boarding_status = 'no_show',
        boarding_confirmed_at = null,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = v_departure_id
    where status = 'confirmed'
      and boarding_status = 'unchecked'
      and confirmed_ticket ->> 'busNumber' = v_bus ->> 'label'
    returning id
  )
  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  )
  select id, 'unchecked', 'no_show', auth.uid(), '호차 출발 완료 일괄 처리'
  from changed;

  return v_departure_id;
end;
$$;

create or replace function public.cancel_boarding_bus_departure(p_bus_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_departure public.boarding_bus_departures%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then raise exception 'Only boarding managers can cancel departure.'; end if;

  select * into v_departure
  from public.boarding_bus_departures
  where bus_id = p_bus_id and cancelled_at is null
  order by departed_at desc
  limit 1
  for update;
  if not found then raise exception 'Active bus departure not found.'; end if;

  with changed as (
    update public.reservations
    set boarding_status = 'unchecked',
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = null
    where boarding_no_show_departure_id = v_departure.id
      and boarding_status = 'no_show'
    returning id
  )
  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  )
  select id, 'no_show', 'unchecked', auth.uid(), '호차 출발 완료 취소 자동 복구'
  from changed;

  update public.boarding_bus_departures
  set cancelled_at = v_now, cancelled_by = auth.uid()
  where id = v_departure.id;
end;
$$;

create or replace function public.get_boarding_management_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can view boarding management.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  if not found then return null; end if;

  return jsonb_build_object(
    'allocationId', v_allocation.id,
    'allocationName', v_allocation.allocation_name,
    'buses', (
      select coalesce(jsonb_agg(
        bus || jsonb_build_object(
          'departedAt', departure.departed_at,
          'departedBy', departure.departed_by
        ) order by bus ->> 'label'
      ), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
      left join public.boarding_bus_departures departure
        on departure.allocation_id = v_allocation.id
       and departure.bus_id = bus ->> 'id'
       and departure.cancelled_at is null
    ),
    'passengers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'reservationId', reservation.id,
        'name', reservation.name,
        'phone', reservation.phone,
        'district', reservation.district,
        'team', reservation.team,
        'campus', reservation.campus,
        'busNumber', reservation.confirmed_ticket ->> 'busNumber',
        'seatNumber', reservation.confirmed_ticket ->> 'seatNumber',
        'boardingStatus', reservation.boarding_status,
        'updatedAt', reservation.boarding_status_updated_at,
        'updatedByName', actor.name
      ) order by reservation.campus, reservation.name), '[]'::jsonb)
      from public.reservations reservation
      left join public.profiles actor on actor.id = reservation.boarding_status_updated_by
      where reservation.status = 'confirmed' and reservation.confirmed_ticket is not null
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id,
        'reservationId', event.reservation_id,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'actorType', case
          when event.note = '탑승 확인' then 'passenger'
          when event.note like '호차 출발%' then 'automatic'
          else 'boarding_manager'
        end,
        'actorName', actor.name,
        'createdAt', event.created_at,
        'note', event.note
      ) order by event.created_at desc), '[]'::jsonb)
      from public.boarding_status_events event
      left join public.profiles actor on actor.id = event.actor_id
      join public.reservations reservation on reservation.id = event.reservation_id
      where reservation.status = 'confirmed'
        and event.created_at >= coalesce(
          nullif(reservation.confirmed_ticket ->> 'confirmedAt', '')::timestamptz,
          '-infinity'::timestamptz
        )
    )
  );
end;
$$;

-- Keep at most one confirmed allocation and require explicit cancellation before replacement.
update public.bus_allocations allocation
set allocation_data = jsonb_set(allocation.allocation_data, '{status}', '"archived"'::jsonb, true)
where allocation.allocation_data ->> 'status' = 'confirmed'
  and allocation.id <> (
    select id from public.bus_allocations
    where allocation_data ->> 'status' = 'confirmed'
    order by updated_at desc nulls last, created_at desc
    limit 1
  );

create unique index if not exists idx_bus_allocations_single_confirmed
  on public.bus_allocations ((1))
  where allocation_data ->> 'status' = 'confirmed';

create or replace function public.enforce_single_confirmed_allocation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.allocation_data ->> 'status' = 'confirmed'
    and exists (
      select 1 from public.bus_allocations
      where id <> new.id and allocation_data ->> 'status' = 'confirmed'
    ) then
    raise exception 'Cancel the existing confirmed allocation before confirming another.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_single_confirmed_allocation on public.bus_allocations;
create trigger enforce_single_confirmed_allocation
before insert or update of allocation_data on public.bus_allocations
for each row execute function public.enforce_single_confirmed_allocation();

alter table public.boarding_status_events enable row level security;
alter table public.boarding_bus_departures enable row level security;

drop policy if exists "Boarding managers can view reservations" on public.reservations;
create policy "Boarding managers can view reservations"
on public.reservations for select to authenticated
using (public.is_boarding_manager());

drop policy if exists "Boarding managers can view boarding events" on public.boarding_status_events;
create policy "Boarding managers can view boarding events"
on public.boarding_status_events for select to authenticated
using (public.is_boarding_manager());

drop policy if exists "Boarding managers can view bus departures" on public.boarding_bus_departures;
create policy "Boarding managers can view bus departures"
on public.boarding_bus_departures for select to authenticated
using (public.is_boarding_manager());

revoke insert, update, delete on public.boarding_status_events from public, anon, authenticated;
revoke insert, update, delete on public.boarding_bus_departures from public, anon, authenticated;

revoke all on function public.assign_boarding_manager_as_global_admin(uuid) from public, anon;
revoke all on function public.cancel_boarding_manager_as_global_admin(uuid) from public, anon;
revoke all on function public.get_boarding_manager_users(text) from public, anon;
revoke all on function public.set_passenger_boarding_status(uuid, text) from public, anon;
revoke all on function public.mark_boarding_bus_departed(text) from public, anon;
revoke all on function public.cancel_boarding_bus_departure(text) from public, anon;
revoke all on function public.get_boarding_management_snapshot() from public, anon;

grant execute on function public.assign_boarding_manager_as_global_admin(uuid) to authenticated;
grant execute on function public.cancel_boarding_manager_as_global_admin(uuid) to authenticated;
grant execute on function public.get_boarding_manager_users(text) to authenticated;
grant execute on function public.set_passenger_boarding_status(uuid, text) to authenticated;
grant execute on function public.mark_boarding_bus_departed(text) to authenticated;
grant execute on function public.cancel_boarding_bus_departure(text) to authenticated;
grant execute on function public.get_boarding_management_snapshot() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table public.reservations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'boarding_bus_departures'
  ) then
    alter publication supabase_realtime add table public.boarding_bus_departures;
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/87_boarding_management.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/88_allocation_requires_closed_deadline.sql
-- =========================================================

-- =========================================================
-- Require the reservation deadline to be closed for allocation work
-- =========================================================

create or replace function public.require_closed_reservation_deadline_for_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deadline_at timestamptz;
begin
  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_at is null or v_deadline_at > clock_timestamp() then
    raise exception 'Allocation is available only after the reservation deadline.';
  end if;

  return new;
end;
$$;

drop trigger if exists require_closed_deadline_for_allocation_job
on public.allocation_optimization_jobs;
create trigger require_closed_deadline_for_allocation_job
before insert on public.allocation_optimization_jobs
for each row execute function public.require_closed_reservation_deadline_for_allocation();

drop trigger if exists require_closed_deadline_for_bus_allocation
on public.bus_allocations;
create trigger require_closed_deadline_for_bus_allocation
before insert or update on public.bus_allocations
for each row execute function public.require_closed_reservation_deadline_for_allocation();

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/88_allocation_requires_closed_deadline.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/89_allocation_execution_mode.sql
-- =========================================================

-- =========================================================
-- Route allocation optimization jobs to local or Cloud Run workers
-- =========================================================

alter table public.allocation_optimization_jobs
  add column if not exists execution_mode text not null default 'local'
    check (execution_mode in ('local', 'cloud'));

create index if not exists idx_allocation_optimization_jobs_pending_execution
  on public.allocation_optimization_jobs(execution_mode, requested_at)
  where status = 'PENDING';

create or replace function public.create_allocation_optimization_job_for_execution(
  p_execution_mode text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  if p_execution_mode not in ('local', 'cloud') then
    raise exception 'Allocation optimization execution mode is invalid.';
  end if;

  v_job_id := public.create_allocation_optimization_job();

  update public.allocation_optimization_jobs
  set execution_mode = p_execution_mode
  where id = v_job_id;

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    v_job_id,
    'EXECUTION_MODE_SELECTED',
    jsonb_build_object('execution_mode', p_execution_mode)
  );

  return v_job_id;
end;
$$;

create or replace function public.create_detailed_allocation_optimization_job_for_execution(
  p_source_job_id uuid,
  p_skipped_phases text[],
  p_resume_from_job_id uuid,
  p_execution_mode text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  if p_execution_mode not in ('local', 'cloud') then
    raise exception 'Allocation optimization execution mode is invalid.';
  end if;

  v_job_id := public.create_detailed_allocation_optimization_job(
    p_source_job_id,
    p_skipped_phases,
    p_resume_from_job_id
  );

  update public.allocation_optimization_jobs
  set execution_mode = p_execution_mode
  where id = v_job_id;

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    v_job_id,
    'EXECUTION_MODE_SELECTED',
    jsonb_build_object('execution_mode', p_execution_mode)
  );

  return v_job_id;
end;
$$;

revoke all on function public.create_allocation_optimization_job_for_execution(text)
  from public, anon;
revoke all on function public.create_detailed_allocation_optimization_job_for_execution(
  uuid, text[], uuid, text
)
  from public, anon;

grant execute on function public.create_allocation_optimization_job_for_execution(text)
  to authenticated;
grant execute on function public.create_detailed_allocation_optimization_job_for_execution(
  uuid, text[], uuid, text
)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/89_allocation_execution_mode.sql
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
-- BEGIN sql/setup/92_admin_created_account_source.sql
-- =========================================================

-- =========================================================
-- Track whether an account was created by the user or an administrator.
-- Existing accounts remain self_signup because their origin cannot be
-- determined reliably from the currently stored data.
-- =========================================================

alter table public.profiles
  add column if not exists account_source text not null default 'self_signup';

update public.profiles
set account_source = 'self_signup'
where account_source not in ('self_signup', 'admin_created', 'ccc_summer');

alter table public.profiles
  drop constraint if exists profiles_account_source_check;

alter table public.profiles
  add constraint profiles_account_source_check
  check (account_source in ('self_signup', 'admin_created', 'ccc_summer'));

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
    account_source, updated_at
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
    case
      when new.raw_user_meta_data ->> 'account_source'
        in ('admin_created', 'ccc_summer')
        then new.raw_user_meta_data ->> 'account_source'
      else 'self_signup'
    end,
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
    account_source = excluded.account_source,
    updated_at = now();

  return new;
end;
$$;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/92_admin_created_account_source.sql
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

-- =========================================================
-- BEGIN sql/setup/93_reset_allocation_optimization_jobs.sql
-- =========================================================

-- =========================================================
-- Reset allocation optimization history and reusable result cache
-- =========================================================

create or replace function public.reset_allocation_optimization_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can reset allocation optimization jobs.';
  end if;

  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Cancel the active allocation optimization job before resetting.';
  end if;

  select count(*)::integer
  into v_deleted_count
  from public.allocation_optimization_jobs;

  delete from public.allocation_optimization_jobs;

  return v_deleted_count;
end;
$$;

revoke all on function public.reset_allocation_optimization_jobs()
  from public, anon;
grant execute on function public.reset_allocation_optimization_jobs()
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/93_reset_allocation_optimization_jobs.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/94_boarding_notes.sql
-- =========================================================

-- =========================================================
-- Boarding manager notes
-- =========================================================

alter table public.reservations
  add column if not exists boarding_note text;
alter table public.reservations
  add column if not exists boarding_note_updated_at timestamptz;
alter table public.reservations
  add column if not exists boarding_note_updated_by uuid references auth.users(id) on delete set null;

create or replace function public.update_passenger_boarding_note(
  p_reservation_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding notes.';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'Boarding notes must be 500 characters or fewer.';
  end if;

  update public.reservations
  set boarding_note = v_note,
      boarding_note_updated_at = clock_timestamp(),
      boarding_note_updated_by = auth.uid()
  where id = p_reservation_id
    and status = 'confirmed'
    and confirmed_ticket is not null;

  if not found then
    raise exception 'Confirmed passenger not found.';
  end if;
end;
$$;

create or replace function public.get_boarding_management_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can view boarding management.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  if not found then return null; end if;

  return jsonb_build_object(
    'allocationId', v_allocation.id,
    'allocationName', v_allocation.allocation_name,
    'buses', (
      select coalesce(jsonb_agg(
        bus || jsonb_build_object(
          'departedAt', departure.departed_at,
          'departedBy', departure.departed_by
        ) order by bus ->> 'label'
      ), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
      left join public.boarding_bus_departures departure
        on departure.allocation_id = v_allocation.id
       and departure.bus_id = bus ->> 'id'
       and departure.cancelled_at is null
    ),
    'passengers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'reservationId', reservation.id,
        'name', reservation.name,
        'phone', reservation.phone,
        'district', reservation.district,
        'team', reservation.team,
        'campus', reservation.campus,
        'busNumber', reservation.confirmed_ticket ->> 'busNumber',
        'seatNumber', reservation.confirmed_ticket ->> 'seatNumber',
        'boardingStatus', reservation.boarding_status,
        'boardingNote', reservation.boarding_note,
        'boardingNoteUpdatedAt', reservation.boarding_note_updated_at,
        'boardingNoteUpdatedByName', note_actor.name,
        'updatedAt', reservation.boarding_status_updated_at,
        'updatedByName', status_actor.name
      ) order by reservation.campus, reservation.name), '[]'::jsonb)
      from public.reservations reservation
      left join public.profiles status_actor on status_actor.id = reservation.boarding_status_updated_by
      left join public.profiles note_actor on note_actor.id = reservation.boarding_note_updated_by
      where reservation.status = 'confirmed' and reservation.confirmed_ticket is not null
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id,
        'reservationId', event.reservation_id,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'actorType', case
          when event.note = '탑승 확인' then 'passenger'
          when event.note like '호차 출발%' then 'automatic'
          else 'boarding_manager'
        end,
        'actorName', actor.name,
        'createdAt', event.created_at,
        'note', event.note
      ) order by event.created_at desc), '[]'::jsonb)
      from public.boarding_status_events event
      left join public.profiles actor on actor.id = event.actor_id
      join public.reservations reservation on reservation.id = event.reservation_id
      where reservation.status = 'confirmed'
        and event.created_at >= coalesce(
          nullif(reservation.confirmed_ticket ->> 'confirmedAt', '')::timestamptz,
          '-infinity'::timestamptz
        )
    )
  );
end;
$$;

revoke all on function public.update_passenger_boarding_note(uuid, text) from public, anon;
grant execute on function public.update_passenger_boarding_note(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/94_boarding_notes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/95_admin_permission_and_audit.sql
-- =========================================================

-- =========================================================
-- Shared administrator permissions and operational audit log
-- =========================================================

create or replace function public.has_admin_permission(
  p_required_role text,
  p_district text default null,
  p_team text default null,
  p_campus text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
      and (
        admin_role.role = 'global_admin'
        or (
          admin_role.role = p_required_role
          and (p_district is null or admin_role.district = p_district)
          and (p_team is null or admin_role.team = p_team)
          and (p_campus is null or admin_role.campus = p_campus)
        )
      )
  );
$$;

create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_admin_permission('global_admin');
$$;

create or replace function public.is_boarding_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_admin_permission('boarding_manager');
$$;

create or replace function public.is_campus_admin_for_scope(
  p_district text,
  p_team text,
  p_campus text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_admin_permission(
    'campus_admin',
    p_district,
    p_team,
    p_campus
  );
$$;

revoke all on function public.has_admin_permission(text, text, text, text)
  from public, anon;
revoke all on function public.is_global_admin() from public, anon;
revoke all on function public.is_boarding_manager() from public, anon;
revoke all on function public.is_campus_admin_for_scope(text, text, text)
  from public, anon;
grant execute on function public.has_admin_permission(text, text, text, text)
  to authenticated;
grant execute on function public.is_global_admin() to authenticated;
grant execute on function public.is_boarding_manager() to authenticated;
grant execute on function public.is_campus_admin_for_scope(text, text, text)
  to authenticated;

create table if not exists public.admin_action_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_admin_action_audit_logs_created
  on public.admin_action_audit_logs(created_at desc);
create index if not exists idx_admin_action_audit_logs_resource
  on public.admin_action_audit_logs(resource_type, resource_id, created_at desc);

alter table public.admin_action_audit_logs enable row level security;

drop policy if exists "Global admins can view admin action audit logs"
  on public.admin_action_audit_logs;
create policy "Global admins can view admin action audit logs"
on public.admin_action_audit_logs for select to authenticated
using (public.is_global_admin());

grant select on public.admin_action_audit_logs to authenticated;

create or replace function public.audit_admin_operation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
  ) then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;

  v_resource_id := case
    when tg_op = 'DELETE' then old.id
    else new.id
  end;

  insert into public.admin_action_audit_logs (
    actor_id,
    action,
    resource_type,
    resource_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    v_resource_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists audit_admin_payment_operation on public.payments;
create trigger audit_admin_payment_operation
after insert or update or delete on public.payments
for each row execute function public.audit_admin_operation();

drop trigger if exists audit_admin_campus_transfer_operation
  on public.campus_transfers;
create trigger audit_admin_campus_transfer_operation
after insert or update or delete on public.campus_transfers
for each row execute function public.audit_admin_operation();

revoke all on function public.audit_admin_operation()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/95_admin_permission_and_audit.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/96_boarding_manager_bus_assignments.sql
-- =========================================================

-- =========================================================
-- Boarding manager bus assignments
-- =========================================================

create table if not exists public.boarding_manager_bus_assignments (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  manager_user_id uuid not null references auth.users(id) on delete cascade,
  bus_id text not null,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (allocation_id, manager_user_id, bus_id)
);

create index if not exists idx_boarding_manager_bus_assignments_manager
  on public.boarding_manager_bus_assignments(manager_user_id, allocation_id);

alter table public.boarding_manager_bus_assignments enable row level security;

revoke insert, update, delete on public.boarding_manager_bus_assignments
  from public, anon, authenticated;

create or replace function public.can_manage_boarding_bus(
  p_allocation_id uuid,
  p_bus_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_global_admin()
    or exists (
      select 1
      from public.boarding_manager_bus_assignments assignment
      where assignment.allocation_id = p_allocation_id
        and assignment.manager_user_id = auth.uid()
        and assignment.bus_id = p_bus_id
    );
$$;

create or replace function public.can_manage_boarding_bus_label(
  p_allocation_id uuid,
  p_bus_label text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_global_admin()
    or exists (
      select 1
      from public.boarding_manager_bus_assignments assignment
      join public.bus_allocations allocation on allocation.id = assignment.allocation_id
      cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
      where assignment.allocation_id = p_allocation_id
        and assignment.manager_user_id = auth.uid()
        and assignment.bus_id = bus ->> 'id'
        and bus ->> 'label' = p_bus_label
    );
$$;

create or replace function public.can_manage_current_boarding_bus_label(
  p_bus_label text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bus_allocations allocation
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and public.can_manage_boarding_bus_label(allocation.id, p_bus_label)
  );
$$;

create or replace function public.can_manage_boarding_reservation(
  p_reservation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reservations reservation
    where reservation.id = p_reservation_id
      and public.can_manage_current_boarding_bus_label(
        reservation.confirmed_ticket ->> 'busNumber'
      )
  );
$$;

drop policy if exists "Boarding managers can view their bus assignments"
  on public.boarding_manager_bus_assignments;
create policy "Boarding managers can view their bus assignments"
on public.boarding_manager_bus_assignments for select to authenticated
using (
  public.is_global_admin()
  or manager_user_id = auth.uid()
);

drop policy if exists "Boarding managers can view reservations" on public.reservations;
create policy "Boarding managers can view reservations"
on public.reservations for select to authenticated
using (
  public.can_manage_current_boarding_bus_label(
    reservations.confirmed_ticket ->> 'busNumber'
  )
);

drop policy if exists "Boarding managers can view boarding events" on public.boarding_status_events;
create policy "Boarding managers can view boarding events"
on public.boarding_status_events for select to authenticated
using (
  public.can_manage_boarding_reservation(boarding_status_events.reservation_id)
);

drop policy if exists "Boarding managers can view bus departures" on public.boarding_bus_departures;
create policy "Boarding managers can view bus departures"
on public.boarding_bus_departures for select to authenticated
using (
  public.can_manage_boarding_bus(allocation_id, bus_id)
);

create or replace function public.get_boarding_manager_assignment_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage boarding manager assignments.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  if not found then
    return jsonb_build_object(
      'allocationId', null,
      'allocationName', null,
      'buses', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'allocationId', v_allocation.id,
    'allocationName', v_allocation.allocation_name,
    'buses', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', bus ->> 'id',
        'label', bus ->> 'label',
        'destination', bus ->> 'destination'
      ) order by bus ->> 'label'), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
    )
  );
end;
$$;

create or replace function public.set_boarding_manager_bus_assignments_as_global_admin(
  p_user_id uuid,
  p_bus_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_requested_count integer;
  v_valid_count integer;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage boarding manager assignments.';
  end if;
  if not exists (
    select 1 from public.admin_roles
    where user_id = p_user_id and role = 'boarding_manager'
  ) then
    raise exception 'The selected user is not a boarding manager.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then
    raise exception 'Confirmed allocation not found.';
  end if;

  select count(distinct bus_id)
  into v_requested_count
  from unnest(coalesce(p_bus_ids, array[]::text[])) bus_id;

  select count(distinct bus ->> 'id')
  into v_valid_count
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = any(coalesce(p_bus_ids, array[]::text[]));

  if v_requested_count <> v_valid_count then
    raise exception 'One or more selected buses do not belong to the confirmed allocation.';
  end if;

  delete from public.boarding_manager_bus_assignments
  where allocation_id = v_allocation.id
    and manager_user_id = p_user_id;

  insert into public.boarding_manager_bus_assignments (
    allocation_id, manager_user_id, bus_id, assigned_by
  )
  select v_allocation.id, p_user_id, bus_id, auth.uid()
  from (
    select distinct bus_id
    from unnest(coalesce(p_bus_ids, array[]::text[])) bus_id
  ) requested;
end;
$$;

drop function if exists public.get_boarding_manager_users(text);
create function public.get_boarding_manager_users(
  p_search text default ''
)
returns table (
  user_id uuid,
  name text,
  email text,
  phone text,
  district text,
  team text,
  campus text,
  is_boarding_manager boolean,
  assigned_bus_ids text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage boarding managers.';
  end if;

  return query
  select
    profile.id,
    coalesce(profile.name, '이름 없음'),
    profile.email,
    profile.phone,
    profile.district,
    profile.team,
    profile.campus,
    exists (
      select 1 from public.admin_roles role
      where role.user_id = profile.id and role.role = 'boarding_manager'
    ),
    coalesce((
      select array_agg(assignment.bus_id order by assignment.bus_id)
      from public.boarding_manager_bus_assignments assignment
      join public.bus_allocations allocation on allocation.id = assignment.allocation_id
      where assignment.manager_user_id = profile.id
        and allocation.allocation_data ->> 'status' = 'confirmed'
    ), array[]::text[])
  from public.profiles profile
  where nullif(trim(p_search), '') is null
    or concat_ws(' ', profile.name, profile.email, profile.phone, profile.campus)
      ilike '%' || trim(p_search) || '%'
  order by
    exists (
      select 1 from public.admin_roles role
      where role.user_id = profile.id and role.role = 'boarding_manager'
    ) desc,
    profile.name asc nulls last
  limit 200;
end;
$$;

create or replace function public.cancel_boarding_manager_as_global_admin(
  p_user_id uuid
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
    raise exception 'Only global admins can cancel boarding managers.';
  end if;

  delete from public.boarding_manager_bus_assignments
  where manager_user_id = p_user_id;

  delete from public.admin_roles
  where user_id = p_user_id and role = 'boarding_manager'
  returning id into v_deleted_id;

  return v_deleted_id is not null;
end;
$$;

create or replace function public.set_passenger_boarding_status(
  p_reservation_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.reservations%rowtype;
  v_allocation_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;

  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select * into v_current from public.reservations
  where id = p_reservation_id and status = 'confirmed' and confirmed_ticket is not null
  for update;
  if not found then raise exception 'Confirmed passenger not found.'; end if;
  if not public.can_manage_boarding_bus_label(
    v_allocation_id,
    v_current.confirmed_ticket ->> 'busNumber'
  ) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if v_current.boarding_status = p_status then return; end if;
  if p_status = 'no_show' and not exists (
    select 1
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_allocation_id
      and departure.cancelled_at is null
      and departure.bus_label = v_current.confirmed_ticket ->> 'busNumber'
  ) then
    raise exception 'No-show status is available after bus departure.';
  end if;

  update public.reservations
  set boarding_status = p_status,
      boarding_confirmed_at = case when p_status = 'boarded' then v_now else null end,
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null
  where id = p_reservation_id;

  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  ) values (
    p_reservation_id, v_current.boarding_status, p_status, auth.uid(), '탑승 관리 간사님 상태 변경'
  );
end;
$$;

create or replace function public.update_passenger_boarding_note(
  p_reservation_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_allocation_id uuid;
  v_bus_label text;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding notes.';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'Boarding notes must be 500 characters or fewer.';
  end if;

  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  select confirmed_ticket ->> 'busNumber' into v_bus_label
  from public.reservations
  where id = p_reservation_id and status = 'confirmed' and confirmed_ticket is not null;

  if v_bus_label is null then raise exception 'Confirmed passenger not found.'; end if;
  if not public.can_manage_boarding_bus_label(v_allocation_id, v_bus_label) then
    raise exception 'You are not assigned to this bus.';
  end if;

  update public.reservations
  set boarding_note = v_note,
      boarding_note_updated_at = clock_timestamp(),
      boarding_note_updated_by = auth.uid()
  where id = p_reservation_id;
end;
$$;

create or replace function public.mark_boarding_bus_departed(p_bus_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_departure_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then raise exception 'Only boarding managers can mark departure.'; end if;

  select * into v_allocation from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Bus not found.'; end if;

  insert into public.boarding_bus_departures (
    allocation_id, bus_id, bus_label, departed_at, departed_by
  ) values (
    v_allocation.id, p_bus_id, v_bus ->> 'label', v_now, auth.uid()
  ) returning id into v_departure_id;

  with changed as (
    update public.reservations
    set boarding_status = 'no_show',
        boarding_confirmed_at = null,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = v_departure_id
    where status = 'confirmed'
      and boarding_status = 'unchecked'
      and confirmed_ticket ->> 'busNumber' = v_bus ->> 'label'
    returning id
  )
  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  )
  select id, 'unchecked', 'no_show', auth.uid(), '호차 출발 완료 일괄 처리'
  from changed;

  return v_departure_id;
end;
$$;

create or replace function public.cancel_boarding_bus_departure(p_bus_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_departure public.boarding_bus_departures%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then raise exception 'Only boarding managers can cancel departure.'; end if;

  select * into v_departure
  from public.boarding_bus_departures
  where bus_id = p_bus_id and cancelled_at is null
  order by departed_at desc
  limit 1
  for update;
  if not found then raise exception 'Active bus departure not found.'; end if;
  if not public.can_manage_boarding_bus(v_departure.allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  with changed as (
    update public.reservations
    set boarding_status = 'unchecked',
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = null
    where boarding_no_show_departure_id = v_departure.id
      and boarding_status = 'no_show'
    returning id
  )
  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  )
  select id, 'no_show', 'unchecked', auth.uid(), '호차 출발 완료 취소 자동 복구'
  from changed;

  update public.boarding_bus_departures
  set cancelled_at = v_now, cancelled_by = auth.uid()
  where id = v_departure.id;
end;
$$;

create or replace function public.get_boarding_management_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can view boarding management.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  if not found then return null; end if;

  return jsonb_build_object(
    'allocationId', v_allocation.id,
    'allocationName', v_allocation.allocation_name,
    'buses', (
      select coalesce(jsonb_agg(
        bus || jsonb_build_object(
          'departedAt', departure.departed_at,
          'departedBy', departure.departed_by
        ) order by bus ->> 'label'
      ), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
      left join public.boarding_bus_departures departure
        on departure.allocation_id = v_allocation.id
       and departure.bus_id = bus ->> 'id'
       and departure.cancelled_at is null
      where public.can_manage_boarding_bus(v_allocation.id, bus ->> 'id')
    ),
    'passengers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'reservationId', reservation.id,
        'name', reservation.name,
        'phone', reservation.phone,
        'district', reservation.district,
        'team', reservation.team,
        'campus', reservation.campus,
        'busNumber', reservation.confirmed_ticket ->> 'busNumber',
        'seatNumber', reservation.confirmed_ticket ->> 'seatNumber',
        'boardingStatus', reservation.boarding_status,
        'boardingNote', reservation.boarding_note,
        'boardingNoteUpdatedAt', reservation.boarding_note_updated_at,
        'boardingNoteUpdatedByName', note_actor.name,
        'updatedAt', reservation.boarding_status_updated_at,
        'updatedByName', status_actor.name
      ) order by reservation.campus, reservation.name), '[]'::jsonb)
      from public.reservations reservation
      left join public.profiles status_actor on status_actor.id = reservation.boarding_status_updated_by
      left join public.profiles note_actor on note_actor.id = reservation.boarding_note_updated_by
      where reservation.status = 'confirmed'
        and reservation.confirmed_ticket is not null
        and public.can_manage_boarding_bus_label(
          v_allocation.id,
          reservation.confirmed_ticket ->> 'busNumber'
        )
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id,
        'reservationId', event.reservation_id,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'actorType', case
          when event.note = '탑승 확인' then 'passenger'
          when event.note like '호차 출발%' then 'automatic'
          else 'boarding_manager'
        end,
        'actorName', actor.name,
        'createdAt', event.created_at,
        'note', event.note
      ) order by event.created_at desc), '[]'::jsonb)
      from public.boarding_status_events event
      left join public.profiles actor on actor.id = event.actor_id
      join public.reservations reservation on reservation.id = event.reservation_id
      where reservation.status = 'confirmed'
        and public.can_manage_boarding_bus_label(
          v_allocation.id,
          reservation.confirmed_ticket ->> 'busNumber'
        )
        and event.created_at >= coalesce(
          nullif(reservation.confirmed_ticket ->> 'confirmedAt', '')::timestamptz,
          '-infinity'::timestamptz
        )
    )
  );
end;
$$;

revoke all on function public.can_manage_boarding_bus(uuid, text) from public, anon;
revoke all on function public.can_manage_boarding_bus_label(uuid, text) from public, anon;
revoke all on function public.can_manage_current_boarding_bus_label(text) from public, anon;
revoke all on function public.can_manage_boarding_reservation(uuid) from public, anon;
revoke all on function public.get_boarding_manager_assignment_options() from public, anon;
revoke all on function public.set_boarding_manager_bus_assignments_as_global_admin(uuid, text[]) from public, anon;
revoke all on function public.get_boarding_manager_users(text) from public, anon;

grant execute on function public.can_manage_boarding_bus(uuid, text) to authenticated;
grant execute on function public.can_manage_boarding_bus_label(uuid, text) to authenticated;
grant execute on function public.can_manage_current_boarding_bus_label(text) to authenticated;
grant execute on function public.can_manage_boarding_reservation(uuid) to authenticated;
grant execute on function public.get_boarding_manager_assignment_options() to authenticated;
grant execute on function public.set_boarding_manager_bus_assignments_as_global_admin(uuid, text[]) to authenticated;
grant execute on function public.get_boarding_manager_users(text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/96_boarding_manager_bus_assignments.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/97_campus_payment_accounts.sql
-- =========================================================

-- =========================================================
-- Campus-specific payment accounts shown to bus applicants
-- =========================================================

create table if not exists public.campus_payment_accounts (
  campus_id uuid primary key references public.campuses(id) on delete cascade,
  bank_name text not null default '',
  account_number text not null default '',
  account_holder text not null default '',
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.campus_payment_accounts enable row level security;

revoke all on table public.campus_payment_accounts
  from public, anon, authenticated;

create or replace function public.get_campus_payment_account(p_campus_id uuid)
returns table (
  campus_id uuid,
  bank_name text,
  account_number text,
  account_holder text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  return query
  select account.campus_id, account.bank_name, account.account_number,
    account.account_holder
  from public.campus_payment_accounts account
  join public.campuses campus on campus.id = account.campus_id
  where account.campus_id = p_campus_id
    and campus.is_active = true;
end;
$$;

create or replace function public.get_all_campus_payment_accounts()
returns table (
  campus_id uuid,
  bank_name text,
  account_number text,
  account_holder text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view all campus payment accounts.';
  end if;

  return query
  select account.campus_id, account.bank_name, account.account_number,
    account.account_holder
  from public.campus_payment_accounts account;
end;
$$;

create or replace function public.upsert_campus_payment_account_as_global_admin(
  p_campus_id uuid,
  p_bank_name text,
  p_account_number text,
  p_account_holder text
)
returns table (
  campus_id uuid,
  bank_name text,
  account_number text,
  account_holder text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank_name text := trim(coalesce(p_bank_name, ''));
  v_account_number text := trim(coalesce(p_account_number, ''));
  v_account_holder text := trim(coalesce(p_account_holder, ''));
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can update campus payment accounts.';
  end if;

  if not exists (
    select 1 from public.campuses where id = p_campus_id and is_active = true
  ) then
    raise exception 'Active campus not found.';
  end if;

  if v_bank_name = '' or v_account_number = '' or v_account_holder = '' then
    raise exception 'Bank name, account number, and account holder are required.';
  end if;

  insert into public.campus_payment_accounts (
    campus_id, bank_name, account_number, account_holder, updated_at, updated_by
  )
  values (
    p_campus_id, v_bank_name, v_account_number, v_account_holder,
    clock_timestamp(), auth.uid()
  )
  on conflict on constraint campus_payment_accounts_pkey do update
  set bank_name = excluded.bank_name,
      account_number = excluded.account_number,
      account_holder = excluded.account_holder,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  return query
  select account.campus_id, account.bank_name, account.account_number,
    account.account_holder
  from public.campus_payment_accounts account
  where account.campus_id = p_campus_id;
end;
$$;

revoke all on function public.get_campus_payment_account(uuid) from public, anon;
revoke all on function public.get_all_campus_payment_accounts() from public, anon;
revoke all on function public.upsert_campus_payment_account_as_global_admin(
  uuid, text, text, text
) from public, anon;

grant execute on function public.get_campus_payment_account(uuid) to authenticated;
grant execute on function public.get_all_campus_payment_accounts() to authenticated;
grant execute on function public.upsert_campus_payment_account_as_global_admin(
  uuid, text, text, text
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/97_campus_payment_accounts.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/98_boarding_check_in_codes.sql
-- =========================================================

-- =========================================================
-- Bus-specific passenger self check-in codes
-- =========================================================

create table if not exists public.boarding_check_in_codes (
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  bus_id text not null,
  bus_label text not null,
  check_in_code text not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (clock_timestamp() + interval '12 hours'),
  primary key (allocation_id, bus_id),
  check (check_in_code ~ '^[0-9]{4}$')
);

alter table public.boarding_check_in_codes enable row level security;
revoke all on table public.boarding_check_in_codes
  from public, anon, authenticated;

create or replace function public.rotate_boarding_check_in_code(p_bus_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_code text;
begin
  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  if not found then raise exception 'Confirmed allocation not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You cannot manage this bus.';
  end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = p_bus_id
      and cancelled_at is null
  ) then
    raise exception 'A departed bus cannot issue a check-in code.';
  end if;

  v_code := lpad(floor(random() * 10000)::integer::text, 4, '0');

  insert into public.boarding_check_in_codes (
    allocation_id, bus_id, bus_label, check_in_code, created_at, created_by, expires_at
  )
  values (
    v_allocation.id, p_bus_id, v_bus ->> 'label', v_code,
    clock_timestamp(), auth.uid(), clock_timestamp() + interval '12 hours'
  )
  on conflict (allocation_id, bus_id) do update
  set bus_label = excluded.bus_label,
      check_in_code = excluded.check_in_code,
      created_at = excluded.created_at,
      created_by = excluded.created_by,
      expires_at = excluded.expires_at;

  return v_code;
end;
$$;

create or replace function public.submit_boarding_check_in_code(p_code text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := trim(coalesce(p_code, ''));
  v_reservation public.reservations%rowtype;
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if v_code !~ '^[0-9]{4}$' then raise exception 'Enter the 4-digit check-in code.'; end if;

  select * into v_reservation
  from public.reservations
  where user_id = v_user_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'A confirmed ticket is required before check-in.'; end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'label' = v_reservation.confirmed_ticket ->> 'busNumber';
  if v_bus is null then raise exception 'Assigned bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = v_bus ->> 'id'
      and cancelled_at is null
  ) then
    raise exception 'This bus has already departed.';
  end if;

  if not exists (
    select 1 from public.boarding_check_in_codes
    where allocation_id = v_allocation.id
      and bus_id = v_bus ->> 'id'
      and check_in_code = v_code
      and expires_at > v_now
  ) then
    raise exception 'The check-in code is incorrect or expired.';
  end if;

  if v_reservation.boarding_status <> 'boarded' then
    update public.reservations
    set boarding_status = 'boarded',
        boarding_confirmed_at = v_now,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = v_user_id,
        boarding_no_show_departure_id = null
    where id = v_reservation.id;

    insert into public.boarding_status_events (
      reservation_id, from_status, to_status, actor_id, note
    ) values (
      v_reservation.id, v_reservation.boarding_status, 'boarded', v_user_id,
      'passenger_check_in_code'
    );
  end if;

  return coalesce(v_reservation.boarding_confirmed_at, v_now);
end;
$$;

create or replace function public.get_boarding_management_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can view boarding management.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  if not found then return null; end if;

  return jsonb_build_object(
    'allocationId', v_allocation.id,
    'allocationName', v_allocation.allocation_name,
    'buses', (
      select coalesce(jsonb_agg(
        bus || jsonb_build_object(
          'departedAt', departure.departed_at,
          'departedBy', departure.departed_by,
          'checkInCode', case
            when code.expires_at > clock_timestamp() then code.check_in_code
            else null
          end,
          'checkInCodeExpiresAt', code.expires_at
        ) order by bus ->> 'label'
      ), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
      left join public.boarding_bus_departures departure
        on departure.allocation_id = v_allocation.id
       and departure.bus_id = bus ->> 'id'
       and departure.cancelled_at is null
      left join public.boarding_check_in_codes code
        on code.allocation_id = v_allocation.id
       and code.bus_id = bus ->> 'id'
      where public.can_manage_boarding_bus(v_allocation.id, bus ->> 'id')
    ),
    'passengers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'reservationId', reservation.id,
        'name', reservation.name,
        'phone', reservation.phone,
        'district', reservation.district,
        'team', reservation.team,
        'campus', reservation.campus,
        'busNumber', reservation.confirmed_ticket ->> 'busNumber',
        'seatNumber', reservation.confirmed_ticket ->> 'seatNumber',
        'boardingStatus', reservation.boarding_status,
        'boardingNote', reservation.boarding_note,
        'boardingNoteUpdatedAt', reservation.boarding_note_updated_at,
        'boardingNoteUpdatedByName', note_actor.name,
        'updatedAt', reservation.boarding_status_updated_at,
        'updatedByName', status_actor.name
      ) order by reservation.campus, reservation.name), '[]'::jsonb)
      from public.reservations reservation
      left join public.profiles status_actor on status_actor.id = reservation.boarding_status_updated_by
      left join public.profiles note_actor on note_actor.id = reservation.boarding_note_updated_by
      where reservation.status = 'confirmed'
        and reservation.confirmed_ticket is not null
        and public.can_manage_boarding_bus_label(
          v_allocation.id,
          reservation.confirmed_ticket ->> 'busNumber'
        )
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id,
        'reservationId', event.reservation_id,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'actorType', case
          when event.note in ('탑승 확인', 'passenger_check_in_code') then 'passenger'
          when event.note like '호차 출발%' then 'automatic'
          else 'boarding_manager'
        end,
        'actorName', actor.name,
        'createdAt', event.created_at,
        'note', event.note
      ) order by event.created_at desc), '[]'::jsonb)
      from public.boarding_status_events event
      left join public.profiles actor on actor.id = event.actor_id
      join public.reservations reservation on reservation.id = event.reservation_id
      where reservation.status = 'confirmed'
        and public.can_manage_boarding_bus_label(
          v_allocation.id,
          reservation.confirmed_ticket ->> 'busNumber'
        )
        and event.created_at >= coalesce(
          nullif(reservation.confirmed_ticket ->> 'confirmedAt', '')::timestamptz,
          '-infinity'::timestamptz
        )
    )
  );
end;
$$;

revoke all on function public.rotate_boarding_check_in_code(text) from public, anon;
revoke all on function public.submit_boarding_check_in_code(text) from public, anon;
revoke all on function public.confirm_my_boarding() from public, anon, authenticated;
grant execute on function public.rotate_boarding_check_in_code(text) to authenticated;
grant execute on function public.submit_boarding_check_in_code(text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/98_boarding_check_in_codes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/99_external_participants.sql
-- =========================================================

-- =========================================================
-- External district participants
-- - Seoul participants keep using the registered organization hierarchy.
-- - External participants enter district/campus text without a team.
-- - External participant payments can only be managed by global admins.
-- =========================================================

alter table public.profiles
  add column if not exists affiliation_type text not null default 'seoul',
  add column if not exists coordinator_name text,
  add column if not exists coordinator_phone text;

alter table public.profiles
  drop constraint if exists profiles_affiliation_type_check;

alter table public.profiles
  add constraint profiles_affiliation_type_check
  check (affiliation_type in ('seoul', 'external'));

alter table public.reservations
  add column if not exists affiliation_type text not null default 'seoul',
  add column if not exists coordinator_name text,
  add column if not exists coordinator_phone text;

alter table public.reservations
  drop constraint if exists reservations_affiliation_type_check;

alter table public.reservations
  add constraint reservations_affiliation_type_check
  check (affiliation_type in ('seoul', 'external'));

create index if not exists idx_profiles_affiliation_type
  on public.profiles(affiliation_type);

create index if not exists idx_reservations_affiliation_type
  on public.reservations(affiliation_type);

create or replace function public.prevent_locked_affiliation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    old.district_id is distinct from new.district_id
    or old.district is distinct from new.district
    or old.team_id is distinct from new.team_id
    or old.team is distinct from new.team
    or old.campus_id is distinct from new.campus_id
    or old.campus is distinct from new.campus
    or old.affiliation_type is distinct from new.affiliation_type
    or old.coordinator_name is distinct from new.coordinator_name
    or old.coordinator_phone is distinct from new.coordinator_phone
  )
  and exists (
    select 1 from public.reservations reservation
    where reservation.user_id = old.id
      and reservation.status = 'confirmed'
  )
  and not public.is_global_admin() then
    raise exception 'Confirmed participant affiliation can only be changed by a global admin.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_locked_affiliation_change on public.profiles;
create trigger prevent_locked_affiliation_change
before update on public.profiles
for each row execute function public.prevent_locked_affiliation_change();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliation_type text :=
    case
      when new.raw_user_meta_data ->> 'affiliation_type' = 'external'
        then 'external'
      else 'seoul'
    end;
begin
  insert into public.profiles (
    id, email, name, phone,
    district_id, district, team_id, team, campus_id, campus,
    affiliation_type, coordinator_name, coordinator_phone,
    account_source, updated_at
  )
  values (
    new.id,
    lower(new.email),
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'phone',
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'district_id', '')::uuid end,
    new.raw_user_meta_data ->> 'district',
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'team_id', '')::uuid end,
    case when v_affiliation_type = 'seoul'
      then new.raw_user_meta_data ->> 'team' else '' end,
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'campus_id', '')::uuid end,
    new.raw_user_meta_data ->> 'campus',
    v_affiliation_type,
    case when v_affiliation_type = 'external'
      then new.raw_user_meta_data ->> 'coordinator_name' end,
    case when v_affiliation_type = 'external'
      then new.raw_user_meta_data ->> 'coordinator_phone' end,
    case
      when new.raw_user_meta_data ->> 'account_source' = 'admin_created'
        then 'admin_created'
      else 'self_signup'
    end,
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
    affiliation_type = excluded.affiliation_type,
    coordinator_name = excluded.coordinator_name,
    coordinator_phone = excluded.coordinator_phone,
    account_source = excluded.account_source,
    updated_at = now();

  return new;
end;
$$;

drop function if exists public.save_user_reservation(
  text, text, text, text, text, jsonb, jsonb
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
  v_affiliation_type text :=
    case when p_data ->> 'affiliationType' = 'external' then 'external' else 'seoul' end;
  v_coordinator_name text := nullif(trim(p_data ->> 'coordinatorName'), '');
  v_coordinator_phone text := nullif(trim(p_data ->> 'coordinatorPhone'), '');
  v_data jsonb;
  v_reservation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication failed.';
  end if;

  if nullif(trim(p_name), '') is null
    or nullif(trim(p_phone), '') is null
    or nullif(trim(p_district), '') is null
    or nullif(trim(p_campus), '') is null
    or (v_affiliation_type = 'seoul' and nullif(trim(p_team), '') is null)
    or (v_affiliation_type = 'external' and (
      v_coordinator_name is null or v_coordinator_phone is null
    )) then
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
          (stations.id::text = p_station_preferences -> 0 -> 'station' ->> 'id'
            and stations.name = p_station_preferences -> 0 -> 'station' ->> 'name')
          or
          (stations.id::text = p_station_preferences -> 1 -> 'station' ->> 'id'
            and stations.name = p_station_preferences -> 1 -> 'station' ->> 'name')
        )
    ) <> 2 then
    raise exception 'Station preferences contain invalid or duplicate stations.';
  end if;

  if jsonb_typeof(coalesce(p_data, 'null'::jsonb)) <> 'object' then
    raise exception 'Reservation data must be a JSON object.';
  end if;

  select value into v_deadline_value
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_value is null then
    raise exception 'Reservation deadline setting is missing.';
  end if;

  v_now := clock_timestamp();
  v_deadline_at := nullif(v_deadline_value ->> 'deadline_at', '')::timestamptz;

  if v_deadline_at is not null and v_deadline_at <= v_now then
    raise exception 'Reservation deadline has passed.';
  end if;

  if v_affiliation_type = 'seoul' then
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
  end if;

  v_data := p_data || jsonb_build_object(
    'name', trim(p_name),
    'phone', trim(p_phone),
    'district', trim(p_district),
    'team', case when v_affiliation_type = 'external' then '' else trim(p_team) end,
    'campus', trim(p_campus),
    'affiliationType', v_affiliation_type,
    'coordinatorName', v_coordinator_name,
    'coordinatorPhone', v_coordinator_phone,
    'stationPreferences', p_station_preferences,
    'status', 'requested',
    'confirmedTicket', null,
    'requestedAt', v_now::text
  );

  insert into public.reservations as target (
    user_id, name, phone,
    district_id, district, team_id, team, campus_id, campus,
    affiliation_type, coordinator_name, coordinator_phone,
    station_preferences, status, confirmed_ticket, data, created_at, updated_at
  )
  values (
    v_user_id, trim(p_name), trim(p_phone),
    v_district_id, trim(p_district), v_team_id,
    case when v_affiliation_type = 'external' then '' else trim(p_team) end,
    v_campus_id, trim(p_campus),
    v_affiliation_type, v_coordinator_name, v_coordinator_phone,
    p_station_preferences, 'requested', null, v_data, v_now, v_now
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
    affiliation_type = excluded.affiliation_type,
    coordinator_name = excluded.coordinator_name,
    coordinator_phone = excluded.coordinator_phone,
    station_preferences = excluded.station_preferences,
    status = 'requested',
    confirmed_ticket = null,
    data = jsonb_set(
      jsonb_set(
        excluded.data,
        '{requestedAt}',
        case
          when target.status = 'cancelled' then to_jsonb(v_now::text)
          else coalesce(target.data -> 'requestedAt', to_jsonb(target.created_at::text))
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

  update public.profiles
  set
    name = trim(p_name),
    phone = trim(p_phone),
    district_id = v_district_id,
    district = trim(p_district),
    team_id = v_team_id,
    team = case when v_affiliation_type = 'external' then '' else trim(p_team) end,
    campus_id = v_campus_id,
    campus = trim(p_campus),
    affiliation_type = v_affiliation_type,
    coordinator_name = v_coordinator_name,
    coordinator_phone = v_coordinator_phone,
    updated_at = v_now
  where id = v_user_id;

  return v_reservation_id;
end;
$$;

revoke all on function public.save_user_reservation(
  text, text, text, text, text, jsonb, jsonb
) from public, anon;

grant execute on function public.save_user_reservation(
  text, text, text, text, text, jsonb, jsonb
) to authenticated;

create or replace function public.enforce_external_payment_global_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.reservations reservation
    where reservation.id = new.reservation_id
      and reservation.affiliation_type = 'external'
  ) and not public.is_global_admin() then
    raise exception 'Only global admins can manage external participant payments.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_external_payment_global_admin on public.payments;
create trigger enforce_external_payment_global_admin
before insert or update on public.payments
for each row execute function public.enforce_external_payment_global_admin();

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/99_external_participants.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/100_four_digit_boarding_check_in_codes.sql
-- =========================================================

-- =========================================================
-- Convert passenger self check-in codes from six to four digits
-- =========================================================

delete from public.boarding_check_in_codes
where check_in_code !~ '^[0-9]{4}$';

alter table public.boarding_check_in_codes
  drop constraint if exists boarding_check_in_codes_check_in_code_check;

alter table public.boarding_check_in_codes
  add constraint boarding_check_in_codes_check_in_code_check
  check (check_in_code ~ '^[0-9]{4}$');

create or replace function public.rotate_boarding_check_in_code(p_bus_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_code text;
begin
  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  if not found then raise exception 'Confirmed allocation not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You cannot manage this bus.';
  end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = p_bus_id
      and cancelled_at is null
  ) then
    raise exception 'A departed bus cannot issue a check-in code.';
  end if;

  v_code := lpad(floor(random() * 10000)::integer::text, 4, '0');

  insert into public.boarding_check_in_codes (
    allocation_id, bus_id, bus_label, check_in_code, created_at, created_by, expires_at
  )
  values (
    v_allocation.id, p_bus_id, v_bus ->> 'label', v_code,
    clock_timestamp(), auth.uid(), clock_timestamp() + interval '12 hours'
  )
  on conflict (allocation_id, bus_id) do update
  set bus_label = excluded.bus_label,
      check_in_code = excluded.check_in_code,
      created_at = excluded.created_at,
      created_by = excluded.created_by,
      expires_at = excluded.expires_at;

  return v_code;
end;
$$;

create or replace function public.submit_boarding_check_in_code(p_code text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := trim(coalesce(p_code, ''));
  v_reservation public.reservations%rowtype;
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if v_code !~ '^[0-9]{4}$' then raise exception 'Enter the 4-digit check-in code.'; end if;

  select * into v_reservation
  from public.reservations
  where user_id = v_user_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'A confirmed ticket is required before check-in.'; end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'label' = v_reservation.confirmed_ticket ->> 'busNumber';
  if v_bus is null then raise exception 'Assigned bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = v_bus ->> 'id'
      and cancelled_at is null
  ) then
    raise exception 'This bus has already departed.';
  end if;

  if not exists (
    select 1 from public.boarding_check_in_codes
    where allocation_id = v_allocation.id
      and bus_id = v_bus ->> 'id'
      and check_in_code = v_code
      and expires_at > v_now
  ) then
    raise exception 'The check-in code is incorrect or expired.';
  end if;

  if v_reservation.boarding_status <> 'boarded' then
    update public.reservations
    set boarding_status = 'boarded',
        boarding_confirmed_at = v_now,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = v_user_id,
        boarding_no_show_departure_id = null
    where id = v_reservation.id;

    insert into public.boarding_status_events (
      reservation_id, from_status, to_status, actor_id, note
    ) values (
      v_reservation.id, v_reservation.boarding_status, 'boarded', v_user_id,
      'passenger_check_in_code'
    );
  end if;

  return coalesce(v_reservation.boarding_confirmed_at, v_now);
end;
$$;

-- =========================================================
-- END sql/setup/100_four_digit_boarding_check_in_codes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/101_disable_public_email_exists.sql
-- =========================================================

-- Account existence must not be exposed to browser clients.
revoke all on function public.email_exists(text) from anon, authenticated;

create or replace function public.validate_profile_organization_membership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.affiliation_type = 'external' then
    if new.district_id is not null
      or new.team_id is not null
      or new.campus_id is not null then
      raise exception 'External profiles cannot reference Seoul organization IDs.';
    end if;

    return new;
  end if;

  if new.district_id is null
    or new.team_id is null
    or new.campus_id is null
    or not exists (
      select 1
      from public.teams
      join public.campuses
        on campuses.team_id = teams.id
      where teams.id = new.team_id
        and teams.district_id = new.district_id
        and campuses.id = new.campus_id
    ) then
    raise exception 'District, team, and campus must belong to the same organization path.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_profile_organization_membership
on public.profiles;
create trigger validate_profile_organization_membership
before insert or update of affiliation_type, district_id, team_id, campus_id
on public.profiles
for each row execute function public.validate_profile_organization_membership();

-- =========================================================
-- END sql/setup/101_disable_public_email_exists.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/102_invalidate_optimization_cache_on_reservation_changes.sql
-- =========================================================

-- =========================================================
-- Invalidate reusable optimization results after any active reservation change
-- =========================================================

create or replace function public.create_uncached_allocation_optimization_job()
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
  v_active_reservation_count integer;
  v_active_reservations_hash text;
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

  select
    count(*)::integer,
    md5(
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', reservation.id::text,
            'status', reservation.status,
            'updated_at', reservation.updated_at
          )
          order by reservation.id
        )::text,
        '[]'
      )
    )
  into v_active_reservation_count, v_active_reservations_hash
  from public.reservations reservation
  where reservation.status is distinct from 'cancelled';

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
      and not coalesce(reservation.data ? 'remainingSeatClaim', false)
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
      and not coalesce(reservation.data ? 'remainingSeatClaim', false)
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
    'passengers', v_passengers,
    'active_reservation_count', v_active_reservation_count,
    'active_reservations_hash', v_active_reservations_hash
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
      'active_reservation_count', v_active_reservation_count,
      'input_hash', md5(v_snapshot::text)
    )
  );

  return v_job_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Allocation optimizer configuration contains invalid numbers.';
end;
$$;

revoke all on function public.create_uncached_allocation_optimization_job()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/102_invalidate_optimization_cache_on_reservation_changes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/103_show_reservation_changes_on_optimization_jobs.sql
-- =========================================================

-- =========================================================
-- Show whether reservations changed after an optimization job was created
-- =========================================================

create or replace function public.get_active_reservation_optimization_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'count', count(*)::integer,
    'hash', md5(
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', reservation.id::text,
            'status', reservation.status,
            'updated_at', reservation.updated_at
          )
          order by reservation.id
        )::text,
        '[]'
      )
    )
  )
  from public.reservations reservation
  where reservation.status is distinct from 'cancelled';
$$;

revoke all on function public.get_active_reservation_optimization_state()
  from public, anon, authenticated;

drop function if exists public.get_allocation_optimization_job(uuid);
create function public.get_allocation_optimization_job(p_job_id uuid)
returns table (
  id uuid, optimization_scope text, source_job_id uuid, resume_from_job_id uuid,
  detailed_settings jsonb, status text, requested_at timestamptz,
  started_at timestamptz, completed_at timestamptz, progress integer,
  current_phase text, elapsed_seconds integer, best_known_bus_count integer,
  proven_bus_count integer, result_reused boolean, result jsonb,
  diagnostics jsonb, error_message text, reservations_changed boolean,
  snapshot_active_reservation_count integer, current_active_reservation_count integer
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_current_state jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;

  v_current_state := public.get_active_reservation_optimization_state();

  return query
  select job.id, job.optimization_scope, job.source_job_id, job.resume_from_job_id,
    job.detailed_settings, job.status, job.requested_at, job.started_at,
    job.completed_at, job.progress, job.current_phase, job.elapsed_seconds,
    job.best_known_bus_count, job.proven_bus_count, job.result_reused,
    job.result, job.diagnostics, job.error_message,
    coalesce(job.input_snapshot ->> 'active_reservations_hash', '')
      <> coalesce(v_current_state ->> 'hash', ''),
    (job.input_snapshot ->> 'active_reservation_count')::integer,
    (v_current_state ->> 'count')::integer
  from public.allocation_optimization_jobs job
  where job.id = p_job_id;
end;
$$;

drop function if exists public.get_recent_allocation_optimization_jobs(integer);
create function public.get_recent_allocation_optimization_jobs(p_limit integer default 20)
returns table (
  id uuid, optimization_scope text, source_job_id uuid, resume_from_job_id uuid,
  detailed_settings jsonb, status text, requested_at timestamptz,
  started_at timestamptz, completed_at timestamptz, progress integer,
  current_phase text, elapsed_seconds integer, best_known_bus_count integer,
  proven_bus_count integer, result_reused boolean, error_message text,
  reservations_changed boolean, snapshot_active_reservation_count integer,
  current_active_reservation_count integer
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_current_state jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;

  v_current_state := public.get_active_reservation_optimization_state();

  return query
  select job.id, job.optimization_scope, job.source_job_id, job.resume_from_job_id,
    job.detailed_settings, job.status, job.requested_at, job.started_at,
    job.completed_at, job.progress, job.current_phase, job.elapsed_seconds,
    job.best_known_bus_count, job.proven_bus_count, job.result_reused,
    job.error_message,
    coalesce(job.input_snapshot ->> 'active_reservations_hash', '')
      <> coalesce(v_current_state ->> 'hash', ''),
    (job.input_snapshot ->> 'active_reservation_count')::integer,
    (v_current_state ->> 'count')::integer
  from public.allocation_optimization_jobs job
  order by job.requested_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

grant execute on function public.get_allocation_optimization_job(uuid)
  to authenticated;
grant execute on function public.get_recent_allocation_optimization_jobs(integer)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/103_show_reservation_changes_on_optimization_jobs.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/104_remaining_seat_allocation_passenger_source.sql
-- =========================================================

-- Keep remaining-seat passenger metadata in allocation workspaces.

create or replace function public.normalize_allocation_remaining_seat_passengers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passengers jsonb;
begin
  if jsonb_typeof(new.allocation_data -> 'passengers') <> 'array' then
    return new;
  end if;

  select coalesce(
    jsonb_agg(
      case
        when reservation.data ? 'remainingSeatClaim' then
          entry.passenger || jsonb_build_object(
            'source', 'remaining_seat',
            'remainingSeatStatus',
              coalesce(
                reservation.data #>> '{remainingSeatClaim,status}',
                entry.passenger ->> 'remainingSeatStatus',
                'pending_payment'
              ),
            'preferences',
              jsonb_build_array(
                coalesce(
                  reservation.data #>> '{remainingSeatClaim,destination}',
                  entry.passenger #>> '{preferences,0}'
                )
              )
          )
        else entry.passenger
      end
      order by entry.ordinality
    ),
    '[]'::jsonb
  )
  into v_passengers
  from jsonb_array_elements(new.allocation_data -> 'passengers')
    with ordinality as entry(passenger, ordinality)
  left join public.reservations reservation
    on reservation.id::text = entry.passenger ->> 'reservationId';

  new.allocation_data := jsonb_set(
    new.allocation_data,
    '{passengers}',
    v_passengers,
    true
  );
  return new;
end;
$$;

drop trigger if exists normalize_allocation_remaining_seat_passengers
  on public.bus_allocations;
create trigger normalize_allocation_remaining_seat_passengers
before insert or update of allocation_data on public.bus_allocations
for each row execute function public.normalize_allocation_remaining_seat_passengers();

update public.bus_allocations
set allocation_data = allocation_data
where exists (
  select 1
  from jsonb_array_elements(
    coalesce(bus_allocations.allocation_data -> 'passengers', '[]'::jsonb)
  ) passenger
  join public.reservations reservation
    on reservation.id::text = passenger ->> 'reservationId'
  where reservation.data ? 'remainingSeatClaim'
);

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/104_remaining_seat_allocation_passenger_source.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/105_lock_allocation_planning_while_confirmed.sql
-- =========================================================

-- Lock allocation planning while a confirmed allocation exists.

create or replace function public.assert_allocation_planning_unlocked()
returns void language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.allocation_confirmation_write', true) = 'on' then
    return;
  end if;

  if exists (
    select 1 from public.bus_allocations
    where allocation_data ->> 'status' = 'confirmed'
  ) then
    raise exception 'Cancel the confirmed allocation before using allocation planning.';
  end if;
end;
$$;

revoke all on function public.assert_allocation_planning_unlocked()
  from public, anon, authenticated;

create or replace function public.lock_allocation_planning_writes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.bus_allocations
    where allocation_data ->> 'status' = 'confirmed'
  ) then
    if tg_op = 'UPDATE' and old.allocation_data ->> 'status' = 'confirmed' then
      return new;
    end if;
    raise exception 'Cancel the confirmed allocation before using allocation planning.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists lock_allocation_planning_bus_writes on public.bus_allocations;
create trigger lock_allocation_planning_bus_writes
before insert or update or delete on public.bus_allocations
for each row execute function public.lock_allocation_planning_writes();

create or replace function public.lock_allocation_optimization_job_creation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_allocation_planning_unlocked();
  return new;
end;
$$;

drop trigger if exists lock_allocation_optimization_job_creation
  on public.allocation_optimization_jobs;
create trigger lock_allocation_optimization_job_creation
before insert on public.allocation_optimization_jobs
for each row execute function public.lock_allocation_optimization_job_creation();

do $$
begin
  if to_regprocedure(
    'public.save_confirmed_allocation_workspace_v3_unlocked(uuid,bigint,jsonb,integer,integer,text,text,jsonb)'
  ) is null then
    alter function public.save_confirmed_allocation_workspace_v3(
      uuid, bigint, jsonb, integer, integer, text, text, jsonb
    ) rename to save_confirmed_allocation_workspace_v3_unlocked;
  end if;
end;
$$;

revoke all on function public.save_confirmed_allocation_workspace_v3_unlocked(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from public, anon, authenticated;

create or replace function public.save_confirmed_allocation_workspace_v3(
  p_allocation_id uuid, p_expected_revision bigint, p_allocation_data jsonb,
  p_total_cost integer, p_total_capacity integer, p_version_id text,
  p_version_label text, p_version_changes jsonb
)
returns setof public.bus_allocations
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.bus_allocations
    where id = p_allocation_id and allocation_data ->> 'status' = 'confirmed'
  ) then
    raise exception 'Confirmed allocation is locked until confirmation is cancelled.';
  end if;

  perform set_config('app.allocation_confirmation_write', 'on', true);

  return query select *
  from public.save_confirmed_allocation_workspace_v3_unlocked(
    p_allocation_id, p_expected_revision, p_allocation_data, p_total_cost,
    p_total_capacity, p_version_id, p_version_label, p_version_changes
  );
end;
$$;

revoke all on function public.save_confirmed_allocation_workspace_v3(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from public, anon;
grant execute on function public.save_confirmed_allocation_workspace_v3(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) to authenticated;

revoke execute on function public.save_confirmed_allocation_workspace(
  uuid, bigint, jsonb, integer, integer
) from authenticated;
revoke execute on function public.save_confirmed_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from authenticated;

do $$
begin
  if to_regprocedure(
    'public.save_allocation_optimizer_config_unlocked(integer,integer,integer)'
  ) is null then
    alter function public.save_allocation_optimizer_config(integer, integer, integer)
      rename to save_allocation_optimizer_config_unlocked;
  end if;
end;
$$;

revoke all on function public.save_allocation_optimizer_config_unlocked(
  integer, integer, integer
) from public, anon, authenticated;

create or replace function public.save_allocation_optimizer_config(
  p_capacity integer,
  p_price integer,
  p_recommended_minimum_passengers integer
)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_allocation_planning_unlocked();
  return public.save_allocation_optimizer_config_unlocked(
    p_capacity, p_price, p_recommended_minimum_passengers
  );
end;
$$;

revoke all on function public.save_allocation_optimizer_config(
  integer, integer, integer
) from public, anon;
grant execute on function public.save_allocation_optimizer_config(
  integer, integer, integer
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/105_lock_allocation_planning_while_confirmed.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/106_canonical_boarding_bus_id.sql
-- =========================================================

-- Use immutable bus IDs for boarding authorization and passenger check-in.

create or replace function public.validate_allocation_bus_identifiers()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if jsonb_typeof(new.allocation_data -> 'buses') <> 'array' then
    return new;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.allocation_data -> 'buses') bus
    where nullif(btrim(bus ->> 'id'), '') is null
      or nullif(btrim(bus ->> 'label'), '') is null
  ) then
    raise exception 'Every bus needs a non-empty ID and label.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.allocation_data -> 'buses') bus
    group by btrim(bus ->> 'id')
    having count(*) > 1
  ) then
    raise exception 'Duplicate bus IDs exist in the allocation.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.allocation_data -> 'buses') bus
    group by btrim(bus ->> 'label')
    having count(*) > 1
  ) then
    raise exception 'Duplicate bus labels exist in the allocation.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_allocation_bus_identifiers
  on public.bus_allocations;
create trigger validate_allocation_bus_identifiers
before insert or update of allocation_data on public.bus_allocations
for each row execute function public.validate_allocation_bus_identifiers();

create or replace function public.get_confirmed_ticket_bus_id(
  p_reservation_id uuid,
  p_ticket jsonb
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(p_ticket ->> 'busId'), ''),
    (
      select nullif(btrim(passenger ->> 'busId'), '')
      from public.bus_allocations allocation
      cross join lateral jsonb_array_elements(allocation.allocation_data -> 'passengers')
        passenger
      where allocation.allocation_data ->> 'status' = 'confirmed'
        and passenger ->> 'reservationId' = p_reservation_id::text
      limit 1
    ),
    (
      select nullif(btrim(bus ->> 'id'), '')
      from public.bus_allocations allocation
      cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
      where allocation.allocation_data ->> 'status' = 'confirmed'
        and btrim(bus ->> 'label') = btrim(p_ticket ->> 'busNumber')
      limit 1
    )
  );
$$;

create or replace function public.set_reservation_confirmed_ticket_bus_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bus_id text;
begin
  if new.status <> 'confirmed' or new.confirmed_ticket is null then
    return new;
  end if;

  v_bus_id := public.get_confirmed_ticket_bus_id(new.id, new.confirmed_ticket);
  if v_bus_id is null then
    return new;
  end if;

  new.confirmed_ticket := jsonb_set(
    new.confirmed_ticket,
    '{busId}',
    to_jsonb(v_bus_id),
    true
  );
  new.data := jsonb_set(
    coalesce(new.data, '{}'::jsonb),
    '{confirmedTicket}',
    new.confirmed_ticket,
    true
  );
  return new;
end;
$$;

drop trigger if exists set_reservation_confirmed_ticket_bus_id
  on public.reservations;
create trigger set_reservation_confirmed_ticket_bus_id
before insert or update of status, confirmed_ticket, data on public.reservations
for each row execute function public.set_reservation_confirmed_ticket_bus_id();

create or replace function public.backfill_confirmed_allocation_ticket_bus_ids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.allocation_data ->> 'status' <> 'confirmed' then
    return new;
  end if;

  with assignments as (
    select
      (passenger ->> 'reservationId')::uuid as reservation_id,
      bus ->> 'id' as bus_id
    from jsonb_array_elements(new.allocation_data -> 'passengers') passenger
    join jsonb_array_elements(new.allocation_data -> 'buses') bus
      on bus ->> 'id' = passenger ->> 'busId'
  )
  update public.reservations reservation
  set
    confirmed_ticket = jsonb_set(
      reservation.confirmed_ticket,
      '{busId}',
      to_jsonb(assignments.bus_id),
      true
    ),
    data = jsonb_set(
      coalesce(reservation.data, '{}'::jsonb),
      '{confirmedTicket}',
      jsonb_set(
        reservation.confirmed_ticket,
        '{busId}',
        to_jsonb(assignments.bus_id),
        true
      ),
      true
    )
  from assignments
  where reservation.id = assignments.reservation_id
    and reservation.status = 'confirmed'
    and reservation.confirmed_ticket is not null
    and reservation.confirmed_ticket ->> 'busId' is distinct from assignments.bus_id;

  return new;
end;
$$;

drop trigger if exists backfill_confirmed_allocation_ticket_bus_ids
  on public.bus_allocations;
create trigger backfill_confirmed_allocation_ticket_bus_ids
after insert or update of allocation_data on public.bus_allocations
for each row execute function public.backfill_confirmed_allocation_ticket_bus_ids();

with assignments as (
  select
    (passenger ->> 'reservationId')::uuid as reservation_id,
    bus ->> 'id' as bus_id
  from public.bus_allocations allocation
  cross join lateral jsonb_array_elements(allocation.allocation_data -> 'passengers')
    passenger
  join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
    on bus ->> 'id' = passenger ->> 'busId'
  where allocation.allocation_data ->> 'status' = 'confirmed'
)
update public.reservations reservation
set
  confirmed_ticket = jsonb_set(
    reservation.confirmed_ticket,
    '{busId}',
    to_jsonb(assignments.bus_id),
    true
  ),
  data = jsonb_set(
    coalesce(reservation.data, '{}'::jsonb),
    '{confirmedTicket}',
    jsonb_set(
      reservation.confirmed_ticket,
      '{busId}',
      to_jsonb(assignments.bus_id),
      true
    ),
    true
  )
from assignments
where reservation.id = assignments.reservation_id
  and reservation.status = 'confirmed'
  and reservation.confirmed_ticket is not null
  and reservation.confirmed_ticket ->> 'busId' is distinct from assignments.bus_id;

create or replace function public.can_manage_boarding_bus_label(
  p_allocation_id uuid,
  p_bus_label text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_global_admin()
    or exists (
      select 1
      from public.bus_allocations allocation
      cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
      where allocation.id = p_allocation_id
        and btrim(bus ->> 'label') = btrim(p_bus_label)
        and public.can_manage_boarding_bus(p_allocation_id, bus ->> 'id')
    );
$$;

create or replace function public.can_manage_boarding_reservation(
  p_reservation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reservations reservation
    join public.bus_allocations allocation
      on allocation.allocation_data ->> 'status' = 'confirmed'
    where reservation.id = p_reservation_id
      and public.can_manage_boarding_bus(
        allocation.id,
        public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket)
      )
  );
$$;

drop policy if exists "Boarding managers can view reservations" on public.reservations;
create policy "Boarding managers can view reservations"
on public.reservations for select to authenticated
using (public.can_manage_boarding_reservation(reservations.id));

create or replace function public.set_passenger_boarding_status(
  p_reservation_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.reservations%rowtype;
  v_allocation_id uuid;
  v_bus_id text;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;

  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select * into v_current from public.reservations
  where id = p_reservation_id and status = 'confirmed' and confirmed_ticket is not null
  for update;
  if not found then raise exception 'Confirmed passenger not found.'; end if;

  v_bus_id := public.get_confirmed_ticket_bus_id(v_current.id, v_current.confirmed_ticket);
  if not public.can_manage_boarding_bus(v_allocation_id, v_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if v_current.boarding_status = p_status then return; end if;
  if p_status = 'no_show' and not exists (
    select 1
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_allocation_id
      and departure.cancelled_at is null
      and departure.bus_id = v_bus_id
  ) then
    raise exception 'No-show status is available after bus departure.';
  end if;

  update public.reservations
  set boarding_status = p_status,
      boarding_confirmed_at = case when p_status = 'boarded' then v_now else null end,
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null
  where id = p_reservation_id;

  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  ) values (
    p_reservation_id, v_current.boarding_status, p_status, auth.uid(), 'boarding_status_changed'
  );
end;
$$;

create or replace function public.update_passenger_boarding_note(
  p_reservation_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding notes.';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'Boarding notes must be 500 characters or fewer.';
  end if;
  if not public.can_manage_boarding_reservation(p_reservation_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  update public.reservations
  set boarding_note = v_note,
      boarding_note_updated_at = clock_timestamp(),
      boarding_note_updated_by = auth.uid()
  where id = p_reservation_id
    and status = 'confirmed'
    and confirmed_ticket is not null;

  if not found then raise exception 'Confirmed passenger not found.'; end if;
end;
$$;

create or replace function public.mark_boarding_bus_departed(p_bus_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_departure_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can mark departure.';
  end if;

  select * into v_allocation from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Bus not found.'; end if;

  insert into public.boarding_bus_departures (
    allocation_id, bus_id, bus_label, departed_at, departed_by
  ) values (
    v_allocation.id, p_bus_id, v_bus ->> 'label', v_now, auth.uid()
  ) returning id into v_departure_id;

  with changed as (
    update public.reservations reservation
    set boarding_status = 'no_show',
        boarding_confirmed_at = null,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = v_departure_id
    where reservation.status = 'confirmed'
      and reservation.boarding_status = 'unchecked'
      and public.get_confirmed_ticket_bus_id(
        reservation.id,
        reservation.confirmed_ticket
      ) = p_bus_id
    returning reservation.id
  )
  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  )
  select id, 'unchecked', 'no_show', auth.uid(), 'bus_departed_auto_no_show'
  from changed;

  return v_departure_id;
end;
$$;

create or replace function public.submit_boarding_check_in_code(p_code text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := trim(coalesce(p_code, ''));
  v_reservation public.reservations%rowtype;
  v_allocation public.bus_allocations%rowtype;
  v_bus_id text;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if v_code !~ '^[0-9]{4}$' then raise exception 'Enter the 4-digit check-in code.'; end if;

  select * into v_reservation
  from public.reservations
  where user_id = v_user_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'A confirmed ticket is required before check-in.'; end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  v_bus_id := public.get_confirmed_ticket_bus_id(
    v_reservation.id,
    v_reservation.confirmed_ticket
  );
  if v_bus_id is null then raise exception 'Assigned bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = v_bus_id
      and cancelled_at is null
  ) then
    raise exception 'This bus has already departed.';
  end if;

  if not exists (
    select 1 from public.boarding_check_in_codes
    where allocation_id = v_allocation.id
      and bus_id = v_bus_id
      and check_in_code = v_code
      and expires_at > v_now
  ) then
    raise exception 'The check-in code is incorrect or expired.';
  end if;

  if v_reservation.boarding_status <> 'boarded' then
    update public.reservations
    set boarding_status = 'boarded',
        boarding_confirmed_at = v_now,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = v_user_id,
        boarding_no_show_departure_id = null
    where id = v_reservation.id;

    insert into public.boarding_status_events (
      reservation_id, from_status, to_status, actor_id, note
    ) values (
      v_reservation.id, v_reservation.boarding_status, 'boarded', v_user_id,
      'passenger_check_in_code'
    );
  end if;

  return coalesce(v_reservation.boarding_confirmed_at, v_now);
end;
$$;

revoke all on function public.validate_allocation_bus_identifiers()
  from public, anon, authenticated;
revoke all on function public.get_confirmed_ticket_bus_id(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.set_reservation_confirmed_ticket_bus_id()
  from public, anon, authenticated;
revoke all on function public.backfill_confirmed_allocation_ticket_bus_ids()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/106_canonical_boarding_bus_id.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/107_fix_confirmed_allocation_name.sql
-- =========================================================

-- Keep the active confirmed allocation name canonical.

create or replace function public.normalize_confirmed_allocation_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.allocation_data ->> 'status' = 'confirmed' then
    new.allocation_name := '확정 배차안';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_confirmed_allocation_name
  on public.bus_allocations;
create trigger normalize_confirmed_allocation_name
before insert or update of allocation_name, allocation_data
on public.bus_allocations
for each row execute function public.normalize_confirmed_allocation_name();

update public.bus_allocations
set allocation_name = '확정 배차안'
where allocation_data ->> 'status' = 'confirmed'
  and allocation_name <> '확정 배차안';

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/107_fix_confirmed_allocation_name.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/108_enforce_optimizer_maximum_bus_count.sql
-- =========================================================

-- Include the configured bus option maximum in every new optimization snapshot.

create or replace function public.get_allocation_optimizer_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config jsonb;
  v_maximum_buses integer;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimizer configuration.';
  end if;

  select value
  into v_config
  from public.app_settings
  where key = 'allocation_optimizer_config';

  select max_count
  into v_maximum_buses
  from public.bus_options
  order by created_at desc, id desc
  limit 1;

  v_config := coalesce(
    v_config,
    jsonb_build_object(
      'capacity', 45,
      'price', 0,
      'recommended_minimum_passengers', 36
    )
  );

  return jsonb_set(
    v_config,
    '{maximum_buses}',
    to_jsonb(coalesce(v_maximum_buses, 999)),
    true
  );
end;
$$;

revoke all on function public.get_allocation_optimizer_config()
  from public, anon;
grant execute on function public.get_allocation_optimizer_config()
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/108_enforce_optimizer_maximum_bus_count.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/109_canonical_reservation_data.sql
-- =========================================================

-- Keep reservations columns authoritative while preserving extension data in data.

create or replace function public.sync_reservation_data_from_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.data := (
    case
      when jsonb_typeof(new.data) = 'object' then new.data
      else '{}'::jsonb
    end
  ) || jsonb_build_object(
    'id', new.id::text,
    'name', new.name,
    'phone', new.phone,
    'district', new.district,
    'team', new.team,
    'campus', new.campus,
    'affiliationType', new.affiliation_type,
    'coordinatorName', new.coordinator_name,
    'coordinatorPhone', new.coordinator_phone,
    'stationPreferences', coalesce(new.station_preferences, '[]'::jsonb),
    'status', new.status,
    'confirmedTicket', new.confirmed_ticket,
    'boardingConfirmedAt', new.boarding_confirmed_at,
    'requestedAt', new.created_at::text,
    'updatedAt', new.updated_at::text
  );

  return new;
end;
$$;

drop trigger if exists zz_sync_reservation_data_from_columns
  on public.reservations;
create trigger zz_sync_reservation_data_from_columns
before insert or update on public.reservations
for each row execute function public.sync_reservation_data_from_columns();

-- Existing extension keys, including remainingSeatClaim, are retained by the trigger.
update public.reservations
set data = coalesce(data, '{}'::jsonb);

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/109_canonical_reservation_data.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/110_canonical_reservation_organization_scope.sql
-- =========================================================

-- Keep Seoul reservation organization scope canonical by campus_id.
-- External participants retain free-text organization fields without IDs.

update public.reservations reservation
set
  district_id = district.id,
  district = district.name,
  team_id = team.id,
  team = team.name,
  campus = campus.name
from public.campuses campus
join public.teams team on team.id = campus.team_id
join public.districts district on district.id = team.district_id
where reservation.affiliation_type = 'seoul'
  and reservation.campus_id = campus.id
  and (
    reservation.district_id is distinct from district.id
    or reservation.district is distinct from district.name
    or reservation.team_id is distinct from team.id
    or reservation.team is distinct from team.name
    or reservation.campus is distinct from campus.name
  );

update public.reservations reservation
set
  district_id = district.id,
  team_id = team.id,
  campus_id = campus.id
from public.districts district
join public.teams team on team.district_id = district.id
join public.campuses campus on campus.team_id = team.id
where reservation.affiliation_type = 'seoul'
  and reservation.district = district.name
  and reservation.team = team.name
  and reservation.campus = campus.name
  and not exists (
    select 1
    from public.campuses current_campus
    where current_campus.id = reservation.campus_id
  );

update public.reservations
set district_id = null, team_id = null, campus_id = null
where affiliation_type = 'external'
  and (district_id is not null or team_id is not null or campus_id is not null);

do $$
declare
  v_invalid_reservations text;
begin
  select string_agg(reservation.id::text, ', ' order by reservation.id::text)
  into v_invalid_reservations
  from public.reservations reservation
  where reservation.affiliation_type = 'seoul'
    and not exists (
      select 1
      from public.campuses campus
      where campus.id = reservation.campus_id
    );

  if v_invalid_reservations is not null then
    raise exception 'Seoul reservations have no valid campus_id: %',
      v_invalid_reservations;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_district_id_fkey'
  ) then
    alter table public.reservations
      add constraint reservations_district_id_fkey
      foreign key (district_id) references public.districts(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_team_id_fkey'
  ) then
    alter table public.reservations
      add constraint reservations_team_id_fkey
      foreign key (team_id) references public.teams(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_campus_id_fkey'
  ) then
    alter table public.reservations
      add constraint reservations_campus_id_fkey
      foreign key (campus_id) references public.campuses(id);
  end if;
end;
$$;

create or replace function public.sync_reservation_organization_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.affiliation_type = 'external'
    or (
      new.campus_id is null
      and exists (
        select 1
        from public.profiles profile
        where profile.id = new.user_id
          and profile.affiliation_type = 'external'
      )
    ) then
    new.affiliation_type := 'external';
    new.district_id := null;
    new.team_id := null;
    new.campus_id := null;
    return new;
  end if;

  select
    district.id,
    district.name,
    team.id,
    team.name,
    campus.name
  into
    new.district_id,
    new.district,
    new.team_id,
    new.team,
    new.campus
  from public.campuses campus
  join public.teams team on team.id = campus.team_id
  join public.districts district on district.id = team.district_id
  where campus.id = new.campus_id;

  if not found then
    raise exception 'Seoul reservations require a valid campus_id.';
  end if;

  return new;
end;
$$;

drop trigger if exists sync_reservation_organization_scope
  on public.reservations;
create trigger sync_reservation_organization_scope
before insert or update of
  affiliation_type, district_id, district, team_id, team, campus_id, campus
on public.reservations
for each row execute function public.sync_reservation_organization_scope();

create or replace function public.refresh_reservation_organization_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'districts' then
    update public.reservations reservation
    set campus_id = reservation.campus_id
    from public.campuses campus
    join public.teams team on team.id = campus.team_id
    where reservation.affiliation_type = 'seoul'
      and reservation.campus_id = campus.id
      and team.district_id = new.id;
  elsif tg_table_name = 'teams' then
    update public.reservations reservation
    set campus_id = reservation.campus_id
    from public.campuses campus
    where reservation.affiliation_type = 'seoul'
      and reservation.campus_id = campus.id
      and campus.team_id = new.id;
  else
    update public.reservations reservation
    set campus_id = reservation.campus_id
    where reservation.affiliation_type = 'seoul'
      and reservation.campus_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists refresh_reservation_scope_after_district_change
  on public.districts;
create trigger refresh_reservation_scope_after_district_change
after update of name on public.districts
for each row execute function public.refresh_reservation_organization_scope();

drop trigger if exists refresh_reservation_scope_after_team_change
  on public.teams;
create trigger refresh_reservation_scope_after_team_change
after update of name, district_id on public.teams
for each row execute function public.refresh_reservation_organization_scope();

drop trigger if exists refresh_reservation_scope_after_campus_change
  on public.campuses;
create trigger refresh_reservation_scope_after_campus_change
after update of name, team_id on public.campuses
for each row execute function public.refresh_reservation_organization_scope();

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/110_canonical_reservation_organization_scope.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/111_classify_automatic_boarding_events.sql
-- =========================================================

-- Classify machine-readable bus departure events as automatic actions.

create or replace function public.get_boarding_management_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can view boarding management.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  if not found then return null; end if;

  return jsonb_build_object(
    'allocationId', v_allocation.id,
    'allocationName', v_allocation.allocation_name,
    'buses', (
      select coalesce(jsonb_agg(
        bus || jsonb_build_object(
          'departedAt', departure.departed_at,
          'departedBy', departure.departed_by,
          'checkInCode', case
            when code.expires_at > clock_timestamp() then code.check_in_code
            else null
          end,
          'checkInCodeExpiresAt', code.expires_at
        ) order by bus ->> 'label'
      ), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
      left join public.boarding_bus_departures departure
        on departure.allocation_id = v_allocation.id
       and departure.bus_id = bus ->> 'id'
       and departure.cancelled_at is null
      left join public.boarding_check_in_codes code
        on code.allocation_id = v_allocation.id
       and code.bus_id = bus ->> 'id'
      where public.can_manage_boarding_bus(v_allocation.id, bus ->> 'id')
    ),
    'passengers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'reservationId', reservation.id,
        'busId', public.get_confirmed_ticket_bus_id(
          reservation.id,
          reservation.confirmed_ticket
        ),
        'name', reservation.name,
        'phone', reservation.phone,
        'district', reservation.district,
        'team', reservation.team,
        'campus', reservation.campus,
        'busNumber', reservation.confirmed_ticket ->> 'busNumber',
        'seatNumber', reservation.confirmed_ticket ->> 'seatNumber',
        'boardingStatus', reservation.boarding_status,
        'boardingNote', reservation.boarding_note,
        'boardingNoteUpdatedAt', reservation.boarding_note_updated_at,
        'boardingNoteUpdatedByName', note_actor.name,
        'updatedAt', reservation.boarding_status_updated_at,
        'updatedByName', status_actor.name
      ) order by reservation.campus, reservation.name), '[]'::jsonb)
      from public.reservations reservation
      left join public.profiles status_actor
        on status_actor.id = reservation.boarding_status_updated_by
      left join public.profiles note_actor
        on note_actor.id = reservation.boarding_note_updated_by
      where reservation.status = 'confirmed'
        and reservation.confirmed_ticket is not null
        and public.can_manage_boarding_reservation(reservation.id)
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id,
        'reservationId', event.reservation_id,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'actorType', case
          when event.note in ('탑승 확인', 'passenger_check_in_code')
            then 'passenger'
          when event.note = 'bus_departed_auto_no_show'
            or event.note like '호차 출발%'
            then 'automatic'
          else 'boarding_manager'
        end,
        'actorName', actor.name,
        'createdAt', event.created_at,
        'note', event.note
      ) order by event.created_at desc), '[]'::jsonb)
      from public.boarding_status_events event
      left join public.profiles actor on actor.id = event.actor_id
      join public.reservations reservation
        on reservation.id = event.reservation_id
      where reservation.status = 'confirmed'
        and public.can_manage_boarding_reservation(reservation.id)
        and event.created_at >= coalesce(
          nullif(reservation.confirmed_ticket ->> 'confirmedAt', '')::timestamptz,
          '-infinity'::timestamptz
        )
    )
  );
end;
$$;

revoke all on function public.get_boarding_management_snapshot()
  from public, anon;
grant execute on function public.get_boarding_management_snapshot()
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/111_classify_automatic_boarding_events.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/112_canonical_profile_organization_scope.sql
-- =========================================================

-- Keep scoped Seoul profiles canonical by campus_id.
-- External profiles retain free-text organization fields without IDs.
-- Profiles with no organization fields remain valid for system/global-admin accounts.

update public.profiles profile
set
  district_id = district.id,
  district = district.name,
  team_id = team.id,
  team = team.name,
  campus = campus.name
from public.campuses campus
join public.teams team on team.id = campus.team_id
join public.districts district on district.id = team.district_id
where profile.affiliation_type = 'seoul'
  and profile.campus_id = campus.id
  and (
    profile.district_id is distinct from district.id
    or profile.district is distinct from district.name
    or profile.team_id is distinct from team.id
    or profile.team is distinct from team.name
    or profile.campus is distinct from campus.name
  );

update public.profiles profile
set
  district_id = district.id,
  team_id = team.id,
  campus_id = campus.id
from public.districts district
join public.teams team on team.district_id = district.id
join public.campuses campus on campus.team_id = team.id
where profile.affiliation_type = 'seoul'
  and profile.district = district.name
  and profile.team = team.name
  and profile.campus = campus.name
  and not exists (
    select 1
    from public.campuses current_campus
    where current_campus.id = profile.campus_id
  );

update public.profiles
set district_id = null, team_id = null, campus_id = null
where affiliation_type = 'external'
  and (district_id is not null or team_id is not null or campus_id is not null);

do $$
declare
  v_invalid_profiles text;
begin
  select string_agg(profile.id::text, ', ' order by profile.id::text)
  into v_invalid_profiles
  from public.profiles profile
  where profile.affiliation_type = 'seoul'
    and (
      profile.district_id is not null
      or nullif(trim(profile.district), '') is not null
      or profile.team_id is not null
      or nullif(trim(profile.team), '') is not null
      or profile.campus_id is not null
      or nullif(trim(profile.campus), '') is not null
    )
    and not exists (
      select 1
      from public.campuses campus
      where campus.id = profile.campus_id
    );

  if v_invalid_profiles is not null then
    raise exception 'Scoped Seoul profiles have no valid campus_id: %',
      v_invalid_profiles;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_district_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_district_id_fkey
      foreign key (district_id) references public.districts(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_team_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_team_id_fkey
      foreign key (team_id) references public.teams(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_campus_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_campus_id_fkey
      foreign key (campus_id) references public.campuses(id);
  end if;
end;
$$;

create or replace function public.sync_profile_organization_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.affiliation_type = 'external' then
    new.district_id := null;
    new.team_id := null;
    new.campus_id := null;
    return new;
  end if;

  if new.district_id is null
    and nullif(trim(new.district), '') is null
    and new.team_id is null
    and nullif(trim(new.team), '') is null
    and new.campus_id is null
    and nullif(trim(new.campus), '') is null then
    return new;
  end if;

  select
    district.id,
    district.name,
    team.id,
    team.name,
    campus.name
  into
    new.district_id,
    new.district,
    new.team_id,
    new.team,
    new.campus
  from public.campuses campus
  join public.teams team on team.id = campus.team_id
  join public.districts district on district.id = team.district_id
  where campus.id = new.campus_id;

  if not found then
    raise exception 'Scoped Seoul profiles require a valid campus_id.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_profile_organization_membership
  on public.profiles;
drop trigger if exists sync_profile_organization_scope
  on public.profiles;
create trigger sync_profile_organization_scope
before insert or update of
  affiliation_type, district_id, district, team_id, team, campus_id, campus
on public.profiles
for each row execute function public.sync_profile_organization_scope();

create or replace function public.refresh_profile_organization_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'districts' then
    update public.profiles profile
    set campus_id = profile.campus_id
    from public.campuses campus
    join public.teams team on team.id = campus.team_id
    where profile.affiliation_type = 'seoul'
      and profile.campus_id = campus.id
      and team.district_id = new.id;
  elsif tg_table_name = 'teams' then
    update public.profiles profile
    set campus_id = profile.campus_id
    from public.campuses campus
    where profile.affiliation_type = 'seoul'
      and profile.campus_id = campus.id
      and campus.team_id = new.id;
  else
    update public.profiles profile
    set campus_id = profile.campus_id
    where profile.affiliation_type = 'seoul'
      and profile.campus_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists refresh_profile_scope_after_district_change
  on public.districts;
create trigger refresh_profile_scope_after_district_change
after update of name on public.districts
for each row execute function public.refresh_profile_organization_scope();

drop trigger if exists refresh_profile_scope_after_team_change
  on public.teams;
create trigger refresh_profile_scope_after_team_change
after update of name, district_id on public.teams
for each row execute function public.refresh_profile_organization_scope();

drop trigger if exists refresh_profile_scope_after_campus_change
  on public.campuses;
create trigger refresh_profile_scope_after_campus_change
after update of name, team_id on public.campuses
for each row execute function public.refresh_profile_organization_scope();

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/112_canonical_profile_organization_scope.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/113_canonical_admin_role_organization_scope.sql
-- =========================================================

-- Keep campus-admin organization scope canonical by campus_id.
-- Global admins and boarding managers must not carry organization scope.

update public.admin_roles admin_role
set
  district_id = district.id,
  district = district.name,
  team_id = team.id,
  team = team.name,
  campus = campus.name
from public.campuses campus
join public.teams team on team.id = campus.team_id
join public.districts district on district.id = team.district_id
where admin_role.role = 'campus_admin'
  and admin_role.campus_id = campus.id
  and (
    admin_role.district_id is distinct from district.id
    or admin_role.district is distinct from district.name
    or admin_role.team_id is distinct from team.id
    or admin_role.team is distinct from team.name
    or admin_role.campus is distinct from campus.name
  );

update public.admin_roles admin_role
set
  district_id = district.id,
  team_id = team.id,
  campus_id = campus.id
from public.districts district
join public.teams team on team.district_id = district.id
join public.campuses campus on campus.team_id = team.id
where admin_role.role = 'campus_admin'
  and admin_role.district = district.name
  and admin_role.team = team.name
  and admin_role.campus = campus.name
  and not exists (
    select 1
    from public.campuses current_campus
    where current_campus.id = admin_role.campus_id
  );

update public.admin_roles
set
  district_id = null,
  district = null,
  team_id = null,
  team = null,
  campus_id = null,
  campus = null
where role <> 'campus_admin'
  and (
    district_id is not null
    or district is not null
    or team_id is not null
    or team is not null
    or campus_id is not null
    or campus is not null
  );

do $$
declare
  v_invalid_roles text;
begin
  select string_agg(admin_role.id::text, ', ' order by admin_role.id::text)
  into v_invalid_roles
  from public.admin_roles admin_role
  where admin_role.role = 'campus_admin'
    and not exists (
      select 1
      from public.campuses campus
      where campus.id = admin_role.campus_id
    );

  if v_invalid_roles is not null then
    raise exception 'Campus admin roles have no valid campus_id: %',
      v_invalid_roles;
  end if;
end;
$$;

create unique index if not exists idx_admin_roles_user_campus_id_scope_unique
  on public.admin_roles(user_id, role, campus_id)
  where role = 'campus_admin' and campus_id is not null;

create unique index if not exists idx_admin_roles_campus_id_scope_unique
  on public.admin_roles(role, campus_id)
  where role = 'campus_admin' and campus_id is not null;

create or replace function public.sync_admin_role_organization_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role <> 'campus_admin' then
    new.district_id := null;
    new.district := null;
    new.team_id := null;
    new.team := null;
    new.campus_id := null;
    new.campus := null;
    return new;
  end if;

  select
    district.id,
    district.name,
    team.id,
    team.name,
    campus.name
  into
    new.district_id,
    new.district,
    new.team_id,
    new.team,
    new.campus
  from public.campuses campus
  join public.teams team on team.id = campus.team_id
  join public.districts district on district.id = team.district_id
  where campus.id = new.campus_id;

  if not found then
    raise exception 'Campus admin roles require a valid campus_id.';
  end if;

  return new;
end;
$$;

drop trigger if exists set_admin_role_scope_ids
  on public.admin_roles;
drop trigger if exists sync_admin_role_organization_scope
  on public.admin_roles;
create trigger sync_admin_role_organization_scope
before insert or update of
  role, district_id, district, team_id, team, campus_id, campus
on public.admin_roles
for each row execute function public.sync_admin_role_organization_scope();

create or replace function public.refresh_admin_role_organization_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'districts' then
    update public.admin_roles admin_role
    set campus_id = admin_role.campus_id
    from public.campuses campus
    join public.teams team on team.id = campus.team_id
    where admin_role.role = 'campus_admin'
      and admin_role.campus_id = campus.id
      and team.district_id = new.id;
  elsif tg_table_name = 'teams' then
    update public.admin_roles admin_role
    set campus_id = admin_role.campus_id
    from public.campuses campus
    where admin_role.role = 'campus_admin'
      and admin_role.campus_id = campus.id
      and campus.team_id = new.id;
  else
    update public.admin_roles admin_role
    set campus_id = admin_role.campus_id
    where admin_role.role = 'campus_admin'
      and admin_role.campus_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists refresh_admin_role_scope_after_district_change
  on public.districts;
create trigger refresh_admin_role_scope_after_district_change
after update of name on public.districts
for each row execute function public.refresh_admin_role_organization_scope();

drop trigger if exists refresh_admin_role_scope_after_team_change
  on public.teams;
create trigger refresh_admin_role_scope_after_team_change
after update of name, district_id on public.teams
for each row execute function public.refresh_admin_role_organization_scope();

drop trigger if exists refresh_admin_role_scope_after_campus_change
  on public.campuses;
create trigger refresh_admin_role_scope_after_campus_change
after update of name, team_id on public.campuses
for each row execute function public.refresh_admin_role_organization_scope();

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/113_canonical_admin_role_organization_scope.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/114_allow_allocation_workspace_lock_before_deadline.sql
-- =========================================================

-- Allow opening an existing allocation workspace before the reservation deadline.
-- Substantive allocation writes remain blocked until the deadline is closed.

create or replace function public.require_closed_reservation_deadline_for_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deadline_at timestamptz;
begin
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'allocation_data' - 'updated_at' - 'revision')
      = (to_jsonb(old) - 'allocation_data' - 'updated_at' - 'revision')
    and (new.allocation_data - 'editLock') = (old.allocation_data - 'editLock')
    and new.revision = old.revision + 1 then
    return new;
  end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_at is null or v_deadline_at > clock_timestamp() then
    raise exception 'Allocation is available only after the reservation deadline.';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/114_allow_allocation_workspace_lock_before_deadline.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/115_canonical_campus_request_organization_scope.sql
-- =========================================================

-- Keep campus requests canonical by campus_id. Global notices have no single scope.

update public.campus_requests request
set district_id = district.id, district = district.name,
  team_id = team.id, team = team.name, campus = campus.name
from public.campuses campus
join public.teams team on team.id = campus.team_id
join public.districts district on district.id = team.district_id
where request.is_global_notice = false
  and request.campus_id = campus.id
  and (
    request.district_id is distinct from district.id
    or request.district is distinct from district.name
    or request.team_id is distinct from team.id
    or request.team is distinct from team.name
    or request.campus is distinct from campus.name
  );

update public.campus_requests request
set district_id = district.id, team_id = team.id, campus_id = campus.id
from public.districts district
join public.teams team on team.district_id = district.id
join public.campuses campus on campus.team_id = team.id
where request.is_global_notice = false
  and request.district = district.name
  and request.team = team.name
  and request.campus = campus.name
  and not exists (
    select 1 from public.campuses current_campus
    where current_campus.id = request.campus_id
  );

update public.campus_requests
set district_id = null, district = '', team_id = null, team = '',
  campus_id = null, campus = ''
where is_global_notice = true
  and (
    district_id is not null or district <> ''
    or team_id is not null or team <> ''
    or campus_id is not null or campus <> ''
  );

do $$
declare
  v_invalid_requests text;
begin
  select string_agg(request.id::text, ', ' order by request.id::text)
  into v_invalid_requests
  from public.campus_requests request
  where request.is_global_notice = false
    and not exists (
      select 1 from public.campuses campus
      where campus.id = request.campus_id
    );

  if v_invalid_requests is not null then
    raise exception 'Campus requests have no valid campus_id: %',
      v_invalid_requests;
  end if;
end;
$$;

create or replace function public.sync_campus_request_organization_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_global_notice then
    new.district_id := null;
    new.district := '';
    new.team_id := null;
    new.team := '';
    new.campus_id := null;
    new.campus := '';
    return new;
  end if;

  select district.id, district.name, team.id, team.name, campus.name
  into new.district_id, new.district, new.team_id, new.team, new.campus
  from public.campuses campus
  join public.teams team on team.id = campus.team_id
  join public.districts district on district.id = team.district_id
  where campus.id = new.campus_id;

  if not found then
    raise exception 'Campus requests require a valid campus_id.';
  end if;
  return new;
end;
$$;

drop trigger if exists set_campus_request_scope_ids on public.campus_requests;
drop trigger if exists sync_campus_request_organization_scope on public.campus_requests;
create trigger sync_campus_request_organization_scope
before insert or update of
  is_global_notice, district_id, district, team_id, team, campus_id, campus
on public.campus_requests
for each row execute function public.sync_campus_request_organization_scope();

create or replace function public.refresh_campus_request_organization_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'districts' then
    update public.campus_requests request
    set campus_id = request.campus_id
    from public.campuses campus
    join public.teams team on team.id = campus.team_id
    where request.is_global_notice = false
      and request.campus_id = campus.id and team.district_id = new.id;
  elsif tg_table_name = 'teams' then
    update public.campus_requests request
    set campus_id = request.campus_id
    from public.campuses campus
    where request.is_global_notice = false
      and request.campus_id = campus.id and campus.team_id = new.id;
  else
    update public.campus_requests request
    set campus_id = request.campus_id
    where request.is_global_notice = false and request.campus_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_campus_request_scope_after_district_change on public.districts;
create trigger refresh_campus_request_scope_after_district_change
after update of name on public.districts
for each row execute function public.refresh_campus_request_organization_scope();

drop trigger if exists refresh_campus_request_scope_after_team_change on public.teams;
create trigger refresh_campus_request_scope_after_team_change
after update of name, district_id on public.teams
for each row execute function public.refresh_campus_request_organization_scope();

drop trigger if exists refresh_campus_request_scope_after_campus_change on public.campuses;
create trigger refresh_campus_request_scope_after_campus_change
after update of name, team_id on public.campuses
for each row execute function public.refresh_campus_request_organization_scope();

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/115_canonical_campus_request_organization_scope.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/116_campus_admin_payment_account.sql
-- =========================================================

-- Allow global admins and each campus admin to manage the matching campus account.

create or replace function public.upsert_campus_payment_account_as_admin(
  p_campus_id uuid,
  p_bank_name text,
  p_account_number text,
  p_account_holder text
)
returns table (
  campus_id uuid,
  bank_name text,
  account_number text,
  account_holder text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank_name text := trim(coalesce(p_bank_name, ''));
  v_account_number text := trim(coalesce(p_account_number, ''));
  v_account_holder text := trim(coalesce(p_account_holder, ''));
begin
  if not public.is_global_admin()
    and not exists (
      select 1
      from public.admin_roles admin_role
      where admin_role.user_id = auth.uid()
        and admin_role.role = 'campus_admin'
        and admin_role.campus_id = p_campus_id
    )
  then
    raise exception 'Only the matching campus admin or a global admin can update this payment account.';
  end if;

  if not exists (
    select 1 from public.campuses where id = p_campus_id and is_active = true
  ) then
    raise exception 'Active campus not found.';
  end if;

  if v_bank_name = '' or v_account_number = '' or v_account_holder = '' then
    raise exception 'Bank name, account number, and account holder are required.';
  end if;

  insert into public.campus_payment_accounts (
    campus_id, bank_name, account_number, account_holder, updated_at, updated_by
  )
  values (
    p_campus_id, v_bank_name, v_account_number, v_account_holder,
    clock_timestamp(), auth.uid()
  )
  on conflict on constraint campus_payment_accounts_pkey do update
  set bank_name = excluded.bank_name,
      account_number = excluded.account_number,
      account_holder = excluded.account_holder,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  return query
  select account.campus_id, account.bank_name, account.account_number,
    account.account_holder
  from public.campus_payment_accounts account
  where account.campus_id = p_campus_id;
end;
$$;

revoke all on function public.upsert_campus_payment_account_as_admin(
  uuid, text, text, text
) from public, anon;

grant execute on function public.upsert_campus_payment_account_as_admin(
  uuid, text, text, text
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/116_campus_admin_payment_account.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/117_cancel_campus_transfer_report.sql
-- =========================================================

-- Allow a campus administrator to cancel a transfer report before head-office confirmation.

create or replace function public.cancel_campus_transfer_report(
  p_transfer_id uuid
)
returns public.campus_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.campus_transfers;
  v_deleted_count integer;
begin
  select *
  into v_transfer
  from public.campus_transfers transfer
  where transfer.id = p_transfer_id;

  if v_transfer.id is null then
    raise exception 'Campus transfer not found.';
  end if;

  if v_transfer.status <> 'sent' then
    raise exception 'Only a reported campus transfer can be cancelled.';
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
      and (
        admin_role.role = 'global_admin'
        or (
          admin_role.role = 'campus_admin'
          and (
            (
              v_transfer.campus_id is not null
              and admin_role.campus_id = v_transfer.campus_id
            )
            or (
              admin_role.district = v_transfer.district
              and admin_role.team = v_transfer.team
              and admin_role.campus = v_transfer.campus
            )
          )
        )
      )
  ) then
    raise exception 'Not authorized to cancel this campus transfer report.';
  end if;

  delete from public.campus_transfers
  where id = p_transfer_id
    and status = 'sent';

  get diagnostics v_deleted_count = row_count;
  if v_deleted_count <> 1 then
    raise exception 'Campus transfer report is no longer cancellable.';
  end if;

  return v_transfer;
end;
$$;

revoke all on function public.cancel_campus_transfer_report(uuid) from public, anon;
grant execute on function public.cancel_campus_transfer_report(uuid) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/117_cancel_campus_transfer_report.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/118_prioritize_campus_admin_in_search.sql
-- =========================================================

-- =========================================================
-- Server-paginated user list with the selected campus administrator first.
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
      case
        when exists (
          select 1
          from public.admin_roles matching_role
          where matching_role.user_id = profile.id
            and matching_role.role = 'campus_admin'
            and (nullif(trim(p_district), '') is null or matching_role.district = trim(p_district))
            and (nullif(trim(p_team), '') is null or matching_role.team = trim(p_team))
            and (nullif(trim(p_campus), '') is null or matching_role.campus = trim(p_campus))
        ) then 0
        else 1
      end as campus_admin_priority,
      count(*) over () as total_count
    from public.profiles profile
    join candidate_ids candidate on candidate.id = profile.id
    order by campus_admin_priority, profile.name asc nulls last, profile.email asc nulls last, profile.id
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
  order by
    candidate.campus_admin_priority,
    candidate.name asc nulls last,
    candidate.email asc nulls last,
    candidate.id;
end;
$$;

revoke all on function public.get_campus_admin_manage_users_page(text, text, text, integer, integer)
from public, anon;
grant execute on function public.get_campus_admin_manage_users_page(text, text, text, integer, integer)
to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/118_prioritize_campus_admin_in_search.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/119_allow_confirmation_transaction_cleanup.sql
-- =========================================================

-- Allow the confirmation RPC to archive and delete stale allocation drafts atomically.

create or replace function public.lock_allocation_planning_writes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.allocation_confirmation_write', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if exists (
    select 1 from public.bus_allocations
    where allocation_data ->> 'status' = 'confirmed'
  ) then
    if tg_op = 'UPDATE' and old.allocation_data ->> 'status' = 'confirmed' then
      return new;
    end if;
    raise exception 'Cancel the confirmed allocation before using allocation planning.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.save_confirmed_allocation_workspace_v3(
  p_allocation_id uuid, p_expected_revision bigint, p_allocation_data jsonb,
  p_total_cost integer, p_total_capacity integer, p_version_id text,
  p_version_label text, p_version_changes jsonb
)
returns setof public.bus_allocations
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.bus_allocations
    where id = p_allocation_id and allocation_data ->> 'status' = 'confirmed'
  ) then
    raise exception 'Confirmed allocation is locked until confirmation is cancelled.';
  end if;

  perform set_config('app.allocation_confirmation_write', 'on', true);

  return query select *
  from public.save_confirmed_allocation_workspace_v3_unlocked(
    p_allocation_id, p_expected_revision, p_allocation_data, p_total_cost,
    p_total_capacity, p_version_id, p_version_label, p_version_changes
  );
end;
$$;

revoke all on function public.save_confirmed_allocation_workspace_v3(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from public, anon;
grant execute on function public.save_confirmed_allocation_workspace_v3(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/119_allow_confirmation_transaction_cleanup.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/120_search_all_users_for_campus_admin.sql
-- =========================================================

-- =========================================================
-- Search all users regardless of affiliation while keeping the selected campus administrator first.
-- =========================================================

create or replace function public.get_campus_admin_manage_users_page(
  p_district text default null,
  p_team text default null,
  p_campus text default null,
  p_query text default null,
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
    where nullif(trim(p_query), '') is null
      or concat_ws(
        ' ',
        profile.name,
        profile.email,
        profile.phone,
        profile.district,
        profile.team,
        profile.campus
      ) ilike '%' || trim(p_query) || '%'

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
      case
        when exists (
          select 1
          from public.admin_roles matching_role
          where matching_role.user_id = profile.id
            and matching_role.role = 'campus_admin'
            and (nullif(trim(p_district), '') is null or matching_role.district = trim(p_district))
            and (nullif(trim(p_team), '') is null or matching_role.team = trim(p_team))
            and (nullif(trim(p_campus), '') is null or matching_role.campus = trim(p_campus))
        ) then 0
        else 1
      end as campus_admin_priority,
      count(*) over () as total_count
    from public.profiles profile
    join candidate_ids candidate on candidate.id = profile.id
    order by campus_admin_priority, profile.name asc nulls last, profile.email asc nulls last, profile.id
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    candidate.id as user_id,
    candidate.email,
    coalesce(candidate.name, '이름 없음') as name,
    candidate.phone,
    candidate.district,
    candidate.team,
    candidate.campus,
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
  order by
    candidate.campus_admin_priority,
    candidate.name asc nulls last,
    candidate.email asc nulls last,
    candidate.id;
end;
$$;

revoke all on function public.get_campus_admin_manage_users_page(text, text, text, text, integer, integer)
from public, anon;
grant execute on function public.get_campus_admin_manage_users_page(text, text, text, text, integer, integer)
to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/120_search_all_users_for_campus_admin.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/121_fix_campus_payment_account_campus_id_ambiguity.sql
-- =========================================================

-- Avoid a PL/pgSQL output-column collision with the campus_id conflict target.

create or replace function public.upsert_campus_payment_account_as_global_admin(
  p_campus_id uuid,
  p_bank_name text,
  p_account_number text,
  p_account_holder text
)
returns table (
  campus_id uuid,
  bank_name text,
  account_number text,
  account_holder text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank_name text := trim(coalesce(p_bank_name, ''));
  v_account_number text := trim(coalesce(p_account_number, ''));
  v_account_holder text := trim(coalesce(p_account_holder, ''));
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can update campus payment accounts.';
  end if;

  if not exists (
    select 1 from public.campuses where id = p_campus_id and is_active = true
  ) then
    raise exception 'Active campus not found.';
  end if;

  if v_bank_name = '' or v_account_number = '' or v_account_holder = '' then
    raise exception 'Bank name, account number, and account holder are required.';
  end if;

  insert into public.campus_payment_accounts (
    campus_id, bank_name, account_number, account_holder, updated_at, updated_by
  )
  values (
    p_campus_id, v_bank_name, v_account_number, v_account_holder,
    clock_timestamp(), auth.uid()
  )
  on conflict on constraint campus_payment_accounts_pkey do update
  set bank_name = excluded.bank_name,
      account_number = excluded.account_number,
      account_holder = excluded.account_holder,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  return query
  select account.campus_id, account.bank_name, account.account_number,
    account.account_holder
  from public.campus_payment_accounts account
  where account.campus_id = p_campus_id;
end;
$$;

create or replace function public.upsert_campus_payment_account_as_admin(
  p_campus_id uuid,
  p_bank_name text,
  p_account_number text,
  p_account_holder text
)
returns table (
  campus_id uuid,
  bank_name text,
  account_number text,
  account_holder text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank_name text := trim(coalesce(p_bank_name, ''));
  v_account_number text := trim(coalesce(p_account_number, ''));
  v_account_holder text := trim(coalesce(p_account_holder, ''));
begin
  if not public.is_global_admin()
    and not exists (
      select 1
      from public.admin_roles admin_role
      where admin_role.user_id = auth.uid()
        and admin_role.role = 'campus_admin'
        and admin_role.campus_id = p_campus_id
    )
  then
    raise exception 'Only the matching campus admin or a global admin can update this payment account.';
  end if;

  if not exists (
    select 1 from public.campuses where id = p_campus_id and is_active = true
  ) then
    raise exception 'Active campus not found.';
  end if;

  if v_bank_name = '' or v_account_number = '' or v_account_holder = '' then
    raise exception 'Bank name, account number, and account holder are required.';
  end if;

  insert into public.campus_payment_accounts (
    campus_id, bank_name, account_number, account_holder, updated_at, updated_by
  )
  values (
    p_campus_id, v_bank_name, v_account_number, v_account_holder,
    clock_timestamp(), auth.uid()
  )
  on conflict on constraint campus_payment_accounts_pkey do update
  set bank_name = excluded.bank_name,
      account_number = excluded.account_number,
      account_holder = excluded.account_holder,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  return query
  select account.campus_id, account.bank_name, account.account_number,
    account.account_holder
  from public.campus_payment_accounts account
  where account.campus_id = p_campus_id;
end;
$$;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/121_fix_campus_payment_account_campus_id_ambiguity.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/122_fix_campus_admin_search_rpc_access.sql
-- =========================================================

-- =========================================================
-- Remove the obsolete overload and restore access to the all-user campus-admin search RPC.
-- =========================================================

drop function if exists public.get_campus_admin_manage_users_page(
  text, text, text, integer, integer
);

create or replace function public.get_campus_admin_manage_users_page(
  p_district text default null,
  p_team text default null,
  p_campus text default null,
  p_query text default null,
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
    where nullif(trim(p_query), '') is null
      or concat_ws(
        ' ',
        profile.name,
        profile.email,
        profile.phone,
        profile.district,
        profile.team,
        profile.campus
      ) ilike '%' || trim(p_query) || '%'

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
      case
        when exists (
          select 1
          from public.admin_roles matching_role
          where matching_role.user_id = profile.id
            and matching_role.role = 'campus_admin'
            and (nullif(trim(p_district), '') is null or matching_role.district = trim(p_district))
            and (nullif(trim(p_team), '') is null or matching_role.team = trim(p_team))
            and (nullif(trim(p_campus), '') is null or matching_role.campus = trim(p_campus))
        ) then 0
        else 1
      end as campus_admin_priority,
      count(*) over () as total_count
    from public.profiles profile
    join candidate_ids candidate on candidate.id = profile.id
    order by campus_admin_priority, profile.name asc nulls last, profile.email asc nulls last, profile.id
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    candidate.id as user_id,
    candidate.email,
    coalesce(candidate.name, '이름 없음') as name,
    candidate.phone,
    candidate.district,
    candidate.team,
    candidate.campus,
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
  order by
    candidate.campus_admin_priority,
    candidate.name asc nulls last,
    candidate.email asc nulls last,
    candidate.id;
end;
$$;

revoke all on function public.get_campus_admin_manage_users_page(text, text, text, text, integer, integer)
from public, anon, authenticated, service_role;
grant execute on function public.get_campus_admin_manage_users_page(text, text, text, text, integer, integer)
to authenticated, service_role;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/122_fix_campus_admin_search_rpc_access.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/123_avoid_confirmation_table_lock_timeout.sql
-- =========================================================

-- Serialize confirmation transactions without blocking unrelated table writes.

do $$
declare
  v_function_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(
    'public.save_confirmed_allocation_workspace(uuid,bigint,jsonb,integer,integer)'::regprocedure
  )
  into v_function_definition;

  v_updated_definition := regexp_replace(
    v_function_definition,
    E'lock table public\\.bus_allocations in share row exclusive mode;\\s+lock table public\\.reservations in share row exclusive mode;',
    E'perform pg_advisory_xact_lock(hashtextextended(''allocation-confirmation'', 0));',
    'i'
  );

  if v_updated_definition = v_function_definition then
    if position(
      'pg_advisory_xact_lock(hashtextextended(''allocation-confirmation'', 0))'
      in v_function_definition
    ) = 0 then
      raise exception 'Could not replace allocation confirmation table locks.';
    end if;
  else
    execute v_updated_definition;
  end if;
end;
$$;

revoke all on function public.save_confirmed_allocation_workspace(
  uuid, bigint, jsonb, integer, integer
) from public, anon;
grant execute on function public.save_confirmed_allocation_workspace(
  uuid, bigint, jsonb, integer, integer
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/123_avoid_confirmation_table_lock_timeout.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/124_protect_initial_campus_request_message.sql
-- =========================================================

-- Prevent API clients from changing or deleting the initial request message.

create or replace function public.is_initial_campus_request_message(
  p_message_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campus_request_messages target
    where target.id = p_message_id
      and target.id = (
        select first_message.id
        from public.campus_request_messages first_message
        where first_message.request_id = target.request_id
        order by first_message.created_at, first_message.id
        limit 1
      )
  );
$$;

revoke all on function public.is_initial_campus_request_message(uuid)
from public, anon;
grant execute on function public.is_initial_campus_request_message(uuid)
to authenticated;

drop policy if exists "Initial campus request messages cannot be updated"
  on public.campus_request_messages;
create policy "Initial campus request messages cannot be updated"
on public.campus_request_messages
as restrictive
for update
to authenticated
using (not public.is_initial_campus_request_message(id))
with check (not public.is_initial_campus_request_message(id));

drop policy if exists "Initial campus request messages cannot be deleted"
  on public.campus_request_messages;
create policy "Initial campus request messages cannot be deleted"
on public.campus_request_messages
as restrictive
for delete
to authenticated
using (not public.is_initial_campus_request_message(id));

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/124_protect_initial_campus_request_message.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/125_secure_campus_transfer_reports.sql
-- =========================================================

-- Validate campus transfer reports against current server-side payment totals.

create or replace function public.mark_campus_transfer_sent(
  p_district text,
  p_team text,
  p_campus text,
  p_total_people integer,
  p_paid_people integer,
  p_total_amount integer,
  p_sent_by uuid
)
returns public.campus_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.campus_transfers;
  v_existing public.campus_transfers;
  v_scope record;
  v_total_people integer;
  v_paid_people integer;
  v_total_amount integer;
begin
  select district_id, team_id, campus_id
  into v_scope
  from public.campus_options
  where district = p_district
    and team = p_team
    and campus = p_campus
  limit 1;

  if not found then
    raise exception 'Campus transfer scope is invalid.';
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
      and (
        admin_role.role = 'global_admin'
        or (
          admin_role.role = 'campus_admin'
          and (
            admin_role.campus_id = v_scope.campus_id
            or (
              admin_role.district = p_district
              and admin_role.team = p_team
              and admin_role.campus = p_campus
            )
          )
        )
      )
  ) then
    raise exception 'Not authorized to report this campus transfer.';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where exists (
        select 1
        from public.payments payment
        where payment.reservation_id = reservation.id
          and payment.status = 'completed'
      )
    )::integer
  into v_total_people, v_paid_people
  from public.reservations reservation
  where reservation.status is distinct from 'cancelled'
    and (
      reservation.campus_id = v_scope.campus_id
      or (
        reservation.district = p_district
        and reservation.team = p_team
        and reservation.campus = p_campus
      )
    );

  v_total_amount := v_total_people * public.get_bus_ticket_price();

  if v_total_people <= 0 then
    raise exception 'No active reservations are available for this campus transfer.';
  end if;
  if v_paid_people <> v_total_people then
    raise exception 'Every active reservation must be paid before reporting a campus transfer.';
  end if;
  if p_total_people is distinct from v_total_people
    or p_paid_people is distinct from v_paid_people
    or p_total_amount is distinct from v_total_amount then
    raise exception 'Campus transfer totals changed. Refresh and try again.';
  end if;

  select *
  into v_existing
  from public.campus_transfers transfer
  where transfer.district = p_district
    and transfer.team = p_team
    and transfer.campus = p_campus
  for update;

  if v_existing.id is not null
    and v_existing.status = 'confirmed'
    and v_total_people <= v_existing.total_people
    and v_paid_people <= v_existing.paid_people
    and v_total_amount <= v_existing.total_amount then
    raise exception 'A confirmed campus transfer can only be reported again for additional settlement.';
  end if;

  insert into public.campus_transfers (
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
    v_scope.district_id,
    v_scope.team_id,
    v_scope.campus_id,
    p_district,
    p_team,
    p_campus,
    v_total_people,
    v_paid_people,
    v_total_amount,
    'sent',
    auth.uid(),
    clock_timestamp(),
    null,
    null,
    null,
    clock_timestamp()
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
    sent_at = excluded.sent_at,
    confirmed_by = null,
    confirmed_at = null,
    actual_confirmed_amount = null,
    updated_at = excluded.updated_at
  returning * into v_transfer;

  return v_transfer;
end;
$$;

revoke all on function public.mark_campus_transfer_sent(
  text, text, text, integer, integer, integer, uuid
) from public, anon;
grant execute on function public.mark_campus_transfer_sent(
  text, text, text, integer, integer, integer, uuid
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/125_secure_campus_transfer_reports.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/126_allow_campus_request_cascade_delete.sql
-- =========================================================

-- Avoid writing message audit rows while their parent request is being deleted.

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
    if exists (
      select 1
      from public.campus_requests request
      where request.id = old.request_id
    ) then
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
    end if;
    return old;
  end if;

  return null;
end;
$$;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/126_allow_campus_request_cascade_delete.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/127_keyset_pagination_indexes.sql
-- =========================================================

-- Support full-table collectors that page by stable (created_at, id) cursors.

create index if not exists idx_reservations_created_id
  on public.reservations(created_at desc, id desc);

create index if not exists idx_campus_request_messages_created_id
  on public.campus_request_messages(created_at desc, id desc);

-- =========================================================
-- END sql/setup/127_keyset_pagination_indexes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/128_admin_audit_log_keyset_index.sql
-- =========================================================

-- Support cursor pagination for the administrator audit log.

create index if not exists idx_admin_action_audit_logs_created_id
  on public.admin_action_audit_logs(created_at desc, id desc);

-- =========================================================
-- END sql/setup/128_admin_audit_log_keyset_index.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/129_campus_transfer_reports_require_closed_deadline.sql
-- =========================================================

-- Allow campus transfer reports only after the reservation deadline.

create or replace function public.mark_campus_transfer_sent(
  p_district text,
  p_team text,
  p_campus text,
  p_total_people integer,
  p_paid_people integer,
  p_total_amount integer,
  p_sent_by uuid
)
returns public.campus_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.campus_transfers;
  v_existing public.campus_transfers;
  v_scope record;
  v_total_people integer;
  v_paid_people integer;
  v_total_amount integer;
  v_deadline_at timestamptz;
begin
  select district_id, team_id, campus_id
  into v_scope
  from public.campus_options
  where district = p_district
    and team = p_team
    and campus = p_campus
  limit 1;

  if not found then
    raise exception 'Campus transfer scope is invalid.';
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
      and (
        admin_role.role = 'global_admin'
        or (
          admin_role.role = 'campus_admin'
          and (
            admin_role.campus_id = v_scope.campus_id
            or (
              admin_role.district = p_district
              and admin_role.team = p_team
              and admin_role.campus = p_campus
            )
          )
        )
      )
  ) then
    raise exception 'Not authorized to report this campus transfer.';
  end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline';

  if v_deadline_at is null or v_deadline_at > clock_timestamp() then
    raise exception 'Campus transfer reports are available only after the reservation deadline.';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where exists (
        select 1
        from public.payments payment
        where payment.reservation_id = reservation.id
          and payment.status = 'completed'
      )
    )::integer
  into v_total_people, v_paid_people
  from public.reservations reservation
  where reservation.status is distinct from 'cancelled'
    and (
      reservation.campus_id = v_scope.campus_id
      or (
        reservation.district = p_district
        and reservation.team = p_team
        and reservation.campus = p_campus
      )
    );

  v_total_amount := v_total_people * public.get_bus_ticket_price();

  if v_total_people <= 0 then
    raise exception 'No active reservations are available for this campus transfer.';
  end if;
  if v_paid_people <> v_total_people then
    raise exception 'Every active reservation must be paid before reporting a campus transfer.';
  end if;
  if p_total_people is distinct from v_total_people
    or p_paid_people is distinct from v_paid_people
    or p_total_amount is distinct from v_total_amount then
    raise exception 'Campus transfer totals changed. Refresh and try again.';
  end if;

  select *
  into v_existing
  from public.campus_transfers transfer
  where transfer.district = p_district
    and transfer.team = p_team
    and transfer.campus = p_campus
  for update;

  if v_existing.id is not null
    and v_existing.status = 'confirmed'
    and v_total_people <= v_existing.total_people
    and v_paid_people <= v_existing.paid_people
    and v_total_amount <= v_existing.total_amount then
    raise exception 'A confirmed campus transfer can only be reported again for additional settlement.';
  end if;

  insert into public.campus_transfers (
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
    v_scope.district_id,
    v_scope.team_id,
    v_scope.campus_id,
    p_district,
    p_team,
    p_campus,
    v_total_people,
    v_paid_people,
    v_total_amount,
    'sent',
    auth.uid(),
    clock_timestamp(),
    null,
    null,
    null,
    clock_timestamp()
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
    sent_at = excluded.sent_at,
    confirmed_by = null,
    confirmed_at = null,
    actual_confirmed_amount = null,
    updated_at = excluded.updated_at
  returning * into v_transfer;

  return v_transfer;
end;
$$;

revoke all on function public.mark_campus_transfer_sent(
  text, text, text, integer, integer, integer, uuid
) from public, anon;
grant execute on function public.mark_campus_transfer_sent(
  text, text, text, integer, integer, integer, uuid
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/129_campus_transfer_reports_require_closed_deadline.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/130_personal_ticket_district_filter.sql
-- =========================================================

-- =========================================================
-- Server-paginated global-admin personal ticket list.
-- =========================================================

drop function if exists public.get_admin_personal_ticket_page(integer, integer, text, text, text, text, text, text);

create or replace function public.get_admin_personal_ticket_page(
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default '',
  p_status text default 'all',
  p_ticket text default 'all',
  p_admin_role text default 'all',
  p_campus_issue text default 'all',
  p_campus text default 'all',
  p_district text default 'all'
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
      coalesce(nullif(reservation.data ->> 'id', ''), reservation.id::text) as id,
      reservation.id as db_id,
      reservation.user_id,
      profile.email,
      coalesce(
        nullif(reservation.data ->> 'name', ''),
        nullif(reservation.name, ''),
        profile.name,
        ''
      ) as name,
      coalesce(
        nullif(reservation.data ->> 'phone', ''),
        nullif(reservation.phone, ''),
        profile.phone,
        ''
      ) as phone,
      coalesce(
        nullif(reservation.data ->> 'district', ''),
        nullif(reservation.district, ''),
        profile.district,
        ''
      ) as district,
      coalesce(
        nullif(reservation.data ->> 'team', ''),
        nullif(reservation.team, ''),
        profile.team,
        ''
      ) as team,
      coalesce(
        nullif(reservation.data ->> 'campus', ''),
        nullif(reservation.campus, ''),
        profile.campus,
        ''
      ) as campus,
      coalesce(
        reservation.data -> 'stationPreferences',
        reservation.station_preferences,
        '[]'::jsonb
      ) as station_preferences,
      coalesce(reservation.status, nullif(reservation.data ->> 'status', ''), 'requested') as status,
      payment.status as payment_status,
      coalesce(
        nullif(reservation.confirmed_ticket, 'null'::jsonb),
        nullif(reservation.data -> 'confirmedTicket', 'null'::jsonb)
      ) as confirmed_ticket,
      coalesce(nullif(reservation.data ->> 'requestedAt', ''), reservation.created_at::text, '') as requested_at,
      coalesce(nullif(reservation.data ->> 'updatedAt', ''), reservation.updated_at::text) as updated_at,
      reservation.data as raw_data,
      true as has_reservation
    from public.reservations reservation
    left join public.profiles profile on profile.id = reservation.user_id
    left join public.payments payment on payment.reservation_id = reservation.id
  ),
  not_applied_people as (
    select
      'profile-' || profile.id::text as id,
      null::uuid as db_id,
      profile.id as user_id,
      profile.email,
      coalesce(profile.name, '') as name,
      coalesce(profile.phone, '') as phone,
      coalesce(profile.district, '') as district,
      coalesce(profile.team, '') as team,
      coalesce(profile.campus, '') as campus,
      '[]'::jsonb as station_preferences,
      'not_applied'::text as status,
      null::text as payment_status,
      null::jsonb as confirmed_ticket,
      ''::text as requested_at,
      null::text as updated_at,
      null::jsonb as raw_data,
      false as has_reservation
    from public.profiles profile
    where not exists (
      select 1
      from public.reservations reservation
      where reservation.user_id = profile.id
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
            'id', admin_role.id,
            'user_id', admin_role.user_id,
            'role', admin_role.role,
            'district', admin_role.district,
            'team', admin_role.team,
            'campus', admin_role.campus
          )
          order by admin_role.role, admin_role.id
        ) as admin_roles,
        array_agg(admin_role.role) as role_names
      from public.admin_roles admin_role
      where admin_role.user_id = person.user_id
    ) roles on true
  ),
  filtered as (
    select *
    from people_with_roles person
    where
      (
        p_status = 'all'
        or person.status = any(string_to_array(p_status, ','))
      )
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
      and (
        p_district = 'all'
        or (
          p_district = 'outside_seoul'
          and person.district <> ''
          and person.district <> '서울지구'
        )
        or person.district = p_district
      )
      and (p_campus = 'all' or person.campus = p_campus)
      and (p_campus_issue = 'all' or person.has_campus_issue)
      and (
        p_admin_role = 'all'
        or (
          'general' = any(string_to_array(p_admin_role, ','))
          and cardinality(person.role_names) = 0
        )
        or person.role_names && string_to_array(p_admin_role, ',')
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
      count(*) filter (
        where status not in ('cancelled', 'not_applied') and confirmed_ticket is not null
      )::integer as confirmed,
      count(*) filter (
        where status not in ('cancelled', 'not_applied') and confirmed_ticket is null
      )::integer as pending,
      count(*) filter (
        where status not in ('cancelled', 'not_applied') and payment_status = 'completed'
      )::integer as paid,
      count(*) filter (where status = 'cancelled')::integer as cancelled,
      count(*) filter (where status = 'not_applied')::integer as not_applied
    from people_with_roles
  ),
  district_summary as (
    select person.district as name
    from people_with_roles person
    where person.district <> ''
    group by person.district
  ),
  campus_summary as (
    select
      person.campus as name,
      count(*) filter (where has_campus_issue)::integer as issue_count,
      count(*) filter (where status = 'not_applied')::integer as not_applied_count,
      count(*) filter (
        where has_reservation and status <> 'cancelled' and payment_status is distinct from 'completed'
      )::integer as unpaid_count,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'user_id', admin_role.user_id,
              'name', coalesce(profile.name, ''),
              'phone', coalesce(profile.phone, ''),
              'email', profile.email
            )
            order by coalesce(profile.name, ''), admin_role.user_id
          )
          from public.admin_roles admin_role
          left join public.profiles profile on profile.id = admin_role.user_id
          where admin_role.role = 'campus_admin'
            and coalesce(admin_role.campus, '') = person.campus
        ),
        '[]'::jsonb
      ) as admins
    from people_with_roles person
    where person.campus <> ''
    group by person.campus
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
    'districts',
    coalesce(
      (
        select jsonb_agg(to_jsonb(district_summary) order by name collate "default")
        from district_summary
      ),
      '[]'::jsonb
    ),
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

revoke all on function public.get_admin_personal_ticket_page(integer, integer, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.get_admin_personal_ticket_page(integer, integer, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/130_personal_ticket_district_filter.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/131_return_complete_optimizer_config_after_save.sql
-- =========================================================

-- Return the complete optimizer configuration after saving editable values.

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
begin
  perform public.assert_allocation_planning_unlocked();
  perform public.save_allocation_optimizer_config_unlocked(
    p_capacity, p_price, p_recommended_minimum_passengers
  );
  return public.get_allocation_optimizer_config();
end;
$$;

revoke all on function public.save_allocation_optimizer_config(
  integer, integer, integer
) from public, anon;
grant execute on function public.save_allocation_optimizer_config(
  integer, integer, integer
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/131_return_complete_optimizer_config_after_save.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/132_performance_lookup_indexes.sql
-- =========================================================

-- Support message substring search and optimal result reuse lookups.

create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_campus_request_messages_message_trgm
  on public.campus_request_messages
  using gin (message extensions.gin_trgm_ops);

create index if not exists idx_allocation_optimization_jobs_optimal_reuse
  on public.allocation_optimization_jobs(
    optimization_scope,
    input_hash,
    completed_at desc
  )
  where status = 'OPTIMAL';

create or replace function public.get_reusable_allocation_optimization_job(
  p_job_id uuid,
  p_input_hash text,
  p_input_snapshot jsonb,
  p_optimization_scope text,
  p_detailed_settings jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', reusable.id,
    'result', reusable.result,
    'diagnostics', reusable.diagnostics,
    'best_known_bus_count', reusable.best_known_bus_count,
    'proven_bus_count', reusable.proven_bus_count
  )
  from public.allocation_optimization_jobs reusable
  where reusable.id <> p_job_id
    and reusable.status = 'OPTIMAL'
    and reusable.input_hash = p_input_hash
    and reusable.input_snapshot = p_input_snapshot
    and reusable.optimization_scope = p_optimization_scope
    and coalesce(reusable.detailed_settings, '{}'::jsonb)
      = coalesce(p_detailed_settings, '{}'::jsonb)
    and jsonb_typeof(reusable.result) = 'object'
  order by reusable.completed_at desc
  limit 1;
$$;

revoke all on function public.get_reusable_allocation_optimization_job(
  uuid, text, jsonb, text, jsonb
) from public, anon, authenticated;
grant execute on function public.get_reusable_allocation_optimization_job(
  uuid, text, jsonb, text, jsonb
) to service_role;

create or replace function public.get_campus_request_summary()
returns table (
  total bigint,
  notices bigint,
  open bigint,
  in_progress bigint,
  resolved bigint,
  on_hold bigint
)
language sql
stable
set search_path = public
as $$
  select
    count(*) filter (where not request.is_global_notice) as total,
    count(*) filter (where request.is_global_notice) as notices,
    count(*) filter (
      where not request.is_global_notice and request.status = 'open'
    ) as open,
    count(*) filter (
      where not request.is_global_notice and request.status = 'in_progress'
    ) as in_progress,
    count(*) filter (
      where not request.is_global_notice and request.status = 'resolved'
    ) as resolved,
    count(*) filter (
      where not request.is_global_notice and request.status = 'on_hold'
    ) as on_hold
  from public.campus_requests request;
$$;

revoke all on function public.get_campus_request_summary()
  from public, anon;
grant execute on function public.get_campus_request_summary()
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/132_performance_lookup_indexes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/133_prevent_stale_optimizer_result_reuse.sql
-- =========================================================

-- =========================================================
-- Prevent stale optimization snapshots from reusing completed results
-- =========================================================

create or replace function public.allocation_optimization_snapshot_is_current(
  p_input_snapshot jsonb
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_input_snapshot ->> 'active_reservations_hash', '')
    = coalesce(
      public.get_active_reservation_optimization_state() ->> 'hash',
      ''
    );
$$;

revoke all on function public.allocation_optimization_snapshot_is_current(jsonb)
  from public, anon, authenticated;

create or replace function public.get_reusable_allocation_optimization_job(
  p_job_id uuid,
  p_input_hash text,
  p_input_snapshot jsonb,
  p_optimization_scope text,
  p_detailed_settings jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', reusable.id,
    'result', reusable.result,
    'diagnostics', reusable.diagnostics,
    'best_known_bus_count', reusable.best_known_bus_count,
    'proven_bus_count', reusable.proven_bus_count
  )
  from public.allocation_optimization_jobs reusable
  where public.allocation_optimization_snapshot_is_current(p_input_snapshot)
    and reusable.id <> p_job_id
    and reusable.status = 'OPTIMAL'
    and reusable.input_hash = p_input_hash
    and reusable.input_snapshot = p_input_snapshot
    and reusable.optimization_scope = p_optimization_scope
    and coalesce(reusable.detailed_settings, '{}'::jsonb)
      = coalesce(p_detailed_settings, '{}'::jsonb)
    and jsonb_typeof(reusable.result) = 'object'
  order by reusable.completed_at desc
  limit 1;
$$;

create or replace function public.create_allocation_optimization_job()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_job public.allocation_optimization_jobs%rowtype;
  v_reusable public.allocation_optimization_jobs%rowtype;
begin
  v_job_id := public.create_uncached_allocation_optimization_job();

  select *
  into v_job
  from public.allocation_optimization_jobs
  where id = v_job_id;

  select reusable.*
  into v_reusable
  from public.allocation_optimization_jobs reusable
  where public.allocation_optimization_snapshot_is_current(v_job.input_snapshot)
    and reusable.id <> v_job.id
    and reusable.status = 'OPTIMAL'
    and reusable.optimization_scope = 'BASELINE'
    and reusable.input_hash = v_job.input_hash
    and reusable.input_snapshot = v_job.input_snapshot
    and jsonb_typeof(reusable.result) = 'object'
  order by reusable.completed_at desc
  limit 1;

  if v_reusable.id is not null then
    update public.allocation_optimization_jobs
    set
      status = 'OPTIMAL',
      started_at = now(),
      completed_at = now(),
      progress = 100,
      current_phase = 'completed',
      elapsed_seconds = 0,
      best_known_bus_count = v_reusable.best_known_bus_count,
      proven_bus_count = v_reusable.proven_bus_count,
      result = v_reusable.result,
      diagnostics = v_reusable.diagnostics,
      error_message = null
    where id = v_job.id
      and status = 'PENDING';

    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      v_job.id,
      'JOB_RESULT_REUSED',
      jsonb_build_object('source_job_id', v_reusable.id::text)
    );
  end if;

  return v_job.id;
end;
$$;

create or replace function public.create_detailed_allocation_optimization_job(
  p_source_job_id uuid,
  p_skipped_phases text[],
  p_resume_from_job_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.allocation_optimization_jobs%rowtype;
  v_resume public.allocation_optimization_jobs%rowtype;
  v_reusable public.allocation_optimization_jobs%rowtype;
  v_job_id uuid;
  v_base_source_job_id uuid;
  v_skipped_phases text[];
  v_settings jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can create detailed allocation jobs.';
  end if;
  if exists (
    select 1 from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Another allocation optimization job is already active.';
  end if;

  select * into v_source
  from public.allocation_optimization_jobs
  where id = p_source_job_id;

  if v_source.id is null
    or v_source.status <> 'OPTIMAL'
    or jsonb_typeof(v_source.result) <> 'object' then
    raise exception 'A completed optimal allocation job is required.';
  end if;

  v_base_source_job_id := case
    when v_source.optimization_scope = 'BASELINE' then v_source.id
    else v_source.source_job_id
  end;
  if v_base_source_job_id is null then
    raise exception 'A baseline source job is required.';
  end if;

  select coalesce(array_agg(phase order by phase), '{}'::text[])
  into v_skipped_phases
  from (
    select distinct unnest(coalesce(p_skipped_phases, '{}'::text[])) as phase
  ) phases
  where phase = any(array[
    'campus_bus_uses',
    'campus_distribution_imbalance',
    'campus_isolated_groups',
    'campus_odd_groups',
    'team_bus_uses',
    'team_distribution_imbalance',
    'destination_occupancy_imbalance'
  ]::text[]);

  if cardinality(v_skipped_phases)
    <> cardinality(coalesce(p_skipped_phases, '{}'::text[])) then
    raise exception 'Detailed allocation skipped phases contain an invalid value.';
  end if;

  v_settings := jsonb_build_object('skipped_phases', to_jsonb(v_skipped_phases));

  if p_resume_from_job_id is not null then
    select * into v_resume
    from public.allocation_optimization_jobs
    where id = p_resume_from_job_id
      and status = 'OPTIMAL'
      and optimization_scope = 'DETAILED'
      and input_snapshot = v_source.input_snapshot;
  else
    select * into v_resume
    from public.allocation_optimization_jobs
    where status = 'OPTIMAL'
      and optimization_scope = 'DETAILED'
      and input_snapshot = v_source.input_snapshot
    order by completed_at desc
    limit 1;
  end if;

  insert into public.allocation_optimization_jobs (
    status, requested_by, input_hash, input_snapshot, optimization_scope,
    source_job_id, detailed_settings, resume_from_job_id
  )
  values (
    'PENDING', auth.uid(), v_source.input_hash, v_source.input_snapshot, 'DETAILED',
    v_base_source_job_id, v_settings, v_resume.id
  )
  returning id into v_job_id;

  select reusable.* into v_reusable
  from public.allocation_optimization_jobs reusable
  where public.allocation_optimization_snapshot_is_current(v_source.input_snapshot)
    and reusable.id <> v_job_id
    and reusable.status = 'OPTIMAL'
    and reusable.optimization_scope = 'DETAILED'
    and reusable.input_snapshot = v_source.input_snapshot
    and reusable.detailed_settings = v_settings
    and jsonb_typeof(reusable.result) = 'object'
  order by reusable.completed_at desc
  limit 1;

  if v_reusable.id is not null then
    update public.allocation_optimization_jobs
    set status = 'OPTIMAL', started_at = now(), completed_at = now(),
      progress = 100, current_phase = 'completed', elapsed_seconds = 0,
      best_known_bus_count = v_reusable.best_known_bus_count,
      proven_bus_count = v_reusable.proven_bus_count,
      result = v_reusable.result, diagnostics = v_reusable.diagnostics,
      error_message = null
    where id = v_job_id and status = 'PENDING';

    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      v_job_id, 'JOB_RESULT_REUSED',
      jsonb_build_object('source_job_id', v_reusable.id::text)
    );
  else
    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      v_job_id, 'DETAILED_JOB_CREATED',
      jsonb_build_object(
        'source_job_id', v_base_source_job_id::text,
        'resume_from_job_id', v_resume.id::text,
        'skipped_phases', to_jsonb(v_skipped_phases)
      )
    );
  end if;

  return v_job_id;
end;
$$;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/133_prevent_stale_optimizer_result_reuse.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/134_safe_reset_allocation_optimization_jobs.sql
-- =========================================================

-- =========================================================
-- Safely reset allocation optimization history and cache
-- =========================================================

create or replace function public.reset_allocation_optimization_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
  v_status_counts jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can reset allocation optimization jobs.';
  end if;

  -- Prevent a new job from being inserted after the active-job check.
  lock table public.allocation_optimization_jobs in share row exclusive mode;

  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Cancel the active allocation optimization job before resetting.';
  end if;

  select
    coalesce(sum(status_counts.job_count), 0)::integer,
    coalesce(jsonb_object_agg(status_counts.status, status_counts.job_count), '{}'::jsonb)
  into v_deleted_count, v_status_counts
  from (
    select status, count(*)::integer as job_count
    from public.allocation_optimization_jobs
    group by status
  ) status_counts;

  -- Explicit cleanup also supports deployments whose older foreign keys did
  -- not yet receive the intended cascade and set-null actions.
  delete from public.allocation_optimization_events;

  update public.allocation_optimization_jobs
  set
    source_job_id = null,
    resume_from_job_id = null
  where source_job_id is not null
    or resume_from_job_id is not null;

  delete from public.allocation_optimization_jobs;

  if to_regclass('public.admin_action_audit_logs') is not null then
    insert into public.admin_action_audit_logs (
      actor_id,
      action,
      resource_type,
      before_data,
      after_data
    )
    values (
      auth.uid(),
      'reset',
      'allocation_optimization_jobs',
      jsonb_build_object(
        'deleted_count', v_deleted_count,
        'status_counts', v_status_counts
      ),
      jsonb_build_object('remaining_count', 0)
    );
  end if;

  return v_deleted_count;
end;
$$;

revoke all on function public.reset_allocation_optimization_jobs()
  from public, anon;
grant execute on function public.reset_allocation_optimization_jobs()
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/134_safe_reset_allocation_optimization_jobs.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/135_split_allocation_deadline_triggers.sql
-- =========================================================

-- =========================================================
-- Keep reservation-deadline triggers specific to each row shape
-- =========================================================

create or replace function public.assert_allocation_planning_unlocked()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.allocation_confirmation_write', true) = 'on' then
    return;
  end if;

  if exists (
    select 1
    from public.bus_allocations
    where allocation_data ->> 'status' = 'confirmed'
  ) then
    raise exception 'Cancel the confirmed allocation before using allocation planning.';
  end if;
end;
$$;

create or replace function public.require_closed_reservation_deadline_for_optimization_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deadline_at timestamptz;
begin
  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_at is null or v_deadline_at > clock_timestamp() then
    raise exception 'Allocation is available only after the reservation deadline.';
  end if;

  return new;
end;
$$;

create or replace function public.require_closed_reservation_deadline_for_bus_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deadline_at timestamptz;
begin
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'allocation_data' - 'updated_at' - 'revision')
      = (to_jsonb(old) - 'allocation_data' - 'updated_at' - 'revision')
    and (new.allocation_data - 'editLock') = (old.allocation_data - 'editLock')
    and new.revision = old.revision + 1 then
    return new;
  end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_at is null or v_deadline_at > clock_timestamp() then
    raise exception 'Allocation is available only after the reservation deadline.';
  end if;

  return new;
end;
$$;

drop trigger if exists require_closed_deadline_for_allocation_job
  on public.allocation_optimization_jobs;
create trigger require_closed_deadline_for_allocation_job
before insert on public.allocation_optimization_jobs
for each row execute function public.require_closed_reservation_deadline_for_optimization_job();

drop trigger if exists require_closed_deadline_for_bus_allocation
  on public.bus_allocations;
create trigger require_closed_deadline_for_bus_allocation
before insert or update on public.bus_allocations
for each row execute function public.require_closed_reservation_deadline_for_bus_allocation();

drop function if exists public.require_closed_reservation_deadline_for_allocation();

revoke all on function public.assert_allocation_planning_unlocked()
  from public, anon, authenticated;
revoke all on function public.require_closed_reservation_deadline_for_optimization_job()
  from public, anon, authenticated;
revoke all on function public.require_closed_reservation_deadline_for_bus_allocation()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/135_split_allocation_deadline_triggers.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/136_allow_external_reservations_without_team.sql
-- =========================================================

-- =========================================================
-- Allow external reservations without a team in optimizer snapshots
-- =========================================================

create or replace function public.create_uncached_allocation_optimization_job()
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
  v_active_reservation_count integer;
  v_active_reservations_hash text;
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

  select
    count(*)::integer,
    md5(
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', reservation.id::text,
            'status', reservation.status,
            'updated_at', reservation.updated_at
          )
          order by reservation.id
        )::text,
        '[]'
      )
    )
  into v_active_reservation_count, v_active_reservations_hash
  from public.reservations reservation
  where reservation.status is distinct from 'cancelled';

  with active_reservations as (
    select
      reservation.id,
      coalesce(
        nullif(reservation.data ->> 'campus', ''),
        nullif(reservation.campus, '')
      ) as campus,
      coalesce(
        nullif(reservation.data ->> 'team', ''),
        nullif(reservation.team, ''),
        case when reservation.affiliation_type = 'external' then '-' end
      ) as team,
      case
        when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
          then reservation.data -> 'stationPreferences'
        else coalesce(reservation.station_preferences, '[]'::jsonb)
      end as preferences
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
      and not coalesce(reservation.data ? 'remainingSeatClaim', false)
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
      coalesce(
        nullif(reservation.data ->> 'campus', ''),
        nullif(reservation.campus, '')
      ) as campus,
      coalesce(
        nullif(reservation.data ->> 'team', ''),
        nullif(reservation.team, ''),
        case when reservation.affiliation_type = 'external' then '-' end
      ) as team,
      case
        when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
          then reservation.data -> 'stationPreferences'
        else coalesce(reservation.station_preferences, '[]'::jsonb)
      end as preferences,
      reservation.created_at
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
      and not coalesce(reservation.data ? 'remainingSeatClaim', false)
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
    'passengers', v_passengers,
    'active_reservation_count', v_active_reservation_count,
    'active_reservations_hash', v_active_reservations_hash
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
      'active_reservation_count', v_active_reservation_count,
      'input_hash', md5(v_snapshot::text)
    )
  );

  return v_job_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Allocation optimizer configuration contains invalid numbers.';
end;
$$;

revoke all on function public.create_uncached_allocation_optimization_job()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/136_allow_external_reservations_without_team.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/137_enable_signup_email_availability_check.sql
-- =========================================================

-- Signup step 1 intentionally checks whether an email is already registered.
grant execute on function public.email_exists(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/137_enable_signup_email_availability_check.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/138_admin_invitation_codes.sql
-- =========================================================

-- =========================================================
-- Administrator invitation codes
-- =========================================================

create table if not exists public.admin_invitation_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash bytea not null unique,
  code text,
  code_hint text not null,
  role text not null check (role in ('campus_admin', 'boarding_manager')),
  campus_id uuid references public.campuses(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '14 days'),
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  constraint admin_invitation_codes_role_scope_check check (
    (role = 'campus_admin' and campus_id is not null)
    or (role = 'boarding_manager' and campus_id is null)
  ),
  constraint admin_invitation_codes_usage_check check (
    (used_by is null and used_at is null)
    or used_at is not null
  )
);

alter table public.admin_invitation_codes
  drop constraint if exists admin_invitation_codes_usage_check;
alter table public.admin_invitation_codes
  add constraint admin_invitation_codes_usage_check check (
    (used_by is null and used_at is null)
    or used_at is not null
  );

create index if not exists idx_admin_invitation_codes_created
  on public.admin_invitation_codes(created_at desc);
create index if not exists idx_admin_invitation_codes_campus
  on public.admin_invitation_codes(campus_id, created_at desc)
  where role = 'campus_admin';

alter table public.admin_invitation_codes enable row level security;

drop trigger if exists audit_admin_invitation_code_operation
  on public.admin_invitation_codes;
create trigger audit_admin_invitation_code_operation
after insert or update or delete on public.admin_invitation_codes
for each row execute function public.audit_admin_operation();

drop policy if exists "Global admins can view invitation codes"
  on public.admin_invitation_codes;
create policy "Global admins can view invitation codes"
on public.admin_invitation_codes for select to authenticated
using (public.is_global_admin());

grant select on public.admin_invitation_codes to authenticated;
revoke insert, update, delete on public.admin_invitation_codes
  from public, anon, authenticated;

create or replace function public.normalize_admin_invitation_code(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
$$;

revoke all on function public.normalize_admin_invitation_code(text)
  from public, anon, authenticated;

create or replace function public.validate_admin_invitation_codes(p_codes text[])
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_codes text[] := coalesce(p_codes, array[]::text[]);
  v_normalized text;
  v_invitation public.admin_invitation_codes%rowtype;
  v_index integer;
  v_results jsonb := '[]'::jsonb;
  v_campus_name text;
begin
  if cardinality(v_codes) > 10 then
    return jsonb_build_object(
      'valid', false,
      'errorCode', 'too_many_codes',
      'errorMessage', 'Up to 10 invitation codes can be used at once.'
    );
  end if;

  for v_index in 1..cardinality(v_codes) loop
    v_normalized := public.normalize_admin_invitation_code(v_codes[v_index]);

    if char_length(v_normalized) <> 24 then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'invalid_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code is invalid.'
      );
    end if;

    if exists (
      select 1
      from unnest(v_codes[1:v_index - 1]) previous_code
      where public.normalize_admin_invitation_code(previous_code) = v_normalized
    ) then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'duplicate_code',
        'errorIndex', v_index,
        'errorMessage', 'The same invitation code was entered more than once.'
      );
    end if;

    select * into v_invitation
    from public.admin_invitation_codes invitation
    where invitation.code_hash = digest(v_normalized, 'sha256');

    if not found then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'invalid_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code is invalid.'
      );
    end if;
    if v_invitation.cancelled_at is not null then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'cancelled_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code was cancelled.'
      );
    end if;
    if v_invitation.used_at is not null then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'used_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code was already used.'
      );
    end if;
    if v_invitation.expires_at <= clock_timestamp() then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'expired_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code expired.'
      );
    end if;

    if v_invitation.role = 'campus_admin' and exists (
      select 1 from public.admin_roles role
      where role.role = 'campus_admin'
        and role.campus_id = v_invitation.campus_id
    ) then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'campus_already_assigned',
        'errorIndex', v_index,
        'errorMessage', 'This campus already has an active campus administrator.'
      );
    end if;

    select campus.name into v_campus_name
    from public.campuses campus
    where campus.id = v_invitation.campus_id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'index', v_index,
      'role', v_invitation.role,
      'campusId', v_invitation.campus_id,
      'campus', v_campus_name
    ));
  end loop;

  return jsonb_build_object('valid', true, 'invitations', v_results);
end;
$$;

revoke all on function public.validate_admin_invitation_codes(text[]) from public;
grant execute on function public.validate_admin_invitation_codes(text[])
  to anon, authenticated;

create or replace function public.redeem_admin_invitation_codes_for_user(
  p_user_id uuid,
  p_codes text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_validation jsonb;
  v_code text;
  v_normalized text;
  v_invitation public.admin_invitation_codes%rowtype;
  v_campus record;
  v_granted jsonb := '[]'::jsonb;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users where id = p_user_id
  ) then
    raise exception 'Invitation code user was not found.';
  end if;

  if cardinality(coalesce(p_codes, array[]::text[])) = 0 then
    return jsonb_build_object('granted', v_granted);
  end if;

  perform 1
  from public.admin_invitation_codes invitation
  where invitation.code_hash in (
    select digest(public.normalize_admin_invitation_code(code), 'sha256')
    from unnest(p_codes) code
  )
  order by invitation.id
  for update;

  v_validation := public.validate_admin_invitation_codes(p_codes);
  if not coalesce((v_validation ->> 'valid')::boolean, false) then
    raise exception '%', v_validation ->> 'errorMessage';
  end if;

  foreach v_code in array p_codes loop
    v_normalized := public.normalize_admin_invitation_code(v_code);

    select * into strict v_invitation
    from public.admin_invitation_codes invitation
    where invitation.code_hash = digest(v_normalized, 'sha256');

    if v_invitation.role = 'campus_admin' then
      select
        district.id as district_id,
        district.name as district,
        team.id as team_id,
        team.name as team,
        campus.id as campus_id,
        campus.name as campus
      into strict v_campus
      from public.campuses campus
      join public.teams team on team.id = campus.team_id
      join public.districts district on district.id = team.district_id
      where campus.id = v_invitation.campus_id;

      insert into public.admin_roles (
        user_id, role,
        district_id, district, team_id, team, campus_id, campus,
        granted_by, updated_at
      )
      values (
        p_user_id, 'campus_admin',
        v_campus.district_id, v_campus.district,
        v_campus.team_id, v_campus.team,
        v_campus.campus_id, v_campus.campus,
        v_invitation.created_by, clock_timestamp()
      );
    else
      if exists (
        select 1 from public.admin_roles role
        where role.user_id = p_user_id
          and role.role = 'boarding_manager'
      ) then
        raise exception 'This user is already a boarding manager.';
      end if;

      insert into public.admin_roles (
        user_id, role, granted_by, updated_at
      )
      values (
        p_user_id, 'boarding_manager',
        v_invitation.created_by, clock_timestamp()
      );
    end if;

    update public.admin_invitation_codes
    set used_by = p_user_id, used_at = clock_timestamp()
    where id = v_invitation.id;

    v_granted := v_granted || jsonb_build_array(jsonb_build_object(
      'role', v_invitation.role,
      'campusId', v_invitation.campus_id
    ));
  end loop;

  return jsonb_build_object('granted', v_granted);
end;
$$;

revoke all on function public.redeem_admin_invitation_codes_for_user(uuid, text[])
  from public, anon, authenticated;

create or replace function public.redeem_admin_invitation_codes(p_codes text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Login is required.';
  end if;

  return public.redeem_admin_invitation_codes_for_user(auth.uid(), p_codes);
end;
$$;

revoke all on function public.redeem_admin_invitation_codes(text[])
  from public, anon;
grant execute on function public.redeem_admin_invitation_codes(text[])
  to authenticated;

create or replace function public.create_admin_invitation_code(
  p_role text,
  p_campus_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raw text := upper(encode(gen_random_bytes(12), 'hex'));
  v_code text;
  v_invitation public.admin_invitation_codes%rowtype;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create invitation codes.';
  end if;
  if p_role not in ('campus_admin', 'boarding_manager') then
    raise exception 'Unsupported invitation role.';
  end if;
  if p_role = 'campus_admin' and p_campus_id is null then
    raise exception 'Campus administrator invitations require a campus.';
  end if;
  if p_role = 'boarding_manager' and p_campus_id is not null then
    raise exception 'Boarding manager invitations cannot have a campus.';
  end if;
  if p_role = 'campus_admin' and not exists (
    select 1 from public.campuses where id = p_campus_id
  ) then
    raise exception 'Campus was not found.';
  end if;
  if p_role = 'campus_admin' then
    perform pg_advisory_xact_lock(
      hashtextextended('admin-invitation-campus:' || p_campus_id::text, 0)
    );
  end if;
  if p_role = 'campus_admin' and exists (
    select 1 from public.admin_roles role
    where role.role = 'campus_admin' and role.campus_id = p_campus_id
  ) then
    raise exception 'This campus already has an active campus administrator.';
  end if;
  if p_role = 'campus_admin' and exists (
    select 1 from public.admin_invitation_codes invitation
    where invitation.role = 'campus_admin'
      and invitation.campus_id = p_campus_id
      and invitation.used_at is null
      and invitation.cancelled_at is null
      and invitation.expires_at > clock_timestamp()
  ) then
    raise exception 'This campus already has an active invitation code.';
  end if;

  v_code := concat(
    substr(v_raw, 1, 6), '-',
    substr(v_raw, 7, 6), '-',
    substr(v_raw, 13, 6), '-',
    substr(v_raw, 19, 6)
  );

  insert into public.admin_invitation_codes (
    code_hash, code, code_hint, role, campus_id, created_by
  )
  values (
    digest(v_raw, 'sha256'),
    v_code,
    concat(substr(v_raw, 1, 4), '-****-', substr(v_raw, 21, 4)),
    p_role,
    p_campus_id,
    auth.uid()
  )
  returning * into v_invitation;

  return jsonb_build_object(
    'id', v_invitation.id,
    'code', v_code,
    'expiresAt', v_invitation.expires_at
  );
end;
$$;

revoke all on function public.create_admin_invitation_code(text, uuid)
  from public, anon;
grant execute on function public.create_admin_invitation_code(text, uuid)
  to authenticated;

create or replace function public.cancel_admin_invitation_code(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can cancel invitation codes.';
  end if;

  update public.admin_invitation_codes
  set cancelled_by = auth.uid(), cancelled_at = clock_timestamp()
  where id = p_invitation_id
    and used_at is null
    and cancelled_at is null
    and expires_at > clock_timestamp()
  returning id into v_updated_id;

  return v_updated_id is not null;
end;
$$;

revoke all on function public.cancel_admin_invitation_code(uuid)
  from public, anon;
grant execute on function public.cancel_admin_invitation_code(uuid)
  to authenticated;

create or replace function public.cleanup_admin_invitation_codes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_invitations integer;
  v_deleted_audit_logs integer;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can clean up invitation codes.';
  end if;

  delete from public.admin_invitation_codes invitation
  where invitation.cancelled_at is not null
    or (
      invitation.used_at is null
      and invitation.expires_at <= clock_timestamp()
    )
    or invitation.used_at <= clock_timestamp() - interval '30 days';

  get diagnostics v_deleted_invitations = row_count;

  delete from public.admin_action_audit_logs audit_log
  where audit_log.resource_type = 'admin_invitation_codes'
    and audit_log.created_at <= clock_timestamp() - interval '1 year';

  get diagnostics v_deleted_audit_logs = row_count;

  return jsonb_build_object(
    'deletedInvitations', v_deleted_invitations,
    'deletedAuditLogs', v_deleted_audit_logs
  );
end;
$$;

revoke all on function public.cleanup_admin_invitation_codes()
  from public, anon;
grant execute on function public.cleanup_admin_invitation_codes()
  to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliation_type text :=
    case
      when new.raw_user_meta_data ->> 'affiliation_type' = 'external'
        then 'external'
      else 'seoul'
    end;
  v_invitation_codes text[];
begin
  insert into public.profiles (
    id, email, name, phone,
    district_id, district, team_id, team, campus_id, campus,
    affiliation_type, coordinator_name, coordinator_phone,
    account_source, updated_at
  )
  values (
    new.id,
    lower(new.email),
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'phone',
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'district_id', '')::uuid end,
    new.raw_user_meta_data ->> 'district',
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'team_id', '')::uuid end,
    case when v_affiliation_type = 'seoul'
      then new.raw_user_meta_data ->> 'team' else '' end,
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'campus_id', '')::uuid end,
    new.raw_user_meta_data ->> 'campus',
    v_affiliation_type,
    case when v_affiliation_type = 'external'
      then new.raw_user_meta_data ->> 'coordinator_name' end,
    case when v_affiliation_type = 'external'
      then new.raw_user_meta_data ->> 'coordinator_phone' end,
    case
      when new.raw_user_meta_data ->> 'account_source' = 'admin_created'
        then 'admin_created'
      else 'self_signup'
    end,
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
    affiliation_type = excluded.affiliation_type,
    coordinator_name = excluded.coordinator_name,
    coordinator_phone = excluded.coordinator_phone,
    account_source = excluded.account_source,
    updated_at = now();

  select coalesce(array_agg(value), array[]::text[])
  into v_invitation_codes
  from jsonb_array_elements_text(
    coalesce(new.raw_user_meta_data -> 'invitation_codes', '[]'::jsonb)
  ) value;

  perform public.redeem_admin_invitation_codes_for_user(
    new.id,
    v_invitation_codes
  );

  return new;
end;
$$;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/138_admin_invitation_codes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/139_fix_allocation_draft_reservation_normalization.sql
-- =========================================================

-- =========================================================
-- Keep draft validation aligned with optimizer reservation normalization
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
      and not coalesce(reservation.data ? 'remainingSeatClaim', false)
  ) <> v_passenger_count
    or exists (
      select 1
      from public.reservations reservation
      where reservation.status is distinct from 'cancelled'
        and not coalesce(reservation.data ? 'remainingSeatClaim', false)
        and not exists (
          select 1
          from jsonb_array_elements(v_snapshot -> 'passengers') passenger
          where passenger ->> 'reservation_id' = reservation.id::text
            and passenger ->> 'campus' = coalesce(
              nullif(reservation.data ->> 'campus', ''),
              nullif(reservation.campus, '')
            )
            and passenger ->> 'team' = coalesce(
              nullif(reservation.data ->> 'team', ''),
              nullif(reservation.team, ''),
              case when reservation.affiliation_type = 'external' then '-' end
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
  where reservation.status is distinct from 'cancelled'
    and not coalesce(reservation.data ? 'remainingSeatClaim', false);

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
-- END sql/setup/139_fix_allocation_draft_reservation_normalization.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/140_boarding_field_exceptions.sql
-- =========================================================

-- Manage last-minute bus moves and walk-in passengers during boarding.

create table if not exists public.boarding_walk_in_passengers (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  bus_id text not null,
  seat_number integer not null check (seat_number > 0),
  name text not null,
  phone text not null,
  campus text not null default '',
  boarding_status text not null default 'unchecked'
    check (boarding_status in ('unchecked', 'boarded', 'no_show')),
  boarding_note text,
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  boarding_status_updated_by uuid references auth.users(id) on delete set null,
  boarding_status_updated_at timestamptz,
  boarding_no_show_departure_id uuid references public.boarding_bus_departures(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (allocation_id, bus_id, seat_number)
);

alter table public.boarding_walk_in_passengers enable row level security;
revoke all on public.boarding_walk_in_passengers from public, anon, authenticated;

create or replace function public.validate_boarding_walk_in_seat_conflicts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.allocation_data ->> 'status' <> 'confirmed' then
    return new;
  end if;

  if exists (
    select 1
    from public.boarding_walk_in_passengers walk_in
    left join lateral (
      select bus
      from jsonb_array_elements(new.allocation_data -> 'buses') bus
      where bus ->> 'id' = walk_in.bus_id
    ) matched_bus on true
    where walk_in.allocation_id = new.id
      and (
        matched_bus.bus is null
        or walk_in.seat_number > (matched_bus.bus ->> 'capacity')::integer
        or exists (
          select 1
          from jsonb_array_elements(new.allocation_data -> 'passengers') passenger
          where passenger ->> 'busId' = walk_in.bus_id
            and (passenger ->> 'seatNumber')::integer = walk_in.seat_number
        )
      )
  ) then
    raise exception 'Confirmed allocation conflicts with a walk-in passenger seat.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_boarding_walk_in_seat_conflicts
  on public.bus_allocations;
create trigger validate_boarding_walk_in_seat_conflicts
before insert or update of allocation_data on public.bus_allocations
for each row execute function public.validate_boarding_walk_in_seat_conflicts();

create or replace function public.move_boarding_passenger_as_global_admin(
  p_reservation_id uuid,
  p_target_bus_id text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_reservation public.reservations%rowtype;
  v_target_bus jsonb;
  v_source_bus_id text;
  v_seat_number integer;
  v_passenger jsonb;
  v_passengers jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can move boarding passengers.';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A move reason is required.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'Confirmed passenger not found.'; end if;

  v_source_bus_id := public.get_confirmed_ticket_bus_id(
    v_reservation.id,
    v_reservation.confirmed_ticket
  );
  if not public.can_manage_boarding_bus(v_allocation.id, v_source_bus_id) then
    raise exception 'You are not assigned to the source bus.';
  end if;

  select bus into v_target_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_target_bus_id;
  if v_target_bus is null then raise exception 'Target bus not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_target_bus_id) then
    raise exception 'You are not assigned to the target bus.';
  end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id in (v_source_bus_id, p_target_bus_id)
      and cancelled_at is null
  ) then
    raise exception 'Departed buses cannot receive passenger moves.';
  end if;
  select candidate.seat_number into v_seat_number
  from generate_series(1, (v_target_bus ->> 'capacity')::integer) candidate(seat_number)
  where not exists (
      select 1
      from jsonb_array_elements(v_allocation.allocation_data -> 'passengers') passenger
      where passenger ->> 'reservationId' <> p_reservation_id::text
        and passenger ->> 'busId' = p_target_bus_id
        and (passenger ->> 'seatNumber')::integer = candidate.seat_number
    )
    and not exists (
      select 1 from public.boarding_walk_in_passengers walk_in
      where walk_in.allocation_id = v_allocation.id
        and walk_in.bus_id = p_target_bus_id
        and walk_in.seat_number = candidate.seat_number
    )
  order by candidate.seat_number
  limit 1;
  if v_seat_number is null then
    raise exception 'The target bus has no remaining capacity.';
  end if;

  v_passenger := jsonb_build_object(
    'reservationId', p_reservation_id::text,
    'name', coalesce(v_reservation.name, '-'),
    'phone', coalesce(v_reservation.phone, '-'),
    'campus', coalesce(v_reservation.campus, '-'),
    'team', coalesce(v_reservation.team, '-'),
    'preferences', '[]'::jsonb,
    'busId', p_target_bus_id,
    'seatNumber', v_seat_number,
    'source', 'admin'
  );

  select coalesce(jsonb_agg(passenger.value order by passenger.ordinality), '[]'::jsonb)
  into v_passengers
  from jsonb_array_elements(v_allocation.allocation_data -> 'passengers')
    with ordinality passenger(value, ordinality)
  where passenger.value ->> 'reservationId' <> p_reservation_id::text;

  update public.bus_allocations
  set allocation_data = jsonb_set(
        allocation_data,
        '{passengers}',
        v_passengers || jsonb_build_array(v_passenger),
        true
      ),
      revision = revision + 1,
      updated_at = v_now
  where id = v_allocation.id;

  update public.reservations
  set confirmed_ticket = jsonb_set(
        jsonb_set(
          jsonb_set(confirmed_ticket, '{busId}', to_jsonb(p_target_bus_id), true),
          '{busNumber}', to_jsonb(v_target_bus ->> 'label'), true
        ),
        '{seatNumber}', to_jsonb(v_seat_number::text), true
      ),
      boarding_status = 'unchecked',
      boarding_confirmed_at = null,
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null,
      boarding_note = concat_ws(
        E'\n',
        nullif(boarding_note, ''),
        '[호차 이동] ' || btrim(p_reason)
      ),
      boarding_note_updated_at = v_now,
      boarding_note_updated_by = auth.uid(),
      updated_at = v_now
  where id = p_reservation_id;

  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  ) values (
    p_reservation_id,
    v_reservation.boarding_status,
    'unchecked',
    auth.uid(),
    'boarding_bus_moved'
  );
end;
$$;

create or replace function public.add_boarding_walk_in_as_global_admin(
  p_bus_id text,
  p_seat_number integer,
  p_name text,
  p_phone text,
  p_campus text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_id uuid;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can add walk-in passengers.';
  end if;
  if p_seat_number is null or p_seat_number < 1 then
    raise exception 'A valid seat number is required.';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null
    or nullif(btrim(coalesce(p_phone, '')), '') is null
    or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Name, phone, and reason are required.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Target bus not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = p_bus_id
      and cancelled_at is null
  ) then
    raise exception 'Departed buses cannot receive walk-in passengers.';
  end if;
  if p_seat_number > (v_bus ->> 'capacity')::integer then
    raise exception 'The selected seat number exceeds the bus capacity.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_allocation.allocation_data -> 'passengers') passenger
    where passenger ->> 'busId' = p_bus_id
      and (passenger ->> 'seatNumber')::integer = p_seat_number
  ) then
    raise exception 'The selected seat number is already assigned.';
  end if;

  insert into public.boarding_walk_in_passengers (
    allocation_id, bus_id, seat_number, name, phone, campus, reason, created_by
  ) values (
    v_allocation.id,
    p_bus_id,
    p_seat_number,
    btrim(p_name),
    btrim(p_phone),
    btrim(coalesce(p_campus, '')),
    btrim(p_reason),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'The selected seat number is already assigned.';
end;
$$;

create or replace function public.set_walk_in_boarding_status(
  p_walk_in_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_walk_in public.boarding_walk_in_passengers%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;

  select * into v_walk_in
  from public.boarding_walk_in_passengers
  where id = p_walk_in_id
  for update;
  if not found then raise exception 'Walk-in passenger not found.'; end if;
  if not public.can_manage_boarding_bus(v_walk_in.allocation_id, v_walk_in.bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if p_status = 'no_show' and not exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_walk_in.allocation_id
      and bus_id = v_walk_in.bus_id
      and cancelled_at is null
  ) then
    raise exception 'No-show status is available after bus departure.';
  end if;

  update public.boarding_walk_in_passengers
  set boarding_status = p_status,
      boarding_status_updated_by = auth.uid(),
      boarding_status_updated_at = clock_timestamp(),
      boarding_no_show_departure_id = null,
      updated_at = clock_timestamp()
  where id = p_walk_in_id;
end;
$$;

create or replace function public.mark_boarding_bus_departed(p_bus_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_departure_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can mark departure.';
  end if;

  select * into v_allocation from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Bus not found.'; end if;

  insert into public.boarding_bus_departures (
    allocation_id, bus_id, bus_label, departed_at, departed_by
  ) values (
    v_allocation.id, p_bus_id, v_bus ->> 'label', v_now, auth.uid()
  ) returning id into v_departure_id;

  with changed as (
    update public.reservations reservation
    set boarding_status = 'no_show',
        boarding_confirmed_at = null,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = v_departure_id
    where reservation.status = 'confirmed'
      and reservation.boarding_status = 'unchecked'
      and public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket) = p_bus_id
    returning reservation.id
  )
  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  )
  select id, 'unchecked', 'no_show', auth.uid(), 'bus_departed_auto_no_show'
  from changed;

  update public.boarding_walk_in_passengers
  set boarding_status = 'no_show',
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = v_departure_id,
      updated_at = v_now
  where allocation_id = v_allocation.id
    and bus_id = p_bus_id
    and boarding_status = 'unchecked';

  return v_departure_id;
end;
$$;

create or replace function public.cancel_boarding_bus_departure(p_bus_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_departure public.boarding_bus_departures%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can cancel departure.';
  end if;

  select * into v_departure
  from public.boarding_bus_departures
  where bus_id = p_bus_id and cancelled_at is null
  order by departed_at desc
  limit 1
  for update;
  if not found then raise exception 'Active bus departure not found.'; end if;
  if not public.can_manage_boarding_bus(v_departure.allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  with changed as (
    update public.reservations
    set boarding_status = 'unchecked',
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = null
    where boarding_no_show_departure_id = v_departure.id
      and boarding_status = 'no_show'
    returning id
  )
  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  )
  select id, 'no_show', 'unchecked', auth.uid(), 'bus_departure_cancelled_auto_restore'
  from changed;

  update public.boarding_walk_in_passengers
  set boarding_status = 'unchecked',
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null,
      updated_at = v_now
  where boarding_no_show_departure_id = v_departure.id
    and boarding_status = 'no_show';

  update public.boarding_bus_departures
  set cancelled_at = v_now, cancelled_by = auth.uid()
  where id = v_departure.id;
end;
$$;

create or replace function public.update_walk_in_boarding_note(
  p_walk_in_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_walk_in public.boarding_walk_in_passengers%rowtype;
begin
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'Boarding notes must be 500 characters or fewer.';
  end if;
  select * into v_walk_in
  from public.boarding_walk_in_passengers
  where id = p_walk_in_id;
  if not found then raise exception 'Walk-in passenger not found.'; end if;
  if not public.can_manage_boarding_bus(v_walk_in.allocation_id, v_walk_in.bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  update public.boarding_walk_in_passengers
  set boarding_note = nullif(btrim(coalesce(p_note, '')), ''),
      updated_at = clock_timestamp()
  where id = p_walk_in_id;
end;
$$;

create or replace function public.get_boarding_management_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can view boarding management.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then return null; end if;

  return jsonb_build_object(
    'allocationId', v_allocation.id,
    'allocationName', v_allocation.allocation_name,
    'buses', (
      select coalesce(jsonb_agg(
        bus || jsonb_build_object(
          'departedAt', departure.departed_at,
          'departedBy', departure.departed_by,
          'checkInCode', case when code.expires_at > clock_timestamp() then code.check_in_code else null end,
          'checkInCodeExpiresAt', code.expires_at
        ) order by bus ->> 'label'
      ), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
      left join public.boarding_bus_departures departure
        on departure.allocation_id = v_allocation.id
       and departure.bus_id = bus ->> 'id'
       and departure.cancelled_at is null
      left join public.boarding_check_in_codes code
        on code.allocation_id = v_allocation.id
       and code.bus_id = bus ->> 'id'
      where public.can_manage_boarding_bus(v_allocation.id, bus ->> 'id')
    ),
    'passengers', (
      select coalesce(jsonb_agg(passenger order by passenger ->> 'busNumber', passenger ->> 'seatNumber'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'reservationId', reservation.id,
          'passengerKind', 'reservation',
          'busId', public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket),
          'name', reservation.name,
          'phone', reservation.phone,
          'district', reservation.district,
          'team', reservation.team,
          'campus', reservation.campus,
          'busNumber', reservation.confirmed_ticket ->> 'busNumber',
          'seatNumber', reservation.confirmed_ticket ->> 'seatNumber',
          'stationPreferences', (
            select coalesce(
              jsonb_agg(preference -> 'station' ->> 'name' order by (preference ->> 'rank')::integer),
              '[]'::jsonb
            )
            from jsonb_array_elements(coalesce(reservation.station_preferences, '[]'::jsonb)) preference
            where nullif(preference -> 'station' ->> 'name', '') is not null
          ),
          'assignedDestination', reservation.confirmed_ticket ->> 'dropoffStation',
          'boardingStatus', reservation.boarding_status,
          'boardingNote', reservation.boarding_note,
          'boardingNoteUpdatedAt', reservation.boarding_note_updated_at,
          'boardingNoteUpdatedByName', note_actor.name,
          'updatedAt', reservation.boarding_status_updated_at,
          'updatedByName', status_actor.name
        ) passenger
        from public.reservations reservation
        left join public.profiles status_actor on status_actor.id = reservation.boarding_status_updated_by
        left join public.profiles note_actor on note_actor.id = reservation.boarding_note_updated_by
        where reservation.status = 'confirmed'
          and reservation.confirmed_ticket is not null
          and public.can_manage_boarding_reservation(reservation.id)
        union all
        select jsonb_build_object(
          'reservationId', walk_in.id,
          'passengerKind', 'walk_in',
          'busId', walk_in.bus_id,
          'name', walk_in.name,
          'phone', walk_in.phone,
          'district', '',
          'team', '',
          'campus', walk_in.campus,
          'busNumber', bus ->> 'label',
          'seatNumber', walk_in.seat_number::text,
          'stationPreferences', '[]'::jsonb,
          'assignedDestination', bus ->> 'destination',
          'boardingStatus', walk_in.boarding_status,
          'boardingNote', walk_in.boarding_note,
          'fieldExceptionReason', walk_in.reason,
          'updatedAt', walk_in.boarding_status_updated_at
        ) passenger
        from public.boarding_walk_in_passengers walk_in
        join lateral jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
          on bus ->> 'id' = walk_in.bus_id
        where walk_in.allocation_id = v_allocation.id
          and public.can_manage_boarding_bus(v_allocation.id, walk_in.bus_id)
      ) scoped
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id,
        'reservationId', event.reservation_id,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'actorType', case
          when event.note in ('탑승 확인', 'passenger_check_in_code') then 'passenger'
          when event.note = 'bus_departed_auto_no_show' or event.note like '호차 출발%' then 'automatic'
          else 'boarding_manager'
        end,
        'actorName', actor.name,
        'createdAt', event.created_at,
        'note', event.note
      ) order by event.created_at desc), '[]'::jsonb)
      from public.boarding_status_events event
      left join public.profiles actor on actor.id = event.actor_id
      join public.reservations reservation on reservation.id = event.reservation_id
      where reservation.status = 'confirmed'
        and public.can_manage_boarding_reservation(reservation.id)
        and event.created_at >= coalesce(
          nullif(reservation.confirmed_ticket ->> 'confirmedAt', '')::timestamptz,
          '-infinity'::timestamptz
        )
    )
  );
end;
$$;

drop function if exists public.move_boarding_passenger_as_global_admin(uuid, text, integer, text);
revoke all on function public.move_boarding_passenger_as_global_admin(uuid, text, text) from public, anon;
revoke all on function public.validate_boarding_walk_in_seat_conflicts() from public, anon, authenticated;
revoke all on function public.add_boarding_walk_in_as_global_admin(text, integer, text, text, text, text) from public, anon;
revoke all on function public.set_walk_in_boarding_status(uuid, text) from public, anon;
revoke all on function public.update_walk_in_boarding_note(uuid, text) from public, anon;
grant execute on function public.move_boarding_passenger_as_global_admin(uuid, text, text) to authenticated;
grant execute on function public.add_boarding_walk_in_as_global_admin(text, integer, text, text, text, text) to authenticated;
grant execute on function public.set_walk_in_boarding_status(uuid, text) to authenticated;
grant execute on function public.update_walk_in_boarding_note(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/140_boarding_field_exceptions.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/142_bulk_admin_invitation_codes.sql
-- =========================================================

-- Allow global administrators to issue several one-time invitation codes atomically.

create or replace function public.create_admin_invitation_codes(
  p_role text,
  p_campus_id uuid default null,
  p_count integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_index integer;
  v_created jsonb;
  v_invitations jsonb := '[]'::jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create invitation codes.';
  end if;
  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'Between 1 and 50 invitation codes can be created at once.';
  end if;
  if p_role = 'campus_admin' and p_count <> 1 then
    raise exception 'Only one campus administrator invitation can be active per campus.';
  end if;

  for v_index in 1..p_count loop
    v_created := public.create_admin_invitation_code(p_role, p_campus_id);
    v_invitations := v_invitations || jsonb_build_array(v_created);
  end loop;

  return v_invitations;
end;
$$;

revoke all on function public.create_admin_invitation_codes(text, uuid, integer)
  from public, anon;
grant execute on function public.create_admin_invitation_codes(text, uuid, integer)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/142_bulk_admin_invitation_codes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/143_fix_allocation_optimization_reset.sql
-- =========================================================

-- =========================================================
-- Keep allocation optimization reset compatible with partial setups
-- =========================================================

create or replace function public.reset_allocation_optimization_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
  v_status_counts jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can reset allocation optimization jobs.';
  end if;

  lock table public.allocation_optimization_jobs in share row exclusive mode;

  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Cancel the active allocation optimization job before resetting.';
  end if;

  select
    coalesce(sum(status_counts.job_count), 0)::integer,
    coalesce(jsonb_object_agg(status_counts.status, status_counts.job_count), '{}'::jsonb)
  into v_deleted_count, v_status_counts
  from (
    select status, count(*)::integer as job_count
    from public.allocation_optimization_jobs
    group by status
  ) status_counts;

  delete from public.allocation_optimization_events;

  update public.allocation_optimization_jobs
  set
    source_job_id = null,
    resume_from_job_id = null
  where source_job_id is not null
    or resume_from_job_id is not null;

  delete from public.allocation_optimization_jobs;

  if to_regclass('public.admin_action_audit_logs') is not null then
    insert into public.admin_action_audit_logs (
      actor_id,
      action,
      resource_type,
      before_data,
      after_data
    )
    values (
      auth.uid(),
      'reset',
      'allocation_optimization_jobs',
      jsonb_build_object(
        'deleted_count', v_deleted_count,
        'status_counts', v_status_counts
      ),
      jsonb_build_object('remaining_count', 0)
    );
  end if;

  return v_deleted_count;
end;
$$;

revoke all on function public.reset_allocation_optimization_jobs()
  from public, anon;
grant execute on function public.reset_allocation_optimization_jobs()
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/143_fix_allocation_optimization_reset.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/144_expire_stale_allocation_optimization_jobs.sql
-- =========================================================

-- =========================================================
-- Expire allocation optimizer jobs whose worker heartbeat stopped
-- =========================================================

create or replace function public.expire_stale_allocation_optimization_jobs(
  p_stale_after_seconds integer default 4500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired_count integer;
begin
  if p_stale_after_seconds < 60 or p_stale_after_seconds > 86400 then
    raise exception 'Stale optimizer job threshold must be between 60 and 86400 seconds.';
  end if;

  with expired as (
    update public.allocation_optimization_jobs
    set
      status = 'FAILED',
      current_phase = 'failed',
      completed_at = now(),
      error_message = 'The optimizer worker heartbeat expired before completion.'
    where status in ('RUNNING', 'CANCEL_REQUESTED')
      and updated_at < now() - make_interval(secs => p_stale_after_seconds)
    returning id, worker_id, updated_at
  ),
  events as (
    insert into public.allocation_optimization_events (
      job_id,
      event_type,
      detail
    )
    select
      id,
      'JOB_HEARTBEAT_EXPIRED',
      jsonb_build_object(
        'worker_id', worker_id,
        'last_heartbeat_at', updated_at,
        'stale_after_seconds', p_stale_after_seconds
      )
    from expired
    returning 1
  )
  select count(*)::integer into v_expired_count from events;

  return v_expired_count;
end;
$$;

revoke all on function public.expire_stale_allocation_optimization_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.expire_stale_allocation_optimization_jobs(integer)
  to service_role;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/144_expire_stale_allocation_optimization_jobs.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/145_fix_invitation_code_pgcrypto_search_path.sql
-- =========================================================

-- Make pgcrypto functions available to invitation-code RPCs on Supabase,
-- where the extension is installed in the extensions schema.

alter function public.validate_admin_invitation_codes(text[])
  set search_path = public, extensions;

alter function public.redeem_admin_invitation_codes_for_user(uuid, text[])
  set search_path = public, extensions;

alter function public.create_admin_invitation_code(text, uuid)
  set search_path = public, extensions;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/145_fix_invitation_code_pgcrypto_search_path.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/146_rate_limit_boarding_check_in_codes.sql
-- =========================================================

-- =========================================================
-- Rate-limit passenger boarding check-in code attempts
-- =========================================================

create table if not exists public.boarding_check_in_attempts (
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (allocation_id, reservation_id)
);

alter table public.boarding_check_in_attempts enable row level security;
revoke all on table public.boarding_check_in_attempts
  from public, anon, authenticated;

drop function if exists public.submit_boarding_check_in_code(text);
create function public.submit_boarding_check_in_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := trim(coalesce(p_code, ''));
  v_reservation public.reservations%rowtype;
  v_allocation public.bus_allocations%rowtype;
  v_attempt public.boarding_check_in_attempts%rowtype;
  v_bus_id text;
  v_failed_attempts integer;
  v_locked_until timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;

  select * into v_reservation
  from public.reservations
  where user_id = v_user_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'A confirmed ticket is required before check-in.'; end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  v_bus_id := public.get_confirmed_ticket_bus_id(
    v_reservation.id,
    v_reservation.confirmed_ticket
  );
  if v_bus_id is null then raise exception 'Assigned bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = v_bus_id
      and cancelled_at is null
  ) then
    raise exception 'This bus has already departed.';
  end if;

  insert into public.boarding_check_in_attempts (
    allocation_id, reservation_id
  ) values (
    v_allocation.id, v_reservation.id
  )
  on conflict (allocation_id, reservation_id) do nothing;

  select * into v_attempt
  from public.boarding_check_in_attempts
  where allocation_id = v_allocation.id
    and reservation_id = v_reservation.id
  for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > v_now then
    return jsonb_build_object(
      'success', false,
      'errorCode', 'LOCKED',
      'message', 'Too many incorrect check-in code attempts. Try again later.',
      'lockedUntil', v_attempt.locked_until
    );
  end if;

  if v_code !~ '^[0-9]{4}$' or not exists (
    select 1 from public.boarding_check_in_codes
    where allocation_id = v_allocation.id
      and bus_id = v_bus_id
      and check_in_code = v_code
      and expires_at > v_now
  ) then
    v_failed_attempts := case
      when v_attempt.locked_until is not null and v_attempt.locked_until <= v_now then 1
      else v_attempt.failed_attempts + 1
    end;
    v_locked_until := case
      when v_failed_attempts >= 5 then v_now + interval '15 minutes'
      else null
    end;

    update public.boarding_check_in_attempts
    set
      failed_attempts = v_failed_attempts,
      locked_until = v_locked_until,
      last_failed_at = v_now,
      updated_at = v_now
    where allocation_id = v_allocation.id
      and reservation_id = v_reservation.id;

    return jsonb_build_object(
      'success', false,
      'errorCode', case when v_locked_until is null then 'INVALID_CODE' else 'LOCKED' end,
      'message', case
        when v_locked_until is null then 'The check-in code is incorrect or expired.'
        else 'Too many incorrect check-in code attempts. Try again later.'
      end,
      'remainingAttempts', greatest(0, 5 - v_failed_attempts),
      'lockedUntil', v_locked_until
    );
  end if;

  delete from public.boarding_check_in_attempts
  where allocation_id = v_allocation.id
    and reservation_id = v_reservation.id;

  if v_reservation.boarding_status <> 'boarded' then
    update public.reservations
    set boarding_status = 'boarded',
        boarding_confirmed_at = v_now,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = v_user_id,
        boarding_no_show_departure_id = null
    where id = v_reservation.id;

    insert into public.boarding_status_events (
      reservation_id, from_status, to_status, actor_id, note
    ) values (
      v_reservation.id, v_reservation.boarding_status, 'boarded', v_user_id,
      'passenger_check_in_code'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'confirmedAt', coalesce(v_reservation.boarding_confirmed_at, v_now)
  );
end;
$$;

revoke all on function public.submit_boarding_check_in_code(text) from public, anon;
grant execute on function public.submit_boarding_check_in_code(text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/146_rate_limit_boarding_check_in_codes.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/147_personal_user_management.sql
-- =========================================================

-- Individual user operations, reasons, and in-app notifications.

create table if not exists public.personal_notifications (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  category text not null default 'general',
  created_by uuid references auth.users(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_personal_notifications_target_created
  on public.personal_notifications(target_user_id, created_at desc);

create table if not exists public.personal_user_action_logs (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_personal_user_action_logs_target_created
  on public.personal_user_action_logs(target_user_id, created_at desc);

alter table public.personal_notifications enable row level security;
alter table public.personal_user_action_logs enable row level security;

drop policy if exists "Users can view own personal notifications" on public.personal_notifications;
create policy "Users can view own personal notifications"
on public.personal_notifications for select to authenticated
using (target_user_id = auth.uid() or public.is_global_admin());

drop policy if exists "Global admins can view personal user action logs" on public.personal_user_action_logs;
create policy "Global admins can view personal user action logs"
on public.personal_user_action_logs for select to authenticated
using (public.is_global_admin());

revoke insert, update, delete on public.personal_notifications from public, anon, authenticated;
revoke insert, update, delete on public.personal_user_action_logs from public, anon, authenticated;
grant select on public.personal_notifications to authenticated;
grant select on public.personal_user_action_logs to authenticated;

create or replace function public.record_personal_user_action(
  p_target_user_id uuid,
  p_reservation_id uuid,
  p_action text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can record personal user actions.';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required.';
  end if;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason
  )
  values (
    p_target_user_id, p_reservation_id, auth.uid(), p_action, btrim(p_reason)
  );
end;
$$;

create or replace function public.manage_personal_user_payment(
  p_reservation_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations%rowtype;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage personal payments.';
  end if;

  if p_status not in ('pending', 'completed', 'refunded') then
    raise exception 'Invalid payment status.';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required.';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found.';
  end if;

  insert into public.payments (
    user_id, reservation_id, amount, status, paid_at, verified_by, verified_at, notes
  )
  values (
    v_reservation.user_id,
    v_reservation.id,
    0,
    p_status,
    case when p_status = 'completed' then clock_timestamp() end,
    auth.uid(),
    clock_timestamp(),
    btrim(p_reason)
  )
  on conflict (reservation_id)
  where reservation_id is not null
  do update set
    status = excluded.status,
    paid_at = case when excluded.status = 'completed' then clock_timestamp() else payments.paid_at end,
    verified_by = auth.uid(),
    verified_at = clock_timestamp(),
    notes = btrim(p_reason),
    updated_at = clock_timestamp();

  perform public.record_personal_user_action(
    v_reservation.user_id,
    v_reservation.id,
    'payment_' || p_status,
    p_reason
  );
end;
$$;

create or replace function public.send_personal_notification(
  p_target_user_id uuid,
  p_title text,
  p_content text,
  p_category text default 'general'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can send personal notifications.';
  end if;

  if nullif(btrim(p_title), '') is null or nullif(btrim(p_content), '') is null then
    raise exception 'Notification title and content are required.';
  end if;

  insert into public.personal_notifications (
    target_user_id, title, content, category, created_by
  )
  values (
    p_target_user_id,
    btrim(p_title),
    btrim(p_content),
    coalesce(nullif(btrim(p_category), ''), 'general'),
    auth.uid()
  )
  returning id into v_notification_id;

  perform public.record_personal_user_action(
    p_target_user_id,
    null,
    'notification_sent',
    btrim(p_title)
  );

  return v_notification_id;
end;
$$;

create or replace function public.update_personal_user_info(
  p_target_user_id uuid,
  p_reservation_id uuid,
  p_name text,
  p_phone text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can update personal user information.';
  end if;

  if nullif(btrim(p_name), '') is null or nullif(btrim(p_phone), '') is null then
    raise exception 'Name and phone are required.';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required.';
  end if;

  update public.profiles
  set name = btrim(p_name), phone = btrim(p_phone), updated_at = clock_timestamp()
  where id = p_target_user_id;

  if p_reservation_id is not null then
    update public.reservations
    set
      name = btrim(p_name),
      phone = btrim(p_phone),
      data = jsonb_set(
        jsonb_set(coalesce(data, '{}'::jsonb), '{name}', to_jsonb(btrim(p_name)), true),
        '{phone}',
        to_jsonb(btrim(p_phone)),
        true
      ),
      updated_at = clock_timestamp()
    where id = p_reservation_id and user_id = p_target_user_id;
  end if;

  perform public.record_personal_user_action(
    p_target_user_id,
    p_reservation_id,
    'user_info_updated',
    p_reason
  );
end;
$$;

revoke all on function public.record_personal_user_action(uuid, uuid, text, text) from public, anon;
revoke all on function public.manage_personal_user_payment(uuid, text, text) from public, anon;
revoke all on function public.send_personal_notification(uuid, text, text, text) from public, anon;
revoke all on function public.update_personal_user_info(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.record_personal_user_action(uuid, uuid, text, text) to authenticated;
grant execute on function public.manage_personal_user_payment(uuid, text, text) to authenticated;
grant execute on function public.send_personal_notification(uuid, text, text, text) to authenticated;
grant execute on function public.update_personal_user_info(uuid, uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/147_personal_user_management.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/147_secure_admin_created_account_source.sql
-- =========================================================

-- Keep the admin-created account marker behind a trusted service-role write.
-- Auth user metadata is user-controlled during self-signup and must not set it.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliation_type text :=
    case
      when new.raw_user_meta_data ->> 'affiliation_type' = 'external'
        then 'external'
      else 'seoul'
    end;
  v_invitation_codes text[];
begin
  insert into public.profiles (
    id, email, name, phone,
    district_id, district, team_id, team, campus_id, campus,
    affiliation_type, coordinator_name, coordinator_phone,
    account_source, updated_at
  )
  values (
    new.id,
    lower(new.email),
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'phone',
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'district_id', '')::uuid end,
    new.raw_user_meta_data ->> 'district',
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'team_id', '')::uuid end,
    case when v_affiliation_type = 'seoul'
      then new.raw_user_meta_data ->> 'team' else '' end,
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'campus_id', '')::uuid end,
    new.raw_user_meta_data ->> 'campus',
    v_affiliation_type,
    case when v_affiliation_type = 'external'
      then new.raw_user_meta_data ->> 'coordinator_name' end,
    case when v_affiliation_type = 'external'
      then new.raw_user_meta_data ->> 'coordinator_phone' end,
    'self_signup',
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
    affiliation_type = excluded.affiliation_type,
    coordinator_name = excluded.coordinator_name,
    coordinator_phone = excluded.coordinator_phone,
    updated_at = now();

  select coalesce(array_agg(value), array[]::text[])
  into v_invitation_codes
  from jsonb_array_elements_text(
    coalesce(new.raw_user_meta_data -> 'invitation_codes', '[]'::jsonb)
  ) value;

  perform public.redeem_admin_invitation_codes_for_user(
    new.id,
    v_invitation_codes
  );

  return new;
end;
$$;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/147_secure_admin_created_account_source.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/148_store_invitation_code_plaintext.sql
-- =========================================================

-- Keep newly issued invitation-code plaintext visible to global administrators.
-- Existing codes remain masked because their plaintext cannot be recovered.

alter table public.admin_invitation_codes
  add column if not exists code text;

create or replace function public.create_admin_invitation_code(
  p_role text,
  p_campus_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raw text := upper(encode(gen_random_bytes(12), 'hex'));
  v_code text;
  v_invitation public.admin_invitation_codes%rowtype;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create invitation codes.';
  end if;
  if p_role not in ('campus_admin', 'boarding_manager') then
    raise exception 'Unsupported invitation role.';
  end if;
  if p_role = 'campus_admin' and p_campus_id is null then
    raise exception 'Campus administrator invitations require a campus.';
  end if;
  if p_role = 'boarding_manager' and p_campus_id is not null then
    raise exception 'Boarding manager invitations cannot have a campus.';
  end if;
  if p_role = 'campus_admin' and not exists (
    select 1 from public.campuses where id = p_campus_id
  ) then
    raise exception 'Campus was not found.';
  end if;
  if p_role = 'campus_admin' then
    perform pg_advisory_xact_lock(
      hashtextextended('admin-invitation-campus:' || p_campus_id::text, 0)
    );
  end if;
  if p_role = 'campus_admin' and exists (
    select 1 from public.admin_roles role
    where role.role = 'campus_admin' and role.campus_id = p_campus_id
  ) then
    raise exception 'This campus already has an active campus administrator.';
  end if;
  if p_role = 'campus_admin' and exists (
    select 1 from public.admin_invitation_codes invitation
    where invitation.role = 'campus_admin'
      and invitation.campus_id = p_campus_id
      and invitation.used_at is null
      and invitation.cancelled_at is null
      and invitation.expires_at > clock_timestamp()
  ) then
    raise exception 'This campus already has an active invitation code.';
  end if;

  v_code := concat(
    substr(v_raw, 1, 6), '-',
    substr(v_raw, 7, 6), '-',
    substr(v_raw, 13, 6), '-',
    substr(v_raw, 19, 6)
  );

  insert into public.admin_invitation_codes (
    code_hash, code, code_hint, role, campus_id, created_by
  )
  values (
    digest(v_raw, 'sha256'),
    v_code,
    concat(substr(v_raw, 1, 4), '-****-', substr(v_raw, 21, 4)),
    p_role,
    p_campus_id,
    auth.uid()
  )
  returning * into v_invitation;

  return jsonb_build_object(
    'id', v_invitation.id,
    'code', v_code,
    'expiresAt', v_invitation.expires_at
  );
end;
$$;

revoke all on function public.create_admin_invitation_code(text, uuid)
  from public, anon;
grant execute on function public.create_admin_invitation_code(text, uuid)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/148_store_invitation_code_plaintext.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/149_disable_signup_email_enumeration.sql
-- =========================================================

-- Email existence is sensitive authentication data. Signup clients must not
-- receive a different response based on whether an account already exists.
revoke all on function public.email_exists(text) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/149_disable_signup_email_enumeration.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/150_require_boarding_transition_reason.sql
-- =========================================================

-- Preserve no-show context and require a reason when restoring a passenger to boarded.

drop function if exists public.set_passenger_boarding_status(uuid, text);

create or replace function public.set_passenger_boarding_status(
  p_reservation_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.reservations%rowtype;
  v_allocation_id uuid;
  v_bus_id text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'Boarding transition reasons must be 500 characters or fewer.';
  end if;

  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select * into v_current
  from public.reservations
  where id = p_reservation_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'Confirmed passenger not found.'; end if;

  v_bus_id := public.get_confirmed_ticket_bus_id(v_current.id, v_current.confirmed_ticket);
  if not public.can_manage_boarding_bus(v_allocation_id, v_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if v_current.boarding_status = p_status then return; end if;
  if v_current.boarding_status = 'no_show' and p_status = 'boarded' and v_reason is null then
    raise exception 'A boarding transition reason is required.';
  end if;
  if p_status = 'no_show' and v_reason is null and not exists (
    select 1
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_allocation_id
      and departure.cancelled_at is null
      and departure.bus_id = v_bus_id
  ) then
    raise exception 'No-show status is available after bus departure.';
  end if;

  update public.reservations
  set boarding_status = p_status,
      boarding_confirmed_at = case when p_status = 'boarded' then v_now else null end,
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null
  where id = p_reservation_id;

  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  ) values (
    p_reservation_id,
    v_current.boarding_status,
    p_status,
    auth.uid(),
    case
      when v_reason is not null then 'boarding_status_changed: ' || v_reason
      else 'boarding_status_changed'
    end
  );
end;
$$;

drop function if exists public.set_walk_in_boarding_status(uuid, text);

create or replace function public.set_walk_in_boarding_status(
  p_walk_in_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_walk_in public.boarding_walk_in_passengers%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'Boarding transition reasons must be 500 characters or fewer.';
  end if;

  select * into v_walk_in
  from public.boarding_walk_in_passengers
  where id = p_walk_in_id
  for update;
  if not found then raise exception 'Walk-in passenger not found.'; end if;
  if not public.can_manage_boarding_bus(v_walk_in.allocation_id, v_walk_in.bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if v_walk_in.boarding_status = p_status then return; end if;
  if v_walk_in.boarding_status = 'no_show' and p_status = 'boarded' and v_reason is null then
    raise exception 'A boarding transition reason is required.';
  end if;
  if p_status = 'no_show' and v_reason is null and not exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_walk_in.allocation_id
      and bus_id = v_walk_in.bus_id
      and cancelled_at is null
  ) then
    raise exception 'No-show status is available after bus departure.';
  end if;

  update public.boarding_walk_in_passengers
  set boarding_status = p_status,
      boarding_status_updated_by = auth.uid(),
      boarding_status_updated_at = v_now,
      boarding_no_show_departure_id = null,
      boarding_note = case
        when v_reason is not null then concat_ws(
          E'\n',
          nullif(boarding_note, ''),
          '[탑승 전환 사유] ' || v_reason
        )
        else boarding_note
      end,
      updated_at = v_now
  where id = p_walk_in_id;
end;
$$;

revoke all on function public.set_passenger_boarding_status(uuid, text, text)
  from public, anon;
revoke all on function public.set_walk_in_boarding_status(uuid, text, text)
  from public, anon;
grant execute on function public.set_passenger_boarding_status(uuid, text, text)
  to authenticated;
grant execute on function public.set_walk_in_boarding_status(uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/150_require_boarding_transition_reason.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/151_personal_user_management_enhancements.sql
-- =========================================================

-- Complete individual user operations with atomic state transitions and audit snapshots.

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (status in ('pending', 'completed', 'refund_required', 'refunded'));

alter table public.personal_user_action_logs
  add column if not exists before_data jsonb;
alter table public.personal_user_action_logs
  add column if not exists after_data jsonb;
alter table public.personal_user_action_logs
  add column if not exists reversible boolean not null default false;
alter table public.personal_user_action_logs
  add column if not exists reverted_at timestamptz;
alter table public.personal_user_action_logs
  add column if not exists reverted_by uuid references auth.users(id) on delete set null;

create or replace function public.mark_personal_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.personal_notifications
  set read_at = coalesce(read_at, clock_timestamp())
  where id = p_notification_id and target_user_id = auth.uid();
end;
$$;

create or replace function public.manage_personal_reservation_status(
  p_reservation_id uuid,
  p_next_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.reservations%rowtype;
  v_payment public.payments%rowtype;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage personal reservations.';
  end if;
  if p_next_status not in ('requested', 'cancelled') then
    raise exception 'Invalid reservation status.';
  end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;

  select * into v_before from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found.'; end if;
  select * into v_payment from public.payments where reservation_id = p_reservation_id for update;

  perform public.update_personal_ticket_as_admin(p_reservation_id, p_next_status, null);

  if p_next_status = 'cancelled' and v_payment.status = 'completed' then
    update public.payments
    set status = 'refund_required', notes = btrim(p_reason), updated_at = clock_timestamp()
    where id = v_payment.id;
  end if;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason,
    before_data, after_data, reversible
  )
  select
    v_before.user_id, v_before.id, auth.uid(),
    case when p_next_status = 'cancelled' then 'reservation_cancelled' else 'reservation_restored' end,
    btrim(p_reason),
    jsonb_build_object(
      'reservationStatus', v_before.status,
      'confirmedTicket', v_before.confirmed_ticket,
      'paymentStatus', v_payment.status
    ),
    jsonb_build_object(
      'reservationStatus', reservation.status,
      'confirmedTicket', reservation.confirmed_ticket,
      'paymentStatus', (select status from public.payments where reservation_id = reservation.id)
    ),
    false
  from public.reservations reservation where reservation.id = p_reservation_id;
end;
$$;

create or replace function public.manage_personal_user_payment(
  p_reservation_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations%rowtype;
  v_before_status text;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage personal payments.'; end if;
  if p_status not in ('pending', 'completed', 'refund_required', 'refunded') then raise exception 'Invalid payment status.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;

  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found.'; end if;
  select status into v_before_status from public.payments where reservation_id = p_reservation_id for update;

  insert into public.payments (user_id, reservation_id, amount, status, paid_at, verified_by, verified_at, notes)
  values (
    v_reservation.user_id, v_reservation.id, 0, p_status,
    case when p_status = 'completed' then clock_timestamp() end,
    auth.uid(), clock_timestamp(), btrim(p_reason)
  )
  on conflict (reservation_id) where reservation_id is not null do update set
    status = excluded.status,
    paid_at = case when excluded.status = 'completed' then clock_timestamp() else payments.paid_at end,
    verified_by = auth.uid(), verified_at = clock_timestamp(),
    notes = btrim(p_reason), updated_at = clock_timestamp();

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason,
    before_data, after_data, reversible
  ) values (
    v_reservation.user_id, v_reservation.id, auth.uid(), 'payment_' || p_status, btrim(p_reason),
    jsonb_build_object('paymentStatus', v_before_status),
    jsonb_build_object('paymentStatus', p_status),
    true
  );
end;
$$;

create or replace function public.update_personal_user_organization(
  p_target_user_id uuid,
  p_reservation_id uuid,
  p_campus_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update personal user organization.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;
  select to_jsonb(profile) into v_before from public.profiles profile where id = p_target_user_id for update;

  update public.profiles set campus_id = p_campus_id, updated_at = clock_timestamp() where id = p_target_user_id;
  if p_reservation_id is not null then
    update public.reservations set campus_id = p_campus_id, updated_at = clock_timestamp()
    where id = p_reservation_id and user_id = p_target_user_id;
  end if;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason, before_data, after_data, reversible
  )
  select p_target_user_id, p_reservation_id, auth.uid(), 'organization_updated', btrim(p_reason),
    jsonb_build_object('district', v_before ->> 'district', 'team', v_before ->> 'team', 'campus', v_before ->> 'campus', 'campusId', v_before ->> 'campus_id'),
    jsonb_build_object('district', profile.district, 'team', profile.team, 'campus', profile.campus, 'campusId', profile.campus_id),
    true
  from public.profiles profile where profile.id = p_target_user_id;
end;
$$;

create or replace function public.update_personal_user_info(
  p_target_user_id uuid,
  p_reservation_id uuid,
  p_name text,
  p_phone text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_before jsonb;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update personal user information.'; end if;
  if nullif(btrim(p_name), '') is null or v_phone !~ '^01[016789][0-9]{7,8}$' then raise exception 'A valid name and phone are required.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;
  if exists (
    select 1 from public.profiles
    where id <> p_target_user_id and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_phone
  ) then raise exception 'Another user already uses this phone number.'; end if;

  select jsonb_build_object('name', name, 'phone', phone) into v_before
  from public.profiles where id = p_target_user_id for update;

  update public.profiles
  set name = btrim(p_name), phone = v_phone, updated_at = clock_timestamp()
  where id = p_target_user_id;
  if p_reservation_id is not null then
    update public.reservations
    set name = btrim(p_name), phone = v_phone,
      data = jsonb_set(jsonb_set(coalesce(data, '{}'::jsonb), '{name}', to_jsonb(btrim(p_name)), true), '{phone}', to_jsonb(v_phone), true),
      updated_at = clock_timestamp()
    where id = p_reservation_id and user_id = p_target_user_id;
  end if;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason, before_data, after_data, reversible
  ) values (
    p_target_user_id, p_reservation_id, auth.uid(), 'user_info_updated', btrim(p_reason),
    v_before, jsonb_build_object('name', btrim(p_name), 'phone', v_phone), false
  );
end;
$$;

create or replace function public.revert_personal_user_action(p_action_log_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.personal_user_action_logs%rowtype;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can revert personal user actions.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;
  select * into v_log from public.personal_user_action_logs where id = p_action_log_id for update;
  if not found or not v_log.reversible or v_log.reverted_at is not null then raise exception 'This action cannot be reverted.'; end if;

  if v_log.action like 'payment_%' then
    update public.payments
    set status = coalesce(v_log.before_data ->> 'paymentStatus', 'pending'),
        notes = '되돌리기: ' || btrim(p_reason), updated_at = clock_timestamp()
    where reservation_id = v_log.reservation_id;
  elsif v_log.action = 'organization_updated' then
    update public.profiles set campus_id = nullif(v_log.before_data ->> 'campusId', '')::uuid
    where id = v_log.target_user_id;
    update public.reservations set campus_id = nullif(v_log.before_data ->> 'campusId', '')::uuid
    where id = v_log.reservation_id;
  else
    raise exception 'This action cannot be reverted.';
  end if;

  update public.personal_user_action_logs
  set reverted_at = clock_timestamp(), reverted_by = auth.uid()
  where id = v_log.id;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason, before_data, after_data, reversible
  ) values (
    v_log.target_user_id, v_log.reservation_id, auth.uid(), 'action_reverted', btrim(p_reason),
    v_log.after_data, v_log.before_data, false
  );
end;
$$;

create or replace function public.bulk_manage_personal_user_payments(
  p_reservation_ids uuid[], p_status text, p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_count integer := 0;
begin
  if coalesce(array_length(p_reservation_ids, 1), 0) > 100 then raise exception 'Bulk operation is limited to 100 users.'; end if;
  foreach v_id in array coalesce(p_reservation_ids, array[]::uuid[]) loop
    perform public.manage_personal_user_payment(v_id, p_status, p_reason);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.bulk_send_personal_notifications(
  p_target_user_ids uuid[], p_title text, p_content text, p_category text default 'admin'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_count integer := 0;
begin
  if coalesce(array_length(p_target_user_ids, 1), 0) > 100 then raise exception 'Bulk operation is limited to 100 users.'; end if;
  foreach v_id in array coalesce(p_target_user_ids, array[]::uuid[]) loop
    perform public.send_personal_notification(v_id, p_title, p_content, p_category);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.mark_personal_notification_read(uuid) from public, anon;
revoke all on function public.manage_personal_reservation_status(uuid, text, text) from public, anon;
revoke all on function public.update_personal_user_organization(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.revert_personal_user_action(uuid, text) from public, anon;
revoke all on function public.bulk_manage_personal_user_payments(uuid[], text, text) from public, anon;
revoke all on function public.bulk_send_personal_notifications(uuid[], text, text, text) from public, anon;
grant execute on function public.mark_personal_notification_read(uuid) to authenticated;
grant execute on function public.manage_personal_reservation_status(uuid, text, text) to authenticated;
grant execute on function public.update_personal_user_organization(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.revert_personal_user_action(uuid, text) to authenticated;
grant execute on function public.bulk_manage_personal_user_payments(uuid[], text, text) to authenticated;
grant execute on function public.bulk_send_personal_notifications(uuid[], text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/151_personal_user_management_enhancements.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/152_fix_boarding_station_preferences.sql
-- =========================================================

-- Return boarding passenger destination preferences from every supported reservation shape.

create or replace function public.get_boarding_management_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can view boarding management.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then return null; end if;

  return jsonb_build_object(
    'allocationId', v_allocation.id,
    'allocationName', v_allocation.allocation_name,
    'buses', (
      select coalesce(jsonb_agg(
        bus || jsonb_build_object(
          'departedAt', departure.departed_at,
          'departedBy', departure.departed_by,
          'checkInCode', case when code.expires_at > clock_timestamp() then code.check_in_code else null end,
          'checkInCodeExpiresAt', code.expires_at
        ) order by bus ->> 'label'
      ), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
      left join public.boarding_bus_departures departure
        on departure.allocation_id = v_allocation.id
       and departure.bus_id = bus ->> 'id'
       and departure.cancelled_at is null
      left join public.boarding_check_in_codes code
        on code.allocation_id = v_allocation.id
       and code.bus_id = bus ->> 'id'
      where public.can_manage_boarding_bus(v_allocation.id, bus ->> 'id')
    ),
    'passengers', (
      select coalesce(jsonb_agg(passenger order by passenger ->> 'busNumber', passenger ->> 'seatNumber'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'reservationId', reservation.id,
          'passengerKind', 'reservation',
          'busId', public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket),
          'name', reservation.name,
          'phone', reservation.phone,
          'district', reservation.district,
          'team', reservation.team,
          'campus', reservation.campus,
          'busNumber', reservation.confirmed_ticket ->> 'busNumber',
          'seatNumber', reservation.confirmed_ticket ->> 'seatNumber',
          'stationPreferences', (
            select coalesce(jsonb_agg(preference_name order by preference_position), '[]'::jsonb)
            from (
              select
                coalesce(
                  nullif(preference.value #>> '{station,name}', ''),
                  nullif(preference.value ->> 'name', ''),
                  nullif(preference.value #>> '{}', '')
                ) as preference_name,
                preference.position as preference_position
              from jsonb_array_elements(
                case
                  when jsonb_typeof(reservation.station_preferences) = 'array' then
                    case
                      when jsonb_array_length(reservation.station_preferences) > 0
                        then reservation.station_preferences
                      when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
                        then reservation.data -> 'stationPreferences'
                      else '[]'::jsonb
                    end
                  when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
                    then reservation.data -> 'stationPreferences'
                  else '[]'::jsonb
                end
              ) with ordinality as preference(value, position)
            ) normalized_preferences
            where nullif(preference_name, '') is not null
          ),
          'assignedDestination', coalesce(
            nullif(reservation.confirmed_ticket ->> 'dropoffStation', ''),
            (
              select bus ->> 'destination'
              from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
              where bus ->> 'id' = public.get_confirmed_ticket_bus_id(
                reservation.id,
                reservation.confirmed_ticket
              )
              limit 1
            )
          ),
          'boardingStatus', reservation.boarding_status,
          'boardingNote', reservation.boarding_note,
          'boardingNoteUpdatedAt', reservation.boarding_note_updated_at,
          'boardingNoteUpdatedByName', note_actor.name,
          'updatedAt', reservation.boarding_status_updated_at,
          'updatedByName', status_actor.name
        ) passenger
        from public.reservations reservation
        left join public.profiles status_actor on status_actor.id = reservation.boarding_status_updated_by
        left join public.profiles note_actor on note_actor.id = reservation.boarding_note_updated_by
        where reservation.status = 'confirmed'
          and reservation.confirmed_ticket is not null
          and public.can_manage_boarding_reservation(reservation.id)
        union all
        select jsonb_build_object(
          'reservationId', walk_in.id,
          'passengerKind', 'walk_in',
          'busId', walk_in.bus_id,
          'name', walk_in.name,
          'phone', walk_in.phone,
          'district', '',
          'team', '',
          'campus', walk_in.campus,
          'busNumber', bus ->> 'label',
          'seatNumber', walk_in.seat_number::text,
          'stationPreferences', '[]'::jsonb,
          'assignedDestination', bus ->> 'destination',
          'boardingStatus', walk_in.boarding_status,
          'boardingNote', walk_in.boarding_note,
          'fieldExceptionReason', walk_in.reason,
          'updatedAt', walk_in.boarding_status_updated_at
        ) passenger
        from public.boarding_walk_in_passengers walk_in
        join lateral jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
          on bus ->> 'id' = walk_in.bus_id
        where walk_in.allocation_id = v_allocation.id
          and public.can_manage_boarding_bus(v_allocation.id, walk_in.bus_id)
      ) scoped
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id,
        'reservationId', event.reservation_id,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'actorType', case
          when event.note in ('탑승 확인', 'passenger_check_in_code') then 'passenger'
          when event.note = 'bus_departed_auto_no_show' or event.note like '호차 출발%' then 'automatic'
          else 'boarding_manager'
        end,
        'actorName', actor.name,
        'createdAt', event.created_at,
        'note', event.note
      ) order by event.created_at desc), '[]'::jsonb)
      from public.boarding_status_events event
      left join public.profiles actor on actor.id = event.actor_id
      join public.reservations reservation on reservation.id = event.reservation_id
      where reservation.status = 'confirmed'
        and public.can_manage_boarding_reservation(reservation.id)
        and event.created_at >= coalesce(
          nullif(reservation.confirmed_ticket ->> 'confirmedAt', '')::timestamptz,
          '-infinity'::timestamptz
        )
    )
  );
end;
$$;

revoke all on function public.get_boarding_management_snapshot() from public, anon;
grant execute on function public.get_boarding_management_snapshot() to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/152_fix_boarding_station_preferences.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/153_boarding_move_requests.sql
-- =========================================================

-- Let boarding managers request moves into buses they do not manage.

create table if not exists public.boarding_move_requests (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  source_bus_id text not null,
  target_bus_id text not null,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default clock_timestamp(),
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  response_reason text,
  check (source_bus_id <> target_bus_id)
);

create unique index if not exists idx_boarding_move_requests_pending_reservation
  on public.boarding_move_requests(reservation_id)
  where status = 'pending';
create index if not exists idx_boarding_move_requests_target_status
  on public.boarding_move_requests(allocation_id, target_bus_id, status, requested_at desc);
create index if not exists idx_boarding_move_requests_requester
  on public.boarding_move_requests(requested_by, requested_at desc);

alter table public.boarding_move_requests enable row level security;
revoke all on public.boarding_move_requests from public, anon, authenticated;

create or replace function public.execute_boarding_passenger_move(
  p_reservation_id uuid,
  p_expected_source_bus_id text,
  p_target_bus_id text,
  p_reason text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_reservation public.reservations%rowtype;
  v_target_bus jsonb;
  v_source_bus_id text;
  v_seat_number integer;
  v_passenger jsonb;
  v_passengers jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A move reason is required.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'Confirmed passenger not found.'; end if;

  v_source_bus_id := public.get_confirmed_ticket_bus_id(
    v_reservation.id,
    v_reservation.confirmed_ticket
  );
  if v_source_bus_id is distinct from p_expected_source_bus_id then
    raise exception 'The passenger bus changed after the request was created.';
  end if;
  if v_source_bus_id = p_target_bus_id then
    raise exception 'The passenger is already assigned to the target bus.';
  end if;

  select bus into v_target_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_target_bus_id;
  if v_target_bus is null then raise exception 'Target bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id in (v_source_bus_id, p_target_bus_id)
      and cancelled_at is null
  ) then
    raise exception 'Departed buses cannot receive passenger moves.';
  end if;

  select candidate.seat_number into v_seat_number
  from generate_series(1, (v_target_bus ->> 'capacity')::integer) candidate(seat_number)
  where not exists (
      select 1
      from jsonb_array_elements(v_allocation.allocation_data -> 'passengers') passenger
      where passenger ->> 'reservationId' <> p_reservation_id::text
        and passenger ->> 'busId' = p_target_bus_id
        and (passenger ->> 'seatNumber')::integer = candidate.seat_number
    )
    and not exists (
      select 1 from public.boarding_walk_in_passengers walk_in
      where walk_in.allocation_id = v_allocation.id
        and walk_in.bus_id = p_target_bus_id
        and walk_in.seat_number = candidate.seat_number
    )
  order by candidate.seat_number
  limit 1;
  if v_seat_number is null then
    raise exception 'The target bus has no remaining capacity.';
  end if;

  select passenger.value into v_passenger
  from jsonb_array_elements(v_allocation.allocation_data -> 'passengers') passenger(value)
  where passenger.value ->> 'reservationId' = p_reservation_id::text
  limit 1;
  if v_passenger is null then raise exception 'Allocation passenger not found.'; end if;

  v_passenger := jsonb_set(
    jsonb_set(v_passenger, '{busId}', to_jsonb(p_target_bus_id), true),
    '{seatNumber}',
    to_jsonb(v_seat_number),
    true
  );

  select coalesce(jsonb_agg(passenger.value order by passenger.ordinality), '[]'::jsonb)
  into v_passengers
  from jsonb_array_elements(v_allocation.allocation_data -> 'passengers')
    with ordinality passenger(value, ordinality)
  where passenger.value ->> 'reservationId' <> p_reservation_id::text;

  update public.bus_allocations
  set allocation_data = jsonb_set(
        allocation_data,
        '{passengers}',
        v_passengers || jsonb_build_array(v_passenger),
        true
      ),
      revision = revision + 1,
      updated_at = v_now
  where id = v_allocation.id;

  update public.reservations
  set confirmed_ticket = jsonb_set(
        jsonb_set(
          jsonb_set(confirmed_ticket, '{busId}', to_jsonb(p_target_bus_id), true),
          '{busNumber}', to_jsonb(v_target_bus ->> 'label'), true
        ),
        '{seatNumber}', to_jsonb(v_seat_number::text), true
      ),
      boarding_status = 'unchecked',
      boarding_confirmed_at = null,
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = p_actor_id,
      boarding_no_show_departure_id = null,
      boarding_note = concat_ws(E'\n', nullif(boarding_note, ''), '[호차 이동] ' || btrim(p_reason)),
      boarding_note_updated_at = v_now,
      boarding_note_updated_by = p_actor_id,
      updated_at = v_now
  where id = p_reservation_id;

  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  ) values (
    p_reservation_id, v_reservation.boarding_status, 'unchecked', p_actor_id, 'boarding_bus_moved'
  );
end;
$$;

create or replace function public.move_boarding_passenger_as_global_admin(
  p_reservation_id uuid,
  p_target_bus_id text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation_id uuid;
  v_source_bus_id text;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can move boarding passengers.';
  end if;

  select allocation.id, public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket)
  into v_allocation_id, v_source_bus_id
  from public.bus_allocations allocation
  join public.reservations reservation on reservation.id = p_reservation_id
  where allocation.allocation_data ->> 'status' = 'confirmed'
    and reservation.status = 'confirmed'
    and reservation.confirmed_ticket is not null;
  if v_allocation_id is null then raise exception 'Confirmed passenger not found.'; end if;

  if not public.can_manage_boarding_bus(v_allocation_id, v_source_bus_id) then
    raise exception 'You are not assigned to the source bus.';
  end if;
  if not public.can_manage_boarding_bus(v_allocation_id, p_target_bus_id) then
    raise exception 'You are not assigned to the target bus.';
  end if;

  perform public.execute_boarding_passenger_move(
    p_reservation_id, v_source_bus_id, p_target_bus_id, p_reason, auth.uid()
  );
end;
$$;

create or replace function public.request_boarding_passenger_move(
  p_reservation_id uuid,
  p_target_bus_id text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation_id uuid;
  v_source_bus_id text;
  v_request_id uuid;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can request passenger moves.';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A move reason is required.';
  end if;

  select allocation.id, public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket)
  into v_allocation_id, v_source_bus_id
  from public.bus_allocations allocation
  join public.reservations reservation on reservation.id = p_reservation_id
  where allocation.allocation_data ->> 'status' = 'confirmed'
    and reservation.status = 'confirmed'
    and reservation.confirmed_ticket is not null;
  if v_allocation_id is null then raise exception 'Confirmed passenger not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation_id, v_source_bus_id) then
    raise exception 'You are not assigned to the source bus.';
  end if;
  if v_source_bus_id = p_target_bus_id then
    raise exception 'The passenger is already assigned to the target bus.';
  end if;
  if not exists (
    select 1 from public.bus_allocations allocation
    cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
    where allocation.id = v_allocation_id and bus ->> 'id' = p_target_bus_id
  ) then
    raise exception 'Target bus not found.';
  end if;
  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation_id
      and bus_id in (v_source_bus_id, p_target_bus_id)
      and cancelled_at is null
  ) then
    raise exception 'Departed buses cannot receive passenger moves.';
  end if;

  insert into public.boarding_move_requests (
    allocation_id, reservation_id, source_bus_id, target_bus_id, reason, requested_by
  ) values (
    v_allocation_id, p_reservation_id, v_source_bus_id, p_target_bus_id, btrim(p_reason), auth.uid()
  )
  returning id into v_request_id;
  return v_request_id;
exception
  when unique_violation then
    raise exception 'A pending move request already exists for this passenger.';
end;
$$;

create or replace function public.respond_to_boarding_move_request(
  p_request_id uuid,
  p_approve boolean,
  p_response_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.boarding_move_requests%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can respond to passenger move requests.';
  end if;

  select * into v_request
  from public.boarding_move_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Move request not found.'; end if;
  if v_request.status <> 'pending' then raise exception 'Move request is no longer pending.'; end if;
  if not public.can_manage_boarding_bus(v_request.allocation_id, v_request.target_bus_id) then
    raise exception 'You are not assigned to the target bus.';
  end if;
  if not p_approve and nullif(btrim(coalesce(p_response_reason, '')), '') is null then
    raise exception 'A rejection reason is required.';
  end if;

  if p_approve then
    perform public.execute_boarding_passenger_move(
      v_request.reservation_id,
      v_request.source_bus_id,
      v_request.target_bus_id,
      v_request.reason,
      auth.uid()
    );
  end if;

  update public.boarding_move_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      responded_by = auth.uid(),
      responded_at = clock_timestamp(),
      response_reason = nullif(btrim(coalesce(p_response_reason, '')), '')
  where id = p_request_id;
end;
$$;

create or replace function public.get_boarding_move_request_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can view passenger move requests.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then return jsonb_build_object('targetBuses', '[]'::jsonb, 'requests', '[]'::jsonb); end if;

  return jsonb_build_object(
    'targetBuses', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', bus ->> 'id',
        'label', bus ->> 'label',
        'destination', bus ->> 'destination',
        'capacity', (bus ->> 'capacity')::integer,
        'remainingCapacity', greatest(
          0,
          (bus ->> 'capacity')::integer
          - (
              select count(*) from jsonb_array_elements(v_allocation.allocation_data -> 'passengers') passenger
              where passenger ->> 'busId' = bus ->> 'id'
            )
          - (
              select count(*) from public.boarding_walk_in_passengers walk_in
              where walk_in.allocation_id = v_allocation.id and walk_in.bus_id = bus ->> 'id'
            )
        ),
        'departedAt', departure.departed_at,
        'canManage', public.can_manage_boarding_bus(v_allocation.id, bus ->> 'id')
      ) order by bus ->> 'label'), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
      left join public.boarding_bus_departures departure
        on departure.allocation_id = v_allocation.id
       and departure.bus_id = bus ->> 'id'
       and departure.cancelled_at is null
    ),
    'requests', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', request.id,
        'reservationId', request.reservation_id,
        'passengerName', reservation.name,
        'passengerPhone', reservation.phone,
        'sourceBusId', request.source_bus_id,
        'sourceBusLabel', source_bus ->> 'label',
        'targetBusId', request.target_bus_id,
        'targetBusLabel', target_bus ->> 'label',
        'reason', request.reason,
        'status', request.status,
        'requestedByName', requester.name,
        'requestedAt', request.requested_at,
        'respondedByName', responder.name,
        'respondedAt', request.responded_at,
        'responseReason', request.response_reason,
        'canRespond', request.status = 'pending'
          and public.can_manage_boarding_bus(request.allocation_id, request.target_bus_id),
        'isMine', request.requested_by = auth.uid()
      ) order by (request.status = 'pending') desc, request.requested_at desc), '[]'::jsonb)
      from public.boarding_move_requests request
      join public.reservations reservation on reservation.id = request.reservation_id
      join lateral jsonb_array_elements(v_allocation.allocation_data -> 'buses') source_bus
        on source_bus ->> 'id' = request.source_bus_id
      join lateral jsonb_array_elements(v_allocation.allocation_data -> 'buses') target_bus
        on target_bus ->> 'id' = request.target_bus_id
      left join public.profiles requester on requester.id = request.requested_by
      left join public.profiles responder on responder.id = request.responded_by
      where request.allocation_id = v_allocation.id
        and (
          request.requested_by = auth.uid()
          or public.can_manage_boarding_bus(request.allocation_id, request.target_bus_id)
        )
      limit 50
    )
  );
end;
$$;

revoke all on function public.execute_boarding_passenger_move(uuid, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.request_boarding_passenger_move(uuid, text, text)
  from public, anon;
revoke all on function public.respond_to_boarding_move_request(uuid, boolean, text)
  from public, anon;
revoke all on function public.get_boarding_move_request_snapshot()
  from public, anon;
grant execute on function public.request_boarding_passenger_move(uuid, text, text)
  to authenticated;
grant execute on function public.respond_to_boarding_move_request(uuid, boolean, text)
  to authenticated;
grant execute on function public.get_boarding_move_request_snapshot()
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/153_boarding_move_requests.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/154_boarding_exception_archives.sql
-- =========================================================

create table if not exists public.boarding_exception_archives (
  record_key text primary key,
  allocation_id uuid not null,
  record_data jsonb not null,
  archived_at timestamptz not null default now(),
  archived_by uuid not null references auth.users(id) on delete restrict
);

create index if not exists idx_boarding_exception_archives_allocation
  on public.boarding_exception_archives(allocation_id, archived_at desc);

alter table public.boarding_exception_archives enable row level security;
revoke all on public.boarding_exception_archives from public, anon, authenticated;

create or replace function public.get_boarding_exception_archive_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_global_admin boolean := false;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
      and admin_role.role in ('global_admin', 'boarding_manager')
  ) then
    raise exception 'Only boarding administrators can view boarding exception archives';
  end if;

  v_is_global_admin := public.is_global_admin();

  return jsonb_build_object(
    'archivedKeys',
    (
      select coalesce(jsonb_agg(archive.record_key), '[]'::jsonb)
      from public.boarding_exception_archives archive
    ),
    'records',
    case
      when v_is_global_admin then (
        select coalesce(
          jsonb_agg(
            archive.record_data || jsonb_build_object(
              'archivedAt', archive.archived_at,
              'archivedByName', coalesce(actor.name, '전체 관리자')
            )
            order by archive.archived_at desc
          ),
          '[]'::jsonb
        )
        from public.boarding_exception_archives archive
        left join public.profiles actor on actor.id = archive.archived_by
      )
      else '[]'::jsonb
    end
  );
end;
$$;

create or replace function public.archive_boarding_exception_as_global_admin(
  p_record_key text,
  p_allocation_id uuid,
  p_record_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global administrators can archive boarding exceptions';
  end if;

  if nullif(btrim(p_record_key), '') is null or p_record_data is null then
    raise exception 'A boarding exception record is required';
  end if;

  insert into public.boarding_exception_archives (
    record_key,
    allocation_id,
    record_data,
    archived_by
  ) values (
    btrim(p_record_key),
    p_allocation_id,
    p_record_data,
    auth.uid()
  )
  on conflict (record_key) do update
  set record_data = excluded.record_data,
      archived_at = now(),
      archived_by = auth.uid();
end;
$$;

create or replace function public.restore_boarding_exception_as_global_admin(
  p_record_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global administrators can restore boarding exceptions';
  end if;

  delete from public.boarding_exception_archives
  where record_key = btrim(p_record_key);
end;
$$;

revoke all on function public.get_boarding_exception_archive_snapshot()
  from public, anon;
revoke all on function public.archive_boarding_exception_as_global_admin(text, uuid, jsonb)
  from public, anon;
revoke all on function public.restore_boarding_exception_as_global_admin(text)
  from public, anon;
grant execute on function public.get_boarding_exception_archive_snapshot()
  to authenticated;
grant execute on function public.archive_boarding_exception_as_global_admin(text, uuid, jsonb)
  to authenticated;
grant execute on function public.restore_boarding_exception_as_global_admin(text)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/154_boarding_exception_archives.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/155_boarding_exception_reason_edits.sql
-- =========================================================

-- Limit boarding exception records to assigned buses and allow scoped reason edits.

create table if not exists public.boarding_exception_reason_edits (
  record_key text primary key,
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  bus_id text not null,
  reason text not null,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references auth.users(id) on delete restrict
);

create table if not exists public.boarding_exception_reason_edit_logs (
  id uuid primary key default gen_random_uuid(),
  record_key text not null,
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  bus_id text not null,
  previous_reason text,
  next_reason text not null,
  edited_at timestamptz not null default clock_timestamp(),
  edited_by uuid not null references auth.users(id) on delete restrict
);

create index if not exists idx_boarding_exception_reason_edits_scope
  on public.boarding_exception_reason_edits(allocation_id, bus_id);
create index if not exists idx_boarding_exception_reason_edit_logs_record
  on public.boarding_exception_reason_edit_logs(record_key, edited_at desc);

alter table public.boarding_exception_reason_edits enable row level security;
alter table public.boarding_exception_reason_edit_logs enable row level security;
revoke all on public.boarding_exception_reason_edits from public, anon, authenticated;
revoke all on public.boarding_exception_reason_edit_logs from public, anon, authenticated;

create or replace function public.get_boarding_exception_reason_edit_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can view boarding exception reason edits';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'recordKey', edit.record_key,
          'reason', edit.reason,
          'updatedAt', edit.updated_at,
          'updatedByName', coalesce(actor.name, '탑승 관리자')
        )
        order by edit.updated_at desc
      )
      from public.boarding_exception_reason_edits edit
      left join public.profiles actor on actor.id = edit.updated_by
      where public.can_manage_boarding_bus(edit.allocation_id, edit.bus_id)
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.update_boarding_exception_reason(
  p_record_key text,
  p_allocation_id uuid,
  p_bus_id text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_reason text;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can update boarding exception reasons';
  end if;
  if nullif(btrim(coalesce(p_record_key, '')), '') is null
    or nullif(btrim(coalesce(p_bus_id, '')), '') is null
    or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A boarding exception record and reason are required';
  end if;
  if not public.can_manage_boarding_bus(p_allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus';
  end if;
  if not exists (
    select 1
    from public.bus_allocations allocation
    cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
    where allocation.id = p_allocation_id
      and bus ->> 'id' = p_bus_id
  ) then
    raise exception 'The boarding exception bus does not exist in this allocation';
  end if;
  if not (
    (
      p_record_key like p_allocation_id::text || ':walk-in:%'
      and exists (
        select 1 from public.boarding_walk_in_passengers walk_in
        where walk_in.id::text = split_part(p_record_key, ':walk-in:', 2)
          and walk_in.allocation_id = p_allocation_id
          and walk_in.bus_id = p_bus_id
      )
    )
    or (
      p_record_key like p_allocation_id::text || ':event:%'
      and exists (
        select 1
        from public.boarding_status_events event
        join public.reservations reservation on reservation.id = event.reservation_id
        where event.id::text = split_part(p_record_key, ':event:', 2)
          and public.get_confirmed_ticket_bus_id(
            reservation.id, reservation.confirmed_ticket
          ) = p_bus_id
      )
    )
    or (
      p_record_key like p_allocation_id::text || ':current-no-show:%'
      and exists (
        select 1
        from public.reservations reservation
        where reservation.id::text = split_part(p_record_key, ':current-no-show:', 2)
          and reservation.boarding_status = 'no_show'
          and public.get_confirmed_ticket_bus_id(
            reservation.id, reservation.confirmed_ticket
          ) = p_bus_id
      )
    )
  ) then
    raise exception 'The boarding exception record does not belong to this bus';
  end if;

  select reason into v_previous_reason
  from public.boarding_exception_reason_edits
  where record_key = btrim(p_record_key)
  for update;

  insert into public.boarding_exception_reason_edits (
    record_key, allocation_id, bus_id, reason, updated_by
  ) values (
    btrim(p_record_key), p_allocation_id, btrim(p_bus_id), btrim(p_reason), auth.uid()
  )
  on conflict (record_key) do update
  set allocation_id = excluded.allocation_id,
      bus_id = excluded.bus_id,
      reason = excluded.reason,
      updated_at = clock_timestamp(),
      updated_by = auth.uid();

  insert into public.boarding_exception_reason_edit_logs (
    record_key, allocation_id, bus_id, previous_reason, next_reason, edited_by
  ) values (
    btrim(p_record_key), p_allocation_id, btrim(p_bus_id),
    v_previous_reason, btrim(p_reason), auth.uid()
  );
end;
$$;

create or replace function public.get_boarding_exception_archive_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_global_admin boolean := false;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can view boarding exception archives';
  end if;

  v_is_global_admin := public.is_global_admin();

  return jsonb_build_object(
    'archivedKeys',
    (
      select coalesce(jsonb_agg(archive.record_key), '[]'::jsonb)
      from public.boarding_exception_archives archive
      where v_is_global_admin
        or public.can_manage_boarding_bus(
          archive.allocation_id,
          archive.record_data ->> 'busId'
        )
    ),
    'records',
    case
      when v_is_global_admin then (
        select coalesce(
          jsonb_agg(
            archive.record_data || jsonb_build_object(
              'archivedAt', archive.archived_at,
              'archivedByName', coalesce(actor.name, '전체 관리자')
            )
            order by archive.archived_at desc
          ),
          '[]'::jsonb
        )
        from public.boarding_exception_archives archive
        left join public.profiles actor on actor.id = archive.archived_by
      )
      else '[]'::jsonb
    end
  );
end;
$$;

revoke all on function public.get_boarding_exception_reason_edit_snapshot()
  from public, anon;
revoke all on function public.update_boarding_exception_reason(text, uuid, text, text)
  from public, anon;
grant execute on function public.get_boarding_exception_reason_edit_snapshot()
  to authenticated;
grant execute on function public.update_boarding_exception_reason(text, uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/155_boarding_exception_reason_edits.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/156_ai_operations_reports.sql
-- =========================================================

-- =========================================================
-- Privacy-safe activity logging and AI operations reports
-- =========================================================

create table if not exists public.activity_event_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_kind text not null check (actor_kind in ('user', 'admin', 'system')),
  event_name text not null,
  category text not null,
  route text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_activity_event_logs_occurred_id
  on public.activity_event_logs(occurred_at desc, id desc);
create index if not exists idx_activity_event_logs_actor_occurred
  on public.activity_event_logs(actor_id, occurred_at desc);
create index if not exists idx_activity_event_logs_category_occurred
  on public.activity_event_logs(category, occurred_at desc);

alter table public.activity_event_logs enable row level security;

drop policy if exists "Global admins can view activity event logs"
  on public.activity_event_logs;
create policy "Global admins can view activity event logs"
on public.activity_event_logs for select to authenticated
using (public.is_global_admin());

grant select on public.activity_event_logs to authenticated;

create or replace function public.record_activity_event(
  p_event_name text,
  p_category text default 'interaction',
  p_route text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if length(trim(coalesce(p_event_name, ''))) = 0
     or length(p_event_name) > 100 then
    raise exception 'Invalid event name.';
  end if;

  if length(trim(coalesce(p_category, ''))) = 0
     or length(p_category) > 50 then
    raise exception 'Invalid event category.';
  end if;

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  into v_metadata
  from jsonb_each(coalesce(p_metadata, '{}'::jsonb)) item
  where item.key in (
    'source',
    'outcome',
    'duration_ms',
    'resource_type',
    'resource_id',
    'error_code',
    'page_title'
  );

  insert into public.activity_event_logs (
    actor_id,
    actor_kind,
    event_name,
    category,
    route,
    metadata
  )
  values (
    auth.uid(),
    case
      when exists (
        select 1
        from public.admin_roles admin_role
        where admin_role.user_id = auth.uid()
      ) then 'admin'
      else 'user'
    end,
    trim(p_event_name),
    trim(p_category),
    left(nullif(trim(coalesce(p_route, '')), ''), 300),
    v_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_activity_event(text, text, text, jsonb)
  from public, anon;
grant execute on function public.record_activity_event(text, text, text, jsonb)
  to authenticated;

create or replace function public.audit_business_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  insert into public.activity_event_logs (
    actor_id,
    actor_kind,
    event_name,
    category,
    metadata
  )
  values (
    auth.uid(),
    case
      when auth.uid() is null then 'system'
      when exists (
        select 1 from public.admin_roles admin_role
        where admin_role.user_id = auth.uid()
      ) then 'admin'
      else 'user'
    end,
    tg_table_name || '.' || lower(tg_op),
    'data_change',
    jsonb_strip_nulls(jsonb_build_object(
      'resource_type', tg_table_name,
      'resource_id', v_row ->> 'id',
      'outcome', coalesce(v_row ->> 'status', lower(tg_op))
    ))
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.audit_business_activity_event()
  from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'reservations',
    'payments',
    'campus_transfers',
    'bus_allocations',
    'campus_requests',
    'boarding_move_requests',
    'boarding_exception_archives'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format(
        'drop trigger if exists audit_business_activity_event on public.%I',
        v_table
      );
      execute format(
        'create trigger audit_business_activity_event
         after insert or update or delete on public.%I
         for each row execute function public.audit_business_activity_event()',
        v_table
      );
    end if;
  end loop;
end;
$$;

create table if not exists public.ai_operations_reports (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  anonymized boolean not null default true,
  input_summary jsonb not null default '{}'::jsonb,
  report_markdown text,
  model text,
  error_message text,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);

create index if not exists idx_ai_operations_reports_created
  on public.ai_operations_reports(created_at desc);

alter table public.ai_operations_reports enable row level security;

drop policy if exists "Global admins can view AI operations reports"
  on public.ai_operations_reports;
create policy "Global admins can view AI operations reports"
on public.ai_operations_reports for select to authenticated
using (public.is_global_admin());

grant select on public.ai_operations_reports to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/156_ai_operations_reports.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/157_ccc_summer_user_links.sql
-- =========================================================

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

-- =========================================================
-- END sql/setup/157_ccc_summer_user_links.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/158_allow_allocation_confirmation_cancel_before_deadline.sql
-- =========================================================

-- =========================================================
-- Allow confirmed allocation cancellation before the deadline
-- =========================================================

create or replace function public.require_closed_reservation_deadline_for_bus_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deadline_at timestamptz;
begin
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'allocation_data' - 'updated_at' - 'revision')
      = (to_jsonb(old) - 'allocation_data' - 'updated_at' - 'revision')
    and (new.allocation_data - 'editLock') = (old.allocation_data - 'editLock')
    and new.revision = old.revision + 1 then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.allocation_data ->> 'status' = 'confirmed'
    and new.allocation_data ->> 'status' = 'draft'
    and new.revision = old.revision + 1 then
    return new;
  end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_at is null or v_deadline_at > clock_timestamp() then
    raise exception 'Allocation is available only after the reservation deadline.';
  end if;

  return new;
end;
$$;

revoke all on function public.require_closed_reservation_deadline_for_bus_allocation()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/158_allow_allocation_confirmation_cancel_before_deadline.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/159_personal_notification_audit_reasons.sql
-- =========================================================

-- Preserve the administrator-entered reason in personal notification audit logs.

drop function if exists public.bulk_send_personal_notifications(uuid[], text, text, text);
drop function if exists public.send_personal_notification(uuid, text, text, text);

create or replace function public.send_personal_notification(
  p_target_user_id uuid,
  p_title text,
  p_content text,
  p_category text default 'general',
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can send personal notifications.';
  end if;

  if nullif(btrim(p_title), '') is null or nullif(btrim(p_content), '') is null then
    raise exception 'Notification title and content are required.';
  end if;

  insert into public.personal_notifications (
    target_user_id, title, content, category, created_by
  )
  values (
    p_target_user_id,
    btrim(p_title),
    btrim(p_content),
    coalesce(nullif(btrim(p_category), ''), 'general'),
    auth.uid()
  )
  returning id into v_notification_id;

  perform public.record_personal_user_action(
    p_target_user_id,
    null,
    'notification_sent',
    coalesce(nullif(btrim(p_reason), ''), btrim(p_title))
  );

  return v_notification_id;
end;
$$;

create or replace function public.bulk_send_personal_notifications(
  p_target_user_ids uuid[],
  p_title text,
  p_content text,
  p_category text default 'admin',
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if coalesce(array_length(p_target_user_ids, 1), 0) > 100 then
    raise exception 'Bulk operation is limited to 100 users.';
  end if;

  foreach v_id in array coalesce(p_target_user_ids, array[]::uuid[]) loop
    perform public.send_personal_notification(
      v_id,
      p_title,
      p_content,
      p_category,
      p_reason
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.send_personal_notification(uuid, text, text, text, text) from public, anon;
revoke all on function public.bulk_send_personal_notifications(uuid[], text, text, text, text) from public, anon;
grant execute on function public.send_personal_notification(uuid, text, text, text, text) to authenticated;
grant execute on function public.bulk_send_personal_notifications(uuid[], text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/159_personal_notification_audit_reasons.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/160_manual_boarding_exception_records.sql
-- =========================================================

-- Allow boarding administrators to create scoped manual exception records.

create table if not exists public.manual_boarding_exception_records (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  bus_id text not null,
  reservation_id uuid references public.reservations(id) on delete set null,
  passenger_name text,
  passenger_phone text,
  campus text,
  seat_number text,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict
);

create index if not exists idx_manual_boarding_exception_records_scope
  on public.manual_boarding_exception_records(allocation_id, bus_id, created_at desc);

alter table public.manual_boarding_exception_records enable row level security;
revoke all on public.manual_boarding_exception_records from public, anon, authenticated;

create or replace function public.get_manual_boarding_exception_records()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can view manual boarding exception records';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', record.id,
          'allocationId', record.allocation_id,
          'busId', record.bus_id,
          'reservationId', record.reservation_id,
          'passengerName', record.passenger_name,
          'passengerPhone', record.passenger_phone,
          'campus', record.campus,
          'seatNumber', record.seat_number,
          'reason', record.reason,
          'createdAt', record.created_at,
          'createdByName', coalesce(actor.name, '탑승 관리자')
        )
        order by record.created_at desc
      )
      from public.manual_boarding_exception_records record
      left join public.profiles actor on actor.id = record.created_by
      where public.can_manage_boarding_bus(record.allocation_id, record.bus_id)
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.create_manual_boarding_exception_record(
  p_allocation_id uuid,
  p_bus_id text,
  p_reservation_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations%rowtype;
  v_record_id uuid;
  v_bus_label text;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can create manual boarding exception records';
  end if;
  if nullif(btrim(coalesce(p_bus_id, '')), '') is null
    or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A bus and reason are required';
  end if;
  if not public.can_manage_boarding_bus(p_allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus';
  end if;

  select bus ->> 'label' into v_bus_label
  from public.bus_allocations allocation
  cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
  where allocation.id = p_allocation_id
    and bus ->> 'id' = p_bus_id;
  if v_bus_label is null then
    raise exception 'The selected bus does not exist in this allocation';
  end if;

  if p_reservation_id is not null then
    select * into v_reservation
    from public.reservations reservation
    where reservation.id = p_reservation_id
      and public.get_confirmed_ticket_bus_id(
        reservation.id, reservation.confirmed_ticket
      ) = p_bus_id
      and exists (
        select 1
        from public.bus_allocations allocation
        cross join lateral jsonb_array_elements(
          allocation.allocation_data -> 'passengers'
        ) passenger
        where allocation.id = p_allocation_id
          and passenger ->> 'reservationId' = reservation.id::text
          and passenger ->> 'busId' = p_bus_id
      );
    if not found then
      raise exception 'The selected passenger does not belong to this bus';
    end if;
  end if;

  insert into public.manual_boarding_exception_records (
    allocation_id, bus_id, reservation_id, passenger_name, passenger_phone,
    campus, seat_number, reason, created_by
  ) values (
    p_allocation_id,
    p_bus_id,
    p_reservation_id,
    case when p_reservation_id is null then null else v_reservation.name end,
    case when p_reservation_id is null then null else v_reservation.phone end,
    case when p_reservation_id is null then null else v_reservation.campus end,
    case when p_reservation_id is null then null else v_reservation.confirmed_ticket ->> 'seatNumber' end,
    btrim(p_reason),
    auth.uid()
  )
  returning id into v_record_id;

  return v_record_id;
end;
$$;

create or replace function public.update_boarding_exception_reason(
  p_record_key text,
  p_allocation_id uuid,
  p_bus_id text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_reason text;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can update boarding exception reasons';
  end if;
  if nullif(btrim(coalesce(p_record_key, '')), '') is null
    or nullif(btrim(coalesce(p_bus_id, '')), '') is null
    or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A boarding exception record and reason are required';
  end if;
  if not public.can_manage_boarding_bus(p_allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus';
  end if;
  if not (
    (
      p_record_key like p_allocation_id::text || ':walk-in:%'
      and exists (
        select 1 from public.boarding_walk_in_passengers walk_in
        where walk_in.id::text = split_part(p_record_key, ':walk-in:', 2)
          and walk_in.allocation_id = p_allocation_id
          and walk_in.bus_id = p_bus_id
      )
    )
    or (
      p_record_key like p_allocation_id::text || ':event:%'
      and exists (
        select 1
        from public.boarding_status_events event
        join public.reservations reservation on reservation.id = event.reservation_id
        where event.id::text = split_part(p_record_key, ':event:', 2)
          and public.get_confirmed_ticket_bus_id(
            reservation.id, reservation.confirmed_ticket
          ) = p_bus_id
          and exists (
            select 1
            from public.bus_allocations allocation
            cross join lateral jsonb_array_elements(
              allocation.allocation_data -> 'passengers'
            ) passenger
            where allocation.id = p_allocation_id
              and passenger ->> 'reservationId' = reservation.id::text
              and passenger ->> 'busId' = p_bus_id
          )
      )
    )
    or (
      p_record_key like p_allocation_id::text || ':current-no-show:%'
      and exists (
        select 1
        from public.reservations reservation
        where reservation.id::text = split_part(p_record_key, ':current-no-show:', 2)
          and reservation.boarding_status = 'no_show'
          and public.get_confirmed_ticket_bus_id(
            reservation.id, reservation.confirmed_ticket
          ) = p_bus_id
          and exists (
            select 1
            from public.bus_allocations allocation
            cross join lateral jsonb_array_elements(
              allocation.allocation_data -> 'passengers'
            ) passenger
            where allocation.id = p_allocation_id
              and passenger ->> 'reservationId' = reservation.id::text
              and passenger ->> 'busId' = p_bus_id
          )
      )
    )
    or (
      p_record_key like p_allocation_id::text || ':manual:%'
      and exists (
        select 1
        from public.manual_boarding_exception_records record
        where record.id::text = split_part(p_record_key, ':manual:', 2)
          and record.allocation_id = p_allocation_id
          and record.bus_id = p_bus_id
      )
    )
  ) then
    raise exception 'The boarding exception record does not belong to this bus';
  end if;

  select reason into v_previous_reason
  from public.boarding_exception_reason_edits
  where record_key = btrim(p_record_key)
  for update;

  insert into public.boarding_exception_reason_edits (
    record_key, allocation_id, bus_id, reason, updated_by
  ) values (
    btrim(p_record_key), p_allocation_id, btrim(p_bus_id), btrim(p_reason), auth.uid()
  )
  on conflict (record_key) do update
  set allocation_id = excluded.allocation_id,
      bus_id = excluded.bus_id,
      reason = excluded.reason,
      updated_at = clock_timestamp(),
      updated_by = auth.uid();

  insert into public.boarding_exception_reason_edit_logs (
    record_key, allocation_id, bus_id, previous_reason, next_reason, edited_by
  ) values (
    btrim(p_record_key), p_allocation_id, btrim(p_bus_id),
    v_previous_reason, btrim(p_reason), auth.uid()
  );
end;
$$;

revoke all on function public.get_manual_boarding_exception_records()
  from public, anon;
revoke all on function public.create_manual_boarding_exception_record(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.get_manual_boarding_exception_records()
  to authenticated;
grant execute on function public.create_manual_boarding_exception_record(uuid, text, uuid, text)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/160_manual_boarding_exception_records.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/161_diagnose_allocation_optimization_reset.sql
-- =========================================================

-- Make allocation optimization history reset resilient and diagnosable.

create or replace function public.reset_allocation_optimization_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
  v_status_counts jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can reset allocation optimization jobs.';
  end if;

  lock table public.allocation_optimization_jobs in share row exclusive mode;

  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Cancel the active allocation optimization job before resetting.';
  end if;

  select
    coalesce(sum(status_counts.job_count), 0)::integer,
    coalesce(jsonb_object_agg(status_counts.status, status_counts.job_count), '{}'::jsonb)
  into v_deleted_count, v_status_counts
  from (
    select status, count(*)::integer as job_count
    from public.allocation_optimization_jobs
    group by status
  ) status_counts;

  update public.allocation_optimization_jobs
  set
    source_job_id = null,
    resume_from_job_id = null
  where source_job_id is not null
    or resume_from_job_id is not null;

  -- Events use ON DELETE CASCADE. Deleting through the parent keeps every
  -- deployed foreign-key shape consistent and avoids redundant table locks.
  delete from public.allocation_optimization_jobs;

  if to_regclass('public.admin_action_audit_logs') is not null then
    insert into public.admin_action_audit_logs (
      actor_id,
      action,
      resource_type,
      before_data,
      after_data
    )
    values (
      auth.uid(),
      'reset',
      'allocation_optimization_jobs',
      jsonb_build_object(
        'deleted_count', v_deleted_count,
        'status_counts', v_status_counts
      ),
      jsonb_build_object('remaining_count', 0)
    );
  end if;

  return v_deleted_count;
exception
  when others then
    if sqlerrm in (
      'Only global admins can reset allocation optimization jobs.',
      'Cancel the active allocation optimization job before resetting.'
    ) then
      raise;
    end if;
    raise exception 'Allocation optimization reset failed [%]: %', sqlstate, sqlerrm;
end;
$$;

revoke all on function public.reset_allocation_optimization_jobs()
  from public, anon;
grant execute on function public.reset_allocation_optimization_jobs()
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/161_diagnose_allocation_optimization_reset.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/162_ccc_summer_campus_mapping.sql
-- =========================================================

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

-- =========================================================
-- END sql/setup/162_ccc_summer_campus_mapping.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/163_fix_guarded_allocation_optimization_reset.sql
-- =========================================================

-- Keep optimization history reset compatible with guarded DELETE policies.

create or replace function public.reset_allocation_optimization_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
  v_status_counts jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can reset allocation optimization jobs.';
  end if;

  lock table public.allocation_optimization_jobs in share row exclusive mode;

  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Cancel the active allocation optimization job before resetting.';
  end if;

  select
    coalesce(sum(status_counts.job_count), 0)::integer,
    coalesce(jsonb_object_agg(status_counts.status, status_counts.job_count), '{}'::jsonb)
  into v_deleted_count, v_status_counts
  from (
    select status, count(*)::integer as job_count
    from public.allocation_optimization_jobs
    group by status
  ) status_counts;

  update public.allocation_optimization_jobs
  set
    source_job_id = null,
    resume_from_job_id = null
  where source_job_id is not null
    or resume_from_job_id is not null;

  delete from public.allocation_optimization_jobs
  where id is not null;

  if to_regclass('public.admin_action_audit_logs') is not null then
    insert into public.admin_action_audit_logs (
      actor_id,
      action,
      resource_type,
      before_data,
      after_data
    )
    values (
      auth.uid(),
      'reset',
      'allocation_optimization_jobs',
      jsonb_build_object(
        'deleted_count', v_deleted_count,
        'status_counts', v_status_counts
      ),
      jsonb_build_object('remaining_count', 0)
    );
  end if;

  return v_deleted_count;
exception
  when others then
    if sqlerrm in (
      'Only global admins can reset allocation optimization jobs.',
      'Cancel the active allocation optimization job before resetting.'
    ) then
      raise;
    end if;
    raise exception 'Allocation optimization reset failed [%]: %', sqlstate, sqlerrm;
end;
$$;

revoke all on function public.reset_allocation_optimization_jobs()
  from public, anon;
grant execute on function public.reset_allocation_optimization_jobs()
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/163_fix_guarded_allocation_optimization_reset.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/164_extend_allocation_confirmation_timeout.sql
-- =========================================================

-- Allow large allocation confirmations to finish before PostgreSQL cancels them.

alter function public.validate_allocation_workspace_confirmation_v2(
  uuid, jsonb
) set statement_timeout = '5min';

alter function public.save_confirmed_allocation_workspace_v3(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) set statement_timeout = '5min';

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/164_extend_allocation_confirmation_timeout.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/165_deployment_compatibility_check.sql
-- =========================================================

-- Expose only the current database compatibility version for frontend deployment checks.

create or replace function public.get_deployment_compatibility_version()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select 165;
$$;

revoke all on function public.get_deployment_compatibility_version() from public;
grant execute on function public.get_deployment_compatibility_version()
  to anon, authenticated, service_role;

comment on function public.get_deployment_compatibility_version() is
  'Returns the minimum frontend-compatible database deployment version without exposing schema details.';

create or replace function public.assert_deployment_compatibility(
  p_required_version integer
)
returns integer
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_deployed_version constant integer := 165;
begin
  if p_required_version > v_deployed_version then
    raise exception 'Database deployment version % is older than required version %.',
      v_deployed_version,
      p_required_version;
  end if;

  return v_deployed_version;
end;
$$;

revoke all on function public.assert_deployment_compatibility(integer) from public;
grant execute on function public.assert_deployment_compatibility(integer)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/165_deployment_compatibility_check.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/166_ai_report_log_selection.sql
-- =========================================================

-- =========================================================
-- Select which privacy-safe logs are included in AI reports
-- =========================================================

create table if not exists public.ai_report_log_settings (
  id boolean primary key default true check (id),
  include_navigation boolean not null default true,
  include_authentication boolean not null default true,
  include_data_changes boolean not null default true,
  include_admin_audit boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.ai_report_log_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.ai_report_log_settings enable row level security;

drop policy if exists "Global admins can view AI report log settings"
  on public.ai_report_log_settings;
create policy "Global admins can view AI report log settings"
on public.ai_report_log_settings for select to authenticated
using (public.is_global_admin());

grant select on public.ai_report_log_settings to authenticated;

create or replace function public.update_ai_report_log_settings(
  p_include_navigation boolean,
  p_include_authentication boolean,
  p_include_data_changes boolean,
  p_include_admin_audit boolean
)
returns public.ai_report_log_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.ai_report_log_settings;
begin
  if not public.is_global_admin() then
    raise exception 'Global administrator access is required.';
  end if;

  insert into public.ai_report_log_settings (
    id,
    include_navigation,
    include_authentication,
    include_data_changes,
    include_admin_audit,
    updated_by,
    updated_at
  )
  values (
    true,
    coalesce(p_include_navigation, false),
    coalesce(p_include_authentication, false),
    coalesce(p_include_data_changes, false),
    coalesce(p_include_admin_audit, false),
    auth.uid(),
    clock_timestamp()
  )
  on conflict (id) do update
  set include_navigation = excluded.include_navigation,
      include_authentication = excluded.include_authentication,
      include_data_changes = excluded.include_data_changes,
      include_admin_audit = excluded.include_admin_audit,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  returning * into v_settings;

  return v_settings;
end;
$$;

revoke all on function public.update_ai_report_log_settings(
  boolean,
  boolean,
  boolean,
  boolean
) from public, anon;
grant execute on function public.update_ai_report_log_settings(
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/166_ai_report_log_selection.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/167_attribute_simulation_user_activity.sql
-- =========================================================

-- Attribute simulated personal activity to the simulated user instead of the
-- administrator or service account that executes the simulation runner.

create or replace function public.audit_business_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_actor_id uuid := auth.uid();
  v_actor_kind text;
  v_subject_id_text text;
  v_subject_id uuid;
  v_is_simulation_user boolean := false;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_subject_id_text := case
    when tg_table_name = 'profiles' then v_row ->> 'id'
    else v_row ->> 'user_id'
  end;

  if v_subject_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_subject_id := v_subject_id_text::uuid;

    select exists (
      select 1
      from auth.users simulation_user
      where simulation_user.id = v_subject_id
        and lower(coalesce(simulation_user.email, '')) like '%@ccc-bus.test'
        and simulation_user.raw_user_meta_data ? 'sim_seq'
    )
    into v_is_simulation_user;
  end if;

  if v_is_simulation_user
     and tg_table_name in ('profiles', 'reservations', 'payments') then
    v_actor_id := v_subject_id;
    v_actor_kind := 'user';
  else
    v_actor_kind := case
      when v_actor_id is null then 'system'
      when exists (
        select 1
        from public.admin_roles admin_role
        where admin_role.user_id = v_actor_id
      ) then 'admin'
      else 'user'
    end;
  end if;

  insert into public.activity_event_logs (
    actor_id,
    actor_kind,
    event_name,
    category,
    metadata
  )
  values (
    v_actor_id,
    v_actor_kind,
    tg_table_name || '.' || lower(tg_op),
    'data_change',
    jsonb_strip_nulls(jsonb_build_object(
      'resource_type', tg_table_name,
      'resource_id', v_row ->> 'id',
      'outcome', coalesce(v_row ->> 'status', lower(tg_op)),
      'source', case when v_is_simulation_user then 'simulation' else null end
    ))
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.audit_business_activity_event()
  from public, anon, authenticated;

drop trigger if exists audit_business_activity_event on public.profiles;
create trigger audit_business_activity_event
after insert or update or delete on public.profiles
for each row execute function public.audit_business_activity_event();

-- =========================================================
-- END sql/setup/167_attribute_simulation_user_activity.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/170_backfill_simulation_user_activity.sql
-- =========================================================

-- Reattribute existing personal simulation activity after the simulation actor
-- trigger has been installed.

with simulation_users as (
  select simulation_user.id
  from auth.users simulation_user
  where lower(coalesce(simulation_user.email, '')) like '%@ccc-bus.test'
    and simulation_user.raw_user_meta_data ? 'sim_seq'
),
simulation_resources as (
  select 'profiles'::text as resource_type, profile.id as resource_id, profile.id as actor_id
  from public.profiles profile
  join simulation_users simulation_user on simulation_user.id = profile.id
  union all
  select 'reservations', reservation.id, reservation.user_id
  from public.reservations reservation
  join simulation_users simulation_user on simulation_user.id = reservation.user_id
  union all
  select 'payments', payment.id, payment.user_id
  from public.payments payment
  join simulation_users simulation_user on simulation_user.id = payment.user_id
)
update public.activity_event_logs activity
set actor_id = resource.actor_id,
    actor_kind = 'user',
    metadata = activity.metadata || jsonb_build_object('source', 'simulation')
from simulation_resources resource
where activity.metadata ->> 'resource_type' = resource.resource_type
  and activity.metadata ->> 'resource_id' = resource.resource_id::text;

-- =========================================================
-- END sql/setup/170_backfill_simulation_user_activity.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/171_preserve_boarding_audit_on_user_delete.sql
-- =========================================================

-- Preserve boarding audit history while allowing administrator account deletion.

alter table public.boarding_move_requests
  drop constraint if exists boarding_move_requests_requested_by_fkey;
alter table public.boarding_move_requests
  alter column requested_by drop not null;
alter table public.boarding_move_requests
  add constraint boarding_move_requests_requested_by_fkey
  foreign key (requested_by) references auth.users(id) on delete set null;

alter table public.boarding_exception_reason_edits
  drop constraint if exists boarding_exception_reason_edits_updated_by_fkey;
alter table public.boarding_exception_reason_edits
  alter column updated_by drop not null;
alter table public.boarding_exception_reason_edits
  add constraint boarding_exception_reason_edits_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.boarding_exception_reason_edit_logs
  drop constraint if exists boarding_exception_reason_edit_logs_edited_by_fkey;
alter table public.boarding_exception_reason_edit_logs
  alter column edited_by drop not null;
alter table public.boarding_exception_reason_edit_logs
  add constraint boarding_exception_reason_edit_logs_edited_by_fkey
  foreign key (edited_by) references auth.users(id) on delete set null;

alter table public.boarding_exception_archives
  drop constraint if exists boarding_exception_archives_archived_by_fkey;
alter table public.boarding_exception_archives
  alter column archived_by drop not null;
alter table public.boarding_exception_archives
  add constraint boarding_exception_archives_archived_by_fkey
  foreign key (archived_by) references auth.users(id) on delete set null;

alter table public.manual_boarding_exception_records
  drop constraint if exists manual_boarding_exception_records_created_by_fkey;
alter table public.manual_boarding_exception_records
  alter column created_by drop not null;
alter table public.manual_boarding_exception_records
  add constraint manual_boarding_exception_records_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/171_preserve_boarding_audit_on_user_delete.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/174_require_ai_report_log_selection.sql
-- =========================================================

-- Require the database objects used by AI report log-selection settings.

create or replace function public.get_deployment_compatibility_version()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select 166;
$$;

revoke all on function public.get_deployment_compatibility_version() from public;
grant execute on function public.get_deployment_compatibility_version()
  to anon, authenticated, service_role;

create or replace function public.assert_deployment_compatibility(
  p_required_version integer
)
returns integer
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_deployed_version constant integer := 166;
begin
  if p_required_version > v_deployed_version then
    raise exception 'Database deployment version % is older than required version %.',
      v_deployed_version,
      p_required_version;
  end if;

  return v_deployed_version;
end;
$$;

revoke all on function public.assert_deployment_compatibility(integer) from public;
grant execute on function public.assert_deployment_compatibility(integer)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/174_require_ai_report_log_selection.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/175_skip_global_admin_activity_logs.sql
-- =========================================================

-- Keep global administrators out of general activity logs.
-- Their management actions remain available in admin_action_audit_logs.

create or replace function public.record_activity_event(
  p_event_name text,
  p_category text default 'interaction',
  p_route text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
      and admin_role.role = 'global_admin'
  ) then
    return null;
  end if;

  if length(trim(coalesce(p_event_name, ''))) = 0
     or length(p_event_name) > 100 then
    raise exception 'Invalid event name.';
  end if;

  if length(trim(coalesce(p_category, ''))) = 0
     or length(p_category) > 50 then
    raise exception 'Invalid event category.';
  end if;

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  into v_metadata
  from jsonb_each(coalesce(p_metadata, '{}'::jsonb)) item
  where item.key in (
    'source',
    'outcome',
    'duration_ms',
    'resource_type',
    'resource_id',
    'error_code',
    'page_title'
  );

  insert into public.activity_event_logs (
    actor_id,
    actor_kind,
    event_name,
    category,
    route,
    metadata
  )
  values (
    auth.uid(),
    case
      when exists (
        select 1
        from public.admin_roles admin_role
        where admin_role.user_id = auth.uid()
      ) then 'admin'
      else 'user'
    end,
    trim(p_event_name),
    trim(p_category),
    left(nullif(trim(coalesce(p_route, '')), ''), 300),
    v_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.audit_business_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_actor_id uuid := auth.uid();
  v_actor_kind text;
  v_subject_id_text text;
  v_subject_id uuid;
  v_is_simulation_user boolean := false;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_subject_id_text := case
    when tg_table_name = 'profiles' then v_row ->> 'id'
    else v_row ->> 'user_id'
  end;

  if v_subject_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_subject_id := v_subject_id_text::uuid;

    select exists (
      select 1
      from auth.users simulation_user
      where simulation_user.id = v_subject_id
        and lower(coalesce(simulation_user.email, '')) like '%@ccc-bus.test'
        and simulation_user.raw_user_meta_data ? 'sim_seq'
    )
    into v_is_simulation_user;
  end if;

  if v_is_simulation_user
     and tg_table_name in ('profiles', 'reservations', 'payments') then
    v_actor_id := v_subject_id;
    v_actor_kind := 'user';
  else
    if exists (
      select 1
      from public.admin_roles admin_role
      where admin_role.user_id = v_actor_id
        and admin_role.role = 'global_admin'
    ) then
      return case when tg_op = 'DELETE' then old else new end;
    end if;

    v_actor_kind := case
      when v_actor_id is null then 'system'
      when exists (
        select 1
        from public.admin_roles admin_role
        where admin_role.user_id = v_actor_id
      ) then 'admin'
      else 'user'
    end;
  end if;

  insert into public.activity_event_logs (
    actor_id,
    actor_kind,
    event_name,
    category,
    metadata
  )
  values (
    v_actor_id,
    v_actor_kind,
    tg_table_name || '.' || lower(tg_op),
    'data_change',
    jsonb_strip_nulls(jsonb_build_object(
      'resource_type', tg_table_name,
      'resource_id', v_row ->> 'id',
      'outcome', coalesce(v_row ->> 'status', lower(tg_op)),
      'source', case when v_is_simulation_user then 'simulation' else null end
    ))
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

delete from public.activity_event_logs activity
using public.admin_roles admin_role
where activity.actor_id = admin_role.user_id
  and admin_role.role = 'global_admin';

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/175_skip_global_admin_activity_logs.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/176_allocation_optimization_retention.sql
-- =========================================================

-- =========================================================
-- Retain recent allocation optimization history without unbounded growth
-- =========================================================

create or replace function public.prune_allocation_optimization_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
begin
  with recursive retained_jobs(id) as (
    select job.id
    from public.allocation_optimization_jobs job
    where job.requested_at >= now() - interval '90 days'
      or job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')

    union

    select recent_optimal.id
    from (
      select job.id
      from public.allocation_optimization_jobs job
      where job.status = 'OPTIMAL'
      order by job.completed_at desc nulls last, job.requested_at desc, job.id
      limit 5
    ) recent_optimal

    union

    select dependency.id
    from retained_jobs retained
    join public.allocation_optimization_jobs retained_job
      on retained_job.id = retained.id
    join public.allocation_optimization_jobs dependency
      on dependency.id in (
        retained_job.source_job_id,
        retained_job.resume_from_job_id
      )
  ),
  deleted as (
    delete from public.allocation_optimization_jobs job
    where job.id not in (select retained.id from retained_jobs retained)
    returning 1
  )
  select count(*)::integer into v_deleted_count from deleted;

  return v_deleted_count;
end;
$$;

revoke all on function public.prune_allocation_optimization_jobs()
  from public, anon, authenticated;
grant execute on function public.prune_allocation_optimization_jobs()
  to service_role;

create or replace function public.prune_allocation_optimization_jobs_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.prune_allocation_optimization_jobs();
  return null;
end;
$$;

revoke all on function public.prune_allocation_optimization_jobs_after_insert()
  from public, anon, authenticated;

drop trigger if exists prune_allocation_optimization_jobs_after_insert
  on public.allocation_optimization_jobs;
create trigger prune_allocation_optimization_jobs_after_insert
after insert on public.allocation_optimization_jobs
for each statement execute function public.prune_allocation_optimization_jobs_after_insert();

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/176_allocation_optimization_retention.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/177_allocation_workspace_version_retention.sql
-- =========================================================

-- =========================================================
-- Retain recent allocation workspace versions without a hard 20-version cap
-- =========================================================

create or replace function public.prune_allocation_workspace_versions(
  p_allocation_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
begin
  with ranked_versions as (
    select
      version.id,
      row_number() over (
        partition by version.allocation_id
        order by version.created_at desc, version.id desc
      ) as recent_rank
    from public.allocation_workspace_versions version
    where p_allocation_id is null
      or version.allocation_id = p_allocation_id
  ),
  deleted as (
    delete from public.allocation_workspace_versions version
    using ranked_versions ranked
    where version.id = ranked.id
      and ranked.recent_rank > 20
      and version.created_at < now() - interval '90 days'
    returning 1
  )
  select count(*)::integer into v_deleted_count from deleted;

  return v_deleted_count;
end;
$$;

revoke all on function public.prune_allocation_workspace_versions(uuid)
  from public, anon, authenticated;
grant execute on function public.prune_allocation_workspace_versions(uuid)
  to service_role;

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
    id,
    allocation_id,
    revision,
    label,
    actor_id,
    changes,
    snapshot
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

  perform public.prune_allocation_workspace_versions(p_allocation_id);
end;
$$;

revoke all on function public.store_allocation_workspace_version(
  uuid, bigint, jsonb, text, text, jsonb
) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/177_allocation_workspace_version_retention.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/178_activity_event_log_retention.sql
-- =========================================================

-- =========================================================
-- Retain privacy-safe activity logs for 90 days
-- =========================================================

create or replace function public.prune_activity_event_logs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
begin
  delete from public.activity_event_logs activity
  where activity.occurred_at < now() - interval '90 days';

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

revoke all on function public.prune_activity_event_logs()
  from public, anon, authenticated;
grant execute on function public.prune_activity_event_logs()
  to service_role;

create or replace function public.prune_activity_event_logs_daily()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_pruned_on date;
begin
  if not pg_try_advisory_xact_lock(hashtext('activity_event_logs_retention')) then
    return null;
  end if;

  select nullif(value ->> 'last_pruned_on', '')::date
  into v_last_pruned_on
  from public.app_settings
  where key = 'activity_event_log_retention';

  if v_last_pruned_on is not null and v_last_pruned_on >= current_date then
    return null;
  end if;

  insert into public.app_settings (key, value, updated_at)
  values (
    'activity_event_log_retention',
    jsonb_build_object('last_pruned_on', current_date),
    now()
  )
  on conflict (key) do update
  set
    value = excluded.value,
    updated_at = excluded.updated_at;

  perform public.prune_activity_event_logs();
  return null;
end;
$$;

revoke all on function public.prune_activity_event_logs_daily()
  from public, anon, authenticated;

drop trigger if exists prune_activity_event_logs_daily
  on public.activity_event_logs;
create trigger prune_activity_event_logs_daily
after insert on public.activity_event_logs
for each statement execute function public.prune_activity_event_logs_daily();

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/178_activity_event_log_retention.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/179_block_unchecked_after_departure.sql
-- =========================================================

-- Keep departed buses in a terminal boarding state until departure is cancelled.

create or replace function public.set_passenger_boarding_status(
  p_reservation_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.reservations%rowtype;
  v_allocation_id uuid;
  v_bus_id text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'Boarding transition reasons must be 500 characters or fewer.';
  end if;

  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select * into v_current
  from public.reservations
  where id = p_reservation_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'Confirmed passenger not found.'; end if;

  v_bus_id := public.get_confirmed_ticket_bus_id(v_current.id, v_current.confirmed_ticket);
  if not public.can_manage_boarding_bus(v_allocation_id, v_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if v_current.boarding_status = p_status then return; end if;
  if p_status = 'unchecked' and exists (
    select 1
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_allocation_id
      and departure.bus_id = v_bus_id
      and departure.cancelled_at is null
  ) then
    raise exception 'Departed buses cannot return passengers to unchecked status.';
  end if;
  if v_current.boarding_status = 'no_show' and p_status = 'boarded' and v_reason is null then
    raise exception 'A boarding transition reason is required.';
  end if;
  if p_status = 'no_show' and v_reason is null and not exists (
    select 1
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_allocation_id
      and departure.cancelled_at is null
      and departure.bus_id = v_bus_id
  ) then
    raise exception 'No-show status is available after bus departure.';
  end if;

  update public.reservations
  set boarding_status = p_status,
      boarding_confirmed_at = case when p_status = 'boarded' then v_now else null end,
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null
  where id = p_reservation_id;

  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  ) values (
    p_reservation_id,
    v_current.boarding_status,
    p_status,
    auth.uid(),
    case
      when v_reason is not null then 'boarding_status_changed: ' || v_reason
      else 'boarding_status_changed'
    end
  );
end;
$$;

create or replace function public.set_walk_in_boarding_status(
  p_walk_in_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_walk_in public.boarding_walk_in_passengers%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'Boarding transition reasons must be 500 characters or fewer.';
  end if;

  select * into v_walk_in
  from public.boarding_walk_in_passengers
  where id = p_walk_in_id
  for update;
  if not found then raise exception 'Walk-in passenger not found.'; end if;
  if not public.can_manage_boarding_bus(v_walk_in.allocation_id, v_walk_in.bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if v_walk_in.boarding_status = p_status then return; end if;
  if p_status = 'unchecked' and exists (
    select 1
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_walk_in.allocation_id
      and departure.bus_id = v_walk_in.bus_id
      and departure.cancelled_at is null
  ) then
    raise exception 'Departed buses cannot return passengers to unchecked status.';
  end if;
  if v_walk_in.boarding_status = 'no_show' and p_status = 'boarded' and v_reason is null then
    raise exception 'A boarding transition reason is required.';
  end if;
  if p_status = 'no_show' and v_reason is null and not exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_walk_in.allocation_id
      and bus_id = v_walk_in.bus_id
      and cancelled_at is null
  ) then
    raise exception 'No-show status is available after bus departure.';
  end if;

  update public.boarding_walk_in_passengers
  set boarding_status = p_status,
      boarding_status_updated_by = auth.uid(),
      boarding_status_updated_at = v_now,
      boarding_no_show_departure_id = null,
      boarding_note = case
        when v_reason is not null then concat_ws(
          E'\n',
          nullif(boarding_note, ''),
          '[탑승 전환 사유] ' || v_reason
        )
        else boarding_note
      end,
      updated_at = v_now
  where id = p_walk_in_id;
end;
$$;

revoke all on function public.set_passenger_boarding_status(uuid, text, text)
  from public, anon;
revoke all on function public.set_walk_in_boarding_status(uuid, text, text)
  from public, anon;
grant execute on function public.set_passenger_boarding_status(uuid, text, text)
  to authenticated;
grant execute on function public.set_walk_in_boarding_status(uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/179_block_unchecked_after_departure.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/180_lock_departed_boarding_bus.sql
-- =========================================================

-- Make a departed bus read-only until its departure is cancelled.

create or replace function public.prevent_departed_bus_reservation_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation_id uuid;
  v_old_bus_id text;
  v_new_bus_id text;
  v_departure_id uuid;
begin
  if old.confirmed_ticket is null then return new; end if;

  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then return new; end if;

  v_old_bus_id := public.get_confirmed_ticket_bus_id(old.id, old.confirmed_ticket);
  v_new_bus_id := public.get_confirmed_ticket_bus_id(new.id, new.confirmed_ticket);

  select departure.id into v_departure_id
  from public.boarding_bus_departures departure
  where departure.allocation_id = v_allocation_id
    and departure.bus_id in (v_old_bus_id, v_new_bus_id)
    and departure.cancelled_at is null
  limit 1;
  if v_departure_id is null then return new; end if;

  if old.boarding_status = 'unchecked'
    and new.boarding_status = 'no_show'
    and new.boarding_no_show_departure_id = v_departure_id then
    return new;
  end if;
  if old.boarding_status = 'no_show'
    and new.boarding_status = 'unchecked'
    and old.boarding_no_show_departure_id = v_departure_id
    and new.boarding_no_show_departure_id is null then
    return new;
  end if;

  if old.confirmed_ticket is distinct from new.confirmed_ticket
    or old.boarding_status is distinct from new.boarding_status
    or old.boarding_confirmed_at is distinct from new.boarding_confirmed_at
    or old.boarding_no_show_departure_id is distinct from new.boarding_no_show_departure_id
    or old.boarding_note is distinct from new.boarding_note then
    raise exception 'Departed buses are read-only until departure is cancelled.';
  end if;

  return new;
end;
$$;

drop trigger if exists lock_departed_bus_reservation_changes on public.reservations;
create trigger lock_departed_bus_reservation_changes
before update on public.reservations
for each row execute function public.prevent_departed_bus_reservation_changes();

create or replace function public.prevent_departed_bus_walk_in_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation_id uuid;
  v_bus_id text;
  v_departure_id uuid;
begin
  if tg_op = 'DELETE' then
    v_allocation_id := old.allocation_id;
    v_bus_id := old.bus_id;
  else
    v_allocation_id := new.allocation_id;
    v_bus_id := new.bus_id;
  end if;

  select departure.id into v_departure_id
  from public.boarding_bus_departures departure
  where departure.allocation_id = v_allocation_id
    and departure.bus_id = v_bus_id
    and departure.cancelled_at is null
  limit 1;
  if v_departure_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'UPDATE'
    and old.boarding_status = 'unchecked'
    and new.boarding_status = 'no_show'
    and new.boarding_no_show_departure_id = v_departure_id then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.boarding_status = 'no_show'
    and new.boarding_status = 'unchecked'
    and old.boarding_no_show_departure_id = v_departure_id
    and new.boarding_no_show_departure_id is null then
    return new;
  end if;

  raise exception 'Departed buses are read-only until departure is cancelled.';
end;
$$;

drop trigger if exists lock_departed_bus_walk_in_changes
  on public.boarding_walk_in_passengers;
create trigger lock_departed_bus_walk_in_changes
before insert or update or delete on public.boarding_walk_in_passengers
for each row execute function public.prevent_departed_bus_walk_in_changes();

create or replace function public.prevent_departed_bus_check_in_code_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation_id uuid;
  v_bus_id text;
begin
  if tg_op = 'DELETE' then
    v_allocation_id := old.allocation_id;
    v_bus_id := old.bus_id;
  else
    v_allocation_id := new.allocation_id;
    v_bus_id := new.bus_id;
  end if;

  if exists (
    select 1
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_allocation_id
      and departure.bus_id = v_bus_id
      and departure.cancelled_at is null
  ) then
    raise exception 'Departed buses are read-only until departure is cancelled.';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists lock_departed_bus_check_in_code_changes
  on public.boarding_check_in_codes;
create trigger lock_departed_bus_check_in_code_changes
before insert or update or delete on public.boarding_check_in_codes
for each row execute function public.prevent_departed_bus_check_in_code_changes();

revoke all on function public.prevent_departed_bus_reservation_changes()
  from public, anon, authenticated;
revoke all on function public.prevent_departed_bus_walk_in_changes()
  from public, anon, authenticated;
revoke all on function public.prevent_departed_bus_check_in_code_changes()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/180_lock_departed_boarding_bus.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/181_require_boarding_departure_cancel_reason.sql
-- =========================================================

-- Require and preserve a reason when unlocking a departed bus.

alter table public.boarding_bus_departures
  add column if not exists cancellation_reason text;

drop function if exists public.cancel_boarding_bus_departure(text);

create or replace function public.cancel_boarding_bus_departure(
  p_bus_id text,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_departure public.boarding_bus_departures%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_restored_reservations integer := 0;
  v_restored_walk_ins integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can cancel departure.';
  end if;
  if v_reason is null then
    raise exception 'A departure cancellation reason is required.';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Departure cancellation reasons must be 500 characters or fewer.';
  end if;

  select * into v_departure
  from public.boarding_bus_departures
  where bus_id = p_bus_id and cancelled_at is null
  order by departed_at desc
  limit 1
  for update;
  if not found then raise exception 'Active bus departure not found.'; end if;
  if not public.can_manage_boarding_bus(v_departure.allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  with changed as (
    update public.reservations
    set boarding_status = 'unchecked',
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = null
    where boarding_no_show_departure_id = v_departure.id
      and boarding_status = 'no_show'
    returning id
  ),
  events as (
    insert into public.boarding_status_events (
      reservation_id, from_status, to_status, actor_id, note
    )
    select
      id,
      'no_show',
      'unchecked',
      auth.uid(),
      'bus_departure_cancelled_auto_restore: ' || v_reason
    from changed
    returning 1
  )
  select count(*) into v_restored_reservations from events;

  update public.boarding_walk_in_passengers
  set boarding_status = 'unchecked',
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null,
      boarding_note = concat_ws(
        E'\n',
        nullif(boarding_note, ''),
        '[출발 완료 취소] ' || v_reason
      ),
      updated_at = v_now
  where boarding_no_show_departure_id = v_departure.id
    and boarding_status = 'no_show';
  get diagnostics v_restored_walk_ins = row_count;

  update public.boarding_bus_departures
  set cancelled_at = v_now,
      cancelled_by = auth.uid(),
      cancellation_reason = v_reason
  where id = v_departure.id;

  return v_restored_reservations + v_restored_walk_ins;
end;
$$;

revoke all on function public.cancel_boarding_bus_departure(text, text)
  from public, anon;
grant execute on function public.cancel_boarding_bus_departure(text, text)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/181_require_boarding_departure_cancel_reason.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/182_lock_deadline_while_allocation_confirmed.sql
-- =========================================================

-- Keep the reservation deadline closed while a confirmed allocation exists.

create or replace function public.update_app_setting_as_global_admin(
  p_key text,
  p_value jsonb
)
returns public.app_settings
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.app_settings;
  v_deadline_at timestamptz;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update app settings.'; end if;
  if p_key not in (
    'first_reservation_deadline',
    'seoul_district_transfer_account',
    'participation_targets',
    'global_scenario_checklist',
    'simulation_enabled'
  ) then raise exception 'Setting key is not editable through this RPC.'; end if;
  if jsonb_typeof(p_value) <> 'object' then raise exception 'Setting value must be a JSON object.'; end if;

  if p_key = 'first_reservation_deadline' then
    v_deadline_at := nullif(p_value ->> 'deadline_at', '')::timestamptz;
    perform pg_advisory_xact_lock(hashtextextended('allocation-confirmation', 0));

    if (v_deadline_at is null or v_deadline_at > clock_timestamp())
      and exists (
        select 1
        from public.bus_allocations
        where allocation_data ->> 'status' = 'confirmed'
      ) then
      raise exception 'Cancel the confirmed allocation before reopening reservations.';
    end if;
  elsif p_key = 'seoul_district_transfer_account'
    and jsonb_typeof(p_value -> 'account_number') <> 'string' then
    raise exception 'Account number must be a string.';
  elsif p_key = 'participation_targets'
    and (jsonb_typeof(p_value -> 'rows') <> 'array' or jsonb_typeof(p_value -> 'targets') <> 'object') then
    raise exception 'Invalid participation targets.';
  elsif p_key = 'global_scenario_checklist'
    and jsonb_typeof(p_value -> 'checked_step_ids') <> 'array' then
    raise exception 'Invalid scenario checklist.';
  elsif p_key = 'simulation_enabled'
    and jsonb_typeof(p_value -> 'enabled') <> 'boolean' then
    raise exception 'Simulation enabled must be boolean.';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.update_app_setting_as_global_admin(text, jsonb) from public, anon;
grant execute on function public.update_app_setting_as_global_admin(text, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/182_lock_deadline_while_allocation_confirmed.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/183_block_allocation_cancel_after_departure.sql
-- =========================================================

-- A confirmed allocation cannot be cancelled while any bus is departed.

create or replace function public.prevent_allocation_cancel_after_departure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.allocation_data ->> 'status' = 'confirmed'
    and new.allocation_data ->> 'status' <> 'confirmed'
    and exists (
      select 1
      from public.boarding_bus_departures departure
      where departure.allocation_id = old.id
        and departure.cancelled_at is null
    ) then
    raise exception 'Cancel all bus departures before cancelling the confirmed allocation.';
  end if;

  return new;
end;
$$;

drop trigger if exists block_allocation_cancel_after_departure
  on public.bus_allocations;
create trigger block_allocation_cancel_after_departure
before update of allocation_data on public.bus_allocations
for each row
execute function public.prevent_allocation_cancel_after_departure();

revoke all on function public.prevent_allocation_cancel_after_departure()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/183_block_allocation_cancel_after_departure.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/184_allow_departed_boarding_corrections.sql
-- =========================================================

-- Allow status corrections and notes after departure while keeping the roster locked.

create or replace function public.prevent_departed_bus_reservation_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation_id uuid;
  v_old_bus_id text;
  v_new_bus_id text;
  v_departure_id uuid;
begin
  if old.confirmed_ticket is null then return new; end if;

  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then return new; end if;

  v_old_bus_id := public.get_confirmed_ticket_bus_id(old.id, old.confirmed_ticket);
  v_new_bus_id := public.get_confirmed_ticket_bus_id(new.id, new.confirmed_ticket);

  select departure.id into v_departure_id
  from public.boarding_bus_departures departure
  where departure.allocation_id = v_allocation_id
    and departure.bus_id in (v_old_bus_id, v_new_bus_id)
    and departure.cancelled_at is null
  limit 1;
  if v_departure_id is null then return new; end if;

  if old.boarding_status = 'unchecked'
    and new.boarding_status = 'no_show'
    and new.boarding_no_show_departure_id = v_departure_id then
    return new;
  end if;
  if old.boarding_status = 'no_show'
    and new.boarding_status = 'unchecked'
    and old.boarding_no_show_departure_id = v_departure_id
    and new.boarding_no_show_departure_id is null then
    return new;
  end if;

  if old.confirmed_ticket is distinct from new.confirmed_ticket then
    raise exception 'Departed bus assignments are locked until departure is cancelled.';
  end if;
  if old.boarding_status is distinct from new.boarding_status
    and new.boarding_status = 'unchecked' then
    raise exception 'Departed buses cannot return passengers to unchecked status.';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_departed_bus_walk_in_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation_id uuid;
  v_bus_id text;
  v_departure_id uuid;
begin
  if tg_op = 'DELETE' then
    v_allocation_id := old.allocation_id;
    v_bus_id := old.bus_id;
  else
    v_allocation_id := new.allocation_id;
    v_bus_id := new.bus_id;
  end if;

  select departure.id into v_departure_id
  from public.boarding_bus_departures departure
  where departure.allocation_id = v_allocation_id
    and departure.bus_id = v_bus_id
    and departure.cancelled_at is null
  limit 1;
  if v_departure_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'UPDATE'
    and old.boarding_status = 'unchecked'
    and new.boarding_status = 'no_show'
    and new.boarding_no_show_departure_id = v_departure_id then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.boarding_status = 'no_show'
    and new.boarding_status = 'unchecked'
    and old.boarding_no_show_departure_id = v_departure_id
    and new.boarding_no_show_departure_id is null then
    return new;
  end if;

  if tg_op <> 'UPDATE' then
    raise exception 'Departed bus rosters are locked until departure is cancelled.';
  end if;
  if old.allocation_id is distinct from new.allocation_id
    or old.bus_id is distinct from new.bus_id
    or old.seat_number is distinct from new.seat_number
    or old.name is distinct from new.name
    or old.phone is distinct from new.phone
    or old.campus is distinct from new.campus
    or old.reason is distinct from new.reason then
    raise exception 'Departed bus assignments are locked until departure is cancelled.';
  end if;
  if old.boarding_status is distinct from new.boarding_status
    and new.boarding_status = 'unchecked' then
    raise exception 'Departed buses cannot return passengers to unchecked status.';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_departed_bus_reservation_changes()
  from public, anon, authenticated;
revoke all on function public.prevent_departed_bus_walk_in_changes()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/184_allow_departed_boarding_corrections.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/184_notify_boarding_managers_on_departure_cancel.sql
-- =========================================================

-- Notify every assigned boarding manager when a bus departure is cancelled.

create or replace function public.notify_boarding_managers_of_departure_cancel(
  p_departure public.boarding_bus_departures,
  p_reason text,
  p_restored_count integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notified integer := 0;
begin
  insert into public.personal_notifications (
    target_user_id,
    title,
    content,
    category,
    created_by
  )
  select distinct
    assignment.manager_user_id,
    p_departure.bus_label || ' 출발 완료 취소',
    p_departure.bus_label || ' 출발 완료가 취소되었습니다. 자동 미탑승 '
      || greatest(p_restored_count, 0)::text || '명이 복구되었습니다. 취소 사유: '
      || p_reason,
    'boarding',
    auth.uid()
  from public.boarding_manager_bus_assignments assignment
  where assignment.allocation_id = p_departure.allocation_id
    and assignment.bus_id = p_departure.bus_id;

  get diagnostics v_notified = row_count;
  return v_notified;
end;
$$;

revoke all on function public.notify_boarding_managers_of_departure_cancel(
  public.boarding_bus_departures, text, integer
) from public, anon, authenticated;

create or replace function public.cancel_boarding_bus_departure(
  p_bus_id text,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_departure public.boarding_bus_departures%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_restored_reservations integer := 0;
  v_restored_walk_ins integer := 0;
  v_restored_total integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can cancel departure.';
  end if;
  if v_reason is null then
    raise exception 'A departure cancellation reason is required.';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Departure cancellation reasons must be 500 characters or fewer.';
  end if;

  select * into v_departure
  from public.boarding_bus_departures
  where bus_id = p_bus_id and cancelled_at is null
  order by departed_at desc
  limit 1
  for update;
  if not found then raise exception 'Active bus departure not found.'; end if;
  if not public.can_manage_boarding_bus(v_departure.allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  with changed as (
    update public.reservations
    set boarding_status = 'unchecked',
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = null
    where boarding_no_show_departure_id = v_departure.id
      and boarding_status = 'no_show'
    returning id
  ),
  events as (
    insert into public.boarding_status_events (
      reservation_id, from_status, to_status, actor_id, note
    )
    select
      id,
      'no_show',
      'unchecked',
      auth.uid(),
      'bus_departure_cancelled_auto_restore: ' || v_reason
    from changed
    returning 1
  )
  select count(*) into v_restored_reservations from events;

  update public.boarding_walk_in_passengers
  set boarding_status = 'unchecked',
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null,
      boarding_note = concat_ws(
        E'\n',
        nullif(boarding_note, ''),
        '[출발 완료 취소] ' || v_reason
      ),
      updated_at = v_now
  where boarding_no_show_departure_id = v_departure.id
    and boarding_status = 'no_show';
  get diagnostics v_restored_walk_ins = row_count;

  update public.boarding_bus_departures
  set cancelled_at = v_now,
      cancelled_by = auth.uid(),
      cancellation_reason = v_reason
  where id = v_departure.id;

  v_restored_total := v_restored_reservations + v_restored_walk_ins;
  perform public.notify_boarding_managers_of_departure_cancel(
    v_departure,
    v_reason,
    v_restored_total
  );

  return v_restored_total;
end;
$$;

revoke all on function public.cancel_boarding_bus_departure(text, text)
  from public, anon;
grant execute on function public.cancel_boarding_bus_departure(text, text)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/184_notify_boarding_managers_on_departure_cancel.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/185_block_departure_with_unchecked_passengers.sql
-- =========================================================

-- Require every passenger status to be resolved before marking bus departure.

create or replace function public.mark_boarding_bus_departed(p_bus_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_departure_id uuid;
  v_unchecked_count integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can mark departure.';
  end if;

  select * into v_allocation from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Bus not found.'; end if;

  select
    (
      select count(*)
      from public.reservations reservation
      where reservation.status = 'confirmed'
        and reservation.boarding_status = 'unchecked'
        and public.get_confirmed_ticket_bus_id(
          reservation.id,
          reservation.confirmed_ticket
        ) = p_bus_id
    )
    +
    (
      select count(*)
      from public.boarding_walk_in_passengers walk_in
      where walk_in.allocation_id = v_allocation.id
        and walk_in.bus_id = p_bus_id
        and walk_in.boarding_status = 'unchecked'
    )
  into v_unchecked_count;

  if v_unchecked_count > 0 then
    raise exception 'Resolve all unchecked passengers before marking departure.';
  end if;

  insert into public.boarding_bus_departures (
    allocation_id, bus_id, bus_label, departed_at, departed_by
  ) values (
    v_allocation.id, p_bus_id, v_bus ->> 'label', v_now, auth.uid()
  ) returning id into v_departure_id;

  return v_departure_id;
end;
$$;

revoke all on function public.mark_boarding_bus_departed(text) from public, anon;
grant execute on function public.mark_boarding_bus_departed(text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/185_block_departure_with_unchecked_passengers.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/185_operation_closeout.sql
-- =========================================================

-- Record operation closeout without locking any existing correction workflow.

insert into public.app_settings (key, value)
values ('operation_closeout', '{"closed":false}'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_operation_closeout()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_value jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view operation closeout.';
  end if;

  select value into v_value
  from public.app_settings
  where key = 'operation_closeout';

  return coalesce(v_value, '{"closed":false}'::jsonb);
end;
$$;

create or replace function public.update_operation_closeout(
  p_closed boolean,
  p_reason text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_actor_name text;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can update operation closeout.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A closeout reason is required.';
  end if;

  select value into v_before
  from public.app_settings
  where key = 'operation_closeout'
  for update;

  select coalesce(nullif(trim(profile.name), ''), profile.email, '관리자')
  into v_actor_name
  from public.profiles profile
  where profile.id = auth.uid();

  if p_closed then
    v_after := jsonb_build_object(
      'closed', true,
      'closed_at', clock_timestamp(),
      'closed_by', auth.uid(),
      'closed_by_name', coalesce(v_actor_name, '관리자'),
      'reason', trim(p_reason),
      'reopened_at', null,
      'reopened_by', null,
      'reopened_by_name', null
    );
  else
    v_after := jsonb_build_object(
      'closed', false,
      'closed_at', v_before -> 'closed_at',
      'closed_by', v_before -> 'closed_by',
      'closed_by_name', v_before -> 'closed_by_name',
      'reason', trim(p_reason),
      'reopened_at', clock_timestamp(),
      'reopened_by', auth.uid(),
      'reopened_by_name', coalesce(v_actor_name, '관리자')
    );
  end if;

  insert into public.app_settings (key, value, updated_at)
  values ('operation_closeout', v_after, clock_timestamp())
  on conflict (key) do update
  set value = excluded.value, updated_at = excluded.updated_at;

  insert into public.admin_action_audit_logs (
    actor_id, action, resource_type, resource_id, before_data, after_data
  )
  values (
    auth.uid(), 'update', 'operation_closeout', null,
    coalesce(v_before, '{"closed":false}'::jsonb), v_after
  );

  return v_after;
end;
$$;

revoke all on function public.get_operation_closeout() from public, anon;
revoke all on function public.update_operation_closeout(boolean, text) from public, anon;
grant execute on function public.get_operation_closeout() to authenticated;
grant execute on function public.update_operation_closeout(boolean, text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/185_operation_closeout.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/186_public_contact_info.sql
-- =========================================================

-- Store optional public contact details without exposing the app_settings table.

insert into public.app_settings (key, value)
values ('public_contact_info', '{"email": "", "phone": ""}'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_public_contact_info()
returns table(email text, phone text)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(value ->> 'email', ''),
    coalesce(value ->> 'phone', '')
  from public.app_settings
  where key = 'public_contact_info'
  union all
  select '', ''
  where not exists (
    select 1 from public.app_settings where key = 'public_contact_info'
  )
  limit 1;
$$;

create or replace function public.update_app_setting_as_global_admin(
  p_key text,
  p_value jsonb
)
returns public.app_settings
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.app_settings;
  v_deadline_at timestamptz;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update app settings.'; end if;
  if p_key not in (
    'first_reservation_deadline',
    'seoul_district_transfer_account',
    'participation_targets',
    'global_scenario_checklist',
    'simulation_enabled',
    'public_contact_info'
  ) then raise exception 'Setting key is not editable through this RPC.'; end if;
  if jsonb_typeof(p_value) <> 'object' then raise exception 'Setting value must be a JSON object.'; end if;

  if p_key = 'first_reservation_deadline' then
    v_deadline_at := nullif(p_value ->> 'deadline_at', '')::timestamptz;
    perform pg_advisory_xact_lock(hashtextextended('allocation-confirmation', 0));

    if (v_deadline_at is null or v_deadline_at > clock_timestamp())
      and exists (
        select 1
        from public.bus_allocations
        where allocation_data ->> 'status' = 'confirmed'
      ) then
      raise exception 'Cancel the confirmed allocation before reopening reservations.';
    end if;
  elsif p_key = 'seoul_district_transfer_account'
    and jsonb_typeof(p_value -> 'account_number') <> 'string' then
    raise exception 'Account number must be a string.';
  elsif p_key = 'participation_targets'
    and (jsonb_typeof(p_value -> 'rows') <> 'array' or jsonb_typeof(p_value -> 'targets') <> 'object') then
    raise exception 'Invalid participation targets.';
  elsif p_key = 'global_scenario_checklist'
    and jsonb_typeof(p_value -> 'checked_step_ids') <> 'array' then
    raise exception 'Invalid scenario checklist.';
  elsif p_key = 'simulation_enabled'
    and jsonb_typeof(p_value -> 'enabled') <> 'boolean' then
    raise exception 'Simulation enabled must be boolean.';
  elsif p_key = 'public_contact_info'
    and (
      jsonb_typeof(p_value -> 'email') <> 'string'
      or jsonb_typeof(p_value -> 'phone') <> 'string'
      or length(p_value ->> 'email') > 254
      or length(p_value ->> 'phone') > 50
    ) then
    raise exception 'Invalid public contact info.';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.get_deployment_compatibility_version()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select 186;
$$;

create or replace function public.assert_deployment_compatibility(
  p_required_version integer
)
returns integer
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_deployed_version constant integer := 186;
begin
  if p_required_version > v_deployed_version then
    raise exception 'Database deployment version % is older than required version %.',
      v_deployed_version,
      p_required_version;
  end if;

  return v_deployed_version;
end;
$$;

revoke all on function public.get_public_contact_info() from public;
grant execute on function public.get_public_contact_info()
  to anon, authenticated, service_role;

revoke all on function public.update_app_setting_as_global_admin(text, jsonb) from public, anon;
grant execute on function public.update_app_setting_as_global_admin(text, jsonb) to authenticated;

revoke all on function public.get_deployment_compatibility_version() from public;
grant execute on function public.get_deployment_compatibility_version()
  to anon, authenticated, service_role;
revoke all on function public.assert_deployment_compatibility(integer) from public;
grant execute on function public.assert_deployment_compatibility(integer)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/186_public_contact_info.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/186_require_reason_for_every_no_show.sql
-- =========================================================

-- Require a reason for every manual no-show transition.

do $$
declare
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(
    'public.set_passenger_boarding_status(uuid,text,text)'::regprocedure
  ) into v_definition;
  v_updated_definition := replace(
    v_definition,
    E'if p_status = ''no_show'' and v_reason is null and not exists (\n    select 1\n    from public.boarding_bus_departures departure\n    where departure.allocation_id = v_allocation_id\n      and departure.cancelled_at is null\n      and departure.bus_id = v_bus_id\n  ) then\n    raise exception ''No-show status is available after bus departure.'';\n  end if;',
    E'if p_status = ''no_show'' and v_reason is null then\n    raise exception ''A no-show reason is required.'';\n  end if;'
  );
  if v_updated_definition = v_definition then
    raise exception 'Could not enforce the passenger no-show reason requirement.';
  end if;
  execute v_updated_definition;

  select pg_get_functiondef(
    'public.set_walk_in_boarding_status(uuid,text,text)'::regprocedure
  ) into v_definition;
  v_updated_definition := replace(
    v_definition,
    E'if p_status = ''no_show'' and v_reason is null and not exists (\n    select 1 from public.boarding_bus_departures\n    where allocation_id = v_walk_in.allocation_id\n      and bus_id = v_walk_in.bus_id\n      and cancelled_at is null\n  ) then\n    raise exception ''No-show status is available after bus departure.'';\n  end if;',
    E'if p_status = ''no_show'' and v_reason is null then\n    raise exception ''A no-show reason is required.'';\n  end if;'
  );
  if v_updated_definition = v_definition then
    raise exception 'Could not enforce the walk-in no-show reason requirement.';
  end if;
  execute v_updated_definition;
end;
$$;

revoke all on function public.set_passenger_boarding_status(uuid, text, text)
  from public, anon;
revoke all on function public.set_walk_in_boarding_status(uuid, text, text)
  from public, anon;
grant execute on function public.set_passenger_boarding_status(uuid, text, text)
  to authenticated;
grant execute on function public.set_walk_in_boarding_status(uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/186_require_reason_for_every_no_show.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/187_personal_inquiries.sql
-- =========================================================

create table if not exists public.personal_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  status text not null default 'open',
  title text not null,
  content text not null,
  admin_response text,
  handled_by uuid references auth.users(id),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_inquiries_category_check
    check (category in ('reservation', 'payment', 'ticket', 'boarding', 'etc')),
  constraint personal_inquiries_status_check
    check (status in ('open', 'in_progress', 'resolved', 'on_hold'))
);

create index if not exists idx_personal_inquiries_user_created
  on public.personal_inquiries(user_id, created_at desc);
create index if not exists idx_personal_inquiries_status_created
  on public.personal_inquiries(status, created_at desc);

alter table public.personal_inquiries enable row level security;

create or replace function public.create_personal_inquiry(
  p_category text,
  p_title text,
  p_content text
)
returns public.personal_inquiries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_inquiry public.personal_inquiries;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  if p_category not in ('reservation', 'payment', 'ticket', 'boarding', 'etc') then
    raise exception 'Personal inquiry category is invalid.';
  end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_content), '') is null then
    raise exception 'Personal inquiry title and content are required.';
  end if;
  if length(btrim(p_title)) > 100 or length(btrim(p_content)) > 2000 then
    raise exception 'Personal inquiry is too long.';
  end if;

  insert into public.personal_inquiries (user_id, category, title, content)
  values (v_user_id, p_category, btrim(p_title), btrim(p_content))
  returning * into v_inquiry;

  return v_inquiry;
end;
$$;

create or replace function public.get_my_personal_inquiries()
returns setof public.personal_inquiries
language sql
stable
security definer
set search_path = public
as $$
  select inquiry.*
  from public.personal_inquiries inquiry
  where inquiry.user_id = auth.uid()
  order by inquiry.created_at desc;
$$;

create or replace function public.get_personal_inquiries_as_global_admin()
returns table (
  id uuid,
  user_id uuid,
  user_name text,
  user_email text,
  user_phone text,
  category text,
  status text,
  title text,
  content text,
  admin_response text,
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global administrators can view personal inquiries.';
  end if;

  return query
  select
    inquiry.id,
    inquiry.user_id,
    profile.name,
    profile.email,
    profile.phone,
    inquiry.category,
    inquiry.status,
    inquiry.title,
    inquiry.content,
    inquiry.admin_response,
    inquiry.handled_by,
    inquiry.handled_at,
    inquiry.created_at,
    inquiry.updated_at
  from public.personal_inquiries inquiry
  left join public.profiles profile on profile.id = inquiry.user_id
  order by
    case inquiry.status
      when 'open' then 0
      when 'in_progress' then 1
      when 'on_hold' then 2
      else 3
    end,
    inquiry.created_at desc;
end;
$$;

create or replace function public.respond_to_personal_inquiry(
  p_inquiry_id uuid,
  p_status text,
  p_admin_response text
)
returns public.personal_inquiries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_response text := nullif(btrim(coalesce(p_admin_response, '')), '');
  v_previous_response text;
  v_inquiry public.personal_inquiries;
begin
  if not public.is_global_admin() then
    raise exception 'Only global administrators can process personal inquiries.';
  end if;
  if p_status not in ('open', 'in_progress', 'resolved', 'on_hold') then
    raise exception 'Personal inquiry status is invalid.';
  end if;
  if p_status = 'resolved' and v_response is null then
    raise exception 'A response is required before resolving an inquiry.';
  end if;
  if v_response is not null and length(v_response) > 2000 then
    raise exception 'Personal inquiry response is too long.';
  end if;

  select inquiry.admin_response
  into v_previous_response
  from public.personal_inquiries inquiry
  where inquiry.id = p_inquiry_id
  for update;

  if not found then
    raise exception 'Personal inquiry not found.';
  end if;

  update public.personal_inquiries
  set
    status = p_status,
    admin_response = coalesce(v_response, admin_response),
    handled_by = v_actor_id,
    handled_at = case when p_status = 'resolved' then clock_timestamp() else null end,
    updated_at = clock_timestamp()
  where id = p_inquiry_id
  returning * into v_inquiry;

  if v_response is not null and v_response is distinct from v_previous_response then
    insert into public.personal_notifications (
      target_user_id,
      category,
      title,
      content,
      created_by
    )
    values (
      v_inquiry.user_id,
      'inquiry',
      '문의에 답변이 등록되었습니다',
      v_inquiry.title || E'\n\n' || v_response,
      v_actor_id
    );
  end if;

  return v_inquiry;
end;
$$;

revoke all on table public.personal_inquiries from public, anon, authenticated;
revoke all on function public.create_personal_inquiry(text, text, text) from public, anon;
revoke all on function public.get_my_personal_inquiries() from public, anon;
revoke all on function public.get_personal_inquiries_as_global_admin() from public, anon;
revoke all on function public.respond_to_personal_inquiry(uuid, text, text) from public, anon;

grant execute on function public.create_personal_inquiry(text, text, text) to authenticated;
grant execute on function public.get_my_personal_inquiries() to authenticated;
grant execute on function public.get_personal_inquiries_as_global_admin() to authenticated;
grant execute on function public.respond_to_personal_inquiry(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/187_personal_inquiries.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/188_personal_inquiry_workflow_enhancements.sql
-- =========================================================

create table if not exists public.personal_inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.personal_inquiries(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('user', 'global_admin')),
  message text not null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_personal_inquiry_messages_inquiry_created
  on public.personal_inquiry_messages(inquiry_id, created_at, id);

create table if not exists public.personal_inquiry_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  inquiry_id uuid not null references public.personal_inquiries(id) on delete cascade,
  read_at timestamptz not null default clock_timestamp(),
  primary key (user_id, inquiry_id)
);

create table if not exists public.personal_inquiry_audit_logs (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.personal_inquiries(id) on delete cascade,
  message_id uuid,
  actor_id uuid,
  action text not null check (
    action in ('status_changed', 'response_changed', 'message_created')
  ),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_personal_inquiry_audit_logs_inquiry_created
  on public.personal_inquiry_audit_logs(inquiry_id, created_at desc);

alter table public.personal_inquiry_messages enable row level security;
alter table public.personal_inquiry_reads enable row level security;
alter table public.personal_inquiry_audit_logs enable row level security;

revoke all on table public.personal_inquiry_messages from public, anon, authenticated;
revoke all on table public.personal_inquiry_reads from public, anon, authenticated;
revoke all on table public.personal_inquiry_audit_logs from public, anon, authenticated;

insert into public.personal_inquiry_messages (
  inquiry_id, sender_id, sender_role, message, created_at
)
select inquiry.id, inquiry.user_id, 'user', inquiry.content, inquiry.created_at
from public.personal_inquiries inquiry
where not exists (
  select 1
  from public.personal_inquiry_messages message
  where message.inquiry_id = inquiry.id
    and message.sender_role = 'user'
);

insert into public.personal_inquiry_messages (
  inquiry_id, sender_id, sender_role, message, created_at
)
select
  inquiry.id,
  inquiry.handled_by,
  'global_admin',
  inquiry.admin_response,
  coalesce(inquiry.handled_at, inquiry.updated_at)
from public.personal_inquiries inquiry
where inquiry.handled_by is not null
  and nullif(btrim(coalesce(inquiry.admin_response, '')), '') is not null
  and not exists (
    select 1
    from public.personal_inquiry_messages message
    where message.inquiry_id = inquiry.id
      and message.sender_role = 'global_admin'
      and message.message = inquiry.admin_response
  );

create or replace function public.audit_personal_inquiry_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.personal_inquiry_audit_logs (
      inquiry_id, actor_id, action, before_data, after_data
    )
    values (
      new.id, auth.uid(), 'status_changed',
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status)
    );
  end if;
  if new.admin_response is distinct from old.admin_response then
    insert into public.personal_inquiry_audit_logs (
      inquiry_id, actor_id, action, before_data, after_data
    )
    values (
      new.id, auth.uid(), 'response_changed',
      jsonb_build_object('admin_response', old.admin_response),
      jsonb_build_object('admin_response', new.admin_response)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_personal_inquiry_change on public.personal_inquiries;
create trigger audit_personal_inquiry_change
after update on public.personal_inquiries
for each row execute function public.audit_personal_inquiry_change();

create or replace function public.audit_personal_inquiry_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.personal_inquiry_audit_logs (
    inquiry_id, message_id, actor_id, action, after_data
  )
  values (
    new.inquiry_id, new.id, auth.uid(), 'message_created',
    jsonb_build_object(
      'sender_role', new.sender_role,
      'message', new.message,
      'created_at', new.created_at
    )
  );
  return new;
end;
$$;

drop trigger if exists audit_personal_inquiry_message on public.personal_inquiry_messages;
create trigger audit_personal_inquiry_message
after insert on public.personal_inquiry_messages
for each row execute function public.audit_personal_inquiry_message();

create or replace function public.create_personal_inquiry(
  p_category text,
  p_title text,
  p_content text
)
returns public.personal_inquiries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_inquiry public.personal_inquiries;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_category not in ('reservation', 'payment', 'ticket', 'boarding', 'etc') then
    raise exception 'Personal inquiry category is invalid.';
  end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_content), '') is null then
    raise exception 'Personal inquiry title and content are required.';
  end if;
  if length(btrim(p_title)) > 100 or length(btrim(p_content)) > 2000 then
    raise exception 'Personal inquiry is too long.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('personal-inquiry:' || v_user_id::text, 0));
  if (
    select count(*)
    from public.personal_inquiries inquiry
    where inquiry.user_id = v_user_id and inquiry.status <> 'resolved'
  ) >= 3 then
    raise exception 'Resolve an existing inquiry before creating another one.';
  end if;
  if exists (
    select 1
    from public.personal_inquiries inquiry
    where inquiry.user_id = v_user_id
      and inquiry.created_at > clock_timestamp() - interval '60 seconds'
  ) then
    raise exception 'Please wait before creating another inquiry.';
  end if;

  insert into public.personal_inquiries (user_id, category, title, content)
  values (v_user_id, p_category, btrim(p_title), btrim(p_content))
  returning * into v_inquiry;

  insert into public.personal_inquiry_messages (
    inquiry_id, sender_id, sender_role, message
  )
  values (v_inquiry.id, v_user_id, 'user', btrim(p_content));

  return v_inquiry;
end;
$$;

create or replace function public.add_personal_inquiry_message(
  p_inquiry_id uuid,
  p_message text
)
returns public.personal_inquiry_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_global_admin boolean := public.is_global_admin();
  v_inquiry public.personal_inquiries;
  v_message public.personal_inquiry_messages;
begin
  if v_actor_id is null then raise exception 'Authentication is required.'; end if;
  if nullif(btrim(p_message), '') is null or length(btrim(p_message)) > 2000 then
    raise exception 'Personal inquiry message is invalid.';
  end if;

  select * into v_inquiry
  from public.personal_inquiries
  where id = p_inquiry_id
  for update;
  if not found or (not v_is_global_admin and v_inquiry.user_id <> v_actor_id) then
    raise exception 'Personal inquiry not found or inaccessible.';
  end if;

  insert into public.personal_inquiry_messages (
    inquiry_id, sender_id, sender_role, message
  )
  values (
    p_inquiry_id,
    v_actor_id,
    case when v_is_global_admin then 'global_admin' else 'user' end,
    btrim(p_message)
  )
  returning * into v_message;

  if v_is_global_admin then
    update public.personal_inquiries
    set
      admin_response = btrim(p_message),
      handled_by = v_actor_id,
      updated_at = clock_timestamp()
    where id = p_inquiry_id;

    insert into public.personal_notifications (
      target_user_id, category, title, content, created_by
    )
    values (
      v_inquiry.user_id,
      'inquiry',
      '문의에 새 답변이 등록되었습니다',
      v_inquiry.title || E'\n\n' || btrim(p_message) || E'\n\n개인 문의 내역에서 확인하세요.',
      v_actor_id
    );
  else
    update public.personal_inquiries
    set status = 'open', handled_at = null, updated_at = clock_timestamp()
    where id = p_inquiry_id;
  end if;

  return v_message;
end;
$$;

create or replace function public.get_my_personal_inquiry_messages()
returns setof public.personal_inquiry_messages
language sql
stable
security definer
set search_path = public
as $$
  select message.*
  from public.personal_inquiry_messages message
  join public.personal_inquiries inquiry on inquiry.id = message.inquiry_id
  where inquiry.user_id = auth.uid()
  order by message.created_at, message.id;
$$;

create or replace function public.get_personal_inquiries_page_as_global_admin(
  p_page integer default 1,
  p_page_size integer default 15,
  p_status text default 'all',
  p_search text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_page_size integer := least(50, greatest(1, coalesce(p_page_size, 15)));
  v_status text := coalesce(p_status, 'all');
  v_search text := btrim(coalesce(p_search, ''));
  v_result jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global administrators can view personal inquiries.';
  end if;
  if v_status not in ('all', 'open', 'in_progress', 'resolved', 'on_hold') then
    raise exception 'Personal inquiry status is invalid.';
  end if;

  with filtered as (
    select inquiry.*, profile.name as user_name, profile.email as user_email,
      profile.phone as user_phone
    from public.personal_inquiries inquiry
    left join public.profiles profile on profile.id = inquiry.user_id
    where (v_status = 'all' or inquiry.status = v_status)
      and (
        v_search = ''
        or inquiry.title ilike '%' || v_search || '%'
        or inquiry.content ilike '%' || v_search || '%'
        or coalesce(profile.name, '') ilike '%' || v_search || '%'
        or coalesce(profile.email, '') ilike '%' || v_search || '%'
        or coalesce(profile.phone, '') ilike '%' || v_search || '%'
        or exists (
          select 1 from public.personal_inquiry_messages message
          where message.inquiry_id = inquiry.id
            and message.message ilike '%' || v_search || '%'
        )
      )
  ),
  paged as (
    select *
    from filtered
    order by
      case status when 'open' then 0 when 'in_progress' then 1 when 'on_hold' then 2 else 3 end,
      updated_at desc, id desc
    offset (v_page - 1) * v_page_size
    limit v_page_size
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        to_jsonb(paged) || jsonb_build_object(
          'messages', coalesce((
            select jsonb_agg(to_jsonb(message) order by message.created_at, message.id)
            from public.personal_inquiry_messages message
            where message.inquiry_id = paged.id
          ), '[]'::jsonb)
        )
      ) from paged
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'summary', jsonb_build_object(
      'total', (select count(*) from public.personal_inquiries),
      'open', (select count(*) from public.personal_inquiries where status = 'open'),
      'in_progress', (select count(*) from public.personal_inquiries where status = 'in_progress'),
      'resolved', (select count(*) from public.personal_inquiries where status = 'resolved'),
      'on_hold', (select count(*) from public.personal_inquiries where status = 'on_hold')
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.mark_personal_inquiry_read(p_inquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global administrators can mark personal inquiries read.';
  end if;
  if not exists (select 1 from public.personal_inquiries where id = p_inquiry_id) then
    raise exception 'Personal inquiry not found.';
  end if;
  insert into public.personal_inquiry_reads(user_id, inquiry_id, read_at)
  values (auth.uid(), p_inquiry_id, clock_timestamp())
  on conflict (user_id, inquiry_id) do update set read_at = excluded.read_at;
end;
$$;

create or replace function public.get_unread_personal_inquiry_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_global_admin() then return 0; end if;
  select count(*)::integer into v_count
  from public.personal_inquiries inquiry
  left join public.personal_inquiry_reads read_state
    on read_state.user_id = auth.uid() and read_state.inquiry_id = inquiry.id
  where exists (
    select 1
    from public.personal_inquiry_messages message
    where message.inquiry_id = inquiry.id
      and message.sender_role = 'user'
      and message.created_at > coalesce(read_state.read_at, '-infinity'::timestamptz)
  );
  return v_count;
end;
$$;

create or replace function public.respond_to_personal_inquiry(
  p_inquiry_id uuid,
  p_status text,
  p_admin_response text
)
returns public.personal_inquiries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_response text := nullif(btrim(coalesce(p_admin_response, '')), '');
  v_previous_response text;
  v_inquiry public.personal_inquiries;
begin
  if not public.is_global_admin() then
    raise exception 'Only global administrators can process personal inquiries.';
  end if;
  if p_status not in ('open', 'in_progress', 'resolved', 'on_hold') then
    raise exception 'Personal inquiry status is invalid.';
  end if;

  select * into v_inquiry
  from public.personal_inquiries where id = p_inquiry_id for update;
  if not found then raise exception 'Personal inquiry not found.'; end if;

  v_previous_response := v_inquiry.admin_response;
  if p_status = 'resolved' and v_response is null and v_previous_response is null then
    raise exception 'A response is required before resolving an inquiry.';
  end if;
  if v_response is not null and length(v_response) > 2000 then
    raise exception 'Personal inquiry response is too long.';
  end if;

  update public.personal_inquiries
  set status = p_status,
    handled_by = v_actor_id,
    handled_at = case when p_status = 'resolved' then clock_timestamp() else null end,
    updated_at = clock_timestamp()
  where id = p_inquiry_id
  returning * into v_inquiry;

  if v_response is not null and v_response is distinct from v_previous_response then
    perform public.add_personal_inquiry_message(p_inquiry_id, v_response);
    select * into v_inquiry from public.personal_inquiries where id = p_inquiry_id;
  end if;
  return v_inquiry;
end;
$$;

revoke all on function public.add_personal_inquiry_message(uuid, text) from public, anon;
revoke all on function public.get_my_personal_inquiry_messages() from public, anon;
revoke all on function public.get_personal_inquiries_page_as_global_admin(integer, integer, text, text) from public, anon;
revoke all on function public.mark_personal_inquiry_read(uuid) from public, anon;
revoke all on function public.get_unread_personal_inquiry_count() from public, anon;

grant execute on function public.add_personal_inquiry_message(uuid, text) to authenticated;
grant execute on function public.get_my_personal_inquiry_messages() to authenticated;
grant execute on function public.get_personal_inquiries_page_as_global_admin(integer, integer, text, text) to authenticated;
grant execute on function public.mark_personal_inquiry_read(uuid) to authenticated;
grant execute on function public.get_unread_personal_inquiry_count() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'personal_inquiries'
  ) then
    alter publication supabase_realtime add table public.personal_inquiries;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'personal_inquiry_messages'
  ) then
    alter publication supabase_realtime add table public.personal_inquiry_messages;
  end if;
end $$;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/188_personal_inquiry_workflow_enhancements.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/189_get_my_admin_roles.sql
-- =========================================================

create or replace function public.get_my_admin_roles()
returns setof public.admin_roles
language sql
stable
security definer
set search_path = public
as $$
  select role.*
  from public.admin_roles role
  where role.user_id = auth.uid()
  order by role.role desc, role.updated_at desc nulls last, role.created_at desc nulls last;
$$;

revoke all on function public.get_my_admin_roles() from public, anon;
grant execute on function public.get_my_admin_roles() to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/189_get_my_admin_roles.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/190_enable_signup_email_availability_check.sql
-- =========================================================

-- Signup explicitly checks whether an email is already registered before
-- collecting the user's remaining personal information.
grant execute on function public.email_exists(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/190_enable_signup_email_availability_check.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/191_personal_inquiry_realtime_rls.sql
-- =========================================================

drop policy if exists "Users and global admins can view personal inquiries"
  on public.personal_inquiries;
create policy "Users and global admins can view personal inquiries"
on public.personal_inquiries for select to authenticated
using (user_id = auth.uid() or public.is_global_admin());

drop policy if exists "Users and global admins can view personal inquiry messages"
  on public.personal_inquiry_messages;
create policy "Users and global admins can view personal inquiry messages"
on public.personal_inquiry_messages for select to authenticated
using (
  public.is_global_admin()
  or exists (
    select 1
    from public.personal_inquiries inquiry
    where inquiry.id = personal_inquiry_messages.inquiry_id
      and inquiry.user_id = auth.uid()
  )
);

grant select on public.personal_inquiries to authenticated;
grant select on public.personal_inquiry_messages to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/191_personal_inquiry_realtime_rls.sql
-- =========================================================

-- =========================================================
-- BEGIN sql/setup/192_personal_inquiry_audit_access.sql
-- =========================================================

create or replace function public.get_personal_inquiry_audit_logs(
  p_inquiry_id uuid
)
returns setof public.personal_inquiry_audit_logs
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global administrators can view personal inquiry audit logs.';
  end if;
  return query
  select audit.*
  from public.personal_inquiry_audit_logs audit
  where audit.inquiry_id = p_inquiry_id
  order by audit.created_at desc;
end;
$$;

revoke all on function public.get_personal_inquiry_audit_logs(uuid)
  from public, anon;
grant execute on function public.get_personal_inquiry_audit_logs(uuid)
  to authenticated;

notify pgrst, 'reload schema';

-- =========================================================
-- END sql/setup/192_personal_inquiry_audit_access.sql
-- =========================================================
