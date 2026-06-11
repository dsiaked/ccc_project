import { supabase } from './supabase';
import {
  formatReservationDeadlineValue,
  isReservationDeadlineClosed,
  normalizeReservationDeadline,
} from '../utils/reservationDeadline';

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

let reservationDeadlineRequest: Promise<ReservationDeadlineSetting> | null = null;

export const hasConfirmedAllocation = async (): Promise<boolean> => {
  const { data, error } = await supabase
    .from('bus_allocations')
    .select('id')
    .filter('allocation_data->>status', 'eq', 'confirmed')
    .limit(1);

  if (error) {
    throw error;
  }

  return Boolean(data?.length);
};

export const getReservationDeadline = (): Promise<ReservationDeadlineSetting> => {
  if (reservationDeadlineRequest) return reservationDeadlineRequest;

  reservationDeadlineRequest = (async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .eq('key', RESERVATION_DEADLINE_KEY)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    const setting = data as SettingRow | null;
    const deadlineAt = normalizeReservationDeadline(setting?.value?.deadline_at);

    return {
      deadlineAt,
      isClosed: isReservationDeadlineClosed(deadlineAt),
    };
  })();

  return reservationDeadlineRequest.finally(() => {
    reservationDeadlineRequest = null;
  });
};

export const updateReservationDeadline = async (
  deadlineAt: string | null
): Promise<ReservationDeadlineSetting> => {
  const normalizedDeadlineAt = normalizeReservationDeadline(deadlineAt);

  if (deadlineAt !== null && !normalizedDeadlineAt) {
    throw new Error('신청 마감 일시가 올바르지 않습니다.');
  }

  const { data, error } = await supabase.rpc(
    'update_app_setting_as_global_admin',
    {
      p_key: RESERVATION_DEADLINE_KEY,
      p_value: { deadline_at: normalizedDeadlineAt },
    }
  );

  if (error) {
    throw error;
  }

  const setting = data as SettingRow;
  const savedDeadlineAt = normalizeReservationDeadline(
    setting.value?.deadline_at
  );

  return {
    deadlineAt: savedDeadlineAt,
    isClosed: isReservationDeadlineClosed(savedDeadlineAt),
  };
};

export const formatReservationDeadline = formatReservationDeadlineValue;
