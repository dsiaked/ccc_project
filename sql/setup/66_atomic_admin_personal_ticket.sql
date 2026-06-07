-- =========================================================
-- Atomically keep personal tickets and confirmed allocations in sync.
-- Run after 65_canonical_reservation_status.sql.
-- =========================================================

create or replace function public.update_personal_ticket_as_admin(
  p_reservation_id uuid,
  p_next_status text,
  p_ticket jsonb default null
)
returns setof public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_reservation public.reservations%rowtype;
  v_allocation public.bus_allocations%rowtype;
  v_target_allocation_id uuid;
  v_target_bus jsonb;
  v_bus_match_count integer := 0;
  v_seat_number integer;
  v_preferences jsonb;
  v_passenger jsonb;
  v_passengers jsonb;
  v_ticket jsonb;
  v_action text;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can manage personal tickets.';
  end if;

  if p_next_status not in ('requested', 'confirmed', 'cancelled') then
    raise exception 'Invalid reservation status.';
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found.';
  end if;

  -- Serialize all personal-ticket changes with confirmed allocation changes.
  perform 1
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;

  if p_next_status = 'confirmed' then
    if jsonb_typeof(coalesce(p_ticket, 'null'::jsonb)) <> 'object'
      or nullif(btrim(p_ticket ->> 'busNumber'), '') is null
      or coalesce(p_ticket ->> 'seatNumber', '') !~ '^[1-9][0-9]*$' then
      raise exception 'A valid bus and seat number are required.';
    end if;

    v_seat_number := (p_ticket ->> 'seatNumber')::integer;

    select count(*)
    into v_bus_match_count
    from public.bus_allocations allocation
    cross join lateral jsonb_array_elements(
      coalesce(allocation.allocation_data -> 'buses', '[]'::jsonb)
    ) bus
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and bus ->> 'label' = btrim(p_ticket ->> 'busNumber');

    if v_bus_match_count = 0 then
      raise exception 'The selected bus does not exist in the confirmed allocation.';
    end if;
    if v_bus_match_count > 1 then
      raise exception 'The selected bus name is duplicated in confirmed allocations.';
    end if;

    select allocation.id, bus
    into v_target_allocation_id, v_target_bus
    from public.bus_allocations allocation
    cross join lateral jsonb_array_elements(
      coalesce(allocation.allocation_data -> 'buses', '[]'::jsonb)
    ) bus
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and bus ->> 'label' = btrim(p_ticket ->> 'busNumber')
    limit 1;

    if coalesce(v_target_bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
      or v_seat_number > (v_target_bus ->> 'capacity')::integer then
      raise exception 'The selected seat number exceeds the bus capacity.';
    end if;

    if exists (
      select 1
      from public.bus_allocations allocation
      cross join lateral jsonb_array_elements(
        coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)
      ) passenger
      where allocation.id = v_target_allocation_id
        and passenger ->> 'reservationId' <> p_reservation_id::text
        and passenger ->> 'busId' = v_target_bus ->> 'id'
        and passenger ->> 'seatNumber' = v_seat_number::text
    ) then
      raise exception 'The selected seat number is already assigned.';
    end if;

    select coalesce(
      jsonb_agg(preference -> 'station' ->> 'name' order by (preference ->> 'rank')::integer),
      '[]'::jsonb
    )
    into v_preferences
    from jsonb_array_elements(coalesce(v_reservation.station_preferences, '[]'::jsonb))
      preference;

    v_passenger := jsonb_build_object(
      'reservationId', p_reservation_id::text,
      'name', coalesce(v_reservation.name, '-'),
      'phone', coalesce(v_reservation.phone, '-'),
      'campus', coalesce(v_reservation.campus, '-'),
      'team', coalesce(v_reservation.team, '-'),
      'preferences', v_preferences,
      'busId', v_target_bus ->> 'id',
      'seatNumber', v_seat_number
    );

    v_ticket := jsonb_strip_nulls(jsonb_build_object(
      'busNumber', v_target_bus ->> 'label',
      'seatNumber', v_seat_number::text,
      'departureTime', v_target_bus ->> 'departureTime',
      'boardingPlace', v_target_bus ->> 'boardingPlace',
      'dropoffStation', v_target_bus ->> 'destination',
      'managerNote', nullif(btrim(p_ticket ->> 'managerNote'), ''),
      'confirmedAt', coalesce(
        nullif(v_reservation.confirmed_ticket ->> 'confirmedAt', ''),
        v_now::text
      )
    ));
    v_action := 'personal_ticket_confirmed';
  elsif p_next_status = 'cancelled' then
    v_action := 'personal_ticket_reservation_cancelled';
  else
    v_action := 'personal_ticket_cleared';
  end if;

  for v_allocation in
    select allocation.*
    from public.bus_allocations allocation
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and (
        allocation.id = v_target_allocation_id
        or exists (
          select 1
          from jsonb_array_elements(
            coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)
          ) passenger
          where passenger ->> 'reservationId' = p_reservation_id::text
        )
      )
  loop
    select coalesce(jsonb_agg(passenger.value order by passenger.ordinality), '[]'::jsonb)
    into v_passengers
    from jsonb_array_elements(
      coalesce(v_allocation.allocation_data -> 'passengers', '[]'::jsonb)
    ) with ordinality passenger(value, ordinality)
    where passenger.value ->> 'reservationId' <> p_reservation_id::text;

    if p_next_status = 'confirmed' and v_allocation.id = v_target_allocation_id then
      v_passengers := v_passengers || jsonb_build_array(v_passenger);
    end if;

    update public.bus_allocations
    set
      allocation_data = jsonb_set(
        jsonb_set(
          v_allocation.allocation_data,
          '{passengers}',
          v_passengers,
          true
        ),
        '{history}',
        coalesce(v_allocation.allocation_data -> 'history', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'id', 'history-' || gen_random_uuid()::text,
            'at', v_now::text,
            'actorId', v_actor_id::text,
            'action', v_action,
            'detail', coalesce(v_reservation.name, p_reservation_id::text)
              || ' personal ticket was synchronized.'
          )),
        true
      ),
      updated_at = v_now,
      revision = revision + 1
    where id = v_allocation.id;
  end loop;

  update public.reservations
  set
    status = p_next_status,
    confirmed_ticket = case when p_next_status = 'confirmed' then v_ticket else null end,
    data = jsonb_set(
      coalesce(data, '{}'::jsonb),
      '{updatedAt}',
      to_jsonb(v_now::text),
      true
    ),
    updated_at = v_now
  where id = p_reservation_id;

  return query
  select *
  from public.reservations
  where id = p_reservation_id;
end;
$$;

revoke all on function public.update_personal_ticket_as_admin(uuid, text, jsonb)
  from public, anon;
grant execute on function public.update_personal_ticket_as_admin(uuid, text, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
