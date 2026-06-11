import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Banknote,
  Bus,
  CircleAlert,
  ChevronDown,
  ClipboardList,
  ClipboardCheck,
  FileCheck2,
  LayoutDashboard,
  LoaderCircle,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  Search,
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
  clearAdminRoleCache,
  getAdminRoles,
  getUnreadCampusRequestIds,
  type AdminRole,
  type AdminRoleType,
} from '../../lib/adminService';
import { useAdminAuth } from '../../components/AdminAuthProvider';
import { supabase } from '../../lib/supabase';
import {
  getUnreadPersonalInquiryCount,
  personalInquiryChangedEventName,
  personalInquiryReadEventName,
} from '../../lib/personalInquiryService';
import { canAdminRoleAccess } from '../../utils/adminAccess';
import styles from './AdminHeader.module.css';

interface AdminNavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  keywords?: string[];
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
    label: '특수상황 기록',
    path: '/admin/boarding/exceptions',
    icon: CircleAlert,
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
    matchPaths: ['/admin/communications/personal'],
    stageGroup: 'application',
    targetGroup: 'campus',
    allowedRoles: ['global_admin'],
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
    label: '운영 종료 점검',
    path: '/admin/system/closeout',
    icon: ClipboardCheck,
    stageGroup: 'followUp',
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

const searchableAdminItems: AdminNavItem[] = [
  ...navItems,
  {
    label: '캠퍼스 회계 순장님 관리',
    path: '/admin/access/campus-admins',
    icon: UserCog,
    keywords: ['캠퍼스 관리자', '회계 순장님', '권한'],
    stageGroup: 'prepare',
    targetGroup: 'campus',
    allowedRoles: ['global_admin'],
  },
  {
    label: '참여 목표 설정',
    path: '/admin/settings/participation-targets',
    icon: ClipboardCheck,
    keywords: ['목표 인원', '참여 인원'],
    stageGroup: 'prepare',
    targetGroup: 'global',
    allowedRoles: ['global_admin'],
  },
  {
    label: '신청 마감 설정',
    path: '/admin/settings/reservation-deadline',
    icon: ClipboardCheck,
    keywords: ['예약 마감', '마감 시간', '신청 기간'],
    stageGroup: 'prepare',
    targetGroup: 'global',
    allowedRoles: ['global_admin'],
  },
  {
    label: '배차 작업 공간',
    path: '/admin/allocations/workspace',
    icon: Route,
    keywords: ['배차 편집', '수동 배차'],
    stageGroup: 'allocation',
    targetGroup: 'global',
    allowedRoles: ['global_admin'],
  },
  {
    label: '배차 로직 안내',
    path: '/admin/allocations/logic',
    icon: Route,
    keywords: ['배차 기준', '알고리즘'],
    stageGroup: 'allocation',
    targetGroup: 'global',
    allowedRoles: ['global_admin'],
  },
  {
    label: 'AI 운영 보고서',
    path: '/admin/system/ai-reports',
    icon: ClipboardList,
    keywords: ['AI 보고서', '운영 분석'],
    stageGroup: 'followUp',
    targetGroup: 'global',
    allowedRoles: ['global_admin'],
  },
  {
    label: 'AI 활동 로그',
    path: '/admin/system/ai-reports/logs',
    icon: History,
    keywords: ['AI 로그', '활동 기록'],
    stageGroup: 'followUp',
    targetGroup: 'global',
    allowedRoles: ['global_admin'],
  },
  {
    label: '권한 등록 코드 관리',
    path: '/admin/system/invitation-codes',
    icon: UserCog,
    keywords: ['초대 코드', '관리자 등록', '권한 코드'],
    stageGroup: 'prepare',
    targetGroup: 'global',
    allowedRoles: ['global_admin'],
  },
];

