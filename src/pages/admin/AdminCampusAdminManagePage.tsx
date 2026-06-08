import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAdminAuth } from '../../components/AdminAuthProvider';
import AdminHeader from './AdminHeader';
import {
  cancelCampusAdmin,
  getCampusesByTeam,
  getDistrictsForAdmin,
  getTeamsByDistrict,
  registerCampusAdmin,
  searchUsersForCampusManager,
  type AdminUserSearchResult,
  type SelectOption,
} from '../../lib/adminService';
import { getParticipationTargetsSetting } from '../../lib/participationTargetsService';

import styles from './AdminCampusAdminManagePage.module.css';

interface SavedCampusRow {
  district: string;
  team: string;
  campus: string;
}

const USER_PAGE_SIZE = 50;

const makeSavedOptionId = (...parts: string[]) => parts.join('|');

const managesSelectedCampus = (
  user: AdminUserSearchResult,
  district: string,
  team: string,
  campus: string
) =>
  user.managedCampuses?.some(
    (scope) =>
      scope.district === district &&
      scope.team === team &&
      scope.campus === campus
  ) ??
  (user.role === 'campus_admin' &&
    user.district === district &&
    user.team === team &&
    user.campus === campus);

const prioritizeSelectedCampusAdmin = (
  users: AdminUserSearchResult[],
  district: string,
  team: string,
  campus: string
) =>
  [...users].sort((a, b) => {
    const isSelectedCampusAdmin = (user: AdminUserSearchResult) =>
      managesSelectedCampus(user, district, team, campus);

    return Number(isSelectedCampusAdmin(b)) - Number(isSelectedCampusAdmin(a));
  });

