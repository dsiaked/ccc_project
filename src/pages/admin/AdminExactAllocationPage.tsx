import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FolderOpen,
  LoaderCircle,
  Play,
  RotateCcw,
  Square,
  TriangleAlert,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatBusLabel } from '../../utils/busLabel';

import AdminHeader from './AdminHeader';
import {
  cancelExactAllocationJob,
  createDetailedBalanceJob,
  createDraftFromExactAllocationJob,
  createExactAllocationJob,
  getExactAllocationBusOptions,
  getExactAllocationJob,
  getExactAllocationOptimizerConfig,
  getAllocationWorkspaceForExactJob,
  getRecentExactAllocationJobs,
  launchExactAllocationJob,
  resetExactAllocationJobs,
  saveExactAllocationOptimizerConfig,
  type ExactAllocationExecutionMode,
  type ExactAllocationJob,
  type ExactAllocationOptimizerConfig,
} from '../../lib/admin/exactAllocationOptimizationService';
import {
  getConfirmedAllocationWorkspaceSummaries,
  getDraftAllocationWorkspaceSummaries,
  type AllocationWorkspaceSummary,
} from '../../lib/admin/allocationWorkspaceService';
import styles from './AdminExactAllocationPage.module.css';

const activeStatuses = new Set(['PENDING', 'RUNNING', 'CANCEL_REQUESTED']);
const executionModeStorageKey = 'ccc-bus-allocation-execution-mode';

const getInitialExecutionMode = (): ExactAllocationExecutionMode => {
  const savedMode = window.localStorage.getItem(executionModeStorageKey);
  if (savedMode === 'cloud' || savedMode === 'local') return savedMode;
  return import.meta.env.VITE_ALLOCATION_OPTIMIZER_EXECUTION_MODE === 'local'
    ? 'local'
    : 'cloud';
};

const optimizationPhases = [
  'starting',
  'total_buses',
  'second_choice_passengers',
  'campus_bus_uses',
  'campus_distribution_imbalance',
  'campus_isolated_groups',
  'campus_odd_groups',
  'team_bus_uses',
  'team_distribution_imbalance',
  'destination_occupancy_imbalance',
  'deterministic_tie_break',
] as const;

const phaseGroups = [
  {
    label: '계산 준비',
    description: '신청 및 버스 데이터를 준비합니다.',
    finalPhase: 'starting',
    completionProgress: 0,
  },
  {
    label: '최소 버스 수 증명',
    description: '필요한 최소 버스 대수를 확정합니다.',
    finalPhase: 'total_buses',
    completionProgress: 15,
  },
  {
    label: '지망 배정 최적화',
    description: '2지망 배정 인원을 최소화합니다.',
    finalPhase: 'second_choice_passengers',
    completionProgress: 30,
  },
  {
    label: '캠퍼스 배차 균형',
    description: '캠퍼스별 분산과 인원 균형을 맞춥니다.',
    finalPhase: 'campus_odd_groups',
    completionProgress: 67,
  },
  {
    label: '팀 배차 균형',
    description: '팀별 분산과 인원 균형을 맞춥니다.',
    finalPhase: 'team_distribution_imbalance',
    completionProgress: 81,
  },
  {
    label: '버스별 탑승 균형',
    description: '각 버스의 탑승 인원을 고르게 맞춥니다.',
    finalPhase: 'destination_occupancy_imbalance',
    completionProgress: 88,
  },
  {
    label: '최종 결과 확정',
    description: '동일 조건 결과를 고정하고 검증합니다.',
    finalPhase: 'deterministic_tie_break',
    completionProgress: 95,
  },
] as const;

const skippableDetailedPhases = [
  { id: 'campus_bus_uses', label: '캠퍼스 분산 최소화' },
  { id: 'campus_distribution_imbalance', label: '캠퍼스별 인원 균형' },
  { id: 'campus_isolated_groups', label: '캠퍼스 고립 인원 최소화' },
  { id: 'campus_odd_groups', label: '캠퍼스 홀수 그룹 최소화' },
  { id: 'team_bus_uses', label: '팀 분산 최소화' },
  { id: 'team_distribution_imbalance', label: '팀별 인원 균형' },
  { id: 'destination_occupancy_imbalance', label: '버스별 탑승 인원 균형' },
] as const;

type PhaseGroupState = 'completed' | 'current' | 'pending' | 'halted';

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const getRecordedElapsedSeconds = (job: ExactAllocationJob) => {
  if (job.result_reused) return 0;

  if (job.elapsed_seconds > 0 || !job.started_at || !job.completed_at) {
    return job.elapsed_seconds;
  }

  return Math.max(
    0,
    Math.round(
      (new Date(job.completed_at).getTime() -
        new Date(job.started_at).getTime()) /
        1000
    )
  );
};

const initialConfig: ExactAllocationOptimizerConfig = {
  capacity: 45,
  price: 0,
  recommended_minimum_passengers: 36,
  maximum_buses: 999,
};

