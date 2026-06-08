type SupportedAdminRole = 'global_admin' | 'campus_admin' | 'boarding_manager';

export const canAdminRoleAccess = (
  role: SupportedAdminRole,
  allowedRoles: readonly SupportedAdminRole[]
) => role === 'global_admin' || allowedRoles.includes(role);

export const getAdminFallbackPath = (role: SupportedAdminRole | null) => {
  if (role === 'campus_admin') return '/admin/campus-dashboard';
  if (role === 'boarding_manager') return '/admin/boarding';
  if (role === 'global_admin') return '/admin/dashboard';
  return '/admin/login';
};
