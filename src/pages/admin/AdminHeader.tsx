import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Banknote,
  Bus,
  ClipboardList,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  FlaskConical,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

import {
  campusRequestReadEventName,
  getAdminRoles,
  getGlobalCampusNotices,
  getUnreadCampusRequestIds,
  setActiveAdminRole,
  type AdminRole,
  type AdminRoleType,
} from '../../lib/adminService';
import { useAdminAuth } from '../../components/AdminAuthProvider';
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
  group: 'overview' | 'operations' | 'management';
  matchPaths?: string[];
  allowedRoles: AdminRoleType[];
}

const navItems: AdminNavItem[] = [
  {
    label: '대시보드',
    path: '/admin/global',
    icon: LayoutDashboard,
    group: 'overview',
    allowedRoles: ['global_admin'],
  },
  {
    label: '운영 초기값 설정',
    path: '/admin/setup-check',
    icon: ClipboardCheck,
    group: 'management',
    allowedRoles: ['global_admin'],
  },
  {
    label: '시뮬레이션',
    path: '/admin/simulation',
    icon: FlaskConical,
    group: 'management',
    allowedRoles: ['global_admin'],
  },
  {
    label: '신청 현황',
    path: '/admin/tickets',
    icon: Users,
    group: 'overview',
    allowedRoles: ['global_admin'],
  },
  {
    label: '선탑자 탑승 현황',
    path: '/admin/boarding',
    icon: ClipboardList,
    group: 'overview',
    allowedRoles: ['global_admin', 'boarding_manager'],
  },
  {
    label: '캠퍼스 관리',
    path: '/admin/campus',
    icon: Banknote,
    group: 'overview',
    allowedRoles: ['campus_admin'],
  },
  {
    label: '본부 입금',
    path: '/admin/campus-transfer',
    icon: Banknote,
    group: 'operations',
    allowedRoles: ['global_admin'],
  },
  {
    label: '공지·문의',
    path: '/admin/campus-requests',
    icon: MessageSquare,
    group: 'overview',
    allowedRoles: ['global_admin', 'campus_admin'],
  },
  {
    label: '배차',
    path: '/admin/allocation',
    icon: Route,
    group: 'operations',
    matchPaths: [
      '/admin/bus-allocation',
      '/admin/allocation/logic',
      '/admin/allocation/result',
      '/admin/remaining-seat-sales',
    ],
    allowedRoles: ['global_admin'],
  },
  {
    label: '개별 사용자 관리',
    path: '/admin/users',
    icon: Bus,
    group: 'management',
    matchPaths: [
      '/admin/personal-tickets',
      '/admin/campus-admins',
      '/admin/boarding-managers',
      '/admin/campus-issues',
    ],
    allowedRoles: ['global_admin'],
  },
  {
    label: '설정',
    path: '/admin/participation-targets',
    icon: Settings,
    group: 'management',
    matchPaths: ['/admin/reservation-deadline'],
    allowedRoles: ['global_admin'],
  },
];

const navGroups = [
  { id: 'overview', label: '운영 현황' },
  { id: 'operations', label: '배차 · 정산' },
  { id: 'management', label: '관리 · 설정' },
] as const;

const sidebarCollapsedStorageKey = 'admin-sidebar-collapsed';

