import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  getDistrictOptions,
  getTeamOptions,
  getCampusOptions,
  type DistrictOption,
  type TeamOption,
  type CampusOption,
} from '../lib/organizationService';
import styles from './SignupPage.module.css';

const validateEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);
const validatePhone = (value: string) => /^010-\d{4}-\d{4}$/.test(value);

const getDuplicateCheckErrorMessage = (error: {
  code?: string;
  message?: string;
}) => {
  if (
    error.code === 'PGRST202' ||
    error.message?.includes('email_exists') ||
    error.message?.includes('schema cache')
  ) {
    return '이메일 중복확인 기능이 아직 서버에 설치되지 않았습니다. 관리자에게 문의해주세요.';
  }

  return '이메일 중복확인 중 오류가 발생했습니다.';
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

  const [email, setEmail] = useState('');
  const [emailChecked, setEmailChecked] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [emailMessageType, setEmailMessageType] = useState<
    'success' | 'error' | null
  >(null);

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const [districtOptions, setDistrictOptions] = useState<DistrictOption[]>([]);
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [campusOptions, setCampusOptions] = useState<CampusOption[]>([]);

  const [districtId, setDistrictId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [campusId, setCampusId] = useState('');

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingCampuses, setLoadingCampuses] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const passwordMismatch =
    passwordConfirm.length > 0 && password !== passwordConfirm;

  const passwordMatched =
    passwordConfirm.length > 0 && password === passwordConfirm;





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
    const loadTeams = async () => {
      if (!districtId) {
        setTeamOptions([]);
        setCampusOptions([]);
        setTeamId('');
        setCampusId('');
        return;
      }

      setLoadingTeams(true);

      try {
        const teams = await getTeamOptions(districtId);
        setTeamOptions(teams);
        setTeamId('');
        setCampusId('');
        setCampusOptions([]);
      } catch (error) {
        console.error('팀 목록 로드 실패:', error);
        setError('팀 정보를 불러오지 못했습니다.');
      } finally {
        setLoadingTeams(false);
      }
    };

    loadTeams();
  }, [districtId]);

  useEffect(() => {
    const loadCampuses = async () => {
      if (!teamId) {
        setCampusOptions([]);
        setCampusId('');
        return;
      }

      setLoadingCampuses(true);

      try {
        const campuses = await getCampusOptions(teamId);
        setCampusOptions(campuses);
        setCampusId('');
      } catch (error) {
        console.error('캠퍼스 목록 로드 실패:', error);
        setError('캠퍼스 정보를 불러오지 못했습니다.');
      } finally {
        setLoadingCampuses(false);
      }
    };

    loadCampuses();
  }, [teamId]);

  const resetEmailCheck = () => {
    setEmailChecked(false);
    setEmailAvailable(false);
    setEmailMessage(null);
    setEmailMessageType(null);
  };

  const handleCheckEmail = async () => {
    setError(null);
    setSuccess(null);
    setEmailMessage(null);
    setEmailMessageType(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      setEmailMessage('유효한 이메일을 입력해주세요.');
      setEmailMessageType('error');
      setEmailChecked(false);
      setEmailAvailable(false);
      return;
    }

    setCheckingEmail(true);

    try {
      const { data, error } = await supabase.rpc('email_exists', {
        p_email: normalizedEmail,
      });

      if (error) {
        console.error('이메일 중복확인 실패:', error);
        setEmailMessage(getDuplicateCheckErrorMessage(error));
        setEmailMessageType('error');
        setEmailChecked(false);
        setEmailAvailable(false);
        return;
      }

      if (data) {
        setEmailMessage('이미 사용 중인 이메일입니다.');
        setEmailMessageType('error');
        setEmailChecked(true);
        setEmailAvailable(false);
        return;
      }

      setEmailMessage('사용 가능한 이메일입니다.');
      setEmailMessageType('success');
      setEmailChecked(true);
      setEmailAvailable(true);
    } catch (error) {
      console.error('이메일 중복확인 예외:', error);
      setEmailMessage('이메일 중복확인 중 오류가 발생했습니다.');
      setEmailMessageType('error');
      setEmailChecked(false);
      setEmailAvailable(false);
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      setEmailMessage('유효한 이메일을 입력해주세요.');
      setEmailMessageType('error');
      return;
    }

    if (!emailChecked || !emailAvailable) {
      setError('이메일 중복확인을 해주세요.');
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

    if (!teamId) {
      setError('팀을 선택해주세요.');
      return;
    }

    if (!campusId) {
      setError('캠퍼스를 선택해주세요.');
      return;
    }

    const selectedDistrict = districtOptions.find(
      (item) => item.id === districtId
    );
    const selectedTeam = teamOptions.find((item) => item.id === teamId);
    const selectedCampus = campusOptions.find((item) => item.id === campusId);

    if (!selectedDistrict || !selectedTeam || !selectedCampus) {
      setError('지구, 팀, 캠퍼스 선택 정보를 확인해주세요.');
      return;
    }

    setLoading(true);

    try {
      const { data: existingProfile, error: duplicateCheckError } =
        await supabase.rpc('email_exists', {
          p_email: normalizedEmail,
        });

      if (duplicateCheckError) {
        console.error('이메일 중복 재확인 실패:', duplicateCheckError);
        setEmailMessage(getDuplicateCheckErrorMessage(duplicateCheckError));
        setEmailMessageType('error');
        return;
      }

      if (existingProfile) {
        setEmailMessage('이미 사용 중인 이메일입니다.');
        setEmailMessageType('error');
        setEmailChecked(true);
        setEmailAvailable(false);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            name: name.trim(),
            phone: phone.trim(),

            district_id: selectedDistrict.id,
            district: selectedDistrict.name,

            team_id: selectedTeam.id,
            team: selectedTeam.name,

            campus_id: selectedCampus.id,
            campus: selectedCampus.name,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.user && data.session) {
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: data.user.id,
          email: normalizedEmail,
          name: name.trim(),
          phone: phone.trim(),

          district_id: selectedDistrict.id,
          district: selectedDistrict.name,

          team_id: selectedTeam.id,
          team: selectedTeam.name,

          campus_id: selectedCampus.id,
          campus: selectedCampus.name,

          updated_at: new Date().toISOString(),
        });

        if (profileError) {
          console.error('프로필 저장 실패:', profileError);

          if (profileError.code === '23505') {
            setEmailMessage('이미 사용 중인 이메일입니다.');
            setEmailMessageType('error');
            setEmailChecked(true);
            setEmailAvailable(false);
            return;
          }

          setError('회원 정보 저장 중 오류가 발생했습니다.');
          return;
        }
      }

      if (!data.session) {
        alert('인증 메일을 보냈습니다. 이메일 인증 후 로그인해주세요.');
        // navigate('/login');
        return;
      }

      alert('회원가입이 완료되었습니다.');
      navigate('/login', {
        state: {
          email: email.trim().toLowerCase(),
        },
      });    
} catch (error) {
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
        >
          <ChevronLeft size={24} color="#101828" />
        </button>

        <h1 className={styles.headerTitle}>회원가입</h1>

        <div style={{ width: 24 }} />
      </header>

      <main className={styles.main}>
        <div className={styles.logoSection}>
          <div className={styles.iconCircle}>
            <UserPlus size={32} color="#ffffff" />
          </div>

          <h2 className={styles.title}>신규 회원가입</h2>
          <p className={styles.subtitle}>
            CCC 여름수련회 버스 서비스를 시작해보세요
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSignup}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>이메일</label>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                className={styles.input}
                placeholder="사용할 이메일을 입력하세요"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                  setSuccess(null);
                  resetEmailCheck();
                }}
                required
              />

              <button
                type="button"
                onClick={handleCheckEmail}
                disabled={checkingEmail || !validateEmail(email.trim())}
                style={{
                  minWidth: 100,
                  border: 'none',
                  borderRadius: 12,
                  backgroundColor: '#101828',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor:
                    checkingEmail || !validateEmail(email.trim())
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    checkingEmail || !validateEmail(email.trim()) ? 0.5 : 1,
                }}
              >
                {checkingEmail ? '확인 중' : '중복확인'}
              </button>
            </div>

            {emailMessage && (
              <p
                style={{
                  color: emailMessageType === 'success' ? 'green' : 'red',
                  marginTop: 6,
                  fontSize: 14,
                }}
              >
                {emailMessage}
              </p>
            )}
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>비밀번호</label>
            <input
              type="password"
              className={styles.input}
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
                setSuccess(null);
              }}
              required
            />

            {password.length > 0 && password.length < 6 && (
              <p style={{ color: 'red', marginTop: 6, fontSize: 14 }}>
                비밀번호는 최소 6자 이상이어야 합니다.
              </p>
            )}
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>비밀번호 확인</label>
            <input
              type="password"
              className={styles.input}
              placeholder="비밀번호를 다시 입력하세요"
              value={passwordConfirm}
              onChange={(e) => {
                setPasswordConfirm(e.target.value);
                setError(null);
                setSuccess(null);
              }}
              required
            />

            {passwordMismatch && (
              <p style={{ color: 'red', marginTop: 6, fontSize: 14 }}>
                비밀번호가 일치하지 않습니다.
              </p>
            )}

            {passwordMatched && (
              <p style={{ color: 'green', marginTop: 6, fontSize: 14 }}>
                비밀번호가 일치합니다.
              </p>
            )}
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>이름</label>
            <input
              type="text"
              className={styles.input}
              placeholder="이름을 입력하세요"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
                setSuccess(null);
              }}
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>연락처</label>
            <input
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
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>지구</label>
            <select
              className={styles.input}
              value={districtId}
              onChange={(e) => {
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
            </select>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>팀</label>
            <select
              className={styles.input}
              value={teamId}
              onChange={(e) => {
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
            <label className={styles.label}>캠퍼스</label>
            <select
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
          </div>

          {error && <p style={{ color: 'red', marginTop: 8 }}>{error}</p>}

          {success && (
            <p style={{ color: 'green', marginTop: 8 }}>{success}</p>
          )}

          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? '회원가입 중...' : '회원가입'}
          </button>
        </form>
      </main>
    </div>
  );
};

export default SignupPage;
