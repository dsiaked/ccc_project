-- =========================================================
-- Show whether reservations changed after an optimization job was created
-- =========================================================

create or replace function public.get_active_reservation_optimization_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'count', count(*)::integer,
    'hash', md5(
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', reservation.id::text,
            'status', reservation.status,
            'updated_at', reservation.updated_at
          )
          order by reservation.id
        )::text,
        '[]'
      )
    )
  )
  from public.reservations reservation
  where reservation.status is distinct from 'cancelled';
$$;

revoke all on function public.get_active_reservation_optimization_state()
  from public, anon, authenticated;

drop function if exists public.get_allocation_optimization_job(uuid);
create function public.get_allocation_optimization_job(p_job_id uuid)
returns table (
  id uuid, optimization_scope text, source_job_id uuid, resume_from_job_id uuid,
  detailed_settings jsonb, status text, requested_at timestamptz,
  started_at timestamptz, completed_at timestamptz, progress integer,
  current_phase text, elapsed_seconds integer, best_known_bus_count integer,
  proven_bus_count integer, result_reused boolean, result jsonb,
  diagnostics jsonb, error_message text, reservations_changed boolean,
  snapshot_active_reservation_count integer, current_active_reservation_count integer
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_current_state jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;

  v_current_state := public.get_active_reservation_optimization_state();

  return query
  select job.id, job.optimization_scope, job.source_job_id, job.resume_from_job_id,
    job.detailed_settings, job.status, job.requested_at, job.started_at,
    job.completed_at, job.progress, job.current_phase, job.elapsed_seconds,
    job.best_known_bus_count, job.proven_bus_count, job.result_reused,
    job.result, job.diagnostics, job.error_message,
    coalesce(job.input_snapshot ->> 'active_reservations_hash', '')
      <> coalesce(v_current_state ->> 'hash', ''),
    (job.input_snapshot ->> 'active_reservation_count')::integer,
    (v_current_state ->> 'count')::integer
  from public.allocation_optimization_jobs job
  where job.id = p_job_id;
end;
$$;

drop function if exists public.get_recent_allocation_optimization_jobs(integer);
create function public.get_recent_allocation_optimization_jobs(p_limit integer default 20)
returns table (
  id uuid, optimization_scope text, source_job_id uuid, resume_from_job_id uuid,
  detailed_settings jsonb, status text, requested_at timestamptz,
  started_at timestamptz, completed_at timestamptz, progress integer,
  current_phase text, elapsed_seconds integer, best_known_bus_count integer,
  proven_bus_count integer, result_reused boolean, error_message text,
  reservations_changed boolean, snapshot_active_reservation_count integer,
  current_active_reservation_count integer
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_current_state jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimization jobs.';
  end if;

  v_current_state := public.get_active_reservation_optimization_state();

  return query
  select job.id, job.optimization_scope, job.source_job_id, job.resume_from_job_id,
    job.detailed_settings, job.status, job.requested_at, job.started_at,
    job.completed_at, job.progress, job.current_phase, job.elapsed_seconds,
    job.best_known_bus_count, job.proven_bus_count, job.result_reused,
    job.error_message,
    coalesce(job.input_snapshot ->> 'active_reservations_hash', '')
      <> coalesce(v_current_state ->> 'hash', ''),
    (job.input_snapshot ->> 'active_reservation_count')::integer,
    (v_current_state ->> 'count')::integer
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
