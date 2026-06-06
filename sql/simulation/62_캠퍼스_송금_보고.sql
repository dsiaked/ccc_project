-- =========================================================
-- CCC Bus simulation: campus transfer reports
-- Rehearses each campus reporting its completed transfer to headquarters.
-- Run after 61_캠퍼스_입금_확인.sql.
-- =========================================================

begin;

do $$
declare
  v_non_simulation_active_reservations integer;
  v_unready_campuses integer;
begin
  select count(*)
  into v_non_simulation_active_reservations
  from reservations
  left join auth.users on auth.users.id = reservations.user_id
  where reservations.status <> 'cancelled'
    and not (
      coalesce(auth.users.email, '') like 'sim-user-%@ccc-bus.test'
      or coalesce(auth.users.email, '') like 'sim-admin-campus-%@ccc-bus.test'
    );

  if v_non_simulation_active_reservations <> 0 then
    raise exception
      'Found % active non-simulation reservations. Use a separated rehearsal database before creating campus transfer snapshots.',
      v_non_simulation_active_reservations;
  end if;

  select count(*)
  into v_unready_campuses
  from (
    select
      reservations.district_id,
      reservations.team_id,
      reservations.campus_id
    from reservations
    join auth.users on auth.users.id = reservations.user_id
    left join payments on payments.reservation_id = reservations.id
    where reservations.status = 'requested'
      and auth.users.email like 'sim-%@ccc-bus.test'
    group by
      reservations.district_id,
      reservations.team_id,
      reservations.campus_id
    having count(*) <> count(payments.id) filter (
      where payments.status = 'completed'
    )
  ) unready;

  if v_unready_campuses <> 0 then
    raise exception
      'Cannot report campus transfers: % campuses still have unconfirmed payments.',
      v_unready_campuses;
  end if;
end $$;

with campus_stats as (
  select
    reservations.district_id,
    reservations.district,
    reservations.team_id,
    reservations.team,
    reservations.campus_id,
    reservations.campus,
    count(*)::integer as total_people,
    count(payments.id) filter (where payments.status = 'completed')::integer
      as paid_people,
    (
      count(*) * get_bus_ticket_price()
    )::integer as total_amount
  from reservations
  join auth.users on auth.users.id = reservations.user_id
  left join payments on payments.reservation_id = reservations.id
  where reservations.status = 'requested'
    and auth.users.email like 'sim-%@ccc-bus.test'
  group by
    reservations.district_id,
    reservations.district,
    reservations.team_id,
    reservations.team,
    reservations.campus_id,
    reservations.campus
),
simulation_campus_admins as (
  select distinct on (
    admin_roles.district_id,
    admin_roles.team_id,
    admin_roles.campus_id
  )
    admin_roles.district_id,
    admin_roles.team_id,
    admin_roles.campus_id,
    admin_roles.user_id
  from admin_roles
  join auth.users on auth.users.id = admin_roles.user_id
  where admin_roles.role = 'campus_admin'
    and auth.users.email like 'sim-admin-campus-%@ccc-bus.test'
    and auth.users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
  order by
    admin_roles.district_id,
    admin_roles.team_id,
    admin_roles.campus_id,
    admin_roles.updated_at desc nulls last
)
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
select
  campus_stats.district_id,
  campus_stats.team_id,
  campus_stats.campus_id,
  campus_stats.district,
  campus_stats.team,
  campus_stats.campus,
  campus_stats.total_people,
  campus_stats.paid_people,
  campus_stats.total_amount,
  'sent',
  simulation_campus_admins.user_id,
  now(),
  null,
  null,
  null,
  now()
from campus_stats
join simulation_campus_admins
  on simulation_campus_admins.district_id = campus_stats.district_id
  and simulation_campus_admins.team_id = campus_stats.team_id
  and simulation_campus_admins.campus_id = campus_stats.campus_id
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
  updated_at = now();

do $$
declare
  v_expected_reports integer;
  v_actual_reports integer;
begin
  select count(distinct reservations.campus_id)
  into v_expected_reports
  from reservations
  join auth.users on auth.users.id = reservations.user_id
  where reservations.status = 'requested'
    and auth.users.email like 'sim-%@ccc-bus.test';

  select count(*)
  into v_actual_reports
  from campus_transfers
  join auth.users on auth.users.id = campus_transfers.sent_by
  where campus_transfers.status = 'sent'
    and auth.users.email like 'sim-admin-campus-%@ccc-bus.test';

  if v_actual_reports <> v_expected_reports then
    raise exception
      'Campus transfer report validation failed: reports=% expected=%',
      v_actual_reports,
      v_expected_reports;
  end if;
end $$;

select
  district,
  team,
  campus,
  total_people,
  paid_people,
  total_amount,
  status,
  sent_at
from campus_transfers
where sent_by in (
  select id
  from auth.users
  where email like 'sim-admin-campus-%@ccc-bus.test'
)
order by team, campus;

commit;
