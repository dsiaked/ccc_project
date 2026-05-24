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

create unique index if not exists idx_admin_roles_user_unique
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
using (
  exists (
    select 1
    from admin_roles ar
    where ar.user_id = auth.uid()
      and ar.role = 'global_admin'
  )
);

-- 전체 관리자: 관리자 권한 관리
create policy "Global admins can manage admin roles"
on admin_roles
for all
to authenticated
using (
  exists (
    select 1
    from admin_roles ar
    where ar.user_id = auth.uid()
      and ar.role = 'global_admin'
  )
)
with check (
  exists (
    select 1
    from admin_roles ar
    where ar.user_id = auth.uid()
      and ar.role = 'global_admin'
  )
);


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