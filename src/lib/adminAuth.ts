import { supabase } from './supabase';
import { getAdminRole } from './adminService';

export async function requireAdminRole(
  allowedRoles: Array<'campus_admin' | 'global_admin'>
) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    return {
      ok: false as const,
      reason: 'not_logged_in' as const,
      session: null,
      adminRole: null,
    };
  }

  const adminRole = await getAdminRole(session.user.id);

  if (!adminRole || !allowedRoles.includes(adminRole.role)) {
    return {
      ok: false as const,
      reason: 'not_authorized' as const,
      session,
      adminRole,
    };
  }

  return {
    ok: true as const,
    reason: null,
    session,
    adminRole,
  };
}