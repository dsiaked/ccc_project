-- =========================================================
-- Fix campus transfer confirmation amount column
-- Run this in Supabase SQL Editor if confirming a campus transfer fails with:
-- "Could not find the 'actual_confirmed_amount' column of 'campus_transfers'
-- in the schema cache"
-- =========================================================

alter table campus_transfers
  add column if not exists actual_confirmed_amount integer;

alter table campus_transfers
  add column if not exists confirmed_by uuid references auth.users(id);

alter table campus_transfers
  add column if not exists confirmed_at timestamptz;

alter table campus_transfers
  add column if not exists updated_at timestamptz not null default now();

-- Ask Supabase/PostgREST to refresh its schema cache immediately.
notify pgrst, 'reload schema';

select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'campus_transfers'
  and column_name in (
    'actual_confirmed_amount',
    'confirmed_by',
    'confirmed_at',
    'updated_at'
  )
order by column_name;
