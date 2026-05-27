import { useNavigate } from 'react-router-dom';
import { Bus, CreditCard, LayoutDashboard, LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import styles from './AdminHeader.module.css';

const AdminHeader = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.logo}
        onClick={() => navigate('/admin/global')}
      >
        CCC Bus Admin
      </button>

      <nav className={styles.nav}>
        <button type="button" onClick={() => navigate('/admin/global')}>
          <LayoutDashboard size={18} />
          대시보드
        </button>

        <button type="button" onClick={() => navigate('/admin/campus')}>
          <CreditCard size={18} />
          캠퍼스 관리
        </button>

        <button type="button" onClick={() => navigate('/admin/tickets')}>
          <Bus size={18} />
          버스표 확정
        </button>

        <button type="button" onClick={() => navigate('/admin/bus-allocation')}>
          버스 배분
        </button>

        <button
          type="button"
          className={styles.logoutButton}
          onClick={handleLogout}
        >
          <LogOut size={18} />
          로그아웃
        </button>
      </nav>
    </header>
  );
};

export default AdminHeader;
