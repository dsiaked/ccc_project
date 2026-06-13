-- Add public.personal_notifications to supabase_realtime publication to enable real-time sync of notification deletions
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'personal_notifications'
  ) then
    alter publication supabase_realtime add table public.personal_notifications;
  end if;
end;
$$;

-- Redefine functions with safer notification matching using left() instead of like
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

  -- Delete associated notifications (matched by target user, category, and title prefix using left())
  delete from public.personal_notifications
  where target_user_id = v_inquiry.user_id
    and category = 'inquiry'
    and left(content, length(v_inquiry.title)) = v_inquiry.title;

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

  -- Delete associated notifications (matched by target user, category, and title prefix using left())
  delete from public.personal_notifications
  where target_user_id = v_user_id
    and category = 'inquiry'
    and left(content, length(v_inquiry.title)) = v_inquiry.title;

  return true;
end;
$$;
