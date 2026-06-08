-- Use immutable bus IDs for boarding authorization and passenger check-in.

create or replace function public.validate_allocation_bus_identifiers()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if jsonb_typeof(new.allocation_data -> 'buses') <> 'array' then
    return new;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.allocation_data -> 'buses') bus
    where nullif(btrim(bus ->> 'id'), '') is null
      or nullif(btrim(bus ->> 'label'), '') is null
  ) then
    raise exception 'Every bus needs a non-empty ID and label.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.allocation_data -> 'buses') bus
    group by btrim(bus ->> 'id')
    having count(*) > 1
  ) then
    raise exception 'Duplicate bus IDs exist in the allocation.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.allocation_data -> 'buses') bus
    group by btrim(bus ->> 'label')
    having count(*) > 1
  ) then
    raise exception 'Duplicate bus labels exist in the allocation.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_allocation_bus_identifiers
  on public.bus_allocations;
create trigger validate_allocation_bus_identifiers
before insert or update of allocation_data on public.bus_allocations
for each row execute function public.validate_allocation_bus_identifiers();

create or replace function public.get_confirmed_ticket_bus_id(
  p_reservation_id uuid,
  p_ticket jsonb
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(p_ticket ->> 'busId'), ''),
    (
      select nullif(btrim(passenger ->> 'busId'), '')
      from public.bus_allocations allocation
      cross join lateral jsonb_array_elements(allocation.allocation_data -> 'passengers')
        passenger
      where allocation.allocation_data ->> 'status' = 'confirmed'
        and passenger ->> 'reservationId' = p_reservation_id::text
      limit 1
    ),
    (
      select nullif(btrim(bus ->> 'id'), '')
      from public.bus_allocations allocation
      cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
      where allocation.allocation_data ->> 'status' = 'confirmed'
        and btrim(bus ->> 'label') = btrim(p_ticket ->> 'busNumber')
      limit 1
    )
  );
$$;

create or replace function public.set_reservation_confirmed_ticket_bus_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bus_id text;
begin
  if new.status <> 'confirmed' or new.confirmed_ticket is null then
    return new;
  end if;

  v_bus_id := public.get_confirmed_ticket_bus_id(new.id, new.confirmed_ticket);
  if v_bus_id is null then
    return new;
  end if;

  new.confirmed_ticket := jsonb_set(
    new.confirmed_ticket,
    '{busId}',
    to_jsonb(v_bus_id),
    true
  );
  new.data := jsonb_set(
    coalesce(new.data, '{}'::jsonb),
    '{confirmedTicket}',
    new.confirmed_ticket,
    true
  );
  return new;
end;
$$;

drop trigger if exists set_reservation_confirmed_ticket_bus_id
  on public.reservations;
create trigger set_reservation_confirmed_ticket_bus_id
before insert or update of status, confirmed_ticket, data on public.reservations
for each row execute function public.set_reservation_confirmed_ticket_bus_id();

create or replace function public.backfill_confirmed_allocation_ticket_bus_ids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.allocation_data ->> 'status' <> 'confirmed' then
    return new;
  end if;

  with assignments as (
    select
      (passenger ->> 'reservationId')::uuid as reservation_id,
      bus ->> 'id' as bus_id
    from jsonb_array_elements(new.allocation_data -> 'passengers') passenger
    join jsonb_array_elements(new.allocation_data -> 'buses') bus
      on bus ->> 'id' = passenger ->> 'busId'
  )
  update public.reservations reservation
  set
    confirmed_ticket = jsonb_set(
      reservation.confirmed_ticket,
      '{busId}',
      to_jsonb(assignments.bus_id),
      true
    ),
    data = jsonb_set(
      coalesce(reservation.data, '{}'::jsonb),
      '{confirmedTicket}',
      jsonb_set(
        reservation.confirmed_ticket,
        '{busId}',
        to_jsonb(assignments.bus_id),
        true
      ),
      true
    )
  from assignments
  where reservation.id = assignments.reservation_id
    and reservation.status = 'confirmed'
    and reservation.confirmed_ticket is not null
    and reservation.confirmed_ticket ->> 'busId' is distinct from assignments.bus_id;

  return new;
end;
$$;

drop trigger if exists backfill_confirmed_allocation_ticket_bus_ids
  on public.bus_allocations;
create trigger backfill_confirmed_allocation_ticket_bus_ids
after insert or update of allocation_data on public.bus_allocations
for each row execute function public.backfill_confirmed_allocation_ticket_bus_ids();

with assignments as (
  select
    (passenger ->> 'reservationId')::uuid as reservation_id,
    bus ->> 'id' as bus_id
  from public.bus_allocations allocation
  cross join lateral jsonb_array_elements(allocation.allocation_data -> 'passengers')
    passenger
  join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
    on bus ->> 'id' = passenger ->> 'busId'
  where allocation.allocation_data ->> 'status' = 'confirmed'
)
update public.reservations reservation
set
  confirmed_ticket = jsonb_set(
    reservation.confirmed_ticket,
    '{busId}',
    to_jsonb(assignments.bus_id),
    true
  ),
  data = jsonb_set(
    coalesce(reservation.data, '{}'::jsonb),
    '{confirmedTicket}',
    jsonb_set(
      reservation.confirmed_ticket,
      '{busId}',
      to_jsonb(assignments.bus_id),
      true
    ),
    true
  )
