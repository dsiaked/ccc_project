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
import { preloadPublicRoute } from '../routes/publicRoutes';
import styles from './Header.module.css';
import LogoutModal from './LogoutModal';

const loadSidebar = () => import('./Sidebar');
const Sidebar = lazy(loadSidebar);
const preloadSidebar = () => {
  void loadSidebar();
};

const SIDEBAR_WIDTH = 320;
const SWIPE_EDGE_WIDTH = 32;
const SWIPE_THRESHOLD = 64;

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
    if (location.pathname !== '/') return;

    let startX: number | null = null;
    let startY: number | null = null;

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;

      const sidebarLeft = Math.max(0, window.innerWidth - SIDEBAR_WIDTH);
      const canStartSwipe = isSidebarOpen
        ? touch.clientX >= sidebarLeft
        : touch.clientX >= window.innerWidth - SWIPE_EDGE_WIDTH;

      if (!canStartSwipe) return;

      startX = touch.clientX;
      startY = touch.clientY;
    };

    const resetSwipe = () => {
      startX = null;
      startY = null;
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!touch || startX === null || startY === null) {
        resetSwipe();
        return;
      }

      const distanceX = touch.clientX - startX;
      const distanceY = touch.clientY - startY;
      const isHorizontalSwipe =
        Math.abs(distanceX) >= SWIPE_THRESHOLD &&
        Math.abs(distanceX) > Math.abs(distanceY) * 1.2;

      if (isHorizontalSwipe) {
        if (!isSidebarOpen && distanceX < 0) {
          setHasOpenedSidebar(true);
          setIsSidebarOpen(true);
        } else if (isSidebarOpen && distanceX > 0) {
          closeSidebar();
        }
      }

      resetSwipe();
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', resetSwipe, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', resetSwipe);
    };
  }, [closeSidebar, isSidebarOpen, location.pathname]);

  useEffect(() => {
    let isMounted = true;

    const refreshUnreadNotificationCount = async () => {
      const notifications = await getMyPersonalNotifications(20);
      if (isMounted) {
        setUnreadNotificationCount(
          notifications.filter((notification) => !notification.readAt).length
        );
      }
    };

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

      const unreadNotificationPromise = refreshUnreadNotificationCount().catch(
        (error) => {
          console.error('Failed to refresh unread notifications:', error);
        }
      );
      const roles = await getAdminRoles(session.user.id);
      if (!isMounted) return;

      setAdminShortcutRole(
        roles.find((role) => role.role === 'global_admin') ??
          roles.find((role) => role.role === 'campus_admin') ??
          roles.find((role) => role.role === 'boarding_manager') ??
          null
      );

      await unreadNotificationPromise;
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
    window.addEventListener(
      'personal-notification-read',
      refreshUnreadNotificationCount
    );
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void updateAuthState(session);
    });
    const notificationChannel = supabase
      .channel('header-personal-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'personal_notifications' },
        () => void refreshUnreadNotificationCount()
      )
      .subscribe();

    return () => {
      isMounted = false;
      window.removeEventListener(
        'personal-notification-read',
        refreshUnreadNotificationCount
      );
      authListener.subscription.unsubscribe();
      void supabase.removeChannel(notificationChannel);
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

  const handleNotificationClick = () => {
    const noticeSection = document.getElementById('notices');

    if (location.pathname === '/' && noticeSection) {
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth';
      noticeSection.scrollIntoView({ behavior, block: 'start' });
      noticeSection.focus({ preventScroll: true });
      return;
    }

    navigate('/#notices');
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
          서울행 버스 신청
        </button>

        <div className={styles.rightGroup}>
          {isLoggedIn && (
            <button
              type="button"
              className={styles.notificationButton}
              aria-label={`개인 알림 ${unreadNotificationCount}건`}
              onClick={handleNotificationClick}
            >
              <Bell size={20} color="#1e40af" />
              {unreadNotificationCount > 0 && <strong>{unreadNotificationCount}</strong>}
            </button>
          )}
          <button
            type="button"
            className={styles.loginButton}
            aria-label={isLoggedIn ? '로그아웃' : '로그인'}
            onMouseEnter={() => {
              if (!isLoggedIn) preloadPublicRoute('/login');
            }}
            onFocus={() => {
              if (!isLoggedIn) preloadPublicRoute('/login');
            }}
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
            onMouseEnter={preloadSidebar}
            onFocus={preloadSidebar}
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
