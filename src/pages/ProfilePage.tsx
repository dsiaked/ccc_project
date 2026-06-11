import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  IdCard,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import Header from '../components/Header';
import {
  getCccSummerLinkedProfile,
  type CccSummerLinkedProfile,
} from '../lib/cccSummerHandoffService';
import { supabase } from '../lib/supabase';
import { createLoginRequiredRedirectState } from '../utils/redirect';
import styles from './ProfilePage.module.css';

interface Profile {
  name: string;
  phone: string;
  email: string | null;
  district: string;
  team: string;
  campus: string;
  affiliation_type: string;
  coordinator_name: string | null;
  coordinator_phone: string | null;
  account_source: string;
}

interface ProfileFormErrors {
  name: string;
  phone: string;
}

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

const displayValue = (value: string | number | null) =>
  value === null || value === '' ? '정보 없음' : String(value);

const defaultFieldErrors = (): ProfileFormErrors => ({
  name: '',
  phone: '',
});

const ProfilePage = () => {
  const navigate = useNavigate();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cccSummerProfile, setCccSummerProfile] =
    useState<CccSummerLinkedProfile | null>(null);
  const [cccSummerLoading, setCccSummerLoading] = useState(false);
  const [cccSummerError, setCccSummerError] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] =
    useState<ProfileFormErrors>(defaultFieldErrors);
  const [success, setSuccess] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const loadCccSummerProfile = useCallback(async () => {
    setCccSummerLoading(true);
    setCccSummerError('');
    try {
      const linkedProfile = await getCccSummerLinkedProfile();
      setCccSummerProfile(linkedProfile);
    } catch (linkedProfileError) {
      console.error('CCC Summer 연결 정보 조회 실패:', linkedProfileError);
      setCccSummerError(
        'CCC Summer 연결 정보를 불러오지 못했습니다. 다시 시도해주세요.'
      );
    } finally {
      setCccSummerLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoading(true);
      setLoadError('');

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!active) return;

        if (sessionError) {
          throw sessionError;
        }

        if (!session) {
          navigate('/login', {
            replace: true,
            state: createLoginRequiredRedirectState('/profile'),
          });
          return;
        }

        const { data, error: profileError } = await supabase
          .from('profiles')
          .select(
            'name, phone, email, district, team, campus, affiliation_type, coordinator_name, coordinator_phone, account_source'
          )
          .eq('id', session.user.id)
          .maybeSingle();

        if (!active) return;

        if (profileError || !data) {
          throw profileError ?? new Error('profile_not_found');
        }

        const loadedProfile = data as Profile;
        setProfile(loadedProfile);
        setName(loadedProfile.name ?? '');
        setPhone(loadedProfile.phone ?? '');

        if (loadedProfile.account_source === 'ccc_summer') {
          void loadCccSummerProfile();
        }
      } catch (profileLoadError) {
        console.error('프로필 정보 조회 실패:', profileLoadError);
        if (!active) return;
        setProfile(null);
        setLoadError(
          '프로필 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, [loadAttempt, loadCccSummerProfile, navigate]);

  useEffect(() => {
    if (!success) return;

    const timeoutId = window.setTimeout(() => setSuccess(''), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [success]);

  const hasChanges = Boolean(
    profile &&
      (name.trim() !== profile.name.trim() ||
        formatPhone(phone) !== formatPhone(profile.phone))
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !hasChanges) return;

    const normalizedName = name.trim();
    const normalizedPhone = formatPhone(phone);
    const nextFieldErrors: ProfileFormErrors = {
      name: normalizedName ? '' : '이름을 입력해주세요.',
      phone: /^010-\d{4}-\d{4}$/.test(normalizedPhone)
        ? ''
        : '연락처를 010-0000-0000 형식으로 입력해주세요.',
    };

    setFieldErrors(nextFieldErrors);
    setFormError('');
    setSuccess('');

    if (nextFieldErrors.name) {
      nameInputRef.current?.focus();
      return;
    }

    if (nextFieldErrors.phone) {
      phoneInputRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw userError ?? new Error('authentication_required');
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ name: normalizedName, phone: normalizedPhone })
        .eq('id', user.id);

      if (profileError) throw profileError;

      const { error: metadataError } = await supabase.auth.updateUser({
        data: { name: normalizedName, phone: normalizedPhone },
      });

      if (metadataError) {
        console.warn('프로필 인증 메타데이터 동기화 실패:', metadataError);
      }

      setProfile((current) =>
        current
          ? { ...current, name: normalizedName, phone: normalizedPhone }
          : current
      );
      setName(normalizedName);
      setPhone(normalizedPhone);
      setSuccess('프로필이 저장되었습니다.');
      setIsEditing(false);
    } catch (saveError) {
      console.error('프로필 저장 실패:', saveError);
      setFormError(
        '프로필을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (!profile || saving) return;

    setName(profile.name ?? '');
    setPhone(profile.phone ?? '');
    setFieldErrors(defaultFieldErrors());
    setFormError('');
    setIsEditing(false);
  };

  const visibleEmail =
    profile?.email && !profile.email.endsWith('@sso.invalid')
      ? profile.email
      : null;
  const isCccSummer = profile?.account_source === 'ccc_summer';
  const affiliation =
    profile?.affiliation_type === 'external'
      ? [profile.district, profile.campus].filter(Boolean).join(' · ')
      : [profile?.district, profile?.team, profile?.campus]
          .filter(Boolean)
          .join(' · ');

  return (
    <div className={styles.pageContainer}>
      <Header />
      <main className={styles.main}>
        <header className={styles.pageHeader}>
          <h1>프로필</h1>
          <p>예약에 사용하는 기본 정보와 연결 정보를 관리합니다.</p>
        </header>

        {loading ? (
          <section className={styles.statusCard}>
            <div className={styles.spinner} aria-hidden="true" />
            <p>프로필을 불러오고 있습니다.</p>
          </section>
        ) : !profile ? (
          <section className={styles.statusCard} role="alert">
            <AlertCircle className={styles.errorIcon} size={36} />
            <p>{loadError}</p>
            <button
              type="button"
              onClick={() => setLoadAttempt((current) => current + 1)}
            >
              다시 불러오기
            </button>
          </section>
        ) : (
          <>
            <form className={styles.card} onSubmit={handleSubmit}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <UserRound size={20} />
                  <h2>기본 정보</h2>
                </div>
                {!isEditing && (
                  <button
                    className={styles.editButton}
                    type="button"
                    onClick={() => setIsEditing(true)}
                  >
                    수정
                  </button>
                )}
              </div>
              {isEditing ? (
                <>
                  <label className={styles.field} htmlFor="profile-name">
                    이름
                    <input
                      ref={nameInputRef}
                      id="profile-name"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        setFieldErrors((current) => ({ ...current, name: '' }));
                        setSuccess('');
                      }}
                      autoComplete="name"
                      maxLength={50}
                      aria-invalid={Boolean(fieldErrors.name)}
                      aria-describedby={
                        fieldErrors.name ? 'profile-name-error' : undefined
                      }
                    />
                    {fieldErrors.name && (
                      <p className={styles.fieldError} id="profile-name-error">
                        {fieldErrors.name}
                      </p>
                    )}
                  </label>
                  <label className={styles.field} htmlFor="profile-phone">
                    연락처
                    <input
                      ref={phoneInputRef}
                      id="profile-phone"
                      value={phone}
                      onChange={(event) => {
                        setPhone(formatPhone(event.target.value));
                        setFieldErrors((current) => ({ ...current, phone: '' }));
                        setSuccess('');
                      }}
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={13}
                      aria-invalid={Boolean(fieldErrors.phone)}
                      aria-describedby={
                        fieldErrors.phone ? 'profile-phone-error' : undefined
                      }
                    />
                    {fieldErrors.phone && (
                      <p className={styles.fieldError} id="profile-phone-error">
                        {fieldErrors.phone}
                      </p>
                    )}
                  </label>
                </>
              ) : (
                <>
                  <div className={styles.infoRow}>
                    <UserRound size={18} />
                    <div>
                      <span>이름</span>
                      <strong>{profile.name || '정보 없음'}</strong>
                    </div>
                  </div>
                  <div className={styles.infoRow}>
                    <Phone size={18} />
                    <div>
                      <span>연락처</span>
                      <strong>{profile.phone || '정보 없음'}</strong>
                    </div>
                  </div>
                </>
              )}
              <div className={styles.infoRow}>
                <Mail size={18} />
                <div>
                  <span>계정</span>
                  <strong>{visibleEmail ?? 'CCC Summer 연동 계정'}</strong>
                </div>
              </div>
              <div className={styles.infoRow}>
                <MapPin size={18} />
                <div>
                  <span>소속</span>
                  <strong>{affiliation || '소속 정보 없음'}</strong>
                </div>
              </div>
              {profile.affiliation_type === 'external' && (
                <div className={styles.infoRow}>
                  <Phone size={18} />
                  <div>
                    <span>담당 간사</span>
                    <strong>
                      {[profile.coordinator_name, profile.coordinator_phone]
                        .filter(Boolean)
                        .join(' · ') || '정보 없음'}
                    </strong>
                  </div>
                </div>
              )}
              {isCccSummer && (
                <div className={styles.infoRow}>
                  <ShieldCheck size={18} />
                  <div>
                    <span>소속 연결 방식</span>
                    <strong>CCC Summer 소속과 연결된 캠퍼스</strong>
                  </div>
                </div>
              )}
              {isCccSummer && (
                <p className={styles.helpText}>
                  이름과 연락처는 버스 예약에만 사용됩니다. CCC Summer로 다시
                  로그인하면 CCC에 등록된 정보로 변경될 수 있습니다.
                </p>
              )}
              {!isCccSummer && (
                <p className={styles.helpText}>
                  소속 변경은 버스 요청 화면에서 예약 정보와 함께 반영해주세요.
                </p>
              )}
              {isEditing && formError && (
                <div className={styles.errorBox} role="alert">
                  <AlertCircle size={18} />
                  {formError}
                </div>
              )}
              {isEditing && (
                <div className={styles.editActions}>
                  <button
                    className={styles.cancelButton}
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={saving}
                  >
                    취소
                  </button>
                  <button
                    className={styles.saveButton}
                    type="submit"
                    disabled={saving || !hasChanges}
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              )}
              <Link to="/reservation" className={styles.secondaryButton}>
                버스 요청 정보 확인
              </Link>
            </form>

            {isCccSummer && (
              <section className={styles.card}>
                <div className={styles.cardTitle}>
                  <IdCard size={20} />
                  <h2>CCC Summer 연결 정보</h2>
                </div>
                {cccSummerLoading ? (
                  <div className={styles.inlineLoading} role="status">
                    <div className={styles.smallSpinner} aria-hidden="true" />
                    <span>CCC Summer 연결 정보를 불러오고 있습니다.</span>
                  </div>
                ) : cccSummerError ? (
                  <>
                    <div className={styles.errorBox} role="alert">
                      <AlertCircle size={18} />
                      {cccSummerError}
                    </div>
                    <button
                      className={styles.retryButton}
                      type="button"
                      onClick={() => void loadCccSummerProfile()}
                    >
                      다시 불러오기
                    </button>
                  </>
                ) : cccSummerProfile ? (
                  <>
                    <div className={styles.cccDetails}>
                      <div>
                        <span>CCC 소속</span>
                        <strong>{displayValue(cccSummerProfile.univName)}</strong>
                      </div>
                      <div>
                        <span>CCC 지부</span>
                        <strong>{displayValue(cccSummerProfile.branchName)}</strong>
                      </div>
                      <div>
                        <span>CCC 스태프 여부</span>
                        <strong>
                          {cccSummerProfile.isStaff ? '스태프' : '스태프 아님'}
                        </strong>
                      </div>
                    </div>
                    <details className={styles.technicalDetails}>
                      <summary>기술 정보 보기</summary>
                      <div className={styles.technicalDetailsBody}>
                        <div>
                          <span>CCC 사용자 ID</span>
                          <strong>
                            {displayValue(cccSummerProfile.subjectId)}
                          </strong>
                        </div>
                        <div>
                          <span>CCC 소속 번호</span>
                          <strong>{displayValue(cccSummerProfile.univNo)}</strong>
                        </div>
                        <div>
                          <span>CCC 지부 번호</span>
                          <strong>
                            {displayValue(cccSummerProfile.branchNo)}
                          </strong>
                        </div>
                      </div>
                    </details>
                  </>
                ) : null}
                <p className={styles.helpText}>
                  CCC Summer 로그인으로 받은 정보이며, 다시 로그인하면 최신 정보로
                  동기화됩니다.
                </p>
              </section>
            )}
          </>
        )}
      </main>
      {success && (
        <div className={styles.toast} role="status">
          <CheckCircle2 size={18} />
          {success}
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
