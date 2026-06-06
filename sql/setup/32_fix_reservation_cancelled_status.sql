-- =========================================================
-- Fix reservations status constraint for applicant cancellation
-- Run this in Supabase SQL Editor if cancelling an applicant fails.
--
-- The personal bus ticket admin page uses:
-- - requested
-- - confirmed
-- - cancelled
--
-- Older databases may still have a reservations.status check constraint
-- that does not include cancelled.
-- =========================================================

alter table reservations
  drop constraint if exists reservations_status_check;

alter table reservations
  add constraint reservations_status_check
  check (status in ('requested', 'confirmed', 'cancelled'));

-- Ask Supabase/PostgREST to refresh its schema cache immediately.
notify pgrst, 'reload schema';

select
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.reservations'::regclass
  and conname = 'reservations_status_check';
