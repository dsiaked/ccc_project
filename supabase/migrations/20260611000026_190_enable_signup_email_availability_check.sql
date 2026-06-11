-- Signup explicitly checks whether an email is already registered before
-- collecting the user's remaining personal information.
grant execute on function public.email_exists(text) to anon, authenticated;

notify pgrst, 'reload schema';
