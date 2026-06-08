-- =========================================================
-- Invalidate reusable optimization results after any active reservation change
-- =========================================================

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

  select
    count(*)::integer,
    md5(
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', reservation.id::text,
            'status', reservation.status,
            'updated_at', reservation.updated_at
          )
          order by reservation.id
        )::text,
        '[]'
      )
    )
  into v_active_reservation_count, v_active_reservations_hash
  from public.reservations reservation
  where reservation.status is distinct from 'cancelled';

  with active_reservations as (
    select
      reservation.id,
      coalesce(nullif(reservation.data ->> 'campus', ''), nullif(reservation.campus, '')) as campus,
      coalesce(nullif(reservation.data ->> 'team', ''), nullif(reservation.team, '')) as team,
      case
        when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
          then reservation.data -> 'stationPreferences'
        else coalesce(reservation.station_preferences, '[]'::jsonb)
      end as preferences
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
      and not coalesce(reservation.data ? 'remainingSeatClaim', false)
  ),
  normalized as (
    select
      active.id,
      active.campus,
      active.team,
      active.preferences,
      active.preferences #>> '{0,station,name}' as first_choice,
      active.preferences #>> '{1,station,name}' as second_choice
    from active_reservations active
  )
  select string_agg(normalized.id::text, ', ' order by normalized.id::text)
  into v_invalid_reservations
  from normalized
  where normalized.campus is null
    or normalized.team is null
    or jsonb_typeof(normalized.preferences) <> 'array'
    or case
      when jsonb_typeof(normalized.preferences) = 'array'
        then jsonb_array_length(normalized.preferences) <> 2
      else true
    end
    or nullif(normalized.first_choice, '') is null
    or nullif(normalized.second_choice, '') is null
    or normalized.first_choice = normalized.second_choice;

  if v_invalid_reservations is not null then
    raise exception 'Active reservations have invalid allocation data: %',
      v_invalid_reservations;
  end if;

  with active_reservations as (
    select
      reservation.id,
      coalesce(nullif(reservation.data ->> 'campus', ''), reservation.campus, '-') as campus,
      coalesce(nullif(reservation.data ->> 'team', ''), reservation.team, '-') as team,
      case
        when jsonb_typeof(reservation.data -> 'stationPreferences') = 'array'
          then reservation.data -> 'stationPreferences'
        else coalesce(reservation.station_preferences, '[]'::jsonb)
      end as preferences,
      reservation.created_at
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
      and not coalesce(reservation.data ? 'remainingSeatClaim', false)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'reservation_id', active.id::text,
        'campus', active.campus,
        'team', active.team,
        'first_choice', active.preferences #>> '{0,station,name}',
        'second_choice', active.preferences #>> '{1,station,name}'
      )
      order by active.created_at, active.id
    ),
    '[]'::jsonb
  )
  into v_passengers
  from active_reservations active;

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
    'JOB_CREATED',
    jsonb_build_object(
      'requested_by', auth.uid()::text,
      'passenger_count', jsonb_array_length(v_passengers),
      'active_reservation_count', v_active_reservation_count,
      'input_hash', md5(v_snapshot::text)
    )
  );

  return v_job_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Allocation optimizer configuration contains invalid numbers.';
end;
$$;

revoke all on function public.create_uncached_allocation_optimization_job()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
