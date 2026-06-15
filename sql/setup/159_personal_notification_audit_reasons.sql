-- Preserve the administrator-entered reason in personal notification audit logs.

drop function if exists public.bulk_send_personal_notifications(uuid[], text, text, text);
drop function if exists public.send_personal_notification(uuid, text, text, text);

create or replace function public.send_personal_notification(
  p_target_user_id uuid,
  p_title text,
  p_content text,
  p_category text default 'general',
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can send personal notifications.';
  end if;

  if nullif(btrim(p_title), '') is null or nullif(btrim(p_content), '') is null then
    raise exception 'Notification title and content are required.';
  end if;

  insert into public.personal_notifications (
    target_user_id, title, content, category, created_by
  )
  values (
    p_target_user_id,
    btrim(p_title),
    btrim(p_content),
    coalesce(nullif(btrim(p_category), ''), 'general'),
    auth.uid()
  )
  returning id into v_notification_id;

  perform public.record_personal_user_action(
    p_target_user_id,
    null,
    'notification_sent',
    coalesce(nullif(btrim(p_reason), ''), btrim(p_title))
  );

  return v_notification_id;
end;
$$;

create or replace function public.bulk_send_personal_notifications(
  p_target_user_ids uuid[],
  p_title text,
  p_content text,
  p_category text default 'admin',
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if coalesce(array_length(p_target_user_ids, 1), 0) > 100 then
    raise exception 'Bulk operation is limited to 100 users.';
  end if;

  foreach v_id in array coalesce(p_target_user_ids, array[]::uuid[]) loop
    perform public.send_personal_notification(
      v_id,
      p_title,
      p_content,
      p_category,
      p_reason
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.send_personal_notification(uuid, text, text, text, text) from public, anon;
revoke all on function public.bulk_send_personal_notifications(uuid[], text, text, text, text) from public, anon;
grant execute on function public.send_personal_notification(uuid, text, text, text, text) to authenticated;
grant execute on function public.bulk_send_personal_notifications(uuid[], text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
