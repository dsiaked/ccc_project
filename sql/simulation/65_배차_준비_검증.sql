-- =========================================================
-- CCC Bus simulation: allocation readiness verification
-- Read-only checks after payment and settlement rehearsal.
-- Run before opening /admin/allocation.
-- =========================================================

do $$
declare
  v_deadline_at timestamptz;
  v_unpaid_requested integer;
  v_unconfirmed_transfers integer;
  v_transfer_mismatches integer;
  v_non_simulation_active_reservations integer;
begin
  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from app_settings
  where key = 'first_reservation_deadline';

  if v_deadline_at is null or v_deadline_at > now() then
    raise exception 'Allocation readiness failed: the reservation window is not closed.';
  end if;

  select count(*)
  into v_non_simulation_active_reservations
  from reservations
  left join auth.users on auth.users.id = reservations.user_id
  where reservations.status <> 'cancelled'
    and not (
      coalesce(auth.users.email, '') like 'sim-user-%@ccc-bus.test'
      or coalesce(auth.users.email, '') like 'sim-admin-campus-%@ccc-bus.test'
    );

  select count(*)
  into v_unpaid_requested
  from reservations
  join auth.users on auth.users.id = reservations.user_id
  left join payments on payments.reservation_id = reservations.id
  where reservations.status = 'requested'
    and auth.users.email like 'sim-%@ccc-bus.test'
    and coalesce(payments.status, 'missing') <> 'completed';

  select count(*)
  into v_unconfirmed_transfers
  from campus_transfers
  where sent_by in (
      select id
      from auth.users
      where email like 'sim-admin-campus-%@ccc-bus.test'
    )
    and (
      status <> 'confirmed'
      or confirmed_by is null
      or confirmed_at is null
      or actual_confirmed_amount is null
    );

  with current_stats as (
    select
      reservations.district_id,
      reservations.team_id,
      reservations.campus_id,
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
      reservations.team_id,
      reservations.campus_id
  )
  select count(*)
  into v_transfer_mismatches
  from current_stats
  left join campus_transfers
    on campus_transfers.district_id = current_stats.district_id
    and campus_transfers.team_id = current_stats.team_id
    and campus_transfers.campus_id = current_stats.campus_id
  where campus_transfers.id is null
    or campus_transfers.total_people <> current_stats.total_people
    or campus_transfers.paid_people <> current_stats.paid_people
    or campus_transfers.total_amount <> current_stats.total_amount
    or campus_transfers.actual_confirmed_amount <> current_stats.total_amount;

  if v_non_simulation_active_reservations <> 0
    or v_unpaid_requested <> 0
    or v_unconfirmed_transfers <> 0
    or v_transfer_mismatches <> 0
  then
    raise exception
      'Allocation readiness failed: non_sim_active=% unpaid_requested=% unconfirmed_transfers=% transfer_mismatches=%',
      v_non_simulation_active_reservations,
      v_unpaid_requested,
      v_unconfirmed_transfers,
      v_transfer_mismatches;
  end if;
end $$;

select
  reservations.team,
  reservations.campus,
  count(*) as allocation_ready_people,
  sum(payments.amount) as confirmed_amount
from reservations
join auth.users on auth.users.id = reservations.user_id
join payments on payments.reservation_id = reservations.id
where reservations.status = 'requested'
  and payments.status = 'completed'
  and auth.users.email like 'sim-%@ccc-bus.test'
group by reservations.team, reservations.campus
order by reservations.team, reservations.campus;
