-- Boarding managers can return destination-queue passengers to the waiting queue.
create or replace function public.set_destination_queue_passenger_status(
  p_reservation_id uuid,
  p_status text,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations%rowtype;
  v_bus public.destination_queue_buses%rowtype;
  v_count integer;
  v_now timestamptz := clock_timestamp();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ticket jsonb;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update destination queue boarding.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Only waiting, boarded, and no-show are supported in destination queue mode.';
  end if;
  if p_status = 'no_show' and v_reason is null then
    raise exception 'A no-show reason is required.';
  end if;
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'Boarding transition reasons must be 500 characters or fewer.';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
    and status = 'confirmed'
    and confirmed_ticket ->> 'allocationStrategy' = 'destination_queue'
  for update;
  if not found then raise exception 'Confirmed destination queue passenger not found.'; end if;
  if exists (
    select 1 from public.destination_queue_buses bus
    where bus.id::text = v_reservation.confirmed_ticket ->> 'busId'
      and bus.status = 'departed'
  ) then raise exception 'Departed bus passenger records are immutable.'; end if;
  if v_reservation.boarding_status = p_status then
    return jsonb_build_object('confirmedAt', v_reservation.boarding_confirmed_at, 'ticket', v_reservation.confirmed_ticket);
  end if;

  if p_status = 'boarded' then
    select * into v_bus
    from public.destination_queue_buses
    where destination = v_reservation.confirmed_ticket ->> 'dropoffStation'
      and status = 'open'
    order by opened_at desc
    limit 1
    for update;
    if not found then raise exception 'No open bus exists for this destination.'; end if;

    select count(*) into v_count
    from public.reservations
    where confirmed_ticket ->> 'busId' = v_bus.id::text
      and boarding_status = 'boarded';
    if v_count >= 44 then raise exception 'The current bus is full.'; end if;

    v_ticket := v_reservation.confirmed_ticket || jsonb_build_object(
      'busId', v_bus.id::text,
      'busNumber', v_bus.label
    );
    update public.reservations
    set confirmed_ticket = v_ticket,
        data = jsonb_set(coalesce(data, '{}'::jsonb), '{confirmedTicket}', v_ticket, true),
        boarding_status = 'boarded',
        boarding_confirmed_at = v_now,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = null
    where id = v_reservation.id;
    if v_count + 1 = 44 then
      update public.destination_queue_buses
      set status = 'full', check_in_code = null, closed_at = v_now
      where id = v_bus.id;
    end if;
  elsif p_status = 'unchecked' then
    select * into v_bus
    from public.destination_queue_buses
    where id::text = v_reservation.confirmed_ticket ->> 'busId'
    for update;

    v_ticket := v_reservation.confirmed_ticket - 'busId' - 'busNumber';
    update public.reservations
    set confirmed_ticket = v_ticket,
        data = jsonb_set(coalesce(data, '{}'::jsonb), '{confirmedTicket}', v_ticket, true),
        boarding_status = 'unchecked',
        boarding_confirmed_at = null,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = null
    where id = v_reservation.id;

    if found and v_bus.status = 'full' then
      update public.destination_queue_buses
      set status = 'open',
          check_in_code = lpad(floor(random() * 10000)::integer::text, 4, '0'),
          closed_at = null
      where id = v_bus.id;
    end if;
  else
    update public.reservations
    set boarding_status = 'no_show',
        boarding_confirmed_at = null,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = null
    where id = v_reservation.id;
    v_ticket := v_reservation.confirmed_ticket;
  end if;

  insert into public.boarding_status_events(reservation_id, from_status, to_status, actor_id, note)
  values(
    v_reservation.id, v_reservation.boarding_status, p_status, auth.uid(),
    case p_status
      when 'boarded' then 'destination_queue_manager_check_in'
      when 'unchecked' then 'destination_queue_manager_return_to_waiting'
      else 'destination_queue_no_show: ' || v_reason
    end
  );
  return jsonb_build_object(
    'confirmedAt', case when p_status = 'boarded' then v_now else null end,
    'ticket', v_ticket
  );
end;
$$;
