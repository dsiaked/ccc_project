-- Calculate the current transfer expected amount from all active reservations,
-- including reservations whose payments have not been confirmed yet.

create or replace function get_global_campus_transfer_stats()
returns table (
  id uuid,
  district text,
  team text,
  campus text,
  campus_admin_name text,
  campus_admin_phone text,
  current_total_people integer,
  current_paid_people integer,
  current_total_amount integer,
  reported_total_people integer,
  reported_paid_people integer,
  reported_total_amount integer,
  actual_confirmed_amount integer,
  additional_amount_due integer,
  has_additional_settlement boolean,
  status text,
  sent_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with active_campuses as (
    select distinct
      campus_options.district,
      campus_options.team,
      campus_options.campus
    from campus_options
  ),
  current_stats as (
    select
      reservations.district,
      reservations.team,
      reservations.campus,
      count(reservations.id)::integer as current_total_people,
      count(payments.id) filter (where payments.status = 'completed')::integer
        as current_paid_people,
      (
        count(reservations.id) * get_bus_ticket_price()
      )::integer as current_total_amount
    from reservations
    left join payments on payments.reservation_id = reservations.id
    where coalesce(reservations.status, 'requested') <> 'cancelled'
    group by reservations.district, reservations.team, reservations.campus
  ),
  campus_admins as (
    select distinct on (admin_roles.district, admin_roles.team, admin_roles.campus)
      admin_roles.district,
      admin_roles.team,
      admin_roles.campus,
      profiles.name as campus_admin_name,
      profiles.phone as campus_admin_phone
    from admin_roles
    left join profiles on profiles.id = admin_roles.user_id
    where admin_roles.role = 'campus_admin'
    order by
      admin_roles.district,
      admin_roles.team,
      admin_roles.campus,
      admin_roles.updated_at desc nulls last,
      admin_roles.created_at desc nulls last
  )
  select
    campus_transfers.id,
    active_campuses.district,
    active_campuses.team,
    active_campuses.campus,
    campus_admins.campus_admin_name,
    campus_admins.campus_admin_phone,
    coalesce(current_stats.current_total_people, 0) as current_total_people,
    coalesce(current_stats.current_paid_people, 0) as current_paid_people,
    coalesce(current_stats.current_total_amount, 0) as current_total_amount,
    coalesce(campus_transfers.total_people, 0) as reported_total_people,
    coalesce(campus_transfers.paid_people, 0) as reported_paid_people,
    coalesce(campus_transfers.total_amount, 0) as reported_total_amount,
    campus_transfers.actual_confirmed_amount,
    greatest(
      coalesce(current_stats.current_total_amount, 0)
        - coalesce(campus_transfers.total_amount, 0),
      0
    )::integer as additional_amount_due,
    (
      campus_transfers.id is not null
      and campus_transfers.status in ('sent', 'confirmed')
      and (
        coalesce(current_stats.current_total_people, 0)
          > coalesce(campus_transfers.total_people, 0)
        or coalesce(current_stats.current_paid_people, 0)
          > coalesce(campus_transfers.paid_people, 0)
        or coalesce(current_stats.current_total_amount, 0)
          > coalesce(campus_transfers.total_amount, 0)
      )
    ) as has_additional_settlement,
    coalesce(campus_transfers.status, 'pending') as status,
    campus_transfers.sent_at
  from active_campuses
  left join current_stats
    on current_stats.district = active_campuses.district
   and current_stats.team = active_campuses.team
   and current_stats.campus = active_campuses.campus
  left join campus_transfers
    on campus_transfers.district = active_campuses.district
   and campus_transfers.team = active_campuses.team
   and campus_transfers.campus = active_campuses.campus
  left join campus_admins
    on campus_admins.district = active_campuses.district
   and campus_admins.team = active_campuses.team
   and campus_admins.campus = active_campuses.campus
  where exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  order by active_campuses.district, active_campuses.team, active_campuses.campus;
$$;

revoke execute on function get_global_campus_transfer_stats() from public, anon;
grant execute on function get_global_campus_transfer_stats() to authenticated;

notify pgrst, 'reload schema';
