-- Run this patch in the Supabase SQL Editor for the project used by the app.
-- Current app project: pjbvxoesgwhbxfsfjliw

create or replace function public.email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users
    where lower(auth.users.email) = lower(trim(p_email))
  );
$$;

revoke all on function public.email_exists(text) from public;
grant execute on function public.email_exists(text) to anon, authenticated;

notify pgrst, 'reload schema';
