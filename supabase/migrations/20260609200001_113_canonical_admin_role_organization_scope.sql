-- Keep campus-admin organization scope canonical by campus_id.
-- Global admins and boarding managers must not carry organization scope.

update public.admin_roles admin_role
set
  district_id = district.id,
  district = district.name,
  team_id = team.id,
  team = team.name,
  campus = campus.name
from public.campuses campus
join public.teams team on team.id = campus.team_id
join public.districts district on district.id = team.district_id
where admin_role.role = 'campus_admin'
  and admin_role.campus_id = campus.id
  and (
    admin_role.district_id is distinct from district.id
    or admin_role.district is distinct from district.name
    or admin_role.team_id is distinct from team.id
    or admin_role.team is distinct from team.name
    or admin_role.campus is distinct from campus.name
  );

update public.admin_roles admin_role
set
  district_id = district.id,
  team_id = team.id,
  campus_id = campus.id
from public.districts district
join public.teams team on team.district_id = district.id
join public.campuses campus on campus.team_id = team.id
where admin_role.role = 'campus_admin'
  and admin_role.district = district.name
  and admin_role.team = team.name
  and admin_role.campus = campus.name
  and not exists (
    select 1
    from public.campuses current_campus
    where current_campus.id = admin_role.campus_id
  );

update public.admin_roles
set
  district_id = null,
  district = null,
  team_id = null,
  team = null,
  campus_id = null,
  campus = null
where role <> 'campus_admin'
  and (
    district_id is not null
    or district is not null
    or team_id is not null
    or team is not null
    or campus_id is not null
    or campus is not null
  );

do $$
declare
  v_invalid_roles text;
begin
  select string_agg(admin_role.id::text, ', ' order by admin_role.id::text)
  into v_invalid_roles
  from public.admin_roles admin_role
  where admin_role.role = 'campus_admin'
    and not exists (
      select 1
      from public.campuses campus
      where campus.id = admin_role.campus_id
    );

  if v_invalid_roles is not null then
    raise exception 'Campus admin roles have no valid campus_id: %',
      v_invalid_roles;
  end if;
end;
$$;

create unique index if not exists idx_admin_roles_user_campus_id_scope_unique
  on public.admin_roles(user_id, role, campus_id)
  where role = 'campus_admin' and campus_id is not null;

create unique index if not exists idx_admin_roles_campus_id_scope_unique
  on public.admin_roles(role, campus_id)
  where role = 'campus_admin' and campus_id is not null;

create or replace function public.sync_admin_role_organization_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role <> 'campus_admin' then
    new.district_id := null;
    new.district := null;
    new.team_id := null;
    new.team := null;
    new.campus_id := null;
    new.campus := null;
    return new;
  end if;

  select
    district.id,
    district.name,
    team.id,
    team.name,
    campus.name
  into
    new.district_id,
    new.district,
    new.team_id,
    new.team,
    new.campus
  from public.campuses campus
  join public.teams team on team.id = campus.team_id
  join public.districts district on district.id = team.district_id
  where campus.id = new.campus_id;

  if not found then
    raise exception 'Campus admin roles require a valid campus_id.';
  end if;

  return new;
end;
$$;

drop trigger if exists set_admin_role_scope_ids
  on public.admin_roles;
drop trigger if exists sync_admin_role_organization_scope
  on public.admin_roles;
create trigger sync_admin_role_organization_scope
before insert or update of
  role, district_id, district, team_id, team, campus_id, campus
on public.admin_roles
for each row execute function public.sync_admin_role_organization_scope();

create or replace function public.refresh_admin_role_organization_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'districts' then
    update public.admin_roles admin_role
    set campus_id = admin_role.campus_id
    from public.campuses campus
    join public.teams team on team.id = campus.team_id
    where admin_role.role = 'campus_admin'
      and admin_role.campus_id = campus.id
      and team.district_id = new.id;
  elsif tg_table_name = 'teams' then
    update public.admin_roles admin_role
    set campus_id = admin_role.campus_id
    from public.campuses campus
    where admin_role.role = 'campus_admin'
      and admin_role.campus_id = campus.id
      and campus.team_id = new.id;
  else
    update public.admin_roles admin_role
    set campus_id = admin_role.campus_id
    where admin_role.role = 'campus_admin'
      and admin_role.campus_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists refresh_admin_role_scope_after_district_change
  on public.districts;
create trigger refresh_admin_role_scope_after_district_change
after update of name on public.districts
for each row execute function public.refresh_admin_role_organization_scope();

drop trigger if exists refresh_admin_role_scope_after_team_change
  on public.teams;
create trigger refresh_admin_role_scope_after_team_change
after update of name, district_id on public.teams
for each row execute function public.refresh_admin_role_organization_scope();

drop trigger if exists refresh_admin_role_scope_after_campus_change
  on public.campuses;
create trigger refresh_admin_role_scope_after_campus_change
after update of name, team_id on public.campuses
for each row execute function public.refresh_admin_role_organization_scope();

notify pgrst, 'reload schema';
