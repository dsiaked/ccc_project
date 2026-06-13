-- Allow global administrators and users to permanently delete inquiries while also cleaning up their in-app notifications.

create or replace function public.delete_personal_inquiry_as_global_admin(
  p_inquiry_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.personal_inquiries;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global administrators can delete personal inquiries.';
  end if;

  select * into v_inquiry
  from public.personal_inquiries
  where id = p_inquiry_id;

  if not found then
    raise exception 'Personal inquiry not found.';
  end if;

  delete from public.personal_inquiries
  where id = p_inquiry_id;

  -- Delete associated notifications (matched by target user, category, and title prefix in content)
  delete from public.personal_notifications
  where target_user_id = v_inquiry.user_id
    and category = 'inquiry'
    and content like (v_inquiry.title || '%');

  return true;
end;
$$;

create or replace function public.delete_my_personal_inquiry(
  p_inquiry_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_inquiry public.personal_inquiries;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into v_inquiry
  from public.personal_inquiries
  where id = p_inquiry_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Personal inquiry not found or inaccessible.';
  end if;

  delete from public.personal_inquiries
  where id = p_inquiry_id
    and user_id = v_user_id;

  -- Delete associated notifications (matched by target user, category, and title prefix in content)
  delete from public.personal_notifications
  where target_user_id = v_user_id
    and category = 'inquiry'
    and content like (v_inquiry.title || '%');

  return true;
end;
$$;
