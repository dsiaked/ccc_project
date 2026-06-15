-- =========================================================
-- CCC Bus simulation: seed verification
-- Read-only verification queries for accounts, reservations, demand, and payments.
-- Run files in sql/simulation/README.md order.
-- =========================================================

-- =========================================================
-- 9. Verification queries
-- =========================================================

-- 9-0. Expected summary:
-- accounts/profiles = 2,000 general users + one admin per active campus
-- reservations = 2,000 general users + one admin per active campus
-- requested/payments = 1,980 general users + one admin per active campus
select
  (select count(*) from campus_options) as active_campuses,
  (
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
  ) as auth_users,
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
  ) as unexpected_simulation_accounts,
  (
    select count(*)
    from auth.users
    where email like 'sim-admin-campus-%@ccc-bus.test'
      and raw_user_meta_data ->> 'sim_role' = 'campus_admin'
  ) as campus_admins,
  (
    select count(*)
    from auth.users
    where email like 'sim-user-%@ccc-bus.test'
      and raw_user_meta_data ->> 'sim_role' is null
  ) as general_users,
  (
    select count(*)
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
  ) as profiles,
  (
    select count(*)
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
  ) as reservations,
  (
    select count(*)
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
      )
  ) as requested_reservations,
  (
    select count(*)
    from payments
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
  ) as payments;

-- 9-1. Rehearsal login accounts
select
  email,
  'Simulation123!' as password,
  case
    when email like 'sim-admin-campus-%' then 'campus_admin'
    else 'user'
  end as expected_role
from auth.users
where (
    email like 'sim-user-%@ccc-bus.test'
    and raw_user_meta_data ->> 'sim_role' is null
  )
  or (
    email like 'sim-admin-campus-%@ccc-bus.test'
    and raw_user_meta_data ->> 'sim_role' = 'campus_admin'
  )
order by email;

-- 9-2. Reservation count by campus
select
  district,
  team,
  campus,
  status,
  count(*) as reservation_count
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
group by district, team, campus, status
order by team, campus, status;

-- 9-3. Allocation demand by rank (requested reservations only)
select
  preference -> 'station' ->> 'name' as station_name,
  count(*) filter (where (preference ->> 'rank')::integer = 1) as rank1,
  count(*) filter (where (preference ->> 'rank')::integer = 2) as rank2,
  count(*) as total_mentions
from reservations
cross join lateral jsonb_array_elements(station_preferences) as preference
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
  )
group by station_name
order by rank1 desc, rank2 desc, station_name;

-- 9-4. Payment status
select
  payments.status,
  count(*) as payment_count,
  sum(payments.amount) as total_amount
from payments
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
group by payments.status
order by payments.status;
