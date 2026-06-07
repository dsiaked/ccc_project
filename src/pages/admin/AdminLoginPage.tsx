import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import Header from '../../components/Header';
import { supabase } from '../../lib/supabase';
import { getAdminRole } from '../../lib/adminService';
import styles from '../LoginPage.module.css';

const AdminLoginPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdminLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError(null);

    if (!email.trim()) {
      setError('이메일을 입력해주세요.');
      return;
    }

    if (!password.trim()) {
      setError('비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);

    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

      if (loginError) {
        throw loginError;
      }

      if (!data.user) {
        throw new Error('로그인 정보를 확인할 수 없습니다.');
      }
      
      const adminRole = await getAdminRole(data.user.id);

      if (!adminRole) {
        await supabase.auth.signOut();
        setError('관리자 권한이 없는 계정입니다.');
        return;
      }

      const requestedLocation = location.state?.from;
      const requestedPath =
        requestedLocation &&
        typeof requestedLocation.pathname === 'string' &&
        requestedLocation.pathname.startsWith('/admin/') &&
        requestedLocation.pathname !== '/admin/login'
          ? `${requestedLocation.pathname}${requestedLocation.search ?? ''}${
              requestedLocation.hash ?? ''
            }`
          : null;

      if (adminRole.role === 'campus_admin') {
        navigate(requestedPath ?? '/admin/campus', { replace: true });
        return;
      }

      if (adminRole.role === 'boarding_manager') {
        navigate(requestedPath ?? '/admin/boarding', { replace: true });
        return;
      }

      if (adminRole.role === 'global_admin') {
        navigate(requestedPath ?? '/admin/global', { replace: true });
        return;
      }

      await supabase.auth.signOut();
      setError('알 수 없는 관리자 권한입니다.');
    } catch (error) {
      console.error('관리자 로그인 실패:', error);
      setError('관리자 로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <div className={styles.formCard}>
          <div className={styles.headerContent}>
            <div className={styles.iconCircle}>
              <ShieldCheck size={32} color="#ffffff" />
            </div>

            <h1 className={styles.title}>관리자 로그인</h1>
            <p className={styles.subtitle}>
              캠퍼스 관리자, 선탑자 또는 전체 관리자 계정으로 로그인해주세요.
            </p>
          </div>

          <form className={styles.form} onSubmit={handleAdminLogin}>
            <div className={styles.inputGroup}>
              <label className={styles.label}>이메일</label>
              <input
                type="email"
                className={styles.input}
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>비밀번호</label>
              <input
                type="password"
                className={styles.input}
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            {error && <p className={styles.errorText}>{error}</p>}

            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading}
            >
              {loading ? '확인 중...' : '관리자 로그인'}
            </button>

            <button
              type="button"
              className={styles.subButton}
              onClick={() => navigate('/login')}
              disabled={loading}
            >
              일반 사용자 로그인으로 이동
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default AdminLoginPage;
