-- Allow global admins to cancel destination-first allocations before any bus departs.

create or replace function public.require_confirmed_destination_queue_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1
  from public.bus_allocations
  where id = new.allocation_id
    and allocation_data ->> 'status' = 'confirmed'
    and allocation_data ->> 'allocationStrategy' = 'destination_queue'
  for key share;

  if not found then
    raise exception 'Destination queue buses require a confirmed allocation.';
  end if;
  return new;
end;
$$;

drop trigger if exists require_confirmed_destination_queue_allocation
  on public.destination_queue_buses;
create trigger require_confirmed_destination_queue_allocation
before insert on public.destination_queue_buses
for each row execute function public.require_confirmed_destination_queue_allocation();

create or replace function public.cancel_destination_queue_allocation(
  p_allocation_id uuid,
  p_expected_revision bigint,
  p_allocation_data jsonb,
  p_total_cost integer,
  p_total_capacity integer,
  p_version_id text,
  p_version_label text,
  p_version_changes jsonb
)
returns setof public.bus_allocations
language plpgsql
security definer
set search_path = public
set statement_timeout = '5min'
as $$
declare
  v_current_strategy text;
  v_current_status text;
  v_saved public.bus_allocations%rowtype;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can cancel confirmed allocations.';
  end if;

  select
    allocation_data ->> 'allocationStrategy',
    allocation_data ->> 'status'
  into v_current_strategy, v_current_status
  from public.bus_allocations
  where id = p_allocation_id
  for update;

  if v_current_strategy is distinct from 'destination_queue'
    or v_current_status is distinct from 'confirmed' then
    raise exception 'Only confirmed destination queue allocations can be cancelled.';
  end if;

  perform 1
  from public.destination_queue_buses
  where allocation_id = p_allocation_id
  for update;

  if exists (
    select 1
    from public.destination_queue_buses
    where allocation_id = p_allocation_id
      and status = 'departed'
  ) then
    raise exception 'Departed destination queue buses prevent allocation cancellation.';
  end if;

  select *
  into v_saved
  from public.cancel_confirmed_allocation_workspace_v2(
    p_allocation_id,
    p_expected_revision,
    p_allocation_data,
    p_total_cost,
    p_total_capacity,
    p_version_id,
    p_version_label,
    p_version_changes
  );

  delete from public.destination_queue_buses
  where allocation_id = p_allocation_id;

  return next v_saved;
end;
$$;

revoke all on function public.cancel_destination_queue_allocation(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from public, anon;
revoke all on function public.require_confirmed_destination_queue_allocation()
  from public, anon, authenticated;
grant execute on function public.cancel_destination_queue_allocation(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) to authenticated;
grant execute on function public.cancel_destination_queue_allocation(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) to service_role;
grant execute on function public.require_confirmed_destination_queue_allocation()
  to service_role;

notify pgrst, 'reload schema';
