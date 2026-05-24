import { useEffect, useState } from 'react';
import { LogIn, LogOut, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Sidebar from './Sidebar';
import styles from './Header.module.css';

const Header = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const navigate = useNavigate();

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  useEffect(() => {
    const checkLogin = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Failed to get session:', error);
        setIsLoggedIn(false);
        return;
      }

      setIsLoggedIn(!!data?.session);
    };

    checkLogin();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setIsLoggedIn(!!session);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

    const handleAuthButtonClick = async () => {
      if (isLoggedIn) {
        const { error } = await supabase.auth.signOut();

        if (error) {
          alert('로그아웃 중 문제가 발생했습니다.');
          return;
        }

        alert('로그아웃되었습니다.');
        navigate('/');
        return;
      }

      navigate('/login');
    };

    

  return (
    <header className={styles.header}>
      <div
        className={styles.logo}
        onClick={() => navigate('/')}
        style={{ cursor: 'pointer' }}
      >
        CCC 여름수련회 버스
      </div>

      <div className={styles.rightGroup}>
        <button
          className={styles.loginButton}
          aria-label={isLoggedIn ? '로그아웃' : '로그인'}
          onClick={handleAuthButtonClick}
        >
          {isLoggedIn ? (
            <LogOut size={20} color="#1e40af" />
          ) : (
            <LogIn size={20} color="#1e40af" />
          )}

          <span className={styles.loginText}>
            {isLoggedIn ? '로그아웃' : '로그인'}
          </span>
        </button>

        <button
          className={styles.menuButton}
          aria-label="메뉴 열기"
          onClick={toggleSidebar}
        >
          <Menu size={24} color="#1e40af" />
        </button>
      </div>

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
    </header>
  );
};

export default Header;