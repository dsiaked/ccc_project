-- Prevent API clients from changing or deleting the initial request message.

create or replace function public.is_initial_campus_request_message(
  p_message_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campus_request_messages target
    where target.id = p_message_id
      and target.id = (
        select first_message.id
        from public.campus_request_messages first_message
        where first_message.request_id = target.request_id
        order by first_message.created_at, first_message.id
        limit 1
      )
  );
$$;

revoke all on function public.is_initial_campus_request_message(uuid)
from public, anon;
grant execute on function public.is_initial_campus_request_message(uuid)
to authenticated;

drop policy if exists "Initial campus request messages cannot be updated"
  on public.campus_request_messages;
create policy "Initial campus request messages cannot be updated"
on public.campus_request_messages
as restrictive
for update
to authenticated
using (not public.is_initial_campus_request_message(id))
with check (not public.is_initial_campus_request_message(id));

drop policy if exists "Initial campus request messages cannot be deleted"
  on public.campus_request_messages;
create policy "Initial campus request messages cannot be deleted"
on public.campus_request_messages
as restrictive
for delete
to authenticated
using (not public.is_initial_campus_request_message(id));

notify pgrst, 'reload schema';
