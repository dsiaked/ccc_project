import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Bell, LogIn, LogOut, Menu, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getAdminRoles,
  setActiveAdminRole,
  type AdminRole,
} from '../lib/adminService';
import { supabase } from '../lib/supabase';
import { getMyPersonalNotifications } from '../lib/personalNotificationService';
import styles from './Header.module.css';
import LogoutModal from './LogoutModal';

const Sidebar = lazy(() => import('./Sidebar'));

const adminShortcutCopyByRole: Record<
  AdminRole['role'],
  { description: string; buttonLabel: string }
> = {
  global_admin: {
    description: '신청과 버스 운영 현황을 관리할 수 있습니다.',
    buttonLabel: '관리자 페이지',
  },
  campus_admin: {
    description: '캠퍼스 신청과 입금·송금 현황을 관리할 수 있습니다.',
    buttonLabel: '캠퍼스 회계 담당자 페이지',
  },
  boarding_manager: {
    description: '담당 호차의 탑승 현황과 탑승자 상태를 관리할 수 있습니다.',
    buttonLabel: '탑승 관리자 페이지',
  },
};

const Header = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [hasOpenedSidebar, setHasOpenedSidebar] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [adminShortcutRole, setAdminShortcutRole] = useState<AdminRole | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const homePath = location.pathname.startsWith('/admin') ? '/admin/dashboard' : '/';
  const adminShortcutCopy = adminShortcutRole
    ? adminShortcutCopyByRole[adminShortcutRole.role]
    : null;

  const toggleSidebar = () => {
    if (!isSidebarOpen) setHasOpenedSidebar(true);
    setIsSidebarOpen((current) => !current);
  };
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  useEffect(() => {
    let isMounted = true;

    const updateAuthState = async (
      session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']
    ) => {
      if (!isMounted) return;
      setIsLoggedIn(Boolean(session));

      if (!session) {
        setAdminShortcutRole(null);
        setUnreadNotificationCount(0);
        return;
      }

      const roles = await getAdminRoles(session.user.id);
      if (!isMounted) return;

      setAdminShortcutRole(
        roles.find((role) => role.role === 'global_admin') ??
          roles.find((role) => role.role === 'campus_admin') ??
          roles.find((role) => role.role === 'boarding_manager') ??
          null
      );

      const notifications = await getMyPersonalNotifications(20);
      if (isMounted) {
        setUnreadNotificationCount(
          notifications.filter((notification) => !notification.readAt).length
        );
      }
    };

    const checkLogin = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('세션 확인 실패:', error);
        if (isMounted) {
          setIsLoggedIn(false);
          setAdminShortcutRole(null);
        }
        return;
      }
      await updateAuthState(data.session);
    };

    void checkLogin();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void updateAuthState(session);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleAdminShortcutClick = async () => {
    if (!adminShortcutRole) return;
    if (adminShortcutRole.role !== 'global_admin') {
      await setActiveAdminRole(adminShortcutRole.user_id, adminShortcutRole.id);
    }
    navigate(
      adminShortcutRole.role === 'global_admin'
        ? '/admin/dashboard'
        : adminShortcutRole.role === 'campus_admin'
          ? '/admin/campus-dashboard'
          : '/admin/boarding'
    );
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setIsLogoutModalOpen(false);
    navigate('/');
  };

  return (
    <>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.logo}
          onClick={() => navigate(homePath)}
          aria-label="홈으로 이동"
        >
          CCC 여름수련회 귀가 버스
        </button>

        <div className={styles.rightGroup}>
          {isLoggedIn && (
            <button
              type="button"
              className={styles.notificationButton}
              aria-label={`개인 알림 ${unreadNotificationCount}건`}
              onClick={() => navigate('/#personal-notifications')}
            >
              <Bell size={20} color="#1e40af" />
              {unreadNotificationCount > 0 && <strong>{unreadNotificationCount}</strong>}
            </button>
          )}
          <button
            type="button"
            className={styles.loginButton}
            aria-label={isLoggedIn ? '로그아웃' : '로그인'}
            onClick={() => {
              if (isLoggedIn) setIsLogoutModalOpen(true);
              else navigate('/login');
            }}
          >
            {isLoggedIn ? <LogOut size={20} color="#1e40af" /> : <LogIn size={20} color="#1e40af" />}
            <span className={styles.loginText}>{isLoggedIn ? '로그아웃' : '로그인'}</span>
          </button>
          <button
            type="button"
            className={styles.menuButton}
            aria-controls="main-sidebar"
            aria-label={isSidebarOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={isSidebarOpen}
            onClick={toggleSidebar}
          >
            <Menu size={24} color="#1e40af" />
          </button>
        </div>

        {hasOpenedSidebar && (
          <Suspense fallback={null}>
            <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
          </Suspense>
        )}
      </header>

      {location.pathname === '/' && adminShortcutRole && adminShortcutCopy && (
        <section className={styles.adminBar} aria-label="관리자 페이지 바로가기">
          <div className={styles.adminBarCopy}>
            <span className={styles.adminBarIcon} aria-hidden="true">
              <ShieldCheck size={18} />
            </span>
            <span className={styles.adminBarText}>
              <strong>관리자 전용</strong>
              <span>{adminShortcutCopy.description}</span>
            </span>
          </div>
          <button
            type="button"
            className={styles.adminBarButton}
            onClick={() => void handleAdminShortcutClick()}
          >
            {adminShortcutCopy.buttonLabel}
          </button>
        </section>
      )}

      {isLogoutModalOpen && (
        <LogoutModal
          onClose={() => setIsLogoutModalOpen(false)}
          onConfirm={handleLogout}
        />
      )}
    </>
  );
};

export default Header;
