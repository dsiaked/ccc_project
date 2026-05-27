import { supabase } from './supabase';
import type { ReturnBusReservation } from '../types/reservation';
import { getReservationDeadline } from './reservationDeadlineService';

/**
 * 예약 정보를 Supabase DB에 저장 (현재 인증된 사용자만 저장 가능)
 */
export async function saveReservation(
  reservation: ReturnBusReservation
) {
  try {
    // 현재 세션의 사용자 확인
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user?.id) {
      throw new Error('Authentication failed');
    }

    const userId = session.user.id;

    const { data: existingReservation, error: fetchError } = await supabase
      .from('reservations')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    const deadline = await getReservationDeadline();

    if (deadline.isClosed) {
      throw new Error('신청이 마감되어 예매를 저장할 수 없습니다.');
    }

    if (existingReservation) {
      // 기존 예약 업데이트
      const { error } = await supabase
        .from('reservations')
        .update({
          name: reservation.name,
          phone: reservation.phone,
          team: reservation.team,
          campus: reservation.campus,
          station_preferences: reservation.stationPreferences,
          status: reservation.status,
          confirmed_ticket: reservation.confirmedTicket || null,
          updated_at: new Date().toISOString(),
          data: reservation,
        })
        .eq('user_id', userId);

      if (error) throw error;
    } else {
      // 새로운 예약 생성
      const { error } = await supabase.from('reservations').insert({
        user_id: userId,
        name: reservation.name,
        phone: reservation.phone,
        team: reservation.team,
        campus: reservation.campus,
        station_preferences: reservation.stationPreferences,
        status: reservation.status,
        confirmed_ticket: reservation.confirmedTicket || null,
        data: reservation,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;
    }

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
      .select('data')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (data && data.data) {
      return data.data as ReturnBusReservation;
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
