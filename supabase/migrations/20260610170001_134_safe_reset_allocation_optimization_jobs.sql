-- =========================================================
-- Safely reset allocation optimization history and cache
-- =========================================================

create or replace function public.reset_allocation_optimization_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
  v_status_counts jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can reset allocation optimization jobs.';
  end if;

  -- Prevent a new job from being inserted after the active-job check.
  lock table public.allocation_optimization_jobs in share row exclusive mode;

  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Cancel the active allocation optimization job before resetting.';
  end if;

  select
    coalesce(sum(status_counts.job_count), 0)::integer,
    coalesce(jsonb_object_agg(status_counts.status, status_counts.job_count), '{}'::jsonb)
  into v_deleted_count, v_status_counts
  from (
    select status, count(*)::integer as job_count
    from public.allocation_optimization_jobs
    group by status
  ) status_counts;

  -- Explicit cleanup also supports deployments whose older foreign keys did
  -- not yet receive the intended cascade and set-null actions.
  delete from public.allocation_optimization_events;

  update public.allocation_optimization_jobs
  set
    source_job_id = null,
    resume_from_job_id = null
  where source_job_id is not null
    or resume_from_job_id is not null;

  delete from public.allocation_optimization_jobs;

  insert into public.admin_action_audit_logs (
    actor_id,
    action,
    resource_type,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    'reset',
    'allocation_optimization_jobs',
    jsonb_build_object(
      'deleted_count', v_deleted_count,
      'status_counts', v_status_counts
    ),
    jsonb_build_object('remaining_count', 0)
  );

  return v_deleted_count;
end;
$$;

revoke all on function public.reset_allocation_optimization_jobs()
  from public, anon;
grant execute on function public.reset_allocation_optimization_jobs()
  to authenticated;

notify pgrst, 'reload schema';
