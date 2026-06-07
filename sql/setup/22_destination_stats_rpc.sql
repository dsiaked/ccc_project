-- =========================================================
-- Destination demand aggregation
-- Run after 21_atomic_reservation_save.sql.
--
-- Aggregates all non-cancelled reservations inside Postgres so allocation demand
-- is not truncated by PostgREST's maximum response row limit.
-- =========================================================

drop function if exists public.get_destination_stats();

create or replace function public.get_destination_stats()
returns table (
  station_name text,
  rank1 bigint,
  rank2 bigint,
  total bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view destination statistics.';
  end if;

  return query
  select
    demand.station_name,
    demand.rank1,
    demand.rank2,
    demand.total
  from (
    select
      preference -> 'station' ->> 'name' as station_name,
      count(*) filter (where (preference ->> 'rank')::integer = 1) as rank1,
      count(*) filter (where (preference ->> 'rank')::integer = 2) as rank2,
      count(*) as total
    from public.reservations
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(reservations.station_preferences) = 'array'
          then reservations.station_preferences
        else '[]'::jsonb
      end
    ) as preference
    where reservations.status is distinct from 'cancelled'
      and nullif(trim(preference -> 'station' ->> 'name'), '') is not null
      and (preference ->> 'rank') ~ '^[12]$'
    group by preference -> 'station' ->> 'name'
  ) as demand
  order by
    demand.rank1 desc,
    demand.rank2 desc,
    demand.station_name;
end;
$$;

revoke all on function public.get_destination_stats() from public, anon;
grant execute on function public.get_destination_stats() to authenticated;

notify pgrst, 'reload schema';
