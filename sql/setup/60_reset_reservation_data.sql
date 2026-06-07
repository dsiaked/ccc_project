-- =========================================================
-- Reset operation and selected setup data
-- Run this in Supabase SQL Editor.
--
-- Always protects the currently signed-in global admin account and profile.
--
-- Organization reset also clears dependent operation data and campus_admin
-- roles before deleting districts / teams / campuses.
-- =========================================================

drop function if exists reset_reservation_data(
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
);
drop function if exists reset_reservation_data(
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
);
drop function if exists reset_reservation_data(
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
);
drop function if exists reset_reservation_data();
drop function if exists get_deletable_user_count();

create or replace function get_deletable_user_count()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.admin_roles
    where user_id = auth.uid() and role = 'global_admin'
  ) then
    raise exception 'Only global admins can view deletable user count.';
  end if;

  return (select count(*)::integer from auth.users where id <> auth.uid());
end;
$$;

create or replace function reset_reservation_data(
  p_reset_reservations boolean default true,
  p_reset_payments boolean default true,
  p_reset_campus_transfers boolean default true,
  p_reset_bus_allocations boolean default true,
  p_reset_campus_requests boolean default true,
  p_reset_stations boolean default false,
  p_reset_bus_options boolean default false,
  p_reset_app_settings boolean default false,
  p_reset_home_announcements boolean default false,
  p_reset_campus_admin_roles boolean default false,
  p_reset_organization boolean default false,
  p_reset_user_accounts boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_reservations integer := 0;
  v_deleted_payments integer := 0;
  v_deleted_campus_transfers integer := 0;
  v_deleted_bus_allocations integer := 0;
  v_deleted_campus_requests integer := 0;
  v_deleted_campus_request_messages integer := 0;
  v_deleted_stations integer := 0;
  v_deleted_bus_options integer := 0;
  v_deleted_app_settings integer := 0;
  v_deleted_home_announcements integer := 0;
  v_deleted_campus_admin_roles integer := 0;
  v_deleted_districts integer := 0;
  v_deleted_teams integer := 0;
  v_deleted_campuses integer := 0;
  v_deleted_user_accounts integer := 0;
begin
  if not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  ) then
    raise exception 'Only global admins can reset data.';
  end if;

  if p_reset_organization or p_reset_user_accounts then
    p_reset_reservations := true;
    p_reset_payments := true;
    p_reset_campus_transfers := true;
    p_reset_bus_allocations := true;
    p_reset_campus_requests := true;
    p_reset_campus_admin_roles := true;
  end if;

  if p_reset_campus_requests then
    delete from campus_request_messages where true;
    get diagnostics v_deleted_campus_request_messages = row_count;

    delete from campus_requests where true;
    get diagnostics v_deleted_campus_requests = row_count;
  end if;

  if p_reset_campus_transfers then
    delete from campus_transfers where true;
    get diagnostics v_deleted_campus_transfers = row_count;
  end if;

  if p_reset_bus_allocations then
    delete from bus_allocations where true;
    get diagnostics v_deleted_bus_allocations = row_count;
  end if;

  if p_reset_payments or p_reset_reservations then
    delete from payments where true;
    get diagnostics v_deleted_payments = row_count;
  end if;

  if p_reset_reservations then
    delete from reservations where true;
    get diagnostics v_deleted_reservations = row_count;
  end if;

  if p_reset_home_announcements then
    delete from home_announcements where true;
    get diagnostics v_deleted_home_announcements = row_count;
  end if;

  if p_reset_stations then
    delete from stations where true;
    get diagnostics v_deleted_stations = row_count;
  end if;

  if p_reset_bus_options then
    delete from bus_options where true;
    get diagnostics v_deleted_bus_options = row_count;
  end if;

  if p_reset_app_settings then
    delete from app_settings where true;
    get diagnostics v_deleted_app_settings = row_count;

    insert into app_settings (key, value)
    values
      ('bus_ticket_price', '{"price": 0}'::jsonb),
      ('first_reservation_deadline', '{"deadline_at": null}'::jsonb),
      ('seoul_district_transfer_account', '{"account_number": ""}'::jsonb),
      ('participation_targets', '{"rows": [], "targets": {}}'::jsonb),
      ('global_scenario_checklist', '{"checked_step_ids": []}'::jsonb)
    on conflict (key) do update set
      value = excluded.value,
      updated_at = now();
  end if;

  if p_reset_campus_admin_roles then
    delete from admin_roles where role = 'campus_admin';
    get diagnostics v_deleted_campus_admin_roles = row_count;
  end if;

  if p_reset_organization then
    update admin_roles
    set
      district_id = null,
      team_id = null,
      campus_id = null,
      district = null,
      team = null,
      campus = null,
      updated_at = now()
    where role = 'global_admin';

    update profiles
    set
      district_id = null,
      team_id = null,
      campus_id = null,
      district = null,
      team = null,
      campus = null,
      updated_at = now()
    where
      district_id is not null
      or team_id is not null
      or campus_id is not null
      or district is not null
      or team is not null
      or campus is not null;

    select count(*) into v_deleted_districts from districts;
    select count(*) into v_deleted_teams from teams;
    select count(*) into v_deleted_campuses from campuses;

    delete from districts where true;
  end if;

  if p_reset_user_accounts then
    update admin_roles set granted_by = null where granted_by is not null;

    delete from auth.users where id <> auth.uid();
    get diagnostics v_deleted_user_accounts = row_count;
  end if;

  return jsonb_build_object(
    'reservations', v_deleted_reservations,
    'payments', v_deleted_payments,
    'campusTransfers', v_deleted_campus_transfers,
    'busAllocations', v_deleted_bus_allocations,
    'campusRequests', v_deleted_campus_requests,
    'campusRequestMessages', v_deleted_campus_request_messages,
    'stations', v_deleted_stations,
    'busOptions', v_deleted_bus_options,
    'appSettings', v_deleted_app_settings,
    'homeAnnouncements', v_deleted_home_announcements,
    'campusAdminRoles', v_deleted_campus_admin_roles,
    'organization', v_deleted_districts + v_deleted_teams + v_deleted_campuses,
    'userAccounts', v_deleted_user_accounts
  );
end;
$$;

revoke all on function reset_reservation_data(
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) from public;

grant execute on function reset_reservation_data(
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;

revoke all on function get_deletable_user_count() from public;
grant execute on function get_deletable_user_count() to authenticated;

notify pgrst, 'reload schema';
