import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Banknote,
  Bus,
  ChevronDown,
  ClipboardList,
  ClipboardCheck,
  FileCheck2,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  FlaskConical,
  History,
  Home,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import {
  campusRequestReadEventName,
  getAdminRoles,
  getGlobalCampusNotices,
  getUnreadCampusRequestIds,
  type AdminRole,
  type AdminRoleType,
} from '../../lib/adminService';
import { useAdminAuth } from '../../components/AdminAuthProvider';
import LogoutModal from '../../components/LogoutModal';
import {
  campusNoticeReadEventName,
  getUnreadCampusNotices,
} from '../../lib/adminNoticeReadState';
import { supabase } from '../../lib/supabase';
import { canAdminRoleAccess } from '../../utils/adminAccess';
import styles from './AdminHeader.module.css';

interface AdminNavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  stageGroup:
    | 'prepare'
    | 'application'
    | 'payment'
    | 'allocation'
    | 'boarding'
    | 'followUp';
  targetGroup: 'global' | 'individual' | 'campus' | 'boardingManager';
  matchPaths?: string[];
  activeTab?: 'requests' | 'notices' | 'home';
  allowedRoles: AdminRoleType[];
}

const navItems: AdminNavItem[] = [
  {
    label: '운영 대시보드',
    path: '/admin/dashboard',
    icon: LayoutDashboard,
    stageGroup: 'prepare',
    targetGroup: 'global',
    allowedRoles: ['global_admin'],
  },
  {
    label: '가입·신청·입금·배차 현황',
    path: '/admin/applications',
    icon: Users,
    stageGroup: 'application',
    targetGroup: 'individual',
    allowedRoles: ['global_admin'],
  },
  {
    label: '탑승 확인 관리',
    path: '/admin/boarding',
    icon: ClipboardList,
    stageGroup: 'boarding',
    targetGroup: 'boardingManager',
    allowedRoles: ['global_admin', 'boarding_manager'],
  },
  {
    label: '탑승 관리 간사님 권한·담당 호차 관리',
    path: '/admin/access/boarding-managers',
    icon: UserCog,
    stageGroup: 'boarding',
    targetGroup: 'boardingManager',
    allowedRoles: ['global_admin'],
  },
  {
    label: '개인 입금 · 캠퍼스별 송금 관리',
    path: '/admin/payments/final-review',
    icon: ClipboardCheck,
    stageGroup: 'payment',
    targetGroup: 'global',
    matchPaths: ['/admin/payments/campus-transfers'],
    allowedRoles: ['global_admin'],
  },
  {
    label: '캠퍼스 회계 순장님 페이지',
    path: '/admin/campus-dashboard',
    icon: Banknote,
    stageGroup: 'payment',
    targetGroup: 'campus',
    allowedRoles: ['campus_admin'],
  },
  {
    label: '공지·문의 관리',
    path: '/admin/communications',
    icon: MessageSquare,
    stageGroup: 'application',
    targetGroup: 'campus',
    allowedRoles: ['global_admin', 'campus_admin'],
  },
  {
    label: '배차 계산',
    path: '/admin/allocations',
    icon: Route,
    stageGroup: 'allocation',
    targetGroup: 'global',
    allowedRoles: ['global_admin'],
  },
  {
    label: '확정 배차 결과',
    path: '/admin/allocations/result',
    icon: FileCheck2,
    stageGroup: 'allocation',
    targetGroup: 'global',
    allowedRoles: ['global_admin'],
  },
  {
    label: '잔여 좌석 신청 관리',
    path: '/admin/payments/remaining-seats',
    icon: Bus,
    stageGroup: 'allocation',
    targetGroup: 'individual',
    allowedRoles: ['global_admin'],
  },
  {
    label: '사용자별 관리',
    path: '/admin/users',
    icon: Users,
    stageGroup: 'application',
    targetGroup: 'individual',
    allowedRoles: ['global_admin'],
  },
  {
    label: '운영 설정',
    path: '/admin/settings',
    icon: ClipboardCheck,
    stageGroup: 'prepare',
    targetGroup: 'global',
    allowedRoles: ['global_admin'],
  },
  {
    label: '관리자 도구',
    path: '/admin/system',
    icon: Wrench,
    stageGroup: 'prepare',
    targetGroup: 'global',
    allowedRoles: ['global_admin'],
  },
  {
    label: '시뮬레이션',
    path: '/admin/system/simulation',
    icon: FlaskConical,
    stageGroup: 'prepare',
    targetGroup: 'global',
    allowedRoles: ['global_admin'],
  },
  {
    label: '관리 작업 기록',
    path: '/admin/system/audit-logs',
    icon: History,
    stageGroup: 'followUp',
    targetGroup: 'global',
    allowedRoles: ['global_admin'],
  },
];

