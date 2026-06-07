import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bus,
  CheckCircle2,
  CircleHelp,
  CreditCard,
  MessageSquare,
  Timer,
  Users,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  getBusTicketPrice,
  getCampusTransferStats,
  type CampusTransferStat,
} from '../../lib/adminService';
import {
  formatReservationDeadline,
  getReservationDeadline,
  type ReservationDeadlineSetting,
} from '../../lib/reservationDeadlineService';
import {
  getParticipationTargetsSetting,
  getTotalParticipationTarget,
} from '../../lib/participationTargetsService';
import {
  getGlobalScenarioChecklist,
  updateGlobalScenarioChecklist,
} from '../../lib/globalScenarioChecklistService';

import styles from './AdminGlobalPage.module.css';
import AdminHeader from './AdminHeader';

const operationScenarioSteps = [
  {
    id: 'initial-setup',
    title: '운영 초기값 설정',
    description: '조직, 예상 참여 인원, 캠퍼스 관리자 권한을 먼저 점검합니다.',
    actionLabel: '운영 초기값 설정하기',
    actionPath: '/admin/setup-check',
  },
  {
    id: 'post-deadline-operations',
    title: '공지-신청시작-신청 마감',
    description: '신청 마감 일시를 설정하고, 각 팀과 캠퍼스에 공지를 전달한 뒤 신청을 시작합니다.',
    checks: ['신청 마감 일시 설정', '팀·캠퍼스별 공지 전달', '신청 시작'],
    actionLabel: '신청 마감 일시 설정하기',
    actionPath: '/admin/reservation-deadline',
    actionLinks: [
      { label: '신청 현황 확인하기', path: '/admin/tickets' },
    ],
  },
  {
    id: 'payment-and-request-management',
    title: '입금 집계 및 문의 처리',
    description: '캠퍼스별 입금 현황을 집계하고 접수된 문의를 확인하여 처리합니다.',
    checks: ['입금 집계 확인', '문의 처리'],
    actionLabel: '입금 집계 확인하기',
    actionPath: '/admin/campus-transfer',
    actionLinks: [
      { label: '개별 사용자 관리', path: '/admin/users' },
      { label: '문의', path: '/admin/campus-requests' },
    ],
  },
  {
    id: 'allocation-planning',
    title: '배차 계획 산출',
    description: '신청 인원과 행선지별 수요를 바탕으로 배차 계획을 산출하고 결과를 검토합니다.',
    actionLabel: '배차 계획 산출하기',
    actionPath: '/admin/allocation',
  },
  {
    id: 'remaining-seat-sales',
    title: '배차 확정 이후 잔여 좌석 판매',
    description: '배차 확정 후 잔여 좌석을 추가 판매하고 관리합니다.',
    actionLabel: '잔여 좌석 관리하기',
    actionPath: '/admin/remaining-seat-sales',
  },
  {
    id: 'final-check',
    title: '출발 전 최종 점검',
    description: '탑승 명단, 입금 상태, 탑승 장소, 안내 사항을 마지막으로 확인합니다.',
    actionLabel: '최종 명단 확인하기',
    actionPath: '/admin/tickets',
  },
] as const;

const operationScenarioStepIds = new Set<string>(
  operationScenarioSteps.map((step) => step.id)
);

const quickActions = [
  {
    title: '개별 사용자 관리',
    description: '사용자별 관리자 권한과 개인 버스표 정보를 함께 관리합니다.',
    path: '/admin/users',
    icon: CreditCard,
  },
  {
    title: '공지·문의 관리',
    description: '캠퍼스 문의와 캠퍼스 공지, 홈화면 공지를 함께 관리합니다.',
    path: '/admin/campus-requests',
    icon: CircleHelp,
  },
  {
    title: '배차 로직',
    description: '배차 계산 기준과 옵션을 점검합니다.',
    path: '/admin/allocation/logic',
    icon: Bus,
  },
] as const;

