-- Keep scoped Seoul profiles canonical by campus_id.
-- External profiles retain free-text organization fields without IDs.
-- Profiles with no organization fields remain valid for system/global-admin accounts.

update public.profiles profile
set
  district_id = district.id,
  district = district.name,
  team_id = team.id,
  team = team.name,
  campus = campus.name
from public.campuses campus
join public.teams team on team.id = campus.team_id
join public.districts district on district.id = team.district_id
where profile.affiliation_type = 'seoul'
  and profile.campus_id = campus.id
  and (
    profile.district_id is distinct from district.id
    or profile.district is distinct from district.name
    or profile.team_id is distinct from team.id
    or profile.team is distinct from team.name
    or profile.campus is distinct from campus.name
  );

update public.profiles profile
set
  district_id = district.id,
  team_id = team.id,
  campus_id = campus.id
from public.districts district
join public.teams team on team.district_id = district.id
join public.campuses campus on campus.team_id = team.id
where profile.affiliation_type = 'seoul'
  and profile.district = district.name
  and profile.team = team.name
  and profile.campus = campus.name
  and not exists (
    select 1
    from public.campuses current_campus
    where current_campus.id = profile.campus_id
  );

update public.profiles
set district_id = null, team_id = null, campus_id = null
where affiliation_type = 'external'
  and (district_id is not null or team_id is not null or campus_id is not null);

do $$
declare
  v_invalid_profiles text;
begin
  select string_agg(profile.id::text, ', ' order by profile.id::text)
  into v_invalid_profiles
  from public.profiles profile
  where profile.affiliation_type = 'seoul'
    and (
      profile.district_id is not null
      or nullif(trim(profile.district), '') is not null
      or profile.team_id is not null
      or nullif(trim(profile.team), '') is not null
      or profile.campus_id is not null
      or nullif(trim(profile.campus), '') is not null
    )
    and not exists (
      select 1
      from public.campuses campus
      where campus.id = profile.campus_id
    );

  if v_invalid_profiles is not null then
    raise exception 'Scoped Seoul profiles have no valid campus_id: %',
      v_invalid_profiles;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_district_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_district_id_fkey
      foreign key (district_id) references public.districts(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_team_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_team_id_fkey
      foreign key (team_id) references public.teams(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_campus_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_campus_id_fkey
      foreign key (campus_id) references public.campuses(id);
  end if;
end;
$$;

create or replace function public.sync_profile_organization_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.affiliation_type = 'external' then
    new.district_id := null;
    new.team_id := null;
    new.campus_id := null;
    return new;
  end if;

  if new.district_id is null
    and nullif(trim(new.district), '') is null
    and new.team_id is null
    and nullif(trim(new.team), '') is null
    and new.campus_id is null
    and nullif(trim(new.campus), '') is null then
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
    raise exception 'Scoped Seoul profiles require a valid campus_id.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_profile_organization_membership
  on public.profiles;
drop trigger if exists sync_profile_organization_scope
  on public.profiles;
create trigger sync_profile_organization_scope
before insert or update of
  affiliation_type, district_id, district, team_id, team, campus_id, campus
on public.profiles
for each row execute function public.sync_profile_organization_scope();

create or replace function public.refresh_profile_organization_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'districts' then
    update public.profiles profile
    set campus_id = profile.campus_id
    from public.campuses campus
    join public.teams team on team.id = campus.team_id
    where profile.affiliation_type = 'seoul'
      and profile.campus_id = campus.id
      and team.district_id = new.id;
  elsif tg_table_name = 'teams' then
    update public.profiles profile
    set campus_id = profile.campus_id
    from public.campuses campus
    where profile.affiliation_type = 'seoul'
      and profile.campus_id = campus.id
      and campus.team_id = new.id;
  else
    update public.profiles profile
    set campus_id = profile.campus_id
    where profile.affiliation_type = 'seoul'
      and profile.campus_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists refresh_profile_scope_after_district_change
  on public.districts;
create trigger refresh_profile_scope_after_district_change
after update of name on public.districts
for each row execute function public.refresh_profile_organization_scope();

drop trigger if exists refresh_profile_scope_after_team_change
  on public.teams;
create trigger refresh_profile_scope_after_team_change
after update of name, district_id on public.teams
for each row execute function public.refresh_profile_organization_scope();

drop trigger if exists refresh_profile_scope_after_campus_change
  on public.campuses;
create trigger refresh_profile_scope_after_campus_change
after update of name, team_id on public.campuses
for each row execute function public.refresh_profile_organization_scope();

notify pgrst, 'reload schema';
