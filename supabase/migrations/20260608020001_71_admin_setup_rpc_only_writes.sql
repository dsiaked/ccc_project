-- =========================================================
-- Admin setup RPC-only writes
-- Bus options, organization, and stations.
-- =========================================================

create or replace function public.upsert_bus_option_as_global_admin(
  p_id uuid,
  p_capacity integer,
  p_estimated_price integer,
  p_max_count integer,
  p_notes text
)
returns public.bus_options
language plpgsql security definer set search_path = public
as $$
declare v_row public.bus_options;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage bus options.'; end if;
  if coalesce(p_capacity, 0) < 1 then raise exception 'Capacity must be positive.'; end if;
  if coalesce(p_estimated_price, -1) < 0 then raise exception 'Estimated price cannot be negative.'; end if;
  if coalesce(p_max_count, 0) < 1 then raise exception 'Maximum count must be positive.'; end if;

  if p_id is null then
    insert into public.bus_options (capacity, estimated_price, max_count, notes)
    values (p_capacity, p_estimated_price, p_max_count, nullif(trim(p_notes), ''))
    returning * into v_row;
  else
    update public.bus_options
    set capacity = p_capacity,
        estimated_price = p_estimated_price,
        max_count = p_max_count,
        notes = nullif(trim(p_notes), '')
    where id = p_id
    returning * into v_row;
    if v_row.id is null then raise exception 'Bus option not found.'; end if;
  end if;
  return v_row;
end;
$$;

create or replace function public.delete_bus_option_as_global_admin(p_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage bus options.'; end if;
  delete from public.bus_options where id = p_id;
  if not found then raise exception 'Bus option not found.'; end if;
  return true;
end;
$$;

create or replace function public.create_campus_scope_as_global_admin(
  p_district text,
  p_team text,
  p_campus text
)
returns public.campuses
language plpgsql security definer set search_path = public
as $$
declare
  v_district_id uuid;
  v_team_id uuid;
  v_campus public.campuses;
  v_district text := nullif(trim(p_district), '');
  v_team text := nullif(trim(p_team), '');
  v_campus_name text := nullif(trim(p_campus), '');
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage organization.'; end if;
  if v_district is null or v_team is null or v_campus_name is null then
    raise exception 'District, team, and campus are required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('organization:' || v_district || ':' || v_team || ':' || v_campus_name, 0));

  insert into public.districts (name, is_active)
  values (v_district, true)
  on conflict (name) do update set is_active = true
  returning id into v_district_id;

  insert into public.teams (district_id, name, is_active)
  values (v_district_id, v_team, true)
  on conflict (district_id, name) do update set is_active = true
  returning id into v_team_id;

  if exists (select 1 from public.campuses where team_id = v_team_id and name = v_campus_name) then
    raise exception 'Campus already exists.';
  end if;

  insert into public.campuses (team_id, name, is_active)
  values (v_team_id, v_campus_name, true)
  returning * into v_campus;
  return v_campus;
end;
$$;

create or replace function public.upsert_station_as_global_admin(
  p_id uuid,
  p_name text,
  p_line text,
  p_address text,
  p_lat double precision,
  p_lng double precision
)
returns public.stations
language plpgsql security definer set search_path = public
as $$
declare v_row public.stations; v_name text := nullif(trim(p_name), '');
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage stations.'; end if;
  if v_name is null then raise exception 'Station name is required.'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'Invalid latitude.'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'Invalid longitude.'; end if;

  if p_id is null then
    insert into public.stations (name, line, address, lat, lng, is_active)
    values (v_name, nullif(trim(p_line), ''), nullif(trim(p_address), ''), p_lat, p_lng, true)
    returning * into v_row;
  else
    update public.stations
    set name = v_name, line = nullif(trim(p_line), ''), address = nullif(trim(p_address), ''), lat = p_lat, lng = p_lng
    where id = p_id
    returning * into v_row;
    if v_row.id is null then raise exception 'Station not found.'; end if;
  end if;
  return v_row;
end;
$$;

create or replace function public.delete_station_as_global_admin(p_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage stations.'; end if;
  delete from public.stations where id = p_id;
  if not found then raise exception 'Station not found.'; end if;
  return true;
end;
$$;

revoke all on function public.upsert_bus_option_as_global_admin(uuid, integer, integer, integer, text) from public, anon;
revoke all on function public.delete_bus_option_as_global_admin(uuid) from public, anon;
revoke all on function public.create_campus_scope_as_global_admin(text, text, text) from public, anon;
revoke all on function public.upsert_station_as_global_admin(uuid, text, text, text, double precision, double precision) from public, anon;
revoke all on function public.delete_station_as_global_admin(uuid) from public, anon;
grant execute on function public.upsert_bus_option_as_global_admin(uuid, integer, integer, integer, text) to authenticated;
grant execute on function public.delete_bus_option_as_global_admin(uuid) to authenticated;
grant execute on function public.create_campus_scope_as_global_admin(text, text, text) to authenticated;
grant execute on function public.upsert_station_as_global_admin(uuid, text, text, text, double precision, double precision) to authenticated;
grant execute on function public.delete_station_as_global_admin(uuid) to authenticated;

drop policy if exists "Global admins can manage bus options" on public.bus_options;
drop policy if exists "Global admins can manage districts" on public.districts;
drop policy if exists "Global admins can manage teams" on public.teams;
drop policy if exists "Global admins can manage campuses" on public.campuses;
drop policy if exists "Global admins can manage stations" on public.stations;
revoke insert, update, delete on table public.bus_options, public.districts, public.teams, public.campuses, public.stations
  from public, anon, authenticated;

notify pgrst, 'reload schema';
