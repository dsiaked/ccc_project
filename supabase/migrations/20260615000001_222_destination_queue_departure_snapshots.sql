-- Preserve immutable destination-queue departure rosters and expose them to boarding managers.

create table if not exists public.destination_queue_departure_snapshots (
  bus_id uuid primary key references public.destination_queue_buses(id) on delete cascade,
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  destination text not null,
  sequence_number integer not null,
  label text not null,
  boarded_count integer not null check (boarded_count >= 0),
  passenger_snapshot jsonb not null check (jsonb_typeof(passenger_snapshot) = 'array'),
  departed_at timestamptz not null,
  departed_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_destination_queue_departure_snapshots_allocation
  on public.destination_queue_departure_snapshots(allocation_id, destination, sequence_number);

alter table public.destination_queue_departure_snapshots enable row level security;
revoke all on public.destination_queue_departure_snapshots from public, anon, authenticated;

insert into public.destination_queue_departure_snapshots (
  bus_id, allocation_id, destination, sequence_number, label, boarded_count,
  passenger_snapshot, departed_at, departed_by, captured_at
)
select
  bus.id,
  bus.allocation_id,
  bus.destination,
  bus.sequence_number,
  bus.label,
  count(reservation.id)::integer,
  coalesce(jsonb_agg(jsonb_build_object(
    'reservationId', reservation.id,
    'name', reservation.name,
    'phone', reservation.phone,
    'district', reservation.district,
    'team', reservation.team,
    'campus', reservation.campus,
    'boardingConfirmedAt', reservation.boarding_confirmed_at
  ) order by reservation.campus, reservation.name) filter (where reservation.id is not null), '[]'::jsonb),
  bus.departed_at,
  bus.departed_by,
  bus.departed_at
from public.destination_queue_buses bus
left join public.reservations reservation
  on reservation.confirmed_ticket ->> 'busId' = bus.id::text
  and reservation.boarding_status = 'boarded'
  and reservation.confirmed_ticket ->> 'allocationStrategy' = 'destination_queue'
where bus.status = 'departed'
  and bus.departed_at is not null
group by bus.id
on conflict (bus_id) do nothing;

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
  v_now timestamptz := clock_timestamp();
  v_passengers jsonb;
begin
  if not public.is_boarding_manager() then raise exception 'Only boarding managers can depart buses.'; end if;
  select * into v_bus from public.destination_queue_buses where id = p_bus_id for update;
  if not found then raise exception 'Bus not found.'; end if;
  if v_bus.status = 'departed' then return v_bus; end if;

  select
    count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'reservationId', reservation.id,
      'name', reservation.name,
      'phone', reservation.phone,
      'district', reservation.district,
      'team', reservation.team,
      'campus', reservation.campus,
      'boardingConfirmedAt', reservation.boarding_confirmed_at
    ) order by reservation.campus, reservation.name), '[]'::jsonb)
  into v_boarded, v_passengers
  from public.reservations reservation
  where reservation.confirmed_ticket ->> 'busId' = v_bus.id::text
    and reservation.boarding_status = 'boarded'
    and reservation.confirmed_ticket ->> 'allocationStrategy' = 'destination_queue';

  select count(*) into v_unchecked from public.reservations
  where status = 'confirmed'
    and confirmed_ticket ->> 'allocationStrategy' = 'destination_queue'
    and confirmed_ticket ->> 'dropoffStation' = v_bus.destination
    and boarding_status = 'unchecked';
  if v_boarded < 44 and v_unchecked > 0 then
    raise exception 'The current bus must be full unless every remaining passenger is resolved.';
  end if;

  insert into public.destination_queue_departure_snapshots (
    bus_id, allocation_id, destination, sequence_number, label, boarded_count,
    passenger_snapshot, departed_at, departed_by
  ) values (
    v_bus.id, v_bus.allocation_id, v_bus.destination, v_bus.sequence_number, v_bus.label,
    v_boarded, v_passengers, v_now, auth.uid()
  ) on conflict (bus_id) do nothing;

  update public.destination_queue_buses
  set status = 'departed', check_in_code = null, closed_at = coalesce(closed_at, v_now),
      departed_at = v_now, departed_by = auth.uid()
  where id = p_bus_id returning * into v_bus;
  return v_bus;
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
    case when p_status = 'boarded' then 'destination_queue_manager_check_in'
      else 'destination_queue_no_show: ' || v_reason end
  );
  return jsonb_build_object('confirmedAt', v_now, 'ticket', v_ticket);
end;
$$;

create or replace function public.get_destination_queue_departure_snapshots()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation_id uuid;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can view destination queue departures.';
  end if;
  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
    and allocation_data ->> 'allocationStrategy' = 'destination_queue'
  order by updated_at desc limit 1;
  if v_allocation_id is null then return '[]'::jsonb; end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'busId', snapshot.bus_id,
      'destination', snapshot.destination,
      'sequenceNumber', snapshot.sequence_number,
      'label', snapshot.label,
      'boardedCount', snapshot.boarded_count,
      'passengers', snapshot.passenger_snapshot,
      'departedAt', snapshot.departed_at,
      'departedBy', snapshot.departed_by,
      'departedByName', coalesce(profile.name, '담당자')
    ) order by snapshot.destination, snapshot.sequence_number desc), '[]'::jsonb)
    from public.destination_queue_departure_snapshots snapshot
    left join public.profiles profile on profile.id = snapshot.departed_by
    where snapshot.allocation_id = v_allocation_id
  );
end;
$$;

revoke all on function public.get_destination_queue_departure_snapshots() from public, anon;
grant execute on function public.get_destination_queue_departure_snapshots() to authenticated;
grant execute on function public.get_destination_queue_departure_snapshots() to service_role;

notify pgrst, 'reload schema';
