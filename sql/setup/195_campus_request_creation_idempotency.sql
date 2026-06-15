-- Prevent duplicate campus requests caused by same-tick submits or network retries.

create index if not exists idx_campus_requests_creator_recent
  on public.campus_requests(created_by, created_at desc)
  where is_global_notice = false;

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
  v_title text := btrim(coalesce(p_title, ''));
  v_content text := btrim(coalesce(p_content, ''));
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
  if v_title = '' or v_content = '' then
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

  perform pg_advisory_xact_lock(
    hashtextextended('campus-request-create:' || v_actor_id::text, 0)
  );

  select request.*
  into v_request
  from public.campus_requests request
  where request.created_by = v_actor_id
    and request.is_global_notice = false
    and request.type = p_type
    and request.title = v_title
    and request.content = v_content
    and request.district = p_district
    and request.team = p_team
    and request.campus = p_campus
    and request.created_at >= clock_timestamp() - interval '30 seconds'
  order by request.created_at desc, request.id desc
  limit 1;

  if v_request.id is not null then
    select message.*
    into v_message
    from public.campus_request_messages message
    where message.request_id = v_request.id
      and message.sender_role = 'campus_admin'
    order by message.created_at, message.id
    limit 1;

    return jsonb_build_object(
      'request', to_jsonb(v_request),
      'message', case when v_message.id is null then null else to_jsonb(v_message) end
    );
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
    v_title,
    v_content,
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
    v_content
  )
  returning * into v_message;

  return jsonb_build_object(
    'request', to_jsonb(v_request),
    'message', to_jsonb(v_message)
  );
end;
$$;

revoke all on function public.create_campus_request_with_message(
  text, text, text, text, text, text
) from public, anon;
grant execute on function public.create_campus_request_with_message(
  text, text, text, text, text, text
) to authenticated;

notify pgrst, 'reload schema';
