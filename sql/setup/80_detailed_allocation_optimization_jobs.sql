-- =========================================================
-- Split the proven minimum-cost baseline from optional detailed balancing
-- =========================================================

alter table public.allocation_optimization_jobs
  add column if not exists optimization_scope text not null default 'BASELINE'
    check (optimization_scope in ('BASELINE', 'DETAILED')),
  add column if not exists source_job_id uuid
    references public.allocation_optimization_jobs(id) on delete set null;

create index if not exists idx_allocation_optimization_jobs_source
  on public.allocation_optimization_jobs(source_job_id);

create or replace function public.create_detailed_allocation_optimization_job(
  p_source_job_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.allocation_optimization_jobs%rowtype;
  v_job_id uuid;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can create detailed allocation jobs.';
  end if;
  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Another allocation optimization job is already active.';
  end if;

  select *
  into v_source
  from public.allocation_optimization_jobs
  where id = p_source_job_id;

  if v_source.id is null
    or v_source.status <> 'OPTIMAL'
    or v_source.optimization_scope <> 'BASELINE'
    or jsonb_typeof(v_source.result) <> 'object' then
    raise exception 'A completed baseline allocation job is required.';
  end if;

  insert into public.allocation_optimization_jobs (
    status,
    requested_by,
    input_hash,
    input_snapshot,
    optimization_scope,
    source_job_id
  )
  values (
    'PENDING',
    auth.uid(),
    v_source.input_hash,
    v_source.input_snapshot,
    'DETAILED',
    v_source.id
  )
  returning id into v_job_id;

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    v_job_id,
    'DETAILED_JOB_CREATED',
    jsonb_build_object(
      'requested_by', auth.uid()::text,
      'source_job_id', v_source.id::text
    )
  );

  return v_job_id;
end;
$$;

drop function if exists public.get_allocation_optimization_job(uuid);
create function public.get_allocation_optimization_job(p_job_id uuid)
returns table (
  id uuid,
  optimization_scope text,
  source_job_id uuid,
  status text,
  requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  progress integer,
  current_phase text,
  elapsed_seconds integer,
  best_known_bus_count integer,
  proven_bus_count integer,
  result jsonb,
  diagnostics jsonb,
  error_message text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;
  return query
  select
    job.id, job.optimization_scope, job.source_job_id, job.status,
    job.requested_at, job.started_at, job.completed_at, job.progress,
    job.current_phase, job.elapsed_seconds, job.best_known_bus_count,
    job.proven_bus_count, job.result, job.diagnostics, job.error_message
  from public.allocation_optimization_jobs job
  where job.id = p_job_id;
end;
$$;

drop function if exists public.get_recent_allocation_optimization_jobs(integer);
create function public.get_recent_allocation_optimization_jobs(p_limit integer default 20)
returns table (
  id uuid,
  optimization_scope text,
  source_job_id uuid,
  status text,
  requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  progress integer,
  current_phase text,
  elapsed_seconds integer,
  best_known_bus_count integer,
  proven_bus_count integer,
  error_message text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;
  return query
  select
    job.id, job.optimization_scope, job.source_job_id, job.status,
    job.requested_at, job.started_at, job.completed_at, job.progress,
    job.current_phase, job.elapsed_seconds, job.best_known_bus_count,
    job.proven_bus_count, job.error_message
  from public.allocation_optimization_jobs job
  order by job.requested_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

revoke all on function public.create_detailed_allocation_optimization_job(uuid)
  from public, anon;
grant execute on function public.create_detailed_allocation_optimization_job(uuid)
  to authenticated;
grant execute on function public.get_allocation_optimization_job(uuid)
  to authenticated;
grant execute on function public.get_recent_allocation_optimization_jobs(integer)
  to authenticated;

notify pgrst, 'reload schema';
