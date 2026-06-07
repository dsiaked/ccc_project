-- =========================================================
-- Admin roles RPC-only writes
-- Run after organization setup and admin role RLS fixes.
-- =========================================================

create or replace function public.assign_campus_admin_as_global_admin(
  p_user_id uuid,
  p_district text,
  p_team text,
  p_campus text
)
returns public.admin_roles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.admin_roles;
  v_district_id uuid;
  v_team_id uuid;
  v_campus_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can assign campus admins.';
  end if;

  if p_user_id is null then
    raise exception 'A user ID is required.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found.';
  end if;

  select district_id, team_id, campus_id
  into v_district_id, v_team_id, v_campus_id
  from public.campus_options
  where district = nullif(trim(p_district), '')
    and team = nullif(trim(p_team), '')
    and campus = nullif(trim(p_campus), '')
  limit 1;

  if v_campus_id is null then
    raise exception 'Active campus scope not found.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'admin_roles:campus:' || v_district_id::text || ':' || v_team_id::text || ':' || v_campus_id::text,
      0
    )
  );

  delete from public.admin_roles
  where role = 'campus_admin'
    and district_id = v_district_id
    and team_id = v_team_id
    and campus_id = v_campus_id;

  insert into public.admin_roles (
    user_id,
    role,
    district,
    team,
    campus,
    district_id,
    team_id,
    campus_id,
    granted_by,
    updated_at
  )
  values (
    p_user_id,
    'campus_admin',
    trim(p_district),
    trim(p_team),
    trim(p_campus),
    v_district_id,
    v_team_id,
    v_campus_id,
    auth.uid(),
    now()
  )
  returning * into v_role;

  return v_role;
end;
$$;

create or replace function public.cancel_campus_admin_as_global_admin(
  p_admin_role_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can cancel campus admins.';
  end if;

  if p_admin_role_id is null then
    raise exception 'An admin role ID is required.';
  end if;

  delete from public.admin_roles
  where id = p_admin_role_id
    and role = 'campus_admin'
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Campus admin role not found.';
  end if;

  return true;
end;
$$;

revoke all on function public.assign_campus_admin_as_global_admin(uuid, text, text, text)
  from public, anon;
grant execute on function public.assign_campus_admin_as_global_admin(uuid, text, text, text)
  to authenticated;

revoke all on function public.cancel_campus_admin_as_global_admin(uuid)
  from public, anon;
grant execute on function public.cancel_campus_admin_as_global_admin(uuid)
  to authenticated;

drop policy if exists "Global admins can manage admin roles" on public.admin_roles;
revoke insert, update, delete on table public.admin_roles from public, anon, authenticated;

notify pgrst, 'reload schema';
