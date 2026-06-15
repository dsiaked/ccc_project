-- Manage last-minute bus moves and walk-in passengers during boarding.

create table if not exists public.boarding_walk_in_passengers (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  bus_id text not null,
  seat_number integer not null check (seat_number > 0),
  name text not null,
  phone text not null,
  campus text not null default '',
  boarding_status text not null default 'unchecked'
    check (boarding_status in ('unchecked', 'boarded', 'no_show')),
  boarding_note text,
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  boarding_status_updated_by uuid references auth.users(id) on delete set null,
  boarding_status_updated_at timestamptz,
  boarding_no_show_departure_id uuid references public.boarding_bus_departures(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (allocation_id, bus_id, seat_number)
);

alter table public.boarding_walk_in_passengers enable row level security;
revoke all on public.boarding_walk_in_passengers from public, anon, authenticated;

create or replace function public.validate_boarding_walk_in_seat_conflicts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.allocation_data ->> 'status' <> 'confirmed' then
    return new;
  end if;

  if exists (
    select 1
    from public.boarding_walk_in_passengers walk_in
    left join lateral (
      select bus
      from jsonb_array_elements(new.allocation_data -> 'buses') bus
      where bus ->> 'id' = walk_in.bus_id
    ) matched_bus on true
    where walk_in.allocation_id = new.id
      and (
        matched_bus.bus is null
        or walk_in.seat_number > (matched_bus.bus ->> 'capacity')::integer
        or exists (
          select 1
          from jsonb_array_elements(new.allocation_data -> 'passengers') passenger
          where passenger ->> 'busId' = walk_in.bus_id
            and (passenger ->> 'seatNumber')::integer = walk_in.seat_number
        )
      )
  ) then
    raise exception 'Confirmed allocation conflicts with a walk-in passenger seat.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_boarding_walk_in_seat_conflicts
  on public.bus_allocations;
create trigger validate_boarding_walk_in_seat_conflicts
before insert or update of allocation_data on public.bus_allocations
for each row execute function public.validate_boarding_walk_in_seat_conflicts();

create or replace function public.move_boarding_passenger_as_global_admin(
  p_reservation_id uuid,
  p_target_bus_id text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_reservation public.reservations%rowtype;
  v_target_bus jsonb;
  v_source_bus_id text;
  v_seat_number integer;
  v_passenger jsonb;
  v_passengers jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can move boarding passengers.';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A move reason is required.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'Confirmed passenger not found.'; end if;

  v_source_bus_id := public.get_confirmed_ticket_bus_id(
    v_reservation.id,
    v_reservation.confirmed_ticket
  );
  if not public.can_manage_boarding_bus(v_allocation.id, v_source_bus_id) then
    raise exception 'You are not assigned to the source bus.';
  end if;

  select bus into v_target_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_target_bus_id;
  if v_target_bus is null then raise exception 'Target bus not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_target_bus_id) then
    raise exception 'You are not assigned to the target bus.';
  end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id in (v_source_bus_id, p_target_bus_id)
      and cancelled_at is null
  ) then
    raise exception 'Departed buses cannot receive passenger moves.';
  end if;
  select candidate.seat_number into v_seat_number
  from generate_series(1, (v_target_bus ->> 'capacity')::integer) candidate(seat_number)
  where not exists (
      select 1
      from jsonb_array_elements(v_allocation.allocation_data -> 'passengers') passenger
      where passenger ->> 'reservationId' <> p_reservation_id::text
        and passenger ->> 'busId' = p_target_bus_id
        and (passenger ->> 'seatNumber')::integer = candidate.seat_number
    )
    and not exists (
      select 1 from public.boarding_walk_in_passengers walk_in
      where walk_in.allocation_id = v_allocation.id
        and walk_in.bus_id = p_target_bus_id
        and walk_in.seat_number = candidate.seat_number
    )
  order by candidate.seat_number
  limit 1;
  if v_seat_number is null then
    raise exception 'The target bus has no remaining capacity.';
  end if;

  v_passenger := jsonb_build_object(
    'reservationId', p_reservation_id::text,
    'name', coalesce(v_reservation.name, '-'),
    'phone', coalesce(v_reservation.phone, '-'),
    'campus', coalesce(v_reservation.campus, '-'),
    'team', coalesce(v_reservation.team, '-'),
    'preferences', '[]'::jsonb,
    'busId', p_target_bus_id,
    'seatNumber', v_seat_number,
    'source', 'admin'
  );

  select coalesce(jsonb_agg(passenger.value order by passenger.ordinality), '[]'::jsonb)
  into v_passengers
  from jsonb_array_elements(v_allocation.allocation_data -> 'passengers')
    with ordinality passenger(value, ordinality)
  where passenger.value ->> 'reservationId' <> p_reservation_id::text;

  update public.bus_allocations
  set allocation_data = jsonb_set(
        allocation_data,
        '{passengers}',
        v_passengers || jsonb_build_array(v_passenger),
        true
      ),
      revision = revision + 1,
      updated_at = v_now
  where id = v_allocation.id;

  update public.reservations
  set confirmed_ticket = jsonb_set(
        jsonb_set(
          jsonb_set(confirmed_ticket, '{busId}', to_jsonb(p_target_bus_id), true),
          '{busNumber}', to_jsonb(v_target_bus ->> 'label'), true
        ),
        '{seatNumber}', to_jsonb(v_seat_number::text), true
      ),
      boarding_status = 'unchecked',
      boarding_confirmed_at = null,
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null,
      boarding_note = concat_ws(
        E'\n',
        nullif(boarding_note, ''),
        '[호차 이동] ' || btrim(p_reason)
      ),
      boarding_note_updated_at = v_now,
      boarding_note_updated_by = auth.uid(),
      updated_at = v_now
  where id = p_reservation_id;

  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  ) values (
    p_reservation_id,
    v_reservation.boarding_status,
    'unchecked',
    auth.uid(),
    'boarding_bus_moved'
  );
