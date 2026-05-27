import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Circle,
  Database,
  DollarSign,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Header from '../../components/Header';
import {
  getAdminRole,
  getBusTicketPrice,
  getReservationDataResetStats,
  resetReservationData,
  updateBusTicketPrice,
  type ReservationDataResetStats,
} from '../../lib/adminService';
import { supabase } from '../../lib/supabase';

import styles from './AdminSetupCheckPage.module.css';

interface CampusOptionRow {
  district: string | null;
  team: string | null;
  campus: string | null;
}

interface CampusAdminRoleRow {
  district: string | null;
  team: string | null;
  campus: string | null;
}

interface CampusSetupRow {
  key: string;
  district: string;
  team: string;
  campus: string;
  target: number;
  hasAdmin: boolean;
}

const PARTICIPATION_TARGETS_STORAGE_KEY =
  'admin_ticket_participation_targets';
const SETUP_CHECK_STORAGE_KEY = 'admin_setup_checklist';
const RESET_CONFIRM_TEXT = '예약정보 초기화';

const getCampusKey = (district: string, team: string, campus: string) =>
  `campus|${district}|${team}|${campus}`;

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

const loadParticipationTargets = () => {
  const saved = localStorage.getItem(PARTICIPATION_TARGETS_STORAGE_KEY);

  if (!saved) return {};

  try {
    const parsed = JSON.parse(saved);

    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
};

const loadCheckedIds = () => {
  const saved = localStorage.getItem(SETUP_CHECK_STORAGE_KEY);

  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);

    return Array.isArray(parsed)
      ? parsed.filter((value) => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
};

const AdminSetupCheckPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [savingPrice, setSavingPrice] = useState(false);
  const [resettingData, setResettingData] = useState(false);
  const [campuses, setCampuses] = useState<CampusSetupRow[]>([]);
  const [busTicketPrice, setBusTicketPrice] = useState(0);
  const [busTicketPriceInput, setBusTicketPriceInput] = useState('');
  const [resetStats, setResetStats] = useState<ReservationDataResetStats>({
    reservations: 0,
    payments: 0,
    campusTransfers: 0,
    busAllocations: 0,
    campusRequests: 0,
    campusRequestMessages: 0,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>(loadCheckedIds);

  const summary = useMemo(() => {
    const districtCount = new Set(campuses.map((row) => row.district)).size;
    const teamCount = new Set(
      campuses.map((row) => `${row.district}|${row.team}`)
    ).size;
    const totalTarget = campuses.reduce((sum, row) => sum + row.target, 0);
    const missingTargetCount = campuses.filter((row) => row.target <= 0).length;
    const missingAdminCount = campuses.filter((row) => !row.hasAdmin).length;

    return {
      districtCount,
      teamCount,
      campusCount: campuses.length,
      totalTarget,
      missingTargetCount,
      missingAdminCount,
    };
  }, [campuses]);

  const issueCampuses = useMemo(
    () =>
      campuses
        .filter((row) => row.target <= 0 || !row.hasAdmin)
        .sort(
          (a, b) =>
            Number(a.hasAdmin) - Number(b.hasAdmin) ||
            Number(a.target > 0) - Number(b.target > 0) ||
            a.district.localeCompare(b.district, 'ko') ||
            a.team.localeCompare(b.team, 'ko') ||
            a.campus.localeCompare(b.campus, 'ko')
        ),
    [campuses]
  );

  const setupItems = [
    {
      id: 'organization',
      icon: Building2,
      title: '서울지구 팀/캠퍼스 구조 및 인원',
      description:
        '캠퍼스 목록이 맞는지 확인하고, 캠퍼스별 예상 참여 인원을 입력합니다.',
      status:
        summary.campusCount > 0 && summary.missingTargetCount === 0
          ? '설정 완료'
          : `${summary.missingTargetCount.toLocaleString()}개 캠퍼스 인원 미입력`,
      actionLabel: '구조 및 인원 설정',
      actionPath: '/admin/participation-targets',
      isReady: summary.campusCount > 0 && summary.missingTargetCount === 0,
    },
    {
      id: 'campus-admins',
      icon: ShieldCheck,
      title: '캠퍼스 관리자 배정',
      description:
        '각 캠퍼스의 회계 순장님이 캠퍼스 관리자로 등록되어 있는지 확인합니다.',
      status:
        summary.campusCount > 0 && summary.missingAdminCount === 0
          ? '설정 완료'
          : `${summary.missingAdminCount.toLocaleString()}개 캠퍼스 관리자 미등록`,
      actionLabel: '관리자 권한 설정',
      actionPath: '/admin/campus-admins',
      isReady: summary.campusCount > 0 && summary.missingAdminCount === 0,
    },
    {
      id: 'bus-price',
      icon: DollarSign,
      title: '버스표 가격',
      description:
        '사용자 신청, 입금 집계, 캠퍼스 송금 계산에 적용될 1인 버스표 가격을 설정합니다.',
      status:
        busTicketPrice > 0
          ? `${busTicketPrice.toLocaleString()}원`
          : '가격 미설정',
      actionLabel: '가격 저장',
      actionPath: '',
      isReady: busTicketPrice > 0,
    },
  ];
  const readySetupCount = setupItems.filter((item) => item.isReady).length;
  const checkedSetupCount = setupItems.filter((item) =>
    checkedIds.includes(item.id)
  ).length;
  const setupProgressPercent = Math.round(
    (readySetupCount / setupItems.length) * 100
  );
  const visibleCampusRows = issueCampuses.length > 0 ? issueCampuses : campuses;
  const totalResettableRows =
    resetStats.reservations +
    resetStats.payments +
    resetStats.campusTransfers +
    resetStats.busAllocations +
    resetStats.campusRequests +
    resetStats.campusRequestMessages;

  const loadSetup = async () => {
    setLoading(true);
    setError(null);

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

      const [
        campusResult,
        adminRoleResult,
        ticketPrice,
        reservationDataStats,
      ] = await Promise.all([
        supabase
          .from('campus_options')
          .select('district, team, campus')
          .order('district', { ascending: true })
          .order('team', { ascending: true })
          .order('campus', { ascending: true }),
        supabase
          .from('admin_roles')
          .select('district, team, campus')
          .eq('role', 'campus_admin'),
        getBusTicketPrice(),
        getReservationDataResetStats(),
      ]);

      if (campusResult.error) throw campusResult.error;
      if (adminRoleResult.error) throw adminRoleResult.error;

      const targets = loadParticipationTargets();
      const adminKeys = new Set(
        ((adminRoleResult.data ?? []) as CampusAdminRoleRow[]).map((role) =>
          getCampusKey(role.district ?? '', role.team ?? '', role.campus ?? '')
        )
      );
      const rows = ((campusResult.data ?? []) as CampusOptionRow[])
        .map((item) => {
          const district = item.district || '미등록 지구';
          const team = item.team || '미등록 팀';
          const campus = item.campus || '미등록 캠퍼스';
          const key = getCampusKey(district, team, campus);

          return {
            key,
            district,
            team,
            campus,
            target: Number(targets[key] ?? 0),
            hasAdmin: adminKeys.has(key),
          };
        })
        .filter(
          (item, index, array) =>
            array.findIndex((target) => target.key === item.key) === index
        );

      setCampuses(rows);
      setBusTicketPrice(ticketPrice);
      setBusTicketPriceInput(String(ticketPrice));
      setResetStats(reservationDataStats);
    } catch (loadError) {
      console.error('Failed to load setup check page:', loadError);
      setError(`세팅 정보를 불러오지 못했습니다: ${getErrorMessage(loadError)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial page load is an external Supabase synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((value) => value !== id)
        : [...prev, id];

      localStorage.setItem(SETUP_CHECK_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleSaveBusTicketPrice = async () => {
    const nextPrice = Number(busTicketPriceInput);

    if (Number.isNaN(nextPrice) || nextPrice < 0) {
      setError('버스표 가격은 0 이상의 숫자로 입력해주세요.');
      return;
    }

    setSavingPrice(true);
    setMessage(null);
    setError(null);

    try {
      const savedPrice = await updateBusTicketPrice(nextPrice);

      setBusTicketPrice(savedPrice);
      setBusTicketPriceInput(String(savedPrice));
      setMessage(`버스표 가격을 ${savedPrice.toLocaleString()}원으로 저장했습니다.`);
    } catch (saveError) {
      console.error('Failed to save bus ticket price:', saveError);
      setError(`버스표 가격 저장 중 오류가 발생했습니다: ${getErrorMessage(saveError)}`);
    } finally {
      setSavingPrice(false);
    }
  };

  const handleResetReservationData = async () => {
    if (totalResettableRows === 0) {
      setMessage('초기화할 예약 운영 데이터가 없습니다.');
      setError(null);
      return;
    }

    const confirmedText = window.prompt(
      `예약, 입금, 송금, 배차 결과, 캠퍼스 문의 데이터 ${totalResettableRows.toLocaleString()}건을 삭제합니다.\n조직/관리자/버스 옵션/가격 설정은 유지됩니다.\n\n계속하려면 "${RESET_CONFIRM_TEXT}"를 입력해주세요.`
    );

    if (confirmedText !== RESET_CONFIRM_TEXT) {
      setError(`초기화를 취소했습니다. 정확히 "${RESET_CONFIRM_TEXT}"를 입력해야 합니다.`);
      setMessage(null);
      return;
    }

    setResettingData(true);
    setMessage(null);
    setError(null);

    try {
      const deletedStats = await resetReservationData();
      const refreshedStats = await getReservationDataResetStats();
      const deletedTotal =
        deletedStats.reservations +
        deletedStats.payments +
        deletedStats.campusTransfers +
        deletedStats.busAllocations +
        deletedStats.campusRequests +
        deletedStats.campusRequestMessages;

      setResetStats(refreshedStats);
      setMessage(
        `예약 운영 데이터 ${deletedTotal.toLocaleString()}건을 초기화했습니다.`
      );
    } catch (resetError) {
      console.error('Failed to reset reservation data:', resetError);
      setError(
        `예약정보 초기화 중 오류가 발생했습니다: ${getErrorMessage(resetError)}`
      );
    } finally {
      setResettingData(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <Header />
        <main className={styles.main}>
          <p className={styles.loadingText}>세팅 정보를 불러오는 중...</p>
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
            <span className={styles.eyebrow}>Step 0</span>
            <h1>세팅 확인</h1>
            <p>
              신청을 받기 전에 서울지구 조직 구조, 캠퍼스 관리자 권한, 버스표
              가격을 먼저 확인합니다.
            </p>
          </div>

          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void loadSetup()}
          >
            <RefreshCw size={16} />
            새로고침
          </button>
        </section>

        <section className={styles.readinessPanel}>
          <div className={styles.readinessMain}>
            <span>초기 세팅 준비율</span>
            <strong>{setupProgressPercent}%</strong>
            <div className={styles.progressTrack}>
              <div style={{ width: `${setupProgressPercent}%` }} />
            </div>
            <p>
              시스템 기준 {readySetupCount}/{setupItems.length}개 완료 · 수동 확인{' '}
              {checkedSetupCount}/{setupItems.length}개 완료
            </p>
          </div>

          <div className={styles.readinessChecklist}>
            {setupItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.readinessItem} ${
                  item.isReady ? styles.readinessItemReady : ''
                }`}
                onClick={() => {
                  if (item.id !== 'bus-price') navigate(item.actionPath);
                }}
              >
                <span>{item.title}</span>
                <strong>{item.isReady ? '완료' : item.status}</strong>
              </button>
            ))}
          </div>
        </section>

        {(message || error) && (
          <p className={message ? styles.successMessage : styles.errorMessage}>
            {message || error}
          </p>
        )}

        <section className={styles.summaryGrid}>
          <div>
            <span>지구 / 팀 / 캠퍼스</span>
            <strong>
              {summary.districtCount} / {summary.teamCount} /{' '}
              {summary.campusCount}
            </strong>
          </div>

          <div>
            <span>예상 참여 인원</span>
            <strong>{summary.totalTarget.toLocaleString()}명</strong>
          </div>

          <div>
            <span>현재 버스표 가격</span>
            <strong>{busTicketPrice.toLocaleString()}원</strong>
          </div>

          <div>
            <span>초기화 대상 데이터</span>
            <strong>{totalResettableRows.toLocaleString()}건</strong>
          </div>
        </section>

        <section className={styles.setupGrid}>
          {setupItems.map((item) => {
            const Icon = item.icon;
            const isChecked = checkedIds.includes(item.id);

            return (
              <article
                key={item.id}
                className={`${styles.setupCard} ${
                  item.isReady ? styles.setupCardReady : ''
                }`}
              >
                <div className={styles.cardTopRow}>
                  <div className={styles.iconBox}>
                    <Icon size={22} />
                  </div>

                  <button
                    type="button"
                    className={styles.checkButton}
                    onClick={() => toggleChecked(item.id)}
                    aria-label={`${item.title} 확인 완료`}
                  >
                    {isChecked ? (
                      <CheckCircle2 size={24} />
                    ) : (
                      <Circle size={24} />
                    )}
                  </button>
                </div>

                <div className={styles.cardBody}>
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                  <span
                    className={
                      item.isReady ? styles.readyBadge : styles.warningBadge
                    }
                  >
                    {item.status}
                  </span>
                </div>

                {item.id === 'bus-price' ? (
                  <div className={styles.priceEditor}>
                    <label>
                      <span>1인 버스표 가격</span>
                      <input
                        type="number"
                        min={0}
                        value={busTicketPriceInput}
                        onChange={(event) =>
                          setBusTicketPriceInput(event.target.value)
                        }
                        placeholder="예: 20000"
                      />
                    </label>

                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => void handleSaveBusTicketPrice()}
                      disabled={savingPrice}
                    >
                      {savingPrice ? '저장 중...' : item.actionLabel}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => navigate(item.actionPath)}
                  >
                    {item.actionLabel}
                    <ArrowRight size={16} />
                  </button>
                )}
              </article>
            );
          })}
        </section>

        <section className={styles.resetPanel}>
          <div className={styles.resetPanelHeader}>
            <div className={styles.resetIconBox}>
              <Database size={22} />
            </div>
            <div>
              <h2>DB 예약정보 초기화</h2>
              <p>
                시뮬레이션이나 새 접수 시작 전에 예약 운영 데이터를 비웁니다.
                조직 구조, 관리자 권한, 버스 옵션, 가격 설정은 유지됩니다.
              </p>
            </div>
          </div>

          <div className={styles.resetStatsGrid}>
            <div>
              <span>예약</span>
              <strong>{resetStats.reservations.toLocaleString()}건</strong>
            </div>
            <div>
              <span>입금</span>
              <strong>{resetStats.payments.toLocaleString()}건</strong>
            </div>
            <div>
              <span>캠퍼스 송금</span>
              <strong>{resetStats.campusTransfers.toLocaleString()}건</strong>
            </div>
            <div>
              <span>배차 결과</span>
              <strong>{resetStats.busAllocations.toLocaleString()}건</strong>
            </div>
            <div>
              <span>캠퍼스 문의</span>
              <strong>{resetStats.campusRequests.toLocaleString()}건</strong>
            </div>
          </div>

          <div className={styles.resetPanelFooter}>
            <p>
              삭제 후 되돌릴 수 없습니다. Supabase에
              `sql/60_reset_reservation_data.sql`이 먼저 적용되어 있어야
              합니다.
            </p>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() => void handleResetReservationData()}
              disabled={resettingData || totalResettableRows === 0}
            >
              <Trash2 size={16} />
              {resettingData ? '초기화 중...' : '예약정보 초기화'}
            </button>
          </div>
        </section>

        <section className={styles.detailPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>
                {issueCampuses.length > 0
                  ? '먼저 처리할 캠퍼스'
                  : '캠퍼스별 확인 현황'}
              </h2>
              <p>
                {issueCampuses.length > 0
                  ? '인원 또는 관리자 지정이 빠진 캠퍼스만 먼저 보여줍니다.'
                  : '모든 캠퍼스의 인원과 관리자 지정이 준비되었습니다.'}
              </p>
            </div>
            <span className={styles.panelCount}>
              {visibleCampusRows.length.toLocaleString()}개 표시
            </span>
          </div>

          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>지구</th>
                  <th>팀</th>
                  <th>캠퍼스</th>
                  <th>인원</th>
                  <th>관리자</th>
                </tr>
              </thead>
              <tbody>
                {visibleCampusRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.district}</td>
                    <td>{row.team}</td>
                    <td>{row.campus}</td>
                    <td>{row.target > 0 ? `${row.target}명` : '미입력'}</td>
                    <td>
                      <span
                        className={
                          row.hasAdmin ? styles.readyBadge : styles.warningBadge
                        }
                      >
                        {row.hasAdmin ? '등록됨' : '미등록'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminSetupCheckPage;
