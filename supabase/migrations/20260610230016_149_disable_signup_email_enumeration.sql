-- Email existence is sensitive authentication data. Signup clients must not
-- receive a different response based on whether an account already exists.
revoke all on function public.email_exists(text) from public, anon, authenticated;

notify pgrst, 'reload schema';
