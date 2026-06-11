-- Return committed personal inquiry mutations when clients retry after a lost response.

create index if not exists idx_personal_inquiries_user_recent
  on public.personal_inquiries(user_id, created_at desc);

create index if not exists idx_personal_inquiry_messages_sender_recent
  on public.personal_inquiry_messages(inquiry_id, sender_id, created_at desc);

create or replace function public.create_personal_inquiry(
  p_category text,
  p_title text,
  p_content text
)
returns public.personal_inquiries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_content text := btrim(coalesce(p_content, ''));
  v_inquiry public.personal_inquiries;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_category not in ('reservation', 'payment', 'ticket', 'boarding', 'etc') then
    raise exception 'Personal inquiry category is invalid.';
  end if;
  if v_title = '' or v_content = '' then
    raise exception 'Personal inquiry title and content are required.';
  end if;
  if length(v_title) > 100 or length(v_content) > 2000 then
    raise exception 'Personal inquiry is too long.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('personal-inquiry:' || v_user_id::text, 0));

  select inquiry.*
  into v_inquiry
  from public.personal_inquiries inquiry
  where inquiry.user_id = v_user_id
    and inquiry.category = p_category
    and inquiry.title = v_title
    and inquiry.content = v_content
    and inquiry.created_at > clock_timestamp() - interval '60 seconds'
  order by inquiry.created_at desc, inquiry.id desc
  limit 1;

  if v_inquiry.id is not null then
    return v_inquiry;
  end if;

  if (
    select count(*)
    from public.personal_inquiries inquiry
    where inquiry.user_id = v_user_id and inquiry.status <> 'resolved'
  ) >= 3 then
    raise exception 'Resolve an existing inquiry before creating another one.';
  end if;
  if exists (
    select 1
    from public.personal_inquiries inquiry
    where inquiry.user_id = v_user_id
      and inquiry.created_at > clock_timestamp() - interval '60 seconds'
  ) then
    raise exception 'Please wait before creating another inquiry.';
  end if;

  insert into public.personal_inquiries (user_id, category, title, content)
  values (v_user_id, p_category, v_title, v_content)
  returning * into v_inquiry;

  insert into public.personal_inquiry_messages (
    inquiry_id, sender_id, sender_role, message
  )
  values (v_inquiry.id, v_user_id, 'user', v_content);

  return v_inquiry;
end;
$$;

create or replace function public.add_personal_inquiry_message(
  p_inquiry_id uuid,
  p_message text
)
returns public.personal_inquiry_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_global_admin boolean := public.is_global_admin();
  v_message_text text := btrim(coalesce(p_message, ''));
  v_inquiry public.personal_inquiries;
  v_message public.personal_inquiry_messages;
begin
  if v_actor_id is null then raise exception 'Authentication is required.'; end if;
  if v_message_text = '' or length(v_message_text) > 2000 then
    raise exception 'Personal inquiry message is invalid.';
  end if;

  select * into v_inquiry
  from public.personal_inquiries
  where id = p_inquiry_id
  for update;
  if not found or (not v_is_global_admin and v_inquiry.user_id <> v_actor_id) then
    raise exception 'Personal inquiry not found or inaccessible.';
  end if;

  select message.*
  into v_message
  from public.personal_inquiry_messages message
  where message.inquiry_id = p_inquiry_id
    and message.sender_id = v_actor_id
    and message.sender_role = case when v_is_global_admin then 'global_admin' else 'user' end
    and message.message = v_message_text
    and message.created_at > clock_timestamp() - interval '30 seconds'
  order by message.created_at desc, message.id desc
  limit 1;

  if v_message.id is not null then
    return v_message;
  end if;

  insert into public.personal_inquiry_messages (
    inquiry_id, sender_id, sender_role, message
  )
  values (
    p_inquiry_id,
    v_actor_id,
    case when v_is_global_admin then 'global_admin' else 'user' end,
    v_message_text
  )
  returning * into v_message;

  if v_is_global_admin then
    update public.personal_inquiries
    set
      admin_response = v_message_text,
      handled_by = v_actor_id,
      updated_at = clock_timestamp()
    where id = p_inquiry_id;

    insert into public.personal_notifications (
      target_user_id, category, title, content, created_by
    )
    values (
      v_inquiry.user_id,
      'inquiry',
      '문의 답변이 등록되었습니다.',
      v_inquiry.title || E'\n\n' || v_message_text || E'\n\n개인 문의 내역에서 확인하세요.',
      v_actor_id
    );
  else
    update public.personal_inquiries
    set status = 'open', handled_at = null, updated_at = clock_timestamp()
    where id = p_inquiry_id;
  end if;

  return v_message;
end;
$$;

revoke all on function public.create_personal_inquiry(text, text, text)
  from public, anon;
revoke all on function public.add_personal_inquiry_message(uuid, text)
  from public, anon;
grant execute on function public.create_personal_inquiry(text, text, text)
  to authenticated;
grant execute on function public.add_personal_inquiry_message(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
