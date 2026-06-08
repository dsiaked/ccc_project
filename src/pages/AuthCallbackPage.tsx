import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  decodeUrlComponentSafely,
  normalizeAppRedirect,
} from '../utils/redirect';
import styles from './AuthCallbackPage.module.css';

const AuthCallbackPage = () => {
  const navigate = useNavigate();
  const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
  const searchParams = new URLSearchParams(window.location.search);

  const errorCode =
    hashParams.get('error_code') || searchParams.get('error_code');
  const errorDescription =
    hashParams.get('error_description') || searchParams.get('error_description');
  const oauthProvider = sessionStorage.getItem('ccc_bus_oauth_provider');
  const isOAuthCallback = oauthProvider === 'kakao';
  const [oauthError, setOAuthError] = useState<string | null>(null);

  const isExpiredLink = errorCode === 'otp_expired';

  useEffect(() => {
    if (!isOAuthCallback) return;

    const clearOAuthState = () => {
      sessionStorage.removeItem('ccc_bus_oauth_provider');
      sessionStorage.removeItem('ccc_bus_oauth_redirect');
    };

    if (errorDescription) {
      clearOAuthState();
      return;
    }

    let isMounted = true;

    const finishOAuthLogin = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error || !data.session) {
        clearOAuthState();
        setOAuthError('카카오 로그인 정보를 확인하지 못했습니다. 다시 시도해주세요.');
        return;
      }

      const savedRedirect = sessionStorage.getItem('ccc_bus_oauth_redirect');
      const redirectTo = normalizeAppRedirect(savedRedirect);

      clearOAuthState();
      navigate(redirectTo, { replace: true });
    };

    void finishOAuthLogin();

    return () => {
      isMounted = false;
    };
  }, [errorDescription, isOAuthCallback, navigate]);

  if (isOAuthCallback && !errorDescription && !oauthError) {
    return (
      <main className={styles.page}>
        <div className={styles.spinner} aria-hidden="true" />
        <h1>카카오 로그인 중</h1>
        <p>로그인을 마치고 이전 화면으로 이동하고 있어요.</p>
      </main>
    );
  }

  const visibleError = oauthError || errorDescription;

  return (
    <main className={styles.page}>
      {isExpiredLink ? (
        <>
          <AlertCircle className={styles.errorIcon} size={56} />
          <h1>인증 링크가 만료되었습니다.</h1>
          <p>
            이메일 인증 링크가 만료되었거나 이미 사용되었습니다.
            다시 회원가입을 진행하거나 새 인증 메일을 요청해주세요.
          </p>
        </>
      ) : visibleError ? (
        <>
          <AlertCircle className={styles.errorIcon} size={56} />
          <h1>{isOAuthCallback ? '카카오 로그인에 실패했습니다.' : '이메일 인증에 실패했습니다.'}</h1>
          <p>{decodeUrlComponentSafely(visibleError)}</p>
        </>
      ) : (
        <>
          <CheckCircle2 className={styles.successIcon} size={56} />
          <h1>이메일 인증이 완료되었습니다.</h1>
          <p>이제 로그인해서 서비스를 이용할 수 있습니다.</p>
        </>
      )}

      <Link to="/login" className={styles.loginLink}>
        로그인하러 가기
      </Link>
    </main>
  );
};

export default AuthCallbackPage;
