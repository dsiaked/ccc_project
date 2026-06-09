-- Support message substring search and optimal result reuse lookups.

create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_campus_request_messages_message_trgm
  on public.campus_request_messages
  using gin (message extensions.gin_trgm_ops);

create index if not exists idx_allocation_optimization_jobs_optimal_reuse
  on public.allocation_optimization_jobs(
    optimization_scope,
    input_hash,
    completed_at desc
  )
  where status = 'OPTIMAL';

create or replace function public.get_reusable_allocation_optimization_job(
  p_job_id uuid,
  p_input_hash text,
  p_input_snapshot jsonb,
  p_optimization_scope text,
  p_detailed_settings jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', reusable.id,
    'result', reusable.result,
    'diagnostics', reusable.diagnostics,
    'best_known_bus_count', reusable.best_known_bus_count,
    'proven_bus_count', reusable.proven_bus_count
  )
  from public.allocation_optimization_jobs reusable
  where reusable.id <> p_job_id
    and reusable.status = 'OPTIMAL'
    and reusable.input_hash = p_input_hash
    and reusable.input_snapshot = p_input_snapshot
    and reusable.optimization_scope = p_optimization_scope
    and coalesce(reusable.detailed_settings, '{}'::jsonb)
      = coalesce(p_detailed_settings, '{}'::jsonb)
    and jsonb_typeof(reusable.result) = 'object'
  order by reusable.completed_at desc
  limit 1;
$$;

revoke all on function public.get_reusable_allocation_optimization_job(
  uuid, text, jsonb, text, jsonb
) from public, anon, authenticated;
grant execute on function public.get_reusable_allocation_optimization_job(
  uuid, text, jsonb, text, jsonb
) to service_role;

create or replace function public.get_campus_request_summary()
returns table (
  total bigint,
  notices bigint,
  open bigint,
  in_progress bigint,
  resolved bigint,
  on_hold bigint
)
language sql
stable
set search_path = public
as $$
  select
    count(*) filter (where not request.is_global_notice) as total,
    count(*) filter (where request.is_global_notice) as notices,
    count(*) filter (
      where not request.is_global_notice and request.status = 'open'
    ) as open,
    count(*) filter (
      where not request.is_global_notice and request.status = 'in_progress'
    ) as in_progress,
    count(*) filter (
      where not request.is_global_notice and request.status = 'resolved'
    ) as resolved,
    count(*) filter (
      where not request.is_global_notice and request.status = 'on_hold'
    ) as on_hold
  from public.campus_requests request;
$$;

revoke all on function public.get_campus_request_summary()
  from public, anon;
grant execute on function public.get_campus_request_summary()
  to authenticated;

notify pgrst, 'reload schema';
