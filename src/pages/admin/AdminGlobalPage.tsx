import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bus,
  CheckCircle2,
  CircleHelp,
  CreditCard,
  MessageSquare,
  History,
  Timer,
  Users,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';
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
import {
  adminAuditActionLabels,
  adminAuditResourceLabels,
  getRecentAdminAuditLogs,
  type AdminAuditLog,
} from '../../lib/admin/adminAuditLogService';
import {
  getBoardingManagementSnapshot,
  getBoardingMoveRequestSnapshot,
  type BoardingMoveRequestSnapshot,
  type BoardingSnapshot,
} from '../../lib/admin/boardingManagementService';
import {
  getBoardingExceptionArchiveSnapshot,
  getManualBoardingExceptionRecords,
} from '../../lib/admin/boardingExceptionArchiveService';
import { getFinalPaymentReview } from '../../lib/admin/finalPaymentReviewService';
import { getOperationCloseoutState } from '../../lib/admin/operationCloseoutService';

import styles from './AdminGlobalPage.module.css';
import AdminHeader from './AdminHeader';
import { buildBoardingExceptionRecords } from './boardingExceptionRecords';

const closeoutReadyStorageKey = 'admin-operation-closeout-ready';
const closeoutReadyEventName = 'admin-operation-closeout-ready-change';
const dashboardRealtimeTables = [
  'reservations',
  'payments',
  'campus_transfers',
  'boarding_bus_departures',
  'boarding_status_events',
  'boarding_walk_in_passengers',
  'boarding_exception_archives',
  'manual_boarding_exception_records',
  'app_settings',
] as const;

const operationScenarioSteps = [
  {
    id: 'initial-setup',
    title: '운영 초기값 설정',
    description: '조직, 예상 참여 인원, 캠퍼스 회계 순장님 권한을 먼저 점검합니다.',
    timing: '수련회 전',
    actionLabel: '운영 초기값 설정하기',
    actionPath: '/admin/settings',
  },
  {
    id: 'post-deadline-operations',
    title: '전체 공지 및 신청 시작',
    description: '각 팀과 캠퍼스에 전체 공지를 전달하고 버스 신청을 시작합니다.',
    timing: '수련회 2일차',
    checks: ['팀·캠퍼스별 전체 공지 전달', '신청 시작'],
    actionLabel: '가입 신청 현황 확인하기',
    actionPath: '/admin/applications',
  },
  {
    id: 'allocation-planning',
    title: '신청 마감 및 배차 확정',
    description: '신청 인원과 행선지별 수요를 바탕으로 배차 계획을 산출·검토하고 확정합니다.',
    timing: '수련회 3일차 24:00',
    actionLabel: '배차 계획 산출하기',
    actionPath: '/admin/allocations',
    actionLinks: [
      { label: '신청마감하기', path: '/admin/settings/reservation-deadline' },
      { label: '잔여 좌석 관리', path: '/admin/payments/remaining-seats' },
    ],
  },
  {
    id: 'payment-and-request-management',
    title: '입금 및 정산 검토',
    description: '개인 입금과 캠퍼스별 송금 상태를 최종 확인하고 미처리 문의를 정리합니다.',
    timing: '신청 기간 동안 상시 · 수련회 4일차 24:00 최종 확인',
    actionLabel: '입금 집계 확인하기',
    actionPath: '/admin/payments/final-review',
    actionLinks: [
      { label: '사용자별 관리', path: '/admin/users' },
      { label: '문의', path: '/admin/communications' },
    ],
  },
  {
    id: 'boarding-operations',
    title: '탑승 및 운행 관리',
    description: '탑승 관리 간사님 담당 호차와 탑승 현황을 확인하고 모든 호차의 출발을 관리합니다.',
    timing: '출발 당일',
    actionLabel: '탑승 현황 확인하기',
    actionPath: '/admin/boarding',
    actionLinks: [
      { label: '탑승 관리자 배정', path: '/admin/access/boarding-managers' },
      { label: '특수상황 기록', path: '/admin/boarding/exceptions' },
    ],
  },
  {
    id: 'follow-up-review',
    title: '사후 관리 및 기록 검토',
    description: '미처리 문의와 현장 특이사항을 정리하고 주요 관리자 작업 기록을 검토합니다.',
    timing: '운행 종료 후',
    actionLabel: '관리 작업 기록 확인하기',
    actionPath: '/admin/system/closeout',
    actionLinks: [
      { label: '특수상황 기록', path: '/admin/boarding/exceptions' },
      { label: 'AI 운영 보고서', path: '/admin/system/ai-reports' },
    ],
  },
] as const;

