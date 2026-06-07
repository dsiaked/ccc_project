-- =========================================================
-- Atomic remaining-seat sales by global admins
-- Run after 55_atomic_allocation_confirmation.sql.
-- =========================================================

create or replace function public.sell_remaining_seat_as_admin(
  p_allocation_id uuid,
  p_reservation_id uuid,
  p_bus_label text,
  p_departure_time text,
  p_boarding_place text,
  p_seat_number text,
  p_manager_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_allocation_name text;
  v_allocation_data jsonb;
  v_bus jsonb;
  v_bus_id text;
  v_capacity integer;
  v_assigned_count integer;
  v_seat_number integer;
  v_destination text;
  v_sale_marker text;
  v_ticket jsonb;
  v_reservation record;
  v_preferences jsonb;
  v_passenger jsonb;
  v_history_item jsonb;
  v_updated_count integer;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can sell remaining seats.';
  end if;

  if nullif(btrim(p_bus_label), '') is null
    or nullif(btrim(p_departure_time), '') is null
    or nullif(btrim(p_boarding_place), '') is null then
    raise exception 'Bus, departure time, and boarding place are required.';
  end if;

  lock table public.bus_allocations in share row exclusive mode;
  lock table public.reservations in share row exclusive mode;

  select allocation_name, allocation_data
  into v_allocation_name, v_allocation_data
  from public.bus_allocations
  where id = p_allocation_id
    and allocation_data ->> 'status' = 'confirmed'
  for update;

  if v_allocation_data is null then
    raise exception 'The selected allocation is no longer available.';
  end if;

  select bus
  into v_bus
  from jsonb_array_elements(
    coalesce(v_allocation_data -> 'buses', '[]'::jsonb)
  ) bus
  where bus ->> 'label' = p_bus_label
  limit 1;

  if v_bus is null
    or coalesce(v_bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
    or nullif(btrim(v_bus ->> 'id'), '') is null
    or nullif(btrim(v_bus ->> 'destination'), '') is null then
    raise exception 'The selected bus is no longer available.';
  end if;

  v_bus_id := v_bus ->> 'id';
  v_capacity := (v_bus ->> 'capacity')::integer;
  v_destination := v_bus ->> 'destination';

  v_sale_marker := '잔여석 판매 · ' || v_allocation_name;

  select count(*)::integer
  into v_assigned_count
  from jsonb_array_elements(
    coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)
  ) passenger
  where passenger ->> 'busId' = v_bus_id;

  if v_assigned_count >= v_capacity then
    raise exception 'No remaining seats are available on this bus.';
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
    and status is distinct from 'cancelled'
    and confirmed_ticket is null
    and exists (
      select 1
      from jsonb_array_elements(
        coalesce(station_preferences, '[]'::jsonb)
      ) preference
      where preference -> 'station' ->> 'name' = v_destination
    )
  for update;

  if v_reservation.id is null then
    raise exception 'The selected reservation is no longer available.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)
    ) passenger
    where passenger ->> 'reservationId' = p_reservation_id::text
  ) then
    raise exception 'The selected reservation is no longer available.';
  end if;

  if nullif(btrim(coalesce(p_seat_number, '')), '') is not null then
    if btrim(p_seat_number) !~ '^[1-9][0-9]*$'
      or btrim(p_seat_number)::integer > v_capacity then
      raise exception 'The selected seat number is invalid.';
    end if;

    v_seat_number := btrim(p_seat_number)::integer;

    if exists (
      select 1
      from jsonb_array_elements(
        coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)
      ) passenger
      where passenger ->> 'busId' = v_bus_id
        and passenger ->> 'seatNumber' = v_seat_number::text
    ) then
      raise exception 'The selected seat number is already assigned.';
    end if;
  else
    select candidate
    into v_seat_number
    from generate_series(1, v_capacity) candidate
    where not exists (
      select 1
      from jsonb_array_elements(
        coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)
      ) passenger
      where passenger ->> 'busId' = v_bus_id
        and passenger ->> 'seatNumber' = candidate::text
    )
    order by candidate
    limit 1;
  end if;

  if v_seat_number is null then
    raise exception 'No remaining seats are available on this bus.';
  end if;

  v_ticket := jsonb_build_object(
    'busNumber', p_bus_label,
    'seatNumber', v_seat_number::text,
    'departureTime', btrim(p_departure_time),
    'boardingPlace', btrim(p_boarding_place),
    'dropoffStation', v_destination,
    'managerNote', v_sale_marker
      || case
        when nullif(btrim(coalesce(p_manager_note, '')), '') is null then ''
        else ' / ' || btrim(p_manager_note)
      end,
    'confirmedAt', v_now::text
  );

  select coalesce(
    jsonb_agg(
      preference -> 'station' ->> 'name'
      order by case
        when coalesce(preference ->> 'rank', '') ~ '^[1-9][0-9]*$'
          then (preference ->> 'rank')::integer
        else 99
      end
    ),
    jsonb_build_array(v_destination, v_destination)
  )
  into v_preferences
  from jsonb_array_elements(
    coalesce(v_reservation.station_preferences, '[]'::jsonb)
  ) preference
  where nullif(preference -> 'station' ->> 'name', '') is not null;

  v_passenger := jsonb_build_object(
    'reservationId', p_reservation_id::text,
    'name', coalesce(v_reservation.data ->> 'name', v_reservation.name, '-'),
    'campus', coalesce(v_reservation.data ->> 'campus', v_reservation.campus, '-'),
    'team', coalesce(v_reservation.data ->> 'team', v_reservation.team, '-'),
    'preferences', v_preferences,
    'busId', v_bus_id,
    'seatNumber', v_seat_number
  );
  v_history_item := jsonb_build_object(
    'id', 'admin-remaining-seat-' || gen_random_uuid()::text,
    'at', v_now::text,
    'actorId', auth.uid()::text,
    'action', 'admin_remaining_seat_sold',
    'detail', coalesce(v_reservation.data ->> 'name', v_reservation.name, '-')
      || ': ' || p_bus_label || ' ' || v_seat_number || '번 잔여 좌석 판매'
  );

  update public.bus_allocations
  set
    allocation_data = jsonb_set(
      jsonb_set(
        v_allocation_data,
        '{passengers}',
        coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)
          || jsonb_build_array(v_passenger),
        true
      ),
      '{history}',
      coalesce(v_allocation_data -> 'history', '[]'::jsonb)
        || jsonb_build_array(v_history_item),
      true
    ),
    updated_at = v_now,
    revision = revision + 1
  where id = p_allocation_id;

  update public.reservations
  set
    status = 'confirmed',
    confirmed_ticket = v_ticket,
    data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
      'status', 'confirmed',
      'confirmedTicket', v_ticket,
      'updatedAt', v_now::text
    ),
    updated_at = v_now
  where id = p_reservation_id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'The selected reservation could not be confirmed.';
  end if;

  return v_ticket;
end;
$$;

revoke all on function public.sell_remaining_seat_as_admin(
  uuid, uuid, text, text, text, text, text
) from public, anon;
grant execute on function public.sell_remaining_seat_as_admin(
  uuid, uuid, text, text, text, text, text
) to authenticated;

notify pgrst, 'reload schema';
