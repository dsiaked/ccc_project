-- =========================================================
-- Restrict bus option management to the single bus type
-- supported by the exact allocation optimizer.
-- =========================================================

create or replace function public.upsert_bus_option_as_global_admin(
  p_id uuid,
  p_capacity integer,
  p_estimated_price integer,
  p_max_count integer,
  p_notes text
)
returns public.bus_options
language plpgsql security definer set search_path = public
as $$
declare v_row public.bus_options;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage bus options.'; end if;
  if coalesce(p_capacity, 0) < 1 then raise exception 'Capacity must be positive.'; end if;
  if coalesce(p_estimated_price, -1) < 0 then raise exception 'Estimated price cannot be negative.'; end if;
  if coalesce(p_max_count, 0) < 1 then raise exception 'Maximum count must be positive.'; end if;

  if p_id is null then
    lock table public.bus_options in share row exclusive mode;
    if exists (select 1 from public.bus_options) then
      raise exception 'Only one bus option can be registered.';
    end if;

    insert into public.bus_options (capacity, estimated_price, max_count, notes)
    values (p_capacity, p_estimated_price, p_max_count, nullif(trim(p_notes), ''))
    returning * into v_row;
  else
    update public.bus_options
    set capacity = p_capacity,
        estimated_price = p_estimated_price,
        max_count = p_max_count,
        notes = nullif(trim(p_notes), '')
    where id = p_id
    returning * into v_row;
    if v_row.id is null then raise exception 'Bus option not found.'; end if;
  end if;
  return v_row;
end;
$$;
