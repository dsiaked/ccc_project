insert into public.app_settings (key, value)
values ('operation_closeout', '{"closed": false}'::jsonb) on conflict (key) do nothing;

create or replace function public.get_operation_closeout_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_allocation_id uuid; v_bus_total int := 0; v_departed_bus_total int := 0;
  v_active_reservation_total int := 0; v_paid_reservation_total int := 0;
  v_seoul_campus_total int := 0; v_confirmed_transfer_total int := 0;
  v_unresolved_exception_total int := 0; v_unresolved_inquiry_total int := 0;
  v_setting jsonb := '{"closed": false}'::jsonb;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can view operation closeout.'; end if;
  select id into v_allocation_id from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed' order by updated_at desc nulls last limit 1;

  if v_allocation_id is not null then
    select count(*)::int into v_bus_total from public.bus_allocations a
    cross join lateral jsonb_array_elements(coalesce(a.allocation_data -> 'buses', '[]'::jsonb)) bus
    where a.id = v_allocation_id;
    select count(*)::int into v_departed_bus_total from public.boarding_bus_departures
    where allocation_id = v_allocation_id and cancelled_at is null;

    with exception_keys as (
      select v_allocation_id::text || ':walk-in:' || id::text record_key
      from public.boarding_walk_in_passengers where allocation_id = v_allocation_id
      union select v_allocation_id::text || ':event:' || event.id::text
      from public.boarding_status_events event join public.reservations r on r.id = event.reservation_id
      where (event.note = 'boarding_bus_moved' or event.to_status = 'no_show'
        or (event.from_status = 'no_show' and event.to_status = 'boarded'))
        and exists (select 1 from public.bus_allocations a
          cross join lateral jsonb_array_elements(coalesce(a.allocation_data -> 'passengers', '[]'::jsonb)) p
          where a.id = v_allocation_id and p ->> 'reservationId' = r.id::text)
      union select v_allocation_id::text || ':current-no-show:' || r.id::text
      from public.reservations r where r.status = 'confirmed' and r.boarding_status = 'no_show'
        and not exists (select 1 from public.boarding_status_events e where e.reservation_id = r.id and e.to_status = 'no_show')
      union select v_allocation_id::text || ':manual:' || id::text
      from public.manual_boarding_exception_records where allocation_id = v_allocation_id
    )
    select count(*)::int into v_unresolved_exception_total from exception_keys e
    where not exists (select 1 from public.boarding_exception_archives a where a.record_key = e.record_key);
  end if;

  select count(*)::int, count(*) filter (where p.status = 'completed')::int
  into v_active_reservation_total, v_paid_reservation_total
  from public.reservations r left join public.payments p on p.reservation_id = r.id
  where r.status <> 'cancelled';

  with eligible as (
    select distinct district, team, campus from public.reservations
    where status <> 'cancelled' and coalesce(affiliation_type, 'seoul') = 'seoul'
  )
  select count(*)::int, count(*) filter (where t.status = 'confirmed')::int
  into v_seoul_campus_total, v_confirmed_transfer_total
  from eligible e left join public.campus_transfers t
    on t.district = e.district and t.team = e.team and t.campus = e.campus;

  select count(*)::int into v_unresolved_inquiry_total from public.campus_requests
  where status <> 'resolved' and is_global_notice = false;
  select value into v_setting from public.app_settings where key = 'operation_closeout';

  return jsonb_build_object(
    'closed', coalesce((v_setting ->> 'closed')::boolean, false), 'closedAt', v_setting ->> 'closed_at',
    'closedByName', v_setting ->> 'closed_by_name', 'note', coalesce(v_setting ->> 'note', ''),
    'hasConfirmedAllocation', v_allocation_id is not null, 'busTotal', v_bus_total,
    'departedBusTotal', v_departed_bus_total, 'unresolvedExceptionTotal', v_unresolved_exception_total,
    'activeReservationTotal', v_active_reservation_total, 'paidReservationTotal', v_paid_reservation_total,
    'seoulCampusTotal', v_seoul_campus_total, 'confirmedTransferTotal', v_confirmed_transfer_total,
    'unresolvedInquiryTotal', v_unresolved_inquiry_total,
    'ready', v_allocation_id is not null and v_bus_total = v_departed_bus_total
      and v_unresolved_exception_total = 0 and v_active_reservation_total = v_paid_reservation_total
      and v_seoul_campus_total = v_confirmed_transfer_total);
end; $$;

create or replace function public.set_operation_closeout(p_closed boolean, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_summary jsonb; v_actor_name text; v_previous jsonb; v_next jsonb;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update operation closeout.'; end if;
  v_summary := public.get_operation_closeout_summary();
  if p_closed and not coalesce((v_summary ->> 'ready')::boolean, false) then
    raise exception 'Required post-operation checks are not complete.';
  end if;
  select coalesce(name, '전체 관리자') into v_actor_name from public.profiles where id = auth.uid();
  select value into v_previous from public.app_settings where key = 'operation_closeout' for update;
  v_next := jsonb_build_object('closed', p_closed, 'closed_at', case when p_closed then clock_timestamp() else null end,
    'closed_by', auth.uid(), 'closed_by_name', coalesce(v_actor_name, '전체 관리자'), 'note', btrim(coalesce(p_note, '')));
  insert into public.app_settings (key, value) values ('operation_closeout', v_next)
  on conflict (key) do update set value = excluded.value;
  insert into public.admin_action_audit_logs (actor_id, action, resource_type, before_data, after_data)
  values (auth.uid(), case when p_closed then 'close' else 'reopen' end, 'operation_closeout', v_previous, v_next);
  return public.get_operation_closeout_summary();
end; $$;

revoke all on function public.get_operation_closeout_summary() from public, anon;
revoke all on function public.set_operation_closeout(boolean, text) from public, anon;
grant execute on function public.get_operation_closeout_summary() to authenticated;
grant execute on function public.set_operation_closeout(boolean, text) to authenticated;
notify pgrst, 'reload schema';
