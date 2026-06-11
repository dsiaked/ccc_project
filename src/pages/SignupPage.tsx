import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, MailCheck, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  getDistrictOptions,
  getTeamOptions,
  getCampusOptions,
  type DistrictOption,
  type TeamOption,
  type CampusOption,
} from '../lib/organizationService';
import {
  parseInvitationCodes,
  validateInvitationCodes,
} from '../lib/invitationCodeService';
import {
  clearSignupDraft as clearSignupDraftStorage,
  loadSignupDraft as loadSignupDraftFromStorage,
  saveSignupDraft as saveSignupDraftToSession,
  type SignupDraft,
} from '../utils/signupDraftStorage';
import { isAlreadyRegisteredSignupError } from '../utils/signupAuthError';
import { clearOAuthCallbackState } from '../utils/oauthCallbackState';
import styles from './SignupPage.module.css';

const validateEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);
const validatePhone = (value: string) => /^010-\d{4}-\d{4}$/.test(value);
const EXTERNAL_DISTRICT_ID = 'external';
type EmailCheckStatus = 'idle' | 'checking' | 'available' | 'duplicate' | 'error';

const loadSignupDraft = (): SignupDraft =>
  loadSignupDraftFromStorage(window.sessionStorage, window.localStorage);


const clearSignupDraft = () => {
  try {
    clearSignupDraftStorage(window.sessionStorage, window.localStorage);
  } catch {
    // 회원가입 완료 처리는 브라우저 저장소 상태와 관계없이 계속됩니다.
  }
};

const formatPhoneNumber = (value: string) => {
  const numbersOnly = value.replace(/\D/g, '').slice(0, 11);

  if (numbersOnly.length <= 3) {
    return numbersOnly;
  }

  if (numbersOnly.length <= 7) {
    return `${numbersOnly.slice(0, 3)}-${numbersOnly.slice(3)}`;
  }

  return `${numbersOnly.slice(0, 3)}-${numbersOnly.slice(3, 7)}-${numbersOnly.slice(7)}`;
};

