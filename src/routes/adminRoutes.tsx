import { lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AdminAuthProvider } from '../components/AdminAuthProvider';
import AdminProtectedRoute from '../components/AdminProtectedRoute';
import type { AdminRoleType } from '../lib/adminService';

const AdminLoginPage = lazy(() => import('../pages/admin/AdminLoginPage'));
const AdminCampusDashboardPage = lazy(
  () => import('../pages/admin/AdminCampusPage')
);
const AdminDashboardPage = lazy(() => import('../pages/admin/AdminGlobalPage'));
const AdminAllocationsPage = lazy(
  () => import('../pages/admin/AdminExactAllocationPage')
);
const AdminApplicationsPage = lazy(
  () => import('../pages/admin/AdminTicketPage')
);
const AdminFinalPaymentReviewPage = lazy(
  () => import('../pages/admin/AdminFinalPaymentReviewPage')
);
const AdminParticipationTargetsPage = lazy(
  () => import('../pages/admin/AdminParticipationTargetsPage')
);
const AdminReservationDeadlinePage = lazy(
  () => import('../pages/admin/AdminReservationDeadlinePage')
);
const AdminCampusRequestsPage = lazy(
  () => import('../pages/admin/AdminCampusRequestsPage')
);
const AdminUsersPage = lazy(
  () => import('../pages/admin/AdminPersonalTicketPage')
);
const AdminCampusAdminManagePage = lazy(
  () => import('../pages/admin/AdminCampusAdminManagePage')
);
const AdminSetupCheckPage = lazy(
  () => import('../pages/admin/AdminSetupCheckPage')
);
const AdminAllocationLogicPage = lazy(
  () => import('../pages/admin/AdminAllocationLogicPage')
);
const AdminRemainingSeatSalesPage = lazy(
  () => import('../pages/admin/AdminRemainingSeatSalesPage')
);
const AdminAllocationResultPage = lazy(
  () => import('../pages/admin/AdminAllocationResultPage')
);
const AdminAllocationWorkspacePage = lazy(
  () => import('../pages/admin/AdminAllocationWorkspacePage')
);
const AdminSimulationPage = lazy(
  () => import('../pages/admin/AdminSimulationPage')
);
const AdminBoardingPage = lazy(() => import('../pages/admin/AdminBoardingPage'));
const AdminBoardingManagerPage = lazy(
  () => import('../pages/admin/AdminBoardingManagerPage')
);
const AdminAuditLogsPage = lazy(
  () => import('../pages/admin/AdminAuditLogsPage')
);
const AdminToolsPage = lazy(() => import('../pages/admin/AdminToolsPage'));
const AdminInvitationCodesPage = lazy(
  () => import('../pages/admin/AdminInvitationCodesPage')
);

const globalAdminOnly = ['global_admin'] as const satisfies readonly AdminRoleType[];
const campusAdminOnly = ['campus_admin'] as const satisfies readonly AdminRoleType[];
const boardingAccess = [
  'global_admin',
  'boarding_manager',
] as const satisfies readonly AdminRoleType[];
const allAdminRoles = [
  'global_admin',
  'campus_admin',
] as const satisfies readonly AdminRoleType[];

const adminRoute = (
  element: ReactNode,
  allowedRoles: readonly AdminRoleType[]
) => (
  <AdminProtectedRoute allowedRoles={allowedRoles}>{element}</AdminProtectedRoute>
);

const RedirectWithSearch = ({ to }: { to: string }) => {
  const location = useLocation();
  const search = location.search.slice(1);
  const destination = search
    ? `${to}${to.includes('?') ? '&' : '?'}${search}`
    : to;

  return <Navigate to={destination} replace />;
};

