import { supabase } from './supabase';
import type { ReturnBusReservation } from '../types/reservation';

/**
 * 예약 정보를 Supabase DB에 저장 (현재 인증된 사용자만 저장 가능)
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
 * 사용자의 예약 정보 조회 (현재 인증된 사용자만 조회 가능)
 */
export async function getReservation(): Promise<ReturnBusReservation | null> {
  try {
    // 현재 세션의 사용자 확인
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user?.id) {
      throw new Error('Authentication failed');
    }

    const { data, error } = await supabase
      .from('reservations')
      .select('data, created_at, updated_at')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (data && data.data) {
      const savedData = data.data as ReturnBusReservation;

      return {
        ...savedData,
        requestedAt: savedData.requestedAt || data.created_at || '',
        updatedAt: savedData.updatedAt || data.updated_at || undefined,
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to get reservation:', error);
    throw error;
  }
}

/**
 * 사용자의 예약 정보 삭제 (현재 인증된 사용자만 삭제 가능)
 */
export async function deleteReservation() {
  try {
    // 현재 세션의 사용자 확인
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user?.id) {
      throw new Error('Authentication failed');
    }

    const { error } = await supabase
      .from('reservations')
      .delete()
      .eq('user_id', session.user.id);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Failed to delete reservation:', error);
    throw error;
  }
}
