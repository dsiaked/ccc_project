import type { FormEvent } from 'react';
import { useState } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import styles from './PasswordRecoveryPage.module.css';

const ResetPasswordPage = () => {
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

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
        {isComplete ? (
          <section className={styles.resultCard}>
            <div className={styles.iconCircle}><CheckCircle2 size={32} /></div>
            <p className={styles.eyebrow}>변경 완료</p>
            <h2>새 비밀번호가 설정되었습니다</h2>
            <p>새 비밀번호로 로그인해 주세요.</p>
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
