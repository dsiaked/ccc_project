-- Re-define get_boarding_manager_users to support database-level staff filtering
drop function if exists public.get_boarding_manager_users(text);
drop function if exists public.get_boarding_manager_users(text, boolean);

create function public.get_boarding_manager_users(
  p_search text default '',
  p_is_staff_only boolean default false
)
returns table (
  user_id uuid,
  name text,
  email text,
  phone text,
  district text,
  team text,
  campus text,
  is_boarding_manager boolean,
  assigned_bus_ids text[],
  is_staff boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage boarding managers.';
  end if;

  return query
  select
    profile.id,
    coalesce(profile.name, '이름 없음'),
    profile.email,
    profile.phone,
    profile.district,
    profile.team,
    profile.campus,
    exists (
      select 1 from public.admin_roles role
      where role.user_id = profile.id and role.role = 'boarding_manager'
    ),
    coalesce((
      select array_agg(assignment.bus_id order by assignment.bus_id)
      from public.boarding_manager_bus_assignments assignment
      join public.bus_allocations allocation on allocation.id = assignment.allocation_id
      where assignment.manager_user_id = profile.id
        and allocation.allocation_data ->> 'status' = 'confirmed'
    ), array[]::text[]),
    coalesce(link.is_staff, false) as is_staff
  from public.profiles profile
  left join public.ccc_summer_user_links link on link.user_id = profile.id
  where (
    nullif(trim(p_search), '') is null
    or concat_ws(' ', profile.name, profile.email, profile.phone, profile.campus)
      ilike '%' || trim(p_search) || '%'
  )
  and (
    not p_is_staff_only
    or coalesce(link.is_staff, false) = true
  )
  order by
    exists (
      select 1 from public.admin_roles role
      where role.user_id = profile.id and role.role = 'boarding_manager'
    ) desc,
    profile.name asc nulls last
  limit 200;
end;
$$;

revoke all on function public.get_boarding_manager_users(text, boolean) from public, anon;
grant execute on function public.get_boarding_manager_users(text, boolean) to authenticated;
grant execute on function public.get_boarding_manager_users(text, boolean) to service_role;
