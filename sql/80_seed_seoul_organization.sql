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
