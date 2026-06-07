-- =========================================================
-- Payments RPC-only writes
-- Run after all payment write RPCs.
-- =========================================================

-- Keep direct table writes closed even if a broad table grant exists.
drop policy if exists "Users can insert own payments" on public.payments;
drop policy if exists "Campus admins can update campus payments" on public.payments;
drop policy if exists "Global admins can update all payments" on public.payments;

revoke insert, update, delete on table public.payments from public, anon, authenticated;

notify pgrst, 'reload schema';
