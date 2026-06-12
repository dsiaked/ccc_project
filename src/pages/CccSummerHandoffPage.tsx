import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { AlertCircle, BusFront, CheckCircle2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  exchangeCccSummerCode,
  selectCccSummerCampus,
  type CccSummerProfile,
} from '../lib/cccSummerHandoffService';
import {
  getCampusOptions,
  getDistrictOptions,
  getTeamOptions,
  type CampusOption,
  type DistrictOption,
  type TeamOption,
} from '../lib/organizationService';
import styles from './CccSummerHandoffPage.module.css';

type PageStatus = 'exchanging' | 'selecting-campus' | 'saving' | 'error';

const getCallbackRequest = () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code')?.trim() ?? '';
  const callbackError = params.get('error_description') || params.get('error');
  return {
    code,
    error: callbackError
      ? decodeURIComponent(callbackError)
      : code
        ? ''
        : 'CCC 로그인 코드가 없습니다. CCC 여름수련회 페이지에서 다시 입장해주세요.',
  };
};

const CccSummerHandoffPage = () => {
  const navigate = useNavigate();
  const [callbackRequest] = useState(getCallbackRequest);
  const [status, setStatus] = useState<PageStatus>(
    callbackRequest.error ? 'error' : 'exchanging'
  );
  const [error, setError] = useState(callbackRequest.error);
  const [profile, setProfile] = useState<CccSummerProfile | null>(null);
  const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [campuses, setCampuses] = useState<CampusOption[]>([]);
  const [districtId, setDistrictId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [campusId, setCampusId] = useState('');

  useEffect(() => {
    let active = true;
    const code = callbackRequest.code;
    const redirectUri = `${window.location.origin}/handoff/callback`;

    window.history.replaceState({}, document.title, '/handoff/callback');

    if (!code) return;

    const exchange = async () => {
      try {
        const result = await exchangeCccSummerCode(code, redirectUri);
        if (!active) return;

        setProfile(result.profile);
        if (!result.requiresCampusSelection) {
          navigate('/', { replace: true });
          return;
        }

        const options = await getDistrictOptions();
        if (!active) return;
        setDistricts(options);
        setStatus('selecting-campus');
      } catch (exchangeError) {
        if (!active) return;
        setError(
          exchangeError instanceof Error
            ? exchangeError.message
            : 'CCC 로그인 처리 중 오류가 발생했습니다.'
        );
        setStatus('error');
      }
    };

    void exchange();
    return () => {
      active = false;
    };
  }, [callbackRequest.code, navigate]);

  useEffect(() => {
    let active = true;
    if (!districtId) return;

    void getTeamOptions(districtId).then((options) => {
      if (active) setTeams(options);
    }).catch(() => {
      if (active) setError('팀 목록을 불러오지 못했습니다.');
    });

    return () => {
      active = false;
    };
  }, [districtId]);

  useEffect(() => {
    let active = true;
    if (!teamId) return;

    void getCampusOptions(teamId).then((options) => {
      if (active) setCampuses(options);
    }).catch(() => {
      if (active) setError('캠퍼스 목록을 불러오지 못했습니다.');
    });

    return () => {
      active = false;
    };
  }, [teamId]);

  const handleDistrictChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setDistrictId(event.target.value);
    setTeamId('');
    setCampusId('');
    setTeams([]);
    setCampuses([]);
  };

  const handleTeamChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setTeamId(event.target.value);
    setCampusId('');
    setCampuses([]);
  };

  const handleCampusSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!campusId || status === 'saving') return;

    setStatus('saving');
    setError('');
    try {
      await selectCccSummerCampus(campusId);
      navigate('/', { replace: true });
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : '캠퍼스 연결을 저장하지 못했습니다.'
      );
      setStatus('selecting-campus');
    }
  };

  if (status === 'exchanging') {
    return (
      <main className={styles.page}>
        <div className={styles.spinner} aria-hidden="true" />
        <h1>CCC 정보를 연결하고 있습니다</h1>
        <p>잠시만 기다려주세요.</p>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className={styles.page}>
        <AlertCircle className={styles.errorIcon} size={56} />
        <h1>CCC 로그인에 실패했습니다</h1>
        <p>{error}</p>
        <Link to="/" className={styles.primaryLink}>홈으로 돌아가기</Link>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <BusFront className={styles.busIcon} size={52} />
      <h1>소속 캠퍼스를 확인해주세요</h1>
      <p>
        {profile?.univName
          ? `CCC에서 받은 소속 "${profile.univName}"과 버스 시스템 캠퍼스를 연결합니다.`
          : '버스 예약에 사용할 캠퍼스를 선택해주세요.'}
      </p>

      <form className={styles.form} onSubmit={handleCampusSubmit}>
        <label>
          지구
          <select value={districtId} onChange={handleDistrictChange}>
            <option value="">지구 선택</option>
            {districts.map((district) => (
              <option key={district.id} value={district.id}>{district.name}</option>
            ))}
          </select>
        </label>
        <label>
          팀
          <select
            value={teamId}
            onChange={handleTeamChange}
            disabled={!districtId}
          >
            <option value="">팀 선택</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </label>
        <label>
          캠퍼스
          <select
            value={campusId}
            onChange={(event) => setCampusId(event.target.value)}
            disabled={!teamId}
          >
            <option value="">캠퍼스 선택</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>{campus.name}</option>
            ))}
          </select>
        </label>

        {error && <div className={styles.inlineError}><AlertCircle size={18} />{error}</div>}
        <button type="submit" disabled={!campusId || status === 'saving'}>
          {status === 'saving' ? '저장 중...' : '확인하고 예약하러 가기'}
        </button>
      </form>

      <div className={styles.notice}>
        <CheckCircle2 size={18} />
        한 번 연결하면 다음 로그인부터 자동으로 적용됩니다.
      </div>
    </main>
  );
};

export default CccSummerHandoffPage;
