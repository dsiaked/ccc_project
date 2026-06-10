import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import type { AdminRoleType } from '../lib/adminService';
import {
  canAdminRoleAccess,
  getAdminFallbackPath,
} from '../utils/adminAccess';
import { useAdminAuth } from './AdminAuthProvider';
import styles from './AdminProtectedRoute.module.css';

interface AdminProtectedRouteProps {
  children: ReactNode;
  allowedRoles: readonly AdminRoleType[];
}

const AdminProtectedRoute = ({
  children,
  allowedRoles,
}: AdminProtectedRouteProps) => {
  const location = useLocation();
  const { status, adminRole, refresh } = useAdminAuth();

  if (status === 'loading') {
    return (
      <main className={styles.statusPage} role="status" aria-busy="true">
        <div className={styles.spinner} aria-hidden="true" />
        <p>관리자 권한을 확인하고 있습니다.</p>
      </main>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  if (status === 'error') {
    return (
      <main className={styles.statusPage}>
        <p role="alert">관리자 권한을 확인하지 못했습니다.</p>
        <button type="button" onClick={() => void refresh()}>
          다시 시도
        </button>
      </main>
    );
  }

  if (!adminRole || !canAdminRoleAccess(adminRole.role, allowedRoles)) {
    return (
      <Navigate to={getAdminFallbackPath(adminRole?.role ?? null)} replace />
    );
  }

  return children;
};

export default AdminProtectedRoute;
