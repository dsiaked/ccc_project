-- Keep Seoul reservation organization scope canonical by campus_id.
-- External participants retain free-text organization fields without IDs.

update public.reservations reservation
set
  district_id = district.id,
  district = district.name,
  team_id = team.id,
  team = team.name,
  campus = campus.name
from public.campuses campus
join public.teams team on team.id = campus.team_id
join public.districts district on district.id = team.district_id
where reservation.affiliation_type = 'seoul'
  and reservation.campus_id = campus.id
  and (
    reservation.district_id is distinct from district.id
    or reservation.district is distinct from district.name
    or reservation.team_id is distinct from team.id
    or reservation.team is distinct from team.name
    or reservation.campus is distinct from campus.name
  );

update public.reservations reservation
set
  district_id = district.id,
  team_id = team.id,
  campus_id = campus.id
from public.districts district
join public.teams team on team.district_id = district.id
join public.campuses campus on campus.team_id = team.id
where reservation.affiliation_type = 'seoul'
  and reservation.district = district.name
  and reservation.team = team.name
  and reservation.campus = campus.name
  and not exists (
    select 1
    from public.campuses current_campus
    where current_campus.id = reservation.campus_id
  );

update public.reservations
set district_id = null, team_id = null, campus_id = null
where affiliation_type = 'external'
  and (district_id is not null or team_id is not null or campus_id is not null);

do $$
declare
  v_invalid_reservations text;
begin
  select string_agg(reservation.id::text, ', ' order by reservation.id::text)
  into v_invalid_reservations
  from public.reservations reservation
  where reservation.affiliation_type = 'seoul'
    and not exists (
      select 1
      from public.campuses campus
      where campus.id = reservation.campus_id
    );

  if v_invalid_reservations is not null then
    raise exception 'Seoul reservations have no valid campus_id: %',
      v_invalid_reservations;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_district_id_fkey'
  ) then
    alter table public.reservations
      add constraint reservations_district_id_fkey
      foreign key (district_id) references public.districts(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_team_id_fkey'
  ) then
    alter table public.reservations
      add constraint reservations_team_id_fkey
      foreign key (team_id) references public.teams(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_campus_id_fkey'
  ) then
    alter table public.reservations
      add constraint reservations_campus_id_fkey
      foreign key (campus_id) references public.campuses(id);
  end if;
end;
$$;

create or replace function public.sync_reservation_organization_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.affiliation_type = 'external'
    or (
      new.campus_id is null
      and exists (
        select 1
        from public.profiles profile
        where profile.id = new.user_id
          and profile.affiliation_type = 'external'
      )
    ) then
    new.affiliation_type := 'external';
    new.district_id := null;
    new.team_id := null;
    new.campus_id := null;
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
    raise exception 'Seoul reservations require a valid campus_id.';
  end if;

  return new;
end;
$$;

drop trigger if exists sync_reservation_organization_scope
  on public.reservations;
create trigger sync_reservation_organization_scope
before insert or update of
  affiliation_type, district_id, district, team_id, team, campus_id, campus
on public.reservations
for each row execute function public.sync_reservation_organization_scope();

create or replace function public.refresh_reservation_organization_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'districts' then
    update public.reservations reservation
    set campus_id = reservation.campus_id
    from public.campuses campus
    join public.teams team on team.id = campus.team_id
    where reservation.affiliation_type = 'seoul'
      and reservation.campus_id = campus.id
      and team.district_id = new.id;
  elsif tg_table_name = 'teams' then
    update public.reservations reservation
    set campus_id = reservation.campus_id
    from public.campuses campus
    where reservation.affiliation_type = 'seoul'
      and reservation.campus_id = campus.id
      and campus.team_id = new.id;
  else
    update public.reservations reservation
    set campus_id = reservation.campus_id
    where reservation.affiliation_type = 'seoul'
      and reservation.campus_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists refresh_reservation_scope_after_district_change
  on public.districts;
create trigger refresh_reservation_scope_after_district_change
after update of name on public.districts
for each row execute function public.refresh_reservation_organization_scope();

drop trigger if exists refresh_reservation_scope_after_team_change
  on public.teams;
create trigger refresh_reservation_scope_after_team_change
after update of name, district_id on public.teams
for each row execute function public.refresh_reservation_organization_scope();

drop trigger if exists refresh_reservation_scope_after_campus_change
  on public.campuses;
create trigger refresh_reservation_scope_after_campus_change
after update of name, team_id on public.campuses
for each row execute function public.refresh_reservation_organization_scope();

notify pgrst, 'reload schema';
