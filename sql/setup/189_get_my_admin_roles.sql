create or replace function public.get_my_admin_roles()
returns setof public.admin_roles
language sql
stable
security definer
set search_path = public
as $$
  select role.*
  from public.admin_roles role
  where role.user_id = auth.uid()
  order by role.role desc, role.updated_at desc nulls last, role.created_at desc nulls last;
$$;

revoke all on function public.get_my_admin_roles() from public, anon;
grant execute on function public.get_my_admin_roles() to authenticated;

notify pgrst, 'reload schema';
