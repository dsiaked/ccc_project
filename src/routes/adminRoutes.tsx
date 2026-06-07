import { lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AdminAuthProvider } from '../components/AdminAuthProvider';
import AdminProtectedRoute from '../components/AdminProtectedRoute';
import type { AdminRoleType } from '../lib/adminService';

const AdminLoginPage = lazy(() => import('../pages/admin/AdminLoginPage'));
const CampusAdminPage = lazy(() => import('../pages/admin/AdminCampusPage'));
const AdminGlobalPage = lazy(() => import('../pages/admin/AdminGlobalPage'));
const BusAllocationPage = lazy(
  () => import('../pages/admin/AdminExactAllocationPage')
);
const AdminTicketPage = lazy(() => import('../pages/admin/AdminTicketPage'));
const AdminCampusTransferPage = lazy(
  () => import('../pages/admin/AdminCampusTransferPage')
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
const AdminPersonalTicketPage = lazy(
  () => import('../pages/admin/AdminPersonalTicketPage')
);
const AdminCampusIssueReviewPage = lazy(
  () => import('../pages/admin/AdminCampusIssueReviewPage')
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

const globalAdminOnly = ['global_admin'] as const satisfies readonly AdminRoleType[];
const campusAdminOnly = ['campus_admin'] as const satisfies readonly AdminRoleType[];
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

const adminRoutes = [
  { path: 'login', element: <AdminLoginPage /> },
  {
    path: 'global',
    element: adminRoute(<AdminGlobalPage />, globalAdminOnly),
  },
  {
    path: 'campus',
    element: adminRoute(<CampusAdminPage />, campusAdminOnly),
  },
  {
    path: 'tickets',
    element: adminRoute(<AdminTicketPage />, globalAdminOnly),
  },
  {
    path: 'users',
    element: adminRoute(<AdminPersonalTicketPage />, globalAdminOnly),
  },
  {
    path: 'personal-tickets',
    element: adminRoute(<AdminPersonalTicketPage />, globalAdminOnly),
  },
  {
    path: 'campus-issues',
    element: adminRoute(<AdminCampusIssueReviewPage />, globalAdminOnly),
  },
  {
    path: 'campus-admins',
    element: adminRoute(<AdminCampusAdminManagePage />, globalAdminOnly),
  },
  {
    path: 'setup-check',
    element: adminRoute(<AdminSetupCheckPage />, globalAdminOnly),
  },
  {
    path: 'simulation',
    element: adminRoute(<AdminSimulationPage />, globalAdminOnly),
  },
  {
    path: 'home-announcements',
    element: adminRoute(
      <Navigate to="/admin/campus-requests?tab=home" replace />,
      globalAdminOnly
    ),
  },
  {
    path: 'participation-targets',
    element: adminRoute(<AdminParticipationTargetsPage />, globalAdminOnly),
  },
  {
    path: 'reservation-deadline',
    element: adminRoute(<AdminReservationDeadlinePage />, globalAdminOnly),
  },
  {
    path: 'campus-requests',
    element: adminRoute(<AdminCampusRequestsPage />, allAdminRoles),
  },
  {
    path: 'allocation',
    element: adminRoute(<BusAllocationPage />, globalAdminOnly),
  },
  {
    path: 'allocation/result',
    element: adminRoute(<AdminAllocationResultPage />, globalAdminOnly),
  },
  {
    path: 'allocation/workspace',
    element: adminRoute(<AdminAllocationWorkspacePage />, globalAdminOnly),
  },
  {
    path: 'allocation/logic',
    element: adminRoute(<AdminAllocationLogicPage />, globalAdminOnly),
  },
  {
    path: 'bus-allocation',
    element: adminRoute(<BusAllocationPage />, globalAdminOnly),
  },
  {
    path: 'remaining-seat-sales',
    element: adminRoute(<AdminRemainingSeatSalesPage />, globalAdminOnly),
  },
  {
    path: 'campus-transfer',
    element: adminRoute(<AdminCampusTransferPage />, globalAdminOnly),
  },
];

const AdminRoutes = () => (
  <AdminAuthProvider>
    <Routes>
      {adminRoutes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  </AdminAuthProvider>
);

export default AdminRoutes;
