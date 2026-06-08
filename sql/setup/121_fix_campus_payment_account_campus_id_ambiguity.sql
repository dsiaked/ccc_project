-- Avoid a PL/pgSQL output-column collision with the campus_id conflict target.

create or replace function public.upsert_campus_payment_account_as_global_admin(
  p_campus_id uuid,
  p_bank_name text,
  p_account_number text,
  p_account_holder text
)
returns table (
  campus_id uuid,
  bank_name text,
  account_number text,
  account_holder text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank_name text := trim(coalesce(p_bank_name, ''));
  v_account_number text := trim(coalesce(p_account_number, ''));
  v_account_holder text := trim(coalesce(p_account_holder, ''));
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can update campus payment accounts.';
  end if;

  if not exists (
    select 1 from public.campuses where id = p_campus_id and is_active = true
  ) then
    raise exception 'Active campus not found.';
  end if;

  if v_bank_name = '' or v_account_number = '' or v_account_holder = '' then
    raise exception 'Bank name, account number, and account holder are required.';
  end if;

  insert into public.campus_payment_accounts (
    campus_id, bank_name, account_number, account_holder, updated_at, updated_by
  )
  values (
    p_campus_id, v_bank_name, v_account_number, v_account_holder,
    clock_timestamp(), auth.uid()
  )
  on conflict on constraint campus_payment_accounts_pkey do update
  set bank_name = excluded.bank_name,
      account_number = excluded.account_number,
      account_holder = excluded.account_holder,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  return query
  select account.campus_id, account.bank_name, account.account_number,
    account.account_holder
  from public.campus_payment_accounts account
  where account.campus_id = p_campus_id;
end;
$$;

create or replace function public.upsert_campus_payment_account_as_admin(
  p_campus_id uuid,
  p_bank_name text,
  p_account_number text,
  p_account_holder text
)
returns table (
  campus_id uuid,
  bank_name text,
  account_number text,
  account_holder text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank_name text := trim(coalesce(p_bank_name, ''));
  v_account_number text := trim(coalesce(p_account_number, ''));
  v_account_holder text := trim(coalesce(p_account_holder, ''));
begin
  if not public.is_global_admin()
    and not exists (
      select 1
      from public.admin_roles admin_role
      where admin_role.user_id = auth.uid()
        and admin_role.role = 'campus_admin'
        and admin_role.campus_id = p_campus_id
    )
  then
    raise exception 'Only the matching campus admin or a global admin can update this payment account.';
  end if;

  if not exists (
    select 1 from public.campuses where id = p_campus_id and is_active = true
  ) then
    raise exception 'Active campus not found.';
  end if;

  if v_bank_name = '' or v_account_number = '' or v_account_holder = '' then
    raise exception 'Bank name, account number, and account holder are required.';
  end if;

  insert into public.campus_payment_accounts (
    campus_id, bank_name, account_number, account_holder, updated_at, updated_by
  )
  values (
    p_campus_id, v_bank_name, v_account_number, v_account_holder,
    clock_timestamp(), auth.uid()
  )
  on conflict on constraint campus_payment_accounts_pkey do update
  set bank_name = excluded.bank_name,
      account_number = excluded.account_number,
      account_holder = excluded.account_holder,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  return query
  select account.campus_id, account.bank_name, account.account_number,
    account.account_holder
  from public.campus_payment_accounts account
  where account.campus_id = p_campus_id;
end;
$$;

notify pgrst, 'reload schema';
