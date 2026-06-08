-- Account existence must not be exposed to browser clients.
revoke all on function public.email_exists(text) from anon, authenticated;

create or replace function public.validate_profile_organization_membership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.affiliation_type = 'external' then
    if new.district_id is not null
      or new.team_id is not null
      or new.campus_id is not null then
      raise exception 'External profiles cannot reference Seoul organization IDs.';
    end if;

    return new;
  end if;

  if new.district_id is null
    or new.team_id is null
    or new.campus_id is null
    or not exists (
      select 1
      from public.teams
      join public.campuses
        on campuses.team_id = teams.id
      where teams.id = new.team_id
        and teams.district_id = new.district_id
        and campuses.id = new.campus_id
    ) then
    raise exception 'District, team, and campus must belong to the same organization path.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_profile_organization_membership
on public.profiles;
create trigger validate_profile_organization_membership
before insert or update of affiliation_type, district_id, team_id, campus_id
on public.profiles
for each row execute function public.validate_profile_organization_membership();
