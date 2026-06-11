import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  ChevronLeft,
  Eye,
  EyeOff,
  LogIn,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  clearOAuthCallbackState,
  rememberKakaoOAuthState,
} from '../utils/oauthCallbackState';
import { normalizeAppRedirect } from '../utils/redirect';
import styles from './LoginPage.module.css';

const validateEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);

const KakaoIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={styles.kakaoIcon}
  >
    <path
      fill="currentColor"
      d="M12 3C6.48 3 2 6.46 2 10.72c0 2.74 1.86 5.15 4.66 6.52l-1.19 4.13a.5.5 0 0 0 .76.55l4.77-3.2c.33.03.66.04 1 .04 5.52 0 10-3.46 10-7.72S17.52 3 12 3Z"
    />
  </svg>
);

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const initialEmail =
    typeof location.state?.email === 'string' ? location.state.email : '';
  const redirectTo = normalizeAppRedirect(location.state?.from);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loadingMethod, setLoadingMethod] = useState<'email' | 'kakao' | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const handleKakaoLogin = async () => {
    setError(null);
    setLoadingMethod('kakao');

    try {
      rememberKakaoOAuthState(redirectTo);

      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (!signInError) return;

      clearOAuthCallbackState();
      setError('카카오 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
      setLoadingMethod(null);
    } catch (error) {
      console.error('카카오 로그인 시작 실패:', error);
      clearOAuthCallbackState();
      setError('카카오 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
      setLoadingMethod(null);
    }
  };

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

    setLoadingMethod('email');

    try {
      clearOAuthCallbackState();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        if (
          signInError.code === 'invalid_credentials' ||
          signInError.message === 'Invalid login credentials'
        ) {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
          return;
        }

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
    } catch (error) {
      console.error('로그인 실패:', error);
      setError('로그인 중 연결 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoadingMethod(null);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/')}
          aria-label="홈으로 이동"
        >
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

        <button
          type="button"
          className={styles.kakaoButton}
          onClick={() => void handleKakaoLogin()}
          disabled={loadingMethod !== null}
        >
          <KakaoIcon />
          {loadingMethod === 'kakao' ? '카카오로 이동 중...' : '카카오로 시작하기'}
        </button>

        <div className={styles.divider}>
          <span>또는 이메일로 로그인</span>
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
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              autoComplete="username"
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <div className={styles.labelRow}>
              <label className={styles.label}>비밀번호</label>
              <Link to="/forgot-password" className={styles.forgotLink}>
                비밀번호를 잊으셨나요?
              </Link>
            </div>
            <div className={styles.passwordField}>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                className={styles.input}
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className={styles.passwordToggle}
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </div>

          {error && (
            <div className={styles.errorBox} role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className={styles.submitButton}
            disabled={loadingMethod !== null}
          >
            {loadingMethod === 'email' ? '로그인 중...' : '로그인하기'}
          </button>
        </form>

        <div className={styles.signupPrompt}>
          <span>아직 회원이 아니신가요?</span>
          <Link
            to="/local-signup"
            state={{ from: redirectTo }}
            className={styles.signupLink}
          >
            회원가입
          </Link>
        </div>

      </main>
    </div>
  );
};

export default LoginPage;