const stageNavGroups = [
  { id: 'prepare', label: '1. 운영 준비' },
  { id: 'application', label: '2. 신청 · 소통' },
  { id: 'allocation', label: '3. 배차' },
  { id: 'payment', label: '4. 입금 · 검토' },
  { id: 'boarding', label: '5. 탑승 · 운행' },
  { id: 'followUp', label: '6. 사후 관리' },
] as const;

const targetNavGroups = [
  { id: 'global', label: '전체 운영' },
  { id: 'individual', label: '개인' },
  { id: 'campus', label: '캠퍼스' },
  { id: 'boardingManager', label: '탑승 관리 간사님' },
] as const;

const sidebarCollapsedStorageKey = 'admin-sidebar-collapsed';
const sidebarViewStorageKey = 'admin-sidebar-view';
const expandedNavGroupsStorageKey = 'admin-expanded-nav-groups';
type SidebarView = 'stage' | 'target';
type NavGroupId = AdminNavItem['stageGroup'] | AdminNavItem['targetGroup'];
const rolePagePreloads: Record<'campus_admin' | 'boarding_manager', () => Promise<unknown>> = {
  campus_admin: () => import('./AdminCampusPage'),
  boarding_manager: () => import('./AdminBoardingPage'),
};

const AdminHeader = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    session,
    adminRole: activeAdminRole,
    switchAdminRole,
  } = useAdminAuth();
  const [switchableRoles, setSwitchableRoles] = useState<AdminRole[]>([]);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [activeRoleId, setActiveRoleId] = useState('');
  const [switchingRoleId, setSwitchingRoleId] = useState('');
  const [campusNoticeCount, setCampusNoticeCount] = useState(0);
  const [sidebarView, setSidebarView] = useState<SidebarView>(() => {
    try {
      return window.localStorage.getItem(sidebarViewStorageKey) === 'target'
        ? 'target'
        : 'stage';
    } catch {
      return 'stage';
    }
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(sidebarCollapsedStorageKey) === 'true';
    } catch {
      return false;
    }
  });
  const [expandedNavGroups, setExpandedNavGroups] = useState<Set<NavGroupId>>(
    () => {
      try {
        const storedGroups = JSON.parse(
          window.localStorage.getItem(expandedNavGroupsStorageKey) ?? '[]'
        ) as NavGroupId[];

        return new Set(['prepare', 'global', ...storedGroups]);
      } catch {
        return new Set(['prepare', 'global']);
      }
    }
  );

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
    let refreshTimerId: number | null = null;
    const scheduleBadgeRefresh = () => {
      if (refreshTimerId !== null) {
        window.clearTimeout(refreshTimerId);
      }
      refreshTimerId = window.setTimeout(() => {
        refreshTimerId = null;
        void refreshBadge();
      }, 250);
    };

    const channel = supabase
      .channel(`campus-request-badge-${activeAdminRole.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campus_requests' },
        scheduleBadgeRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campus_request_messages' },
        scheduleBadgeRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimerId !== null) {
        window.clearTimeout(refreshTimerId);
      }
      void supabase.removeChannel(channel);
    };
  }, [session, activeAdminRole]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    setIsLogoutModalOpen(false);
    navigate('/admin/login');
  };

  const handleAdminRoleChange = async (roleId: string) => {
    if (!session) {
      navigate('/admin/login');
      return;
    }

    setSwitchingRoleId(roleId);

    try {
      const targetRole = switchableRoles.find((role) => role.id === roleId);

      if (targetRole?.role === 'campus_admin' || targetRole?.role === 'boarding_manager') {
        await rolePagePreloads[targetRole.role]();
      }

      const role = await switchAdminRole(roleId);
      navigate(role.role === 'boarding_manager' ? '/admin/boarding' : '/admin/campus-dashboard');
    } finally {
      setSwitchingRoleId('');
    }
  };

  const handleNavItemClick = async (item: AdminNavItem) => {
    if (!session || !activeAdminRole) {
      navigate('/admin/login');
      return;
    }

    if (canAdminRoleAccess(activeAdminRole.role, item.allowedRoles)) {
      navigate(item.path);
      return;
    }

    const targetRole = switchableRoles.find((role) =>
      item.allowedRoles.includes(role.role)
    );

    if (!targetRole) return;

    setSwitchingRoleId(targetRole.id);

    try {
      if (targetRole.role === 'campus_admin' || targetRole.role === 'boarding_manager') {
        await rolePagePreloads[targetRole.role]();
      }

      await switchAdminRole(targetRole.id);
      navigate(item.path);
    } finally {
      setSwitchingRoleId('');
    }
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

  const handleSidebarViewChange = (view: SidebarView) => {
    setSidebarView(view);

    try {
      window.localStorage.setItem(sidebarViewStorageKey, view);
    } catch {
      // The selected view remains usable when browser storage is unavailable.
    }
  };

  const handleNavGroupToggle = (groupId: NavGroupId) => {
    setExpandedNavGroups((previous) => {
      const next = new Set(previous);

      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      try {
        window.localStorage.setItem(
          expandedNavGroupsStorageKey,
          JSON.stringify([...next])
        );
      } catch {
        // The grouped navigation still works when browser storage is unavailable.
      }

      return next;
    });
  };

  const isActive = (item: AdminNavItem) => {
    const itemPath = item.path.split('?')[0];
    const paths = [itemPath, ...(item.matchPaths ?? [])];
    const isPathActive = paths.some((path) => location.pathname === path);

    if (!isPathActive || !item.activeTab) return isPathActive;

    const currentTab = new URLSearchParams(location.search).get('tab');

    return item.activeTab === 'requests'
      ? currentTab === null || currentTab === 'requests'
      : currentTab === item.activeTab;
  };

  const adminRole = activeAdminRole?.role ?? null;
  const visibleNavItems = adminRole
    ? navItems.filter(
        (item) =>
          canAdminRoleAccess(adminRole, item.allowedRoles) ||
          switchableRoles.some((role) =>
            canAdminRoleAccess(role.role, item.allowedRoles)
          )
      )
    : [];
  const isCampusAdmin = adminRole === 'campus_admin';
  const effectiveSidebarView = isCampusAdmin ? 'target' : sidebarView;
  const navGroups =
    effectiveSidebarView === 'stage' ? stageNavGroups : targetNavGroups;
  const activeItem = visibleNavItems.find((item) => isActive(item));
  const activeGroup =
    effectiveSidebarView === 'stage'
      ? activeItem?.stageGroup
      : activeItem?.targetGroup;

  return (
    <>
      <header
      className={`${styles.header} ${
        isSidebarCollapsed ? styles.collapsed : ''
      }`}
      aria-busy={Boolean(switchingRoleId)}
    >
      <div className={styles.sidebarTop}>
        <button
          type="button"
          className={styles.logo}
          onClick={() => navigate('/')}
          aria-label="서비스 홈 화면으로 이동"
          title={isSidebarCollapsed ? '홈 화면으로' : undefined}
        >
          <span className={styles.logoMark}>CCC</span>
          <span className={styles.logoLabel}>버스 관리자</span>
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

        {switchingRoleId && (
          <span className={styles.switchingIndicator} aria-live="polite">
            <LoaderCircle size={16} />
            <span>권한 전환 중</span>
          </span>
        )}
      </div>

      {!isCampusAdmin && (
        <div
          className={styles.viewSwitcher}
          role="group"
          aria-label="관리자 메뉴 분류 방식"
        >
          <button
            type="button"
            className={sidebarView === 'stage' ? styles.activeView : undefined}
            onClick={() => handleSidebarViewChange('stage')}
            aria-pressed={sidebarView === 'stage'}
            title={isSidebarCollapsed ? '단계별 메뉴' : undefined}
          >
            <ClipboardCheck size={15} />
            <span>단계별</span>
          </button>
          <button
            type="button"
            className={sidebarView === 'target' ? styles.activeView : undefined}
            onClick={() => handleSidebarViewChange('target')}
            aria-pressed={sidebarView === 'target'}
            title={isSidebarCollapsed ? '대상별 메뉴' : undefined}
          >
            <Users size={15} />
            <span>대상별</span>
          </button>
        </div>
      )}

      <nav
        className={`${styles.nav} ${isCampusAdmin ? styles.simpleNav : ''}`}
        aria-label="관리자 메뉴"
      >
        {navGroups.map((group) => {
          const groupItems = visibleNavItems.filter(
            (item) =>
              (effectiveSidebarView === 'stage'
                ? item.stageGroup
                : item.targetGroup) === group.id
          );

          if (groupItems.length === 0) return null;
          const isGroupExpanded =
            isCampusAdmin ||
            expandedNavGroups.has(group.id) ||
            activeGroup === group.id;

          return (
            <div className={styles.navGroup} key={group.id}>
              {!isCampusAdmin && (
                <button
                  type="button"
                  className={styles.navGroupToggle}
                  onClick={() => handleNavGroupToggle(group.id)}
                  aria-expanded={isGroupExpanded}
                  aria-controls={`admin-nav-group-${group.id}`}
                >
                  <span>{group.label}</span>
                  <ChevronDown size={14} />
                </button>
              )}
              <div
                id={`admin-nav-group-${group.id}`}
                className={`${styles.navGroupItems} ${
                  isGroupExpanded ? '' : styles.navGroupItemsCollapsed
                }`}
              >
                {groupItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.path}
                      type="button"
                      className={isActive(item) ? styles.activeNavItem : undefined}
                      onClick={() => void handleNavItemClick(item)}
                      disabled={Boolean(switchingRoleId)}
                      onMouseEnter={() => {
                        const targetRole = switchableRoles.find((role) =>
                          item.allowedRoles.includes(role.role)
                        );

                        if (
                          targetRole?.role === 'campus_admin' ||
                          targetRole?.role === 'boarding_manager'
                        ) {
                          void rolePagePreloads[targetRole.role]();
                        }
                      }}
                      aria-current={isActive(item) ? 'page' : undefined}
                      aria-label={item.label}
                      title={isSidebarCollapsed ? item.label : undefined}
                    >
                      <Icon size={18} />
                      <span className={styles.navItemLabel}>{item.label}</span>
                      {item.path === '/admin/communications' &&
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
              aria-label="사용 권한 선택"
              disabled={Boolean(switchingRoleId)}
              onChange={(event) =>
                void handleAdminRoleChange(event.target.value)
              }
            >
              {switchableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.role === 'boarding_manager'
                    ? '탑승 관리 간사님 역할'
                    : `캠퍼스 회계 순장님 · ${[role.district, role.team, role.campus]
                        .filter(Boolean)
                        .join(' / ')}`}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          className={styles.homeButton}
          onClick={() => navigate('/')}
          aria-label="홈 화면으로 이동"
          title={isSidebarCollapsed ? '홈 화면으로' : undefined}
        >
          <Home size={17} />
          <span className={styles.homeLabel}>홈 화면으로</span>
        </button>

        <button
          type="button"
          className={styles.logoutButton}
          onClick={() => setIsLogoutModalOpen(true)}
          aria-label="로그아웃"
          title={isSidebarCollapsed ? '로그아웃' : undefined}
        >
          <LogOut size={17} />
          <span className={styles.logoutLabel}>로그아웃</span>
        </button>
      </div>
      </header>

      {isLogoutModalOpen && (
        <LogoutModal
          onClose={() => setIsLogoutModalOpen(false)}
          onConfirm={handleLogout}
        />
      )}
    </>
  );
};

export default AdminHeader;
