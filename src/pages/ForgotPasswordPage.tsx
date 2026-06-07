import type { FormEvent } from 'react';
import { useState } from 'react';
import { ChevronLeft, MailCheck, KeyRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import styles from './PasswordRecoveryPage.module.css';

const validateEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const normalizedEmail = email.trim().toLowerCase();
    if (!validateEmail(normalizedEmail)) {
      setError('유효한 이메일을 입력해주세요.');
      return;
    }

    setIsSending(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo: `${window.location.origin}/reset-password` }
      );

      if (resetError) {
        setError('재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      setIsSent(true);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
        </button>
        <h1>비밀번호 찾기</h1>
        <div className={styles.headerSpacer} />
      </header>
      <main className={styles.main}>
        {isSent ? (
          <section className={styles.resultCard}>
            <div className={styles.iconCircle}><MailCheck size={32} /></div>
            <p className={styles.eyebrow}>재설정 메일을 보냈어요</p>
            <h2>메일함을 확인해 주세요</h2>
            <p><strong>{email.trim().toLowerCase()}</strong>로 보낸 링크에서 새 비밀번호를 설정할 수 있습니다.</p>
            <Link to="/login" className={styles.primaryLink}>로그인으로 돌아가기</Link>
          </section>
        ) : (
          <section className={styles.card}>
            <div className={styles.iconCircle}><KeyRound size={32} /></div>
            <h2>비밀번호를 재설정할까요?</h2>
            <p>가입한 이메일을 입력하면 재설정 링크를 보내드립니다.</p>
            <form className={styles.form} onSubmit={handleSubmit}>
              <label>
                이메일
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError('');
                  }}
                  placeholder="이메일을 입력하세요"
                  autoComplete="email"
                  required
                />
              </label>
              {error && <div className={styles.errorBox} role="alert">{error}</div>}
              <button type="submit" disabled={isSending}>
                {isSending ? '메일 보내는 중...' : '재설정 메일 보내기'}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
};

export default ForgotPasswordPage;
