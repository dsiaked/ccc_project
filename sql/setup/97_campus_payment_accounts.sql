-- =========================================================
-- Campus-specific payment accounts shown to bus applicants
-- =========================================================

create table if not exists public.campus_payment_accounts (
  campus_id uuid primary key references public.campuses(id) on delete cascade,
  bank_name text not null default '',
  account_number text not null default '',
  account_holder text not null default '',
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.campus_payment_accounts enable row level security;

revoke all on table public.campus_payment_accounts
  from public, anon, authenticated;

create or replace function public.get_campus_payment_account(p_campus_id uuid)
returns table (
  campus_id uuid,
  bank_name text,
  account_number text,
  account_holder text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  return query
  select account.campus_id, account.bank_name, account.account_number,
    account.account_holder
  from public.campus_payment_accounts account
  join public.campuses campus on campus.id = account.campus_id
  where account.campus_id = p_campus_id
    and campus.is_active = true;
end;
$$;

create or replace function public.get_all_campus_payment_accounts()
returns table (
  campus_id uuid,
  bank_name text,
  account_number text,
  account_holder text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view all campus payment accounts.';
  end if;

  return query
  select account.campus_id, account.bank_name, account.account_number,
    account.account_holder
  from public.campus_payment_accounts account;
end;
$$;

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

revoke all on function public.get_campus_payment_account(uuid) from public, anon;
revoke all on function public.get_all_campus_payment_accounts() from public, anon;
revoke all on function public.upsert_campus_payment_account_as_global_admin(
  uuid, text, text, text
) from public, anon;

grant execute on function public.get_campus_payment_account(uuid) to authenticated;
grant execute on function public.get_all_campus_payment_accounts() to authenticated;
grant execute on function public.upsert_campus_payment_account_as_global_admin(
  uuid, text, text, text
) to authenticated;

notify pgrst, 'reload schema';
