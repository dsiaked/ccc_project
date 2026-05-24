import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, DollarSign, Users } from 'lucide-react';
import Header from '../../components/Header';
import { supabase } from '../../lib/supabase';
import {
  cancelCampusAdmin,
  getAdminRole,
  getBusTicketPrice,
  getCampusesByTeam,
  getDestinationStats,
  getDistrictsForAdmin,
  getPaymentStats,
  getTeamsByDistrict,
  registerCampusAdmin,
  searchUsersForCampusManager,
  updateBusTicketPrice,
  type AdminUserSearchResult,
} from '../../lib/adminService';

import styles from './AdminGlobalPage.module.css';

interface DestinationStat {
  name: string;
  rank1: number;
  rank2: number;
  rank3: number;
  total: number;
}

interface PaymentStat {
  completed: number;
  pending: number;
  refunded: number;
  totalCompleted: number;
  completedCount: number;
}

interface SelectOption {
  id: string;
  name: string;
}

const AdminGlobalPage = () => {
  const navigate = useNavigate();

  const [destStats, setDestStats] = useState<DestinationStat[]>([]);
  const [paymentStats, setPaymentStats] = useState<PaymentStat | null>(null);
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
  const [adminActionLoading, setAdminActionLoading] = useState<string | null>(
    null
  );
  const [adminManageError, setAdminManageError] = useState<string | null>(null);
  const [adminManageSuccess, setAdminManageSuccess] = useState<string | null>(
    null
  );

  const [busTicketPrice, setBusTicketPrice] = useState(0);
  const [busTicketPriceInput, setBusTicketPriceInput] = useState('');
  const [priceSaving, setPriceSaving] = useState(false);

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

  useEffect(() => {
    let isMounted = true;

    const checkAndLoadData = async () => {
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
          if (isMounted) {
            alert('전체 관리자만 접근할 수 있습니다.');
            navigate('/');
          }
          return;
        }

        const [stats, payments, districtList, ticketPrice] =
          await Promise.all([
            getDestinationStats(),
            getPaymentStats(),
            getDistrictsForAdmin(),
            getBusTicketPrice(),
          ]);

        const statsArray = Object.entries(stats).map(([name, data]) => ({
          name,
          ...(data as Omit<DestinationStat, 'name'>),
        }));

        if (isMounted) {
          setDestStats(statsArray.sort((a, b) => b.total - a.total));
          setPaymentStats(payments);
          setDistricts(districtList);
          setBusTicketPrice(ticketPrice);
          setBusTicketPriceInput(String(ticketPrice));
        }
      } catch (error) {
        console.error('Failed to load data:', error);

        if (isMounted) {
          alert('데이터를 불러올 수 없습니다.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkAndLoadData();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const resetAdminManageStatus = () => {
    setAdminManageError(null);
    setAdminManageSuccess(null);
  };

  const handleDistrictChange = async (districtId: string) => {
    resetAdminManageStatus();

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
      setAdminManageError('팀 목록을 불러올 수 없습니다.');
    }
  };

  const handleTeamChange = async (teamId: string) => {
    resetAdminManageStatus();

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
      setAdminManageError('캠퍼스 목록을 불러올 수 없습니다.');
    }
  };

  const handleCampusChange = (campusId: string) => {
    resetAdminManageStatus();

    const campus = campuses.find((item) => item.id === campusId);

    setSelectedCampusId(campusId);
    setSelectedCampusName(campus?.name ?? '');

    setSearchedUsers([]);
  };

  const handleSearchUsers = async () => {
    resetAdminManageStatus();
    setSearchingUsers(true);

    try {
      const users = await searchUsersForCampusManager({
        district: selectedDistrictName || undefined,
        team: selectedTeamName || undefined,
        campus: selectedCampusName || undefined,
      });

      setSearchedUsers(users);

      if (users.length === 0) {
        setAdminManageError('검색 결과가 없습니다.');
      }
    } catch (error) {
      console.error('유저 검색 실패:', error);

      const message =
        error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';

      setAdminManageError(`유저 검색 중 오류가 발생했습니다: ${message}`);
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
    resetAdminManageStatus();

    const targetDistrict = selectedDistrictName || user.district;
    const targetTeam = selectedTeamName || user.team;
    const targetCampus = selectedCampusName || user.campus;

    if (!targetDistrict || !targetTeam || !targetCampus) {
      setAdminManageError('관리자로 등록할 유저의 지구, 팀, 캠퍼스 정보가 없습니다.');
      return;
    }

    if (user.role === 'global_admin') {
      setAdminManageError('전체 관리자는 캠퍼스 관리자로 변경할 수 없습니다.');
      return;
    }

    const isChanging = Boolean(
      currentCampusAdmin && currentCampusAdmin.userId !== user.userId
    );

    const confirmMessage = isChanging
      ? `현재 ${targetCampus} 캠퍼스 관리자는 ${
          currentCampusAdmin?.name || '이름 없음'
        }님입니다.\n기존 관리자를 취소하고 ${user.name}님으로 변경할까요?`
      : `${user.name}님을 ${targetCampus} 캠퍼스 관리자로 등록할까요?`;

    const ok = window.confirm(confirmMessage);

    if (!ok) return;

    setAdminActionLoading(user.userId);

    try {
      await registerCampusAdmin({
        userId: user.userId,
        district: targetDistrict,
        team: targetTeam,
        campus: targetCampus,
      });

      await refreshCampusUsers();

      setAdminManageSuccess(
        isChanging
          ? `${targetCampus} 캠퍼스 관리자를 ${user.name}님으로 변경했습니다.`
          : `${user.name}님을 ${targetCampus} 캠퍼스 관리자로 등록했습니다.`
      );
    } catch (error: any) {
      console.error('캠퍼스 관리자 등록/변경 실패:', error);

      const message =
        error?.message ||
        error?.details ||
        error?.hint ||
        error?.code ||
        JSON.stringify(error);

      setAdminManageError(
        `캠퍼스 관리자 등록 또는 변경 중 오류가 발생했습니다: ${message}`
      );
    } finally {
      setAdminActionLoading(null);
    }
  };

  const handleCancelCampusAdmin = async (user: AdminUserSearchResult) => {
    resetAdminManageStatus();

    if (!user.adminRoleId) {
      setAdminManageError('취소할 관리자 권한 정보를 찾을 수 없습니다.');
      return;
    }

    const ok = window.confirm(`${user.name}님의 캠퍼스 관리자 권한을 취소할까요?`);

    if (!ok) return;

    setAdminActionLoading(user.userId);

    try {
      await cancelCampusAdmin(user.adminRoleId);

      await refreshCampusUsers();

      setAdminManageSuccess(`${user.name}님의 캠퍼스 관리자 권한을 취소했습니다.`);
    } catch (error) {
      console.error('캠퍼스 관리자 취소 실패:', error);
      setAdminManageError('캠퍼스 관리자 권한 취소 중 오류가 발생했습니다.');
    } finally {
      setAdminActionLoading(null);
    }
  };

  const handleSaveBusTicketPrice = async () => {
    const nextPrice = Number(busTicketPriceInput);

    if (Number.isNaN(nextPrice) || nextPrice < 0) {
      alert('인당 버스 가격은 0원 이상 숫자로 입력해주세요.');
      return;
    }

    const ok = window.confirm(
      `인당 버스 가격을 ${nextPrice.toLocaleString()}원으로 설정할까요?`
    );

    if (!ok) return;

    setPriceSaving(true);

    try {
      const savedPrice = await updateBusTicketPrice(nextPrice);

      setBusTicketPrice(savedPrice);
      setBusTicketPriceInput(String(savedPrice));

      alert('인당 버스 가격을 저장했습니다.');
    } catch (error: any) {
      console.error('버스 가격 저장 실패:', error);

      const message =
        error?.message ||
        error?.details ||
        error?.hint ||
        '알 수 없는 오류가 발생했습니다.';

      alert(`버스 가격 저장 중 오류가 발생했습니다: ${message}`);
    } finally {
      setPriceSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <Header />

        <main className={styles.main}>
          <p>로딩 중...</p>
        </main>
      </div>
    );
  }

  const totalPeople = destStats.reduce((sum, stat) => sum + stat.rank1, 0);
  const totalPreferenceCount = destStats.reduce(
    (sum, stat) => sum + stat.total,
    0
  );

  const totalCompletedAmount = paymentStats?.totalCompleted || 0;
  const completedCount = paymentStats?.completed || 0;

  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <div className={styles.header}>
          <h1>전체 관리 대시보드</h1>
          <p>행선지별 신청현황 및 버스 배분 최적화</p>
        </div>

        <div className={styles.metricsGrid}>
          <div className={styles.metric}>
            <div
              className={styles.metricIcon}
              style={{ background: '#dbeafe' }}
            >
              <Users size={24} color="#0284c7" />
            </div>

            <div>
              <p className={styles.metricLabel}>총 신청자</p>
              <p className={styles.metricValue}>{totalPeople}명</p>
            </div>
          </div>

          <div className={styles.metric}>
            <div
              className={styles.metricIcon}
              style={{ background: '#dcfce7' }}
            >
              <DollarSign size={24} color="#16a34a" />
            </div>

            <div>
              <p className={styles.metricLabel}>전체 확인 완료액</p>
              <p className={styles.metricValue}>
                {(totalCompletedAmount / 1000000).toFixed(1)}M
              </p>
            </div>
          </div>

          <div className={styles.metric}>
            <div
              className={styles.metricIcon}
              style={{ background: '#fef3c7' }}
            >
              <DollarSign size={24} color="#ca8a04" />
            </div>

            <div>
              <p className={styles.metricLabel}>입금 확인률</p>
              <p className={styles.metricValue}>
                {totalPeople > 0
                  ? ((completedCount / totalPeople) * 100).toFixed(1)
                  : 0}
                %
              </p>
            </div>
          </div>

          <div className={styles.metric}>
            <div
              className={styles.metricIcon}
              style={{ background: '#f3e8ff' }}
            >
              <BarChart3 size={24} color="#9333ea" />
            </div>

            <div>
              <p className={styles.metricLabel}>행선지 수</p>
              <p className={styles.metricValue}>{destStats.length}개</p>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <h2>행선지별 신청 현황</h2>

          <div className={styles.statsTable}>
            <table>
              <thead>
                <tr>
                  <th>행선지</th>
                  <th>1지망</th>
                  <th>2지망</th>
                  <th>총합</th>
                  <th>비율</th>
                </tr>
              </thead>

              <tbody>
                {destStats.map((stat) => {
                  const percentage =
                    totalPreferenceCount > 0
                      ? (stat.total / totalPreferenceCount) * 100
                      : 0;

                  return (
                    <tr key={stat.name}>
                      <td className={styles.stationName}>{stat.name}</td>
                      <td>
                        <span className={styles.rank1}>{stat.rank1}</span>
                      </td>
                      <td>
                        <span className={styles.rank2}>{stat.rank2}</span>
                      </td>
                      <td className={styles.total}>{stat.total}</td>
                      <td>
                        <div className={styles.barContainer}>
                          <div
                            className={styles.bar}
                            style={{ width: `${percentage}%` }}
                          />
                          <span className={styles.percentage}>
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.section}>
          <h2>인당 버스 가격 설정</h2>

          <div className={styles.adminFilterPanel}>
            <div className={styles.adminFilterGrid}>
              <div className={styles.adminFilterField}>
                <label>현재 인당 버스 가격</label>
                <input
                  type="number"
                  min={0}
                  value={busTicketPriceInput}
                  onChange={(e) => setBusTicketPriceInput(e.target.value)}
                  placeholder="예: 50000"
                />
              </div>

              <div className={styles.adminFilterField}>
                <label>적용 가격</label>
                <div>
                  <strong>{busTicketPrice.toLocaleString()}원</strong>
                </div>
              </div>
            </div>

            <div className={styles.adminSearchActionRow}>
              <button
                type="button"
                className={styles.adminSearchButton}
                onClick={handleSaveBusTicketPrice}
                disabled={priceSaving}
              >
                {priceSaving ? '저장 중...' : '가격 저장'}
              </button>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <h2>입금 현황</h2>

          <div className={styles.paymentStats}>
            <div className={styles.paymentStat}>
              <p className={styles.statLabel}>확인완료</p>
              <p className={styles.statNumber} style={{ color: '#10b981' }}>
                {paymentStats?.completed || 0}명
              </p>
            </div>

            <div className={styles.paymentStat}>
              <p className={styles.statLabel}>대기중</p>
              <p className={styles.statNumber} style={{ color: '#f59e0b' }}>
                {paymentStats?.pending || 0}명
              </p>
            </div>

            <div className={styles.paymentStat}>
              <p className={styles.statLabel}>환불</p>
              <p className={styles.statNumber} style={{ color: '#ef4444' }}>
                {paymentStats?.refunded || 0}명
              </p>
            </div>

            <div className={styles.paymentStat}>
              <p className={styles.statLabel}>확인액</p>
              <p className={styles.statNumber} style={{ color: '#667eea' }}>
                {(paymentStats?.totalCompleted || 0).toLocaleString()}원
              </p>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <h2>빠른 액션</h2>

          <div className={styles.actionGrid}>
            <button
              type="button"
              className={styles.actionCard}
              onClick={() => navigate('/admin/allocation')}
            >
              <div className={styles.actionIcon}>🚌</div>
              <h3>버스 배분 최적화</h3>
              <p>버스 옵션 설정 및 최적 배분 계산</p>
            </button>

            <button
              type="button"
              className={styles.actionCard}
              onClick={() => navigate('/admin/tickets')}
            >
              <div className={styles.actionIcon}>📋</div>
              <h3>버스표 관리</h3>
              <p>개인 버스표 확정 및 관리</p>
            </button>

            <button
              type="button"
              className={styles.actionCard}
              onClick={() => navigate('/admin/campus-transfer')}
            >
              <div className={styles.actionIcon}>👥</div>
              <h3>캠퍼스 관리</h3>
              <p>캠퍼스별 입금 현황</p>
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.adminManagerHeader}>
            <div>
              <h2>캠퍼스 관리자 권한 관리</h2>
              <p>
                지구, 팀, 캠퍼스를 선택한 뒤 해당 캠퍼스 유저를 검색해서
                관리자 권한을 등록, 취소, 변경할 수 있습니다.
              </p>
            </div>
          </div>

          <div className={styles.adminFilterPanel}>
            <div className={styles.adminFilterGrid}>
              <div className={styles.adminFilterField}>
                <label>지구</label>
                <select
                  value={selectedDistrictId}
                  onChange={(e) => handleDistrictChange(e.target.value)}
                >
                  <option value="">전체 지구</option>
                  {districts.map((district) => (
                    <option key={district.id} value={district.id}>
                      {district.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.adminFilterField}>
                <label>팀</label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => handleTeamChange(e.target.value)}
                  disabled={!selectedDistrictId}
                >
                  <option value="">전체 팀</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.adminFilterField}>
                <label>캠퍼스</label>
                <select
                  value={selectedCampusId}
                  onChange={(e) => handleCampusChange(e.target.value)}
                  disabled={!selectedTeamId}
                >
                  <option value="">전체 캠퍼스</option>
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>
                      {campus.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.adminSearchActionRow}>
              <button
                type="button"
                className={styles.adminSearchButton}
                onClick={handleSearchUsers}
                disabled={searchingUsers}
              >
                {searchingUsers ? '검색 중...' : '유저 검색'}
              </button>
            </div>
          </div>

          {adminManageError && (
            <p className={styles.adminErrorText}>{adminManageError}</p>
          )}

          {adminManageSuccess && (
            <p className={styles.adminSuccessText}>{adminManageSuccess}</p>
          )}

          {selectedDistrictName && selectedTeamName && selectedCampusName && (
            <div className={styles.currentCampusAdminBox}>
              <div>
                <strong>현재 선택</strong>
                <p>
                  {selectedDistrictName} / {selectedTeamName} /{' '}
                  {selectedCampusName}
                </p>
              </div>

              <div>
                <strong>현재 캠퍼스 관리자</strong>
                {currentCampusAdmin ? (
                  <p>
                    {currentCampusAdmin.name} ·{' '}
                    {currentCampusAdmin.phone ||
                      currentCampusAdmin.email ||
                      '연락처 미등록'}
                  </p>
                ) : (
                  <p>등록된 캠퍼스 관리자가 없습니다.</p>
                )}
              </div>
            </div>
          )}

          <div className={styles.adminUserList}>
            {searchedUsers.map((user) => {
              const isCampusAdmin = user.role === 'campus_admin';

              const isCurrentSelectedCampusAdmin =
                user.role === 'campus_admin' &&
                Boolean(
                  selectedDistrictName && selectedTeamName && selectedCampusName
                ) &&
                user.district === selectedDistrictName &&
                user.team === selectedTeamName &&
                user.campus === selectedCampusName;

              const isGlobalAdmin = user.role === 'global_admin';
              const isLoading = adminActionLoading === user.userId;

              const hasUserScope = Boolean(
                (selectedDistrictName || user.district) &&
                  (selectedTeamName || user.team) &&
                  (selectedCampusName || user.campus)
              );

              return (
                <div key={user.userId} className={styles.adminUserCard}>
                  <div className={styles.adminUserInfo}>
                    <div className={styles.adminUserMainRow}>
                      <strong>{user.name}</strong>

                      {isGlobalAdmin && (
                        <span className={styles.globalAdminBadge}>
                          전체 관리자
                        </span>
                      )}

                      {isCampusAdmin && (
                        <span className={styles.campusAdminBadge}>
                          {isCurrentSelectedCampusAdmin
                            ? '현재 캠퍼스 관리자'
                            : '캠퍼스 관리자'}
                        </span>
                      )}
                    </div>

                    <div className={styles.adminUserMeta}>
                      <span>지구: {user.district || '미등록'}</span>
                      <span>팀: {user.team || '미등록'}</span>
                      <span>캠퍼스: {user.campus || '미등록'}</span>
                      <span>연락처: {user.phone || '미등록'}</span>
                      {user.email && <span>이메일: {user.email}</span>}
                    </div>
                  </div>

                  <div className={styles.adminUserAction}>
                    {isGlobalAdmin ? (
                      <button
                        type="button"
                        className={styles.disabledAdminButton}
                        disabled
                      >
                        전체 관리자
                      </button>
                    ) : isCampusAdmin ? (
                      <button
                        type="button"
                        className={styles.removeAdminButton}
                        onClick={() => handleCancelCampusAdmin(user)}
                        disabled={isLoading}
                      >
                        {isLoading ? '처리 중...' : '관리자 취소'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.assignAdminButton}
                        onClick={() => handleAssignOrChangeCampusAdmin(user)}
                        disabled={isLoading || !hasUserScope}
                      >
                        {isLoading
                          ? '처리 중...'
                          : !hasUserScope
                            ? '정보 부족'
                            : currentCampusAdmin
                              ? '관리자 변경'
                              : '관리자 등록'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminGlobalPage;