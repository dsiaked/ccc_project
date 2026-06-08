import { supabase } from './supabase';

export interface CampusPaymentAccount {
  campusId: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

interface CampusPaymentAccountRow {
  campus_id: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
}

const mapAccount = (row: CampusPaymentAccountRow): CampusPaymentAccount => ({
  campusId: row.campus_id,
  bankName: row.bank_name,
  accountNumber: row.account_number,
  accountHolder: row.account_holder,
});

export async function getCampusPaymentAccount(
  campusId: string
): Promise<CampusPaymentAccount | null> {
  const { data, error } = await supabase.rpc('get_campus_payment_account', {
    p_campus_id: campusId,
  });

  if (error) throw error;

  const row = (data as CampusPaymentAccountRow[] | null)?.[0];
  return row ? mapAccount(row) : null;
}

export async function getAllCampusPaymentAccounts(): Promise<
  CampusPaymentAccount[]
> {
  const { data, error } = await supabase.rpc('get_all_campus_payment_accounts');

  if (error) throw error;

  return ((data ?? []) as CampusPaymentAccountRow[]).map(mapAccount);
}

export async function updateCampusPaymentAccount(
  account: CampusPaymentAccount
): Promise<CampusPaymentAccount> {
  const { data, error } = await supabase.rpc(
    'upsert_campus_payment_account_as_admin',
    {
      p_campus_id: account.campusId,
      p_bank_name: account.bankName,
      p_account_number: account.accountNumber,
      p_account_holder: account.accountHolder,
    }
  );

  if (error) throw error;

  const row = (data as CampusPaymentAccountRow[] | null)?.[0];
  if (!row) throw new Error('캠퍼스 입금 계좌 저장 결과를 확인할 수 없습니다.');

  return mapAccount(row);
}
