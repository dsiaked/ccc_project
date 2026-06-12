import { supabase } from './supabase';
import {
  formatReservationDeadlineValue,
  isReservationBeforeOpening,
  isReservationDeadlineClosed,
  normalizeReservationDeadline,
} from '../utils/reservationDeadline';

const RESERVATION_DEADLINE_KEY = 'first_reservation_deadline';

interface SettingRow {
  key: string;
  value: {
    opens_at?: string | null;
    deadline_at?: string | null;
  } | null;
}

export interface ReservationDeadlineSetting {
  opensAt: string | null;
  deadlineAt: string | null;
  isBeforeOpening: boolean;
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
    const opensAt = normalizeReservationDeadline(setting?.value?.opens_at);
    const deadlineAt = normalizeReservationDeadline(setting?.value?.deadline_at);

    return {
      opensAt,
      deadlineAt,
      isBeforeOpening: isReservationBeforeOpening(opensAt),
      isClosed: isReservationDeadlineClosed(deadlineAt),
    };
  })();

  return reservationDeadlineRequest.finally(() => {
    reservationDeadlineRequest = null;
  });
};

export const updateReservationDeadline = async (
  deadlineAt: string | null,
  opensAt: string | null = null
): Promise<ReservationDeadlineSetting> => {
  const normalizedDeadlineAt = normalizeReservationDeadline(deadlineAt);
  const normalizedOpensAt = normalizeReservationDeadline(opensAt);

  if (deadlineAt !== null && !normalizedDeadlineAt) {
    throw new Error('신청 마감 일시가 올바르지 않습니다.');
  }
  if (opensAt !== null && !normalizedOpensAt) {
    throw new Error('신청 시작 일시가 올바르지 않습니다.');
  }
  if (
    normalizedOpensAt &&
    normalizedDeadlineAt &&
    Date.parse(normalizedOpensAt) >= Date.parse(normalizedDeadlineAt)
  ) {
    throw new Error('신청 시작 일시는 신청 마감 일시보다 빨라야 합니다.');
  }

  const { data, error } = await supabase.rpc(
    'update_app_setting_as_global_admin',
    {
      p_key: RESERVATION_DEADLINE_KEY,
      p_value: {
        opens_at: normalizedOpensAt,
        deadline_at: normalizedDeadlineAt,
      },
    }
  );

  if (error) {
    throw error;
  }

  const setting = data as SettingRow;
  const savedOpensAt = normalizeReservationDeadline(setting.value?.opens_at);
  const savedDeadlineAt = normalizeReservationDeadline(
    setting.value?.deadline_at
  );

  return {
    opensAt: savedOpensAt,
    deadlineAt: savedDeadlineAt,
    isBeforeOpening: isReservationBeforeOpening(savedOpensAt),
    isClosed: isReservationDeadlineClosed(savedDeadlineAt),
  };
};

export const formatReservationDeadline = formatReservationDeadlineValue;
