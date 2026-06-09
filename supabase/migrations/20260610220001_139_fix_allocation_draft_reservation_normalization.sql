-- =========================================================
-- Keep draft validation aligned with optimizer reservation normalization
-- =========================================================

create or replace function public.create_allocation_draft_from_optimal_job(
  p_job_id uuid,
  p_allocation_name text
)
returns public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.allocation_optimization_jobs%rowtype;
  v_result jsonb;
  v_snapshot jsonb;
  v_config jsonb;
  v_buses jsonb;
  v_passengers jsonb;
  v_route_plan jsonb;
  v_workspace jsonb;
  v_created public.bus_allocations;
  v_now timestamptz := clock_timestamp();
  v_passenger_count integer;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can create allocation drafts.';
  end if;
  if nullif(btrim(p_allocation_name), '') is null then
    raise exception 'Allocation name is required.';
  end if;

  select *
  into v_job
  from public.allocation_optimization_jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'Allocation optimization job not found.';
  end if;
  if v_job.status <> 'OPTIMAL' or jsonb_typeof(v_job.result) <> 'object' then
    raise exception 'Only OPTIMAL allocation optimization jobs can create drafts.';
  end if;
  if exists (
    select 1
    from public.bus_allocations allocation
    where allocation.allocation_data ->> 'sourceOptimizationJobId' = p_job_id::text
      and allocation.allocation_data ->> 'status' in ('draft', 'confirmed')
  ) then
    raise exception 'An allocation draft already exists for this optimization job.';
  end if;

  v_result := v_job.result;
  v_snapshot := v_job.input_snapshot;
  v_config := v_snapshot -> 'bus';
  v_passenger_count := jsonb_array_length(v_snapshot -> 'passengers');

  if v_config is distinct from public.get_allocation_optimizer_config() then
    raise exception 'Allocation optimizer configuration changed after calculation.';
  end if;
  if jsonb_typeof(v_result -> 'buses') <> 'array'
    or jsonb_typeof(v_result -> 'assignments') <> 'array'
    or v_result ->> 'status' <> 'OPTIMAL'
    or coalesce(v_result ->> 'total_buses', '') !~ '^[1-9][0-9]*$'
    or coalesce(v_result ->> 'total_cost', '') !~ '^[0-9]+$'
    or coalesce(v_result ->> 'second_choice_count', '') !~ '^[0-9]+$'
    or jsonb_array_length(v_result -> 'buses') <> (v_result ->> 'total_buses')::integer
    or jsonb_array_length(v_result -> 'assignments') <> v_passenger_count then
    raise exception 'Optimal allocation result structure is invalid.';
  end if;
  if (v_result ->> 'total_cost')::integer
    <> (v_result ->> 'total_buses')::integer * (v_config ->> 'price')::integer then
    raise exception 'Optimal allocation result cost is invalid.';
  end if;
  if v_job.proven_bus_count is distinct from (v_result ->> 'total_buses')::integer
    or (
      select count(distinct bus ->> 'bus_id')
      from jsonb_array_elements(v_result -> 'buses') bus
    ) <> jsonb_array_length(v_result -> 'buses')
    or (
      select count(*)
      from jsonb_array_elements(v_result -> 'assignments') assignment
      where assignment ->> 'preference_rank' = '2'
    ) <> (v_result ->> 'second_choice_count')::integer then
    raise exception 'Optimal allocation proof metadata is invalid.';
  end if;

  if (
    select count(*)
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
      and not coalesce(reservation.data ? 'remainingSeatClaim', false)
  ) <> v_passenger_count
    or exists (
      select 1
      from public.reservations reservation
      where reservation.status is distinct from 'cancelled'
        and not coalesce(reservation.data ? 'remainingSeatClaim', false)
        and not exists (
          select 1
          from jsonb_array_elements(v_snapshot -> 'passengers') passenger
          where passenger ->> 'reservation_id' = reservation.id::text
            and passenger ->> 'campus' = coalesce(
              nullif(reservation.data ->> 'campus', ''),
              nullif(reservation.campus, '')
            )
            and passenger ->> 'team' = coalesce(
              nullif(reservation.data ->> 'team', ''),
              nullif(reservation.team, ''),
              case when reservation.affiliation_type = 'external' then '-' end
            )
            and passenger ->> 'first_choice' = (
              case
                when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
                  then reservation.data -> 'stationPreferences'
                else coalesce(reservation.station_preferences, '[]'::jsonb)
              end
            ) #>> '{0,station,name}'
            and passenger ->> 'second_choice' = (
              case
                when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
                  then reservation.data -> 'stationPreferences'
                else coalesce(reservation.station_preferences, '[]'::jsonb)
              end
            ) #>> '{1,station,name}'
        )
    ) then
    raise exception 'Active reservations changed after optimization.';
  end if;

  if (
    select count(distinct assignment ->> 'reservation_id')
    from jsonb_array_elements(v_result -> 'assignments') assignment
  ) <> v_passenger_count
    or exists (
      select 1
      from jsonb_array_elements(v_result -> 'assignments') assignment
      left join jsonb_array_elements(v_snapshot -> 'passengers') passenger
        on passenger ->> 'reservation_id' = assignment ->> 'reservation_id'
      left join jsonb_array_elements(v_result -> 'buses') bus
        on bus ->> 'bus_id' = assignment ->> 'bus_id'
      where passenger is null
        or bus is null
        or assignment ->> 'destination' <> bus ->> 'destination'
        or assignment ->> 'destination' not in (
          passenger ->> 'first_choice',
          passenger ->> 'second_choice'
        )
        or coalesce(assignment ->> 'seat_number', '') !~ '^[1-9][0-9]*$'
        or coalesce(bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
        or (assignment ->> 'seat_number')::integer > (bus ->> 'capacity')::integer
        or case
          when assignment ->> 'destination' = passenger ->> 'first_choice'
            then assignment ->> 'preference_rank' <> '1'
          else assignment ->> 'preference_rank' <> '2'
        end
    ) then
    raise exception 'Optimal allocation assignments are invalid.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_result -> 'assignments') assignment
    group by assignment ->> 'bus_id', assignment ->> 'seat_number'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(v_result -> 'buses') bus
    left join lateral (
      select count(*) as passenger_count
      from jsonb_array_elements(v_result -> 'assignments') assignment
      where assignment ->> 'bus_id' = bus ->> 'bus_id'
    ) assigned on true
    where nullif(bus ->> 'bus_id', '') is null
      or nullif(bus ->> 'label', '') is null
      or nullif(bus ->> 'destination', '') is null
      or coalesce(bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
      or coalesce(bus ->> 'price', '') !~ '^[0-9]+$'
      or (bus ->> 'capacity')::integer <> (v_config ->> 'capacity')::integer
      or (bus ->> 'price')::integer <> (v_config ->> 'price')::integer
      or assigned.passenger_count = 0
      or assigned.passenger_count > (bus ->> 'capacity')::integer
  ) then
    raise exception 'Optimal allocation buses or seats are invalid.';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', bus ->> 'bus_id',
      'label', bus ->> 'label',
      'capacity', (bus ->> 'capacity')::integer,
      'price', (bus ->> 'price')::integer,
      'destination', bus ->> 'destination',
      'departureTime', '',
      'boardingPlace', '',
      'minimumPassengers', (v_config ->> 'recommended_minimum_passengers')::integer
    )
    order by bus ->> 'bus_id'
  )
  into v_buses
  from jsonb_array_elements(v_result -> 'buses') bus;

  select jsonb_agg(
    jsonb_build_object(
      'reservationId', reservation.id::text,
      'name', coalesce(nullif(reservation.data ->> 'name', ''), reservation.name, '-'),
      'phone', coalesce(nullif(reservation.data ->> 'phone', ''), reservation.phone, '-'),
      'campus', passenger ->> 'campus',
      'team', passenger ->> 'team',
      'preferences', jsonb_build_array(
        passenger ->> 'first_choice',
        passenger ->> 'second_choice'
      ),
      'busId', assignment ->> 'bus_id',
      'seatNumber', (assignment ->> 'seat_number')::integer
    )
    order by reservation.created_at, reservation.id
  )
  into v_passengers
  from jsonb_array_elements(v_result -> 'assignments') assignment
  join jsonb_array_elements(v_snapshot -> 'passengers') passenger
    on passenger ->> 'reservation_id' = assignment ->> 'reservation_id'
  join public.reservations reservation
    on reservation.id::text = assignment ->> 'reservation_id'
  where reservation.status is distinct from 'cancelled'
    and not coalesce(reservation.data ? 'remainingSeatClaim', false);

  select jsonb_agg(
    jsonb_build_object(
      'busLabel', bus ->> 'label',
      'capacity', (bus ->> 'capacity')::integer,
      'price', (bus ->> 'price')::integer,
      'passengerCount', assigned.passenger_count,
      'emptySeats', (bus ->> 'capacity')::integer - assigned.passenger_count,
      'destinations', jsonb_build_array(
        jsonb_build_object(
          'name', bus ->> 'destination',
          'passengerCount', assigned.passenger_count,
          'rank2Demand', assigned.second_choice_count
        )
      )
    )
    order by bus ->> 'bus_id'
  )
  into v_route_plan
  from jsonb_array_elements(v_result -> 'buses') bus
  cross join lateral (
    select
      count(*)::integer as passenger_count,
      count(*) filter (where assignment ->> 'preference_rank' = '2')::integer
        as second_choice_count
    from jsonb_array_elements(v_result -> 'assignments') assignment
    where assignment ->> 'bus_id' = bus ->> 'bus_id'
  ) assigned;

  v_workspace := jsonb_build_object(
    'schemaVersion', 2,
    'status', 'draft',
    'sourceOptimizationJobId', p_job_id::text,
    'optimalBaseline', jsonb_build_object(
      'totalBuses', (v_result ->> 'total_buses')::integer,
      'totalCost', (v_result ->> 'total_cost')::integer,
      'secondChoiceCount', (v_result ->> 'second_choice_count')::integer,
      'inputHash', v_job.input_hash
    ),
    'sourceAllocation', jsonb_build_object(
      'combination', jsonb_build_array(
        jsonb_build_object(
          'count', (v_result ->> 'total_buses')::integer,
          'capacity', (v_config ->> 'capacity')::integer,
          'price', (v_config ->> 'price')::integer
        )
      ),
      'totalCost', (v_result ->> 'total_cost')::integer,
      'totalCapacity',
        (v_result ->> 'total_buses')::integer * (v_config ->> 'capacity')::integer,
      'totalBuses', (v_result ->> 'total_buses')::integer,
      'efficiency',
        (100.0 * v_passenger_count)
          / ((v_result ->> 'total_buses')::integer * (v_config ->> 'capacity')::integer),
      'emptySeats',
        (v_result ->> 'total_buses')::integer * (v_config ->> 'capacity')::integer
          - v_passenger_count,
      'costPerPerson',
        case when v_passenger_count > 0
          then (v_result ->> 'total_cost')::numeric / v_passenger_count
          else 0
        end,
      'qualityScore', 0,
      'routePlan', v_route_plan
    ),
    'buses', v_buses,
    'passengers', v_passengers,
    'optimization', jsonb_build_object(
      'mode', '정확 최저비용',
      'firstChoiceWeight', 0,
      'costWeight', 1
    ),
    'allowMinimumPassengerOverride', false,
    'history', jsonb_build_array(
      jsonb_build_object(
        'id', 'history-' || replace(gen_random_uuid()::text, '-', ''),
        'at', v_now,
        'actorId', auth.uid()::text,
        'action', 'exact_draft_created',
        'detail', '최적해 증명이 완료된 정확 최저비용 배차안으로 임시 배차안을 생성했습니다.'
      )
    )
  );

  v_created := public.create_bus_allocation_as_global_admin(
    btrim(p_allocation_name),
    v_workspace
  );

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    p_job_id,
    'DRAFT_CREATED',
    jsonb_build_object(
      'allocation_id', v_created.id::text,
      'created_by', auth.uid()::text
    )
  );

  return v_created;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Optimal allocation result contains invalid numbers.';
end;
$$;

revoke all on function public.create_allocation_draft_from_optimal_job(uuid, text)
  from public, anon;
grant execute on function public.create_allocation_draft_from_optimal_job(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