const operationScenarioStepIds = new Set<string>(
  operationScenarioSteps.map((step) => step.id)
);

const quickActions = [
  {
    title: '사용자별 관리',
    description: '사용자별 관리자 권한과 개인 버스표 정보를 함께 관리합니다.',
    path: '/admin/users',
    icon: CreditCard,
  },
  {
    title: '문의함·공지 관리',
    description: '개인·캠퍼스 문의를 한 문의함에서 처리하고 공지를 관리합니다.',
    path: '/admin/communications',
    icon: CircleHelp,
  },
  {
    title: '배차 로직',
    description: '배차 계산 기준과 옵션을 점검합니다.',
    path: '/admin/allocations/logic',
    icon: Bus,
  },
  {
    title: '탑승 관리 간사님 권한·담당 호차 관리',
    description: '탑승 관리 간사님 계정을 지정하고 전체 호차 탑승 확인 권한을 관리합니다.',
    path: '/admin/access/boarding-managers',
    icon: Users,
  },
] as const;

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const getRate = (value: number, baseline: number) =>
  baseline > 0 ? (value / baseline) * 100 : 0;

const clampProgress = (value: number) => Math.min(Math.max(value, 0), 100);

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
  const [paidReservationCount, setPaidReservationCount] = useState(0);
  const [confirmedReservationCount, setConfirmedReservationCount] = useState(0);
  const [participationTarget, setParticipationTarget] = useState(0);
  const [unresolvedRequestCount, setUnresolvedRequestCount] = useState(0);
  const [reservationDeadline, setReservationDeadline] =
    useState<ReservationDeadlineSetting>({
      opensAt: null,
      deadlineAt: null,
      isBeforeOpening: false,
      isClosed: false,
    });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkedScenarioStepIds, setCheckedScenarioStepIds] = useState<
    string[]
  >([]);
  const [recentAuditLogs, setRecentAuditLogs] = useState<AdminAuditLog[]>([]);
  const [boardingSnapshot, setBoardingSnapshot] = useState<BoardingSnapshot | null>(
    null
  );
  const [boardingMoveRequests, setBoardingMoveRequests] =
    useState<BoardingMoveRequestSnapshot | null>(null);
  const realtimeRefreshTimerRef = useRef<number | null>(null);
  const [isCloseoutReady, setIsCloseoutReady] = useState(() => {
    try {
      return window.localStorage.getItem(closeoutReadyStorageKey) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleCloseoutReadyChange = (event: Event) => {
      setIsCloseoutReady(
        (event as CustomEvent<{ ready?: boolean }>).detail?.ready === true
      );
    };
    window.addEventListener(closeoutReadyEventName, handleCloseoutReadyChange);
    return () =>
      window.removeEventListener(closeoutReadyEventName, handleCloseoutReadyChange);
  }, []);

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

  const loadDashboardData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }

    try {
      const [
        subscriberCountResult,
        reservationCountResult,
        paidReservationCountResult,
        confirmedReservationCountResult,
        deadline,
        participationSetting,
        scenarioChecklist,
        unresolvedRequestResult,
        recentAuditLogsResult,
        boardingSnapshotResult,
        boardingMoveRequestsResult,
        boardingExceptionArchive,
        manualBoardingExceptions,
        finalPaymentReview,
        operationCloseoutState,
      ] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true }),
          supabase
            .from('reservations')
            .select('id', { count: 'exact', head: true })
            .neq('status', 'cancelled'),
          supabase
            .from('reservations')
            .select('id, payments!inner(status)', { count: 'exact', head: true })
            .neq('status', 'cancelled')
            .eq('payments.status', 'completed'),
          supabase
            .from('reservations')
            .select('id', { count: 'exact', head: true })
            .neq('status', 'cancelled')
            .not('confirmed_ticket', 'is', null),
          getReservationDeadline(),
          getParticipationTargetsSetting(),
          getGlobalScenarioChecklist(operationScenarioStepIds),
          supabase
            .from('campus_requests')
            .select('id', { count: 'exact', head: true })
            .neq('status', 'resolved')
            .eq('is_global_notice', false),
          getRecentAdminAuditLogs(5).catch((error) => {
            console.warn('Failed to load recent admin audit logs:', error);
            return [];
          }),
          getBoardingManagementSnapshot().catch((error) => {
            console.warn('Failed to load boarding readiness:', error);
            return null;
          }),
          getBoardingMoveRequestSnapshot().catch((error) => {
            console.warn('Failed to load boarding move readiness:', error);
            return null;
          }),
          getBoardingExceptionArchiveSnapshot(),
          getManualBoardingExceptionRecords(),
          getFinalPaymentReview(),
          getOperationCloseoutState(),
        ]);

      const dashboardError =
        reservationCountResult.error ??
        subscriberCountResult.error ??
        paidReservationCountResult.error ??
        confirmedReservationCountResult.error ??
        unresolvedRequestResult.error ??
        null;

      if (dashboardError) throw dashboardError;

      setSubscriberCount(subscriberCountResult.count ?? 0);
      setReservationCount(reservationCountResult.count ?? 0);
      setPaidReservationCount(paidReservationCountResult.count ?? 0);
      setConfirmedReservationCount(confirmedReservationCountResult.count ?? 0);
      setReservationDeadline(deadline);
      setParticipationTarget(getTotalParticipationTarget(participationSetting));
      setCheckedScenarioStepIds(scenarioChecklist);
      setUnresolvedRequestCount(unresolvedRequestResult.count ?? 0);
      setRecentAuditLogs(recentAuditLogsResult);
      setBoardingSnapshot(boardingSnapshotResult);
      setBoardingMoveRequests(boardingMoveRequestsResult);

      const automaticExceptions = buildBoardingExceptionRecords(
        boardingSnapshotResult
      );
      const archivedExceptionKeys = new Set(boardingExceptionArchive.archivedKeys);
      const unresolvedExceptionCount = [
        ...automaticExceptions.map((record) => record.id),
        ...manualBoardingExceptions.map(
          (record) => `${record.allocationId}:manual:${record.id}`
        ),
      ].filter((key) => !archivedExceptionKeys.has(key)).length;
      const closeoutBusCount = boardingSnapshotResult?.buses.length ?? 0;
      const closeoutDepartedBusCount =
        boardingSnapshotResult?.buses.filter((bus) => Boolean(bus.departedAt))
          .length ?? 0;
      const unpaidCount = Math.max(
        finalPaymentReview.totalPaymentTargets -
          finalPaymentReview.paidPaymentTargets,
        0
      );
      const unconfirmedTransferCount = finalPaymentReview.campusTransfers.filter(
        (campus) =>
          campus.status !== 'confirmed' || campus.hasAdditionalSettlement
      ).length;
      const nextCloseoutReady =
        !operationCloseoutState.closed &&
        closeoutBusCount > 0 &&
        closeoutDepartedBusCount === closeoutBusCount &&
        unresolvedExceptionCount === 0 &&
        unpaidCount === 0 &&
        unconfirmedTransferCount === 0;

      setIsCloseoutReady(nextCloseoutReady);
      try {
        window.localStorage.setItem(
          closeoutReadyStorageKey,
          String(nextCloseoutReady)
        );
      } catch {
        // The dashboard badge remains available when browser storage is unavailable.
      }
      window.dispatchEvent(
        new CustomEvent(closeoutReadyEventName, {
          detail: { ready: nextCloseoutReady },
        })
      );
    } catch (error) {
      console.error('Failed to load data:', error);
      if (!silent) {
        setLoadError('대시보드 데이터를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      if (!silent) setLoading(false);
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
    const scheduleRealtimeRefresh = () => {
      if (realtimeRefreshTimerRef.current !== null) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }
      realtimeRefreshTimerRef.current = window.setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        void loadDashboardData(true);
      }, 1000);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleRealtimeRefresh();
    };

    let channel = supabase.channel('admin-dashboard-closeout-readiness-live');
    dashboardRealtimeTables.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        scheduleRealtimeRefresh
      );
    });
    channel.subscribe();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (realtimeRefreshTimerRef.current !== null) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }
      void supabase.removeChannel(channel);
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

  const registrationRate = getRate(subscriberCount, participationTarget);
  const applicationRate = getRate(reservationCount, subscriberCount);
  const paymentCompletionRate = getRate(paidReservationCount, reservationCount);
  const allocationRate = getRate(confirmedReservationCount, reservationCount);
  const unpaidReservationCount = Math.max(
    reservationCount - paidReservationCount,
    0
  );
  const unallocatedReservationCount = Math.max(
    reservationCount - confirmedReservationCount,
    0
  );
  const departedBusCount =
    boardingSnapshot?.buses.filter((bus) => Boolean(bus.departedAt)).length ?? 0;
  const totalBusCount = boardingSnapshot?.buses.length ?? 0;
  const pendingMoveRequestCount =
    boardingMoveRequests?.requests.filter((request) => request.status === 'pending')
      .length ?? 0;
  const allBusesDeparted = totalBusCount > 0 && departedBusCount === totalBusCount;
  const journeyMetrics = [
    {
      id: 'target',
      label: '참여 목표',
      badge: '기준 인원',
      value: participationTarget,
      note: '등록된 예상 참여 인원',
      progress: participationTarget > 0 ? 100 : 0,
      path: '/admin/settings/participation-targets',
      className: styles.journeyTarget,
    },
    {
      id: 'registration',
      label: '가입',
      badge: `가입률 ${formatPercent(registrationRate)}`,
      value: subscriberCount,
      note: '참여 목표 대비 가입 완료',
      progress: clampProgress(registrationRate),
      path: '/admin/users',
      className: styles.journeyRegistration,
    },
    {
      id: 'application',
      label: '신청',
      badge: `신청률 ${formatPercent(applicationRate)}`,
      value: reservationCount,
      note: '가입 인원 대비 · 취소 제외',
      progress: clampProgress(applicationRate),
      path: '/admin/applications',
      className: styles.journeyApplication,
    },
    {
      id: 'payment',
      label: '입금 완료',
      badge: `입금률 ${formatPercent(paymentCompletionRate)}`,
      value: paidReservationCount,
      note: `미입금 ${unpaidReservationCount.toLocaleString()}명`,
      progress: clampProgress(paymentCompletionRate),
      path: '/admin/payments/final-review',
      className: styles.journeyPayment,
    },
    {
      id: 'allocation',
      label: '배차 확정',
      badge: `배차율 ${formatPercent(allocationRate)}`,
      value: confirmedReservationCount,
      note: `미배차 ${unallocatedReservationCount.toLocaleString()}명`,
      progress: clampProgress(allocationRate),
      path: '/admin/allocations',
      className: styles.journeyAllocation,
    },
  ] as const;
  const isReservationClosed = Boolean(
    reservationDeadline.deadlineAt &&
      new Date(reservationDeadline.deadlineAt).getTime() <= nowMs
  );
  const scenarioReadinessById: Record<
    string,
    { ready: boolean; label: string }
  > = {
    'initial-setup': {
      ready: participationTarget > 0 && Boolean(reservationDeadline.deadlineAt),
      label:
        participationTarget > 0 && reservationDeadline.deadlineAt
          ? '예상 참여 인원과 신청 마감 설정 완료'
          : '예상 참여 인원과 신청 마감 설정 필요',
    },
    'post-deadline-operations': {
      ready: reservationCount > 0,
      label:
        reservationCount > 0
          ? `활성 신청 ${reservationCount.toLocaleString()}명 접수`
          : '활성 신청 접수 확인 필요',
    },
    'allocation-planning': {
      ready:
        isReservationClosed &&
        reservationCount > 0 &&
        confirmedReservationCount === reservationCount,
      label: !isReservationClosed
        ? '신청 마감 필요'
        : confirmedReservationCount !== reservationCount
          ? `미배차 ${unallocatedReservationCount.toLocaleString()}명 확인 필요`
          : '신청 마감 및 전원 배차 확정 완료',
    },
    'payment-and-request-management': {
      ready:
        reservationCount > 0 &&
        paidReservationCount === reservationCount &&
        unresolvedRequestCount === 0,
      label:
        unpaidReservationCount > 0 || unresolvedRequestCount > 0
          ? `미입금 ${unpaidReservationCount.toLocaleString()}명 · 미처리 문의 ${unresolvedRequestCount.toLocaleString()}건`
          : '개인 입금 및 문의 처리 완료',
    },
    'boarding-operations': {
      ready: allBusesDeparted && pendingMoveRequestCount === 0,
      label:
        totalBusCount === 0
          ? '확정 호차 확인 필요'
          : `출발 ${departedBusCount.toLocaleString()}/${totalBusCount.toLocaleString()}대 · 이동 요청 ${pendingMoveRequestCount.toLocaleString()}건`,
    },
    'follow-up-review': {
      ready:
        allBusesDeparted &&
        pendingMoveRequestCount === 0 &&
        unresolvedRequestCount === 0,
      label:
        allBusesDeparted &&
        pendingMoveRequestCount === 0 &&
        unresolvedRequestCount === 0
          ? '운행 종료 및 미처리 업무 정리 완료'
          : `미처리 문의 ${unresolvedRequestCount.toLocaleString()}건 · 이동 요청 ${pendingMoveRequestCount.toLocaleString()}건`,
    },
  };
  const completedScenarioStepCount = operationScenarioSteps.filter((step) =>
    checkedScenarioStepIds.includes(step.id)
  ).length;
  const scenarioProgress =
    (completedScenarioStepCount / operationScenarioSteps.length) * 100;
  const currentScenarioIndex = operationScenarioSteps.findIndex(
    (step) => !checkedScenarioStepIds.includes(step.id)
  );
  const currentScenarioStep =
    currentScenarioIndex >= 0 ? operationScenarioSteps[currentScenarioIndex] : null;
  const deadlineStatus = !reservationDeadline.deadlineAt
    ? '미설정'
    : isReservationClosed
      ? '마감됨'
      : '신청 가능';
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
              운영 준비부터 신청, 배차, 입금, 탑승, 사후 관리까지 한 화면에서 확인합니다.
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

        <section
          className={styles.journeyOverview}
          aria-labelledby="journey-overview-title"
        >
          <div className={styles.journeyHeader}>
            <div>
              <span>운영 흐름</span>
              <h2 id="journey-overview-title">참여부터 배차까지 한눈에 보기</h2>
            </div>
            <p>입금률과 배차율은 신청 인원을 기준으로 계산합니다.</p>
          </div>

          <div className={styles.journeyGrid}>
            {journeyMetrics.map((metric) => (
              <button
                key={metric.id}
                type="button"
                className={`${styles.journeyCard} ${metric.className}`}
                onClick={() => navigate(metric.path)}
                aria-label={`${metric.label} ${metric.value}명, 관련 관리 화면으로 이동`}
              >
                <span className={styles.journeyCardTop}>
                  <strong>{metric.label}</strong>
                  <small>{metric.badge}</small>
                </span>
                <span className={styles.journeyValue}>
                  <strong>{metric.value.toLocaleString()}</strong>
                  <small>명</small>
                </span>
                <span
                  className={styles.journeyProgressTrack}
                  role="progressbar"
                  aria-label={`${metric.label} 진행률`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(metric.progress)}
                >
                  <span
                    className={styles.journeyProgressBar}
                    style={{ width: `${metric.progress}%` }}
                  />
                </span>
                <span className={styles.journeyNote}>{metric.note}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.statusStrip} aria-label="운영 알림">
          <button
            type="button"
            className={unresolvedRequestCount > 0 ? styles.statusAttention : ''}
            onClick={() => navigate('/admin/communications')}
          >
            <MessageSquare size={17} />
            <span>미처리 문의</span>
            <strong>{unresolvedRequestCount.toLocaleString()}건</strong>
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/settings/reservation-deadline')}
          >
            <Timer size={17} />
            <span>신청 마감</span>
            <strong>{deadlineStatus}</strong>
            <small>
              {reservationDeadline.deadlineAt
                ? formatReservationDeadline(reservationDeadline.deadlineAt)
                : getDeadlineRemainingText(reservationDeadline.deadlineAt, nowMs)}
            </small>
          </button>
        </section>

        <section className={styles.operationSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>운영 체크리스트</h2>
              <p>완료한 단계는 체크하고, 필요한 관리 화면으로 바로 이동하세요.</p>
            </div>

            <div className={styles.progressBox}>
              <strong>{completedScenarioStepCount}개 완료</strong>
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
                aria-valuenow={completedScenarioStepCount}
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
                      {step.id === 'follow-up-review' && isCloseoutReady && (
                        <button
                          type="button"
                          className={styles.closeoutReadyBadge}
                          onClick={() => navigate('/admin/system/closeout')}
                        >
                          마감 가능
                          <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                    <div className={styles.scenarioTiming}>
                      <Timer size={14} aria-hidden="true" />
                      <strong>운영 시기</strong>
                      <span>{step.timing}</span>
                    </div>
                    <p>{step.description}</p>
                    <div
                      className={`${styles.readinessStatus} ${
                        scenarioReadinessById[step.id]?.ready
                          ? styles.readinessReady
                          : styles.readinessAttention
                      }`}
                    >
                      <strong>
                        {scenarioReadinessById[step.id]?.ready
                          ? '완료 조건 충족'
                          : '확인 필요'}
                      </strong>
                      <span>{scenarioReadinessById[step.id]?.label}</span>
                    </div>

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
              <h2>최근 관리 작업</h2>
              <p>입금 정보와 캠퍼스 송금의 최근 변경 기록입니다.</p>
            </div>
            <button
              type="button"
              className={styles.auditLogsButton}
              onClick={() => navigate('/admin/system/audit-logs')}
            >
              전체 기록 보기
              <ArrowRight size={15} />
            </button>
          </div>

          {recentAuditLogs.length === 0 ? (
            <div className={styles.auditEmpty}>
              <History size={20} />
              아직 기록된 관리 작업이 없습니다.
            </div>
          ) : (
            <div className={styles.auditList}>
              {recentAuditLogs.map((log) => (
                <button
                  type="button"
                  key={log.id}
                  onClick={() => navigate('/admin/system/audit-logs')}
                >
                  <span className={`${styles.auditBadge} ${styles[log.action]}`}>
                    {adminAuditActionLabels[log.action]}
                  </span>
                  <strong>
                    {adminAuditResourceLabels[log.resourceType] ??
                      log.resourceType}
                  </strong>
                  <span>{log.actorName}</span>
                  <time dateTime={log.createdAt}>
                    {new Date(log.createdAt).toLocaleString('ko-KR')}
                  </time>
                </button>
              ))}
            </div>
          )}
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
