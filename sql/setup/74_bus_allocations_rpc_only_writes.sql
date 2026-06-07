-- =========================================================
-- Bus allocations RPC-only writes and canonical totals
-- =========================================================

create or replace function public.set_bus_allocation_canonical_totals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_items jsonb;
begin
  if jsonb_typeof(new.allocation_data) <> 'object' then
    raise exception 'Allocation data must be a JSON object.';
  end if;

  if jsonb_typeof(new.allocation_data -> 'buses') = 'array' then
    v_items := new.allocation_data -> 'buses';
  elsif jsonb_typeof(new.allocation_data -> 'routePlan') = 'array' then
    v_items := new.allocation_data -> 'routePlan';
  else
    raise exception 'Allocation data must contain buses or routePlan.';
  end if;

  select
    coalesce(sum(greatest(coalesce((item ->> 'price')::integer, 0), 0)), 0),
    coalesce(sum(greatest(coalesce((item ->> 'capacity')::integer, 0), 0)), 0)
  into new.total_cost, new.total_capacity
  from jsonb_array_elements(v_items) item;

  return new;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Allocation bus price and capacity must be valid integers.';
end;
$$;

drop trigger if exists set_bus_allocation_canonical_totals on public.bus_allocations;
create trigger set_bus_allocation_canonical_totals
before insert or update of allocation_data, total_cost, total_capacity
on public.bus_allocations
for each row execute function public.set_bus_allocation_canonical_totals();

create or replace function public.create_bus_allocation_as_global_admin(
  p_allocation_name text,
  p_allocation_data jsonb
)
returns public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bus_allocations;
  v_status text;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create allocations.';
  end if;

  if nullif(trim(p_allocation_name), '') is null then
    raise exception 'Allocation name is required.';
  end if;
  if jsonb_typeof(p_allocation_data) <> 'object' then
    raise exception 'Allocation data must be a JSON object.';
  end if;

  v_status := p_allocation_data ->> 'status';
  if v_status is not null and v_status <> 'draft' then
    raise exception 'New allocation workspaces must be drafts.';
  end if;
  if jsonb_typeof(p_allocation_data -> 'buses') <> 'array'
    and jsonb_typeof(p_allocation_data -> 'routePlan') <> 'array' then
    raise exception 'Allocation data must contain buses or routePlan.';
  end if;

  insert into public.bus_allocations (
    allocation_name,
    allocation_data,
    total_cost,
    total_capacity,
    created_by,
    revision,
    updated_at
  )
  values (
    trim(p_allocation_name),
    p_allocation_data - 'versions',
    0,
    0,
    auth.uid(),
    0,
    now()
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_bus_allocation_as_global_admin(text, jsonb)
  from public, anon;
grant execute on function public.create_bus_allocation_as_global_admin(text, jsonb)
  to authenticated;

drop policy if exists "Global admins can manage bus allocations" on public.bus_allocations;
revoke insert, update, delete on table public.bus_allocations from public, anon, authenticated;

notify pgrst, 'reload schema';
