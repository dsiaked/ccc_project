import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bus,
  CheckCircle2,
  CircleHelp,
  Circle,
  CreditCard,
  Megaphone,
  ShieldCheck,
  Timer,
  Users,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  getAdminRole,
  getBusTicketPrice,
  getCampusTransferStats,
  type CampusTransferStat,
} from '../../lib/adminService';

import styles from './AdminGlobalPage.module.css';
import AdminHeader from './AdminHeader';

const PARTICIPATION_TARGETS_STORAGE_KEY =
  'admin_ticket_participation_targets';

const operationScenarioSteps = [
  {
    id: 'initial-setup',
    title: '기초 세팅 확인',
    description: '조직, 참여 목표, 캠퍼스 관리자 권한을 먼저 점검합니다.',
    actionLabel: '세팅 확인',
    actionPath: '/admin/setup-check',
  },
  {
    id: 'reservation-status',
    title: '예매 시작: 예매 현황 점검',
    description: '예매를 시작하고 참여 기준 대비 신청률과 도착지별 수요를 확인합니다.',
    actionLabel: '예매 현황',
    actionPath: '/admin/tickets',
  },
  {
    id: 'post-deadline-operations',
    title: '신청 마감',
    description: '신청 마감 이후 캠퍼스 입금 집계, 문의 처리, 배차 계획 산출을 진행합니다.',
    checks: ['캠퍼스 입금 집계', '문의 처리', '배차 계획 산출'],
    actionLabel: '마감 설정',
    actionPath: '/admin/reservation-deadline',
    actionLinks: [
      { label: '입금 집계', path: '/admin/campus-transfer' },
      { label: '문의 처리', path: '/admin/campus-requests' },
      { label: '배차 계산', path: '/admin/allocation' },
    ],
  },
  {
    id: 'remaining-seat-sales',
    title: '배차 확정 이후 잔여 좌석 판매',
    description: '배차 확정 후 남은 좌석을 추가 판매하고 관리합니다.',
    actionLabel: '좌석 관리',
    actionPath: '/admin/remaining-seat-sales',
  },
  {
    id: 'final-check',
    title: '출발 전 최종 점검',
    description: '탑승 명단, 입금 상태, 출발 장소, 안내 사항을 마지막으로 확인합니다.',
    actionLabel: '최종 명단',
    actionPath: '/admin/tickets',
  },
] as const;

const operationScenarioStepIds = new Set<string>(
  operationScenarioSteps.map((step) => step.id)
);

const quickActions = [
  {
    title: '공지 작성',
    description: '홈 화면 공지사항과 안내 문구를 관리합니다.',
    path: '/admin/home-announcements',
    icon: Megaphone,
  },
  {
    title: '개인 버스표',
    description: '개인별 버스표 확정과 좌석 정보를 수정합니다.',
    path: '/admin/personal-tickets',
    icon: CreditCard,
  },
  {
    title: '문의 게시판',
    description: '추가 신청, 환불, 입금 오류, 명단 수정 문의를 확인합니다.',
    path: '/admin/campus-requests',
    icon: CircleHelp,
  },
  {
    title: '배차 로직',
    description: '배차 계산 기준과 옵션을 점검합니다.',
    path: '/admin/allocation/logic',
    icon: Bus,
  },
  {
    title: '관리자 권한',
    description: '캠퍼스 관리자 권한을 부여하거나 회수합니다.',
    path: '/admin/campus-admins',
    icon: ShieldCheck,
  },
] as const;

const formatCurrency = (amount: number) => `${amount.toLocaleString()}원`;

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const loadTotalParticipationTarget = () => {
  const saved = localStorage.getItem(PARTICIPATION_TARGETS_STORAGE_KEY);

  if (!saved) return 0;

  try {
    const parsed = JSON.parse(saved);

    if (!parsed || typeof parsed !== 'object') return 0;

    return Object.values(parsed).reduce<number>((sum, value) => {
      const count = Number(value);

      return Number.isFinite(count) && count > 0 ? sum + count : sum;
    }, 0);
  } catch {
    return 0;
  }
};

