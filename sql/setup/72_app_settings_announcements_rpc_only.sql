-- =========================================================
-- App settings and home announcements RPC-only writes
-- =========================================================

create or replace function public.update_app_setting_as_global_admin(
  p_key text,
  p_value jsonb
)
returns public.app_settings
language plpgsql security definer set search_path = public
as $$
declare v_row public.app_settings;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update app settings.'; end if;
  if p_key not in (
    'first_reservation_deadline',
    'seoul_district_transfer_account',
    'participation_targets',
    'global_scenario_checklist',
    'simulation_enabled'
  ) then raise exception 'Setting key is not editable through this RPC.'; end if;
  if jsonb_typeof(p_value) <> 'object' then raise exception 'Setting value must be a JSON object.'; end if;

  if p_key = 'first_reservation_deadline'
    and p_value ->> 'deadline_at' is not null then
    perform (p_value ->> 'deadline_at')::timestamptz;
  elsif p_key = 'seoul_district_transfer_account'
    and jsonb_typeof(p_value -> 'account_number') <> 'string' then
    raise exception 'Account number must be a string.';
  elsif p_key = 'participation_targets'
    and (jsonb_typeof(p_value -> 'rows') <> 'array' or jsonb_typeof(p_value -> 'targets') <> 'object') then
    raise exception 'Invalid participation targets.';
  elsif p_key = 'global_scenario_checklist'
    and jsonb_typeof(p_value -> 'checked_step_ids') <> 'array' then
    raise exception 'Invalid scenario checklist.';
  elsif p_key = 'simulation_enabled'
    and jsonb_typeof(p_value -> 'enabled') <> 'boolean' then
    raise exception 'Simulation enabled must be boolean.';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.create_home_announcement_as_global_admin(
  p_title text,
  p_content text
)
returns public.home_announcements
language plpgsql security definer set search_path = public
as $$
declare v_row public.home_announcements;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can create home announcements.'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Announcement title is required.'; end if;
  if nullif(trim(p_content), '') is null then raise exception 'Announcement content is required.'; end if;

  insert into public.home_announcements (title, content, created_by, is_published)
  values (trim(p_title), trim(p_content), auth.uid(), true)
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.update_app_setting_as_global_admin(text, jsonb) from public, anon;
revoke all on function public.create_home_announcement_as_global_admin(text, text) from public, anon;
grant execute on function public.update_app_setting_as_global_admin(text, jsonb) to authenticated;
grant execute on function public.create_home_announcement_as_global_admin(text, text) to authenticated;

drop policy if exists "Global admins can manage app settings" on public.app_settings;
drop policy if exists "Global admins can manage home announcements" on public.home_announcements;
revoke insert, update, delete on table public.app_settings, public.home_announcements from public, anon, authenticated;

notify pgrst, 'reload schema';