const toUniqueOptions = (
  rows: SavedCampusRow[],
  getName: (row: SavedCampusRow) => string,
  getIdParts: (row: SavedCampusRow) => string[]
) => {
  const map = new Map<string, SelectOption>();

  rows.forEach((row) => {
    const name = getName(row);

    if (!name || map.has(name)) return;

    map.set(name, {
      id: makeSavedOptionId(...getIdParts(row)),
      name,
    });
  });

  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'ko', { numeric: true })
  );
};

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
  const { adminRole } = useAdminAuth();

  const [loading, setLoading] = useState(true);
  const [districts, setDistricts] = useState<SelectOption[]>([]);
  const [teams, setTeams] = useState<SelectOption[]>([]);
  const [campuses, setCampuses] = useState<SelectOption[]>([]);
  const [savedCampusRows, setSavedCampusRows] = useState<SavedCampusRow[]>([]);

  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [selectedDistrictName, setSelectedDistrictName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedTeamName, setSelectedTeamName] = useState('');
  const [selectedCampusId, setSelectedCampusId] = useState('');
  const [selectedCampusName, setSelectedCampusName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [searchedUsers, setSearchedUsers] = useState<AdminUserSearchResult[]>(
    []
  );
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotalCount, setSearchTotalCount] = useState(0);
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
          managesSelectedCampus(
            user,
            selectedDistrictName,
            selectedTeamName,
            selectedCampusName
          )
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
      if (!adminRole || adminRole.role !== 'global_admin') {
        alert('전체 관리자만 접근할 수 있습니다.');
        navigate('/');
        return;
      }

      const participationSetting = await getParticipationTargetsSetting();
      const savedRows = participationSetting.rows
        .map((row) => ({
          district: row.district.trim(),
          team: row.team.trim(),
          campus: row.campus.trim(),
        }))
        .filter((row) => row.district && row.team && row.campus);

      setSavedCampusRows(savedRows);

      if (savedRows.length > 0) {
        setDistricts(
          toUniqueOptions(
            savedRows,
            (row) => row.district,
            (row) => ['saved-district', row.district]
          )
        );
      } else {
        const districtList = await getDistrictsForAdmin();
        setDistricts(districtList);
      }
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
    setSearchPage(1);
    setSearchTotalCount(0);

    if (!districtId) return;

    try {
      const savedRows = savedCampusRows;

      if (savedRows.length > 0) {
        const teamList = toUniqueOptions(
          savedRows.filter((row) => row.district === district?.name),
          (row) => row.team,
          (row) => ['saved-team', row.district, row.team]
        );

        setTeams(teamList);
        return;
      }

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
      const savedRows = savedCampusRows;

      if (savedRows.length > 0) {
        const campusList = toUniqueOptions(
          savedRows.filter(
            (row) =>
              row.district === selectedDistrictName &&
              row.team === team?.name
          ),
          (row) => row.campus,
          (row) => ['saved-campus', row.district, row.team, row.campus]
        );

        setCampuses(campusList);
        return;
      }

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
    setSearchPage(1);
    setSearchTotalCount(0);
  };

  const loadUsersPage = async (page: number) => {
    const result = await searchUsersForCampusManager({
      district: selectedDistrictName || undefined,
      team: selectedTeamName || undefined,
      campus: selectedCampusName || undefined,
      query: searchQuery || undefined,
      page,
      pageSize: USER_PAGE_SIZE,
    });

    setSearchedUsers(
      prioritizeSelectedCampusAdmin(
        result.users,
        selectedDistrictName,
        selectedTeamName,
        selectedCampusName
      )
    );
    setSearchPage(result.page);
    setSearchTotalCount(result.totalCount);

    return result;
  };

  const handleSearchUsers = async (page = 1) => {
    resetMessage();
    setSearchingUsers(true);

    try {
      const result = await loadUsersPage(page);

      if (result.users.length === 0) {
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
    const lastPage = Math.max(1, Math.ceil(searchTotalCount / USER_PAGE_SIZE));
    await loadUsersPage(Math.min(searchPage, lastPage));
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
        text: '전체 관리자는 캠퍼스 회계 순장님으로 변경할 수 없습니다.',
      });
      return;
    }

    const isChanging = Boolean(
      currentCampusAdmin && currentCampusAdmin.userId !== user.userId
    );

    const ok = window.confirm(
      isChanging
        ? `현재 ${targetCampus} 캠퍼스 회계 순장님은 ${
            currentCampusAdmin?.name || '이름 없음'
          }님입니다.\n기존 관리자를 취소하고 ${user.name}님으로 변경할까요?`
        : `${user.name}님을 ${targetCampus} 캠퍼스 회계 순장님으로 등록할까요?`
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
          ? `${targetCampus} 캠퍼스 회계 순장님을 ${user.name}님으로 변경했습니다.`
          : `${user.name}님을 ${targetCampus} 캠퍼스 회계 순장님으로 등록했습니다.`,
      });
    } catch (error) {
      console.error('Failed to assign campus admin:', error);
      setMessage({
        type: 'error',
        text: `캠퍼스 회계 순장님 등록 또는 변경 중 오류가 발생했습니다: ${getErrorMessage(
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

    const ok = window.confirm(`${user.name}님의 캠퍼스 회계 순장님 권한을 취소할까요?`);

    if (!ok) return;

    setActionLoadingUserId(user.userId);

    try {
      await cancelCampusAdmin(user.adminRoleId);
      await refreshCampusUsers();

      setMessage({
        type: 'success',
        text: `${user.name}님의 캠퍼스 회계 순장님 권한을 취소했습니다.`,
      });
    } catch (error) {
      console.error('Failed to cancel campus admin:', error);
      setMessage({
        type: 'error',
        text: `캠퍼스 회계 순장님 권한 취소 중 오류가 발생했습니다: ${getErrorMessage(
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
        <AdminHeader />
        <main className={styles.main}>
          <p className={styles.loadingText}>권한 관리 정보를 불러오는 중...</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />

      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/admin/dashboard')}
        >
          <ArrowLeft size={16} />
          전체 관리자 대시보드
        </button>

        <section className={styles.header}>
          <div className={styles.headerIntro}>
            <div className={styles.headerIcon}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <span className={styles.eyebrow}>Campus Admin</span>
              <h1>캠퍼스 회계 순장님 권한 관리</h1>
              <p>
                캠퍼스를 먼저 선택한 뒤 담당자를 검색해 관리자 권한을 등록하거나
                변경할 수 있습니다.
              </p>
            </div>
          </div>

          <div className={styles.headerActions}>
            <p className={styles.headerHint}>
              <CheckCircle2 size={15} />
              캠퍼스별 관리자는 1명만 지정됩니다
            </p>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => void loadDistricts()}
            >
              <RefreshCw size={16} />
              새로고침
            </button>
          </div>
        </section>

        <section className={styles.statusPanel}>
          <div className={styles.scopeStatus}>
            <span className={styles.statusIcon}>
              <MapPin size={18} />
            </span>
            <div>
              <span>선택한 캠퍼스</span>
              <strong>{selectedScopeText}</strong>
            </div>
          </div>

          <div className={styles.adminStatus}>
            <span className={styles.statusIcon}>
              <UserCog size={18} />
            </span>
            <div>
              <span>현재 캠퍼스 회계 순장님</span>
              <strong>
                {currentCampusAdmin
                  ? currentCampusAdmin.name
                  : selectedCampusName
                    ? '등록된 관리자가 없습니다'
                    : '캠퍼스를 선택해주세요'}
              </strong>
              {currentCampusAdmin && (
                <small>
                  {currentCampusAdmin.phone ||
                    currentCampusAdmin.email ||
                    '연락처 없음'}
                </small>
              )}
            </div>
          </div>
        </section>

        <section className={styles.filterPanel}>
          <div className={styles.filterHeading}>
            <div>
              <span className={styles.sectionLabel}>01. 캠퍼스 선택</span>
              <h2>관리 범위를 선택하세요</h2>
              <p>지구부터 캠퍼스까지 순서대로 선택하면 담당자를 검색할 수 있습니다.</p>
            </div>
            <Building2 size={22} />
          </div>

          <div className={styles.filterGrid}>
            <label>
              <span><b>1</b> 지구</span>
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
              <span><b>2</b> 팀</span>
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
              <span><b>3</b> 캠퍼스</span>
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
            <span>
              {selectedCampusName
                ? `전체 사용자 중 ${selectedCampusName} 캠퍼스 관리자를 검색합니다`
                : '캠퍼스를 선택하면 검색할 수 있습니다'}
            </span>
            <input
              className={styles.userSearchInput}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && selectedCampusName) {
                  void handleSearchUsers(1);
                }
              }}
              placeholder="이름, 이메일, 연락처, 소속 검색"
              disabled={!selectedCampusName || searchingUsers}
            />
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleSearchUsers(1)}
              disabled={searchingUsers || !selectedCampusName}
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
              <span className={styles.sectionLabel}>02. 관리자 지정</span>
              <h2>검색 결과</h2>
              <p>소속 캠퍼스와 관계없이 사용자를 찾아 선택한 캠퍼스 권한을 지정합니다.</p>
            </div>
            <span><Users size={14} /> 총 {searchTotalCount}명</span>
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
                  Boolean(
                    selectedDistrictName &&
                      selectedTeamName &&
                      selectedCampusName
                  ) &&
                  managesSelectedCampus(
                    user,
                    selectedDistrictName,
                    selectedTeamName,
                    selectedCampusName
                  );
                const isLoading = actionLoadingUserId === user.userId;

                return (
                  <article
                    key={user.userId}
                    className={`${styles.userCard} ${
                      isCurrentSelectedCampusAdmin ? styles.currentAdminCard : ''
                    }`}
                  >
                    <div className={styles.userAvatar} aria-hidden="true">
                      {user.name.trim().slice(0, 1) || '?'}
                    </div>
                    <div className={styles.userInfo}>
                      <div className={styles.userTitleRow}>
                        <strong>{user.name}</strong>

                        {isGlobalAdmin && (
                          <span className={styles.globalBadge}>전체 관리자</span>
                        )}

                        {isCampusAdmin && (
                          <span className={styles.campusBadge}>
                            {isCurrentSelectedCampusAdmin
                              ? '현재 캠퍼스 회계 순장님'
                              : '캠퍼스 회계 순장님'}
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
                      {user.managedCampuses &&
                        user.managedCampuses.length > 0 && (
                          <div className={styles.managedCampusList}>
                            <strong>
                              현재 관리 캠퍼스 {user.managedCampuses.length}개
                            </strong>
                            {user.managedCampuses.map((scope) => (
                              <span key={scope.id}>
                                {[scope.district, scope.team, scope.campus]
                                  .filter(Boolean)
                                  .join(' / ')}
                              </span>
                            ))}
                          </div>
                        )}
                    </div>

                    <div className={styles.userAction}>
                      {isGlobalAdmin ? (
                        <button type="button" className={styles.mutedButton} disabled>
                          <ShieldCheck size={16} />
                          전체 관리자
                        </button>
                      ) : isCurrentSelectedCampusAdmin ? (
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
                          disabled={isLoading || !selectedCampusName}
                        >
                          {isLoading
                            ? '처리 중...'
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

          {searchTotalCount > USER_PAGE_SIZE && (
            <div className={styles.filterActions}>
              <span>
                {searchPage} / {Math.ceil(searchTotalCount / USER_PAGE_SIZE)} 페이지
              </span>
              <div>
                <button
                  type="button"
                  className={styles.mutedButton}
                  onClick={() => void handleSearchUsers(searchPage - 1)}
                  disabled={searchingUsers || searchPage <= 1}
                >
                  이전
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void handleSearchUsers(searchPage + 1)}
                  disabled={
                    searchingUsers ||
                    searchPage >= Math.ceil(searchTotalCount / USER_PAGE_SIZE)
                  }
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default AdminCampusAdminManagePage;
