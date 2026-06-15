-- Issue one campus administrator invitation code for every campus that still needs one.

create or replace function public.create_all_campus_admin_invitation_codes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campus record;
  v_created jsonb;
  v_invitations jsonb := '[]'::jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create invitation codes.';
  end if;

  for v_campus in
    select distinct
      campus_option.campus_id,
      campus_option.district,
      campus_option.team,
      campus_option.campus
    from public.campus_options campus_option
    where not exists (
      select 1
      from public.admin_roles role
      where role.role = 'campus_admin'
        and role.campus_id = campus_option.campus_id
    )
      and not exists (
        select 1
        from public.admin_invitation_codes invitation
        where invitation.role = 'campus_admin'
          and invitation.campus_id = campus_option.campus_id
          and invitation.used_at is null
          and invitation.cancelled_at is null
          and invitation.expires_at > clock_timestamp()
      )
    order by
      campus_option.district,
      campus_option.team,
      campus_option.campus,
      campus_option.campus_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('admin-invitation-campus:' || v_campus.campus_id::text, 0)
    );

    if exists (
      select 1
      from public.admin_roles role
      where role.role = 'campus_admin'
        and role.campus_id = v_campus.campus_id
    ) or exists (
      select 1
      from public.admin_invitation_codes invitation
      where invitation.role = 'campus_admin'
        and invitation.campus_id = v_campus.campus_id
        and invitation.used_at is null
        and invitation.cancelled_at is null
        and invitation.expires_at > clock_timestamp()
    ) then
      continue;
    end if;

    v_created := public.create_admin_invitation_code(
      'campus_admin',
      v_campus.campus_id
    );
    v_invitations := v_invitations || jsonb_build_array(
      v_created || jsonb_build_object('campusId', v_campus.campus_id)
    );
  end loop;

  return v_invitations;
end;
$$;

revoke all on function public.create_all_campus_admin_invitation_codes()
  from public, anon;
grant execute on function public.create_all_campus_admin_invitation_codes()
  to authenticated;

notify pgrst, 'reload schema';
