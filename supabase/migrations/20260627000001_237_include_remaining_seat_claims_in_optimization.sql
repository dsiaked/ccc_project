-- Include remaining-seat claims when rebuilding allocation optimizer inputs.

create or replace function public.get_allocation_optimization_reservations()
returns table (
  reservation_id uuid,
  campus text,
  team text,
  first_choice text,
  second_choice text,
  source text,
  remaining_seat_status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select
      reservation.id,
      coalesce(
        nullif(reservation.data ->> 'campus', ''),
        nullif(reservation.campus, '')
      ) as campus,
      coalesce(
        nullif(reservation.data ->> 'team', ''),
        nullif(reservation.team, ''),
        case when reservation.affiliation_type = 'external' then '-' end
      ) as team,
      case
        when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
          then reservation.data -> 'stationPreferences'
        else coalesce(reservation.station_preferences, '[]'::jsonb)
      end as preferences,
      case
        when jsonb_typeof(reservation.data -> 'remainingSeatClaim') = 'object'
          then reservation.data -> 'remainingSeatClaim'
        else null
      end as remaining_claim,
      reservation.created_at
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
  )
  select
    active.id,
    active.campus,
    active.team,
    coalesce(
      nullif(active.remaining_claim ->> 'destination', ''),
      active.preferences #>> '{0,station,name}'
    ) as first_choice,
    coalesce(
      nullif(active.remaining_claim ->> 'destination', ''),
      active.preferences #>> '{1,station,name}'
    ) as second_choice,
    case when active.remaining_claim is null then 'regular' else 'remaining_seat' end,
    case
      when active.remaining_claim ->> 'status' = 'confirmed' then 'confirmed'
      when active.remaining_claim is not null then 'pending_payment'
      else null
    end,
    active.created_at
  from active;
$$;

revoke all on function public.get_allocation_optimization_reservations()
  from public, anon, authenticated;
grant execute on function public.get_allocation_optimization_reservations()
  to service_role;

create or replace function public.get_active_reservation_optimization_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'count', count(*)::integer,
    'hash', md5(
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', snapshot.reservation_id::text,
            'campus', snapshot.campus,
            'team', snapshot.team,
            'first_choice', snapshot.first_choice,
            'second_choice', snapshot.second_choice,
            'source', snapshot.source,
            'remaining_seat_status', snapshot.remaining_seat_status
          )
          order by snapshot.reservation_id
        )::text,
        '[]'
      )
    )
  )
  from public.get_allocation_optimization_reservations() snapshot;
$$;

revoke all on function public.get_active_reservation_optimization_state()
  from public, anon, authenticated;
grant execute on function public.get_active_reservation_optimization_state()
  to service_role;

