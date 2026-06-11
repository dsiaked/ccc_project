export interface AdminCampusScope {
  campusId: string;
  district: string;
  team: string;
  campus: string;
}

export interface CampusAdminAssignment extends AdminCampusScope {
  adminRoleId: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface CampusScopeRow {
  campus_id: string;
  district: string;
  team: string;
  campus: string;
}

export interface CampusAdminRoleRow {
  id: string;
  user_id: string;
  campus_id: string | null;
  district: string | null;
  team: string | null;
  campus: string | null;
}

export interface CampusAdminProfileRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export const mapCampusScopes = (rows: CampusScopeRow[]): AdminCampusScope[] =>
  rows.map((row) => ({
    campusId: row.campus_id,
    district: row.district,
    team: row.team,
    campus: row.campus,
  }));

export const mapCampusAdminAssignments = (
  roles: CampusAdminRoleRow[],
  profiles: CampusAdminProfileRow[]
): CampusAdminAssignment[] => {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  return roles.map((role) => {
    const profile = profileById.get(role.user_id);

    return {
      campusId: role.campus_id ?? '',
      district: role.district ?? '',
      team: role.team ?? '',
      campus: role.campus ?? '',
      adminRoleId: role.id,
      userId: role.user_id,
      name: profile?.name || '이름 없음',
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
    };
  });
};