end;
$$;

create or replace function public.add_boarding_walk_in_as_global_admin(
  p_bus_id text,
  p_seat_number integer,
  p_name text,
  p_phone text,
  p_campus text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_id uuid;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can add walk-in passengers.';
  end if;
  if p_seat_number is null or p_seat_number < 1 then
    raise exception 'A valid seat number is required.';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null
    or nullif(btrim(coalesce(p_phone, '')), '') is null
    or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Name, phone, and reason are required.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Target bus not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = p_bus_id
      and cancelled_at is null
  ) then
    raise exception 'Departed buses cannot receive walk-in passengers.';
  end if;
  if p_seat_number > (v_bus ->> 'capacity')::integer then
    raise exception 'The selected seat number exceeds the bus capacity.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_allocation.allocation_data -> 'passengers') passenger
    where passenger ->> 'busId' = p_bus_id
      and (passenger ->> 'seatNumber')::integer = p_seat_number
  ) then
    raise exception 'The selected seat number is already assigned.';
  end if;

  insert into public.boarding_walk_in_passengers (
    allocation_id, bus_id, seat_number, name, phone, campus, reason, created_by
  ) values (
    v_allocation.id,
    p_bus_id,
    p_seat_number,
    btrim(p_name),
    btrim(p_phone),
    btrim(coalesce(p_campus, '')),
    btrim(p_reason),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'The selected seat number is already assigned.';
end;
$$;

create or replace function public.set_walk_in_boarding_status(
  p_walk_in_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_walk_in public.boarding_walk_in_passengers%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;

  select * into v_walk_in
  from public.boarding_walk_in_passengers
  where id = p_walk_in_id
  for update;
  if not found then raise exception 'Walk-in passenger not found.'; end if;
  if not public.can_manage_boarding_bus(v_walk_in.allocation_id, v_walk_in.bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if p_status = 'no_show' and not exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_walk_in.allocation_id
      and bus_id = v_walk_in.bus_id
      and cancelled_at is null
  ) then
    raise exception 'No-show status is available after bus departure.';
  end if;

  update public.boarding_walk_in_passengers
  set boarding_status = p_status,
      boarding_status_updated_by = auth.uid(),
      boarding_status_updated_at = clock_timestamp(),
      boarding_no_show_departure_id = null,
      updated_at = clock_timestamp()
  where id = p_walk_in_id;
end;
$$;

create or replace function public.mark_boarding_bus_departed(p_bus_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_departure_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can mark departure.';
  end if;

  select * into v_allocation from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Bus not found.'; end if;

  insert into public.boarding_bus_departures (
    allocation_id, bus_id, bus_label, departed_at, departed_by
  ) values (
    v_allocation.id, p_bus_id, v_bus ->> 'label', v_now, auth.uid()
  ) returning id into v_departure_id;

  with changed as (
    update public.reservations reservation
    set boarding_status = 'no_show',
        boarding_confirmed_at = null,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = v_departure_id
    where reservation.status = 'confirmed'
      and reservation.boarding_status = 'unchecked'
      and public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket) = p_bus_id
    returning reservation.id
  )
  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  )
  select id, 'unchecked', 'no_show', auth.uid(), 'bus_departed_auto_no_show'
  from changed;

  update public.boarding_walk_in_passengers
  set boarding_status = 'no_show',
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = v_departure_id,
      updated_at = v_now
  where allocation_id = v_allocation.id
    and bus_id = p_bus_id
    and boarding_status = 'unchecked';

  return v_departure_id;
end;
$$;

create or replace function public.cancel_boarding_bus_departure(p_bus_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_departure public.boarding_bus_departures%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can cancel departure.';
  end if;

  select * into v_departure
  from public.boarding_bus_departures
  where bus_id = p_bus_id and cancelled_at is null
  order by departed_at desc
  limit 1
  for update;
  if not found then raise exception 'Active bus departure not found.'; end if;
  if not public.can_manage_boarding_bus(v_departure.allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  with changed as (
    update public.reservations
    set boarding_status = 'unchecked',
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = null
    where boarding_no_show_departure_id = v_departure.id
      and boarding_status = 'no_show'
    returning id
  )
  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  )
  select id, 'no_show', 'unchecked', auth.uid(), 'bus_departure_cancelled_auto_restore'
  from changed;

  update public.boarding_walk_in_passengers
  set boarding_status = 'unchecked',
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null,
      updated_at = v_now
  where boarding_no_show_departure_id = v_departure.id
    and boarding_status = 'no_show';

  update public.boarding_bus_departures
  set cancelled_at = v_now, cancelled_by = auth.uid()
  where id = v_departure.id;
end;
$$;

create or replace function public.update_walk_in_boarding_note(
  p_walk_in_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_walk_in public.boarding_walk_in_passengers%rowtype;
begin
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'Boarding notes must be 500 characters or fewer.';
  end if;
  select * into v_walk_in
  from public.boarding_walk_in_passengers
  where id = p_walk_in_id;
  if not found then raise exception 'Walk-in passenger not found.'; end if;
  if not public.can_manage_boarding_bus(v_walk_in.allocation_id, v_walk_in.bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  update public.boarding_walk_in_passengers
  set boarding_note = nullif(btrim(coalesce(p_note, '')), ''),
      updated_at = clock_timestamp()
  where id = p_walk_in_id;
end;
$$;

create or replace function public.get_boarding_management_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can view boarding management.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then return null; end if;

  return jsonb_build_object(
    'allocationId', v_allocation.id,
    'allocationName', v_allocation.allocation_name,
    'buses', (
      select coalesce(jsonb_agg(
        bus || jsonb_build_object(
          'departedAt', departure.departed_at,
          'departedBy', departure.departed_by,
          'checkInCode', case when code.expires_at > clock_timestamp() then code.check_in_code else null end,
          'checkInCodeExpiresAt', code.expires_at
        ) order by bus ->> 'label'
      ), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
      left join public.boarding_bus_departures departure
        on departure.allocation_id = v_allocation.id
       and departure.bus_id = bus ->> 'id'
       and departure.cancelled_at is null
      left join public.boarding_check_in_codes code
        on code.allocation_id = v_allocation.id
       and code.bus_id = bus ->> 'id'
      where public.can_manage_boarding_bus(v_allocation.id, bus ->> 'id')
    ),
    'passengers', (
      select coalesce(jsonb_agg(passenger order by passenger ->> 'busNumber', passenger ->> 'seatNumber'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'reservationId', reservation.id,
          'passengerKind', 'reservation',
          'busId', public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket),
          'name', reservation.name,
          'phone', reservation.phone,
          'district', reservation.district,
          'team', reservation.team,
          'campus', reservation.campus,
          'busNumber', reservation.confirmed_ticket ->> 'busNumber',
          'seatNumber', reservation.confirmed_ticket ->> 'seatNumber',
          'stationPreferences', (
            select coalesce(
              jsonb_agg(preference -> 'station' ->> 'name' order by (preference ->> 'rank')::integer),
              '[]'::jsonb
            )
            from jsonb_array_elements(coalesce(reservation.station_preferences, '[]'::jsonb)) preference
            where nullif(preference -> 'station' ->> 'name', '') is not null
          ),
          'assignedDestination', reservation.confirmed_ticket ->> 'dropoffStation',
          'boardingStatus', reservation.boarding_status,
          'boardingNote', reservation.boarding_note,
          'boardingNoteUpdatedAt', reservation.boarding_note_updated_at,
          'boardingNoteUpdatedByName', note_actor.name,
          'updatedAt', reservation.boarding_status_updated_at,
          'updatedByName', status_actor.name
        ) passenger
        from public.reservations reservation
        left join public.profiles status_actor on status_actor.id = reservation.boarding_status_updated_by
        left join public.profiles note_actor on note_actor.id = reservation.boarding_note_updated_by
        where reservation.status = 'confirmed'
          and reservation.confirmed_ticket is not null
          and public.can_manage_boarding_reservation(reservation.id)
        union all
        select jsonb_build_object(
          'reservationId', walk_in.id,
          'passengerKind', 'walk_in',
          'busId', walk_in.bus_id,
          'name', walk_in.name,
          'phone', walk_in.phone,
          'district', '',
          'team', '',
          'campus', walk_in.campus,
          'busNumber', bus ->> 'label',
          'seatNumber', walk_in.seat_number::text,
          'stationPreferences', '[]'::jsonb,
          'assignedDestination', bus ->> 'destination',
          'boardingStatus', walk_in.boarding_status,
          'boardingNote', walk_in.boarding_note,
          'fieldExceptionReason', walk_in.reason,
          'updatedAt', walk_in.boarding_status_updated_at
        ) passenger
        from public.boarding_walk_in_passengers walk_in
        join lateral jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
          on bus ->> 'id' = walk_in.bus_id
        where walk_in.allocation_id = v_allocation.id
          and public.can_manage_boarding_bus(v_allocation.id, walk_in.bus_id)
      ) scoped
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id,
        'reservationId', event.reservation_id,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'actorType', case
          when event.note in ('탑승 확인', 'passenger_check_in_code') then 'passenger'
          when event.note = 'bus_departed_auto_no_show' or event.note like '호차 출발%' then 'automatic'
          else 'boarding_manager'
        end,
        'actorName', actor.name,
        'createdAt', event.created_at,
        'note', event.note
      ) order by event.created_at desc), '[]'::jsonb)
      from public.boarding_status_events event
      left join public.profiles actor on actor.id = event.actor_id
      join public.reservations reservation on reservation.id = event.reservation_id
      where reservation.status = 'confirmed'
        and public.can_manage_boarding_reservation(reservation.id)
        and event.created_at >= coalesce(
          nullif(reservation.confirmed_ticket ->> 'confirmedAt', '')::timestamptz,
          '-infinity'::timestamptz
        )
    )
  );
end;
$$;

drop function if exists public.move_boarding_passenger_as_global_admin(uuid, text, integer, text);
revoke all on function public.move_boarding_passenger_as_global_admin(uuid, text, text) from public, anon;
revoke all on function public.validate_boarding_walk_in_seat_conflicts() from public, anon, authenticated;
revoke all on function public.add_boarding_walk_in_as_global_admin(text, integer, text, text, text, text) from public, anon;
revoke all on function public.set_walk_in_boarding_status(uuid, text) from public, anon;
revoke all on function public.update_walk_in_boarding_note(uuid, text) from public, anon;
grant execute on function public.move_boarding_passenger_as_global_admin(uuid, text, text) to authenticated;
grant execute on function public.add_boarding_walk_in_as_global_admin(text, integer, text, text, text, text) to authenticated;
grant execute on function public.set_walk_in_boarding_status(uuid, text) to authenticated;
grant execute on function public.update_walk_in_boarding_note(uuid, text) to authenticated;

notify pgrst, 'reload schema';
