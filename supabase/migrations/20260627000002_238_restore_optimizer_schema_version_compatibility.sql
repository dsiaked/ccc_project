-- Keep optimizer snapshots compatible with the deployed worker.

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

notify pgrst, 'reload schema';
