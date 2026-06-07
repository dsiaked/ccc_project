-- =========================================================
-- Atomic campus request creation and global-admin responses
-- =========================================================

create or replace function public.create_campus_request_with_message(
  p_type text,
  p_title text,
  p_content text,
  p_district text,
  p_team text,
  p_campus text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role public.admin_roles%rowtype;
  v_request public.campus_requests%rowtype;
  v_message public.campus_request_messages%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.';
  end if;
  if p_type not in (
    'late_signup',
    'cancel_refund',
    'payment_issue',
    'roster_change',
    'transfer_issue',
    'etc'
  ) then
    raise exception 'Campus request type is invalid.';
  end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_content), '') is null then
    raise exception 'Campus request title and content are required.';
  end if;

  select admin_role.*
  into v_role
  from public.admin_roles admin_role
  where admin_role.user_id = v_actor_id
    and admin_role.role = 'campus_admin'
    and admin_role.district = p_district
    and admin_role.team = p_team
    and admin_role.campus = p_campus
  limit 1;

  if v_role.id is null then
    raise exception 'Only the matching campus administrator can create this request.';
  end if;

  insert into public.campus_requests (
    type,
    status,
    title,
    content,
    is_global_notice,
    district_id,
    team_id,
    campus_id,
    district,
    team,
    campus,
    created_by
  )
  values (
    p_type,
    'open',
    btrim(p_title),
    btrim(p_content),
    false,
    v_role.district_id,
    v_role.team_id,
    v_role.campus_id,
    p_district,
    p_team,
    p_campus,
    v_actor_id
  )
  returning * into v_request;

  insert into public.campus_request_messages (
    request_id,
    sender_id,
    sender_role,
    message
  )
  values (
    v_request.id,
    v_actor_id,
    'campus_admin',
    btrim(p_content)
  )
  returning * into v_message;

  return jsonb_build_object(
    'request', to_jsonb(v_request),
    'message', to_jsonb(v_message)
  );
end;
$$;

create or replace function public.update_campus_request_status_with_response(
  p_request_id uuid,
  p_status text,
  p_admin_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_previous_response text;
  v_response text := nullif(btrim(coalesce(p_admin_response, '')), '');
  v_request public.campus_requests%rowtype;
  v_message public.campus_request_messages%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.';
  end if;
  if not public.is_global_admin() then
    raise exception 'Only global administrators can process campus requests.';
  end if;
  if p_status not in ('open', 'in_progress', 'resolved', 'on_hold') then
    raise exception 'Campus request status is invalid.';
  end if;

  select request.admin_response
  into v_previous_response
  from public.campus_requests request
  where request.id = p_request_id
    and request.is_global_notice = false
  for update;

  if not found then
    raise exception 'Campus request not found.';
  end if;
  if p_status = 'resolved'
    and v_response is null
    and not exists (
      select 1
      from public.campus_request_messages message
      where message.request_id = p_request_id
        and message.sender_role = 'global_admin'
    )
  then
    raise exception 'A global administrator response is required before resolving a request.';
  end if;

  update public.campus_requests
  set
    status = p_status,
    admin_response = v_response,
    handled_by = v_actor_id,
    handled_at = case when p_status = 'resolved' then clock_timestamp() else null end,
    updated_at = clock_timestamp()
  where id = p_request_id
  returning * into v_request;

  if v_request.status is distinct from p_status then
    raise exception 'Campus request status update failed.';
  end if;

  if v_response is not null
    and v_response is distinct from nullif(btrim(coalesce(v_previous_response, '')), '')
  then
    insert into public.campus_request_messages (
      request_id,
      sender_id,
      sender_role,
      message
    )
    values (
      p_request_id,
      v_actor_id,
      'global_admin',
      v_response
    )
    returning * into v_message;
  end if;

  return jsonb_build_object(
    'request', to_jsonb(v_request),
    'message', case when v_message.id is null then null else to_jsonb(v_message) end
  );
end;
$$;

revoke all on function public.create_campus_request_with_message(
  text, text, text, text, text, text
) from public, anon;
revoke all on function public.update_campus_request_status_with_response(
  uuid, text, text
) from public, anon;

grant execute on function public.create_campus_request_with_message(
  text, text, text, text, text, text
) to authenticated;
grant execute on function public.update_campus_request_status_with_response(
  uuid, text, text
) to authenticated;

notify pgrst, 'reload schema';
