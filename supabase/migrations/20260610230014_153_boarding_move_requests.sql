-- Let boarding managers request moves into buses they do not manage.

create table if not exists public.boarding_move_requests (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  source_bus_id text not null,
  target_bus_id text not null,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default clock_timestamp(),
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  response_reason text,
  check (source_bus_id <> target_bus_id)
);

create unique index if not exists idx_boarding_move_requests_pending_reservation
  on public.boarding_move_requests(reservation_id)
  where status = 'pending';
create index if not exists idx_boarding_move_requests_target_status
  on public.boarding_move_requests(allocation_id, target_bus_id, status, requested_at desc);
create index if not exists idx_boarding_move_requests_requester
  on public.boarding_move_requests(requested_by, requested_at desc);

alter table public.boarding_move_requests enable row level security;
revoke all on public.boarding_move_requests from public, anon, authenticated;

create or replace function public.execute_boarding_passenger_move(
  p_reservation_id uuid,
  p_expected_source_bus_id text,
  p_target_bus_id text,
  p_reason text,
  p_actor_id uuid
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
  if v_source_bus_id is distinct from p_expected_source_bus_id then
    raise exception 'The passenger bus changed after the request was created.';
  end if;
  if v_source_bus_id = p_target_bus_id then
    raise exception 'The passenger is already assigned to the target bus.';
  end if;

  select bus into v_target_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_target_bus_id;
  if v_target_bus is null then raise exception 'Target bus not found.'; end if;

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

  select passenger.value into v_passenger
  from jsonb_array_elements(v_allocation.allocation_data -> 'passengers') passenger(value)
  where passenger.value ->> 'reservationId' = p_reservation_id::text
  limit 1;
  if v_passenger is null then raise exception 'Allocation passenger not found.'; end if;

  v_passenger := jsonb_set(
    jsonb_set(v_passenger, '{busId}', to_jsonb(p_target_bus_id), true),
    '{seatNumber}',
    to_jsonb(v_seat_number),
    true
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
      boarding_status_updated_by = p_actor_id,
      boarding_no_show_departure_id = null,
      boarding_note = concat_ws(E'\n', nullif(boarding_note, ''), '[호차 이동] ' || btrim(p_reason)),
      boarding_note_updated_at = v_now,
      boarding_note_updated_by = p_actor_id,
      updated_at = v_now
  where id = p_reservation_id;

  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  ) values (
    p_reservation_id, v_reservation.boarding_status, 'unchecked', p_actor_id, 'boarding_bus_moved'
  );
end;
$$;

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
  v_allocation_id uuid;
  v_source_bus_id text;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can move boarding passengers.';
  end if;

  select allocation.id, public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket)
  into v_allocation_id, v_source_bus_id
  from public.bus_allocations allocation
  join public.reservations reservation on reservation.id = p_reservation_id
  where allocation.allocation_data ->> 'status' = 'confirmed'
    and reservation.status = 'confirmed'
    and reservation.confirmed_ticket is not null;
  if v_allocation_id is null then raise exception 'Confirmed passenger not found.'; end if;

  if not public.can_manage_boarding_bus(v_allocation_id, v_source_bus_id) then
    raise exception 'You are not assigned to the source bus.';
  end if;
  if not public.can_manage_boarding_bus(v_allocation_id, p_target_bus_id) then
    raise exception 'You are not assigned to the target bus.';
  end if;

  perform public.execute_boarding_passenger_move(
    p_reservation_id, v_source_bus_id, p_target_bus_id, p_reason, auth.uid()
  );
end;
$$;

create or replace function public.request_boarding_passenger_move(
  p_reservation_id uuid,
  p_target_bus_id text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation_id uuid;
  v_source_bus_id text;
  v_request_id uuid;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can request passenger moves.';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A move reason is required.';
  end if;

  select allocation.id, public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket)
  into v_allocation_id, v_source_bus_id
  from public.bus_allocations allocation
  join public.reservations reservation on reservation.id = p_reservation_id
  where allocation.allocation_data ->> 'status' = 'confirmed'
    and reservation.status = 'confirmed'
    and reservation.confirmed_ticket is not null;
  if v_allocation_id is null then raise exception 'Confirmed passenger not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation_id, v_source_bus_id) then
    raise exception 'You are not assigned to the source bus.';
  end if;
  if v_source_bus_id = p_target_bus_id then
    raise exception 'The passenger is already assigned to the target bus.';
  end if;
  if not exists (
    select 1 from public.bus_allocations allocation
    cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
    where allocation.id = v_allocation_id and bus ->> 'id' = p_target_bus_id
  ) then
    raise exception 'Target bus not found.';
  end if;
  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation_id
      and bus_id in (v_source_bus_id, p_target_bus_id)
      and cancelled_at is null
  ) then
    raise exception 'Departed buses cannot receive passenger moves.';
  end if;

  insert into public.boarding_move_requests (
    allocation_id, reservation_id, source_bus_id, target_bus_id, reason, requested_by
  ) values (
    v_allocation_id, p_reservation_id, v_source_bus_id, p_target_bus_id, btrim(p_reason), auth.uid()
  )
  returning id into v_request_id;
  return v_request_id;
