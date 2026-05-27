-- =========================================================
-- Delete unused inactive Seoul organization options safely
-- Run this after seed_seoul_campuses.sql.
--
-- What this does:
-- 1. Reconnects profiles to active Seoul team/campus ids when their text names match.
-- 2. Shows any profiles still pointing to inactive team/campus ids.
-- 3. Deletes only inactive campuses/teams that no profile references.
--
-- If the "remaining_profile_references" result returns rows, fix those profiles
-- first, then run this script again.
-- =========================================================

begin;

-- Match old profile ids to the new active campus_options rows by text values.
-- This handles old team names like "서울동팀" -> "동팀" and campus names with
-- parenthesized suffixes like "한양대학교(본교)" -> "한양대학교".
with active_seoul_options as (
  select
    district_id,
    district,
    team_id,
    team,
    campus_id,
    campus
  from campus_options
  where district = '서울지구'
),
matched_profiles as (
  select
    profiles.id as profile_id,
    active_seoul_options.district_id,
    active_seoul_options.district,
    active_seoul_options.team_id,
    active_seoul_options.team,
    active_seoul_options.campus_id,
    active_seoul_options.campus
  from profiles
  join active_seoul_options
    on regexp_replace(coalesce(profiles.team, ''), '^서울', '') = active_seoul_options.team
   and trim(
      regexp_replace(
        regexp_replace(coalesce(profiles.campus, ''), '\[[^]]*\]', '', 'g'),
        '\([^)]*\)',
        '',
        'g'
      )
    ) = active_seoul_options.campus
  where profiles.district = '서울지구'
)
update profiles
set
  district_id = matched_profiles.district_id,
  district = matched_profiles.district,
  team_id = matched_profiles.team_id,
  team = matched_profiles.team,
  campus_id = matched_profiles.campus_id,
  campus = matched_profiles.campus,
  updated_at = now()
from matched_profiles
where profiles.id = matched_profiles.profile_id;

-- Check this result before trusting the deletion result.
-- If this returns rows, those profiles still reference old inactive rows.
select
  'remaining_profile_references' as check_name,
  profiles.id,
  profiles.email,
  profiles.name,
  profiles.team,
  profiles.campus,
  teams.name as referenced_team,
  teams.is_active as referenced_team_is_active,
  campuses.name as referenced_campus,
  campuses.is_active as referenced_campus_is_active
from profiles
left join teams on teams.id = profiles.team_id
left join campuses on campuses.id = profiles.campus_id
where profiles.district = '서울지구'
  and (
    coalesce(teams.is_active, false) = false
    or coalesce(campuses.is_active, false) = false
  )
order by profiles.team, profiles.campus, profiles.name;

-- Delete inactive campuses that nobody references.
delete from campuses
where is_active = false
  and team_id in (
    select teams.id
    from teams
    join districts on districts.id = teams.district_id
    where districts.name = '서울지구'
  )
  and not exists (
    select 1
    from profiles
    where profiles.campus_id = campuses.id
  );

-- Delete inactive teams only after their campuses are gone and nobody references them.
delete from teams
where is_active = false
  and district_id = (
    select id
    from districts
    where name = '서울지구'
  )
  and not exists (
    select 1
    from profiles
    where profiles.team_id = teams.id
  )
  and not exists (
    select 1
    from campuses
    where campuses.team_id = teams.id
  );

commit;

select
  'inactive_remaining_after_cleanup' as check_name,
  teams.name as team,
  campuses.name as campus
from teams
left join campuses on campuses.team_id = teams.id
where teams.district_id = (
    select id
    from districts
    where name = '서울지구'
  )
  and (
    teams.is_active = false
    or campuses.is_active = false
  )
order by teams.name, campuses.name;
