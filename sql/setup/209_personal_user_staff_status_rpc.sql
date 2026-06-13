-- Create staff status update function
create or replace function public.update_personal_user_staff_status(
  p_target_user_id uuid,
  p_is_staff boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_id text;
  v_before jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can update staff status.';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required.';
  end if;

  select subject_id into v_subject_id
  from public.ccc_summer_user_links
  where user_id = p_target_user_id;

  v_before := jsonb_build_object(
    'is_staff', coalesce(
      (select is_staff from public.ccc_summer_user_links where user_id = p_target_user_id),
      false
    )
  );

  if v_subject_id is not null then
    update public.ccc_summer_user_links
    set is_staff = p_is_staff,
        last_synced_at = clock_timestamp()
    where user_id = p_target_user_id;
  else
    insert into public.ccc_summer_user_links (subject_id, user_id, is_staff)
    values ('manual-' || p_target_user_id::text, p_target_user_id, p_is_staff)
    on conflict (subject_id) do update
    set is_staff = p_is_staff,
        last_synced_at = clock_timestamp();
  end if;

  -- Log action
  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason, before_data, after_data, reversible
  )
  values (
    p_target_user_id, null, auth.uid(), 'staff_status_updated', btrim(p_reason),
    v_before,
    jsonb_build_object('is_staff', p_is_staff),
    true
  );
end;
$$;

revoke all on function public.update_personal_user_staff_status(uuid, boolean, text) from public, anon;
grant execute on function public.update_personal_user_staff_status(uuid, boolean, text) to authenticated;
