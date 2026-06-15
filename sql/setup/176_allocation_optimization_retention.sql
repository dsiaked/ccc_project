-- =========================================================
-- Retain recent allocation optimization history without unbounded growth
-- =========================================================

create or replace function public.prune_allocation_optimization_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
begin
  with recursive retained_jobs(id) as (
    select job.id
    from public.allocation_optimization_jobs job
    where job.requested_at >= now() - interval '90 days'
      or job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')

    union

    select recent_optimal.id
    from (
      select job.id
      from public.allocation_optimization_jobs job
      where job.status = 'OPTIMAL'
      order by job.completed_at desc nulls last, job.requested_at desc, job.id
      limit 5
    ) recent_optimal

    union

    select dependency.id
    from retained_jobs retained
    join public.allocation_optimization_jobs retained_job
      on retained_job.id = retained.id
    join public.allocation_optimization_jobs dependency
      on dependency.id in (
        retained_job.source_job_id,
        retained_job.resume_from_job_id
      )
  ),
  deleted as (
    delete from public.allocation_optimization_jobs job
    where job.id not in (select retained.id from retained_jobs retained)
    returning 1
  )
  select count(*)::integer into v_deleted_count from deleted;

  return v_deleted_count;
end;
$$;

revoke all on function public.prune_allocation_optimization_jobs()
  from public, anon, authenticated;
grant execute on function public.prune_allocation_optimization_jobs()
  to service_role;

create or replace function public.prune_allocation_optimization_jobs_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.prune_allocation_optimization_jobs();
  return null;
end;
$$;

revoke all on function public.prune_allocation_optimization_jobs_after_insert()
  from public, anon, authenticated;

drop trigger if exists prune_allocation_optimization_jobs_after_insert
  on public.allocation_optimization_jobs;
create trigger prune_allocation_optimization_jobs_after_insert
after insert on public.allocation_optimization_jobs
for each statement execute function public.prune_allocation_optimization_jobs_after_insert();

notify pgrst, 'reload schema';
