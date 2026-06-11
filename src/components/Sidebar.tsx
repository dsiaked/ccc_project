import { useEffect, useRef, useState } from 'react';
import {
  X,
  LogIn,
  Bus,
  Ticket,
  LogOut,
  ShieldCheck,
  Home,
  KeyRound,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  getAdminRole,
  getAdminRoles,
  getGlobalCampusNotices,
  setActiveAdminRole,
  type AdminRole,
} from '../lib/adminService';
import {
  campusNoticeReadEventName,
  getUnreadCampusNotices,
} from '../lib/adminNoticeReadState';
import {
  getPublicContactInfo,
  type ContactInfo,
} from '../lib/contactInfoService';
import { getReservationDeadline } from '../lib/reservationDeadlineService';
import { createLoginRequiredRedirectState } from '../utils/redirect';
import LoginRequiredModal from './LoginRequiredModal';
import LogoutModal from './LogoutModal';
import styles from './Sidebar.module.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Profile {
  name: string | null;
  email: string | null;
}

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isMountedRef = useRef(false);
  const loadUserRequestIdRef = useRef(0);
  const sidebarRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [loginRequiredPath, setLoginRequiredPath] = useState<string | null>(
    null
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [adminRoles, setAdminRoles] = useState<AdminRole[]>([]);
  const [campusNoticeCount, setCampusNoticeCount] = useState(0);
  const [isReservationClosed, setIsReservationClosed] = useState(false);
  const [hasConfirmedTicket, setHasConfirmedTicket] = useState<boolean | null>(
    null
  );
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    email: '',
    phone: '',
  });

  const handleMenuClick = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleProtectedMenuClick = (path: string) => {
    if (!isLoggedIn) {
      setLoginRequiredPath(path);
      onClose();
      return;
    }

    handleMenuClick(path);
  };

  const loadUser = async () => {
    const requestId = (loadUserRequestIdRef.current += 1);
    const isActiveRequest = () =>
      isMountedRef.current && loadUserRequestIdRef.current === requestId;
    const { data } = await supabase.auth.getSession();

    if (!isActiveRequest()) return;

    if (!data.session?.user) {
      setIsLoggedIn(false);
      setProfile(null);
      setAdminRole(null);
      setAdminRoles([]);
      setCampusNoticeCount(0);
      setHasConfirmedTicket(false);
      return;
    }

    setIsLoggedIn(true);
    setHasConfirmedTicket(null);
    const [role, roles] = await Promise.all([
      getAdminRole(data.session.user.id),
      getAdminRoles(data.session.user.id),
    ]);

    if (!isActiveRequest()) return;

    setAdminRole(role);
    setAdminRoles(roles);

    if (roles.some((item) => item.role === 'campus_admin')) {
      const noticesResult = await getGlobalCampusNotices();

      if (!isActiveRequest()) return;

      setCampusNoticeCount(
        (
          await getUnreadCampusNotices(
            data.session.user.id,
            noticesResult.data ?? []
          )
        ).length
      );
    } else {
      setCampusNoticeCount(0);
    }

    const { data: reservationData, error: reservationError } = await supabase
      .from('reservations')
      .select('confirmed_ticket')
      .eq('user_id', data.session.user.id)
      .maybeSingle();

    if (!isActiveRequest()) return;

    if (reservationError) {
      console.error('확정표 보유 여부 조회 실패:', reservationError);
    } else {
      setHasConfirmedTicket(Boolean(reservationData?.confirmed_ticket));
    }

    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', data.session.user.id)
      .maybeSingle();

    if (!isActiveRequest()) return;

    if (error) {
      console.error('프로필 로드 실패:', error);
      setProfile({
        name: null,
        email: data.session.user.email ?? null,
      });
      return;
    }

    setProfile({
      name: profileData?.name ?? null,
      email: profileData?.email ?? data.session.user.email ?? null,
    });
  };

  useEffect(() => {
    isMountedRef.current = true;
    Promise.resolve().then(() => {
      loadUser();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadUser();
    });

    window.addEventListener(campusNoticeReadEventName, loadUser);

    return () => {
      isMountedRef.current = false;
      loadUserRequestIdRef.current += 1;
      subscription.unsubscribe();
      window.removeEventListener(campusNoticeReadEventName, loadUser);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    let isActive = true;

    const loadPublicSettings = async () => {
      try {
        const [deadline, savedContactInfo] = await Promise.all([
          getReservationDeadline(),
          getPublicContactInfo(),
        ]);

        if (isActive) {
          setIsReservationClosed(deadline.isClosed);
          setContactInfo(savedContactInfo);
        }
      } catch (error) {
        console.error('공개 운영 설정 조회 실패:', error);

        if (isActive) {
          setIsReservationClosed(false);
        }
      }
    };

    void loadPublicSettings();

    return () => {
      isActive = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const sidebarElement = sidebarRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      const shouldRestoreFocus = sidebarElement?.contains(document.activeElement);

      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);

      if (shouldRestoreFocus) {
        document
          .querySelector<HTMLButtonElement>(
            'button[aria-controls="main-sidebar"]'
          )
          ?.focus();
      }
    };
  }, [isOpen, onClose]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    setIsLogoutModalOpen(false);
    setIsLoggedIn(false);
    setProfile(null);
    setAdminRole(null);
    setAdminRoles([]);
    setHasConfirmedTicket(false);
    onClose();
    navigate('/login');
  };

  const globalAdminRole = adminRoles.find((role) => role.role === 'global_admin');
  const campusAdminRole =
    adminRole?.role === 'campus_admin'
      ? adminRole
      : adminRoles.find((role) => role.role === 'campus_admin');
  const boardingManagerRole = adminRoles.find(
    (role) => role.role === 'boarding_manager'
  );

  const handleAdminMenuClick = async (role: AdminRole, path: string) => {
    if (role.id !== adminRole?.id) {
      await setActiveAdminRole(role.user_id, role.id);
    }

    handleMenuClick(path);
  };

  const navItemClassName = (path: string) =>
    `${styles.navItem} ${location.pathname === path ? styles.activeNavItem : ''}`;

  return (
    <>
      <div
        className={`${styles.backdrop} ${isOpen ? styles.active : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        ref={sidebarRef}
        id="main-sidebar"
        className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}
        aria-label="주 메뉴"
        aria-hidden={!isOpen}
        aria-modal="true"
        inert={!isOpen}
        role="dialog"
      >
        <div className={styles.header}>
          <h2 className={styles.title}>메뉴</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={24} color="#101828" />
          </button>
        </div>

        <div className={styles.userSection}>
          {isLoggedIn ? (
            <>
              <p className={styles.welcomeText}>
                {profile?.name && (
                  <span className={styles.userName}>{profile.name}님</span>
                )}
                <span>환영합니다!</span>
              </p>

              {profile?.email && (
                <p style={{ fontSize: 13, color: '#667085', marginTop: 4 }}>
                  {profile.email}
                </p>
              )}

              <div className={styles.authButtons}>
                <button
                  type="button"
                  className={styles.loginButton}
                  onClick={() => setIsLogoutModalOpen(true)}
                >
                  <LogOut size={20} className={styles.buttonIcon} />
                  로그아웃
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.welcomeText}>로그인이 필요합니다.</p>

              <div className={styles.authButtons}>
                <button
                  type="button"
                  className={styles.loginButton}
                  onClick={() => handleMenuClick('/login')}
                >
                  <LogIn size={20} className={styles.buttonIcon} />
                  로그인
                </button>
                <button
                  type="button"
                  className={styles.signupButton}
                  onClick={() => handleMenuClick('/signup')}
                >
                  <UserPlus size={20} className={styles.buttonIcon} />
                  회원가입
                </button>
                <button
                  type="button"
                  className={styles.recoveryButton}
                  onClick={() => handleMenuClick('/forgot-password')}
                >
                  비밀번호 찾기
                </button>
              </div>
            </>
          )}
        </div>

        <nav className={styles.nav} aria-label="주요 메뉴">
          <section className={styles.navSection} aria-labelledby="service-menu">
            <h3 className={styles.navSectionLabel} id="service-menu">
              서비스
            </h3>
            <ul className={styles.navList}>
              <li>
                <button
                  type="button"
                  className={navItemClassName('/')}
                  onClick={() => handleMenuClick('/')}
                  aria-current={
                    location.pathname === '/' ? 'page' : undefined
                  }
                >
                  <Home size={20} className={styles.navIcon} />
                  홈
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={navItemClassName('/profile')}
                  onClick={() => handleProtectedMenuClick('/profile')}
                  aria-current={
                    location.pathname === '/profile' ? 'page' : undefined
                  }
                >
                  <UserRound size={20} className={styles.navIcon} />
                  내 프로필
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={navItemClassName('/reservation')}
                  onClick={() => handleProtectedMenuClick('/reservation')}
                  aria-current={
                    location.pathname === '/reservation' ? 'page' : undefined
                  }
                >
                  <Bus size={20} className={styles.navIcon} />
                  버스 신청
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={navItemClassName('/ticket')}
                  onClick={() => handleProtectedMenuClick('/ticket')}
                  aria-current={
                    location.pathname === '/ticket' ? 'page' : undefined
                  }
                >
                  <Ticket size={20} className={styles.navIcon} />
                  신청 내역
                </button>
              </li>
              {isReservationClosed && hasConfirmedTicket === false && (
                <li>
                  <button
                    type="button"
                    className={navItemClassName('/remaining-seats')}
                    onClick={() => handleProtectedMenuClick('/remaining-seats')}
                    aria-current={
                      location.pathname === '/remaining-seats'
                        ? 'page'
                        : undefined
                    }
                  >
                    <Ticket size={20} className={styles.navIcon} />
                    마감 후 잔여 좌석
                  </button>
                </li>
              )}
            </ul>
          </section>

          <section className={styles.navSection} aria-labelledby="admin-menu">
            <h3 className={styles.navSectionLabel} id="admin-menu">
              관리자 메뉴
            </h3>
            <ul className={styles.navList}>
              {globalAdminRole && (
                <li>
                  <button
                    type="button"
                    className={`${navItemClassName('/admin/dashboard')} ${styles.adminNavItem}`}
                    onClick={() => handleMenuClick('/admin/dashboard')}
                  >
                    <ShieldCheck size={20} className={styles.navIcon} />
                    <span className={styles.navLabel}>전체 관리자</span>
                  </button>
                </li>
              )}
              {!globalAdminRole && campusAdminRole && (
                <li>
                  <button
                    type="button"
                    className={`${navItemClassName('/admin/campus-dashboard')} ${styles.adminNavItem}`}
                    onClick={() =>
                      void handleAdminMenuClick(campusAdminRole, '/admin/campus-dashboard')
                    }
                  >
                    <ShieldCheck size={20} className={styles.navIcon} />
                    <span className={styles.navLabel}>캠퍼스 회계 순장님 페이지</span>
                    {campusNoticeCount > 0 && (
                      <span className={styles.navBadge}>
                        공지 {campusNoticeCount}
                      </span>
                    )}
                  </button>
                </li>
              )}
              {!globalAdminRole && boardingManagerRole && (
                <li>
                  <button
                    type="button"
                    className={`${navItemClassName('/admin/boarding')} ${styles.adminNavItem}`}
                    onClick={() =>
                      void handleAdminMenuClick(
                        boardingManagerRole,
                        '/admin/boarding'
                      )
                    }
                  >
                    <ShieldCheck size={20} className={styles.navIcon} />
                    <span className={styles.navLabel}>탑승 확인 관리</span>
                  </button>
                </li>
              )}
              <li>
                <button
                  type="button"
                  className={navItemClassName('/invitation-codes')}
                  onClick={() => handleProtectedMenuClick('/invitation-codes')}
                  aria-current={
                    location.pathname === '/invitation-codes'
                      ? 'page'
                      : undefined
                  }
                >
                  <KeyRound size={20} className={styles.navIcon} />
                  권한 등록 코드
                </button>
              </li>
            </ul>
          </section>
        </nav>

        {(contactInfo.email || contactInfo.phone) && (
          <div className={styles.footer}>
            <p className={styles.footerText}>
              문의: {contactInfo.email || contactInfo.phone}
            </p>
          </div>
        )}
      </aside>

      {isLogoutModalOpen && (
        <LogoutModal
          onClose={() => setIsLogoutModalOpen(false)}
          onConfirm={handleLogout}
        />
      )}

      {loginRequiredPath && (
        <LoginRequiredModal
          onClose={() => setLoginRequiredPath(null)}
          onConfirm={() =>
            navigate('/login', {
              state: createLoginRequiredRedirectState(loginRequiredPath),
            })
          }
          onSignup={() =>
            navigate('/signup', {
              state: createLoginRequiredRedirectState(loginRequiredPath),
            })
          }
        />
      )}
    </>
  );
};

export default Sidebar;
