-- Keep the active confirmed allocation name canonical.

create or replace function public.normalize_confirmed_allocation_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.allocation_data ->> 'status' = 'confirmed' then
    new.allocation_name := '확정 배차안';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_confirmed_allocation_name
  on public.bus_allocations;
create trigger normalize_confirmed_allocation_name
before insert or update of allocation_name, allocation_data
on public.bus_allocations
for each row execute function public.normalize_confirmed_allocation_name();

update public.bus_allocations
set allocation_name = '확정 배차안'
where allocation_data ->> 'status' = 'confirmed'
  and allocation_name <> '확정 배차안';

notify pgrst, 'reload schema';
