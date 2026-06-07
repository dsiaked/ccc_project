import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { requireAdminRole } from '../lib/adminAuth';
import type { AdminRoleType } from '../lib/adminService';

interface AdminProtectedRouteProps {
  children: ReactNode;
  allowedRoles: readonly AdminRoleType[];
}

type AuthCheckState =
  | 'checking'
  | 'authorized'
  | 'not_logged_in'
  | 'not_authorized';

const AdminProtectedRoute = ({
  children,
  allowedRoles,
}: AdminProtectedRouteProps) => {
  const location = useLocation();
  const [authState, setAuthState] = useState<AuthCheckState>('checking');
  const [unauthorizedPath, setUnauthorizedPath] = useState('/');

  useEffect(() => {
    let isMounted = true;

    requireAdminRole([...allowedRoles])
      .then((result) => {
        if (!isMounted) return;

        if (!result.ok && result.adminRole) {
          setUnauthorizedPath(
            result.adminRole.role === 'campus_admin'
              ? '/admin/campus'
              : '/admin/global'
          );
        }

        setAuthState(result.ok ? 'authorized' : result.reason);
      })
      .catch(() => {
        if (!isMounted) return;

        setAuthState('not_authorized');
      });

    return () => {
      isMounted = false;
    };
  }, [allowedRoles]);

  if (authState === 'checking') {
    return null;
  }

  if (authState === 'not_logged_in') {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  if (authState === 'not_authorized') {
    return <Navigate to={unauthorizedPath} replace />;
  }

  return children;
};

export default AdminProtectedRoute;
