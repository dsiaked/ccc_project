import { supabase } from './supabase';
import type { StationOption } from '../types/station';

export async function getStationOptions(): Promise<StationOption[]> {
  const { data, error } = await supabase
    .from('stations')
    .select('id, name, line, address, lat, lng')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('행선지 정보 로드 실패:', error);
    throw error;
  }

  return data ?? [];
}
