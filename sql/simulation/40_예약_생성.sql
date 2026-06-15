-- =========================================================
-- CCC Bus simulation: reservations
-- Creates reservations, then validates reservation data.
-- Run files in sql/simulation/README.md order.
-- =========================================================

begin;

-- =========================================================
-- 7. Create reservations
-- =========================================================

-- Build deterministic but uneven demand:
-- - 30% choose among the first 8 active stations.
-- - 30% choose among the first 20 active stations.
-- - 40% choose among every active station.
-- This creates popular destinations without repeating identical 21/22-person
-- demand across nearly every station.
with active_stations as (
  select
    stations.*,
    (row_number() over (order by sort_order, name))::integer as station_rank
  from stations
  where is_active
),
station_counts as (
  select count(*)::integer as station_count
  from active_stations
),
simulation_users as (
  select
    auth_users.id,
    auth_users.email,
    case
      when nullif(auth_users.raw_user_meta_data ->> 'sim_seq', '') ~ '^[0-9]+$'
        then (auth_users.raw_user_meta_data ->> 'sim_seq')::integer
      else 2000 + (row_number() over (order by auth_users.email))::integer
    end as sim_sequence,
    mod(abs(hashtext(auth_users.email || ':demand-bucket')::bigint), 10)::integer
      as demand_bucket,
    abs(hashtext(auth_users.email || ':first-choice')::bigint) as first_choice_seed,
    abs(hashtext(auth_users.email || ':second-choice')::bigint) as second_choice_seed,
    auth_users.raw_user_meta_data || jsonb_build_object(
      'payment_status',
        case
          when auth_users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
            then 'completed'
          else auth_users.raw_user_meta_data ->> 'payment_status'
        end,
      'sim_seq',
        case
          when auth_users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
            then coalesce(
              nullif(auth_users.raw_user_meta_data ->> 'sim_seq', ''),
              (2000 + row_number() over (order by auth_users.email))::text
            )
          else auth_users.raw_user_meta_data ->> 'sim_seq'
        end
    ) as raw_user_meta_data
  from auth.users auth_users
  where (
      auth_users.email like 'sim-user-%@ccc-bus.test'
      and auth_users.raw_user_meta_data ->> 'sim_role' is null
    )
    or (
      auth_users.email like 'sim-admin-campus-%@ccc-bus.test'
      and auth_users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
    )
),
simulation_choices as (
  select
    simulation_users.*,
    first_choice.first_rank,
    (
      mod(
        first_choice.first_rank - 1
          + 1
          + mod(simulation_users.second_choice_seed, station_counts.station_count - 1),
        station_counts.station_count
      ) + 1
    )::integer as second_rank
  from simulation_users
  cross join station_counts
  cross join lateral (
    select case
      when simulation_users.demand_bucket < 3
        then mod(simulation_users.first_choice_seed, least(8, station_counts.station_count)) + 1
      when simulation_users.demand_bucket < 6
        then mod(simulation_users.first_choice_seed, least(20, station_counts.station_count)) + 1
      else mod(simulation_users.first_choice_seed, station_counts.station_count) + 1
    end::integer as first_rank
  ) first_choice
  where station_counts.station_count >= 2
)
insert into reservations (
  user_id,
  name,
  phone,
  district,
  team,
  campus,
  district_id,
  team_id,
  campus_id,
  station_preferences,
  status,
  confirmed_ticket,
  data,
  created_at,
  updated_at
)
select
  sim_auth_users.id,
  sim_auth_users.raw_user_meta_data ->> 'name',
  sim_auth_users.raw_user_meta_data ->> 'phone',
  sim_auth_users.raw_user_meta_data ->> 'district',
  sim_auth_users.raw_user_meta_data ->> 'team',
  sim_auth_users.raw_user_meta_data ->> 'campus',
  (sim_auth_users.raw_user_meta_data ->> 'district_id')::uuid,
  (sim_auth_users.raw_user_meta_data ->> 'team_id')::uuid,
  (sim_auth_users.raw_user_meta_data ->> 'campus_id')::uuid,
  prefs.station_preferences,
  case
    when sim_auth_users.raw_user_meta_data ->> 'payment_status' = 'cancelled'
      then 'cancelled'
    else 'requested'
  end,
  null,
  jsonb_build_object(
    'id', 'reservation-' || extract(epoch from now())::bigint || '-'
      || (sim_auth_users.raw_user_meta_data ->> 'sim_seq'),
    'name', sim_auth_users.raw_user_meta_data ->> 'name',
    'phone', sim_auth_users.raw_user_meta_data ->> 'phone',
    'district', sim_auth_users.raw_user_meta_data ->> 'district',
    'team', sim_auth_users.raw_user_meta_data ->> 'team',
    'campus', sim_auth_users.raw_user_meta_data ->> 'campus',
    'stationPreferences', prefs.station_preferences,
    'status', case
      when sim_auth_users.raw_user_meta_data ->> 'payment_status' = 'cancelled'
        then 'cancelled'
      else 'requested'
    end,
    'requestedAt', now() - (
      (sim_auth_users.raw_user_meta_data ->> 'sim_seq') || ' minutes'
    )::interval
  ),
  now() - (
    (sim_auth_users.raw_user_meta_data ->> 'sim_seq') || ' minutes'
  )::interval,
  now() - (
    (sim_auth_users.raw_user_meta_data ->> 'sim_seq') || ' minutes'
  )::interval
