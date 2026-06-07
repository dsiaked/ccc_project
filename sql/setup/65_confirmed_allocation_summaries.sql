-- =========================================================
-- Lightweight confirmed allocation summaries.
-- Run after 55_atomic_allocation_confirmation.sql.
-- =========================================================

create or replace function public.get_confirmed_allocation_summaries()
returns table (
  id uuid,
  allocation_name text,
  total_cost integer,
  total_capacity integer,
  created_at timestamptz,
  bus_count integer,
  passenger_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view allocation summaries.';
  end if;

  return query
  select
    allocation.id,
    allocation.allocation_name,
    allocation.total_cost,
    allocation.total_capacity,
    coalesce(
      nullif(allocation.allocation_data ->> 'confirmedAt', '')::timestamptz,
      allocation.created_at
    ) as created_at,
    case
      when jsonb_typeof(allocation.allocation_data -> 'buses') = 'array'
        then jsonb_array_length(allocation.allocation_data -> 'buses')
      else 0
    end as bus_count,
    case
      when jsonb_typeof(allocation.allocation_data -> 'passengers') = 'array'
        then jsonb_array_length(allocation.allocation_data -> 'passengers')
      else 0
    end as passenger_count
  from public.bus_allocations allocation
  where allocation.allocation_data ->> 'status' = 'confirmed'
  order by coalesce(
    nullif(allocation.allocation_data ->> 'confirmedAt', '')::timestamptz,
    allocation.created_at
  ) desc;
end;
$$;

revoke all on function public.get_confirmed_allocation_summaries() from public, anon;
grant execute on function public.get_confirmed_allocation_summaries() to authenticated;

notify pgrst, 'reload schema';
