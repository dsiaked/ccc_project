-- Fix authenticated requests failing with:
-- infinite recursion detected in policy for relation "admin_roles"

create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  );
$$;

revoke all on function public.is_global_admin() from public;
grant execute on function public.is_global_admin() to authenticated;

drop policy if exists "Global admins can view admin roles" on public.admin_roles;
drop policy if exists "Global admins can manage admin roles" on public.admin_roles;

create policy "Global admins can view admin roles"
on public.admin_roles
for select
to authenticated
using (public.is_global_admin());

revoke insert, update, delete on table public.admin_roles from public, anon, authenticated;

notify pgrst, 'reload schema';
