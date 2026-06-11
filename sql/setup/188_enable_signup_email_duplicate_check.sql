-- Signup step 1 explicitly checks whether an email is already registered.
grant execute on function public.email_exists(text) to anon, authenticated;

notify pgrst, 'reload schema';