const SignupPage = () => {
  const navigate = useNavigate();
  const [initialDraft] = useState(loadSignupDraft);
  const [currentStep, setCurrentStep] = useState(0);

  const [email, setEmail] = useState(initialDraft.email);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [emailCheckStatus, setEmailCheckStatus] = useState<EmailCheckStatus>('idle');
  const emailCheckRequestId = useRef(0);

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState(initialDraft.name);
  const [phone, setPhone] = useState(initialDraft.phone);

  const [districtOptions, setDistrictOptions] = useState<DistrictOption[]>([]);
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [campusOptions, setCampusOptions] = useState<CampusOption[]>([]);

  const [districtId, setDistrictId] = useState(initialDraft.districtId);
  const [teamId, setTeamId] = useState(initialDraft.teamId);
  const [campusId, setCampusId] = useState(initialDraft.campusId);
  const [externalDistrict, setExternalDistrict] = useState(
    initialDraft.externalDistrict
  );
  const [externalCampus, setExternalCampus] = useState(
    initialDraft.externalCampus
  );
  const [coordinatorName, setCoordinatorName] = useState(
    initialDraft.coordinatorName
  );
  const [coordinatorPhone, setCoordinatorPhone] = useState(
    initialDraft.coordinatorPhone
  );
  const [invitationCodeInput, setInvitationCodeInput] = useState('');
  const isExternal = districtId === EXTERNAL_DISTRICT_ID;

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingCampuses, setLoadingCampuses] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [signupResult, setSignupResult] = useState<
    'verification-required' | 'complete' | null
  >(null);

  const passwordMismatch =
    passwordConfirm.length > 0 && password !== passwordConfirm;

  const passwordMatched =
    passwordConfirm.length > 0 && password === passwordConfirm;

  const hasRestoredDraft = Object.values(initialDraft).some(Boolean);

  useEffect(() => {
    if (signupResult) return;

    const draft: SignupDraft = {
      email,
      name,
      phone,
      districtId,
      teamId,
      campusId,
      externalDistrict,
      externalCampus,
      coordinatorName,
      coordinatorPhone,
    };

    try {
      saveSignupDraftToSession(draft, window.sessionStorage);
    } catch {
      // 회원가입은 브라우저 저장소를 사용할 수 없어도 계속 진행할 수 있습니다.
    }
  }, [
    campusId,
    coordinatorName,
    coordinatorPhone,
    districtId,
    email,
    externalCampus,
    externalDistrict,
    name,
    phone,
    signupResult,
    teamId,
  ]);

  useEffect(() => {
    const loadDistricts = async () => {
      setLoadingOptions(true);

      try {
        const districts = await getDistrictOptions();
        setDistrictOptions(districts);
      } catch (error) {
        console.error('지구 목록 로드 실패:', error);
        setError('지구 정보를 불러오지 못했습니다.');
      } finally {
        setLoadingOptions(false);
      }
    };

    loadDistricts();
  }, []);

  useEffect(() => {
    let active = true;

    const loadTeams = async () => {
      if (!districtId || districtId === EXTERNAL_DISTRICT_ID) {
        setTeamOptions([]);
        setCampusOptions([]);
        setTeamId('');
        setCampusId('');
        setLoadingTeams(false);
        return;
      }

      setLoadingTeams(true);

      try {
        const teams = await getTeamOptions(districtId);
        if (!active) return;

        setTeamOptions(teams);
      } catch (error) {
        if (!active) return;

        console.error('팀 목록 로드 실패:', error);
        setError('팀 정보를 불러오지 못했습니다.');
      } finally {
        if (active) setLoadingTeams(false);
      }
    };

    loadTeams();

    return () => {
      active = false;
    };
  }, [districtId]);

  useEffect(() => {
    let active = true;

    const loadCampuses = async () => {
      if (!teamId) {
        setCampusOptions([]);
        setCampusId('');
        setLoadingCampuses(false);
        return;
      }

      setLoadingCampuses(true);

      try {
        const campuses = await getCampusOptions(teamId);
        if (!active) return;

        setCampusOptions(campuses);
      } catch (error) {
        if (!active) return;

        console.error('캠퍼스 목록 로드 실패:', error);
        setError('캠퍼스 정보를 불러오지 못했습니다.');
      } finally {
        if (active) setLoadingCampuses(false);
      }
    };

    loadCampuses();

    return () => {
      active = false;
    };
  }, [teamId]);

  const handleEmailAvailabilityCheck = async () => {
    setError(null);
    setSuccess(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      setEmailCheckStatus('idle');
      setEmailMessage('유효한 이메일을 입력해주세요.');
      return false;
    }

    const requestId = ++emailCheckRequestId.current;
    setEmailCheckStatus('checking');
    setEmailMessage(null);

    try {
      const { data: emailExists, error: emailCheckError } = await supabase.rpc(
        'email_exists',
        { p_email: normalizedEmail }
      );

      if (emailCheckError) throw emailCheckError;
      if (requestId !== emailCheckRequestId.current) return false;

      if (emailExists) {
        setEmailCheckStatus('duplicate');
        setEmailMessage('이미 가입된 이메일입니다.');
        return false;
      }

      setEmailCheckStatus('available');
      setEmailMessage('사용 가능한 이메일입니다.');
      return true;
    } catch (emailCheckError) {
      if (requestId !== emailCheckRequestId.current) return false;

      console.error('이메일 중복 확인 실패:', emailCheckError);
      setEmailCheckStatus('error');
      setEmailMessage('이메일 중복 확인에 실패했습니다. 잠시 후 다시 시도해주세요.');
      return false;
    }
  };

  const handleNextStep = async () => {
    const emailAvailable =
      emailCheckStatus === 'available' || (await handleEmailAvailabilityCheck());

    if (!emailAvailable) return;

    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setCurrentStep(1);
  };

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (currentStep === 0) {
      await handleNextStep();
      return;
    }

    setError(null);
    setSuccess(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      setEmailMessage('유효한 이메일을 입력해주세요.');
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

    if (!name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }

    if (!phone.trim()) {
      setError('연락처를 입력해주세요.');
      return;
    }

    if (!validatePhone(phone)) {
      setError('연락처는 010-1234-5678 형식으로 입력해주세요.');
      return;
    }

    if (!districtId) {
      setError('지구를 선택해주세요.');
      return;
    }

    if (!isExternal && !teamId) {
      setError('팀을 선택해주세요.');
      return;
    }

    if (!isExternal && !campusId) {
      setError('캠퍼스를 선택해주세요.');
      return;
    }

    if (
      isExternal &&
      (!externalDistrict.trim() ||
        !externalCampus.trim() ||
        !coordinatorName.trim() ||
        !coordinatorPhone.trim())
    ) {
      setError('서울 외 지구 소속과 담당 간사 정보를 모두 입력해주세요.');
      return;
    }

    if (isExternal && !validatePhone(coordinatorPhone)) {
      setError('담당 간사 연락처는 010-1234-5678 형식으로 입력해주세요.');
      return;
    }

    const selectedDistrict = isExternal
      ? null
      : districtOptions.find((item) => item.id === districtId);
    const selectedTeam = isExternal
      ? null
      : teamOptions.find((item) => item.id === teamId);
    const selectedCampus = isExternal
      ? null
      : campusOptions.find((item) => item.id === campusId);

    if (
      !isExternal &&
      (!selectedDistrict ||
        !selectedTeam ||
        selectedTeam.district_id !== selectedDistrict.id ||
        !selectedCampus ||
        selectedCampus.team_id !== selectedTeam.id)
    ) {
      setError('지구, 팀, 캠퍼스 선택 정보를 확인해주세요.');
      return;
    }

    if (loadingOptions || loadingTeams || loadingCampuses) {
      setError('소속 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    setLoading(true);

    try {
      const invitationCodes = parseInvitationCodes(invitationCodeInput);

      if (invitationCodes.length > 0) {
        const validation = await validateInvitationCodes(invitationCodes);

        if (!validation.valid) {
          setError(
            `${validation.errorIndex ? `${validation.errorIndex}번째 코드: ` : ''}${
              validation.errorMessage ?? '권한 등록 코드를 확인해주세요.'
            }`
          );
          return;
        }
      }

      clearOAuthCallbackState();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            name: name.trim(),
            phone: phone.trim(),

            district_id: selectedDistrict?.id ?? '',
            district: isExternal
              ? externalDistrict.trim()
              : selectedDistrict?.name,

            team_id: selectedTeam?.id ?? '',
            team: selectedTeam?.name ?? '',

            campus_id: selectedCampus?.id ?? '',
            campus: isExternal ? externalCampus.trim() : selectedCampus?.name,
            affiliation_type: isExternal ? 'external' : 'seoul',
            coordinator_name: isExternal ? coordinatorName.trim() : '',
            coordinator_phone: isExternal ? coordinatorPhone.trim() : '',
            invitation_codes: invitationCodes,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        if (isAlreadyRegisteredSignupError(signUpError)) {
          setCurrentStep(0);
          setEmailCheckStatus('duplicate');
          setEmailMessage('이미 가입된 이메일입니다.');
          return;
        }

        console.error('회원가입 요청 실패:', signUpError);
        setError('회원가입을 완료할 수 없습니다. 입력 정보를 확인하고 다시 시도해주세요.');
        return;
      }

      if (!data.session) {
        clearSignupDraft();
        setSignupResult('verification-required');
        return;
      }

      clearSignupDraft();
      setSignupResult('complete');
    } catch (error) {
      if (isAlreadyRegisteredSignupError(error)) {
        setCurrentStep(0);
        setEmailCheckStatus('duplicate');
        setEmailMessage('이미 가입된 이메일입니다.');
        return;
      }

      console.error('회원가입 실패:', error);
      setError('회원가입 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate(-1)}
          aria-label="이전 페이지로 이동"
        >
          <ChevronLeft size={24} color="#101828" />
        </button>

        <h1 className={styles.headerTitle}>회원가입</h1>

        <div style={{ width: 24 }} />
      </header>

      <main className={styles.main}>
        {signupResult ? (
          <section className={styles.resultCard} role="status">
            <div className={styles.resultIcon}>
              {signupResult === 'verification-required' ? (
                <MailCheck size={34} />
              ) : (
                <CheckCircle2 size={34} />
              )}
            </div>
            <p className={styles.resultEyebrow}>
              {signupResult === 'verification-required'
                ? '가입 요청을 접수했어요'
                : '회원가입 완료'}
            </p>
            <h2>
              {signupResult === 'verification-required'
                ? '이메일을 확인해주세요'
                : '계정이 준비되었습니다'}
            </h2>
            <p className={styles.resultDescription}>
              {signupResult === 'verification-required' ? (
                <>
                  가입 가능한 이메일이면{' '}
                  <strong>{email.trim().toLowerCase()}</strong>로 인증 링크가
                  전송됩니다.
                </>
              ) : (
                '이제 로그인하고 귀가 버스를 신청할 수 있습니다.'
              )}
            </p>
            <button
              type="button"
              className={styles.resultButton}
              onClick={() =>
                navigate('/local-login', {
                  state: { email: email.trim().toLowerCase() },
                })
              }
            >
              로그인하러 가기
            </button>
          </section>
        ) : (
          <>
        <div className={styles.logoSection}>
          <div className={styles.iconCircle}>
            <UserPlus size={32} color="#ffffff" />
          </div>

          <h2 className={styles.title}>신규 사용자가입</h2>
          <p className={styles.subtitle}>
            CCC 여름수련회 버스 서비스를 시작해보세요
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSignup}>
          <p className={styles.draftNotice}>
            {hasRestoredDraft
              ? '이전에 입력한 회원가입 정보를 불러왔습니다. 비밀번호만 다시 입력해주세요.'
              : '입력 내용은 자동 저장됩니다. 비밀번호는 저장하지 않습니다.'}
          </p>

          <div className={styles.stepper} aria-label="회원가입 단계">
            <button
              type="button"
              className={`${styles.stepItem} ${
                currentStep === 0 ? styles.stepItemActive : styles.stepItemDone
              }`}
              aria-current={currentStep === 0 ? 'step' : undefined}
              onClick={() => {
                setCurrentStep(0);
                setError(null);
              }}
            >
              <span>1</span>
              <strong>계정 만들기</strong>
            </button>
            <button
              type="button"
              className={`${styles.stepItem} ${
                currentStep === 1 ? styles.stepItemActive : ''
              }`}
              aria-current={currentStep === 1 ? 'step' : undefined}
              onClick={() => {
                if (currentStep === 1) return;
                void handleNextStep();
              }}
            >
              <span>2</span>
              <strong>내 정보 입력</strong>
            </button>
          </div>

          {currentStep === 0 && (
            <>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="signup-email">이메일</label>

            <div className={styles.emailRow}>
              <input
                id="signup-email"
                type="email"
                className={styles.input}
                placeholder="사용할 이메일을 입력하세요"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                  setSuccess(null);
                  setEmailMessage(null);
                  setEmailCheckStatus('idle');
                  emailCheckRequestId.current += 1;
                }}
                autoComplete="email"
                aria-describedby={emailMessage ? 'signup-email-message' : undefined}
                aria-invalid={Boolean(emailMessage) && emailCheckStatus !== 'available'}
                required
              />
              <button
                type="button"
                className={styles.emailCheckButton}
                onClick={() => void handleEmailAvailabilityCheck()}
                disabled={emailCheckStatus === 'checking'}
              >
                {emailCheckStatus === 'checking' ? '확인 중...' : '중복 확인'}
              </button>
            </div>

            {emailMessage && (
              <p
                id="signup-email-message"
                className={
                  emailCheckStatus === 'available'
                    ? styles.successMessage
                    : styles.errorMessage
                }
                role={emailCheckStatus === 'available' ? 'status' : 'alert'}
              >
                {emailMessage}
              </p>
            )}
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="signup-password">비밀번호</label>
            <input
              id="signup-password"
              type="password"
              className={styles.input}
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
                setSuccess(null);
              }}
              autoComplete="new-password"
              aria-describedby={password.length > 0 && password.length < 6 ? 'signup-password-message' : undefined}
              aria-invalid={password.length > 0 && password.length < 6}
              required
            />

            {password.length > 0 && password.length < 6 && (
              <p id="signup-password-message" className={styles.errorMessage}>
                비밀번호는 최소 6자 이상이어야 합니다.
              </p>
            )}
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="signup-password-confirm">비밀번호 확인</label>
            <input
              id="signup-password-confirm"
              type="password"
              className={styles.input}
              placeholder="비밀번호를 다시 입력하세요"
              value={passwordConfirm}
              onChange={(e) => {
                setPasswordConfirm(e.target.value);
                setError(null);
                setSuccess(null);
              }}
              autoComplete="new-password"
              aria-describedby={passwordConfirm.length > 0 ? 'signup-password-confirm-message' : undefined}
              aria-invalid={passwordMismatch}
              required
            />

            {passwordMismatch && (
              <p id="signup-password-confirm-message" className={styles.errorMessage}>
                비밀번호가 일치하지 않습니다.
              </p>
            )}

            {passwordMatched && (
              <p id="signup-password-confirm-message" className={styles.successMessage}>
                비밀번호가 일치합니다.
              </p>
            )}
          </div>
            </>
          )}

          {currentStep === 1 && (
            <>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="signup-name">이름</label>
            <input
              id="signup-name"
              type="text"
              className={styles.input}
              placeholder="이름을 입력하세요"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
                setSuccess(null);
              }}
              autoComplete="name"
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="signup-phone">연락처</label>
            <input
              id="signup-phone"
              type="tel"
              name="phone"
              className={styles.input}
              placeholder="010-1234-5678"
              value={phone}
              onChange={(e) => {
                setPhone(formatPhoneNumber(e.target.value));
                setError(null);
                setSuccess(null);
              }}
              inputMode="numeric"
              autoComplete="tel"
              maxLength={13}
              required
            />
            <p className={styles.phoneGuide}>
              원활한 배차 소통을 위해 반드시 본인의 정확한 연락처를
              입력해주세요.
            </p>
          </div>

          <div className={styles.affiliationGuide} role="note">
            <strong>소속 정보 선택 안내</strong>
            <p>
              본인이 CCC 회원이 아닌 경우, 함께 온 캠퍼스의 지구·팀·캠퍼스
              정보를 선택해주세요.
            </p>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="signup-district">지구</label>
            <select
              id="signup-district"
              className={styles.input}
              value={districtId}
              onChange={(e) => {
                setTeamId('');
                setCampusId('');
                setTeamOptions([]);
                setCampusOptions([]);
                setDistrictId(e.target.value);
                setError(null);
                setSuccess(null);
              }}
              disabled={loadingOptions}
              required
            >
              <option value="">
                {loadingOptions ? '지구 불러오는 중...' : '지구를 선택하세요'}
              </option>
              {districtOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
              <option value={EXTERNAL_DISTRICT_ID}>서울 외 지구</option>
            </select>
          </div>

          {isExternal ? (
            <>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="signup-external-district">소속 지구명</label>
            <input
              id="signup-external-district"
              className={styles.input}
              value={externalDistrict}
              onChange={(e) => {
                setExternalDistrict(e.target.value);
                setError(null);
              }}
              placeholder="예: 부산지구"
              required
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="signup-external-campus">소속 캠퍼스명</label>
            <input
              id="signup-external-campus"
              className={styles.input}
              value={externalCampus}
              onChange={(e) => {
                setExternalCampus(e.target.value);
                setError(null);
              }}
              placeholder="예: 부산대학교"
              required
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="signup-coordinator-name">담당 간사 이름</label>
            <input
              id="signup-coordinator-name"
              className={styles.input}
              value={coordinatorName}
              onChange={(e) => {
                setCoordinatorName(e.target.value);
                setError(null);
              }}
              required
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="signup-coordinator-phone">담당 간사 연락처</label>
            <input
              id="signup-coordinator-phone"
              type="tel"
              className={styles.input}
              value={coordinatorPhone}
              onChange={(e) => {
                setCoordinatorPhone(formatPhoneNumber(e.target.value));
                setError(null);
              }}
              placeholder="010-1234-5678"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={13}
              required
            />
          </div>
            </>
          ) : (
            <>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="signup-team">팀</label>
            <select
              id="signup-team"
              className={styles.input}
              value={teamId}
              onChange={(e) => {
                setCampusId('');
                setCampusOptions([]);
                setTeamId(e.target.value);
                setError(null);
                setSuccess(null);
              }}
              disabled={!districtId || loadingTeams}
              required
            >
              <option value="">
                {!districtId
                  ? '지구를 먼저 선택하세요'
                  : loadingTeams
                    ? '팀 불러오는 중...'
                    : '팀을 선택하세요'}
              </option>
              {teamOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="signup-campus">캠퍼스</label>
            <select
              id="signup-campus"
              className={styles.input}
              value={campusId}
              onChange={(e) => {
                setCampusId(e.target.value);
                setError(null);
                setSuccess(null);
              }}
              disabled={!teamId || loadingCampuses}
              required
            >
              <option value="">
                {!teamId
                  ? '팀을 먼저 선택하세요'
                  : loadingCampuses
                    ? '캠퍼스 불러오는 중...'
                    : '캠퍼스를 선택하세요'}
              </option>
              {campusOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <p className={styles.campusSignupGuide}>
              서울지구 소속이 아니더라도 서울지구에 속한 캠퍼스와 함께 온 경우,
              함께 온 본인 캠퍼스로 회원가입 후 해당 캠퍼스 회계 순장님께 입금
              부탁드립니다.
            </p>
          </div>
            </>
          )}
            </>
          )}

          {currentStep === 1 && (
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="signup-invitation-codes">
                권한 등록 코드 (선택)
              </label>
              <textarea
                id="signup-invitation-codes"
                className={styles.invitationCodeInput}
                value={invitationCodeInput}
                onChange={(event) => {
                  setInvitationCodeInput(event.target.value);
                  setError(null);
                }}
                placeholder="여러 코드는 줄바꿈이나 쉼표로 구분하세요."
                rows={4}
              />
              <p className={styles.phoneGuide}>
                유효하지 않거나 만료된 코드가 하나라도 있으면 회원가입이 진행되지
                않습니다.
              </p>
            </div>
          )}

          {error && <p className={styles.formError} role="alert">{error}</p>}

          {success && (
            <p className={styles.formSuccess} role="status">{success}</p>
          )}

          {currentStep === 0 ? (
            <button
              type="button"
              className={styles.submitButton}
              onClick={() => void handleNextStep()}
              disabled={emailCheckStatus === 'checking'}
            >
              {emailCheckStatus === 'checking' ? '이메일 확인 중...' : '다음'}
            </button>
          ) : (
            <div className={styles.buttonGroup}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setCurrentStep(0);
                  setError(null);
                }}
                disabled={loading}
              >
                이전
              </button>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={loading || loadingOptions || loadingTeams || loadingCampuses}
              >
                {loading ? '회원가입 중...' : '회원가입'}
              </button>
            </div>
          )}
        </form>
          </>
        )}
      </main>
    </div>
  );
};

export default SignupPage;
