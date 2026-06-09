import { useCallback, useEffect, useState } from 'react';
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

import styles from './AdminGlobalPage.module.css';
import AdminHeader from './AdminHeader';

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
    description: '각 팀과 캠퍼스에 전체 공지를 전달하고 귀가 버스 신청을 시작합니다.',
    timing: '수련회 2일차',
    checks: ['팀·캠퍼스별 전체 공지 전달', '신청 시작'],
    actionLabel: '가입 신청 현황 확인하기',
    actionPath: '/admin/applications',
  },
  {
    id: 'allocation-planning',
    title: '신청 마감 및 배차 계획 산출·검토',
    description: '신청 인원과 행선지별 수요를 바탕으로 배차 계획을 산출하고 결과를 검토합니다.',
    timing: '수련회 3일차 24:00',
    actionLabel: '배차 계획 산출하기',
    actionPath: '/admin/allocations',
    actionLinks: [
      { label: '신청마감하기', path: '/admin/settings/reservation-deadline' },
    ],
  },
  {
    id: 'remaining-seat-sales',
    title: '배차 확정 및 잔여 좌석 신청',
    description: '검토한 배차 계획을 확정하고 잔여 좌석 신청을 관리합니다.',
    timing: '수련회 4일차',
    actionLabel: '잔여 좌석 관리하기',
    actionPath: '/admin/payments/remaining-seats',
  },
] as const;

const continuousOperationStep = {
  id: 'payment-and-request-management',
  title: '입금 집계 및 문의 처리',
  description: '캠퍼스별 입금 현황을 집계하고 접수된 문의를 확인하여 처리합니다.',
  timing: '신청 기간 동안 상시 · 수련회 4일차 24:00 최종 확인',
  checks: ['입금 집계 확인', '문의 처리'],
  actionLabel: '입금 집계 확인하기',
  actionPath: '/admin/payments/final-review',
  actionLinks: [
    { label: '개별 사용자 관리', path: '/admin/users' },
    { label: '문의', path: '/admin/communications' },
  ],
} as const;

const operationScenarioStepIds = new Set<string>(
  [...operationScenarioSteps.map((step) => step.id), continuousOperationStep.id]
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
    description: '캠퍼스 문의와 캠퍼스 공지, 홈 화면 공지를 함께 관리합니다.',
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
    title: '선탑자 권한·담당 호차 관리',
    description: '선탑자 계정을 지정하고 전체 호차 탑승 확인 권한을 관리합니다.',
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
      deadlineAt: null,
      isClosed: false,
    });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkedScenarioStepIds, setCheckedScenarioStepIds] = useState<
    string[]
  >([]);
  const [recentAuditLogs, setRecentAuditLogs] = useState<AdminAuditLog[]>([]);

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
        subscriberCountResult,
        reservationCountResult,
        paidReservationCountResult,
        confirmedReservationCountResult,
        deadline,
        participationSetting,
        scenarioChecklist,
        unresolvedRequestResult,
        recentAuditLogsResult,
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
  const isContinuousOperationChecked = checkedScenarioStepIds.includes(
    continuousOperationStep.id
  );
  const isReservationClosed = Boolean(
    reservationDeadline.deadlineAt &&
      new Date(reservationDeadline.deadlineAt).getTime() <= nowMs
  );
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
                    </div>
                    <div className={styles.scenarioTiming}>
                      <Timer size={14} aria-hidden="true" />
                      <strong>운영 시기</strong>
                      <span>{step.timing}</span>
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

          <div className={styles.continuousOperationBlock}>
            <div className={styles.continuousOperationLabel}>
              <span>상시 운영</span>
              <p>번호 순서와 관계없이 신청 기간 동안 계속 확인하는 항목입니다.</p>
            </div>

            <article
              className={`${styles.scenarioItem} ${styles.continuousOperationItem} ${
                isContinuousOperationChecked ? styles.scenarioItemDone : ''
              }`}
            >
              <button
                type="button"
                className={styles.scenarioRail}
                onClick={() => handleToggleScenarioStep(continuousOperationStep.id)}
                aria-label={`${continuousOperationStep.title}, ${
                  isContinuousOperationChecked ? '완료 취소' : '완료로 표시'
                }`}
                aria-pressed={isContinuousOperationChecked}
              >
                <span className={styles.scenarioDot}>
                  {isContinuousOperationChecked ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <CreditCard size={17} />
                  )}
                </span>
              </button>

              <div className={styles.scenarioContent}>
                <div className={styles.scenarioTitleRow}>
                  <span>
                    {isContinuousOperationChecked ? '최종 확인 완료' : '상시 확인'}
                  </span>
                  <h3>{continuousOperationStep.title}</h3>
                </div>
                <div className={styles.scenarioTiming}>
                  <Timer size={14} aria-hidden="true" />
                  <strong>운영 시기</strong>
                  <span>{continuousOperationStep.timing}</span>
                </div>
                <p>{continuousOperationStep.description}</p>

                <div className={styles.relatedActions}>
                  <strong>관련 작업</strong>
                  <div className={styles.subActionButtons}>
                    {continuousOperationStep.actionLinks.map((action) => (
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
              </div>

              <button
                type="button"
                className={styles.linkButton}
                onClick={() => navigate(continuousOperationStep.actionPath)}
              >
                <span>
                  {isContinuousOperationChecked
                    ? '확인 및 수정'
                    : continuousOperationStep.actionLabel}
                </span>
                <ArrowRight size={16} />
              </button>
            </article>
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