const normalizeSearchText = (value: string) =>
  value.toLocaleLowerCase().replace(/\s+/g, '');

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
const closeoutReadyStorageKey = 'admin-operation-closeout-ready';
const closeoutReadyEventName = 'admin-operation-closeout-ready-change';
type SidebarView = 'stage' | 'target';
type NavGroupId = AdminNavItem['stageGroup'] | AdminNavItem['targetGroup'];
const rolePagePreloads: Record<'campus_admin' | 'boarding_manager', () => Promise<unknown>> = {
  campus_admin: () => import('./AdminCampusPage'),
  boarding_manager: () => import('./AdminBoardingPage'),
};
const scopedRoleLandingPaths: Record<'campus_admin' | 'boarding_manager', string> = {
  campus_admin: '/admin/campus-dashboard',
  boarding_manager: '/admin/boarding',
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
  const [switchingRoleId, setSwitchingRoleId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [campusNoticeCount, setCampusNoticeCount] = useState(0);
  const [isCloseoutReady, setIsCloseoutReady] = useState(() => {
    try {
      return window.localStorage.getItem(closeoutReadyStorageKey) === 'true';
    } catch {
      return false;
    }
  });
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
    if (activeAdminRole?.role !== 'global_admin') return;

    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchOpen(true);
        window.setTimeout(() => searchInputRef.current?.focus());
      }
    };

    window.addEventListener('keydown', handleSearchShortcut);
    return () => window.removeEventListener('keydown', handleSearchShortcut);
  }, [activeAdminRole?.role]);

  useEffect(() => {
    const handleCloseoutReadyChange = (event: Event) => {
      setIsCloseoutReady(
        (event as CustomEvent<{ ready?: boolean }>).detail?.ready === true
      );
    };
    window.addEventListener(closeoutReadyEventName, handleCloseoutReadyChange);
    return () =>
      window.removeEventListener(closeoutReadyEventName, handleCloseoutReadyChange);
  }, []);

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

      clearAdminRoleCache(session.user.id);
      const roles = await getAdminRoles(session.user.id);

      if (isMounted) {
        setSwitchableRoles(
          roles.filter((item) => item.role !== 'global_admin')
        );
      }

      if (activeAdminRole?.role === 'global_admin') {
        const [unreadRequestIds, unreadPersonalInquiryCount] = await Promise.all([
          getUnreadCampusRequestIds(),
          getUnreadPersonalInquiryCount(),
        ]);

        if (isMounted) {
          setCampusNoticeCount(
            unreadRequestIds.size + unreadPersonalInquiryCount
          );
        }
      } else if (isMounted) {
        setCampusNoticeCount(0);
      }
    };

    loadAdminRole().catch(() => {
      if (isMounted) setCampusNoticeCount(0);
    });

    window.addEventListener(campusRequestReadEventName, loadAdminRole);
    window.addEventListener(personalInquiryReadEventName, loadAdminRole);
    window.addEventListener(personalInquiryChangedEventName, loadAdminRole);

    return () => {
      isMounted = false;
      window.removeEventListener(campusRequestReadEventName, loadAdminRole);
      window.removeEventListener(personalInquiryReadEventName, loadAdminRole);
      window.removeEventListener(personalInquiryChangedEventName, loadAdminRole);
    };
  }, [session, activeAdminRole]);

  useEffect(() => {
    if (
      !session ||
      activeAdminRole?.role !== 'global_admin'
    ) {
      return;
    }

    const refreshBadge = async () => {
      const unreadRequestIds = await getUnreadCampusRequestIds();
      const unreadPersonalInquiryCount = await getUnreadPersonalInquiryCount();

      setCampusNoticeCount(
        unreadRequestIds.size + unreadPersonalInquiryCount
      );
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'personal_inquiries' },
        scheduleBadgeRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'personal_inquiry_messages' },
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

  useEffect(() => {
    if (!session) return;

    const refreshRoles = () => {
      clearAdminRoleCache(session.user.id);
      void getAdminRoles(session.user.id).then((roles) => {
        setSwitchableRoles(
          roles.filter((item) => item.role !== 'global_admin')
        );
      }).catch(() => undefined);
    };

    const channel = supabase
      .channel(`admin-header-roles-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_roles',
          filter: `user_id=eq.${session.user.id}`,
        },
        refreshRoles
      )
      .subscribe();

    refreshRoles();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session]);

  const handleAdminRoleChange = async (roleId: string) => {
    if (!session) {
      navigate('/login');
      return;
    }

    const targetRole =
      activeAdminRole?.id === roleId
        ? activeAdminRole
        : switchableRoles.find((role) => role.id === roleId);

    if (
      targetRole?.role !== 'campus_admin' &&
      targetRole?.role !== 'boarding_manager'
    ) {
      return;
    }

    setSwitchingRoleId(roleId);

    try {
      await rolePagePreloads[targetRole.role]();
      await switchAdminRole(roleId);
      navigate(scopedRoleLandingPaths[targetRole.role]);
    } finally {
      setSwitchingRoleId('');
    }
  };

  const handleNavItemClick = async (item: AdminNavItem) => {
    if (!session || !activeAdminRole) {
      navigate('/login');
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
  const availableScopedRoles =
    activeAdminRole &&
    activeAdminRole.role !== 'global_admin' &&
    !switchableRoles.some((role) => role.id === activeAdminRole.id)
      ? [activeAdminRole, ...switchableRoles]
      : switchableRoles;
  const visibleNavItems = adminRole
    ? navItems.filter(
        (item) =>
          canAdminRoleAccess(adminRole, item.allowedRoles) ||
          availableScopedRoles.some((role) =>
            canAdminRoleAccess(role.role, item.allowedRoles)
          )
      )
    : [];
  const scopedAdminFunctionItems = navItems.filter((item) =>
    item.allowedRoles.some(
      (role) => role === 'campus_admin' || role === 'boarding_manager'
    )
  );
  const canUseAdminFunction = (item: AdminNavItem) =>
    adminRole !== null &&
    (canAdminRoleAccess(adminRole, item.allowedRoles) ||
      availableScopedRoles.some((role) =>
        canAdminRoleAccess(role.role, item.allowedRoles)
      ));
  const accessibleScopedAdminFunctionItems = scopedAdminFunctionItems.filter(
    canUseAdminFunction
  );
  const sharedScopedAdminFunctionItems = accessibleScopedAdminFunctionItems.filter(
    (item) =>
      item.path !== scopedRoleLandingPaths.campus_admin &&
      item.path !== scopedRoleLandingPaths.boarding_manager
  );
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const searchResults = normalizedSearchQuery
    ? searchableAdminItems.filter((item) => {
        if (!canUseAdminFunction(item)) return false;

        return normalizeSearchText(
          [item.label, item.path, ...(item.keywords ?? [])].join(' ')
        ).includes(normalizedSearchQuery);
      })
    : [];
  const visibleSearchResults = searchResults.slice(0, 8);
  const isCampusAdmin = adminRole === 'campus_admin';
  const isBoardingManager = adminRole === 'boarding_manager';
  const hasCompactMobileHeader = isCampusAdmin || isBoardingManager;
  const effectiveSidebarView = isCampusAdmin ? 'target' : sidebarView;
  const navGroups =
    effectiveSidebarView === 'stage' ? stageNavGroups : targetNavGroups;
  const activeItem = visibleNavItems.find((item) => isActive(item));
  const activeGroup =
    effectiveSidebarView === 'stage'
      ? activeItem?.stageGroup
      : activeItem?.targetGroup;
  const activeItemIsRoleLandingPage =
    activeItem?.path === scopedRoleLandingPaths.campus_admin ||
    activeItem?.path === scopedRoleLandingPaths.boarding_manager;
  const handleSwitcherChange = (value: string) => {
    if (value.startsWith('role:')) {
      void handleAdminRoleChange(value.slice('role:'.length));
      return;
    }

    if (value.startsWith('nav:')) {
      const item = sharedScopedAdminFunctionItems.find(
        (navItem) => navItem.path === value.slice('nav:'.length)
      );

      if (item) void handleNavItemClick(item);
    }
  };
  const handleSearchItemClick = async (item: AdminNavItem) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setActiveSearchIndex(0);
    await handleNavItemClick(item);
  };
  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setIsSearchOpen(false);
      searchInputRef.current?.blur();
      return;
    }

    if (visibleSearchResults.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSearchIndex((index) => (index + 1) % visibleSearchResults.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSearchIndex(
        (index) =>
          (index - 1 + visibleSearchResults.length) % visibleSearchResults.length
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void handleSearchItemClick(
        visibleSearchResults[activeSearchIndex] ?? visibleSearchResults[0]
      );
    }
  };
  const roleSwitcher =
    adminRole !== null && adminRole !== 'global_admin' ? (
      <label className={styles.campusSwitcher}>
        <span>관리자 메뉴</span>
        <select
          value={
            activeItemIsRoleLandingPage
              ? `role:${activeAdminRole?.id ?? ''}`
              : `nav:${activeItem?.path ?? sharedScopedAdminFunctionItems[0]?.path ?? ''}`
          }
          aria-label="관리자 메뉴 선택"
          disabled={Boolean(switchingRoleId)}
          onChange={(event) => handleSwitcherChange(event.target.value)}
        >
          {availableScopedRoles.map((role) => (
            <option key={role.id} value={`role:${role.id}`}>
              {role.role === 'campus_admin'
                ? `캠퍼스 회계 순장님 페이지 · ${[
                    role.district,
                    role.team,
                    role.campus,
                  ]
                    .filter(Boolean)
                    .join(' / ')}`
                : '탑승 확인 관리'}
            </option>
          ))}
          {sharedScopedAdminFunctionItems.map((item) => (
            <option key={item.path} value={`nav:${item.path}`}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  return (
    <>
      <header
      className={`${styles.header} ${
        isSidebarCollapsed ? styles.collapsed : ''
      } ${hasCompactMobileHeader ? styles.compactRoleHeader : ''}`}
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

      {isCampusAdmin && roleSwitcher && (
        <div className={styles.topRoleSwitcher}>{roleSwitcher}</div>
      )}

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

      {adminRole === 'global_admin' && (
        <div className={styles.functionSearch}>
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            placeholder="관리자 기능 검색"
            aria-label="관리자 기능 검색"
            aria-expanded={isSearchOpen && Boolean(searchQuery)}
            aria-controls="admin-function-search-results"
            onFocus={() => setIsSearchOpen(true)}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setActiveSearchIndex(0);
              setIsSearchOpen(true);
            }}
            onKeyDown={handleSearchKeyDown}
          />
          <kbd>Ctrl K</kbd>
          {isSearchOpen && searchQuery && (
            <div
              id="admin-function-search-results"
              className={styles.searchResults}
              role="listbox"
            >
              {searchResults.length > 0 ? (
                visibleSearchResults.map((item, index) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.path}
                      type="button"
                      role="option"
                      aria-selected={index === activeSearchIndex}
                      className={
                        index === activeSearchIndex
                          ? styles.activeSearchResult
                          : undefined
                      }
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveSearchIndex(index)}
                      onClick={() => void handleSearchItemClick(item)}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </button>
                  );
                })
              ) : (
                <p>사용 가능한 기능을 찾지 못했습니다.</p>
              )}
            </div>
          )}
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
                      {item.path === '/admin/system/closeout' &&
                        isCloseoutReady && (
                          <span className={`${styles.navBadge} ${styles.readyNavBadge}`}>
                            마감 가능
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
        <div className={styles.mobileRoleSwitcher}>{roleSwitcher}</div>
        <div className={styles.desktopRoleSwitcher}>
          {!isCampusAdmin && roleSwitcher}
        </div>

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

      </div>
      </header>
    </>
  );
};

export default AdminHeader;
