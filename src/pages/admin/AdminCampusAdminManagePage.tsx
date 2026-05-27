import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw, Search, ShieldCheck, UserCog } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Header from '../../components/Header';
import {
  cancelCampusAdmin,
  getAdminRole,
  getCampusesByTeam,
  getDistrictsForAdmin,
  getTeamsByDistrict,
  registerCampusAdmin,
  searchUsersForCampusManager,
  type AdminUserSearchResult,
  type SelectOption,
} from '../../lib/adminService';
import { supabase } from '../../lib/supabase';

import styles from './AdminCampusAdminManagePage.module.css';

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;

  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>;

    return String(
      errorRecord.message ||
        errorRecord.details ||
        errorRecord.hint ||
        errorRecord.code ||
        JSON.stringify(errorRecord)
    );
  }

  return '알 수 없는 오류가 발생했습니다.';
};

const AdminCampusAdminManagePage = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [districts, setDistricts] = useState<SelectOption[]>([]);
  const [teams, setTeams] = useState<SelectOption[]>([]);
  const [campuses, setCampuses] = useState<SelectOption[]>([]);

  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [selectedDistrictName, setSelectedDistrictName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedTeamName, setSelectedTeamName] = useState('');
  const [selectedCampusId, setSelectedCampusId] = useState('');
  const [selectedCampusName, setSelectedCampusName] = useState('');

  const [searchedUsers, setSearchedUsers] = useState<AdminUserSearchResult[]>(
    []
  );
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [actionLoadingUserId, setActionLoadingUserId] = useState<string | null>(
    null
  );
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const currentCampusAdmin = useMemo(() => {
    return (
      searchedUsers.find(
        (user) =>
          user.role === 'campus_admin' &&
          user.district === selectedDistrictName &&
          user.team === selectedTeamName &&
          user.campus === selectedCampusName
      ) ?? null
    );
  }, [
    searchedUsers,
    selectedDistrictName,
    selectedTeamName,
    selectedCampusName,
  ]);

  const selectedScopeText =
    selectedDistrictName && selectedTeamName && selectedCampusName
      ? `${selectedDistrictName} / ${selectedTeamName} / ${selectedCampusName}`
      : '지구, 팀, 캠퍼스를 선택해주세요';

  const resetMessage = () => setMessage(null);

  const loadDistricts = async () => {
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate('/admin/login');
        return;
      }

      const adminRole = await getAdminRole(session.user.id);

      if (!adminRole || adminRole.role !== 'global_admin') {
        alert('전체 관리자만 접근할 수 있습니다.');
        navigate('/');
        return;
      }

      const districtList = await getDistrictsForAdmin();
      setDistricts(districtList);
    } catch (error) {
      console.error('Failed to load campus admin page:', error);
      setMessage({
        type: 'error',
        text: `권한 관리 정보를 불러오지 못했습니다: ${getErrorMessage(error)}`,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial page load is an external Supabase synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDistricts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDistrictChange = async (districtId: string) => {
    resetMessage();

    const district = districts.find((item) => item.id === districtId);

    setSelectedDistrictId(districtId);
    setSelectedDistrictName(district?.name ?? '');
    setSelectedTeamId('');
    setSelectedTeamName('');
    setSelectedCampusId('');
    setSelectedCampusName('');
    setTeams([]);
    setCampuses([]);
    setSearchedUsers([]);

    if (!districtId) return;

    try {
      const teamList = await getTeamsByDistrict(districtId);
      setTeams(teamList);
    } catch (error) {
      console.error('Failed to load teams:', error);
      setMessage({
        type: 'error',
        text: `팀 목록을 불러오지 못했습니다: ${getErrorMessage(error)}`,
      });
    }
  };

  const handleTeamChange = async (teamId: string) => {
    resetMessage();

    const team = teams.find((item) => item.id === teamId);

    setSelectedTeamId(teamId);
    setSelectedTeamName(team?.name ?? '');
    setSelectedCampusId('');
    setSelectedCampusName('');
    setCampuses([]);
    setSearchedUsers([]);

    if (!teamId) return;

    try {
      const campusList = await getCampusesByTeam(teamId);
      setCampuses(campusList);
    } catch (error) {
      console.error('Failed to load campuses:', error);
      setMessage({
        type: 'error',
        text: `캠퍼스 목록을 불러오지 못했습니다: ${getErrorMessage(error)}`,
      });
    }
  };

  const handleCampusChange = (campusId: string) => {
    resetMessage();

    const campus = campuses.find((item) => item.id === campusId);

    setSelectedCampusId(campusId);
    setSelectedCampusName(campus?.name ?? '');
    setSearchedUsers([]);
  };

  const handleSearchUsers = async () => {
    resetMessage();
    setSearchingUsers(true);

    try {
      const users = await searchUsersForCampusManager({
        district: selectedDistrictName || undefined,
        team: selectedTeamName || undefined,
        campus: selectedCampusName || undefined,
      });

      setSearchedUsers(users);

      if (users.length === 0) {
        setMessage({ type: 'error', text: '검색 결과가 없습니다.' });
      }
    } catch (error) {
      console.error('Failed to search users:', error);
      setMessage({
        type: 'error',
        text: `사용자 검색 중 오류가 발생했습니다: ${getErrorMessage(error)}`,
      });
    } finally {
      setSearchingUsers(false);
    }
  };

  const refreshCampusUsers = async () => {
    const users = await searchUsersForCampusManager({
      district: selectedDistrictName || undefined,
      team: selectedTeamName || undefined,
      campus: selectedCampusName || undefined,
    });

    setSearchedUsers(users);
  };

  const handleAssignOrChangeCampusAdmin = async (
    user: AdminUserSearchResult
  ) => {
    resetMessage();

    const targetDistrict = selectedDistrictName || user.district;
    const targetTeam = selectedTeamName || user.team;
    const targetCampus = selectedCampusName || user.campus;

    if (!targetDistrict || !targetTeam || !targetCampus) {
      setMessage({
        type: 'error',
        text: '관리자로 등록할 지구, 팀, 캠퍼스 정보가 필요합니다.',
      });
      return;
    }

    if (user.role === 'global_admin') {
      setMessage({
        type: 'error',
        text: '전체 관리자는 캠퍼스 관리자로 변경할 수 없습니다.',
      });
      return;
    }

    const isChanging = Boolean(
      currentCampusAdmin && currentCampusAdmin.userId !== user.userId
    );

    const ok = window.confirm(
      isChanging
        ? `현재 ${targetCampus} 캠퍼스 관리자는 ${
            currentCampusAdmin?.name || '이름 없음'
          }님입니다.\n기존 관리자를 취소하고 ${user.name}님으로 변경할까요?`
        : `${user.name}님을 ${targetCampus} 캠퍼스 관리자로 등록할까요?`
    );

    if (!ok) return;

    setActionLoadingUserId(user.userId);

    try {
      await registerCampusAdmin({
        userId: user.userId,
        district: targetDistrict,
        team: targetTeam,
        campus: targetCampus,
      });

      await refreshCampusUsers();

      setMessage({
        type: 'success',
        text: isChanging
          ? `${targetCampus} 캠퍼스 관리자를 ${user.name}님으로 변경했습니다.`
          : `${user.name}님을 ${targetCampus} 캠퍼스 관리자로 등록했습니다.`,
      });
    } catch (error) {
      console.error('Failed to assign campus admin:', error);
      setMessage({
        type: 'error',
        text: `캠퍼스 관리자 등록 또는 변경 중 오류가 발생했습니다: ${getErrorMessage(
          error
        )}`,
      });
    } finally {
      setActionLoadingUserId(null);
    }
  };

  const handleCancelCampusAdmin = async (user: AdminUserSearchResult) => {
    resetMessage();

    if (!user.adminRoleId) {
      setMessage({
        type: 'error',
        text: '취소할 관리자 권한 정보를 찾을 수 없습니다.',
      });
      return;
    }

    const ok = window.confirm(`${user.name}님의 캠퍼스 관리자 권한을 취소할까요?`);

    if (!ok) return;

    setActionLoadingUserId(user.userId);

    try {
      await cancelCampusAdmin(user.adminRoleId);
      await refreshCampusUsers();

      setMessage({
        type: 'success',
        text: `${user.name}님의 캠퍼스 관리자 권한을 취소했습니다.`,
      });
    } catch (error) {
      console.error('Failed to cancel campus admin:', error);
      setMessage({
        type: 'error',
        text: `캠퍼스 관리자 권한 취소 중 오류가 발생했습니다: ${getErrorMessage(
          error
        )}`,
      });
    } finally {
      setActionLoadingUserId(null);
    }
  };

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <Header />
        <main className={styles.main}>
          <p className={styles.loadingText}>권한 관리 정보를 불러오는 중...</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/admin/global')}
        >
          <ArrowLeft size={16} />
          전체 관리자 대시보드
        </button>

        <section className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Campus Admin</span>
            <h1>캠퍼스 관리자 권한 관리</h1>
            <p>
              캠퍼스별 회계 순장님을 검색해 관리자 권한을 등록, 변경, 취소할 수
              있습니다.
            </p>
          </div>

          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void loadDistricts()}
          >
            <RefreshCw size={16} />
            새로고침
          </button>
        </section>

        <section className={styles.statusPanel}>
          <div>
            <span>선택 범위</span>
            <strong>{selectedScopeText}</strong>
          </div>

          <div>
            <span>현재 캠퍼스 관리자</span>
            <strong>
              {currentCampusAdmin
                ? `${currentCampusAdmin.name} (${currentCampusAdmin.phone || currentCampusAdmin.email || '연락처 없음'})`
                : selectedCampusName
                  ? '등록된 관리자가 없습니다'
                  : '캠퍼스를 선택해주세요'}
            </strong>
          </div>
        </section>

        <section className={styles.filterPanel}>
          <div className={styles.filterGrid}>
            <label>
              <span>지구</span>
              <select
                value={selectedDistrictId}
                onChange={(event) => void handleDistrictChange(event.target.value)}
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
                value={selectedTeamId}
                onChange={(event) => void handleTeamChange(event.target.value)}
                disabled={!selectedDistrictId}
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
                value={selectedCampusId}
                onChange={(event) => handleCampusChange(event.target.value)}
                disabled={!selectedTeamId}
              >
                <option value="">캠퍼스 선택</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.filterActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleSearchUsers()}
              disabled={searchingUsers}
            >
              <Search size={16} />
              {searchingUsers ? '검색 중...' : '사용자 검색'}
            </button>
          </div>
        </section>

        {message && (
          <p
            className={
              message.type === 'success'
                ? styles.successMessage
                : styles.errorMessage
            }
          >
            {message.text}
          </p>
        )}

        <section className={styles.userListPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>검색 결과</h2>
              <p>선택한 캠퍼스 범위에 맞는 사용자를 확인하고 권한을 지정합니다.</p>
            </div>
            <span>{searchedUsers.length}명</span>
          </div>

          {searchedUsers.length === 0 ? (
            <div className={styles.emptyState}>
              <UserCog size={34} />
              <strong>검색 결과가 아직 없습니다</strong>
              <p>지구, 팀, 캠퍼스를 선택한 뒤 사용자 검색을 눌러주세요.</p>
            </div>
          ) : (
            <div className={styles.userList}>
              {searchedUsers.map((user) => {
                const isCampusAdmin = user.role === 'campus_admin';
                const isGlobalAdmin = user.role === 'global_admin';
                const isCurrentSelectedCampusAdmin =
                  isCampusAdmin &&
                  Boolean(
                    selectedDistrictName &&
                      selectedTeamName &&
                      selectedCampusName
                  ) &&
                  user.district === selectedDistrictName &&
                  user.team === selectedTeamName &&
                  user.campus === selectedCampusName;
                const hasUserScope = Boolean(
                  (selectedDistrictName || user.district) &&
                    (selectedTeamName || user.team) &&
                    (selectedCampusName || user.campus)
                );
                const isLoading = actionLoadingUserId === user.userId;

                return (
                  <article key={user.userId} className={styles.userCard}>
                    <div className={styles.userInfo}>
                      <div className={styles.userTitleRow}>
                        <strong>{user.name}</strong>

                        {isGlobalAdmin && (
                          <span className={styles.globalBadge}>전체 관리자</span>
                        )}

                        {isCampusAdmin && (
                          <span className={styles.campusBadge}>
                            {isCurrentSelectedCampusAdmin
                              ? '현재 캠퍼스 관리자'
                              : '캠퍼스 관리자'}
                          </span>
                        )}
                      </div>

                      <div className={styles.userMeta}>
                        <span>지구: {user.district || '미등록'}</span>
                        <span>팀: {user.team || '미등록'}</span>
                        <span>캠퍼스: {user.campus || '미등록'}</span>
                        <span>연락처: {user.phone || '미등록'}</span>
                        {user.email && <span>이메일: {user.email}</span>}
                      </div>
                    </div>

                    <div className={styles.userAction}>
                      {isGlobalAdmin ? (
                        <button type="button" className={styles.mutedButton} disabled>
                          <ShieldCheck size={16} />
                          전체 관리자
                        </button>
                      ) : isCampusAdmin ? (
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={() => void handleCancelCampusAdmin(user)}
                          disabled={isLoading}
                        >
                          {isLoading ? '처리 중...' : '관리자 취소'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => void handleAssignOrChangeCampusAdmin(user)}
                          disabled={isLoading || !hasUserScope}
                        >
                          {isLoading
                            ? '처리 중...'
                            : !hasUserScope
                              ? '범위 필요'
                              : currentCampusAdmin
                                ? '관리자 변경'
                                : '관리자 등록'}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default AdminCampusAdminManagePage;
