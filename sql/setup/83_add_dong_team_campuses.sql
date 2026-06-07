-- Add two Seoul district Dong team campuses to the live organization data.
-- Run this in Supabase SQL Editor after the base organization seed exists.

with target_team as (
  select teams.id
  from teams
  join districts on districts.id = teams.district_id
  where districts.name = '서울지구'
    and teams.name = '동팀'
  limit 1
),
seed_campuses(campus_name, sort_order) as (
  values
    ('한국체육대학교', 60),
    ('장로회신학대학교', 70)
)
insert into campuses (team_id, name, sort_order, is_active)
select target_team.id, seed_campuses.campus_name, seed_campuses.sort_order, true
from target_team
cross join seed_campuses
on conflict (team_id, name)
do update set
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();
