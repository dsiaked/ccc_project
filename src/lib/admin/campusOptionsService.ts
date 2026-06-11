import { supabase } from '../supabase';
import { toUniqueSelectOptions } from './campusOptionsModel';

export async function getDistrictsForAdmin() {
  const { data, error } = await supabase
    .from('campus_options')
    .select('district_id, district')
    .order('district', { ascending: true });

  if (error) throw error;

  return toUniqueSelectOptions(
    (data ?? []).map((item) => ({
      id: item.district_id,
      name: item.district,
    }))
  );
}

export async function getTeamsByDistrict(districtId: string) {
  const { data, error } = await supabase
    .from('campus_options')
    .select('team_id, team')
    .eq('district_id', districtId)
    .order('team', { ascending: true });

  if (error) throw error;

  return toUniqueSelectOptions(
    (data ?? []).map((item) => ({
      id: item.team_id,
      name: item.team,
    }))
  );
}

export async function getCampusesByTeam(teamId: string) {
  const { data, error } = await supabase
    .from('campus_options')
    .select('campus_id, campus')
    .eq('team_id', teamId)
    .order('campus', { ascending: true });

  if (error) throw error;

  return toUniqueSelectOptions(
    (data ?? []).map((item) => ({
      id: item.campus_id,
      name: item.campus,
    }))
  );
}