const AdminHeader = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, adminRole: activeAdminRole } = useAdminAuth();
  const [switchableRoles, setSwitchableRoles] = useState<AdminRole[]>([]);
  const [activeRoleId, setActiveRoleId] = useState('');
  const [campusNoticeCount, setCampusNoticeCount] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(sidebarCollapsedStorageKey) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let isMounted = true;

    const loadAdminRole = async () => {
      if (!session) {
        if (isMounted) {
          setSwitchableRoles([]);
          setCampusNoticeCount(0);
        }
        return;
      }

      const roles = await getAdminRoles(session.user.id);

      if (isMounted) {
        setSwitchableRoles(
          roles.filter((item) => item.role !== 'global_admin')
        );
        setActiveRoleId(activeAdminRole?.id ?? '');
      }

      if (
        activeAdminRole?.role === 'campus_admin' ||
        activeAdminRole?.role === 'global_admin'
      ) {
        const [unreadRequestIds, noticesResult] = await Promise.all([
          getUnreadCampusRequestIds(),
          activeAdminRole.role === 'campus_admin'
            ? getGlobalCampusNotices()
            : Promise.resolve({ data: [], error: null }),
        ]);
        const unreadNoticeCount =
          activeAdminRole.role === 'campus_admin'
            ? (
                await getUnreadCampusNotices(
                  session.user.id,
                  noticesResult.data ?? []
                )
              ).length
            : 0;

        if (isMounted) {
          setCampusNoticeCount(unreadRequestIds.size + unreadNoticeCount);
        }
      } else if (isMounted) {
        setCampusNoticeCount(0);
      }
    };

    loadAdminRole().catch(() => {
      if (isMounted) setSwitchableRoles([]);
    });

    window.addEventListener(campusNoticeReadEventName, loadAdminRole);
    window.addEventListener(campusRequestReadEventName, loadAdminRole);

    return () => {
      isMounted = false;
      window.removeEventListener(campusNoticeReadEventName, loadAdminRole);
      window.removeEventListener(campusRequestReadEventName, loadAdminRole);
    };
  }, [session, activeAdminRole]);

  useEffect(() => {
    if (
      !session ||
      (activeAdminRole?.role !== 'campus_admin' &&
        activeAdminRole?.role !== 'global_admin')
    ) {
      return;
    }

    const refreshBadge = async () => {
      const unreadRequestIds = await getUnreadCampusRequestIds();
      let unreadNoticeCount = 0;

      if (activeAdminRole.role === 'campus_admin') {
        const noticesResult = await getGlobalCampusNotices();
        unreadNoticeCount = (
          await getUnreadCampusNotices(
            session.user.id,
            noticesResult.data ?? []
          )
        ).length;
      }

      setCampusNoticeCount(unreadRequestIds.size + unreadNoticeCount);
    };

    const channel = supabase
      .channel(`campus-request-badge-${activeAdminRole.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campus_requests' },
        () => void refreshBadge()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campus_request_messages' },
        () => void refreshBadge()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session, activeAdminRole]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  const handleAdminRoleChange = async (roleId: string) => {
    if (!session) {
      navigate('/admin/login');
      return;
    }

    await setActiveAdminRole(session.user.id, roleId);
    window.location.reload();
  };

  const handleSidebarToggle = () => {
    setIsSidebarCollapsed((previous) => {
      const next = !previous;

      try {
        window.localStorage.setItem(sidebarCollapsedStorageKey, String(next));
      } catch {
        // The sidebar still works when browser storage is unavailable.
      }

      return next;
    });
  };

  const isActive = (item: AdminNavItem) => {
    const paths = [item.path, ...(item.matchPaths ?? [])];

    return paths.some((path) => location.pathname === path);
  };

  const adminRole = activeAdminRole?.role ?? null;
  const visibleNavItems = adminRole
    ? navItems.filter((item) => item.allowedRoles.includes(adminRole))
    : [];
  const homePath =
    adminRole === 'campus_admin'
      ? '/admin/campus'
      : adminRole === 'boarding_manager'
        ? '/admin/boarding'
        : '/admin/global';

  return (
    <header
      className={`${styles.header} ${
        isSidebarCollapsed ? styles.collapsed : ''
      }`}
    >
      <div className={styles.sidebarTop}>
        <button
          type="button"
          className={styles.logo}
          onClick={() => navigate(homePath)}
          aria-label="관리자 홈으로 이동"
          title={isSidebarCollapsed ? '관리자 홈' : undefined}
        >
          <span className={styles.logoMark}>CCC</span>
          <span className={styles.logoLabel}>Bus Admin</span>
        </button>

        <button
          type="button"
          className={styles.collapseButton}
          onClick={handleSidebarToggle}
          aria-label={isSidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
          aria-pressed={isSidebarCollapsed}
          title={isSidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          {isSidebarCollapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>
      </div>

      <nav className={styles.nav} aria-label="관리자 메뉴">
        {navGroups.map((group) => {
          const groupItems = visibleNavItems.filter(
            (item) => item.group === group.id
          );

          if (groupItems.length === 0) return null;

          return (
            <div className={styles.navGroup} key={group.id}>
              <span className={styles.navGroupLabel}>{group.label}</span>
              <div className={styles.navGroupItems}>
                {groupItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.path}
                      type="button"
                      className={isActive(item) ? styles.activeNavItem : undefined}
                      onClick={() => navigate(item.path)}
                      aria-current={isActive(item) ? 'page' : undefined}
                      aria-label={item.label}
                      title={isSidebarCollapsed ? item.label : undefined}
                    >
                      <Icon size={18} />
                      <span className={styles.navItemLabel}>{item.label}</span>
                      {item.path === '/admin/campus-requests' &&
                        campusNoticeCount > 0 && (
                          <span className={styles.navBadge}>
                            {campusNoticeCount}
                          </span>
                        )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className={styles.headerActions}>
        {adminRole !== 'global_admin' && switchableRoles.length > 1 && (
          <label className={styles.campusSwitcher}>
            <span>사용 권한</span>
            <select
              value={activeRoleId}
              onChange={(event) =>
                void handleAdminRoleChange(event.target.value)
              }
            >
              {switchableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.role === 'boarding_manager'
                    ? '선탑자'
                    : [role.district, role.team, role.campus]
                        .filter(Boolean)
                        .join(' / ')}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          className={styles.logoutButton}
          onClick={handleLogout}
          aria-label="로그아웃"
          title={isSidebarCollapsed ? '로그아웃' : undefined}
        >
          <LogOut size={17} />
          <span className={styles.logoutLabel}>로그아웃</span>
        </button>
      </div>
    </header>
  );
};

export default AdminHeader;
