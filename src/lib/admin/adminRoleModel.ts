export type AdminRoleType =
  | 'global_admin'
  | 'campus_admin'
  | 'boarding_manager';

export interface AdminRole {
  id: string;
  user_id: string;
  role: AdminRoleType;
  campus_id: string | null;
  district: string | null;
  team: string | null;
  campus: string | null;
  created_at?: string;
  updated_at?: string;
}

export const filterAdminRolesForUser = (
  roles: AdminRole[],
  userId: string
) => roles.filter((role) => role.user_id === userId);

export const shouldLoadAdminRolesDirectly = (
  rpcError: unknown,
  roles: AdminRole[]
) => Boolean(rpcError) || roles.length === 0;

export const selectAdminRole = (
  roles: AdminRole[],
  activeRoleId: string | null
) =>
  roles.find((role) => role.role === 'global_admin') ??
  roles.find((role) => role.id === activeRoleId) ??
  roles.find((role) => role.role === 'boarding_manager') ??
  roles.find((role) => role.role === 'campus_admin') ??
  null;

export const findSwitchableAdminRole = (
  roles: AdminRole[],
  roleId: string
) => roles.find((role) => role.id === roleId && role.role !== 'global_admin');
