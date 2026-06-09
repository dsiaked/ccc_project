-- Allow large allocation confirmations to finish before PostgreSQL cancels them.

alter function public.validate_allocation_workspace_confirmation_v2(
  uuid, jsonb
) set statement_timeout = '5min';

alter function public.save_confirmed_allocation_workspace_v3(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) set statement_timeout = '5min';

notify pgrst, 'reload schema';