const formatCurrency = (amount: number) => `${amount.toLocaleString()}원`;

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const getDeadlineRemainingText = (deadlineAt: string | null, nowMs: number) => {
  if (!deadlineAt) return '신청 마감 일시를 설정해주세요.';

  const remainingMs = new Date(deadlineAt).getTime() - nowMs;

  if (remainingMs <= 0) return '신청이 마감되었습니다.';

  const totalMinutes = Math.ceil(remainingMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}일 ${hours}시간 남음`;
  if (hours > 0) return `${hours}시간 ${minutes}분 남음`;

  return `${minutes}분 남음`;
};

const AdminGlobalPage = () => {
  const navigate = useNavigate();

  const [subscriberCount, setSubscriberCount] = useState(0);
  const [reservationCount, setReservationCount] = useState(0);
  const [busTicketPrice, setBusTicketPrice] = useState(0);
  const [participationTarget, setParticipationTarget] = useState(0);
  const [unresolvedRequestCount, setUnresolvedRequestCount] = useState(0);
  const [draftAllocationCount, setDraftAllocationCount] = useState(0);
  const [confirmedAllocationCount, setConfirmedAllocationCount] = useState(0);
  const [campusTransfers, setCampusTransfers] = useState<CampusTransferStat[]>(
    []
  );
  const [reservationDeadline, setReservationDeadline] =
    useState<ReservationDeadlineSetting>({
      deadlineAt: null,
      isClosed: false,
    });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkedScenarioStepIds, setCheckedScenarioStepIds] = useState<
    string[]
  >([]);

  const handleToggleScenarioStep = (stepId: string) => {
    const previous = checkedScenarioStepIds;
    const next = previous.includes(stepId)
      ? previous.filter((id) => id !== stepId)
      : [...previous, stepId];

    setCheckedScenarioStepIds(next);
    void updateGlobalScenarioChecklist(next).catch((error) => {
      console.error('Failed to update global scenario checklist:', error);
      setCheckedScenarioStepIds(previous);
      setLoadError('운영 체크리스트를 DB에 저장하지 못했습니다.');
    });
  };

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const [
        transfers,
        subscriberCountResult,
        reservationCountResult,
        ticketPrice,
        deadline,
        participationSetting,
        scenarioChecklist,
        unresolvedRequestResult,
        draftAllocationResult,
        confirmedAllocationResult,
      ] =
        await Promise.all([
          getCampusTransferStats(),
          supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true }),
          supabase
            .from('reservations')
            .select('id', { count: 'exact', head: true })
            .neq('status', 'cancelled'),
          getBusTicketPrice(),
          getReservationDeadline(),
          getParticipationTargetsSetting(),
          getGlobalScenarioChecklist(operationScenarioStepIds),
          supabase
            .from('campus_requests')
            .select('id', { count: 'exact', head: true })
            .neq('status', 'resolved')
            .eq('is_global_notice', false),
          supabase
            .from('bus_allocations')
            .select('id', { count: 'exact', head: true })
            .filter('allocation_data->>status', 'eq', 'draft'),
          supabase
            .from('bus_allocations')
            .select('id', { count: 'exact', head: true })
            .filter('allocation_data->>status', 'eq', 'confirmed'),
        ]);

      const dashboardError =
        reservationCountResult.error ??
        subscriberCountResult.error ??
        unresolvedRequestResult.error ??
        draftAllocationResult.error ??
        confirmedAllocationResult.error;

      if (dashboardError) throw dashboardError;

      setCampusTransfers(transfers);
      setSubscriberCount(subscriberCountResult.count ?? 0);
      setReservationCount(reservationCountResult.count ?? 0);
      setBusTicketPrice(ticketPrice);
      setReservationDeadline(deadline);
      setParticipationTarget(getTotalParticipationTarget(participationSetting));
      setCheckedScenarioStepIds(scenarioChecklist);
      setUnresolvedRequestCount(unresolvedRequestResult.count ?? 0);
      setDraftAllocationCount(draftAllocationResult.count ?? 0);
      setConfirmedAllocationCount(confirmedAllocationResult.count ?? 0);
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoadError('대시보드 데이터를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadDashboardData();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadDashboardData]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60 * 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  const totalPeople = reservationCount;
  const totalCompletedAmount = campusTransfers.reduce(
    (sum, transfer) => sum + (transfer.actualConfirmedAmount ?? 0),
    0
  );
  const expectedPaymentAmount = reservationCount * busTicketPrice;
  const paymentCollectionRate =
    expectedPaymentAmount > 0
      ? (totalCompletedAmount / expectedPaymentAmount) * 100
      : 0;
  const scenarioProgress =
    (checkedScenarioStepIds.length / operationScenarioSteps.length) * 100;
  const currentScenarioIndex = operationScenarioSteps.findIndex(
    (step) => !checkedScenarioStepIds.includes(step.id)
  );
  const currentScenarioStep =
    currentScenarioIndex >= 0 ? operationScenarioSteps[currentScenarioIndex] : null;
  const isReservationClosed = Boolean(
    reservationDeadline.deadlineAt &&
      new Date(reservationDeadline.deadlineAt).getTime() <= nowMs
  );
  const deadlineStatus = !reservationDeadline.deadlineAt
    ? '미설정'
    : isReservationClosed
      ? '마감됨'
      : '신청 가능';
  const allocationStatus =
    confirmedAllocationCount > 0
      ? '확정 완료'
      : draftAllocationCount > 0
        ? '임시안 검토 중'
        : '배차안 미생성';
  const allocationDescription =
    confirmedAllocationCount > 0
      ? `확정 배차안 ${confirmedAllocationCount.toLocaleString()}개`
      : draftAllocationCount > 0
        ? `임시 배차안 ${draftAllocationCount.toLocaleString()}개`
        : '배차 계산을 시작해주세요.';

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <AdminHeader />

        <main className={styles.main}>
          <div className={styles.loadingState}>대시보드를 불러오는 중입니다.</div>
        </main>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.pageContainer}>
        <AdminHeader />

        <main className={styles.main}>
          <section className={styles.errorState} role="alert">
            <strong>대시보드를 불러오지 못했습니다.</strong>
            <p>{loadError}</p>
            <button type="button" onClick={() => void loadDashboardData()}>
              다시 시도
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />

      <main className={styles.main}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>전체 관리자</span>
            <h1>운영 대시보드</h1>
            <p>
              신청 현황, 입금 상태, 배차 준비 단계를 한 화면에서 확인합니다.
            </p>
          </div>

        </section>

        <section className={styles.nextActionPanel} aria-label="다음 작업">
          <div>
            <span className={styles.nextActionLabel}>
              {currentScenarioStep
                ? `다음 작업 ${currentScenarioIndex + 1}`
                : '운영 체크 완료'}
            </span>
            <h2>
              {currentScenarioStep
                ? currentScenarioStep.title
                : '모든 운영 체크가 완료되었습니다.'}
            </h2>
            <p>
              {currentScenarioStep
                ? currentScenarioStep.description
                : '필요한 경우 빠른 액션에서 공지, 문의, 사용자 관리를 확인해주세요.'}
            </p>
          </div>

          {currentScenarioStep && (
            <button
              type="button"
              className={styles.nextActionButton}
              onClick={() => navigate(currentScenarioStep.actionPath)}
            >
              <span>{currentScenarioStep.actionLabel}</span>
              <ArrowRight size={16} />
            </button>
          )}
        </section>

        <section className={styles.metricsGrid} aria-label="핵심 지표">
          <div className={`${styles.metric} ${styles.peopleMetric}`}>
            <div className={styles.metricIconSlate}>
              <Users size={22} />
            </div>
            <div className={styles.peopleMetricValues}>
              <div>
                <span>신청자</span>
                <strong>{totalPeople.toLocaleString()}명</strong>
              </div>
              <div>
                <span>가입자</span>
                <strong>{subscriberCount.toLocaleString()}명</strong>
              </div>
              <div>
                <span>예상 인원</span>
                <strong>{participationTarget.toLocaleString()}명</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            className={styles.metric}
            onClick={() => navigate('/admin/campus-transfer')}
            aria-label={`입금률 ${formatPercent(paymentCollectionRate)}, 입금 관리로 이동`}
          >
              <div className={styles.metricIconGreen}>
                <CreditCard size={22} />
              </div>
              <span>입금률</span>
              <strong>{formatPercent(paymentCollectionRate)}</strong>
              <p>
                {formatCurrency(totalCompletedAmount)} /{' '}
                {formatCurrency(expectedPaymentAmount)}
              </p>
              <p className={styles.metricFormula}>
                신청자 {reservationCount.toLocaleString()}명 × 버스표{' '}
                {formatCurrency(busTicketPrice)}
              </p>
          </button>

          <button
            type="button"
            className={`${styles.metric} ${
              unresolvedRequestCount > 0 ? styles.attentionMetric : ''
            }`}
            onClick={() => navigate('/admin/campus-requests')}
            aria-label={`미처리 문의 ${unresolvedRequestCount}건, 문의 관리로 이동`}
          >
            <div className={styles.metricIconAmber}>
              <MessageSquare size={22} />
            </div>
            <span>미처리 문의</span>
            <strong>{unresolvedRequestCount.toLocaleString()}건</strong>
            <p>
              {unresolvedRequestCount > 0
                ? '확인이 필요한 문의가 있습니다.'
                : '모든 문의를 처리했습니다.'}
            </p>
          </button>

          <button
            type="button"
            className={`${styles.metric} ${styles.deadlineMetric} ${
              !reservationDeadline.deadlineAt
                ? styles.deadlineMetricUnset
                : isReservationClosed
                  ? styles.deadlineMetricClosed
                  : styles.deadlineMetricOpen
            }`}
            onClick={() => navigate('/admin/reservation-deadline')}
            aria-label={`신청 마감 설정, 현재 상태 ${deadlineStatus}`}
          >
            <div
              className={
                !reservationDeadline.deadlineAt
                  ? styles.metricIconAmber
                  : isReservationClosed
                    ? styles.metricIconSlate
                    : styles.metricIconBlue
              }
            >
              <Timer size={22} />
            </div>
            <span>신청 마감</span>
            <strong>{deadlineStatus}</strong>
            <p>
              {getDeadlineRemainingText(reservationDeadline.deadlineAt, nowMs)}
            </p>
            {reservationDeadline.deadlineAt && (
              <p className={styles.metricFormula}>
                {formatReservationDeadline(reservationDeadline.deadlineAt)}
              </p>
            )}
          </button>

          <button
            type="button"
            className={`${styles.metric} ${
              confirmedAllocationCount > 0
                ? styles.successMetric
                : draftAllocationCount > 0
                  ? styles.progressMetric
                  : styles.attentionMetric
            }`}
            onClick={() => navigate('/admin/allocation')}
            aria-label={`배차 상태 ${allocationStatus}, 배차 관리로 이동`}
          >
            <div
              className={
                confirmedAllocationCount > 0
                  ? styles.metricIconGreen
                  : draftAllocationCount > 0
                    ? styles.metricIconBlue
                    : styles.metricIconAmber
              }
            >
              <Bus size={22} />
            </div>
            <span>배차 상태</span>
            <strong>{allocationStatus}</strong>
            <p>{allocationDescription}</p>
          </button>
        </section>

        <section className={styles.operationSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>운영 체크리스트</h2>
              <p>완료한 단계는 체크하고, 필요한 관리 화면으로 바로 이동하세요.</p>
            </div>

            <div className={styles.progressBox}>
              <strong>{checkedScenarioStepIds.length}개 완료</strong>
              <span>
                {currentScenarioStep
                  ? `${currentScenarioIndex + 1}단계 진행 중`
                  : '모든 단계 완료'}
              </span>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-label="운영 체크리스트 완료율"
                aria-valuemin={0}
                aria-valuemax={operationScenarioSteps.length}
                aria-valuenow={checkedScenarioStepIds.length}
              >
                <div
                  className={styles.progressBar}
                  style={{ width: `${scenarioProgress}%` }}
                />
              </div>
              <p className={styles.progressHint}>
                전체 {operationScenarioSteps.length}단계 · DB에 저장됨
              </p>
            </div>
          </div>

          <div className={styles.scenarioList}>
            {operationScenarioSteps.map((step, index) => {
              const isChecked = checkedScenarioStepIds.includes(step.id);
              const isCurrent =
                !isChecked &&
                !operationScenarioSteps
                  .slice(0, index)
                  .some((previousStep) =>
                    !checkedScenarioStepIds.includes(previousStep.id)
                  );

              return (
                <article
                  key={step.id}
                  className={`${styles.scenarioItem} ${
                    isChecked ? styles.scenarioItemDone : ''
                  } ${isCurrent ? styles.scenarioItemCurrent : ''}`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <button
                    type="button"
                    className={styles.scenarioRail}
                    onClick={() => handleToggleScenarioStep(step.id)}
                    aria-label={`${step.title}, ${
                      isChecked ? '완료 취소' : '완료로 표시'
                    }`}
                    aria-pressed={isChecked}
                  >
                    <span className={styles.scenarioDot}>
                      {isChecked ? <CheckCircle2 size={18} /> : index + 1}
                    </span>
                  </button>

                  <div className={styles.scenarioContent}>
                    <div className={styles.scenarioTitleRow}>
                      <span>
                        {isChecked ? '완료' : isCurrent ? '진행' : '대기'}
                      </span>
                      <h3>{step.title}</h3>
                    </div>
                    <p>{step.description}</p>

                    {'actionLinks' in step && step.actionLinks && isCurrent && (
                      <div className={styles.relatedActions}>
                        <strong>관련 작업</strong>
                        <div className={styles.subActionButtons}>
                          {step.actionLinks.map((action) => (
                            <button
                              key={action.path}
                              type="button"
                              onClick={() => navigate(action.path)}
                            >
                              <span>{action.label}</span>
                              <ArrowRight size={14} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => navigate(step.actionPath)}
                  >
                    <span>{isChecked ? '확인 및 수정' : step.actionLabel}</span>
                    <ArrowRight size={16} />
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>빠른 액션</h2>
              <p>반복적으로 사용하는 관리 기능만 모았습니다.</p>
            </div>
          </div>

          <div className={styles.actionGrid}>
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  key={action.path}
                  type="button"
                  className={styles.actionCard}
                  onClick={() => navigate(action.path)}
                >
                  <Icon size={22} />
                  <strong>{action.title}</strong>
                  <span>{action.description}</span>
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminGlobalPage;
