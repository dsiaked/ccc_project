import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Header from '../components/Header';
import { clearAdminRoleCache } from '../lib/adminService';
import {
  parseInvitationCodes,
  redeemInvitationCodes,
  validateInvitationCodes,
  type InvitationValidationItem,
} from '../lib/invitationCodeService';
import { supabase } from '../lib/supabase';
import { createLoginRequiredRedirectState } from '../utils/redirect';
import styles from './InvitationCodePage.module.css';

const roleLabel = (item: InvitationValidationItem) =>
  item.role === 'campus_admin'
    ? `${item.campus ?? '캠퍼스'} 캠퍼스 회계 순장님`
    : '탑승 관리 간사님';

const InvitationCodePage = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState('');
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<InvitationValidationItem[]>([]);
  const [validatedCodes, setValidatedCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;

      if (!data.session) {
        navigate('/login', {
          replace: true,
          state: createLoginRequiredRedirectState('/invitation-codes'),
        });
        return;
      }

      setUserId(data.session.user.id);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  const handleValidate = async (event: FormEvent) => {
    event.preventDefault();
    const codes = parseInvitationCodes(value);
    setError('');
    setPreview([]);
    setValidatedCodes([]);

    if (codes.length === 0) {
      setError('권한 등록 코드를 하나 이상 입력해 주세요.');
      return;
    }

    setValidating(true);
    try {
      const result = await validateInvitationCodes(codes);
      if (!result.valid) {
        setError(
          `${result.errorIndex ? `${result.errorIndex}번째 코드: ` : ''}${
            result.errorMessage ?? '권한 등록 코드를 확인해 주세요.'
          }`
        );
        return;
      }

      setPreview(result.invitations);
      setValidatedCodes(codes);
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : '권한 등록 코드를 확인하지 못했습니다.'
      );
    } finally {
      setValidating(false);
    }
  };

  const handleRedeem = async () => {
    if (validatedCodes.length === 0) return;

    setRedeeming(true);
    setError('');

    try {
      await redeemInvitationCodes(validatedCodes);
      clearAdminRoleCache(userId);
      setSuccess(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : '권한 등록 코드를 등록하지 못했습니다.'
      );
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <section className={styles.card}>
          <div className={styles.icon}>
            {success ? <CheckCircle2 size={30} /> : <KeyRound size={30} />}
          </div>
          <span className={styles.eyebrow}>관리자 권한</span>
          <h1>{success ? '권한 등록 코드 등록 완료' : '권한 등록 코드 등록'}</h1>
          <p className={styles.description}>
            {success
              ? '새 관리자 권한이 계정에 반영되었습니다.'
              : '받은 권한 등록 코드를 입력하세요. 여러 코드는 줄바꿈이나 쉼표로 구분할 수 있습니다.'}
          </p>

          {success ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => navigate('/admin/login')}
            >
              <ShieldCheck size={18} />
              관리자 화면으로 이동
            </button>
          ) : (
            <form className={styles.form} onSubmit={handleValidate}>
              <label htmlFor="invitation-codes">권한 등록 코드</label>
              <textarea
                id="invitation-codes"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setPreview([]);
                  setValidatedCodes([]);
                  setError('');
                }}
                placeholder="예: ABCDEF-123456-ABCDEF-123456"
                rows={5}
                disabled={loading || validating || redeeming}
              />

              {preview.length > 0 && (
                <div className={styles.preview} role="status">
                  <strong>부여될 권한</strong>
                  {preview.map((item) => (
                    <span key={`${item.index}-${item.role}-${item.campusId}`}>
                      {roleLabel(item)}
                    </span>
                  ))}
                </div>
              )}

              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={loading || validating || redeeming}
              >
                {validating ? '확인하는 중...' : '권한 등록 코드 확인'}
              </button>

              {validatedCodes.length > 0 && (
                <div className={styles.confirmation}>
                  <p>
                    위 권한을 이 계정에 등록할까요? 등록하면 권한 등록 코드는 다시
                    사용할 수 없습니다.
                  </p>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={redeeming}
                    onClick={() => void handleRedeem()}
                  >
                    {redeeming ? '등록하는 중...' : '확인한 권한 최종 등록'}
                  </button>
                </div>
              )}
            </form>
          )}
        </section>
      </main>
    </div>
  );
};

export default InvitationCodePage;
