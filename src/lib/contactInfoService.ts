import { supabase } from './supabase';

export interface ContactInfo {
  email: string;
  phone: string;
}

interface ContactInfoRow {
  email: string | null;
  phone: string | null;
}

type ContactInfoInput = {
  email?: string | null;
  phone?: string | null;
};

const normalizeContactInfo = (value?: ContactInfoInput | null): ContactInfo => ({
  email: value?.email?.trim() ?? '',
  phone: value?.phone?.trim() ?? '',
});

export const getPublicContactInfo = async (): Promise<ContactInfo> => {
  const { data, error } = await supabase.rpc('get_public_contact_info');

  if (error) throw error;

  const row = (data as ContactInfoRow[] | null)?.[0];
  return normalizeContactInfo(row);
};

export const updateContactInfo = async (
  contactInfo: ContactInfo
): Promise<ContactInfo> => {
  const normalized = normalizeContactInfo(contactInfo);
  const { data, error } = await supabase.rpc('update_app_setting_as_global_admin', {
    p_key: 'public_contact_info',
    p_value: normalized,
  });

  if (error) throw error;

  const setting = data as { value?: Partial<ContactInfo> | null } | null;
  return normalizeContactInfo(setting?.value);
};
