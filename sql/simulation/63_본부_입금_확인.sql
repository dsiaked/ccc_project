-- =========================================================
-- CCC Bus simulation: headquarters transfer confirmation
-- Rehearses the global admin confirming reported campus transfers.
-- Run after 62_캠퍼스_송금_보고.sql.
-- =========================================================

begin;

do $$
declare
  v_global_admin_id uuid;
  v_unreported_campuses integer;
  v_unconfirmed_campuses integer;
begin
  select auth.users.id
  into v_global_admin_id
  from auth.users
  join admin_roles on admin_roles.user_id = auth.users.id
  where auth.users.email = 'admin@gmail.com'
    and admin_roles.role = 'global_admin'
  limit 1;

  if v_global_admin_id is null then
    raise exception
      'Configured global admin admin@gmail.com is missing or does not have global_admin role.';
  end if;

  select count(*)
  into v_unreported_campuses
  from (
    select distinct reservations.district_id, reservations.team_id, reservations.campus_id
    from reservations
    join auth.users on auth.users.id = reservations.user_id
    where reservations.status = 'requested'
      and auth.users.email like 'sim-%@ccc-bus.test'
  ) active_simulation_campuses
  where not exists (
    select 1
    from campus_transfers
    where campus_transfers.district_id = active_simulation_campuses.district_id
      and campus_transfers.team_id = active_simulation_campuses.team_id
      and campus_transfers.campus_id = active_simulation_campuses.campus_id
      and campus_transfers.status in ('sent', 'confirmed')
  );

  if v_unreported_campuses <> 0 then
    raise exception
      'Cannot confirm campus transfers: % simulation campuses have not reported a transfer.',
      v_unreported_campuses;
  end if;

  update campus_transfers
  set
    status = 'confirmed',
    confirmed_by = v_global_admin_id,
    confirmed_at = now(),
    actual_confirmed_amount = total_amount,
    updated_at = now()
  where status = 'sent'
    and sent_by in (
      select id
      from auth.users
      where email like 'sim-admin-campus-%@ccc-bus.test'
    );

  select count(*)
  into v_unconfirmed_campuses
  from campus_transfers
  where sent_by in (
      select id
      from auth.users
      where email like 'sim-admin-campus-%@ccc-bus.test'
    )
    and (
      status <> 'confirmed'
      or confirmed_by is null
      or confirmed_by <> v_global_admin_id
      or confirmed_at is null
      or actual_confirmed_amount is null
      or actual_confirmed_amount <> total_amount
    );

  if v_unconfirmed_campuses <> 0 then
    raise exception
      'Headquarters transfer confirmation failed for % simulation campuses.',
      v_unconfirmed_campuses;
  end if;
end $$;

select
  district,
  team,
  campus,
  total_amount as reported_amount,
  actual_confirmed_amount,
  status,
  confirmed_at
from campus_transfers
where sent_by in (
  select id
  from auth.users
  where email like 'sim-admin-campus-%@ccc-bus.test'
)
order by team, campus;

commit;
