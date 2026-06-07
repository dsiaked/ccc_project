import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Banknote,
  Bus,
  ChevronDown,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquare,
  Route,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

import {
  getAdminRole,
  getGlobalCampusNotices,
  type AdminRoleType,
} from '../../lib/adminService';
import {
  campusNoticeReadEventName,
  getUnreadCampusNotices,
} from '../../lib/adminNoticeReadState';
import { supabase } from '../../lib/supabase';
import styles from './AdminHeader.module.css';

interface AdminNavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  matchPaths?: string[];
  allowedRoles: AdminRoleType[];
}

const navItems: AdminNavItem[] = [
  {
    label: '대시보드',
    path: '/admin/global',
    icon: LayoutDashboard,
    allowedRoles: ['global_admin'],
  },
  {
    label: '준비 점검',
    path: '/admin/setup-check',
    icon: ClipboardCheck,
    allowedRoles: ['global_admin'],
  },
  {
    label: '신청 현황',
    path: '/admin/tickets',
    icon: Users,
    allowedRoles: ['global_admin'],
  },
  {
    label: '캠퍼스 관리',
    path: '/admin/campus',
    icon: Banknote,
    allowedRoles: ['campus_admin'],
  },
  {
    label: '본부 입금',
    path: '/admin/campus-transfer',
    icon: Banknote,
    allowedRoles: ['global_admin'],
  },
  {
    label: '문의',
    path: '/admin/campus-requests',
    icon: MessageSquare,
    allowedRoles: ['global_admin', 'campus_admin'],
  },
  {
    label: '배차',
    path: '/admin/allocation',
    icon: Route,
    matchPaths: [
      '/admin/bus-allocation',
      '/admin/allocation/logic',
      '/admin/allocation/result',
    ],
    allowedRoles: ['global_admin'],
  },
  {
    label: '개별 사용자 관리',
    path: '/admin/users',
    icon: Bus,
    matchPaths: ['/admin/personal-tickets', '/admin/campus-admins'],
    allowedRoles: ['global_admin'],
  },
  {
    label: '공지',
    path: '/admin/home-announcements',
    icon: Megaphone,
    allowedRoles: ['global_admin'],
  },
  {
    label: '설정',
    path: '/admin/participation-targets',
    icon: Settings,
    matchPaths: ['/admin/reservation-deadline'],
    allowedRoles: ['global_admin'],
  },
];

const AdminHeader = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [adminRole, setAdminRole] = useState<AdminRoleType | null>(null);
  const [campusNoticeCount, setCampusNoticeCount] = useState(0);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadAdminRole = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (isMounted) setAdminRole(null);
        return;
      }

      const role = await getAdminRole(session.user.id);

      if (isMounted) {
        setAdminRole(role?.role ?? null);
      }

      if (role?.role === 'campus_admin') {
        const noticesResult = await getGlobalCampusNotices();

        if (isMounted) {
          setCampusNoticeCount(
            (
              await getUnreadCampusNotices(
                session.user.id,
                noticesResult.data ?? []
              )
            ).length
          );
        }
      } else if (isMounted) {
        setCampusNoticeCount(0);
      }
    };

    loadAdminRole().catch(() => {
      if (isMounted) setAdminRole(null);
    });

    window.addEventListener(campusNoticeReadEventName, loadAdminRole);

    return () => {
      isMounted = false;
      window.removeEventListener(campusNoticeReadEventName, loadAdminRole);
    };
  }, []);

  useEffect(() => {
    if (!isMoreMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target as Node)
      ) {
        setIsMoreMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMoreMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMoreMenuOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  const isActive = (item: AdminNavItem) => {
    const paths = [item.path, ...(item.matchPaths ?? [])];

    return paths.some((path) => location.pathname === path);
  };

  const visibleNavItems = adminRole
    ? navItems.filter((item) => item.allowedRoles.includes(adminRole))
    : [];
  const secondaryGlobalPaths = new Set([
    '/admin/setup-check',
    '/admin/campus-transfer',
    '/admin/home-announcements',
    '/admin/participation-targets',
  ]);
  const primaryNavItems = visibleNavItems.filter(
    (item) =>
      adminRole !== 'global_admin' || !secondaryGlobalPaths.has(item.path)
  );
  const moreNavItems = visibleNavItems.filter(
    (item) =>
      adminRole === 'global_admin' && secondaryGlobalPaths.has(item.path)
  );
  const isMoreMenuActive = moreNavItems.some(isActive);
  const homePath = adminRole === 'campus_admin' ? '/admin/campus' : '/admin/global';

  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.logo}
        onClick={() => navigate(homePath)}
      >
        <span className={styles.logoMark}>CCC</span>
        <span>Bus Admin</span>
      </button>

      <nav className={styles.nav} aria-label="관리자 메뉴">
        {primaryNavItems.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              type="button"
              className={isActive(item) ? styles.activeNavItem : undefined}
              onClick={() => navigate(item.path)}
            >
              <Icon size={17} />
              <span>{item.label}</span>
              {adminRole === 'campus_admin' &&
                item.path === '/admin/campus-requests' &&
                campusNoticeCount > 0 && (
                  <span className={styles.navBadge}>{campusNoticeCount}</span>
                )}
            </button>
          );
        })}

        {moreNavItems.length > 0 && (
          <div className={styles.moreMenu} ref={moreMenuRef}>
            <button
              type="button"
              className={isMoreMenuActive ? styles.activeNavItem : undefined}
              onClick={() => setIsMoreMenuOpen((prev) => !prev)}
              aria-expanded={isMoreMenuOpen}
              aria-haspopup="menu"
            >
              <span>더보기</span>
              <ChevronDown
                size={15}
                className={isMoreMenuOpen ? styles.moreMenuChevronOpen : undefined}
              />
            </button>

            {isMoreMenuOpen && (
              <div className={styles.moreMenuPanel} role="menu">
                {moreNavItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.path}
                      type="button"
                      role="menuitem"
                      className={isActive(item) ? styles.activeMoreMenuItem : undefined}
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        navigate(item.path);
                      }}
                    >
                      <Icon size={17} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      <button
        type="button"
        className={styles.logoutButton}
        onClick={handleLogout}
      >
        <LogOut size={17} />
        <span>로그아웃</span>
      </button>
    </header>
  );
};

export default AdminHeader;
