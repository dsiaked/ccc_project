import type { ReactNode } from 'react';
import AdminHeader from './AdminHeader';
import styles from './AdminLayout.module.css';

interface AdminLayoutProps {
  children: ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  return (
    <div className={styles.page}>
      <AdminHeader />

      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;