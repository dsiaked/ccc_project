-- =========================================================
-- Reservations RPC-only writes
-- Run after all reservation write RPCs.
-- =========================================================

-- Keep direct table writes closed even if a broad table grant exists.
drop policy if exists "Users can insert own reservations" on public.reservations;
drop policy if exists "Users can update own reservations" on public.reservations;
drop policy if exists "Users can delete own reservations" on public.reservations;
drop policy if exists "Global admins can update reservations" on public.reservations;

revoke insert, update, delete on table public.reservations from public, anon, authenticated;

notify pgrst, 'reload schema';
