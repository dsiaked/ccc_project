-- Operation closeout summary and completion record.

insert into public.app_settings (key, value)
values ('operation_closeout', '{"closed": false}'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_operation_closeout_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_allocation_id uuid;
  v_bus_total integer := 0;
  v_departed_bus_total integer := 0;
  v_active_reservation_total integer := 0;
  v_paid_reservation_total integer := 0;
  v_seoul_campus_total integer := 0;
  v_confirmed_transfer_total integer := 0;
  v_unresolved_exception_total integer := 0;
  v_unresolved_inquiry_total integer := 0;
  v_setting jsonb := '{"closed": false}'::jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view operation closeout.';
  end if;

  select allocation.id into v_allocation_id
  from public.bus_allocations allocation
  where allocation.allocation_data ->> 'status' = 'confirmed'
  order by allocation.updated_at desc nulls last limit 1;

  if v_allocation_id is not null then
    select count(*)::integer into v_bus_total
    from public.bus_allocations allocation
    cross join lateral jsonb_array_elements(coalesce(allocation.allocation_data -> 'buses', '[]'::jsonb)) bus
    where allocation.id = v_allocation_id;

    select count(*)::integer into v_departed_bus_total
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_allocation_id and departure.cancelled_at is null;

    with exception_keys as (
      select v_allocation_id::text || ':walk-in:' || walk_in.id::text as record_key
      from public.boarding_walk_in_passengers walk_in where walk_in.allocation_id = v_allocation_id
      union
      select v_allocation_id::text || ':event:' || event.id::text
      from public.boarding_status_events event
      join public.reservations reservation on reservation.id = event.reservation_id
      where (event.note = 'boarding_bus_moved' or event.to_status = 'no_show'
        or (event.from_status = 'no_show' and event.to_status = 'boarded'))
        and exists (
          select 1 from public.bus_allocations allocation
          cross join lateral jsonb_array_elements(coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)) passenger
          where allocation.id = v_allocation_id and passenger ->> 'reservationId' = reservation.id::text
        )
      union
      select v_allocation_id::text || ':current-no-show:' || reservation.id::text
      from public.reservations reservation
      where reservation.status = 'confirmed' and reservation.boarding_status = 'no_show'
        and not exists (
          select 1 from public.boarding_status_events event
          where event.reservation_id = reservation.id and event.to_status = 'no_show'
        )
      union
      select v_allocation_id::text || ':manual:' || record.id::text
      from public.manual_boarding_exception_records record where record.allocation_id = v_allocation_id
    )
    select count(*)::integer into v_unresolved_exception_total
    from exception_keys exception_record
    where not exists (
      select 1 from public.boarding_exception_archives archive
      where archive.record_key = exception_record.record_key
    );
  end if;

  select count(*)::integer, count(*) filter (where payment.status = 'completed')::integer
  into v_active_reservation_total, v_paid_reservation_total
  from public.reservations reservation
  left join public.payments payment on payment.reservation_id = reservation.id
  where reservation.status <> 'cancelled';

  with eligible_campuses as (
    select distinct reservation.district, reservation.team, reservation.campus
    from public.reservations reservation
    where reservation.status <> 'cancelled'
      and coalesce(reservation.affiliation_type, 'seoul') = 'seoul'
  )
  select count(*)::integer, count(*) filter (where transfer.status = 'confirmed')::integer
  into v_seoul_campus_total, v_confirmed_transfer_total
  from eligible_campuses campus
  left join public.campus_transfers transfer
    on transfer.district = campus.district and transfer.team = campus.team and transfer.campus = campus.campus;

  select count(*)::integer into v_unresolved_inquiry_total
  from public.campus_requests request
  where request.status <> 'resolved' and request.is_global_notice = false;

  select setting.value into v_setting from public.app_settings setting where setting.key = 'operation_closeout';

  return jsonb_build_object(
    'closed', coalesce((v_setting ->> 'closed')::boolean, false),
    'closedAt', v_setting ->> 'closed_at', 'closedByName', v_setting ->> 'closed_by_name',
    'note', coalesce(v_setting ->> 'note', ''), 'hasConfirmedAllocation', v_allocation_id is not null,
    'busTotal', v_bus_total, 'departedBusTotal', v_departed_bus_total,
    'unresolvedExceptionTotal', v_unresolved_exception_total,
    'activeReservationTotal', v_active_reservation_total, 'paidReservationTotal', v_paid_reservation_total,
    'seoulCampusTotal', v_seoul_campus_total, 'confirmedTransferTotal', v_confirmed_transfer_total,
    'unresolvedInquiryTotal', v_unresolved_inquiry_total,
    'ready', v_allocation_id is not null and v_bus_total = v_departed_bus_total
      and v_unresolved_exception_total = 0
      and v_active_reservation_total = v_paid_reservation_total
      and v_seoul_campus_total = v_confirmed_transfer_total
  );
end;
$$;

create or replace function public.set_operation_closeout(p_closed boolean, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_summary jsonb;
  v_actor_name text;
  v_previous jsonb;
  v_next jsonb;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update operation closeout.'; end if;
  v_summary := public.get_operation_closeout_summary();
  if p_closed and not coalesce((v_summary ->> 'ready')::boolean, false) then
    raise exception 'Required post-operation checks are not complete.';
  end if;

  select coalesce(profile.name, '전체 관리자') into v_actor_name from public.profiles profile where profile.id = auth.uid();
  select value into v_previous from public.app_settings where key = 'operation_closeout' for update;
  v_next := jsonb_build_object(
    'closed', p_closed, 'closed_at', case when p_closed then clock_timestamp() else null end,
    'closed_by', auth.uid(), 'closed_by_name', coalesce(v_actor_name, '전체 관리자'),
    'note', btrim(coalesce(p_note, ''))
  );
  insert into public.app_settings (key, value) values ('operation_closeout', v_next)
  on conflict (key) do update set value = excluded.value;
  insert into public.admin_action_audit_logs (actor_id, action, resource_type, before_data, after_data)
  values (auth.uid(), case when p_closed then 'close' else 'reopen' end, 'operation_closeout', v_previous, v_next);
  return public.get_operation_closeout_summary();
end;
$$;

revoke all on function public.get_operation_closeout_summary() from public, anon;
revoke all on function public.set_operation_closeout(boolean, text) from public, anon;
grant execute on function public.get_operation_closeout_summary() to authenticated;
grant execute on function public.set_operation_closeout(boolean, text) to authenticated;
notify pgrst, 'reload schema';
