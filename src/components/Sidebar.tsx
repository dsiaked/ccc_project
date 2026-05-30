import { useEffect, useState } from 'react';
import { X, LogIn, Bus, Ticket, LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAdminRole, type AdminRole } from '../lib/adminService';
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
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);

  const handleMenuClick = (path: string) => {
    navigate(path);
    onClose();
  };

  const loadUser = async () => {
    const { data } = await supabase.auth.getSession();

    if (!data.session?.user) {
      setIsLoggedIn(false);
      setProfile(null);
      setAdminRole(null);
      return;
    }

    setIsLoggedIn(true);
    const role = await getAdminRole(data.session.user.id);

    setAdminRole(role);

    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', data.session.user.id)
      .maybeSingle();

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
    Promise.resolve().then(() => {
      loadUser();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadUser();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      alert('로그아웃 중 오류가 발생했습니다.');
      return;
    }

    setIsLoggedIn(false);
    setProfile(null);
    setAdminRole(null);
    onClose();
    navigate('/login');
  };

  const adminPath =
    adminRole?.role === 'global_admin' ? '/admin/global' : '/admin/campus';
  const adminLabel =
    adminRole?.role === 'global_admin' ? '전체 관리자 페이지' : '캠퍼스 관리자 페이지';

  return (
    <>
      <div
        className={`${styles.backdrop} ${isOpen ? styles.active : ''}`}
        onClick={onClose}
      />

      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
        <div className={styles.header}>
          <h2 className={styles.title}>메뉴</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="닫기">
            <X size={24} color="#101828" />
          </button>
        </div>

        <div className={styles.userSection}>
          {isLoggedIn ? (
            <>
              <p className={styles.welcomeText}>
                {profile?.name ? `${profile.name}님 환영합니다!` : '환영합니다!'}
              </p>

              {profile?.email && (
                <p style={{ fontSize: 13, color: '#667085', marginTop: 4 }}>
                  {profile.email}
                </p>
              )}

              <div className={styles.authButtons}>
                <button
                  className={styles.loginButton}
                  onClick={handleLogout}
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
                  className={styles.loginButton}
                  onClick={() => handleMenuClick('/login')}
                >
                  <LogIn size={20} className={styles.buttonIcon} />
                  로그인
                </button>
              </div>
            </>
          )}
        </div>

        <nav className={styles.nav}>
          <ul className={styles.navList}>
            <li>
              <button
                className={styles.navItem}
                onClick={() => handleMenuClick('/reservation')}
              >
                <Bus size={20} color="#364153" className={styles.navIcon} />
                버스예매
              </button>
            </li>

            <li>
              <button
                className={styles.navItem}
                onClick={() => handleMenuClick('/ticket')}
              >
                <Ticket size={20} color="#364153" className={styles.navIcon} />
                버스확인표
              </button>
            </li>

            {adminRole && (
              <li>
                <button
                  className={`${styles.navItem} ${styles.adminNavItem}`}
                  onClick={() => handleMenuClick(adminPath)}
                >
                  <ShieldCheck
                    size={20}
                    color="#1d4ed8"
                    className={styles.navIcon}
                  />
                  {adminLabel}
                </button>
              </li>
            )}
          </ul>
        </nav>

        <div className={styles.footer}>
          <p className={styles.footerText}>문의: info@ccc-bus.org</p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
