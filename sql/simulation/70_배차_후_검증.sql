-- =========================================================
-- CCC Bus simulation: post-allocation verification
-- Read-only checks to run after automatic assignment.
-- Run files in sql/simulation/README.md order.
-- =========================================================

-- Final checklist after automatic assignment

-- This must return zero. A confirmed passenger without a completed payment
-- indicates that allocation was run before the settlement rehearsal completed.
select count(*) as confirmed_without_completed_payment
from reservations
join auth.users on auth.users.id = reservations.user_id
left join payments on payments.reservation_id = reservations.id
where reservations.status = 'confirmed'
  and auth.users.email like 'sim-%@ccc-bus.test'
  and coalesce(payments.status, 'missing') <> 'completed';

-- This must return zero. Confirmed rows must have a complete ticket payload.
select count(*) as confirmed_with_incomplete_ticket
from reservations
join auth.users on auth.users.id = reservations.user_id
where reservations.status = 'confirmed'
  and auth.users.email like 'sim-%@ccc-bus.test'
  and (
    confirmed_ticket is null
    or nullif(confirmed_ticket ->> 'busNumber', '') is null
    or nullif(confirmed_ticket ->> 'seatNumber', '') is null
    or nullif(confirmed_ticket ->> 'departureTime', '') is null
    or nullif(confirmed_ticket ->> 'boardingPlace', '') is null
    or nullif(confirmed_ticket ->> 'dropoffStation', '') is null
  );

select
  status,
  count(*) as count
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
group by status
order by status;

select
  reservations.status as reservation_status,
  coalesce(payments.status, 'missing') as payment_status,
  count(*) as reservation_count
from reservations
left join payments on payments.reservation_id = reservations.id
where reservations.user_id in (
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
group by reservations.status, payment_status
order by reservations.status, payment_status;

select
  confirmed_ticket ->> 'busNumber' as bus_number,
  confirmed_ticket ->> 'departureTime' as departure_time,
  confirmed_ticket ->> 'boardingPlace' as boarding_place,
  confirmed_ticket ->> 'dropoffStation' as dropoff_station,
  coalesce(payments.status, 'missing') as payment_status,
  count(*) as passenger_count
from reservations
left join payments on payments.reservation_id = reservations.id
where reservations.status = 'confirmed'
  and reservations.user_id in (
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
group by bus_number, departure_time, boarding_place, dropoff_station, payment_status
order by bus_number, dropoff_station, payment_status;

select
  auth.users.email,
  reservations.name,
  reservations.team,
  reservations.campus,
  coalesce(payments.status, 'missing') as payment_status,
  confirmed_ticket ->> 'busNumber' as bus_number,
  confirmed_ticket ->> 'seatNumber' as seat_number,
  confirmed_ticket ->> 'dropoffStation' as dropoff_station
from reservations
join auth.users on auth.users.id = reservations.user_id
left join payments on payments.reservation_id = reservations.id
where reservations.status = 'confirmed'
  and (
    (
      auth.users.email like 'sim-user-%@ccc-bus.test'
      and auth.users.raw_user_meta_data ->> 'sim_role' is null
    )
    or (
      auth.users.email like 'sim-admin-campus-%@ccc-bus.test'
      and auth.users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
    )
  )
  and coalesce(payments.status, 'missing') <> 'completed'
order by payment_status, auth.users.email;
