-- =========================================================
-- CCC Bus simulation: auth user verification
-- =========================================================
-- Supabase protects auth.users and auth.identities under the
-- supabase_auth_admin owner. Direct inserts from SQL Editor can fail with:
--
--   ERROR: 42501: must be owner of table users
--
-- Create the simulation Auth users through the supported Auth Admin API:
--
--   1. Use a separate trusted Auth Admin API process to create the users.
--   2. Run 30_프로필_및_캠퍼스관리자_등록.sql.
--   3. Run this SQL file to verify the result.
--
-- The repository intentionally does not include an Auth-user seed script.
-- =========================================================

select
  (select count(*) from campus_options) as expected_campus_admins,
  (
    select count(*)
    from auth.users
    where email like 'sim-admin-campus-%@ccc-bus.test'
      and raw_user_meta_data ->> 'sim_role' = 'campus_admin'
  ) as actual_campus_admins,
  (
    select count(*)
    from admin_roles
    join auth.users on auth.users.id = admin_roles.user_id
    where admin_roles.role = 'campus_admin'
      and auth.users.email like 'sim-admin-campus-%@ccc-bus.test'
      and auth.users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
  ) as registered_campus_admin_roles,
  2000 as expected_general_users,
  (
    select count(*)
    from auth.users
    where email like 'sim-user-%@ccc-bus.test'
      and raw_user_meta_data ->> 'sim_role' is null
  ) as actual_general_users,
  (
    select count(*)
    from auth.users
    where email like 'sim-%@ccc-bus.test'
  ) - (
    select count(*)
    from auth.users
    where (
        email like 'sim-user-%@ccc-bus.test'
        and raw_user_meta_data ->> 'sim_role' is null
      )
      or (
        email like 'sim-admin-campus-%@ccc-bus.test'
        and raw_user_meta_data ->> 'sim_role' = 'campus_admin'
      )
  ) as unexpected_simulation_accounts;

select
  email,
  raw_user_meta_data ->> 'sim_role' as sim_role,
  raw_user_meta_data ->> 'district_id' as district_id,
  raw_user_meta_data ->> 'district' as district,
  raw_user_meta_data ->> 'team_id' as team_id,
  raw_user_meta_data ->> 'team' as team,
  raw_user_meta_data ->> 'campus_id' as campus_id,
  raw_user_meta_data ->> 'campus' as campus
from auth.users
where email like 'sim-%@ccc-bus.test'
order by email
limit 30;

select
  campus_options.district,
  campus_options.team,
  campus_options.campus,
  auth.users.email as registered_admin_email
from campus_options
left join admin_roles
  on admin_roles.role = 'campus_admin'
  and admin_roles.district_id = campus_options.district_id
  and admin_roles.team_id = campus_options.team_id
  and admin_roles.campus_id = campus_options.campus_id
left join auth.users on auth.users.id = admin_roles.user_id
  and auth.users.email like 'sim-admin-campus-%@ccc-bus.test'
  and auth.users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
order by
  campus_options.district_sort_order,
  campus_options.team_sort_order,
  campus_options.campus_sort_order,
  campus_options.campus;
