-- Confirm campus transfer amount through a security definer RPC.
-- Run this in Supabase SQL Editor after the base campus transfer setup.

create or replace function confirm_campus_transfer_amount(
  p_transfer_id uuid,
  p_confirmed_by uuid,
  p_actual_confirmed_amount integer
)
returns campus_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer campus_transfers;
begin
  update campus_transfers
  set
    status = 'confirmed',
    confirmed_by = p_confirmed_by,
    confirmed_at = now(),
    actual_confirmed_amount = greatest(
      coalesce(p_actual_confirmed_amount, 0),
      0
    ),
    updated_at = now()
  where id = p_transfer_id
  returning * into v_transfer;

  if v_transfer.id is null then
    raise exception 'campus transfer not found: %', p_transfer_id;
  end if;

  return v_transfer;
end;
$$;

-- Ask Supabase/PostgREST to refresh its schema cache immediately.
notify pgrst, 'reload schema';
