-- =========================================================
-- Make allocation optimization cancellation immediate
-- =========================================================

create or replace function public.cancel_allocation_optimization_job(
  p_job_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_status text;
  v_status text;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can cancel allocation optimization jobs.';
  end if;

  select job.status
  into v_previous_status
  from public.allocation_optimization_jobs job
  where job.id = p_job_id
  for update;

  if v_previous_status is null then
    raise exception 'Allocation optimization job not found.';
  end if;

  update public.allocation_optimization_jobs job
  set
    status = case
      when job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED') then 'CANCELLED'
      else job.status
    end,
    current_phase = case
      when job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED') then 'cancelled'
      else job.current_phase
    end,
    cancel_requested_at = case
      when job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
        then coalesce(job.cancel_requested_at, now())
      else job.cancel_requested_at
    end,
    completed_at = case
      when job.status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED') then now()
      else job.completed_at
    end
  where job.id = p_job_id
  returning status into v_status;

  if v_previous_status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED') then
    insert into public.allocation_optimization_events (job_id, event_type, detail)
    values (
      p_job_id,
      'CANCELLED',
      jsonb_build_object(
        'requested_by', auth.uid()::text,
        'previous_status', v_previous_status
      )
    );
  end if;

  return v_status;
end;
$$;

revoke all on function public.cancel_allocation_optimization_job(uuid)
  from public, anon;
grant execute on function public.cancel_allocation_optimization_job(uuid)
  to authenticated;

notify pgrst, 'reload schema';
