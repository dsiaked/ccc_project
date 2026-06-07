/* eslint-disable react-refresh/only-export-components */
import { lazy, type ReactNode } from 'react';

import AdminProtectedRoute from '../components/AdminProtectedRoute';
import type { AdminRoleType } from '../lib/adminService';

const AdminLoginPage = lazy(() => import('../pages/admin/AdminLoginPage'));
const CampusAdminPage = lazy(() => import('../pages/admin/AdminCampusPage'));
const AdminGlobalPage = lazy(() => import('../pages/admin/AdminGlobalPage'));
const BusAllocationPage = lazy(
  () => import('../pages/admin/AdminAllocationPage')
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
const AdminCampusAdminManagePage = lazy(
  () => import('../pages/admin/AdminCampusAdminManagePage')
);
const AdminSetupCheckPage = lazy(
  () => import('../pages/admin/AdminSetupCheckPage')
);
const AdminHomeAnnouncementPage = lazy(
  () => import('../pages/admin/AdminHomeAnnouncementPage')
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

export const adminRoutes = [
  { path: '/admin/login', element: <AdminLoginPage /> },
  {
    path: '/admin/global',
    element: adminRoute(<AdminGlobalPage />, globalAdminOnly),
  },
  {
    path: '/admin/campus',
    element: adminRoute(<CampusAdminPage />, campusAdminOnly),
  },
  {
    path: '/admin/tickets',
    element: adminRoute(<AdminTicketPage />, globalAdminOnly),
  },
  {
    path: '/admin/users',
    element: adminRoute(<AdminPersonalTicketPage />, globalAdminOnly),
  },
  {
    path: '/admin/personal-tickets',
    element: adminRoute(<AdminPersonalTicketPage />, globalAdminOnly),
  },
  {
    path: '/admin/campus-admins',
    element: adminRoute(<AdminCampusAdminManagePage />, globalAdminOnly),
  },
  {
    path: '/admin/setup-check',
    element: adminRoute(<AdminSetupCheckPage />, globalAdminOnly),
  },
  {
    path: '/admin/home-announcements',
    element: adminRoute(<AdminHomeAnnouncementPage />, globalAdminOnly),
  },
  {
    path: '/admin/participation-targets',
    element: adminRoute(<AdminParticipationTargetsPage />, globalAdminOnly),
  },
  {
    path: '/admin/reservation-deadline',
    element: adminRoute(<AdminReservationDeadlinePage />, globalAdminOnly),
  },
  {
    path: '/admin/campus-requests',
    element: adminRoute(<AdminCampusRequestsPage />, allAdminRoles),
  },
  {
    path: '/admin/allocation',
    element: adminRoute(<BusAllocationPage />, globalAdminOnly),
  },
  {
    path: '/admin/allocation/result',
    element: adminRoute(<AdminAllocationResultPage />, globalAdminOnly),
  },
  {
    path: '/admin/allocation/workspace',
    element: adminRoute(<AdminAllocationWorkspacePage />, globalAdminOnly),
  },
  {
    path: '/admin/allocation/logic',
    element: adminRoute(<AdminAllocationLogicPage />, globalAdminOnly),
  },
  {
    path: '/admin/bus-allocation',
    element: adminRoute(<BusAllocationPage />, globalAdminOnly),
  },
  {
    path: '/admin/remaining-seat-sales',
    element: adminRoute(<AdminRemainingSeatSalesPage />, globalAdminOnly),
  },
  {
    path: '/admin/campus-transfer',
    element: adminRoute(<AdminCampusTransferPage />, globalAdminOnly),
  },
];
