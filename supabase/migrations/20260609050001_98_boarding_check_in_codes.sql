-- =========================================================
-- Bus-specific passenger self check-in codes
-- =========================================================

create table if not exists public.boarding_check_in_codes (
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  bus_id text not null,
  bus_label text not null,
  check_in_code text not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (clock_timestamp() + interval '12 hours'),
  primary key (allocation_id, bus_id),
  check (check_in_code ~ '^[0-9]{4}$')
);

alter table public.boarding_check_in_codes enable row level security;
revoke all on table public.boarding_check_in_codes
  from public, anon, authenticated;

create or replace function public.rotate_boarding_check_in_code(p_bus_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_code text;
begin
  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  if not found then raise exception 'Confirmed allocation not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You cannot manage this bus.';
  end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = p_bus_id
      and cancelled_at is null
  ) then
    raise exception 'A departed bus cannot issue a check-in code.';
  end if;

  v_code := lpad(floor(random() * 10000)::integer::text, 4, '0');

  insert into public.boarding_check_in_codes (
    allocation_id, bus_id, bus_label, check_in_code, created_at, created_by, expires_at
  )
  values (
    v_allocation.id, p_bus_id, v_bus ->> 'label', v_code,
    clock_timestamp(), auth.uid(), clock_timestamp() + interval '12 hours'
  )
  on conflict (allocation_id, bus_id) do update
  set bus_label = excluded.bus_label,
      check_in_code = excluded.check_in_code,
      created_at = excluded.created_at,
      created_by = excluded.created_by,
      expires_at = excluded.expires_at;

  return v_code;
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
  v_bus jsonb;
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

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'label' = v_reservation.confirmed_ticket ->> 'busNumber';
  if v_bus is null then raise exception 'Assigned bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = v_bus ->> 'id'
      and cancelled_at is null
  ) then
    raise exception 'This bus has already departed.';
  end if;

  if not exists (
    select 1 from public.boarding_check_in_codes
    where allocation_id = v_allocation.id
      and bus_id = v_bus ->> 'id'
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
          'checkInCode', case
            when code.expires_at > clock_timestamp() then code.check_in_code
            else null
          end,
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
      select coalesce(jsonb_agg(jsonb_build_object(
        'reservationId', reservation.id,
        'name', reservation.name,
        'phone', reservation.phone,
        'district', reservation.district,
        'team', reservation.team,
        'campus', reservation.campus,
        'busNumber', reservation.confirmed_ticket ->> 'busNumber',
        'seatNumber', reservation.confirmed_ticket ->> 'seatNumber',
        'boardingStatus', reservation.boarding_status,
        'boardingNote', reservation.boarding_note,
        'boardingNoteUpdatedAt', reservation.boarding_note_updated_at,
        'boardingNoteUpdatedByName', note_actor.name,
        'updatedAt', reservation.boarding_status_updated_at,
        'updatedByName', status_actor.name
      ) order by reservation.campus, reservation.name), '[]'::jsonb)
      from public.reservations reservation
      left join public.profiles status_actor on status_actor.id = reservation.boarding_status_updated_by
      left join public.profiles note_actor on note_actor.id = reservation.boarding_note_updated_by
      where reservation.status = 'confirmed'
        and reservation.confirmed_ticket is not null
        and public.can_manage_boarding_bus_label(
          v_allocation.id,
          reservation.confirmed_ticket ->> 'busNumber'
        )
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id,
        'reservationId', event.reservation_id,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'actorType', case
          when event.note in ('탑승 확인', 'passenger_check_in_code') then 'passenger'
          when event.note like '호차 출발%' then 'automatic'
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
        and public.can_manage_boarding_bus_label(
          v_allocation.id,
          reservation.confirmed_ticket ->> 'busNumber'
        )
        and event.created_at >= coalesce(
          nullif(reservation.confirmed_ticket ->> 'confirmedAt', '')::timestamptz,
          '-infinity'::timestamptz
        )
    )
  );
end;
$$;

revoke all on function public.rotate_boarding_check_in_code(text) from public, anon;
revoke all on function public.submit_boarding_check_in_code(text) from public, anon;
revoke all on function public.confirm_my_boarding() from public, anon, authenticated;
grant execute on function public.rotate_boarding_check_in_code(text) to authenticated;
grant execute on function public.submit_boarding_check_in_code(text) to authenticated;

notify pgrst, 'reload schema';
