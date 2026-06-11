import { ChevronLeft, LogIn, UserPlus } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCccSummerLoginUrl } from '../utils/cccSummerLogin';
import { normalizeAppRedirect } from '../utils/redirect';
import styles from './AuthEntryPage.module.css';

const AuthEntryPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = normalizeAppRedirect(location.state?.from);
  const isSignupEntry = location.pathname === '/signup';
  const cccSummerLoginUrl = getCccSummerLoginUrl(
    import.meta.env,
    `${window.location.origin}/handoff/callback`
  );

  const continueWithCccSummer = () => {
    if (!cccSummerLoginUrl) return;
    window.location.assign(cccSummerLoginUrl);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/')}
          aria-label="홈으로 이동"
        >
          <ChevronLeft size={24} />
        </button>
        <h1>{isSignupEntry ? '회원가입' : '로그인'}</h1>
        <div className={styles.headerSpacer} />
      </header>

      <main className={styles.main}>
        <div className={styles.intro}>
          <div className={styles.iconCircle}>
            {isSignupEntry ? <UserPlus size={32} /> : <LogIn size={32} />}
          </div>
          <h2>CCC 계정이 있으신가요?</h2>
          <p>계정 보유 여부에 맞는 방법을 선택해주세요.</p>
        </div>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={continueWithCccSummer}
          disabled={!cccSummerLoginUrl}
        >
          네, CCC 계정으로 계속하기
        </button>

        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() =>
            navigate(isSignupEntry ? '/local-signup' : '/local-login', {
              state: { from: redirectTo },
            })
          }
        >
          아니요, {isSignupEntry ? '별도로 회원가입하기' : '기존 계정으로 로그인하기'}
        </button>

        {!cccSummerLoginUrl && (
          <p className={styles.errorText}>CCC Summer 연결 설정을 확인하지 못했습니다.</p>
        )}
      </main>
    </div>
  );
};

export default AuthEntryPage;
