-- =========================================================
-- CCC Bus simulation: campus payment confirmation
-- Rehearses campus-admin payment confirmation after reservation close.
-- Run files in sql/simulation/README.md order.
-- =========================================================

begin;

do $$
declare
  v_missing_admin_scopes integer;
begin
  select count(*)
  into v_missing_admin_scopes
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
      and auth.users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
  );

  if v_missing_admin_scopes <> 0 then
    raise exception
      'Cannot rehearse payment confirmation: % active campuses have no simulation campus admin.',
      v_missing_admin_scopes;
  end if;
end $$;

update payments
set
  status = 'completed',
  paid_at = coalesce(payments.paid_at, now()),
  verified_by = campus_admins.user_id,
  verified_at = now(),
  notes = 'SIM campus payment confirmation',
  updated_at = now()
from reservations
join auth.users simulation_users
  on simulation_users.id = reservations.user_id
join admin_roles campus_admins
  on campus_admins.role = 'campus_admin'
  and campus_admins.district_id = reservations.district_id
  and campus_admins.team_id = reservations.team_id
  and campus_admins.campus_id = reservations.campus_id
join auth.users simulation_admin_users
  on simulation_admin_users.id = campus_admins.user_id
  and simulation_admin_users.email like 'sim-admin-campus-%@ccc-bus.test'
  and simulation_admin_users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
where payments.reservation_id = reservations.id
  and reservations.status = 'requested'
  and (
    (
      simulation_users.email like 'sim-user-%@ccc-bus.test'
      and simulation_users.raw_user_meta_data ->> 'sim_role' is null
    )
    or (
      simulation_users.email like 'sim-admin-campus-%@ccc-bus.test'
      and simulation_users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
    )
  );

do $$
declare
  v_unconfirmed_requested integer;
  v_wrong_verifier_scope integer;
begin
  select count(*)
  into v_unconfirmed_requested
  from reservations
  join auth.users on auth.users.id = reservations.user_id
  left join payments on payments.reservation_id = reservations.id
  where reservations.status = 'requested'
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
    and (
      payments.id is null
      or payments.status <> 'completed'
      or payments.verified_by is null
      or payments.verified_at is null
    );

  select count(*)
  into v_wrong_verifier_scope
  from reservations
  join auth.users simulation_users on simulation_users.id = reservations.user_id
  join payments on payments.reservation_id = reservations.id
  where reservations.status = 'requested'
    and (
      (
        simulation_users.email like 'sim-user-%@ccc-bus.test'
        and simulation_users.raw_user_meta_data ->> 'sim_role' is null
      )
      or (
        simulation_users.email like 'sim-admin-campus-%@ccc-bus.test'
        and simulation_users.raw_user_meta_data ->> 'sim_role' = 'campus_admin'
      )
    )
    and not exists (
      select 1
      from admin_roles
      where admin_roles.user_id = payments.verified_by
        and admin_roles.role = 'campus_admin'
        and admin_roles.district_id = reservations.district_id
        and admin_roles.team_id = reservations.team_id
        and admin_roles.campus_id = reservations.campus_id
    );

  if v_unconfirmed_requested <> 0 or v_wrong_verifier_scope <> 0 then
    raise exception
      'Campus payment confirmation failed: unconfirmed_requested=% wrong_verifier_scope=%',
      v_unconfirmed_requested,
      v_wrong_verifier_scope;
  end if;
end $$;

select
  reservations.team,
  reservations.campus,
  count(*) as requested_people,
  count(payments.id) filter (where payments.status = 'completed') as confirmed_payments,
  sum(payments.amount) filter (where payments.status = 'completed') as confirmed_amount
from reservations
join auth.users on auth.users.id = reservations.user_id
left join payments on payments.reservation_id = reservations.id
where reservations.status = 'requested'
  and auth.users.email like 'sim-%@ccc-bus.test'
group by reservations.team, reservations.campus
order by reservations.team, reservations.campus;

commit;
