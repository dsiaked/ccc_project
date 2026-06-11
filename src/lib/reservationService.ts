import { supabase } from './supabase';
import type { ReturnBusReservation } from '../types/reservation';

/**
 * 신청 정보를 Supabase DB에 저장 (현재 인증된 사용자만 저장 가능)
 */
export async function saveReservation(
  reservation: ReturnBusReservation
) {
  try {
    const { error } = await supabase.rpc('save_user_reservation', {
      p_name: reservation.name,
      p_phone: reservation.phone,
      p_district: reservation.district,
      p_team: reservation.team,
      p_campus: reservation.campus,
      p_station_preferences: reservation.stationPreferences,
      p_data: reservation,
    });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Failed to save reservation:', error);
    throw error;
  }
}

/**
 * 사용자의 신청 정보 조회 (현재 인증된 사용자만 조회 가능)
 */
export async function getReservation(): Promise<ReturnBusReservation | null> {
  try {
    // 현재 세션의 사용자 확인
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user?.id) {
      throw new Error('Authentication failed');
    }

    return getReservationForUser(session.user.id);
  } catch (error) {
    console.error('Failed to get reservation:', error);
    throw error;
  }
}

export async function getReservationForUser(
  userId: string
): Promise<ReturnBusReservation | null> {
  try {
    const { data, error } = await supabase
      .from('reservations')
      .select(
        'id, name, phone, district, team, campus, affiliation_type, coordinator_name, coordinator_phone, station_preferences, data, status, confirmed_ticket, boarding_confirmed_at, created_at, updated_at'
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (data) {
      const savedData = (data.data || {}) as Partial<ReturnBusReservation>;

      return {
        ...savedData,
        id: data.id,
        name: data.name,
        phone: data.phone,
        district: data.district,
        team: data.team,
        campus: data.campus,
        affiliationType: data.affiliation_type,
        coordinatorName: data.coordinator_name ?? undefined,
        coordinatorPhone: data.coordinator_phone ?? undefined,
        stationPreferences: data.station_preferences,
        status: data.status,
        confirmedTicket: data.confirmed_ticket ?? undefined,
        boardingConfirmedAt: data.boarding_confirmed_at ?? undefined,
        requestedAt: data.created_at || savedData.requestedAt || '',
        updatedAt: data.updated_at || savedData.updatedAt || undefined,
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to get reservation:', error);
    throw error;
  }
}

export async function submitBoardingCheckInCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('submit_boarding_check_in_code', {
    p_code: code,
  });

  if (error) throw error;
  if (!data) throw new Error('탑승 체크인 시간을 저장하지 못했습니다.');

  if (typeof data === 'string') return data;

  const result = data as {
    success?: boolean;
    confirmedAt?: string;
    message?: string;
  };
  if (!result.success) {
    throw new Error(result.message || 'The check-in code could not be verified.');
  }
  if (!result.confirmedAt) {
    throw new Error('The boarding confirmation time was not returned.');
  }

  return result.confirmedAt;
}

/**
 * 사용자의 신청 정보 삭제 (현재 인증된 사용자만 삭제 가능)
 */
export async function deleteReservation() {
  try {
    const { error } = await supabase.rpc('delete_user_reservation');

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Failed to delete reservation:', error);
    throw error;
  }
}
