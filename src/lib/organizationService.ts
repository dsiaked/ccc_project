import { supabase } from './supabase';

export interface DistrictOption {
  id: string;
  name: string;
  sort_order: number;
}

export interface TeamOption {
  id: string;
  district_id: string;
  name: string;
  sort_order: number;
}

export interface CampusOption {
  id: string;
  team_id: string;
  name: string;
  sort_order: number;
}

export async function getDistrictOptions() {
  const { data, error } = await supabase
    .from('districts')
    .select('id, name, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to get districts:', error);
    throw error;
  }

  return data as DistrictOption[];
}

export async function getTeamOptions(districtId: string) {
  const { data, error } = await supabase
    .from('teams')
    .select('id, district_id, name, sort_order')
    .eq('district_id', districtId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to get teams:', error);
    throw error;
  }

  return data as TeamOption[];
}

export async function getCampusOptions(teamId: string) {
  const { data, error } = await supabase
    .from('campuses')
    .select('id, team_id, name, sort_order')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to get campuses:', error);
    throw error;
  }

  return data as CampusOption[];
}