create or replace function public.create_uncached_allocation_optimization_job()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_config jsonb;
  v_passengers jsonb;
  v_snapshot jsonb;
  v_active_state jsonb;
  v_active_reservation_count integer;
  v_active_reservations_hash text;
  v_invalid_reservations text;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can create allocation optimization jobs.';
  end if;
  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Another allocation optimization job is already active.';
  end if;

  v_config := public.get_allocation_optimizer_config();
  if coalesce((v_config ->> 'capacity')::integer, 0) <= 0
    or coalesce((v_config ->> 'price')::integer, -1) < 0
    or coalesce((v_config ->> 'recommended_minimum_passengers')::integer, 0) <= 0 then
    raise exception 'Allocation optimizer configuration is invalid.';
  end if;

  v_active_state := public.get_active_reservation_optimization_state();
  v_active_reservation_count := coalesce((v_active_state ->> 'count')::integer, 0);
  v_active_reservations_hash := coalesce(v_active_state ->> 'hash', '');

  select string_agg(snapshot.reservation_id::text, ', ' order by snapshot.reservation_id::text)
  into v_invalid_reservations
  from public.get_allocation_optimization_reservations() snapshot
  where snapshot.campus is null
    or snapshot.team is null
    or nullif(snapshot.first_choice, '') is null
    or nullif(snapshot.second_choice, '') is null
    or (
      snapshot.source <> 'remaining_seat'
      and snapshot.first_choice = snapshot.second_choice
    );

  if v_invalid_reservations is not null then
    raise exception 'Active reservations have invalid allocation data: %',
      v_invalid_reservations;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'reservation_id', snapshot.reservation_id::text,
        'campus', snapshot.campus,
        'team', snapshot.team,
        'first_choice', snapshot.first_choice,
        'second_choice', snapshot.second_choice,
        'source', snapshot.source,
        'remaining_seat_status', snapshot.remaining_seat_status
      )
      order by snapshot.created_at, snapshot.reservation_id
    ),
    '[]'::jsonb
  )
  into v_passengers
  from public.get_allocation_optimization_reservations() snapshot;

  if jsonb_array_length(v_passengers) = 0 then
    raise exception 'No active reservations are available for optimization.';
  end if;

  v_snapshot := jsonb_build_object(
    'schema_version', 1,
    'bus', v_config,
    'passengers', v_passengers,
    'active_reservation_count', v_active_reservation_count,
    'active_reservations_hash', v_active_reservations_hash
  );

  begin
    insert into public.allocation_optimization_jobs (
      status,
      requested_by,
      input_hash,
      input_snapshot
    )
    values (
      'PENDING',
      auth.uid(),
      md5(v_snapshot::text),
      v_snapshot
    )
    returning id into v_job_id;
  exception
    when unique_violation then
      raise exception 'Another allocation optimization job is already active.';
  end;

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    v_job_id,
    'REQUESTED',
    jsonb_build_object(
      'requested_by', auth.uid()::text,
      'active_reservation_count', v_active_reservation_count
    )
  );

  return v_job_id;
end;
$$;

revoke all on function public.create_uncached_allocation_optimization_job()
  from public, anon, authenticated;
grant execute on function public.create_uncached_allocation_optimization_job()
  to service_role;

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
    from public.get_allocation_optimization_reservations()
  ) <> v_passenger_count
    or exists (
      select 1
      from public.get_allocation_optimization_reservations() active
      where not exists (
        select 1
        from jsonb_array_elements(v_snapshot -> 'passengers') passenger
        where passenger ->> 'reservation_id' = active.reservation_id::text
          and passenger ->> 'campus' = active.campus
          and passenger ->> 'team' = active.team
          and passenger ->> 'first_choice' = active.first_choice
          and passenger ->> 'second_choice' = active.second_choice
          and coalesce(passenger ->> 'source', 'regular') = active.source
          and coalesce(passenger ->> 'remaining_seat_status', '')
            = coalesce(active.remaining_seat_status, '')
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
    jsonb_strip_nulls(jsonb_build_object(
      'reservationId', reservation.id::text,
      'name', coalesce(nullif(reservation.data ->> 'name', ''), reservation.name, '-'),
      'phone', coalesce(nullif(reservation.data ->> 'phone', ''), reservation.phone, '-'),
      'campus', passenger ->> 'campus',
      'team', passenger ->> 'team',
      'preferences', case
        when passenger ->> 'source' = 'remaining_seat'
          then jsonb_build_array(passenger ->> 'first_choice')
        else jsonb_build_array(
          passenger ->> 'first_choice',
          passenger ->> 'second_choice'
        )
      end,
      'busId', assignment ->> 'bus_id',
      'seatNumber', (assignment ->> 'seat_number')::integer,
      'source', passenger ->> 'source',
      'remainingSeatStatus', passenger ->> 'remaining_seat_status'
    ))
    order by reservation.created_at, reservation.id
  )
  into v_passengers
  from jsonb_array_elements(v_result -> 'assignments') assignment
  join jsonb_array_elements(v_snapshot -> 'passengers') passenger
    on passenger ->> 'reservation_id' = assignment ->> 'reservation_id'
  join public.reservations reservation
    on reservation.id::text = assignment ->> 'reservation_id'
  where reservation.status is distinct from 'cancelled';

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
      'mode', 'exact_minimum_cost',
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
        'detail', '최적화 결과를 바탕으로 배차 초안을 생성했습니다.'
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
grant execute on function public.create_allocation_draft_from_optimal_job(uuid, text)
  to service_role;

notify pgrst, 'reload schema';
