-- =========================================================
-- Reuse unchanged optimal allocation results before launching a worker
-- =========================================================

do $$
begin
  if to_regprocedure(
    'public.create_uncached_allocation_optimization_job()'
  ) is null then
    alter function public.create_allocation_optimization_job()
      rename to create_uncached_allocation_optimization_job;
  end if;
end;
$$;

revoke all on function public.create_uncached_allocation_optimization_job()
  from public, anon, authenticated;

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
  where reusable.id <> v_job.id
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

do $$
begin
  if to_regprocedure(
    'public.create_uncached_detailed_allocation_optimization_job(uuid)'
  ) is null then
    alter function public.create_detailed_allocation_optimization_job(uuid)
      rename to create_uncached_detailed_allocation_optimization_job;
  end if;
end;
$$;

revoke all on function public.create_uncached_detailed_allocation_optimization_job(uuid)
  from public, anon, authenticated;

create or replace function public.create_detailed_allocation_optimization_job(
  p_source_job_id uuid
)
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
  v_job_id := public.create_uncached_detailed_allocation_optimization_job(
    p_source_job_id
  );

  select *
  into v_job
  from public.allocation_optimization_jobs
  where id = v_job_id;

  select reusable.*
  into v_reusable
  from public.allocation_optimization_jobs reusable
  where reusable.id <> v_job.id
    and reusable.status = 'OPTIMAL'
    and reusable.optimization_scope = 'DETAILED'
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

revoke all on function public.create_allocation_optimization_job()
  from public, anon;
revoke all on function public.create_detailed_allocation_optimization_job(uuid)
  from public, anon;
grant execute on function public.create_allocation_optimization_job()
  to authenticated;
grant execute on function public.create_detailed_allocation_optimization_job(uuid)
  to authenticated;

notify pgrst, 'reload schema';
