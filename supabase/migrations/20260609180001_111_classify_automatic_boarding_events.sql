-- Classify machine-readable bus departure events as automatic actions.

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
        'busId', public.get_confirmed_ticket_bus_id(
          reservation.id,
          reservation.confirmed_ticket
        ),
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
      left join public.profiles status_actor
        on status_actor.id = reservation.boarding_status_updated_by
      left join public.profiles note_actor
        on note_actor.id = reservation.boarding_note_updated_by
      where reservation.status = 'confirmed'
        and reservation.confirmed_ticket is not null
        and public.can_manage_boarding_reservation(reservation.id)
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id,
        'reservationId', event.reservation_id,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'actorType', case
          when event.note in ('탑승 확인', 'passenger_check_in_code')
            then 'passenger'
          when event.note = 'bus_departed_auto_no_show'
            or event.note like '호차 출발%'
            then 'automatic'
          else 'boarding_manager'
        end,
        'actorName', actor.name,
        'createdAt', event.created_at,
        'note', event.note
      ) order by event.created_at desc), '[]'::jsonb)
      from public.boarding_status_events event
      left join public.profiles actor on actor.id = event.actor_id
      join public.reservations reservation
        on reservation.id = event.reservation_id
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

revoke all on function public.get_boarding_management_snapshot()
  from public, anon;
grant execute on function public.get_boarding_management_snapshot()
  to authenticated;

notify pgrst, 'reload schema';
