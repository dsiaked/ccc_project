-- Allow large confirmed allocation cancellations to finish before PostgreSQL cancels them.

alter function public.cancel_confirmed_allocation_workspace(
  uuid, bigint, jsonb, integer, integer
) set statement_timeout = '5min';

alter function public.cancel_confirmed_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) set statement_timeout = '5min';

notify pgrst, 'reload schema';
