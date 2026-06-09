import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import styles from './PasswordRecoveryPage.module.css';

type RecoveryStatus = 'checking' | 'valid' | 'invalid';

const ResetPasswordPage = () => {
  const [recoveryStatus, setRecoveryStatus] =
    useState<RecoveryStatus>('checking');
  const [recoveryUserId, setRecoveryUserId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let active = true;
    const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
    const searchParams = new URLSearchParams(window.location.search);
    const recoveryAccessToken = hashParams.get('access_token');
    const recoveryCode = searchParams.get('code');
    const hasRecoveryToken =
      hashParams.get('type') === 'recovery' && Boolean(recoveryAccessToken);
    const hasRecoveryEvidence = hasRecoveryToken || Boolean(recoveryCode);

    const verifyRecoverySession = async (
      session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'],
      accessToken = session?.access_token
    ) => {
      if (!session || !accessToken) {
        if (active) setRecoveryStatus('invalid');
        return;
      }

      const { data, error: userError } = await supabase.auth.getUser(accessToken);
      if (!active) return;

      if (!userError && data.user?.id === session.user.id) {
        setRecoveryUserId(data.user.id);
        setRecoveryStatus('valid');
        return;
      }

      setRecoveryStatus('invalid');
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        void verifyRecoverySession(session);
      }
    });

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;

      if (sessionError || !hasRecoveryEvidence) {
        setRecoveryStatus('invalid');
        return;
      }

      if (data.session) {
        if (
          recoveryAccessToken &&
          data.session.access_token !== recoveryAccessToken
        ) {
          setRecoveryStatus('invalid');
          return;
        }

        void verifyRecoverySession(
          data.session,
          recoveryAccessToken ?? data.session.access_token
        );
        return;
      }

      if (!recoveryCode) {
        setRecoveryStatus('invalid');
        return;
      }

      void supabase.auth.exchangeCodeForSession(recoveryCode).then(({ data: exchangeData, error: exchangeError }) => {
        if (!active) return;

        if (exchangeError || !exchangeData.session) {
          setRecoveryStatus('invalid');
          return;
        }

        void verifyRecoverySession(exchangeData.session);
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (recoveryStatus !== 'valid') {
      setError('유효한 비밀번호 재설정 링크를 먼저 열어주세요.');
      return;
    }

    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsSaving(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || userData.user?.id !== recoveryUserId) {
        setRecoveryStatus('invalid');
        setError('재설정 링크가 만료되었거나 유효하지 않습니다. 새 링크를 요청해주세요.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError('재설정 링크가 만료되었거나 유효하지 않습니다. 새 링크를 요청해주세요.');
        return;
      }
      setIsComplete(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <main className={styles.main}>
        {recoveryStatus === 'checking' ? (
          <section className={styles.resultCard} aria-live="polite">
            <div className={styles.spinner} aria-hidden="true" />
            <h2>재설정 링크를 확인하고 있습니다</h2>
            <p>잠시만 기다려주세요.</p>
          </section>
        ) : recoveryStatus === 'invalid' ? (
          <section className={styles.resultCard}>
            <div className={`${styles.iconCircle} ${styles.errorIcon}`}>
              <AlertCircle size={32} />
            </div>
            <p className={styles.eyebrow}>재설정 링크 확인 필요</p>
            <h2>비밀번호를 변경할 수 없습니다</h2>
            <p>
              비밀번호 찾기에서 새 재설정 링크를 요청한 뒤, 받은 메일의 링크로
              다시 접속해주세요.
            </p>
            <Link to="/forgot-password" className={styles.primaryLink}>
              비밀번호 찾기로 이동
            </Link>
          </section>
        ) : isComplete ? (
          <section className={styles.resultCard}>
            <div className={styles.iconCircle}><CheckCircle2 size={32} /></div>
            <p className={styles.eyebrow}>변경 완료</p>
            <h2>새 비밀번호가 설정되었습니다</h2>
            <p>새 비밀번호로 로그인해주세요.</p>
            <Link to="/login" className={styles.primaryLink}>로그인하러 가기</Link>
          </section>
        ) : (
          <section className={styles.card}>
            <div className={styles.iconCircle}><KeyRound size={32} /></div>
            <h2>새 비밀번호 설정</h2>
            <p>앞으로 로그인할 때 사용할 비밀번호를 입력해주세요.</p>
            <form className={styles.form} onSubmit={handleSubmit}>
              <label>
                새 비밀번호
                <input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} autoComplete="new-password" required />
              </label>
              <label>
                새 비밀번호 확인
                <input type="password" value={passwordConfirm} onChange={(event) => { setPasswordConfirm(event.target.value); setError(''); }} autoComplete="new-password" required />
              </label>
              {error && <div className={styles.errorBox} role="alert">{error}</div>}
              <button type="submit" disabled={isSaving}>
                {isSaving ? '변경 중...' : '비밀번호 변경하기'}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
};

export default ResetPasswordPage;
