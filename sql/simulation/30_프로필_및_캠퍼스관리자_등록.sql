-- =========================================================
-- CCC Bus simulation: register profiles and campus admins
-- Registers simulation Auth users in public profiles and admin_roles.
-- Run after creating the required users through the Supabase Auth Admin API.
-- =========================================================

begin;

do $$
declare
  v_expected_admins integer;
  v_actual_admins integer;
  v_general_users integer;
  v_sim_auth_users integer;
  v_admin_campus_coverage integer;
  v_invalid_scope_metadata integer;
  v_existing_non_sim_admins integer;
  v_general_campus_coverage integer;
  v_min_general_users_per_campus integer;
  v_max_general_users_per_campus integer;
begin
  select count(*) into v_expected_admins
  from campus_options;

  select count(*) into v_sim_auth_users
  from auth.users
  where email like 'sim-%@ccc-bus.test';

  if v_sim_auth_users = 0 then
    raise exception using
      message = 'Simulation Auth users were not found in this Supabase project.',
      detail = format(
        'Expected 2000 general users and %s campus admins, but auth.users contains no sim-%%@ccc-bus.test accounts.',
        v_expected_admins
      ),
      hint = 'Create the required simulation accounts through the Supabase Auth Admin API, confirm they belong to this project, then rerun this SQL file.';
  end if;

  select count(*) into v_actual_admins
  from auth.users
  where email like 'sim-admin-campus-%@ccc-bus.test'
    and raw_user_meta_data ->> 'sim_role' = 'campus_admin';

  select count(*) into v_general_users
  from auth.users
  where email like 'sim-user-%@ccc-bus.test'
    and raw_user_meta_data ->> 'sim_role' is null;

  with campus_counts as (
    select
      campus_options.campus_id,
      count(auth.users.id)::integer as general_user_count
    from campus_options
    left join auth.users
      on auth.users.email like 'sim-user-%@ccc-bus.test'
      and auth.users.raw_user_meta_data ->> 'sim_role' is null
      and auth.users.raw_user_meta_data ->> 'district_id'
        = campus_options.district_id::text
      and auth.users.raw_user_meta_data ->> 'team_id'
        = campus_options.team_id::text
      and auth.users.raw_user_meta_data ->> 'campus_id'
        = campus_options.campus_id::text
    group by campus_options.campus_id
  )
  select
    count(*) filter (where general_user_count > 0),
    min(general_user_count),
    max(general_user_count)
  into
    v_general_campus_coverage,
    v_min_general_users_per_campus,
    v_max_general_users_per_campus
  from campus_counts;

  select count(distinct campus_options.campus_id)
  into v_admin_campus_coverage
  from auth.users
  join campus_options
    on campus_options.district_id::text =
      auth.users.raw_user_meta_data ->> 'district_id'
    and campus_options.team_id::text =
      auth.users.raw_user_meta_data ->> 'team_id'
    and campus_options.campus_id::text =
      auth.users.raw_user_meta_data ->> 'campus_id'
  where auth.users.email like 'sim-admin-campus-%@ccc-bus.test'
    and auth.users.raw_user_meta_data ->> 'sim_role' = 'campus_admin';

  select count(*) into v_invalid_scope_metadata
  from auth.users
  where email like 'sim-%@ccc-bus.test'
    and (
      nullif(raw_user_meta_data ->> 'district_id', '') is null
      or nullif(raw_user_meta_data ->> 'team_id', '') is null
      or nullif(raw_user_meta_data ->> 'campus_id', '') is null
      or nullif(raw_user_meta_data ->> 'district', '') is null
      or nullif(raw_user_meta_data ->> 'team', '') is null
      or nullif(raw_user_meta_data ->> 'campus', '') is null
      or not exists (
        select 1
        from campus_options
        where campus_options.district_id::text =
            auth.users.raw_user_meta_data ->> 'district_id'
          and campus_options.team_id::text =
            auth.users.raw_user_meta_data ->> 'team_id'
          and campus_options.campus_id::text =
            auth.users.raw_user_meta_data ->> 'campus_id'
          and campus_options.district = auth.users.raw_user_meta_data ->> 'district'
          and campus_options.team = auth.users.raw_user_meta_data ->> 'team'
          and campus_options.campus = auth.users.raw_user_meta_data ->> 'campus'
      )
    );

  if v_general_users <> 2000
    or v_actual_admins <> v_expected_admins
    or v_admin_campus_coverage <> v_expected_admins
    or v_general_campus_coverage <> v_expected_admins
    or (
      v_expected_admins > 1
      and v_max_general_users_per_campus - v_min_general_users_per_campus < 20
    )
    or v_invalid_scope_metadata <> 0
  then
    raise exception using
      message = 'Simulation Auth validation failed.',
      detail = format(
        'general_users=%s/2000 campus_admins=%s/%s admin_coverage=%s/%s user_coverage=%s/%s campus_min=%s campus_max=%s invalid_scope_metadata=%s',
        v_general_users,
        v_actual_admins,
        v_expected_admins,
        v_admin_campus_coverage,
        v_expected_admins,
        v_general_campus_coverage,
        v_expected_admins,
        v_min_general_users_per_campus,
        v_max_general_users_per_campus,
        v_invalid_scope_metadata
      ),
      hint = 'Create 2,000 simulation users with weighted campus assignment through the Supabase Auth Admin API, then rerun this SQL file.';
  end if;

  select count(*) into v_existing_non_sim_admins
  from admin_roles existing_roles
  where existing_roles.role = 'campus_admin'
    and existing_roles.user_id not in (
      select id
      from auth.users
      where email like 'sim-admin-campus-%@ccc-bus.test'
    )
    and exists (
      select 1
      from auth.users simulation_admins
      where simulation_admins.email like 'sim-admin-campus-%@ccc-bus.test'
        and simulation_admins.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
        and (
          existing_roles.campus_id::text =
            simulation_admins.raw_user_meta_data ->> 'campus_id'
          or (
            existing_roles.district = simulation_admins.raw_user_meta_data ->> 'district'
            and existing_roles.team = simulation_admins.raw_user_meta_data ->> 'team'
            and existing_roles.campus = simulation_admins.raw_user_meta_data ->> 'campus'
          )
        )
    );

  if v_existing_non_sim_admins <> 0 then
    raise exception
      'Found % non-simulation campus admin roles. Remove them explicitly before replacing them in the rehearsal database.',
      v_existing_non_sim_admins;
  end if;
