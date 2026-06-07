-- =========================================================
-- Expose whether an allocation result was reused
-- =========================================================

alter table public.allocation_optimization_jobs
  add column if not exists result_reused boolean not null default false;

update public.allocation_optimization_jobs job
set result_reused = true
where exists (
  select 1
  from public.allocation_optimization_events event
  where event.job_id = job.id
    and event.event_type = 'JOB_RESULT_REUSED'
);

create or replace function public.mark_allocation_job_result_reused()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type = 'JOB_RESULT_REUSED' then
    update public.allocation_optimization_jobs
    set result_reused = true
    where id = new.job_id;
  end if;
  return new;
end;
$$;

drop trigger if exists mark_allocation_job_result_reused
  on public.allocation_optimization_events;
create trigger mark_allocation_job_result_reused
after insert on public.allocation_optimization_events
for each row execute function public.mark_allocation_job_result_reused();

revoke all on function public.mark_allocation_job_result_reused()
  from public, anon, authenticated;

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
  result_reused boolean,
  result jsonb,
  diagnostics jsonb,
  error_message text
)
language plpgsql stable security definer set search_path = public
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
    job.proven_bus_count, job.result_reused, job.result, job.diagnostics,
    job.error_message
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
  result_reused boolean,
  error_message text
)
language plpgsql stable security definer set search_path = public
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
    job.proven_bus_count, job.result_reused, job.error_message
  from public.allocation_optimization_jobs job
  order by job.requested_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

grant execute on function public.get_allocation_optimization_job(uuid)
  to authenticated;
grant execute on function public.get_recent_allocation_optimization_jobs(integer)
  to authenticated;

notify pgrst, 'reload schema';
