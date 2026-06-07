-- =========================================================
-- Fix authenticated bus_allocations reads returning HTTP 500
-- because allocation policies evaluate admin_roles RLS directly.
-- =========================================================

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

drop policy if exists "Global admins can view bus allocations"
  on public.bus_allocations;
drop policy if exists "Global admins can manage bus allocations"
  on public.bus_allocations;

create policy "Global admins can view bus allocations"
on public.bus_allocations
for select
to authenticated
using (public.is_global_admin());

revoke insert, update, delete on table public.bus_allocations from public, anon, authenticated;

notify pgrst, 'reload schema';
