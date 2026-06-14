-- Destination-first boarding mode. Existing preassigned-bus boarding remains unchanged.

create table if not exists public.destination_queue_buses (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  destination text not null,
  sequence_number integer not null check (sequence_number > 0),
  label text not null,
  capacity integer not null default 44 check (capacity = 44),
  status text not null default 'open' check (status in ('open', 'full', 'departed')),
  check_in_code text check (check_in_code is null or check_in_code ~ '^[0-9]{4}$'),
  opened_at timestamptz not null default clock_timestamp(),
  opened_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  departed_at timestamptz,
  departed_by uuid references auth.users(id) on delete set null,
  unique (allocation_id, destination, sequence_number)
);

create unique index if not exists idx_destination_queue_one_open_bus
  on public.destination_queue_buses(allocation_id, destination)
  where status = 'open';

create index if not exists idx_destination_queue_buses_allocation
  on public.destination_queue_buses(allocation_id, destination, sequence_number);

alter table public.destination_queue_buses enable row level security;
revoke all on public.destination_queue_buses from public, anon, authenticated;

create index if not exists idx_reservations_destination_queue_status_destination
  on public.reservations((confirmed_ticket ->> 'dropoffStation'), boarding_status)
  where status = 'confirmed'
    and confirmed_ticket ->> 'allocationStrategy' = 'destination_queue';

create index if not exists idx_reservations_destination_queue_bus_boarded
  on public.reservations((confirmed_ticket ->> 'busId'))
  where boarding_status = 'boarded'
    and confirmed_ticket ->> 'allocationStrategy' = 'destination_queue';

