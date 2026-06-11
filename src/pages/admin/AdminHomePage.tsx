import { ChevronRight, Grid2X2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAdminAuth } from '../../components/AdminAuthProvider';
import { canAdminRoleAccess } from '../../utils/adminAccess';
import AdminHeader, { navItems, stageNavGroups } from './AdminHeader';
import styles from './AdminHomePage.module.css';

const AdminHomePage = () => {
  const navigate = useNavigate();
  const { adminRole } = useAdminAuth();
  const accessibleItems = adminRole
    ? navItems.filter((item) =>
        canAdminRoleAccess(adminRole.role, item.allowedRoles)
      )
    : [];

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />

      <main className={styles.main}>
        <header className={styles.pageHeader}>
          <span className={styles.headerIcon}>
            <Grid2X2 size={20} />
          </span>
          <div>
            <h1>관리자 홈</h1>
            <p>필요한 관리자 기능을 선택하세요.</p>
          </div>
        </header>

        <div className={styles.groups}>
          {stageNavGroups.map((group) => {
            const items = accessibleItems.filter(
              (item) => item.stageGroup === group.id
            );

            if (items.length === 0) return null;

            return (
              <section className={styles.group} key={group.id}>
                <h2>{group.label}</h2>
                <div className={styles.buttonGrid}>
                  {items.map((item) => {
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.path}
                        type="button"
                        className={styles.menuButton}
                        onClick={() => navigate(item.path)}
                      >
                        <span className={styles.menuIcon}>
                          <Icon size={20} />
                        </span>
                        <span className={styles.menuLabel}>{item.label}</span>
                        <ChevronRight
                          className={styles.chevron}
                          size={16}
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default AdminHomePage;