from simulation_choices sim_auth_users
join active_stations s1 on s1.station_rank = sim_auth_users.first_rank
join active_stations s2 on s2.station_rank = sim_auth_users.second_rank
cross join lateral (
  select jsonb_build_array(
    jsonb_build_object(
      'rank', 1,
      'station', jsonb_build_object(
        'id', s1.id,
        'name', s1.name,
        'line', s1.line,
        'address', s1.address,
        'lat', s1.lat,
        'lng', s1.lng
      )
    ),
    jsonb_build_object(
      'rank', 2,
      'station', jsonb_build_object(
        'id', s2.id,
        'name', s2.name,
        'line', s2.line,
        'address', s2.address,
        'lat', s2.lat,
        'lng', s2.lng
      )
    )
  ) as station_preferences
) prefs
on conflict (user_id) do update set
  name = excluded.name,
  phone = excluded.phone,
  district = excluded.district,
  team = excluded.team,
  campus = excluded.campus,
  district_id = excluded.district_id,
  team_id = excluded.team_id,
  campus_id = excluded.campus_id,
  station_preferences = excluded.station_preferences,
  status = excluded.status,
  confirmed_ticket = null,
  data = excluded.data,
  updated_at = now();

do $$
declare
  v_all_sim_auth_users integer;
  v_auth_users integer;
  v_profiles integer;
  v_campus_admins integer;
  v_reservations integer;
  v_requested_reservations integer;
  v_incomplete_profiles integer;
  v_invalid_station_preferences integer;
  v_same_station_preferences integer;
  v_distinct_first_choice_stations integer;
  v_first_choice_demand_spread integer;
  v_active_stations integer;
  v_expected_campus_admins integer;