const canonicalAdminRoutes = [
  { path: 'login', element: <AdminLoginPage /> },
  { path: '', element: <Navigate to="/admin/dashboard" replace /> },
  {
    path: 'dashboard',
    element: adminRoute(<AdminDashboardPage />, globalAdminOnly),
  },
  {
    path: 'campus-dashboard',
    element: adminRoute(<AdminCampusDashboardPage />, campusAdminOnly),
  },
  {
    path: 'boarding',
    element: adminRoute(<AdminBoardingPage />, boardingAccess),
  },
  {
    path: 'access/boarding-managers',
    element: adminRoute(<AdminBoardingManagerPage />, globalAdminOnly),
  },
  {
    path: 'applications',
    element: adminRoute(<AdminApplicationsPage />, globalAdminOnly),
  },
  {
    path: 'users',
    element: adminRoute(<AdminUsersPage />, globalAdminOnly),
  },
  {
    path: 'access/campus-admins',
    element: adminRoute(<AdminCampusAdminManagePage />, globalAdminOnly),
  },
  {
    path: 'settings',
    element: adminRoute(<AdminSetupCheckPage />, globalAdminOnly),
  },
  {
    path: 'system',
    element: adminRoute(<AdminToolsPage />, globalAdminOnly),
  },
  {
    path: 'system/simulation',
    element: adminRoute(<AdminSimulationPage />, globalAdminOnly),
  },
  {
    path: 'system/audit-logs',
    element: adminRoute(<AdminAuditLogsPage />, globalAdminOnly),
  },
  {
    path: 'system/invitation-codes',
    element: adminRoute(<AdminInvitationCodesPage />, globalAdminOnly),
  },
  {
    path: 'settings/participation-targets',
    element: adminRoute(<AdminParticipationTargetsPage />, globalAdminOnly),
  },
  {
    path: 'settings/reservation-deadline',
    element: adminRoute(<AdminReservationDeadlinePage />, globalAdminOnly),
  },
  {
    path: 'communications',
    element: adminRoute(<AdminCampusRequestsPage />, allAdminRoles),
  },
  {
    path: 'allocations',
    element: adminRoute(<AdminAllocationsPage />, globalAdminOnly),
  },
  {
    path: 'allocations/result',
    element: adminRoute(<AdminAllocationResultPage />, globalAdminOnly),
  },
  {
    path: 'allocations/workspace',
    element: adminRoute(<AdminAllocationWorkspacePage />, globalAdminOnly),
  },
  {
    path: 'allocations/logic',
    element: adminRoute(<AdminAllocationLogicPage />, globalAdminOnly),
  },
  {
    path: 'payments/remaining-seats',
    element: adminRoute(<AdminRemainingSeatSalesPage />, globalAdminOnly),
  },
  {
    path: 'payments/campus-transfers',
    element: adminRoute(
      <RedirectWithSearch to="/admin/payments/final-review" />,
      globalAdminOnly
    ),
  },
  {
    path: 'payments/final-review',
    element: adminRoute(<AdminFinalPaymentReviewPage />, globalAdminOnly),
  },
];

const legacyAdminRoutes = [
  { path: 'global', to: '/admin/dashboard', roles: globalAdminOnly },
  { path: 'campus', to: '/admin/campus-dashboard', roles: campusAdminOnly },
  { path: 'tickets', to: '/admin/applications', roles: globalAdminOnly },
  { path: 'personal-tickets', to: '/admin/users', roles: globalAdminOnly },
  {
    path: 'campus-admins',
    to: '/admin/access/campus-admins',
    roles: globalAdminOnly,
  },
  {
    path: 'boarding-managers',
    to: '/admin/access/boarding-managers',
    roles: globalAdminOnly,
  },
  { path: 'setup-check', to: '/admin/settings', roles: globalAdminOnly },
  { path: 'tools', to: '/admin/system', roles: globalAdminOnly },
  {
    path: 'participation-targets',
    to: '/admin/settings/participation-targets',
    roles: globalAdminOnly,
  },
  {
    path: 'reservation-deadline',
    to: '/admin/settings/reservation-deadline',
    roles: globalAdminOnly,
  },
  {
    path: 'campus-requests',
    to: '/admin/communications',
    roles: allAdminRoles,
  },
  {
    path: 'home-announcements',
    to: '/admin/communications?tab=home',
    roles: globalAdminOnly,
  },
  { path: 'allocation', to: '/admin/allocations', roles: globalAdminOnly },
  { path: 'bus-allocation', to: '/admin/allocations', roles: globalAdminOnly },
  {
    path: 'allocation/result',
    to: '/admin/allocations/result',
    roles: globalAdminOnly,
  },
  {
    path: 'allocation/workspace',
    to: '/admin/allocations/workspace',
    roles: globalAdminOnly,
  },
  {
    path: 'allocation/logic',
    to: '/admin/allocations/logic',
    roles: globalAdminOnly,
  },
  {
    path: 'remaining-seat-sales',
    to: '/admin/payments/remaining-seats',
    roles: globalAdminOnly,
  },
  {
    path: 'campus-transfer',
    to: '/admin/payments/final-review',
    roles: globalAdminOnly,
  },
  {
    path: 'final-payment-review',
    to: '/admin/payments/final-review',
    roles: globalAdminOnly,
  },
  {
    path: 'simulation',
    to: '/admin/system/simulation',
    roles: globalAdminOnly,
  },
  {
    path: 'audit-logs',
    to: '/admin/system/audit-logs',
    roles: globalAdminOnly,
  },
  {
    path: 'invitation-codes',
    to: '/admin/system/invitation-codes',
    roles: globalAdminOnly,
  },
] as const;

const AdminRoutes = () => (
  <AdminAuthProvider>
    <Routes>
      {canonicalAdminRoutes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}
      {legacyAdminRoutes.map((route) => (
        <Route
          key={route.path}
          path={route.path}
          element={adminRoute(
            <RedirectWithSearch to={route.to} />,
            route.roles
          )}
        />
      ))}
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  </AdminAuthProvider>
);

export default AdminRoutes;
