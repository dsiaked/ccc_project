-- =========================================================
-- Resume detailed allocation jobs and skip selected secondary phases
-- =========================================================

alter table public.allocation_optimization_jobs
  add column if not exists detailed_settings jsonb not null default '{}'::jsonb,
  add column if not exists resume_from_job_id uuid
    references public.allocation_optimization_jobs(id) on delete set null;

create index if not exists idx_allocation_optimization_jobs_resume
  on public.allocation_optimization_jobs(resume_from_job_id);

drop function if exists public.create_detailed_allocation_optimization_job(uuid);
drop function if exists public.create_uncached_detailed_allocation_optimization_job(uuid);

create function public.create_detailed_allocation_optimization_job(
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

  if cardinality(v_skipped_phases) <> cardinality(coalesce(p_skipped_phases, '{}'::text[])) then
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
  where reusable.id <> v_job_id
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

drop function if exists public.get_allocation_optimization_job(uuid);
create function public.get_allocation_optimization_job(p_job_id uuid)
returns table (
  id uuid, optimization_scope text, source_job_id uuid, resume_from_job_id uuid,
  detailed_settings jsonb, status text, requested_at timestamptz,
  started_at timestamptz, completed_at timestamptz, progress integer,
  current_phase text, elapsed_seconds integer, best_known_bus_count integer,
  proven_bus_count integer, result_reused boolean, result jsonb,
  diagnostics jsonb, error_message text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;
  return query
  select job.id, job.optimization_scope, job.source_job_id, job.resume_from_job_id,
    job.detailed_settings, job.status, job.requested_at, job.started_at,
    job.completed_at, job.progress, job.current_phase, job.elapsed_seconds,
    job.best_known_bus_count, job.proven_bus_count, job.result_reused,
    job.result, job.diagnostics, job.error_message
  from public.allocation_optimization_jobs job where job.id = p_job_id;
end;
$$;

drop function if exists public.get_recent_allocation_optimization_jobs(integer);
create function public.get_recent_allocation_optimization_jobs(p_limit integer default 20)
returns table (
  id uuid, optimization_scope text, source_job_id uuid, resume_from_job_id uuid,
  detailed_settings jsonb, status text, requested_at timestamptz,
  started_at timestamptz, completed_at timestamptz, progress integer,
  current_phase text, elapsed_seconds integer, best_known_bus_count integer,
  proven_bus_count integer, result_reused boolean, error_message text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;
  return query
  select job.id, job.optimization_scope, job.source_job_id, job.resume_from_job_id,
    job.detailed_settings, job.status, job.requested_at, job.started_at,
    job.completed_at, job.progress, job.current_phase, job.elapsed_seconds,
    job.best_known_bus_count, job.proven_bus_count, job.result_reused,
    job.error_message
  from public.allocation_optimization_jobs job
  order by job.requested_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

revoke all on function public.create_detailed_allocation_optimization_job(uuid, text[], uuid)
  from public, anon;
grant execute on function public.create_detailed_allocation_optimization_job(uuid, text[], uuid)
  to authenticated;
grant execute on function public.get_allocation_optimization_job(uuid) to authenticated;
grant execute on function public.get_recent_allocation_optimization_jobs(integer) to authenticated;

notify pgrst, 'reload schema';
