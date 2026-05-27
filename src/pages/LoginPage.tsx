import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { ChevronLeft, LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';
import styles from './LoginPage.module.css';

const validateEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const initialEmail =
    typeof location.state?.email === 'string' ? location.state.email : '';
  const redirectTo =
    typeof location.state?.from === 'string' ? location.state.from : '/';

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!validateEmail(email)) {
      setError('유효한 이메일을 입력해주세요.');
      return;
    }

    if (!password.trim()) {
      setError('비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        if (signInError.message === 'Email not confirmed') {
          setError('이메일 인증이 완료되지 않았습니다. 메일함에서 인증 링크를 확인해주세요.');
          return;
        }

        setError(signInError.message);
        return;
      }

      if (!data?.session) {
        setError('로그인에 실패했습니다. 다시 시도해주세요.');
        return;
      }

      navigate(redirectTo, { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate(-1)}>
          <ChevronLeft size={24} color="#101828" />
        </button>
        <h1 className={styles.headerTitle}>로그인</h1>
        <div style={{ width: 24 }} />
      </header>

      <main className={styles.main}>
        <div className={styles.logoSection}>
          <div className={styles.iconCircle}>
            <LogIn size={32} color="#ffffff" />
          </div>
          <h2 className={styles.title}>CCC 여름수련회 버스</h2>
          <p className={styles.subtitle}>계정에 로그인하여 서비스를 이용하세요</p>
        </div>

        <form className={styles.form} onSubmit={handleLogin}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>이메일</label>
            <input
              type="email"
              name="email"
              className={styles.input}
              placeholder="이메일을 입력하세요"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>비밀번호</label>
            <input
              type="password"
              name="password"
              className={styles.input}
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && <p style={{ color: 'red', marginTop: 8 }}>{error}</p>}

          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? '로그인 중...' : '로그인하기'}
          </button>
        </form>

        <div className={styles.signupPrompt}>
          <span>아직 회원이 아니신가요?</span>
          <Link to="/signup" className={styles.signupLink}>
            회원가입
          </Link>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
