import { supabase } from './supabase';

const RESERVATION_DEADLINE_KEY = 'first_reservation_deadline';

interface SettingRow {
  key: string;
  value: {
    deadline_at?: string | null;
  } | null;
}

export interface ReservationDeadlineSetting {
  deadlineAt: string | null;
  isClosed: boolean;
}

export const getReservationDeadline = async (): Promise<ReservationDeadlineSetting> => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('key', RESERVATION_DEADLINE_KEY)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  const setting = data as SettingRow | null;
  const deadlineAt = setting?.value?.deadline_at || null;
  const isClosed = deadlineAt ? new Date(deadlineAt).getTime() <= Date.now() : false;

  return {
    deadlineAt,
    isClosed,
  };
};

export const updateReservationDeadline = async (
  deadlineAt: string | null
): Promise<ReservationDeadlineSetting> => {
  const { data, error } = await supabase.rpc(
    'update_app_setting_as_global_admin',
    {
      p_key: RESERVATION_DEADLINE_KEY,
      p_value: { deadline_at: deadlineAt },
    }
  );

  if (error) {
    throw error;
  }

  const setting = data as SettingRow;
  const savedDeadlineAt = setting.value?.deadline_at || null;

  return {
    deadlineAt: savedDeadlineAt,
    isClosed: savedDeadlineAt
      ? new Date(savedDeadlineAt).getTime() <= Date.now()
      : false,
  };
};

export const formatReservationDeadline = (deadlineAt: string | null) => {
  if (!deadlineAt) return '미설정';

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(deadlineAt));
};
