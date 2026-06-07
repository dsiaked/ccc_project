-- =========================================================
-- Route allocation optimization jobs to local or Cloud Run workers
-- =========================================================

alter table public.allocation_optimization_jobs
  add column if not exists execution_mode text not null default 'local'
    check (execution_mode in ('local', 'cloud'));

create index if not exists idx_allocation_optimization_jobs_pending_execution
  on public.allocation_optimization_jobs(execution_mode, requested_at)
  where status = 'PENDING';

create or replace function public.create_allocation_optimization_job_for_execution(
  p_execution_mode text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  if p_execution_mode not in ('local', 'cloud') then
    raise exception 'Allocation optimization execution mode is invalid.';
  end if;

  v_job_id := public.create_allocation_optimization_job();

  update public.allocation_optimization_jobs
  set execution_mode = p_execution_mode
  where id = v_job_id;

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    v_job_id,
    'EXECUTION_MODE_SELECTED',
    jsonb_build_object('execution_mode', p_execution_mode)
  );

  return v_job_id;
end;
$$;

create or replace function public.create_detailed_allocation_optimization_job_for_execution(
  p_source_job_id uuid,
  p_skipped_phases text[],
  p_resume_from_job_id uuid,
  p_execution_mode text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  if p_execution_mode not in ('local', 'cloud') then
    raise exception 'Allocation optimization execution mode is invalid.';
  end if;

  v_job_id := public.create_detailed_allocation_optimization_job(
    p_source_job_id,
    p_skipped_phases,
    p_resume_from_job_id
  );

  update public.allocation_optimization_jobs
  set execution_mode = p_execution_mode
  where id = v_job_id;

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    v_job_id,
    'EXECUTION_MODE_SELECTED',
    jsonb_build_object('execution_mode', p_execution_mode)
  );

  return v_job_id;
end;
$$;

revoke all on function public.create_allocation_optimization_job_for_execution(text)
  from public, anon;
revoke all on function public.create_detailed_allocation_optimization_job_for_execution(
  uuid, text[], uuid, text
)
  from public, anon;

grant execute on function public.create_allocation_optimization_job_for_execution(text)
  to authenticated;
grant execute on function public.create_detailed_allocation_optimization_job_for_execution(
  uuid, text[], uuid, text
)
  to authenticated;

notify pgrst, 'reload schema';
