import { useState, type FormEvent } from 'react';
import { UserPlus, X } from 'lucide-react';

import {
  createUserAccountForAdmin,
  getCampusesByTeam,
  getTeamsByDistrict,
  type SelectOption,
} from '../../lib/adminService';

import styles from './AdminCreateUserModal.module.css';

interface AdminCreateUserModalProps {
  districts: SelectOption[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}

const formatPhoneNumber = (value: string) => {
  const numbers = value.replace(/\D/g, '').slice(0, 11);

  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
};

const AdminCreateUserModal = ({
  districts,
  onClose,
  onCreated,
}: AdminCreateUserModalProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [organizationMode, setOrganizationMode] = useState<
    'registered' | 'manual'
  >('registered');
  const [districtId, setDistrictId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [campusId, setCampusId] = useState('');
  const [manualDistrict, setManualDistrict] = useState('');
  const [manualTeam, setManualTeam] = useState('');
  const [manualCampus, setManualCampus] = useState('');
  const [teams, setTeams] = useState<SelectOption[]>([]);
  const [campuses, setCampuses] = useState<SelectOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleDistrictChange = async (nextDistrictId: string) => {
    setDistrictId(nextDistrictId);
    setTeamId('');
    setCampusId('');
    setCampuses([]);
    setTeams(nextDistrictId ? await getTeamsByDistrict(nextDistrictId) : []);
  };

  const handleTeamChange = async (nextTeamId: string) => {
    setTeamId(nextTeamId);
    setCampusId('');
    setCampuses(nextTeamId ? await getCampusesByTeam(nextTeamId) : []);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('임시 비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    if (!/^010-\d{4}-\d{4}$/.test(phone)) {
      setError('연락처는 010-1234-5678 형식으로 입력해주세요.');
      return;
    }

    if (
      organizationMode === 'registered' &&
      (!districtId || !teamId || !campusId)
    ) {
      setError('지구, 팀, 캠퍼스를 모두 선택해주세요.');
      return;
    }

    if (
      organizationMode === 'manual' &&
      (!manualDistrict.trim() || !manualTeam.trim() || !manualCampus.trim())
    ) {
      setError('직접 입력할 지구, 팀, 캠퍼스명을 모두 입력해주세요.');
      return;
    }

    setSaving(true);

    try {
      await createUserAccountForAdmin({
        email,
        password,
        name,
        phone,
        organizationMode,
        districtId,
        teamId,
        campusId,
        district: manualDistrict,
        team: manualTeam,
        campus: manualCampus,
      });
      await onCreated();
      alert(`${name} 사용자를 추가했습니다.`);
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '사용자 추가 중 오류가 발생했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <span className={styles.icon}><UserPlus size={18} /></span>
            <div>
              <h2 id="create-user-title">사용자 추가</h2>
              <p>즉시 로그인 가능한 계정과 프로필을 생성합니다.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label>
            <span>이메일</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@example.com"
              required
            />
          </label>
          <label>
            <span>임시 비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="6자 이상"
              minLength={6}
              required
            />
          </label>
          <label>
            <span>이름</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label>
            <span>연락처</span>
            <input
              value={phone}
              onChange={(event) =>
                setPhone(formatPhoneNumber(event.target.value))
              }
              placeholder="010-1234-5678"
              inputMode="numeric"
              maxLength={13}
              required
            />
          </label>

          <div className={styles.organizationSection}>
            <div className={styles.organizationMode}>
              <button
                type="button"
                className={
                  organizationMode === 'registered' ? styles.activeMode : ''
                }
                onClick={() => setOrganizationMode('registered')}
              >
                등록된 조직 선택
              </button>
              <button
                type="button"
                className={
                  organizationMode === 'manual' ? styles.activeMode : ''
                }
                onClick={() => setOrganizationMode('manual')}
              >
                직접 입력
              </button>
            </div>

            <div className={styles.organizationGrid}>
              {organizationMode === 'registered' ? (
                <>
                  <label>
                    <span>지구</span>
                    <select
                      value={districtId}
                      onChange={(event) =>
                        void handleDistrictChange(event.target.value)
                      }
                      required
                    >
                      <option value="">지구 선택</option>
                      {districts.map((district) => (
                        <option key={district.id} value={district.id}>
                          {district.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>팀</span>
                    <select
                      value={teamId}
                      onChange={(event) =>
                        void handleTeamChange(event.target.value)
                      }
                      disabled={!districtId}
                      required
                    >
                      <option value="">팀 선택</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>캠퍼스</span>
                    <select
                      value={campusId}
                      onChange={(event) => setCampusId(event.target.value)}
                      disabled={!teamId}
                      required
                    >
                      <option value="">캠퍼스 선택</option>
                      {campuses.map((campus) => (
                        <option key={campus.id} value={campus.id}>
                          {campus.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label>
                    <span>지구명</span>
                    <input
                      value={manualDistrict}
                      onChange={(event) => setManualDistrict(event.target.value)}
                      placeholder="예: 경기지구"
                      required
                    />
                  </label>
                  <label>
                    <span>팀명</span>
                    <input
                      value={manualTeam}
                      onChange={(event) => setManualTeam(event.target.value)}
                      placeholder="예: 남부팀"
                      required
                    />
                  </label>
                  <label>
                    <span>캠퍼스명</span>
                    <input
                      value={manualCampus}
                      onChange={(event) => setManualCampus(event.target.value)}
                      placeholder="예: 수원대학교"
                      required
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <footer className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              취소
            </button>
            <button type="submit" className={styles.createButton} disabled={saving}>
              <UserPlus size={16} />
              {saving ? '추가 중...' : '사용자 추가'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default AdminCreateUserModal;
