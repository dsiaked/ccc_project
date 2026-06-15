-- =========================================================
-- Expire allocation optimizer jobs whose worker heartbeat stopped
-- =========================================================

create or replace function public.expire_stale_allocation_optimization_jobs(
  p_stale_after_seconds integer default 4500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired_count integer;
begin
  if p_stale_after_seconds < 60 or p_stale_after_seconds > 86400 then
    raise exception 'Stale optimizer job threshold must be between 60 and 86400 seconds.';
  end if;

  with expired as (
    update public.allocation_optimization_jobs
    set
      status = 'FAILED',
      current_phase = 'failed',
      completed_at = now(),
      error_message = 'The optimizer worker heartbeat expired before completion.'
    where status in ('RUNNING', 'CANCEL_REQUESTED')
      and updated_at < now() - make_interval(secs => p_stale_after_seconds)
    returning id, worker_id, updated_at
  ),
  events as (
    insert into public.allocation_optimization_events (
      job_id,
      event_type,
      detail
    )
    select
      id,
      'JOB_HEARTBEAT_EXPIRED',
      jsonb_build_object(
        'worker_id', worker_id,
        'last_heartbeat_at', updated_at,
        'stale_after_seconds', p_stale_after_seconds
      )
    from expired
    returning 1
  )
  select count(*)::integer into v_expired_count from events;

  return v_expired_count;
end;
$$;

revoke all on function public.expire_stale_allocation_optimization_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.expire_stale_allocation_optimization_jobs(integer)
  to service_role;

notify pgrst, 'reload schema';
