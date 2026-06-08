-- =========================================================
-- Final setup guarantees and health check
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

drop policy if exists "Global admins can view admin roles" on public.admin_roles;
drop policy if exists "Global admins can manage admin roles" on public.admin_roles;

create policy "Global admins can view admin roles"
on public.admin_roles
for select
to authenticated
using (public.is_global_admin());

revoke insert, update, delete on table public.admin_roles from public, anon, authenticated;

alter table public.districts enable row level security;
alter table public.teams enable row level security;
alter table public.campuses enable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.districts to anon, authenticated;
grant select on table public.teams to anon, authenticated;
grant select on table public.campuses to anon, authenticated;
grant select on table public.campus_options to anon, authenticated;

drop policy if exists "Anyone can view active districts" on public.districts;
drop policy if exists "Anyone can view active teams" on public.teams;
drop policy if exists "Anyone can view active campuses" on public.campuses;

create policy "Anyone can view active districts"
on public.districts
for select
to anon, authenticated
using (is_active = true);

create policy "Anyone can view active teams"
on public.teams
for select
to anon, authenticated
using (is_active = true);

create policy "Anyone can view active campuses"
on public.campuses
for select
to anon, authenticated
using (is_active = true);

revoke all on function public.email_exists(text) from anon, authenticated;
grant execute on function public.get_destination_stats() to authenticated;

notify pgrst, 'reload schema';

select
  (select count(*) from public.districts where is_active = true) as active_districts,
  (select count(*) from public.teams where is_active = true) as active_teams,
  (select count(*) from public.campuses where is_active = true) as active_campuses;
