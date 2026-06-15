-- =========================================================
-- CCC Bus simulation: initial payment states
-- Creates initial payment rows after simulation reservations exist.
-- Run files in sql/simulation/README.md order.
-- =========================================================

begin;

-- =========================================================
-- 8. Create initial payment states
-- =========================================================

insert into payments (
  user_id,
  reservation_id,
  amount,
  status,
  paid_at,
  verified_by,
  verified_at,
  notes
)
select
  reservations.user_id,
  reservations.id,
  10000,
  case
    when sim_auth_users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
      then 'completed'
    else sim_auth_users.raw_user_meta_data ->> 'payment_status'
  end,
  case
    when sim_auth_users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
      or sim_auth_users.raw_user_meta_data ->> 'payment_status' = 'completed'
      then now()
    else null
  end,
  null,
  null,
  'SIM initial payment state'
from reservations
join auth.users sim_auth_users on sim_auth_users.id = reservations.user_id
where (
    (
      sim_auth_users.email like 'sim-user-%@ccc-bus.test'
      and sim_auth_users.raw_user_meta_data ->> 'sim_role' is null
    )
    or (
      sim_auth_users.email like 'sim-admin-campus-%@ccc-bus.test'
      and sim_auth_users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
    )
  )
  and (
    sim_auth_users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
    or sim_auth_users.raw_user_meta_data ->> 'payment_status' <> 'cancelled'
  )
on conflict (reservation_id) where reservation_id is not null do update set
  amount = excluded.amount,
  status = excluded.status,
  paid_at = excluded.paid_at,
  verified_by = null,
  verified_at = null,
  notes = excluded.notes,
  updated_at = now();

do $$
declare
  v_expected_campus_admins integer;
  v_payments integer;
  v_completed_payments integer;
  v_pending_payments integer;
  v_cancelled_reservation_payments integer;
  v_orphan_payments integer;
begin
  select count(*) into v_expected_campus_admins
  from campus_options;

  select count(*) into v_payments
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
  );

  select count(*) into v_completed_payments
  from payments
  where status = 'completed'
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

  select count(*) into v_pending_payments
  from payments
  where status = 'pending'
    and user_id in (
      select id
      from auth.users
      where email like 'sim-user-%@ccc-bus.test'
        and raw_user_meta_data ->> 'sim_role' is null
    );

  select count(*) into v_cancelled_reservation_payments
  from payments
  join reservations on reservations.id = payments.reservation_id
  join auth.users on auth.users.id = reservations.user_id
  where reservations.status = 'cancelled'
    and auth.users.email like 'sim-%@ccc-bus.test';

  select count(*) into v_orphan_payments
  from payments
  join auth.users on auth.users.id = payments.user_id
  left join reservations on reservations.id = payments.reservation_id
  where auth.users.email like 'sim-%@ccc-bus.test'
    and reservations.id is null;

  if v_payments <> 1980 + v_expected_campus_admins
    or v_completed_payments <> 1900 + v_expected_campus_admins
    or v_pending_payments <> 80
    or v_cancelled_reservation_payments <> 0
    or v_orphan_payments <> 0
  then
    raise exception
      'Initial payment state validation failed: payments=% completed=% pending=% cancelled_reservation_payments=% orphan_payments=%',
      v_payments,
      v_completed_payments,
      v_pending_payments,
      v_cancelled_reservation_payments,
      v_orphan_payments;
  end if;
end $$;

select
  payments.status,
  count(*) as payment_count,
  sum(payments.amount) as total_amount
from payments
where user_id in (
  select id
  from auth.users
  where email like 'sim-%@ccc-bus.test'
)
group by payments.status
order by payments.status;

commit;
