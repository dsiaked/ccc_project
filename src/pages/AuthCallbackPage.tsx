import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  clearOAuthCallbackState,
  EXCHANGED_CALLBACK_STORAGE_KEY,
  OAUTH_PROVIDER_STORAGE_KEY,
  OAUTH_REDIRECT_STORAGE_KEY,
} from '../utils/oauthCallbackState';
import {
  decodeUrlComponentSafely,
  normalizeAppRedirect,
} from '../utils/redirect';
import styles from './AuthCallbackPage.module.css';

type CallbackStatus = 'checking' | 'success' | 'error';

const exchangedCallbackStorageKey = EXCHANGED_CALLBACK_STORAGE_KEY;

const removeCallbackCodeFromUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
};

const AuthCallbackPage = () => {
  const navigate = useNavigate();
  const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
  const searchParams = new URLSearchParams(window.location.search);

  const errorCode =
    hashParams.get('error_code') || searchParams.get('error_code');
  const errorDescription =
    hashParams.get('error_description') || searchParams.get('error_description');
  const oauthProvider = sessionStorage.getItem(OAUTH_PROVIDER_STORAGE_KEY);
  const isOAuthCallback = oauthProvider === 'kakao';
  const callbackCode = searchParams.get('code');
  const callbackAccessToken = hashParams.get('access_token');
  const hasCallbackEvidence =
    Boolean(callbackCode || callbackAccessToken || isOAuthCallback) ||
    Boolean(sessionStorage.getItem(exchangedCallbackStorageKey));
  const missingCallbackError = !errorDescription && !hasCallbackEvidence
    ? '확인할 인증 정보가 없습니다. 인증 또는 로그인을 다시 진행해주세요.'
    : null;
  const [status, setStatus] = useState<CallbackStatus>(
    errorDescription || missingCallbackError ? 'error' : 'checking'
  );
  const [verificationError, setVerificationError] = useState<string | null>(
    missingCallbackError
  );

  const isExpiredLink = errorCode === 'otp_expired';

  useEffect(() => {
    if (errorDescription) {
      clearOAuthCallbackState();
      return;
    }

    if (!hasCallbackEvidence) {
      clearOAuthCallbackState();
      return;
    }

    let isMounted = true;

    const verifyCallback = async () => {
      try {
        const sessionResult = callbackCode
          ? await supabase.auth.exchangeCodeForSession(callbackCode)
          : await supabase.auth.getSession();
        const session = sessionResult.data.session;
        const exchangedUserId = sessionStorage.getItem(exchangedCallbackStorageKey);
        if (
          exchangedUserId &&
          session &&
          exchangedUserId !== session.user.id
        ) {
          throw new Error('Callback session user changed unexpectedly');
        }
        if (session && (callbackCode || callbackAccessToken || isOAuthCallback)) {
          sessionStorage.setItem(exchangedCallbackStorageKey, session.user.id);
          if (callbackCode) removeCallbackCodeFromUrl();
        }
        const accessToken = callbackAccessToken || session?.access_token;
        const { data: userData, error: userError } = accessToken
          ? await supabase.auth.getUser(accessToken)
          : { data: { user: null }, error: null };

        if (!isMounted) return;

        if (
          sessionResult.error ||
          userError ||
          !session ||
          !accessToken ||
          (callbackAccessToken && session.access_token !== callbackAccessToken) ||
          userData.user?.id !== session.user.id
        ) {
          throw sessionResult.error || userError || new Error('Invalid callback session');
        }

        if (isOAuthCallback) {
          const savedRedirect = sessionStorage.getItem(OAUTH_REDIRECT_STORAGE_KEY);
          const redirectTo = normalizeAppRedirect(savedRedirect);
          clearOAuthCallbackState();
          navigate(redirectTo, { replace: true });
          return;
        }

        setStatus('success');
      } catch (error) {
        if (!isMounted) return;

        console.error('인증 콜백 확인 실패:', error);
        setVerificationError(
          isOAuthCallback
            ? '카카오 로그인 정보를 확인하지 못했습니다. 다시 시도해주세요.'
            : '인증 정보를 확인하지 못했습니다. 인증 또는 로그인을 다시 진행해주세요.'
        );
        setStatus('error');
      }
    };

    void verifyCallback();

    return () => {
      isMounted = false;
    };
  }, [
    errorDescription,
    callbackAccessToken,
    callbackCode,
    hasCallbackEvidence,
    isOAuthCallback,
    navigate,
  ]);

  if (status === 'checking') {
    return (
      <main className={styles.page}>
        <div className={styles.spinner} aria-hidden="true" />
        <h1>인증 정보를 확인하고 있습니다</h1>
        <p>확인이 끝날 때까지 잠시만 기다려주세요.</p>
      </main>
    );
  }

  const visibleError = verificationError || errorDescription;

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
      ) : status === 'error' || visibleError ? (
        <>
          <AlertCircle className={styles.errorIcon} size={56} />
          <h1>{isOAuthCallback ? '카카오 로그인에 실패했습니다.' : '이메일 인증에 실패했습니다.'}</h1>
          <p>
            {decodeUrlComponentSafely(
              visibleError ?? '인증 정보를 확인하지 못했습니다.'
            )}
          </p>
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
      {(status === 'error' || visibleError) && (
        <Link to="/forgot-password" className={styles.secondaryLink}>
          비밀번호 찾기
        </Link>
      )}
    </main>
  );
};

export default AuthCallbackPage;
