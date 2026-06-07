import { supabase } from './supabase';

const DISTRICT_TRANSFER_ACCOUNT_KEY = 'seoul_district_transfer_account';

interface DistrictTransferAccountSettingRow {
  value: unknown;
}

const normalizeAccountNumber = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';

  const accountNumber = (value as Record<string, unknown>).account_number;

  return typeof accountNumber === 'string' ? accountNumber.trim() : '';
};

export async function getDistrictTransferAccountNumber(): Promise<string> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', DISTRICT_TRANSFER_ACCOUNT_KEY)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;

  return data
    ? normalizeAccountNumber((data as DistrictTransferAccountSettingRow).value)
    : '';
}

export async function updateDistrictTransferAccountNumber(
  accountNumber: string
): Promise<string> {
  const normalizedAccountNumber = accountNumber.trim();
  const { error } = await supabase.rpc('update_app_setting_as_global_admin', {
    p_key: DISTRICT_TRANSFER_ACCOUNT_KEY,
    p_value: { account_number: normalizedAccountNumber },
  });

  if (error) throw error;

  return normalizedAccountNumber;
}
