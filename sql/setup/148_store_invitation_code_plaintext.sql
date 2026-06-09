-- Keep newly issued invitation-code plaintext visible to global administrators.
-- Existing codes remain masked because their plaintext cannot be recovered.

alter table public.admin_invitation_codes
  add column if not exists code text;

create or replace function public.create_admin_invitation_code(
  p_role text,
  p_campus_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raw text := upper(encode(gen_random_bytes(12), 'hex'));
  v_code text;
  v_invitation public.admin_invitation_codes%rowtype;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create invitation codes.';
  end if;
  if p_role not in ('campus_admin', 'boarding_manager') then
    raise exception 'Unsupported invitation role.';
  end if;
  if p_role = 'campus_admin' and p_campus_id is null then
    raise exception 'Campus administrator invitations require a campus.';
  end if;
  if p_role = 'boarding_manager' and p_campus_id is not null then
    raise exception 'Boarding manager invitations cannot have a campus.';
  end if;
  if p_role = 'campus_admin' and not exists (
    select 1 from public.campuses where id = p_campus_id
  ) then
    raise exception 'Campus was not found.';
  end if;
  if p_role = 'campus_admin' then
    perform pg_advisory_xact_lock(
      hashtextextended('admin-invitation-campus:' || p_campus_id::text, 0)
    );
  end if;
  if p_role = 'campus_admin' and exists (
    select 1 from public.admin_roles role
    where role.role = 'campus_admin' and role.campus_id = p_campus_id
  ) then
    raise exception 'This campus already has an active campus administrator.';
  end if;
  if p_role = 'campus_admin' and exists (
    select 1 from public.admin_invitation_codes invitation
    where invitation.role = 'campus_admin'
      and invitation.campus_id = p_campus_id
      and invitation.used_at is null
      and invitation.cancelled_at is null
      and invitation.expires_at > clock_timestamp()
  ) then
    raise exception 'This campus already has an active invitation code.';
  end if;

  v_code := concat(
    substr(v_raw, 1, 6), '-',
    substr(v_raw, 7, 6), '-',
    substr(v_raw, 13, 6), '-',
    substr(v_raw, 19, 6)
  );

  insert into public.admin_invitation_codes (
    code_hash, code, code_hint, role, campus_id, created_by
  )
  values (
    digest(v_raw, 'sha256'),
    v_code,
    concat(substr(v_raw, 1, 4), '-****-', substr(v_raw, 21, 4)),
    p_role,
    p_campus_id,
    auth.uid()
  )
  returning * into v_invitation;

  return jsonb_build_object(
    'id', v_invitation.id,
    'code', v_code,
    'expiresAt', v_invitation.expires_at
  );
end;
$$;

revoke all on function public.create_admin_invitation_code(text, uuid)
  from public, anon;
grant execute on function public.create_admin_invitation_code(text, uuid)
  to authenticated;

notify pgrst, 'reload schema';