exception
  when unique_violation then
    raise exception 'A pending move request already exists for this passenger.';
end;
$$;

create or replace function public.respond_to_boarding_move_request(
  p_request_id uuid,
  p_approve boolean,
  p_response_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.boarding_move_requests%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can respond to passenger move requests.';
  end if;

  select * into v_request
  from public.boarding_move_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Move request not found.'; end if;
  if v_request.status <> 'pending' then raise exception 'Move request is no longer pending.'; end if;
  if not public.can_manage_boarding_bus(v_request.allocation_id, v_request.target_bus_id) then
    raise exception 'You are not assigned to the target bus.';
  end if;
  if not p_approve and nullif(btrim(coalesce(p_response_reason, '')), '') is null then
    raise exception 'A rejection reason is required.';
  end if;

  if p_approve then
    perform public.execute_boarding_passenger_move(
      v_request.reservation_id,
      v_request.source_bus_id,
      v_request.target_bus_id,
      v_request.reason,
      auth.uid()
    );
  end if;

  update public.boarding_move_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      responded_by = auth.uid(),
      responded_at = clock_timestamp(),
      response_reason = nullif(btrim(coalesce(p_response_reason, '')), '')
  where id = p_request_id;
end;
$$;

create or replace function public.get_boarding_move_request_snapshot()
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
    raise exception 'Only boarding managers can view passenger move requests.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then return jsonb_build_object('targetBuses', '[]'::jsonb, 'requests', '[]'::jsonb); end if;

  return jsonb_build_object(
    'targetBuses', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', bus ->> 'id',
        'label', bus ->> 'label',
        'destination', bus ->> 'destination',
        'capacity', (bus ->> 'capacity')::integer,
        'remainingCapacity', greatest(
          0,
          (bus ->> 'capacity')::integer
          - (
              select count(*) from jsonb_array_elements(v_allocation.allocation_data -> 'passengers') passenger
              where passenger ->> 'busId' = bus ->> 'id'
            )
          - (
              select count(*) from public.boarding_walk_in_passengers walk_in
              where walk_in.allocation_id = v_allocation.id and walk_in.bus_id = bus ->> 'id'
            )
        ),
        'departedAt', departure.departed_at,
        'canManage', public.can_manage_boarding_bus(v_allocation.id, bus ->> 'id')
      ) order by bus ->> 'label'), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
      left join public.boarding_bus_departures departure
        on departure.allocation_id = v_allocation.id
       and departure.bus_id = bus ->> 'id'
       and departure.cancelled_at is null
    ),
    'requests', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', request.id,
        'reservationId', request.reservation_id,
        'passengerName', reservation.name,
        'passengerPhone', reservation.phone,
        'sourceBusId', request.source_bus_id,
        'sourceBusLabel', source_bus ->> 'label',
        'targetBusId', request.target_bus_id,
        'targetBusLabel', target_bus ->> 'label',
        'reason', request.reason,
        'status', request.status,
        'requestedByName', requester.name,
        'requestedAt', request.requested_at,
        'respondedByName', responder.name,
        'respondedAt', request.responded_at,
        'responseReason', request.response_reason,
        'canRespond', request.status = 'pending'
          and public.can_manage_boarding_bus(request.allocation_id, request.target_bus_id),
        'isMine', request.requested_by = auth.uid()
      ) order by (request.status = 'pending') desc, request.requested_at desc), '[]'::jsonb)
      from public.boarding_move_requests request
      join public.reservations reservation on reservation.id = request.reservation_id
      join lateral jsonb_array_elements(v_allocation.allocation_data -> 'buses') source_bus
        on source_bus ->> 'id' = request.source_bus_id
      join lateral jsonb_array_elements(v_allocation.allocation_data -> 'buses') target_bus
        on target_bus ->> 'id' = request.target_bus_id
      left join public.profiles requester on requester.id = request.requested_by
      left join public.profiles responder on responder.id = request.responded_by
      where request.allocation_id = v_allocation.id
        and (
          request.requested_by = auth.uid()
          or public.can_manage_boarding_bus(request.allocation_id, request.target_bus_id)
        )
      limit 50
    )
  );
end;
$$;

revoke all on function public.execute_boarding_passenger_move(uuid, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.request_boarding_passenger_move(uuid, text, text)
  from public, anon;
revoke all on function public.respond_to_boarding_move_request(uuid, boolean, text)
  from public, anon;
revoke all on function public.get_boarding_move_request_snapshot()
  from public, anon;
grant execute on function public.request_boarding_passenger_move(uuid, text, text)
  to authenticated;
grant execute on function public.respond_to_boarding_move_request(uuid, boolean, text)
  to authenticated;
grant execute on function public.get_boarding_move_request_snapshot()
  to authenticated;

notify pgrst, 'reload schema';
