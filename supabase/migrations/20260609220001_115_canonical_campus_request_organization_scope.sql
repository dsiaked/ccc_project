-- Keep campus requests canonical by campus_id. Global notices have no single scope.

update public.campus_requests request
set district_id = district.id, district = district.name,
  team_id = team.id, team = team.name, campus = campus.name
from public.campuses campus
join public.teams team on team.id = campus.team_id
join public.districts district on district.id = team.district_id
where request.is_global_notice = false
  and request.campus_id = campus.id
  and (
    request.district_id is distinct from district.id
    or request.district is distinct from district.name
    or request.team_id is distinct from team.id
    or request.team is distinct from team.name
    or request.campus is distinct from campus.name
  );

update public.campus_requests request
set district_id = district.id, team_id = team.id, campus_id = campus.id
from public.districts district
join public.teams team on team.district_id = district.id
join public.campuses campus on campus.team_id = team.id
where request.is_global_notice = false
  and request.district = district.name
  and request.team = team.name
  and request.campus = campus.name
  and not exists (
    select 1 from public.campuses current_campus
    where current_campus.id = request.campus_id
  );

update public.campus_requests
set district_id = null, district = '', team_id = null, team = '',
  campus_id = null, campus = ''
where is_global_notice = true
  and (
    district_id is not null or district <> ''
    or team_id is not null or team <> ''
    or campus_id is not null or campus <> ''
  );

do $$
declare
  v_invalid_requests text;
begin
  select string_agg(request.id::text, ', ' order by request.id::text)
  into v_invalid_requests
  from public.campus_requests request
  where request.is_global_notice = false
    and not exists (
      select 1 from public.campuses campus
      where campus.id = request.campus_id
    );

  if v_invalid_requests is not null then
    raise exception 'Campus requests have no valid campus_id: %',
      v_invalid_requests;
  end if;
end;
$$;

create or replace function public.sync_campus_request_organization_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_global_notice then
    new.district_id := null;
    new.district := '';
    new.team_id := null;
    new.team := '';
    new.campus_id := null;
    new.campus := '';
    return new;
  end if;

  select district.id, district.name, team.id, team.name, campus.name
  into new.district_id, new.district, new.team_id, new.team, new.campus
  from public.campuses campus
  join public.teams team on team.id = campus.team_id
  join public.districts district on district.id = team.district_id
  where campus.id = new.campus_id;

  if not found then
    raise exception 'Campus requests require a valid campus_id.';
  end if;
  return new;
end;
$$;

drop trigger if exists set_campus_request_scope_ids on public.campus_requests;
drop trigger if exists sync_campus_request_organization_scope on public.campus_requests;
create trigger sync_campus_request_organization_scope
before insert or update of
  is_global_notice, district_id, district, team_id, team, campus_id, campus
on public.campus_requests
for each row execute function public.sync_campus_request_organization_scope();

create or replace function public.refresh_campus_request_organization_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'districts' then
    update public.campus_requests request
    set campus_id = request.campus_id
    from public.campuses campus
    join public.teams team on team.id = campus.team_id
    where request.is_global_notice = false
      and request.campus_id = campus.id and team.district_id = new.id;
  elsif tg_table_name = 'teams' then
    update public.campus_requests request
    set campus_id = request.campus_id
    from public.campuses campus
    where request.is_global_notice = false
      and request.campus_id = campus.id and campus.team_id = new.id;
  else
    update public.campus_requests request
    set campus_id = request.campus_id
    where request.is_global_notice = false and request.campus_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_campus_request_scope_after_district_change on public.districts;
create trigger refresh_campus_request_scope_after_district_change
after update of name on public.districts
for each row execute function public.refresh_campus_request_organization_scope();

drop trigger if exists refresh_campus_request_scope_after_team_change on public.teams;
create trigger refresh_campus_request_scope_after_team_change
after update of name, district_id on public.teams
for each row execute function public.refresh_campus_request_organization_scope();

drop trigger if exists refresh_campus_request_scope_after_campus_change on public.campuses;
create trigger refresh_campus_request_scope_after_campus_change
after update of name, team_id on public.campuses
for each row execute function public.refresh_campus_request_organization_scope();

notify pgrst, 'reload schema';
