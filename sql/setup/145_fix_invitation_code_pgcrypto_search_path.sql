-- Make pgcrypto functions available to invitation-code RPCs on Supabase,
-- where the extension is installed in the extensions schema.

alter function public.validate_admin_invitation_codes(text[])
  set search_path = public, extensions;

alter function public.redeem_admin_invitation_codes_for_user(uuid, text[])
  set search_path = public, extensions;

alter function public.create_admin_invitation_code(text, uuid)
  set search_path = public, extensions;

notify pgrst, 'reload schema';