from assignments
where reservation.id = assignments.reservation_id
  and reservation.status = 'confirmed'
  and reservation.confirmed_ticket is not null
  and reservation.confirmed_ticket ->> 'busId' is distinct from assignments.bus_id;

create or replace function public.can_manage_boarding_bus_label(
  p_allocation_id uuid,
  p_bus_label text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_global_admin()
    or exists (
      select 1
      from public.bus_allocations allocation
      cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
      where allocation.id = p_allocation_id
        and btrim(bus ->> 'label') = btrim(p_bus_label)
        and public.can_manage_boarding_bus(p_allocation_id, bus ->> 'id')
    );
$$;

create or replace function public.can_manage_boarding_reservation(
  p_reservation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reservations reservation
    join public.bus_allocations allocation
      on allocation.allocation_data ->> 'status' = 'confirmed'
    where reservation.id = p_reservation_id
      and public.can_manage_boarding_bus(
        allocation.id,
        public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket)
      )
  );
$$;

drop policy if exists "Boarding managers can view reservations" on public.reservations;
create policy "Boarding managers can view reservations"
on public.reservations for select to authenticated
using (public.can_manage_boarding_reservation(reservations.id));

create or replace function public.set_passenger_boarding_status(
  p_reservation_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.reservations%rowtype;
  v_allocation_id uuid;
  v_bus_id text;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;

  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select * into v_current from public.reservations
  where id = p_reservation_id and status = 'confirmed' and confirmed_ticket is not null
  for update;
  if not found then raise exception 'Confirmed passenger not found.'; end if;

  v_bus_id := public.get_confirmed_ticket_bus_id(v_current.id, v_current.confirmed_ticket);
  if not public.can_manage_boarding_bus(v_allocation_id, v_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if v_current.boarding_status = p_status then return; end if;
  if p_status = 'no_show' and not exists (
    select 1
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_allocation_id
      and departure.cancelled_at is null
      and departure.bus_id = v_bus_id
  ) then
    raise exception 'No-show status is available after bus departure.';
  end if;

  update public.reservations
  set boarding_status = p_status,
      boarding_confirmed_at = case when p_status = 'boarded' then v_now else null end,
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null
  where id = p_reservation_id;

  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  ) values (
    p_reservation_id, v_current.boarding_status, p_status, auth.uid(), 'boarding_status_changed'
  );
end;
$$;

create or replace function public.update_passenger_boarding_note(
  p_reservation_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding notes.';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'Boarding notes must be 500 characters or fewer.';
  end if;
  if not public.can_manage_boarding_reservation(p_reservation_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  update public.reservations
  set boarding_note = v_note,
      boarding_note_updated_at = clock_timestamp(),
      boarding_note_updated_by = auth.uid()
  where id = p_reservation_id
    and status = 'confirmed'
    and confirmed_ticket is not null;

  if not found then raise exception 'Confirmed passenger not found.'; end if;
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
      and public.get_confirmed_ticket_bus_id(
        reservation.id,
        reservation.confirmed_ticket
      ) = p_bus_id
    returning reservation.id
  )
  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  )
  select id, 'unchecked', 'no_show', auth.uid(), 'bus_departed_auto_no_show'
  from changed;

  return v_departure_id;
end;
$$;

create or replace function public.submit_boarding_check_in_code(p_code text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := trim(coalesce(p_code, ''));
  v_reservation public.reservations%rowtype;
  v_allocation public.bus_allocations%rowtype;
  v_bus_id text;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if v_code !~ '^[0-9]{4}$' then raise exception 'Enter the 4-digit check-in code.'; end if;

  select * into v_reservation
  from public.reservations
  where user_id = v_user_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'A confirmed ticket is required before check-in.'; end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  v_bus_id := public.get_confirmed_ticket_bus_id(
    v_reservation.id,
    v_reservation.confirmed_ticket
  );
  if v_bus_id is null then raise exception 'Assigned bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = v_bus_id
      and cancelled_at is null
  ) then
    raise exception 'This bus has already departed.';
  end if;

  if not exists (
    select 1 from public.boarding_check_in_codes
    where allocation_id = v_allocation.id
      and bus_id = v_bus_id
      and check_in_code = v_code
      and expires_at > v_now
  ) then
    raise exception 'The check-in code is incorrect or expired.';
  end if;

  if v_reservation.boarding_status <> 'boarded' then
    update public.reservations
    set boarding_status = 'boarded',
        boarding_confirmed_at = v_now,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = v_user_id,
        boarding_no_show_departure_id = null
    where id = v_reservation.id;

    insert into public.boarding_status_events (
      reservation_id, from_status, to_status, actor_id, note
    ) values (
      v_reservation.id, v_reservation.boarding_status, 'boarded', v_user_id,
      'passenger_check_in_code'
    );
  end if;

  return coalesce(v_reservation.boarding_confirmed_at, v_now);
end;
$$;

revoke all on function public.validate_allocation_bus_identifiers()
  from public, anon, authenticated;
revoke all on function public.get_confirmed_ticket_bus_id(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.set_reservation_confirmed_ticket_bus_id()
  from public, anon, authenticated;
revoke all on function public.backfill_confirmed_allocation_ticket_bus_ids()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
