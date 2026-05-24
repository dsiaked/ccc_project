import { supabase } from './supabase';
import type { StationOption } from '../types/station';

export async function getStationOptions(): Promise<StationOption[]> {
  console.log('getStationOptions 호출됨');

  const { data, error } = await supabase
    .from('stations')
    .select('id, name, line, address, lat, lng')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  console.log('stations data:', data);
  console.log('stations error:', error);

  if (error) {
    console.error('도착역 정보 로드 실패:', error);
    throw error;
  }

  return data ?? [];
}