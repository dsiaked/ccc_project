-- Allow authenticated users to permanently delete only their own personal inquiries.

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
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  delete from public.personal_inquiries
  where id = p_inquiry_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Personal inquiry not found or inaccessible.';
  end if;

  return true;
end;
$$;

revoke all on function public.delete_my_personal_inquiry(uuid)
  from public, anon;
grant execute on function public.delete_my_personal_inquiry(uuid)
  to authenticated;

notify pgrst, 'reload schema';
