-- =========================================================
-- Prevent stale optimization snapshots from reusing completed results
-- =========================================================

create or replace function public.allocation_optimization_snapshot_is_current(
  p_input_snapshot jsonb
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_input_snapshot ->> 'active_reservations_hash', '')
    = coalesce(
      public.get_active_reservation_optimization_state() ->> 'hash',
      ''
    );
$$;

revoke all on function public.allocation_optimization_snapshot_is_current(jsonb)
  from public, anon, authenticated;

create or replace function public.get_reusable_allocation_optimization_job(
  p_job_id uuid,
  p_input_hash text,
  p_input_snapshot jsonb,
  p_optimization_scope text,
  p_detailed_settings jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', reusable.id,
    'result', reusable.result,
    'diagnostics', reusable.diagnostics,
    'best_known_bus_count', reusable.best_known_bus_count,
    'proven_bus_count', reusable.proven_bus_count
  )
  from public.allocation_optimization_jobs reusable
  where public.allocation_optimization_snapshot_is_current(p_input_snapshot)
    and reusable.id <> p_job_id
    and reusable.status = 'OPTIMAL'
    and reusable.input_hash = p_input_hash
    and reusable.input_snapshot = p_input_snapshot
    and reusable.optimization_scope = p_optimization_scope
    and coalesce(reusable.detailed_settings, '{}'::jsonb)
      = coalesce(p_detailed_settings, '{}'::jsonb)
    and jsonb_typeof(reusable.result) = 'object'
  order by reusable.completed_at desc
  limit 1;
$$;

create or replace function public.create_allocation_optimization_job()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_job public.allocation_optimization_jobs%rowtype;
  v_reusable public.allocation_optimization_jobs%rowtype;
begin
  v_job_id := public.create_uncached_allocation_optimization_job();

  select *
  into v_job
  from public.allocation_optimization_jobs
  where id = v_job_id;

  select reusable.*
  into v_reusable
  from public.allocation_optimization_jobs reusable
  where public.allocation_optimization_snapshot_is_current(v_job.input_snapshot)
    and reusable.id <> v_job.id
    and reusable.status = 'OPTIMAL'
    and reusable.optimization_scope = 'BASELINE'
    and reusable.input_hash = v_job.input_hash
    and reusable.input_snapshot = v_job.input_snapshot
    and jsonb_typeof(reusable.result) = 'object'
  order by reusable.completed_at desc
  limit 1;

  if v_reusable.id is not null then
    update public.allocation_optimization_jobs
    set
      status = 'OPTIMAL',
      started_at = now(),
      completed_at = now(),
      progress = 100,
      current_phase = 'completed',
      elapsed_seconds = 0,
      best_known_bus_count = v_reusable.best_known_bus_count,
      proven_bus_count = v_reusable.proven_bus_count,
      result = v_reusable.result,
      diagnostics = v_reusable.diagnostics,
      error_message = null
    where id = v_job.id
      and status = 'PENDING';

    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      v_job.id,
      'JOB_RESULT_REUSED',
      jsonb_build_object('source_job_id', v_reusable.id::text)
    );
  end if;

  return v_job.id;
end;
$$;

create or replace function public.create_detailed_allocation_optimization_job(
  p_source_job_id uuid,
  p_skipped_phases text[],
  p_resume_from_job_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.allocation_optimization_jobs%rowtype;
  v_resume public.allocation_optimization_jobs%rowtype;
  v_reusable public.allocation_optimization_jobs%rowtype;
  v_job_id uuid;
  v_base_source_job_id uuid;
  v_skipped_phases text[];
  v_settings jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can create detailed allocation jobs.';
  end if;
  if exists (
    select 1 from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Another allocation optimization job is already active.';
  end if;

  select * into v_source
  from public.allocation_optimization_jobs
  where id = p_source_job_id;

  if v_source.id is null
    or v_source.status <> 'OPTIMAL'
    or jsonb_typeof(v_source.result) <> 'object' then
    raise exception 'A completed optimal allocation job is required.';
  end if;

  v_base_source_job_id := case
    when v_source.optimization_scope = 'BASELINE' then v_source.id
    else v_source.source_job_id
  end;
  if v_base_source_job_id is null then
    raise exception 'A baseline source job is required.';
  end if;

  select coalesce(array_agg(phase order by phase), '{}'::text[])
  into v_skipped_phases
  from (
    select distinct unnest(coalesce(p_skipped_phases, '{}'::text[])) as phase
  ) phases
  where phase = any(array[
    'campus_bus_uses',
    'campus_distribution_imbalance',
    'campus_isolated_groups',
    'campus_odd_groups',
    'team_bus_uses',
    'team_distribution_imbalance',
    'destination_occupancy_imbalance'
  ]::text[]);

  if cardinality(v_skipped_phases)
    <> cardinality(coalesce(p_skipped_phases, '{}'::text[])) then
    raise exception 'Detailed allocation skipped phases contain an invalid value.';
  end if;

  v_settings := jsonb_build_object('skipped_phases', to_jsonb(v_skipped_phases));

  if p_resume_from_job_id is not null then
    select * into v_resume
    from public.allocation_optimization_jobs
    where id = p_resume_from_job_id
      and status = 'OPTIMAL'
      and optimization_scope = 'DETAILED'
      and input_snapshot = v_source.input_snapshot;
  else
    select * into v_resume
    from public.allocation_optimization_jobs
    where status = 'OPTIMAL'
      and optimization_scope = 'DETAILED'
      and input_snapshot = v_source.input_snapshot
    order by completed_at desc
    limit 1;
  end if;

  insert into public.allocation_optimization_jobs (
    status, requested_by, input_hash, input_snapshot, optimization_scope,
    source_job_id, detailed_settings, resume_from_job_id
  )
  values (
    'PENDING', auth.uid(), v_source.input_hash, v_source.input_snapshot, 'DETAILED',
    v_base_source_job_id, v_settings, v_resume.id
  )
  returning id into v_job_id;

  select reusable.* into v_reusable
  from public.allocation_optimization_jobs reusable
  where public.allocation_optimization_snapshot_is_current(v_source.input_snapshot)
    and reusable.id <> v_job_id
    and reusable.status = 'OPTIMAL'
    and reusable.optimization_scope = 'DETAILED'
    and reusable.input_snapshot = v_source.input_snapshot
    and reusable.detailed_settings = v_settings
    and jsonb_typeof(reusable.result) = 'object'
  order by reusable.completed_at desc
  limit 1;

  if v_reusable.id is not null then
    update public.allocation_optimization_jobs
    set status = 'OPTIMAL', started_at = now(), completed_at = now(),
      progress = 100, current_phase = 'completed', elapsed_seconds = 0,
      best_known_bus_count = v_reusable.best_known_bus_count,
      proven_bus_count = v_reusable.proven_bus_count,
      result = v_reusable.result, diagnostics = v_reusable.diagnostics,
      error_message = null
    where id = v_job_id and status = 'PENDING';

    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      v_job_id, 'JOB_RESULT_REUSED',
      jsonb_build_object('source_job_id', v_reusable.id::text)
    );
  else
    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      v_job_id, 'DETAILED_JOB_CREATED',
      jsonb_build_object(
        'source_job_id', v_base_source_job_id::text,
        'resume_from_job_id', v_resume.id::text,
        'skipped_phases', to_jsonb(v_skipped_phases)
      )
    );
  end if;

  return v_job_id;
end;
$$;

notify pgrst, 'reload schema';