create or replace function public.confirm_destination_queue_allocation(
  p_allocation_id uuid,
  p_expected_revision integer,
  p_allocation_data jsonb
)
returns public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bus_allocations%rowtype;
  v_now timestamptz := clock_timestamp();
  v_passenger_count integer;
  v_updated_count integer;
  v_departure_time text := btrim(coalesce(p_allocation_data #>> '{commonBoarding,departureTime}', ''));
  v_boarding_place text := btrim(coalesce(p_allocation_data #>> '{commonBoarding,boardingPlace}', ''));
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can confirm allocations.';
  end if;
  if p_allocation_data ->> 'allocationStrategy' <> 'destination_queue'
    or p_allocation_data ->> 'status' <> 'draft'
    or jsonb_typeof(p_allocation_data -> 'passengers') <> 'array'
    or coalesce(jsonb_array_length(p_allocation_data -> 'buses'), 0) <> 0 then
    raise exception 'Invalid destination queue allocation payload.';
  end if;
  if v_departure_time = '' or v_boarding_place = '' then
    raise exception 'Common boarding information is required.';
  end if;

  select * into v_row
  from public.bus_allocations
  where id = p_allocation_id
  for update;
  if not found or v_row.allocation_data ->> 'status' <> 'draft' then
    raise exception 'Only draft allocations can be confirmed.';
  end if;
  if v_row.revision <> p_expected_revision then
    raise exception 'Allocation workspace changed. Reload before saving.';
  end if;

  v_passenger_count := jsonb_array_length(p_allocation_data -> 'passengers');
  if v_passenger_count = 0 or exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    where nullif(btrim(passenger ->> 'reservationId'), '') is null
      or nullif(btrim(passenger ->> 'assignedDestination'), '') is null
      or nullif(btrim(passenger ->> 'busId'), '') is not null
      or nullif(btrim(passenger ->> 'seatNumber'), '') is not null
  ) then
    raise exception 'Every passenger needs one destination and no preassigned bus or seat.';
  end if;

  if (
    select count(distinct passenger ->> 'reservationId')
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
  ) <> v_passenger_count then
    raise exception 'Duplicate reservation IDs exist in the allocation.';
  end if;

  if (
    select count(*) from public.reservations where status is distinct from 'cancelled'
  ) <> v_passenger_count then
    raise exception 'Active reservations changed after the draft was created.';
  end if;

  with assignments as (
    select
      (passenger ->> 'reservationId')::uuid reservation_id,
      btrim(passenger ->> 'assignedDestination') destination
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
  ), tickets as (
    select reservation_id, jsonb_build_object(
      'allocationStrategy', 'destination_queue',
      'busNumber', '',
      'departureTime', v_departure_time,
      'boardingPlace', v_boarding_place,
      'dropoffStation', destination,
      'confirmedAt', v_now::text
    ) ticket
    from assignments
  )
  update public.reservations reservation
  set status = 'confirmed',
      confirmed_ticket = tickets.ticket,
      boarding_status = 'unchecked',
      boarding_confirmed_at = null,
      boarding_status_updated_at = null,
      boarding_status_updated_by = null,
      boarding_no_show_departure_id = null,
      data = coalesce(reservation.data, '{}'::jsonb) || jsonb_build_object(
        'status', 'confirmed',
        'confirmedTicket', tickets.ticket,
        'updatedAt', v_now::text
      ),
      updated_at = v_now
  from tickets
  where reservation.id = tickets.reservation_id
    and reservation.status is distinct from 'cancelled';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_passenger_count then
    raise exception 'Not every active reservation was confirmed.';
  end if;

  update public.bus_allocations
  set allocation_data = jsonb_set(
        jsonb_set(p_allocation_data, '{status}', to_jsonb('confirmed'::text), true),
        '{confirmedAt}', to_jsonb(v_now::text), true
      ),
      total_capacity = 44 * (
        select coalesce(sum(ceil(destination_count / 44.0)), 0)::integer
        from (
          select count(*) destination_count
          from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
          group by passenger ->> 'assignedDestination'
        ) counts
      ),
      updated_at = v_now,
      revision = revision + 1
  where id = p_allocation_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.start_destination_queue_bus(p_destination text)
returns public.destination_queue_buses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_destination text := btrim(coalesce(p_destination, ''));
  v_sequence integer;
  v_code text;
  v_bus public.destination_queue_buses%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can start boarding.';
  end if;
  select * into v_allocation from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
    and allocation_data ->> 'allocationStrategy' = 'destination_queue'
  order by updated_at desc limit 1;
  if not found then raise exception 'Confirmed destination queue allocation not found.'; end if;
  if v_destination = '' or not exists (
    select 1 from jsonb_array_elements(v_allocation.allocation_data -> 'passengers') passenger
    where passenger ->> 'assignedDestination' = v_destination
  ) then raise exception 'Destination not found.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_allocation.id::text || ':' || v_destination, 0));
  if exists (
    select 1 from public.destination_queue_buses
    where allocation_id = v_allocation.id and destination = v_destination and status = 'open'
  ) then raise exception 'An open bus already exists for this destination.'; end if;
  if exists (
    select 1 from public.destination_queue_buses
    where allocation_id = v_allocation.id and destination = v_destination and status = 'full'
  ) then raise exception 'Depart the full bus before starting the next bus.'; end if;

  select coalesce(max(sequence_number), 0) + 1 into v_sequence
  from public.destination_queue_buses
  where allocation_id = v_allocation.id and destination = v_destination;
  v_code := lpad(floor(random() * 10000)::integer::text, 4, '0');

  insert into public.destination_queue_buses (
    allocation_id, destination, sequence_number, label, check_in_code, opened_by
  ) values (
    v_allocation.id, v_destination, v_sequence,
    v_destination || '행 ' || v_sequence || '호차', v_code, auth.uid()
  ) returning * into v_bus;
  return v_bus;
end;
$$;

create or replace function public.submit_destination_queue_check_in_code(p_code text)
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
  v_ticket jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if btrim(coalesce(p_code, '')) !~ '^[0-9]{4}$' then raise exception 'Enter the 4-digit check-in code.'; end if;

  select * into v_reservation from public.reservations
  where user_id = auth.uid() and status = 'confirmed'
    and confirmed_ticket ->> 'allocationStrategy' = 'destination_queue'
  for update;
  if not found then raise exception 'A confirmed destination ticket is required before check-in.'; end if;
  if v_reservation.boarding_status = 'boarded' then
    return jsonb_build_object('confirmedAt', v_reservation.boarding_confirmed_at, 'ticket', v_reservation.confirmed_ticket);
  end if;

  select * into v_bus from public.destination_queue_buses
  where destination = v_reservation.confirmed_ticket ->> 'dropoffStation'
    and status = 'open' and check_in_code = btrim(p_code)
  order by opened_at desc limit 1 for update;
  if not found then raise exception 'The check-in code is incorrect or no bus is open.'; end if;

  select count(*) into v_count from public.reservations
  where confirmed_ticket ->> 'busId' = v_bus.id::text and boarding_status = 'boarded';
  if v_count >= 44 then raise exception 'The current bus is full.'; end if;

  v_ticket := v_reservation.confirmed_ticket || jsonb_build_object(
    'busId', v_bus.id::text, 'busNumber', v_bus.label
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
  insert into public.boarding_status_events(reservation_id, from_status, to_status, actor_id, note)
  values(v_reservation.id, v_reservation.boarding_status, 'boarded', auth.uid(), 'destination_queue_check_in_code');

  if v_count + 1 = 44 then
    update public.destination_queue_buses
    set status = 'full', check_in_code = null, closed_at = v_now
    where id = v_bus.id;
  end if;
  return jsonb_build_object('confirmedAt', v_now, 'ticket', v_ticket);
end;
$$;

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
  if p_status not in ('boarded', 'no_show') then
    raise exception 'Only boarded and no-show are supported in destination queue mode.';
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
    v_reservation.id,
    v_reservation.boarding_status,
    p_status,
    auth.uid(),
    case
      when p_status = 'boarded' then 'destination_queue_manager_check_in'
      else 'destination_queue_no_show: ' || v_reason
    end
  );

  return jsonb_build_object('confirmedAt', v_now, 'ticket', v_ticket);
end;
$$;

create or replace function public.depart_destination_queue_bus(p_bus_id uuid)
returns public.destination_queue_buses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bus public.destination_queue_buses%rowtype;
  v_boarded integer;
  v_unchecked integer;
begin
  if not public.is_boarding_manager() then raise exception 'Only boarding managers can depart buses.'; end if;
  select * into v_bus from public.destination_queue_buses where id = p_bus_id for update;
  if not found then raise exception 'Bus not found.'; end if;
  if v_bus.status = 'departed' then return v_bus; end if;
  select count(*) into v_boarded from public.reservations
  where confirmed_ticket ->> 'busId' = v_bus.id::text and boarding_status = 'boarded';
  select count(*) into v_unchecked from public.reservations
  where status = 'confirmed'
    and confirmed_ticket ->> 'allocationStrategy' = 'destination_queue'
    and confirmed_ticket ->> 'dropoffStation' = v_bus.destination
    and boarding_status = 'unchecked';
  if v_boarded < 44 and v_unchecked > 0 then
    raise exception 'The current bus must be full unless every remaining passenger is resolved.';
  end if;
  update public.destination_queue_buses
  set status = 'departed', check_in_code = null, closed_at = coalesce(closed_at, clock_timestamp()),
      departed_at = clock_timestamp(), departed_by = auth.uid()
  where id = p_bus_id returning * into v_bus;
  return v_bus;
end;
$$;

create or replace function public.get_destination_queue_boarding_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_boarding_manager() then raise exception 'Only boarding managers can view boarding management.'; end if;
  select * into v_allocation from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
    and allocation_data ->> 'allocationStrategy' = 'destination_queue'
  order by updated_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'allocationId', v_allocation.id,
    'allocationName', v_allocation.allocation_name,
    'commonBoarding', v_allocation.allocation_data -> 'commonBoarding',
    'destinations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'destination', assigned_destination,
        'total', total_count,
        'boarded', boarded_count,
        'unchecked', unchecked_count,
        'noShow', no_show_count,
        'expectedBuses', ceil(total_count / 44.0)
      ) order by assigned_destination), '[]'::jsonb)
      from (
        select reservation.confirmed_ticket ->> 'dropoffStation' assigned_destination,
          count(*) total_count,
          count(*) filter (where boarding_status = 'boarded') boarded_count,
          count(*) filter (where boarding_status = 'unchecked') unchecked_count,
          count(*) filter (where boarding_status = 'no_show') no_show_count
        from public.reservations reservation
        where reservation.status = 'confirmed'
          and reservation.confirmed_ticket ->> 'allocationStrategy' = 'destination_queue'
        group by reservation.confirmed_ticket ->> 'dropoffStation'
      ) counts
    ),
    'buses', (
      select coalesce(jsonb_agg(to_jsonb(bus) order by destination, sequence_number), '[]'::jsonb)
      from public.destination_queue_buses bus where allocation_id = v_allocation.id
    ),
    'passengers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'reservationId', id, 'name', name, 'phone', phone, 'campus', campus, 'team', team,
        'assignedDestination', confirmed_ticket ->> 'dropoffStation',
        'busId', confirmed_ticket ->> 'busId', 'busNumber', confirmed_ticket ->> 'busNumber',
        'boardingStatus', boarding_status, 'boardingConfirmedAt', boarding_confirmed_at
      ) order by confirmed_ticket ->> 'dropoffStation', campus, name), '[]'::jsonb)
      from public.reservations
      where status = 'confirmed' and confirmed_ticket ->> 'allocationStrategy' = 'destination_queue'
    )
  );
end;
$$;

revoke all on function public.confirm_destination_queue_allocation(uuid, integer, jsonb) from public, anon;
revoke all on function public.start_destination_queue_bus(text) from public, anon;
revoke all on function public.submit_destination_queue_check_in_code(text) from public, anon;
revoke all on function public.set_destination_queue_passenger_status(uuid, text, text) from public, anon;
revoke all on function public.depart_destination_queue_bus(uuid) from public, anon;
revoke all on function public.get_destination_queue_boarding_snapshot() from public, anon;
grant execute on function public.confirm_destination_queue_allocation(uuid, integer, jsonb) to authenticated;
grant execute on function public.start_destination_queue_bus(text) to authenticated;
grant execute on function public.submit_destination_queue_check_in_code(text) to authenticated;
grant execute on function public.set_destination_queue_passenger_status(uuid, text, text) to authenticated;
grant execute on function public.depart_destination_queue_bus(uuid) to authenticated;
grant execute on function public.get_destination_queue_boarding_snapshot() to authenticated;

notify pgrst, 'reload schema';
