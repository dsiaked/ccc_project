-- Avoid writing message audit rows while their parent request is being deleted.

create or replace function public.audit_campus_request_message_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.message is distinct from old.message then
    insert into public.campus_request_audit_logs (
      request_id, message_id, actor_id, action, before_data, after_data
    )
    values (
      old.request_id, old.id, auth.uid(), 'message_updated',
      jsonb_build_object('message', old.message),
      jsonb_build_object('message', new.message)
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    if exists (
      select 1
      from public.campus_requests request
      where request.id = old.request_id
    ) then
      insert into public.campus_request_audit_logs (
        request_id, message_id, actor_id, action, before_data
      )
      values (
        old.request_id, old.id, auth.uid(), 'message_deleted',
        jsonb_build_object(
          'sender_id', old.sender_id,
          'sender_role', old.sender_role,
          'message', old.message,
          'created_at', old.created_at
        )
      );
    end if;
    return old;
  end if;

  return null;
end;
$$;

notify pgrst, 'reload schema';
