import { supabase } from '../supabase';
import {
  mapCampusAdminAssignments,
  mapCampusScopes,
} from './campusAdminScopeModel';
import type {
  CampusAdminProfileRow,
  CampusAdminRoleRow,
  CampusScopeRow,
} from './campusAdminScopeModel';

export async function getCampusScopesForAdmin() {
  const { data, error } = await supabase
    .from('campus_options')
    .select('campus_id, district, team, campus')
    .order('district', { ascending: true })
    .order('team', { ascending: true })
    .order('campus', { ascending: true });

  if (error) throw error;

  return mapCampusScopes((data ?? []) as CampusScopeRow[]);
}

export async function getCampusAdminAssignments() {
  const { data: roles, error: roleError } = await supabase
    .from('admin_roles')
    .select('id, user_id, campus_id, district, team, campus')
    .eq('role', 'campus_admin');

  if (roleError) throw roleError;
  if (!roles || roles.length === 0) return [];

  const userIds = [...new Set(roles.map((role) => role.user_id))];
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, email, phone')
    .in('id', userIds);

  if (profileError) throw profileError;

  return mapCampusAdminAssignments(
    roles as CampusAdminRoleRow[],
    (profiles ?? []) as CampusAdminProfileRow[]
  );
}