begin
  select count(*) into v_expected_campus_admins
  from campus_options;

  select count(*) into v_active_stations
  from stations
  where is_active;

  select count(*) into v_all_sim_auth_users
  from auth.users
  where email like 'sim-%@ccc-bus.test';

  select count(*) into v_auth_users
  from auth.users
  where (
      email like 'sim-user-%@ccc-bus.test'
      and raw_user_meta_data ->> 'sim_role' is null
    )
    or (
      email like 'sim-admin-campus-%@ccc-bus.test'
      and raw_user_meta_data ->> 'sim_role' = 'campus_admin'
    );

  select count(*) into v_profiles
  from profiles
  where id in (
    select id
    from auth.users
    where (
        email like 'sim-user-%@ccc-bus.test'
        and raw_user_meta_data ->> 'sim_role' is null
      )
      or (
        email like 'sim-admin-campus-%@ccc-bus.test'
        and raw_user_meta_data ->> 'sim_role' = 'campus_admin'
      )
  );

  select count(*) into v_campus_admins
  from admin_roles
  where role = 'campus_admin'
    and user_id in (
      select id
      from auth.users
      where email like 'sim-admin-campus-%@ccc-bus.test'
        and raw_user_meta_data ->> 'sim_role' = 'campus_admin'
    );

  select count(*) into v_reservations
  from reservations
  where user_id in (
    select id
    from auth.users
    where (
        email like 'sim-user-%@ccc-bus.test'
        and raw_user_meta_data ->> 'sim_role' is null
      )
      or (
        email like 'sim-admin-campus-%@ccc-bus.test'
        and raw_user_meta_data ->> 'sim_role' = 'campus_admin'
      )
  );

  select count(*) into v_requested_reservations
  from reservations
  where status = 'requested'
    and user_id in (
      select id
      from auth.users
      where (
          email like 'sim-user-%@ccc-bus.test'
          and raw_user_meta_data ->> 'sim_role' is null
        )
        or (
          email like 'sim-admin-campus-%@ccc-bus.test'
          and raw_user_meta_data ->> 'sim_role' = 'campus_admin'
        )
    );

  select count(*) into v_incomplete_profiles
  from profiles
  where id in (
      select id
      from auth.users
      where (
          email like 'sim-user-%@ccc-bus.test'
          and raw_user_meta_data ->> 'sim_role' is null
        )
        or (
          email like 'sim-admin-campus-%@ccc-bus.test'
          and raw_user_meta_data ->> 'sim_role' = 'campus_admin'
        )
    )
    and (
      district_id is null
      or team_id is null
      or campus_id is null
      or district is null
      or team is null
      or campus is null
    );

  select count(*) into v_invalid_station_preferences
  from reservations
  where user_id in (
      select id
      from auth.users
      where (
          email like 'sim-user-%@ccc-bus.test'
          and raw_user_meta_data ->> 'sim_role' is null
        )
        or (
          email like 'sim-admin-campus-%@ccc-bus.test'
          and raw_user_meta_data ->> 'sim_role' = 'campus_admin'
        )
    )
    and (
      jsonb_array_length(station_preferences) <> 2
      or station_preferences -> 0 ->> 'rank' <> '1'
      or station_preferences -> 1 ->> 'rank' <> '2'
    );

  select count(*) into v_same_station_preferences
  from reservations
  where user_id in (
      select id from auth.users where email like 'sim-%@ccc-bus.test'
    )
    and station_preferences -> 0 -> 'station' ->> 'id'
      = station_preferences -> 1 -> 'station' ->> 'id';

  select count(distinct station_preferences -> 0 -> 'station' ->> 'id')
  into v_distinct_first_choice_stations
  from reservations
  where status = 'requested'
    and user_id in (
      select id from auth.users where email like 'sim-%@ccc-bus.test'
    );

  select
    max(station_demand) - min(station_demand)
  into v_first_choice_demand_spread
  from (
    select count(*)::integer as station_demand
    from reservations
    where status = 'requested'
      and user_id in (
        select id from auth.users where email like 'sim-%@ccc-bus.test'
      )
    group by station_preferences -> 0 -> 'station' ->> 'id'
  ) demand_by_station;

  if v_auth_users <> 2000 + v_expected_campus_admins
    or v_all_sim_auth_users <> v_auth_users
    or v_profiles <> 2000 + v_expected_campus_admins
    or v_campus_admins <> v_expected_campus_admins
    or v_reservations <> 2000 + v_expected_campus_admins
    or v_requested_reservations <> 1980 + v_expected_campus_admins
    or v_incomplete_profiles <> 0
    or v_invalid_station_preferences <> 0
    or v_same_station_preferences <> 0
    or v_distinct_first_choice_stations < least(30, v_active_stations)
    or coalesce(v_first_choice_demand_spread, 0) < 10
  then
    raise exception
      'Reservation simulation validation failed: valid_auth=% all_sim_auth=% profiles=% campus_admins=% reservations=% requested=% incomplete_profiles=% invalid_preferences=% same_station_preferences=% distinct_first_choices=% demand_spread=%',
      v_auth_users,
      v_all_sim_auth_users,
      v_profiles,
      v_campus_admins,
      v_reservations,
      v_requested_reservations,
      v_incomplete_profiles,
      v_invalid_station_preferences,
      v_same_station_preferences,
      v_distinct_first_choice_stations,
      v_first_choice_demand_spread;
  end if;
end $$;

select
  station_preferences -> 0 -> 'station' ->> 'name' as first_choice_station,
  count(*) as requested_people
from reservations
where status = 'requested'
  and user_id in (
    select id from auth.users where email like 'sim-%@ccc-bus.test'
  )
group by first_choice_station
order by requested_people desc, first_choice_station;

commit;
