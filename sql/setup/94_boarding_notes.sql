-- =========================================================
-- Boarding manager notes
-- =========================================================

alter table public.reservations
  add column if not exists boarding_note text;
alter table public.reservations
  add column if not exists boarding_note_updated_at timestamptz;
alter table public.reservations
  add column if not exists boarding_note_updated_by uuid references auth.users(id) on delete set null;

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

  update public.reservations
  set boarding_note = v_note,
      boarding_note_updated_at = clock_timestamp(),
      boarding_note_updated_by = auth.uid()
  where id = p_reservation_id
    and status = 'confirmed'
    and confirmed_ticket is not null;

  if not found then
    raise exception 'Confirmed passenger not found.';
  end if;
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
          'departedBy', departure.departed_by
        ) order by bus ->> 'label'
      ), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
      left join public.boarding_bus_departures departure
        on departure.allocation_id = v_allocation.id
       and departure.bus_id = bus ->> 'id'
       and departure.cancelled_at is null
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
      where reservation.status = 'confirmed' and reservation.confirmed_ticket is not null
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id,
        'reservationId', event.reservation_id,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'actorType', case
          when event.note = '탑승 확인' then 'passenger'
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
        and event.created_at >= coalesce(
          nullif(reservation.confirmed_ticket ->> 'confirmedAt', '')::timestamptz,
          '-infinity'::timestamptz
        )
    )
  );
end;
$$;

revoke all on function public.update_passenger_boarding_note(uuid, text) from public, anon;
grant execute on function public.update_passenger_boarding_note(uuid, text) to authenticated;

notify pgrst, 'reload schema';