const AdminExactAllocationPage = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState(initialConfig);
  const [currentJob, setCurrentJob] = useState<ExactAllocationJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<ExactAllocationJob[]>([]);
  const [draftWorkspaces, setDraftWorkspaces] = useState<
    AllocationWorkspaceSummary[]
  >([]);
  const [confirmedWorkspaces, setConfirmedWorkspaces] = useState<
    AllocationWorkspaceSummary[]
  >([]);
  const [busOptionCount, setBusOptionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedRecommendedMinimum, setSavedRecommendedMinimum] = useState(
    initialConfig.recommended_minimum_passengers
  );
  const [configSaved, setConfigSaved] = useState(false);
  const [starting, setStarting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [linkedWorkspace, setLinkedWorkspace] = useState<{
    jobId: string;
    workspaceId: string | null;
  } | null>(null);
  const [startingDetailedBalance, setStartingDetailedBalance] = useState(false);
  const [executionMode, setExecutionMode] =
    useState<ExactAllocationExecutionMode>(getInitialExecutionMode);
  const [resumeDetailedBalance, setResumeDetailedBalance] = useState(true);
  const [skippedDetailedPhases, setSkippedDetailedPhases] = useState<string[]>([]);
  const [allocationName, setAllocationName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const loadRecentJobs = useCallback(async () => {
    const jobs = await getRecentExactAllocationJobs();
    setRecentJobs(jobs);
    setCurrentJob((current) => {
      if (current) return current;
      return jobs.find((job) => activeStatuses.has(job.status)) ?? jobs[0] ?? null;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextConfig, busOptions, drafts, confirmed] = await Promise.all([
        getExactAllocationOptimizerConfig(),
        getExactAllocationBusOptions(),
        getDraftAllocationWorkspaceSummaries(),
        getConfirmedAllocationWorkspaceSummaries(),
        loadRecentJobs(),
      ]);
      setDraftWorkspaces(drafts);
      setConfirmedWorkspaces(confirmed);
      setBusOptionCount(busOptions.length);
      const busOption = busOptions[0];
      const loadedConfig = {
        ...nextConfig,
        capacity: busOption?.capacity ?? nextConfig.capacity,
        price: busOption?.estimated_price ?? nextConfig.price,
        maximum_buses: busOption?.max_count ?? nextConfig.maximum_buses ?? 999,
        recommended_minimum_passengers: Math.min(
          nextConfig.recommended_minimum_passengers,
          busOption?.capacity ?? nextConfig.capacity
        ),
      };
      setConfig(loadedConfig);
      setSavedRecommendedMinimum(loadedConfig.recommended_minimum_passengers);
      setConfigSaved(false);
    } catch (loadError) {
      setError(formatError(loadError));
    } finally {
      setLoading(false);
    }
  }, [loadRecentJobs]);

  useEffect(() => {
    // Initial page load synchronizes optimizer state with Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!currentJob || !activeStatuses.has(currentJob.status)) return;

    const intervalId = window.setInterval(() => {
      void getExactAllocationJob(currentJob.id)
        .then((job) => {
          if (!job) return;
          setCurrentJob(job);
          if (!activeStatuses.has(job.status)) void loadRecentJobs();
        })
        .catch((pollError) => setError(formatError(pollError)));
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [currentJob, loadRecentJobs]);

  useEffect(() => {
    if (!currentJob || !activeStatuses.has(currentJob.status)) return;
    const intervalId = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [currentJob]);

  useEffect(() => {
    if (!currentJob || activeStatuses.has(currentJob.status)) return;

    const intervalId = window.setInterval(() => {
      void getExactAllocationJob(currentJob.id)
        .then((job) => {
          if (job) setCurrentJob(job);
        })
        .catch((pollError) => setError(formatError(pollError)));
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [currentJob]);

  useEffect(() => {
    window.localStorage.setItem(executionModeStorageKey, executionMode);
  }, [executionMode]);

  useEffect(() => {
    if (!currentJob || currentJob.status !== 'OPTIMAL') return;

    let cancelled = false;
    const jobId = currentJob.id;
    void getAllocationWorkspaceForExactJob(currentJob.id)
      .then((workspace) => {
        if (!cancelled) {
          setLinkedWorkspace({ jobId, workspaceId: workspace?.id ?? null });
        }
      })
      .catch((workspaceError) => {
        if (!cancelled) {
          setLinkedWorkspace({ jobId, workspaceId: null });
          setError(formatError(workspaceError));
        }
      })

    return () => {
      cancelled = true;
    };
  }, [currentJob]);

  const activeJob = currentJob && activeStatuses.has(currentJob.status);
  const reusedResult = currentJob?.result_reused === true;
  const reservationsChanged = currentJob?.reservations_changed === true;
  const linkedWorkspaceId =
    linkedWorkspace && linkedWorkspace.jobId === currentJob?.id
      ? linkedWorkspace.workspaceId
      : null;
  const loadingLinkedWorkspace =
    currentJob?.status === 'OPTIMAL' &&
    linkedWorkspace?.jobId !== currentJob.id;
  const hasSingleBusOption = busOptionCount === 1;
  const configChanged =
    config.recommended_minimum_passengers !== savedRecommendedMinimum;
  const recommendedMinimumInvalid =
    config.recommended_minimum_passengers < 1 ||
    config.recommended_minimum_passengers > config.capacity;
  const confirmedWorkspace = confirmedWorkspaces[0] ?? null;
  const allocationPlanningLocked = confirmedWorkspace !== null;
  const optimalResult =
    currentJob?.status === 'OPTIMAL' ? currentJob.result ?? null : null;
  const resultDestinations = useMemo(
    () => new Set(optimalResult?.buses.map((bus) => bus.destination) ?? []).size,
    [optimalResult]
  );
  const displayedElapsedSeconds = useMemo(() => {
    if (!currentJob) return 0;
    if (!activeStatuses.has(currentJob.status) || !currentJob.started_at) {
      return currentJob.elapsed_seconds;
    }
    return Math.max(
      currentJob.elapsed_seconds,
      Math.floor((clock - new Date(currentJob.started_at).getTime()) / 1000)
    );
  }, [clock, currentJob]);
  const visiblePhaseGroups =
    currentJob?.optimization_scope === 'DETAILED'
      ? phaseGroups
      : phaseGroups.slice(0, 3);
  const phaseGroupStates = useMemo(() => {
    if (!currentJob) return [];
    const completedPhaseIndex = optimizationPhases.indexOf(
      currentJob.current_phase as (typeof optimizationPhases)[number]
    );
    const isComplete = currentJob.status === 'OPTIMAL';
    const isActive = activeStatuses.has(currentJob.status);

    let foundIncomplete = false;
    return visiblePhaseGroups.map(({ finalPhase, completionProgress }) => {
      const finalPhaseIndex = optimizationPhases.indexOf(finalPhase);
      const hasStarted = currentJob.current_phase !== null;
      if (
        isComplete ||
        completedPhaseIndex >= finalPhaseIndex ||
        (hasStarted && currentJob.progress >= completionProgress)
      ) {
        return 'completed' satisfies PhaseGroupState;
      }
      if (!foundIncomplete) {
        foundIncomplete = true;
        return (isActive ? 'current' : 'halted') satisfies PhaseGroupState;
      }
      return 'pending' satisfies PhaseGroupState;
    });
  }, [currentJob, visiblePhaseGroups]);
  const currentPhaseGroup =
    visiblePhaseGroups[phaseGroupStates.indexOf('current')];
  const displayedProgress =
    currentJob?.optimization_scope === 'BASELINE'
      ? Math.round(
          (phaseGroupStates.filter((state) => state === 'completed').length /
            visiblePhaseGroups.length) *
            100
        )
      : (currentJob?.progress ?? 0);

  const handleSaveConfig = async () => {
    if (!hasSingleBusOption) {
      setError('버스 옵션 관리에서 버스 옵션을 하나만 등록해주세요.');
      return;
    }
    setSavingConfig(true);
    setError(null);
    setConfigSaved(false);
    try {
      const savedConfig = await saveExactAllocationOptimizerConfig(config);
      setConfig(savedConfig);
      setSavedRecommendedMinimum(savedConfig.recommended_minimum_passengers);
      setConfigSaved(true);
    } catch (saveError) {
      setError(formatError(saveError));
    } finally {
      setSavingConfig(false);
    }
  };

  const handleStart = async () => {
    if (!hasSingleBusOption) {
      setError('버스 옵션 관리에서 버스 옵션을 하나만 등록한 뒤 계산을 시작해주세요.');
      return;
    }
    if (recommendedMinimumInvalid) {
      setError(
        `권장 최소 탑승 인원을 1명 이상, 버스 정원 ${config.capacity.toLocaleString()}명 이하로 입력해주세요.`
      );
      return;
    }
    setStarting(true);
    setError(null);
    setConfigSaved(false);
    try {
      const savedConfig = await saveExactAllocationOptimizerConfig(config);
      setConfig(savedConfig);
      setSavedRecommendedMinimum(savedConfig.recommended_minimum_passengers);
      const jobId = await createExactAllocationJob(executionMode);
      const job = await getExactAllocationJob(jobId);
      if (job) setCurrentJob(job);
      if (job?.status === 'PENDING') {
        await launchExactAllocationJob(jobId, executionMode);
      }
      await loadRecentJobs();
    } catch (startError) {
      setError(formatError(startError));
      await loadRecentJobs().catch(() => undefined);
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (!currentJob) return;
    setError(null);
    try {
      await cancelExactAllocationJob(currentJob.id);
      const job = await getExactAllocationJob(currentJob.id);
      if (job) setCurrentJob(job);
      await loadRecentJobs();
    } catch (cancelError) {
      setError(formatError(cancelError));
    }
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        '완료된 최적화 계산 기록과 재사용 캐시를 모두 삭제합니다. 생성된 임시·확정 배차안은 유지됩니다. 계속할까요?'
      )
    ) {
      return;
    }
    setResetting(true);
    setError(null);
    try {
      await resetExactAllocationJobs();
      setCurrentJob(null);
      setRecentJobs([]);
      setLinkedWorkspace(null);
    } catch (resetError) {
      setError(formatError(resetError));
    } finally {
      setResetting(false);
    }
  };

  const handleCreateDraft = async () => {
    if (!currentJob || currentJob.status !== 'OPTIMAL') return;
    const name = allocationName.trim();
    if (!name) {
      setError('임시 배차안 이름을 입력해주세요.');
      return;
    }
    setCreatingDraft(true);
    setError(null);
    try {
      const row = await createDraftFromExactAllocationJob(currentJob.id, name);
      navigate(`/admin/allocations/workspace?id=${row.id}`);
    } catch (draftError) {
      const existing = await getAllocationWorkspaceForExactJob(currentJob.id)
        .catch(() => null);
      if (existing) {
        navigate(`/admin/allocations/workspace?id=${existing.id}`);
        return;
      }
      setError(formatError(draftError));
    } finally {
      setCreatingDraft(false);
    }
  };

  const handleStartDetailedBalance = async () => {
    if (!currentJob || currentJob.status !== 'OPTIMAL') return;
    setStartingDetailedBalance(true);
    setError(null);
    try {
      const resumeFromJobId = resumeDetailedBalance
        ? currentJob.optimization_scope === 'DETAILED'
          ? currentJob.id
          : recentJobs.find(
              (job) =>
                job.optimization_scope === 'DETAILED' &&
                job.status === 'OPTIMAL'
            )?.id ?? null
        : null;
      const jobId = await createDetailedBalanceJob(
        currentJob.id,
        skippedDetailedPhases,
        resumeFromJobId,
        executionMode
      );
      const job = await getExactAllocationJob(jobId);
      if (job) setCurrentJob(job);
      if (job?.status === 'PENDING') {
        await launchExactAllocationJob(jobId, executionMode);
      }
      await loadRecentJobs();
    } catch (balanceError) {
      setError(formatError(balanceError));
      await loadRecentJobs().catch(() => undefined);
    } finally {
      setStartingDetailedBalance(false);
    }
  };

  return (
    <div className={styles.page}>
      <AdminHeader />
      <main className={styles.main}>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>배차 운영</span>
            <h1>배차 계산 및 배차안 관리</h1>
            <p>
              모든 승객을 1·2지망 안에서 배차하며, 최저 버스 대수가 수학적으로
              증명된 결과만 사용합니다.
            </p>
          </div>
          <div className={styles.heroActions}>
            <button
              className={styles.secondary}
              type="button"
              onClick={() => navigate('/admin/allocations/logic')}
            >
              <BookOpen size={15} /> 로직 설명
            </button>
            <span className={styles.proofBadge}>
              {executionMode === 'cloud' ? 'Cloud Run' : '로컬 Worker'} · OPTIMAL
              증명 필수
            </span>
          </div>
        </header>

        {error && <div className={styles.error}>{error}</div>}

        {confirmedWorkspace && (
          <section className={styles.confirmedWorkspaceTop}>
            <div>
              <span className={styles.confirmedWorkspaceEyebrow}>배차 확정 완료</span>
              <h2>{confirmedWorkspace.allocation_name}</h2>
              <p>
                확정 배차를 취소하기 전까지 새 계산, 버스 설정, 임시 배차안 편집을
                사용할 수 없습니다.
              </p>
              <div>
                <small>버스 {confirmedWorkspace.bus_count.toLocaleString()}대</small>
                <small>승객 {confirmedWorkspace.passenger_count.toLocaleString()}명</small>
                <small>{confirmedWorkspace.total_cost.toLocaleString()}원</small>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                navigate(`/admin/allocations/workspace?id=${confirmedWorkspace.id}`)
              }
            >
              확정 배차 확인 및 취소 <ArrowRight size={17} />
            </button>
          </section>
        )}

        {allocationPlanningLocked && (
          <div className={styles.planningLockNotice}>
            <CheckCircle2 size={18} />
            확정 배차안이 운영 기준으로 잠겨 있습니다. 변경이 필요하면 위 확정안을
            열어 배차 확정을 먼저 취소해주세요.
          </div>
        )}

        <div className={allocationPlanningLocked ? styles.planningLocked : undefined}>
        <nav className={styles.workflow} aria-label="배차 운영 순서">
          <a className={styles.workflowItem} href="#saved-allocations">
            <span className={styles.workflowStep}>01</span>
            <span className={styles.workflowIcon}>
              <FolderOpen size={18} />
            </span>
            <span className={styles.workflowContent}>
              <small>먼저 확인</small>
              <strong>저장된 배차안</strong>
              <em>
                임시 {draftWorkspaces.length.toLocaleString()} · 확정{' '}
                {confirmedWorkspaces.length.toLocaleString()}
              </em>
            </span>
            <ArrowRight size={17} />
          </a>
          <a className={styles.workflowItem} href="#bus-settings">
            <span className={styles.workflowStep}>02</span>
            <span className={styles.workflowIcon}>
              <BookOpen size={18} />
            </span>
            <span className={styles.workflowContent}>
              <small>계산 전 준비</small>
              <strong>버스 설정</strong>
              <em>
                {loading
                  ? '설정 확인 중'
                  : hasSingleBusOption
                    ? `정원 ${config.capacity.toLocaleString()}명`
                    : '버스 옵션 확인 필요'}
              </em>
            </span>
            <ArrowRight size={17} />
          </a>
          <a className={styles.workflowItem} href="#optimization">
            <span className={styles.workflowStep}>03</span>
            <span className={styles.workflowIcon}>
              {activeJob ? <LoaderCircle size={18} /> : <Play size={18} />}
            </span>
            <span className={styles.workflowContent}>
              <small>계산 및 검증</small>
              <strong>최적해 계산</strong>
              <em>
                {activeJob
                  ? `${displayedProgress}% 진행 중`
                  : currentJob?.status === 'OPTIMAL'
                    ? '최적해 증명 완료'
                    : '계산 대기'}
              </em>
            </span>
            <ArrowRight size={17} />
          </a>
        </nav>

        <section className={styles.section} id="saved-allocations">
          <div className={styles.sectionHeader}>
            <div>
              <h2><FolderOpen size={18} /> 저장된 배차안</h2>
              <p className={styles.muted}>
                임시 배차안을 이어서 편집하거나 확정된 배차 결과를 확인합니다.
              </p>
            </div>
            <div className={styles.workspaceCounts}>
              <span className={styles.draftCount}>
                임시 {draftWorkspaces.length.toLocaleString()}
              </span>
              <span className={styles.confirmedCount}>
                확정 {confirmedWorkspaces.length.toLocaleString()}
              </span>
            </div>
          </div>
          {draftWorkspaces.length + confirmedWorkspaces.length > 0 ? (
            <div
              className={`${styles.draftList} ${
                confirmedWorkspaces.length > 0 ? styles.hasConfirmedWorkspace : ''
              }`}
            >
              {[...confirmedWorkspaces, ...draftWorkspaces].map((workspace) => (
                <button
                  className={`${styles.draftItem} ${
                    workspace.status === 'confirmed' ? styles.confirmedItem : ''
                  } ${
                    confirmedWorkspaces.length > 0 &&
                    workspace.status !== 'confirmed'
                      ? styles.secondaryDraftItem
                      : ''
                  }`}
                  key={workspace.id}
                  type="button"
                  onClick={() =>
                    navigate(`/admin/allocations/workspace?id=${workspace.id}`)
                  }
                >
                  <span className={styles.draftItemTitle}>
                    <strong>{workspace.allocation_name}</strong>
                    <em>
                      {workspace.status === 'confirmed' && (
                        <CheckCircle2 size={12} />
                      )}
                      {workspace.status === 'confirmed' ? '확정 배차안' : '임시'}
                    </em>
                  </span>
                  <span className={styles.draftItemMetrics}>
                    <small>버스 {workspace.bus_count.toLocaleString()}대</small>
                    <small>승객 {workspace.passenger_count.toLocaleString()}명</small>
                    <small>{workspace.total_cost.toLocaleString()}원</small>
                  </span>
                  <span className={styles.draftItemFooter}>
                    <small>{new Date(workspace.created_at).toLocaleString('ko-KR')}</small>
                    <strong>
                      {workspace.status === 'confirmed'
                        ? '확정 배차 확인'
                        : '이어서 편집'}
                    </strong>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.draftEmpty}>
              아직 저장된 배차안이 없습니다.
            </div>
          )}
        </section>

        <details className={styles.installGuide}>
          <summary>
            <span>
              <strong>다른 노트북에서 로컬 배차 계산 준비하기</strong>
              <small>최초 설치 방법과 계산할 때마다 실행할 명령어를 확인합니다.</small>
            </span>
            <em>설치 안내 열기</em>
          </summary>
          <div className={styles.installGuideBody}>
            <div className={styles.installNotice}>
              <strong>보안 주의</strong>
              <p>
                로컬 워커에는 관리자급 비밀키인 <code>SUPABASE_SERVICE_ROLE_KEY</code>가
                필요합니다. 신뢰할 수 있는 관리자 노트북에만 설치하고, 키를 메신저나
                공개 저장소에 올리지 마세요. 현재 설치 파일은 코드서명되지 않아 Windows
                보안 경고가 표시될 수 있습니다.
              </p>
            </div>
            <ol className={styles.installSteps}>
              <li>
                <strong>설치 프로그램 다운로드</strong>
                <p>
                  아래 버튼으로 설치 프로그램을 받은 뒤 실행합니다. Node.js, Python,
                  프로젝트 소스 코드는 따로 설치할 필요가 없습니다.
                </p>
                <a
                  className={styles.downloadLink}
                  href="/downloads/CCC-Bus-Allocation-Optimizer-Setup.exe"
                  download
                >
                  Windows 배차 계산기 설치 프로그램 다운로드
                </a>
              </li>
              <li>
                <strong>메뉴에서 설치 / 업데이트 선택</strong>
                <p>
                  설치 창에서 <code>1</code>을 입력하고, 시스템 관리자로부터 전달받은
                  Supabase URL과 service-role 키를 입력합니다. URL은
                  <code>https://프로젝트참조.supabase.co</code> 형식으로 입력하고,
                  대시보드 주소나 <code>/rest/v1</code> 경로는 붙이지 않습니다.
                  기존 JWT 키와 <code>sb_secret_...</code> 형식의 새 비밀 키를 모두
                  사용할 수 있습니다.
                </p>
              </li>
              <li>
                <strong>설치 완료</strong>
                <p>
                  연결 확인 후 워커가 바로 실행되며, 다음 Windows 로그인부터 자동으로
                  실행됩니다.
                </p>
              </li>
              <li>
                <strong>문제가 있을 때</strong>
                <p>
                  설치 프로그램을 다시 실행해 <code>2</code>로 연결을 확인하거나,
                  <code>3</code>으로 워커를 다시 실행할 수 있습니다.
                </p>
              </li>
            </ol>
            <p className={styles.installFootnote}>
              여러 노트북에서 워커를 실행해도 하나의 계산 작업은 한 대만 선점합니다.
              설치 프로그램은 현재 Windows 사용자 계정에만 설치되며 관리자 권한을
              요구하지 않습니다.
            </p>
          </div>
        </details>

        <section className={styles.section} id="bus-settings">
          <div className={styles.sectionHeader}>
            <div>
              <h2>단일 버스 설정</h2>
              <p className={styles.muted}>
                버스 옵션 관리에 등록된 한 종류의 버스를 모든 행선지에 적용합니다.
              </p>
            </div>
            <div className={styles.actions}>
              <button
                className={styles.secondary}
                type="button"
                disabled={Boolean(activeJob)}
                onClick={() => navigate('/admin/settings?detail=bus-options')}
              >
                버스 옵션 관리
              </button>
            </div>
          </div>
          {!loading && !hasSingleBusOption && (
            <div className={`${styles.warning} ${styles.busOptionWarning}`}>
              <span>
                {busOptionCount === 0
                  ? '등록된 버스 옵션이 없습니다. 버스 옵션 관리에서 한 개를 등록해주세요.'
                  : `버스 옵션이 ${busOptionCount.toLocaleString()}개 등록되어 있습니다. 단일 버스 계산을 위해 하나만 남겨주세요.`}
              </span>
              <button
                className={styles.warningAction}
                type="button"
                onClick={() => navigate('/admin/settings?detail=bus-options')}
              >
                버스 옵션 관리로 이동 <ArrowRight size={15} />
              </button>
            </div>
          )}
          <div className={styles.busSettingLayout}>
            <div className={styles.currentBusSettings}>
              <div className={styles.settingGroupHeader}>
                <strong>현재 적용 버스</strong>
                <span>버스 옵션 관리에서 변경</span>
              </div>
              <div className={styles.configSummaryGrid}>
                <div className={styles.configSummaryCard}>
                  <span>버스 정원</span>
                  <strong>{config.capacity.toLocaleString()}<small>명</small></strong>
                </div>
                <div className={styles.configSummaryCard}>
                  <span>대당 예상 비용</span>
                  <strong>{config.price.toLocaleString()}<small>원</small></strong>
                </div>
                <div className={styles.configSummaryCard}>
                  <span>최대 사용 가능 버스</span>
                  <strong>{config.maximum_buses.toLocaleString()}<small>대</small></strong>
                </div>
              </div>
            </div>

            <div className={styles.recommendedSetting}>
              <div className={styles.settingGroupHeader}>
                <strong>권장 최소 탑승 인원</strong>
                <span className={styles.editableBadge}>직접 설정</span>
              </div>
              <p>
                이 인원 미만으로 탑승하는 버스가 생기지 않도록 계산 시 권장 기준으로 사용합니다.
              </p>
              <div className={styles.recommendedSettingControls}>
                <label className={styles.numberInput}>
                  <span className={styles.srOnly}>권장 최소 탑승 인원</span>
                  <input
                    type="number"
                    min="1"
                    max={config.capacity}
                    disabled={Boolean(activeJob)}
                    value={config.recommended_minimum_passengers}
                    onChange={(event) => {
                      setConfigSaved(false);
                      setConfig((current) => ({
                        ...current,
                        recommended_minimum_passengers: Number(event.target.value),
                      }));
                    }}
                  />
                  <span>명</span>
                </label>
                <button
                  className={styles.primary}
                  type="button"
                  disabled={
                    loading ||
                    savingConfig ||
                    Boolean(activeJob) ||
                    !hasSingleBusOption ||
                    !configChanged ||
                    recommendedMinimumInvalid
                  }
                  onClick={handleSaveConfig}
                >
                  {savingConfig ? '저장 중...' : '변경사항 저장'}
                </button>
              </div>
              {recommendedMinimumInvalid && (
                <small className={styles.fieldError}>
                  1명 이상, 버스 정원 {config.capacity.toLocaleString()}명 이하로 입력해주세요.
                </small>
              )}
              {configSaved && (
                <small className={styles.saveSuccess} role="status">
                  <CheckCircle2 size={14} /> 권장 인원을 저장했습니다.
                </small>
              )}
            </div>
          </div>
        </section>

        <section className={styles.section} id="optimization">
          <div className={styles.sectionHeader}>
            <div>
              <h2>최적해 계산</h2>
              <p className={styles.muted}>
                예약 정보와 버스 설정이 같으면 저장된 최적해를 즉시 불러오고, 변경된 경우에만 새로 계산합니다.
              </p>
            </div>
            <div className={styles.actions}>
              {activeJob ? (
                <button className={styles.danger} type="button" onClick={handleCancel}>
                  <Square size={14} /> 계산 취소
                </button>
              ) : (
                <>
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={resetting || recentJobs.length === 0}
                    onClick={handleReset}
                  >
                    <RotateCcw size={15} /> {resetting ? '리셋 중...' : '계산 리셋'}
                  </button>
                  <button
                    className={styles.primary}
                    type="button"
                    disabled={
                      starting ||
                      resetting ||
                      loading ||
                      !hasSingleBusOption ||
                      recommendedMinimumInvalid
                    }
                    onClick={handleStart}
                  >
                    <Play size={15} /> {starting ? '시작 중...' : '정확 계산 시작'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className={styles.executionModePanel}>
            <div>
              <strong>계산 실행 위치</strong>
              <p className={styles.muted}>
                새 기본 계산과 상세 균형 계산에 적용됩니다.
              </p>
            </div>
            <div className={styles.executionModeOptions}>
              <label
                className={executionMode === 'cloud' ? styles.selectedMode : ''}
              >
                <input
                  type="radio"
                  name="allocation-execution-mode"
                  value="cloud"
                  checked={executionMode === 'cloud'}
                  disabled={Boolean(activeJob)}
                  onChange={() => setExecutionMode('cloud')}
                />
                <span>
                  <strong>Cloud Run</strong>
                  <small>설치 없이 서버에서 계산합니다.</small>
                </span>
              </label>
              <label
                className={executionMode === 'local' ? styles.selectedMode : ''}
              >
                <input
                  type="radio"
                  name="allocation-execution-mode"
                  value="local"
                  checked={executionMode === 'local'}
                  disabled={Boolean(activeJob)}
                  onChange={() => setExecutionMode('local')}
                />
                <span>
                  <strong>로컬 Worker</strong>
                  <small>이 PC에서 로컬 Worker가 실행 중이어야 합니다.</small>
                </span>
              </label>
            </div>
          </div>

          {currentJob ? (
            <>
              <div className={styles.jobTitle}>
                <div>
                  <strong>
                    {activeJob && <LoaderCircle size={15} />}{' '}
                    {currentJob.optimization_scope === 'DETAILED'
                      ? '상세 균형 작업'
                      : '기본 최저비용 작업'}{' '}
                    {currentJob.id}
                  </strong>
                  <p className={styles.muted}>
                    {reusedResult
                      ? '예약 정보와 버스 설정의 변동이 없어 이전에 증명된 최적해를 즉시 불러왔습니다.'
                      : currentJob.status === 'OPTIMAL'
                      ? currentJob.optimization_scope === 'BASELINE'
                        ? '최저비용 기본 배차가 완료되었습니다. 지금 임시 배차안을 생성해 확정할 수 있습니다.'
                        : '최저비용 조건을 유지한 상세 균형 계산이 완료되었습니다.'
                      : currentPhaseGroup
                        ? `${currentPhaseGroup.label} 진행 중`
                        : currentJob.status === 'CANCELLED'
                          ? '계산이 취소되었습니다.'
                          : currentJob.status === 'FAILED'
                            ? '계산 중 오류가 발생했습니다.'
                            : '계산 결과를 확인해주세요.'}
                  </p>
                </div>
                <span
                  className={
                    reusedResult ? styles.reusedJobStatus : styles.jobStatus
                  }
                >
                  {reusedResult ? '즉시 재사용' : currentJob.status}
                </span>
              </div>
              {reservationsChanged && (
                <div className={styles.reservationChangeNotice}>
                  <TriangleAlert size={22} />
                  <div>
                    <strong>계산 이후 예약 변동이 있습니다</strong>
                    <p>
                      계산 당시 활성 예약{' '}
                      {currentJob.snapshot_active_reservation_count ?? '확인 불가'}명,
                      현재 {currentJob.current_active_reservation_count}명입니다.
                      인원수가 같아도 예약 정보나 상태가 변경되었을 수 있으니
                      최적해를 다시 계산해주세요.
                    </p>
                  </div>
                </div>
              )}
              {reusedResult ? (
                <div className={styles.reusedResultNotice}>
                  <CheckCircle2 size={22} />
                  <div>
                    <strong>저장된 최적해 재사용</strong>
                    <p>
                      동일한 예약 스냅샷의 검증된 결과를 가져왔습니다. Python
                      Worker를 실행하지 않았으며 최적화 계산 단계도 생략했습니다.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.progressTrack}>
                    <span style={{ width: `${displayedProgress}%` }} />
                  </div>
                  <ol className={styles.phaseList} aria-label="최적화 계산 단계">
                    {visiblePhaseGroups.map((phase, index) => {
                      const state = phaseGroupStates[index] ?? 'pending';
                      const stateLabel =
                        state === 'completed'
                          ? '완료'
                          : state === 'current'
                            ? currentJob.status === 'CANCEL_REQUESTED'
                              ? '취소 처리 중'
                              : '진행 중'
                            : state === 'halted'
                              ? '중단됨'
                              : '대기';
                      return (
                        <li className={styles[`phase_${state}`]} key={phase.label}>
                          <span className={styles.phaseMarker}>
                            {state === 'completed' ? (
                              <CheckCircle2 size={17} />
                            ) : state === 'current' ? (
                              <LoaderCircle size={17} />
                            ) : (
                              index + 1
                            )}
                          </span>
                          <span className={styles.phaseContent}>
                            <strong>{phase.label}</strong>
                            <small>{phase.description}</small>
                          </span>
                          <em>{stateLabel}</em>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
              <div className={styles.metricGrid}>
                <article>
                  <span>진행률</span>
                  <strong>{displayedProgress}%</strong>
                </article>
                <article>
                  <span>경과 시간</span>
                  <strong>
                    {reusedResult
                      ? '계산 생략'
                      : `${displayedElapsedSeconds.toLocaleString()}초`}
                  </strong>
                </article>
                <article>
                  <span>증명된 최저</span>
                  <strong>
                    {currentJob.proven_bus_count === null
                      ? '-'
                      : `${currentJob.proven_bus_count}대`}
                  </strong>
                </article>
              </div>
              {currentJob.status === 'OPTIMAL' && (
                <div className={styles.detailedBalancePanel}>
                  <div>
                    <span className={styles.optionalBadge}>선택 단계</span>
                    <h3>
                      {currentJob.optimization_scope === 'DETAILED'
                        ? '상세 균형 이어서 최적화'
                        : '상세 균형 최적화'}
                    </h3>
                    <p className={styles.muted}>
                      최저비용과 최소 2지망 인원을 유지한 채 캠퍼스 분산,
                      캠퍼스별 인원 균형, 팀 분산, 버스별 탑승 균형을 추가로 계산합니다.
                    </p>
                    <label className={styles.resumeOption}>
                      <input
                        type="checkbox"
                        checked={resumeDetailedBalance}
                        onChange={(event) =>
                          setResumeDetailedBalance(event.target.checked)
                        }
                      />
                      이전 상세 균형 결과를 기억해 이어서 탐색
                    </label>
                    <div className={styles.skipPhaseOptions}>
                      <strong>건너뛸 계산 선택</strong>
                      <div>
                        {skippableDetailedPhases.map((phase) => (
                          <label key={phase.id}>
                            <input
                              type="checkbox"
                              checked={skippedDetailedPhases.includes(phase.id)}
                              onChange={(event) =>
                                setSkippedDetailedPhases((current) =>
                                  event.target.checked
                                    ? [...current, phase.id]
                                    : current.filter((id) => id !== phase.id)
                                )
                              }
                            />
                            {phase.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    {currentJob.optimization_scope === 'DETAILED' &&
                      (currentJob.detailed_settings?.skipped_phases?.length ?? 0) >
                        0 && (
                        <p className={styles.skippedSummary}>
                          현재 결과에서 건너뜀:{' '}
                          {currentJob.detailed_settings?.skipped_phases
                            ?.map(
                              (id) =>
                                skippableDetailedPhases.find(
                                  (phase) => phase.id === id
                                )?.label ?? id
                            )
                            .join(', ')}
                        </p>
                      )}
                  </div>
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={
                      currentJob.status !== 'OPTIMAL' ||
                      startingDetailedBalance ||
                      Boolean(activeJob) ||
                      reservationsChanged
                    }
                    onClick={handleStartDetailedBalance}
                  >
                    {startingDetailedBalance
                      ? '상세 균형 작업 생성 중...'
                      : currentJob.optimization_scope === 'DETAILED'
                        ? '설정대로 이어서 계산'
                        : '상세 균형 최적화 실행'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className={styles.muted}>아직 실행한 정확 최적화 작업이 없습니다.</p>
          )}
          {currentJob?.status === 'INFEASIBLE' && (
            <div className={styles.warningList}>
              <div className={styles.warning}>
                <strong>배차 불가능 · 부족 버스 정보</strong>
                <p>
                  동일 규격 버스 대수는 무제한이므로 단순 버스 부족이 원인은 아닙니다.
                  1·2지망 데이터와 목적지별 배차 가능 조건을 확인해주세요.
                </p>
                {currentJob.error_message && <small>{currentJob.error_message}</small>}
              </div>
            </div>
          )}
          {currentJob?.status === 'FAILED' && currentJob.error_message && (
            <div className={styles.warningList}>
              <div className={styles.warning}>
                <strong>계산 실패</strong>
                <p>{currentJob.error_message}</p>
              </div>
            </div>
          )}
        </section>

        {optimalResult && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2><CheckCircle2 size={18} /> 최적해 증명 완료</h2>
                <p className={styles.muted}>
                  {currentJob?.optimization_scope === 'BASELINE'
                    ? '최소 버스 수와 최소 2지망 인원이 증명되었습니다. 상세 균형을 기다리지 않고 지금 임시 배차안을 생성할 수 있습니다.'
                    : '최저비용 조건을 유지하면서 캠퍼스·팀·탑승 인원 상세 균형까지 계산한 결과입니다.'}
                </p>
              </div>
            </div>
            <div className={styles.metricGrid}>
              <article><span>운행 버스</span><strong>{optimalResult.total_buses}대</strong></article>
              <article><span>총 예상 비용</span><strong>{optimalResult.total_cost.toLocaleString()}원</strong></article>
              <article><span>2지망 배정</span><strong>{optimalResult.second_choice_count}명</strong></article>
              <article><span>운행 행선지</span><strong>{resultDestinations}곳</strong></article>
            </div>
            {optimalResult.warnings.length > 0 && (
              <div className={styles.warningList}>
                {optimalResult.warnings.map((warning, index) => (
                  <div className={styles.warning} key={`${warning.code}-${index}`}>
                    {warning.message}
                  </div>
                ))}
              </div>
            )}
            <div className={styles.busGrid}>
              {optimalResult.buses.map((bus) => (
                <article className={styles.busCard} key={bus.bus_id}>
                  <strong>{formatBusLabel(bus.label)} · {bus.destination}</strong>
                  <span>{bus.passenger_ids.length}명 / {bus.capacity}석</span>
                </article>
              ))}
            </div>
            <div className={styles.draftCreator}>
              {linkedWorkspaceId ? (
                <button
                  className={styles.primary}
                  type="button"
                  onClick={() =>
                    navigate(`/admin/allocations/workspace?id=${linkedWorkspaceId}`)
                  }
                >
                  완료된 임시 배차안으로 이동
                </button>
              ) : (
                <>
                  <label>
                    임시 배차안 이름
                    <input
                      value={allocationName}
                      onChange={(event) => setAllocationName(event.target.value)}
                      placeholder="예: 1차 귀가버스 정확 최적 배차안"
                    />
                  </label>
                  <button
                    className={styles.primary}
                    type="button"
                    disabled={
                      creatingDraft ||
                      loadingLinkedWorkspace ||
                      !allocationName.trim() ||
                      reservationsChanged
                    }
                    onClick={handleCreateDraft}
                  >
                    {loadingLinkedWorkspace
                      ? '연결된 배차안 확인 중...'
                      : creatingDraft
                        ? '검증 및 생성 중...'
                        : '검증 후 임시 배차안 생성'}
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>최근 계산 작업</h2>
          </div>
          <div className={styles.historyList}>
            {recentJobs.map((job) => (
              <button
                className={styles.historyItem}
                key={job.id}
                type="button"
                onClick={() =>
                  void getExactAllocationJob(job.id).then((detail) => {
                    if (detail) setCurrentJob(detail);
                  })
                }
              >
                <strong>
                  {job.optimization_scope === 'DETAILED' ? '상세 균형' : '기본 최저비용'}
                  {' · '}
                  {job.result_reused ? '즉시 재사용' : job.status} ·{' '}
                  {job.proven_bus_count ?? '-'}대
                  {job.reservations_changed && ' · 예약 변동'}
                </strong>
                <div className={styles.historyMeta}>
                  <span>{new Date(job.requested_at).toLocaleString('ko-KR')}</span>
                  <span>
                    {job.result_reused
                      ? '저장된 최적해 사용 · 계산 생략'
                      : `소요 ${getRecordedElapsedSeconds(job).toLocaleString()}초`}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
        </div>
      </main>
    </div>
  );
};

export default AdminExactAllocationPage;