const AdminGlobalPage = () => {
  const navigate = useNavigate();

  const [reservationCount, setReservationCount] = useState(0);
  const [busTicketPrice, setBusTicketPrice] = useState(0);
  const [participationTarget] = useState<number>(loadTotalParticipationTarget);
  const [campusTransfers, setCampusTransfers] = useState<CampusTransferStat[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [checkedScenarioStepIds, setCheckedScenarioStepIds] = useState<
    string[]
  >(() => {
    const saved = localStorage.getItem('global_scenario_checklist');

    if (!saved) return [];

    try {
      const parsed = JSON.parse(saved);

      return Array.isArray(parsed)
        ? parsed.filter(
            (value) =>
              typeof value === 'string' && operationScenarioStepIds.has(value)
          )
        : [];
    } catch {
      return [];
    }
  });

  const handleToggleScenarioStep = (stepId: string) => {
    setCheckedScenarioStepIds((prev) => {
      const next = prev.includes(stepId)
        ? prev.filter((id) => id !== stepId)
        : [...prev, stepId];

      localStorage.setItem('global_scenario_checklist', JSON.stringify(next));

      return next;
    });
  };

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

        const [transfers, reservationCountResult, ticketPrice] =
          await Promise.all([
            getCampusTransferStats(),
            supabase
              .from('reservations')
              .select('id', { count: 'exact', head: true })
              .neq('status', 'cancelled'),
            getBusTicketPrice(),
          ]);

        if (reservationCountResult.error) {
          throw reservationCountResult.error;
        }

        if (isMounted) {
          setCampusTransfers(transfers);
          setReservationCount(reservationCountResult.count ?? 0);
          setBusTicketPrice(ticketPrice);
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
  const applicationRate =
    participationTarget > 0 ? (totalPeople / participationTarget) * 100 : 0;
  const pendingCampusCount = campusTransfers.filter(
    (transfer) => transfer.status === 'pending'
  ).length;
  const confirmedCampusCount = campusTransfers.filter(
    (transfer) =>
      transfer.status === 'confirmed' && !transfer.hasAdditionalSettlement
  ).length;
  const scenarioProgress =
    (checkedScenarioStepIds.length / operationScenarioSteps.length) * 100;

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

          <div className={styles.heroActions}>
            <button type="button" onClick={() => navigate('/admin/tickets')}>
              예매 현황
            </button>
            <button type="button" onClick={() => navigate('/admin/allocation')}>
              배차 계산
            </button>
          </div>
        </section>

        <section className={styles.metricsGrid} aria-label="핵심 지표">
          <div className={styles.metric}>
            <div className={styles.metricIconBlue}>
              <Users size={22} />
            </div>
            <span>총 신청자</span>
            <strong>
              {participationTarget > 0
                ? `${totalPeople.toLocaleString()} / ${participationTarget.toLocaleString()}명`
                : `${totalPeople.toLocaleString()}명`}
            </strong>
            <p>
              {participationTarget > 0
                ? `참여 목표 대비 ${formatPercent(applicationRate)}`
                : '참여 목표 미입력'}
            </p>
          </div>

          <div className={styles.metric}>
            <div className={styles.metricIconAmber}>
              <Timer size={22} />
            </div>
            <span>입금 대기 캠퍼스</span>
            <strong>
              {pendingCampusCount.toLocaleString()} /{' '}
              {campusTransfers.length.toLocaleString()}개
            </strong>
            <p>{confirmedCampusCount.toLocaleString()}개 캠퍼스 본부 확인</p>
          </div>

          <div className={styles.metric}>
              <div className={styles.metricIconGreen}>
                <CreditCard size={22} />
              </div>
              <span>실제 입금액 / 예상 입금액</span>
              <strong>{formatPercent(paymentCollectionRate)}</strong>
              <p>
                {formatCurrency(totalCompletedAmount)} /{' '}
                {formatCurrency(expectedPaymentAmount)}
              </p>
              <p className={styles.metricFormula}>
                예매 신청자 {reservationCount.toLocaleString()}명 × 버스표{' '}
                {formatCurrency(busTicketPrice)}
              </p>
          </div>
        </section>

        <section className={styles.operationSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>운영 체크리스트</h2>
              <p>완료한 단계는 체크하고, 필요한 관리 화면으로 바로 이동하세요.</p>
            </div>

            <div className={styles.progressBox}>
              <strong>
                {checkedScenarioStepIds.length} / {operationScenarioSteps.length}
              </strong>
              <span>완료</span>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressBar}
                  style={{ width: `${scenarioProgress}%` }}
                />
              </div>
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
                >
                  <div className={styles.scenarioRail}>
                    <span className={styles.scenarioDot}>{index}</span>
                  </div>

                  <button
                    type="button"
                    className={styles.checkButton}
                    onClick={() => handleToggleScenarioStep(step.id)}
                    aria-label={`${step.title} 완료 체크`}
                  >
                    {isChecked ? (
                      <CheckCircle2 size={22} />
                    ) : (
                      <Circle size={22} />
                    )}
                  </button>

                  <div className={styles.scenarioContent}>
                    <div className={styles.scenarioTitleRow}>
                      <span>
                        {isChecked ? '완료' : isCurrent ? '진행' : '대기'}
                      </span>
                      <h3>{step.title}</h3>
                    </div>
                    <p>{step.description}</p>

                    {'checks' in step && step.checks && (
                      <div className={styles.checkPills}>
                        {step.checks.map((check) => (
                          <small key={check}>{check}</small>
                        ))}
                      </div>
                    )}

                    {'actionLinks' in step && step.actionLinks && (
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
                    )}
                  </div>

                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => navigate(step.actionPath)}
                  >
                    <span>{step.actionLabel}</span>
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
