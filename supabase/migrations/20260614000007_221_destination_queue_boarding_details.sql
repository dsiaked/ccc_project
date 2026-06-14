-- Redefine get_destination_queue_boarding_snapshot to return full passenger details and processing history events.

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
        'reservationId', reservation.id,
        'passengerKind', 'reservation',
        'name', reservation.name,
        'phone', reservation.phone,
        'district', reservation.district,
        'team', reservation.team,
        'campus', reservation.campus,
        'assignedDestination', reservation.confirmed_ticket ->> 'dropoffStation',
        'busId', reservation.confirmed_ticket ->> 'busId',
        'busNumber', reservation.confirmed_ticket ->> 'busNumber',
        'boardingStatus', reservation.boarding_status,
        'boardingConfirmedAt', reservation.boarding_confirmed_at,
        'boardingNote', reservation.boarding_note,
        'boardingNoteUpdatedAt', reservation.boarding_note_updated_at,
        'boardingNoteUpdatedByName', note_actor.name,
        'updatedAt', reservation.boarding_status_updated_at,
        'updatedByName', status_actor.name,
        'stationPreferences', (
          select coalesce(jsonb_agg(preference_name order by preference_position), '[]'::jsonb)
          from (
            select
              coalesce(
                nullif(preference.value #>> '{station,name}', ''),
                nullif(preference.value ->> 'name', ''),
                nullif(preference.value #>> '{}', '')
              ) as preference_name,
              preference.position as preference_position
            from jsonb_array_elements(
              case
                when jsonb_typeof(reservation.station_preferences) = 'array' then
                  case
                    when jsonb_array_length(reservation.station_preferences) > 0
                      then reservation.station_preferences
                    when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
                      then reservation.data -> 'stationPreferences'
                    else '[]'::jsonb
                  end
                when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
                  then reservation.data -> 'stationPreferences'
                else '[]'::jsonb
              end
            ) with ordinality as preference(value, position)
          ) normalized_preferences
          where nullif(preference_name, '') is not null
        )
      ) order by reservation.confirmed_ticket ->> 'dropoffStation', reservation.campus, reservation.name), '[]'::jsonb)
      from public.reservations reservation
      left join public.profiles status_actor on status_actor.id = reservation.boarding_status_updated_by
      left join public.profiles note_actor on note_actor.id = reservation.boarding_note_updated_by
      where reservation.status = 'confirmed' and reservation.confirmed_ticket ->> 'allocationStrategy' = 'destination_queue'
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id,
        'reservationId', event.reservation_id,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'actorType', case
          when event.note in ('탑승 확인', 'passenger_check_in_code', 'destination_queue_check_in_code') then 'passenger'
          when event.note = 'bus_departed_auto_no_show' or event.note like '호차 출발%' then 'automatic'
          else 'boarding_manager'
        end,
        'actorName', case
          when event.note in ('탑승 확인', 'passenger_check_in_code', 'destination_queue_check_in_code') then ''
          when event.note = 'bus_departed_auto_no_show' or event.note like '호차 출발%' then ''
          else coalesce(actor.name, '담당자')
        end,
        'createdAt', event.created_at,
        'note', event.note
      ) order by event.created_at desc), '[]'::jsonb)
      from public.boarding_status_events event
      left join public.profiles actor on actor.id = event.actor_id
      join public.reservations reservation on reservation.id = event.reservation_id
      where reservation.status = 'confirmed'
        and reservation.confirmed_ticket ->> 'allocationStrategy' = 'destination_queue'
    )
  );
end;
$$;

grant execute on function public.get_destination_queue_boarding_snapshot() to authenticated;
grant execute on function public.get_destination_queue_boarding_snapshot() to service_role;
