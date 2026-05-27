import { BrowserRouter, Routes, Route } from 'react-router-dom';

import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ReservationPage from './pages/ReservationPage';
import TicketPage from './pages/TicketPage';
import ConfirmedTicketPage from './pages/ConfirmedTicketPage';
import AuthCallbackPage from './pages/AuthCallbackPage';

import AdminLoginPage from './pages/admin/AdminLoginPage';
import CampusAdminPage from './pages/admin/AdminCampusPage';
import AdminGlobalPage from './pages/admin/AdminGlobalPage';
import BusAllocationPage from './pages/admin/AdminAllocationPage';
import AdminTicketPage from './pages/admin/AdminTicketPage';
import AdminCampusTransferPage from './pages/admin/AdminCampusTransferPage';
import AdminParticipationTargetsPage from './pages/admin/AdminParticipationTargetsPage';
import AdminReservationDeadlinePage from './pages/admin/AdminReservationDeadlinePage';
import AdminCampusRequestsPage from './pages/admin/AdminCampusRequestsPage';
import AdminPersonalTicketPage from './pages/admin/AdminPersonalTicketPage';
import AdminCampusAdminManagePage from './pages/admin/AdminCampusAdminManagePage';
import AdminSetupCheckPage from './pages/admin/AdminSetupCheckPage';
import AdminHomeAnnouncementPage from './pages/admin/AdminHomeAnnouncementPage';
import AdminAllocationLogicPage from './pages/admin/AdminAllocationLogicPage';
import AdminRemainingSeatSalesPage from './pages/admin/AdminRemainingSeatSalesPage';

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* 일반 사용자 영역 */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/reservation" element={<ReservationPage />} />
        <Route path="/ticket" element={<TicketPage />} />
        <Route path="/confirmed-ticket" element={<ConfirmedTicketPage />} />

        {/* 관리자 영역 */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/global" element={<AdminGlobalPage />} />
        <Route path="/admin/campus" element={<CampusAdminPage />} />
        <Route path="/admin/tickets" element={<AdminTicketPage />} />
        <Route
          path="/admin/personal-tickets"
          element={<AdminPersonalTicketPage />}
        />
        <Route
          path="/admin/campus-admins"
          element={<AdminCampusAdminManagePage />}
        />
        <Route path="/admin/setup-check" element={<AdminSetupCheckPage />} />
        <Route
          path="/admin/home-announcements"
          element={<AdminHomeAnnouncementPage />}
        />
        <Route
          path="/admin/participation-targets"
          element={<AdminParticipationTargetsPage />}
        />
        <Route
          path="/admin/reservation-deadline"
          element={<AdminReservationDeadlinePage />}
        />
        <Route
          path="/admin/campus-requests"
          element={<AdminCampusRequestsPage />}
        />
        <Route path="/admin/allocation" element={<BusAllocationPage />} />
        <Route
          path="/admin/allocation/logic"
          element={<AdminAllocationLogicPage />}
        />
        <Route path="/admin/bus-allocation" element={<BusAllocationPage />} />
        <Route
          path="/admin/remaining-seat-sales"
          element={<AdminRemainingSeatSalesPage />}
        />
        <Route path="/admin/campus-transfer" element={<AdminCampusTransferPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