end $$;

insert into profiles (
  id,
  email,
  name,
  phone,
  district_id,
  district,
  team_id,
  team,
  campus_id,
  campus
)
select
  sim_auth_users.id,
  sim_auth_users.email,
  sim_auth_users.raw_user_meta_data ->> 'name',
  sim_auth_users.raw_user_meta_data ->> 'phone',
  (sim_auth_users.raw_user_meta_data ->> 'district_id')::uuid,
  sim_auth_users.raw_user_meta_data ->> 'district',
  (sim_auth_users.raw_user_meta_data ->> 'team_id')::uuid,
  sim_auth_users.raw_user_meta_data ->> 'team',
  (sim_auth_users.raw_user_meta_data ->> 'campus_id')::uuid,
  sim_auth_users.raw_user_meta_data ->> 'campus'
from auth.users sim_auth_users
where sim_auth_users.email like 'sim-%@ccc-bus.test'
on conflict (id) do update set
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

delete from admin_roles
where role = 'campus_admin'
  and user_id in (
    select id
    from auth.users
    where email like 'sim-admin-campus-%@ccc-bus.test'
      and raw_user_meta_data ->> 'sim_role' = 'campus_admin'
  );

insert into admin_roles (
  user_id,
  role,
  district_id,
  district,
  team_id,
  team,
  campus_id,
  campus
)
select
  sim_auth_users.id,
  'campus_admin',
  (sim_auth_users.raw_user_meta_data ->> 'district_id')::uuid,
  sim_auth_users.raw_user_meta_data ->> 'district',
  (sim_auth_users.raw_user_meta_data ->> 'team_id')::uuid,
  sim_auth_users.raw_user_meta_data ->> 'team',
  (sim_auth_users.raw_user_meta_data ->> 'campus_id')::uuid,
  sim_auth_users.raw_user_meta_data ->> 'campus'
from auth.users sim_auth_users
where sim_auth_users.email like 'sim-admin-campus-%@ccc-bus.test'
  and sim_auth_users.raw_user_meta_data ->> 'sim_role' = 'campus_admin';

do $$
declare
  v_expected_admins integer;
  v_registered_admins integer;
  v_expected_profiles integer;
  v_registered_profiles integer;
  v_missing_admin_scopes integer;
begin
  select count(*) into v_expected_admins from campus_options;

  select count(*) into v_registered_admins
  from admin_roles
  where role = 'campus_admin'
    and user_id in (
      select id
      from auth.users
      where email like 'sim-admin-campus-%@ccc-bus.test'
    );

  select count(*) into v_expected_profiles
  from auth.users
  where email like 'sim-%@ccc-bus.test';

  select count(*) into v_registered_profiles
  from profiles
  where email like 'sim-%@ccc-bus.test';

  select count(*) into v_missing_admin_scopes
  from campus_options
  where not exists (
    select 1
    from admin_roles
    join auth.users on auth.users.id = admin_roles.user_id
    where admin_roles.role = 'campus_admin'
      and admin_roles.district_id = campus_options.district_id
      and admin_roles.team_id = campus_options.team_id
      and admin_roles.campus_id = campus_options.campus_id
      and auth.users.email like 'sim-admin-campus-%@ccc-bus.test'
  );

  if v_registered_admins <> v_expected_admins
    or v_registered_profiles <> v_expected_profiles
    or v_missing_admin_scopes <> 0
  then
    raise exception
      'Simulation registration failed: campus_admins=%/% profiles=%/% missing_admin_scopes=%',
      v_registered_admins,
      v_expected_admins,
      v_registered_profiles,
      v_expected_profiles,
      v_missing_admin_scopes;
  end if;
end $$;

select
  campus_options.district,
  campus_options.team,
  campus_options.campus,
  count(auth.users.id) as general_user_count
from campus_options
left join auth.users
  on auth.users.email like 'sim-user-%@ccc-bus.test'
  and auth.users.raw_user_meta_data ->> 'sim_role' is null
  and auth.users.raw_user_meta_data ->> 'district_id'
    = campus_options.district_id::text
  and auth.users.raw_user_meta_data ->> 'team_id'
    = campus_options.team_id::text
  and auth.users.raw_user_meta_data ->> 'campus_id'
    = campus_options.campus_id::text
group by
  campus_options.district,
  campus_options.team,
  campus_options.campus,
  campus_options.district_sort_order,
  campus_options.team_sort_order,
  campus_options.campus_sort_order
order by general_user_count desc, campus_options.campus_sort_order;

commit;
