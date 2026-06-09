-- Allow global administrators to issue several one-time invitation codes atomically.

create or replace function public.create_admin_invitation_codes(
  p_role text,
  p_campus_id uuid default null,
  p_count integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_index integer;
  v_created jsonb;
  v_invitations jsonb := '[]'::jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create invitation codes.';
  end if;
  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'Between 1 and 50 invitation codes can be created at once.';
  end if;
  if p_role = 'campus_admin' and p_count <> 1 then
    raise exception 'Only one campus administrator invitation can be active per campus.';
  end if;

  for v_index in 1..p_count loop
    v_created := public.create_admin_invitation_code(p_role, p_campus_id);
    v_invitations := v_invitations || jsonb_build_array(v_created);
  end loop;

  return v_invitations;
end;
$$;

revoke all on function public.create_admin_invitation_codes(text, uuid, integer)
  from public, anon;
grant execute on function public.create_admin_invitation_codes(text, uuid, integer)
  to authenticated;

notify pgrst, 'reload schema';
