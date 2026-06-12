-- Allow global administrators to permanently delete inquiries from the unified inbox.

create or replace function public.delete_campus_request_as_global_admin(
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global administrators can delete campus inquiries.';
  end if;

  delete from public.campus_requests
  where id = p_request_id
    and is_global_notice = false;

  if not found then
    raise exception 'Campus inquiry not found.';
  end if;

  return true;
end;
$$;

create or replace function public.delete_personal_inquiry_as_global_admin(
  p_inquiry_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global administrators can delete personal inquiries.';
  end if;

  delete from public.personal_inquiries
  where id = p_inquiry_id;

  if not found then
    raise exception 'Personal inquiry not found.';
  end if;

  return true;
end;
$$;

revoke all on function public.delete_campus_request_as_global_admin(uuid)
  from public, anon;
revoke all on function public.delete_personal_inquiry_as_global_admin(uuid)
  from public, anon;

grant execute on function public.delete_campus_request_as_global_admin(uuid)
  to authenticated;
grant execute on function public.delete_personal_inquiry_as_global_admin(uuid)
  to authenticated;

notify pgrst, 'reload schema';
