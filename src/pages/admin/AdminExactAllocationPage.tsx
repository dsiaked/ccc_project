import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FilePlus2,
  FolderOpen,
  LoaderCircle,
  Play,
  RotateCcw,
  Square,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  type ExactAllocationWarning,
} from '../../lib/admin/exactAllocationOptimizationService';
import { formatExactAllocationErrorMessage } from '../../lib/admin/exactAllocationErrorMessage';
import {
  createManualAllocationWorkspace,
  getConfirmedAllocationWorkspaceSummaries,
  getDraftAllocationWorkspaceSummaries,
  type AllocationWorkspaceSummary,
} from '../../lib/admin/allocationWorkspaceService';
import styles from './AdminExactAllocationPage.module.css';

const activeStatuses = new Set(['PENDING', 'RUNNING', 'CANCEL_REQUESTED']);
const executionModeStorageKey = 'ccc-bus-allocation-execution-mode';
const workerClaimWarningSeconds = 30;

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
  formatExactAllocationErrorMessage(
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : null
  );

const formatResetError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : null;
  if (message?.includes('Allocation optimization reset failed [')) {
    return message;
  }
  return formatExactAllocationErrorMessage(message);
};

const formatWarningMessage = (warning: ExactAllocationWarning) => {
  const destination = warning.destination ?? '일부 행선지';

  if (warning.code === 'FIRST_CHOICE_DESTINATION_REMOVED') {
    return `${destination} 1지망 운행이 제외되어 ${warning.passenger_ids.length.toLocaleString()}명이 2지망에 배정되었습니다.`;
  }

  if (warning.code === 'BELOW_RECOMMENDED_MINIMUM') {
    return `${destination} 운행의 탑승 인원이 권장 최소 인원보다 적습니다.`;
  }

  return `${destination} 관련 최적화 결과에 확인이 필요한 사항이 있습니다.`;
};

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

const formatElapsedTime = (elapsedSeconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(elapsedSeconds));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toLocaleString()}분 ${seconds}초`;
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
  const resetInFlightRef = useRef(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetDialogError, setResetDialogError] = useState<string | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [creatingManualDraft, setCreatingManualDraft] = useState(false);
  const [manualDraftModalOpen, setManualDraftModalOpen] = useState(false);
  const [manualDraftName, setManualDraftName] = useState('');
  const [manualDraftError, setManualDraftError] = useState<string | null>(null);
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
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [detailedBalanceError, setDetailedBalanceError] = useState<string | null>(
    null
  );
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [calculationViewReset, setCalculationViewReset] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const jobsStateRevisionRef = useRef(0);
  const activeJob =
    !calculationViewReset &&
    currentJob !== null &&
    activeStatuses.has(currentJob.status);

  const resetCalculationView = useCallback(() => {
    setCurrentJob(null);
    setRecentJobs([]);
    setLinkedWorkspace(null);
    setAllocationName('');
    setResumeDetailedBalance(true);
    setSkippedDetailedPhases([]);
    setCalculationError(null);
    setDetailedBalanceError(null);
    setClock(Date.now());
  }, []);

  const loadRecentJobs = useCallback(async (preferredJobId?: string) => {
    const requestRevision = jobsStateRevisionRef.current;
    const jobs = await getRecentExactAllocationJobs();
    if (requestRevision !== jobsStateRevisionRef.current) return;
    setRecentJobs(jobs);

    const activeJob = jobs.find((job) => activeStatuses.has(job.status));
    const targetJob =
      activeJob ??
      jobs.find((job) => job.id === preferredJobId) ??
      jobs[0] ??
      null;

    if (!targetJob) {
      setCurrentJob(null);
      return;
    }

    const detail = await getExactAllocationJob(targetJob.id);
    if (requestRevision !== jobsStateRevisionRef.current) return;
    setCurrentJob((current) => {
      if (
        current &&
        current.id !== targetJob.id &&
        !activeStatuses.has(targetJob.status) &&
        current.id !== preferredJobId
      ) {
        return current;
      }
      return detail ?? targetJob;
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
      const requestRevision = jobsStateRevisionRef.current;
      void getExactAllocationJob(currentJob.id)
        .then((job) => {
          if (!job || requestRevision !== jobsStateRevisionRef.current) return;
          setCurrentJob(job);
          if (!activeStatuses.has(job.status)) void loadRecentJobs(job.id);
        })
        .catch((pollError) => setCalculationError(formatError(pollError)));
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [currentJob, loadRecentJobs]);

  useEffect(() => {
    if (!activeJob) return;
    const intervalId = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [activeJob]);

  useEffect(() => {
    if (!currentJob || activeStatuses.has(currentJob.status)) return;

    const intervalId = window.setInterval(() => {
      void loadRecentJobs(currentJob.id).catch((pollError) =>
        setCalculationError(formatError(pollError))
      );
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [currentJob, loadRecentJobs]);

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

  const reservationsChanged = currentJob?.reservations_changed === true;
  const reusedResult =
    currentJob?.result_reused === true && !reservationsChanged;
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
    !calculationViewReset && currentJob?.status === 'OPTIMAL'
      ? currentJob.result ?? null
      : null;
  const draftCreationDisabledReason = creatingDraft
    ? '배차 초안을 검증하고 생성하는 중입니다.'
    : loadingLinkedWorkspace
      ? '이 계산 결과로 생성된 배차 초안이 있는지 확인하는 중입니다.'
      : reservationsChanged
        ? '계산 이후 신청 정보가 변경되어 생성할 수 없습니다. 최적해를 다시 계산해주세요.'
        : !allocationName.trim()
          ? '배차 초안 이름을 입력해주세요.'
          : null;
  const calculationStartDisabledReason = starting
    ? '계산 작업을 생성하는 중입니다.'
    : resetting
      ? '계산 기록을 리셋하는 중입니다.'
      : loading
        ? '계산 설정을 불러오는 중입니다.'
        : !hasSingleBusOption
          ? '버스 옵션 관리에서 계산에 사용할 버스 옵션을 하나만 등록해주세요.'
          : recommendedMinimumInvalid
            ? `권장 최소 탑승 인원을 1명 이상, 버스 정원 ${config.capacity.toLocaleString()}명 이하로 입력해주세요.`
            : null;
  const resultDestinations = useMemo(
    () => new Set(optimalResult?.buses.map((bus) => bus.destination) ?? []).size,
    [optimalResult]
  );
  const displayedElapsedSeconds = useMemo(() => {
    if (!currentJob) return 0;
    if (!activeStatuses.has(currentJob.status)) {
      return currentJob.elapsed_seconds;
    }
    const elapsedStartTime = new Date(
      currentJob.started_at ?? currentJob.requested_at
    ).getTime();
    if (!Number.isFinite(elapsedStartTime)) return currentJob.elapsed_seconds;
    return Math.max(
      currentJob.elapsed_seconds,
      Math.floor((clock - elapsedStartTime) / 1000)
    );
  }, [clock, currentJob]);
  const waitingForWorker = currentJob?.status === 'PENDING';
  const workerClaimDelayed =
    waitingForWorker && displayedElapsedSeconds >= workerClaimWarningSeconds;
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
    setCalculationError(null);
    setDetailedBalanceError(null);
    if (!hasSingleBusOption) {
      setCalculationError(
        '버스 옵션 관리에서 버스 옵션을 하나만 등록한 뒤 계산을 시작해주세요.'
      );
      return;
    }
    if (recommendedMinimumInvalid) {
      setCalculationError(
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
      setCalculationViewReset(false);
      const job = await getExactAllocationJob(jobId);
      if (job) setCurrentJob(job);
      if (job?.status === 'PENDING') {
        await launchExactAllocationJob(jobId, executionMode);
      }
      await loadRecentJobs(jobId);
    } catch (startError) {
      setCalculationError(formatError(startError));
      await loadRecentJobs().catch(() => undefined);
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (!currentJob) return;
    setError(null);
    setCalculationError(null);
    try {
      await cancelExactAllocationJob(currentJob.id);
      const job = await getExactAllocationJob(currentJob.id);
      if (job) setCurrentJob(job);
      await loadRecentJobs(currentJob.id);
    } catch (cancelError) {
      setCalculationError(formatError(cancelError));
    }
  };

  const handleReset = () => {
    if (resetting || resetInFlightRef.current || recentJobs.length === 0) return;
    setResetDialogError(null);
    setResetDialogOpen(true);
  };

  const confirmReset = async () => {
    if (
      resetting ||
      resetInFlightRef.current ||
      recentJobs.length === 0 ||
      activeJob
    ) {
      return;
    }

    resetInFlightRef.current = true;
    setResetting(true);
    setError(null);
    setCalculationError(null);
    setResetDialogError(null);
    setResetMessage(null);
    jobsStateRevisionRef.current += 1;
    try {
      const deletedCount = await resetExactAllocationJobs();
      resetCalculationView();
      setCalculationViewReset(true);
      setResetDialogOpen(false);
      setResetMessage(
        deletedCount > 0
          ? `계산 기록과 재사용 캐시 ${deletedCount.toLocaleString()}건을 리셋했습니다.`
          : '리셋할 계산 기록이 없습니다.'
      );
    } catch (resetError) {
      setResetDialogError(formatResetError(resetError));
      await loadRecentJobs(currentJob?.id).catch(() => undefined);
    } finally {
      resetInFlightRef.current = false;
      setResetting(false);
    }
  };

  useEffect(() => {
    if (!resetDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !resetting) {
        setResetDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetDialogOpen, resetting]);

  const handleCreateDraft = async () => {
    if (!currentJob || currentJob.status !== 'OPTIMAL') return;
    const name = allocationName.trim();
    if (!name) {
      setError('배차 초안 이름을 입력해주세요.');
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

  const openManualDraftModal = () => {
    setManualDraftName('');
    setManualDraftError(null);
    setManualDraftModalOpen(true);
  };

  const closeManualDraftModal = () => {
    if (creatingManualDraft) return;
    setManualDraftModalOpen(false);
    setManualDraftError(null);
  };

  const handleCreateManualDraft = async () => {
    const name = manualDraftName.trim();
    if (!name) {
      setManualDraftError('배차 초안 이름을 입력해주세요.');
      return;
    }

    setCreatingManualDraft(true);
    setManualDraftError(null);
    try {
      const row = await createManualAllocationWorkspace(name);
      setManualDraftModalOpen(false);
      navigate(`/admin/allocations/workspace?id=${row.id}`);
    } catch (manualDraftCreationError) {
      setManualDraftError(formatError(manualDraftCreationError));
    } finally {
      setCreatingManualDraft(false);
    }
  };

  const handleStartDetailedBalance = async () => {
    if (!currentJob || currentJob.status !== 'OPTIMAL') return;
    setStartingDetailedBalance(true);
    setError(null);
    setDetailedBalanceError(null);
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
      await loadRecentJobs(jobId);
    } catch (balanceError) {
      setDetailedBalanceError(formatError(balanceError));
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
            <h1>배차 계산 및 배차안 관리</h1>
          </div>
          <div className={styles.heroActions}>
            <button
              className={styles.secondary}
              type="button"
              onClick={() => navigate('/admin/allocations/logic')}
            >
              <BookOpen size={15} /> 로직 설명
            </button>
          </div>
        </header>

        {error && <div className={styles.error}>{error}</div>}
        {resetMessage && (
          <div className={styles.success} role="status">
            {resetMessage}
          </div>
        )}

        {confirmedWorkspace && (
          <section className={styles.confirmedWorkspaceTop}>
            <div>
              <span className={styles.confirmedWorkspaceEyebrow}>배차 확정 완료</span>
              <h2>{confirmedWorkspace.allocation_name}</h2>
              <p>
                확정 배차를 취소하기 전까지 새 계산, 버스 설정, 배차 초안 편집을
                사용할 수 없습니다.
              </p>
              <div>
                <small>버스 {confirmedWorkspace.bus_count.toLocaleString()}대</small>
                <small>탑승자 {confirmedWorkspace.passenger_count.toLocaleString()}명</small>
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
        <section className={styles.section} id="saved-allocations">
          <div className={styles.sectionHeader}>
            <div>
              <h2><FolderOpen size={18} /> 저장된 배차안</h2>
              <p className={styles.muted}>
                배차 초안을 이어서 편집하거나 확정된 배차 결과를 확인합니다.
              </p>
            </div>
            <div className={styles.savedAllocationActions}>
              <div className={styles.workspaceCounts}>
                <span className={styles.draftCount}>
                  임시 {draftWorkspaces.length.toLocaleString()}
                </span>
                <span className={styles.confirmedCount}>
                  확정 {confirmedWorkspaces.length.toLocaleString()}
                </span>
              </div>
              <button
                className={styles.secondary}
                type="button"
                disabled={allocationPlanningLocked}
                title={
                  allocationPlanningLocked
                    ? '확정 배차를 먼저 취소한 뒤 수동 배차 초안을 생성해주세요.'
                    : undefined
                }
                onClick={openManualDraftModal}
              >
                <FilePlus2 size={15} /> 수동 배차 초안 생성
              </button>
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
                      {workspace.status === 'confirmed' ? '확정 배차안' : '배차 초안'}
                    </em>
                  </span>
                  <span className={styles.draftItemMetrics}>
                    <small>버스 {workspace.bus_count.toLocaleString()}대</small>
                    <small>탑승자 {workspace.passenger_count.toLocaleString()}명</small>
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

        {!optimalResult ? (
        <section
          className={`${styles.section} ${
            activeJob ? styles.calculationRunning : styles.calculationReady
          }`}
          id="optimization"
        >
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.calculationStateBadge}>
                {waitingForWorker ? '워커 대기' : activeJob ? '계산 중' : '계산 전'}
              </span>
              <h2>
                {waitingForWorker ? (
                  <><LoaderCircle size={18} /> 최적화 워커 연결 대기</>
                ) : activeJob ? (
                  <><LoaderCircle size={18} /> 최적해 계산 중</>
                ) : (
                  '최적해 계산 준비'
                )}
              </h2>
              <p className={styles.muted}>
                {waitingForWorker
                  ? '계산 작업은 생성됐지만 아직 워커가 가져가지 않았습니다. 이 대기 시간은 최적해 계산 시간에 포함되지 않습니다.'
                  : activeJob
                  ? '현재 단계와 진행률을 확인할 수 있습니다. 페이지를 벗어나도 계산은 계속됩니다.'
                  : '계산 기준과 실행 위치를 확인한 뒤 최적해 계산을 시작합니다.'}
              </p>
            </div>
            <div className={styles.calculationActions}>
              <div className={styles.actions}>
                {activeJob ? (
                  <button className={styles.danger} type="button" onClick={handleCancel}>
                    <Square size={14} /> 계산 취소
                  </button>
                ) : (
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={resetting || recentJobs.length === 0}
                    onClick={handleReset}
                  >
                    <RotateCcw size={15} /> {resetting ? '리셋 중...' : '계산 기록 리셋'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {!calculationViewReset && currentJob?.status === 'INFEASIBLE' && (
            <div className={styles.warningList}>
              <div className={styles.warning}>
                <strong>배차 불가능 · 부족 버스 정보</strong>
                <p>
                  동일 규격 버스 대수는 무제한이므로 단순 버스 부족이 원인은 아닙니다.
                  1·2지망 데이터와 목적지별 배차 가능 조건을 확인해주세요.
                </p>
                {currentJob.error_message && (
                  <small>{formatExactAllocationErrorMessage(currentJob.error_message)}</small>
                )}
              </div>
            </div>
          )}
          {!calculationViewReset &&
            currentJob?.status === 'FAILED' &&
            currentJob.error_message && (
            <div className={styles.warningList}>
              <div className={styles.warning}>
                <strong>계산 실패</strong>
                <p>{formatExactAllocationErrorMessage(currentJob.error_message)}</p>
              </div>
            </div>
          )}
          {activeJob && calculationError && (
            <div className={styles.calculationError} role="alert">
              <TriangleAlert size={15} />
              <span>{calculationError}</span>
            </div>
          )}
          {activeJob && detailedBalanceError && (
            <div className={styles.calculationError} role="alert">
              <TriangleAlert size={15} />
              <span>{detailedBalanceError}</span>
            </div>
          )}

          {workerClaimDelayed && (
            <div className={styles.calculationError} role="alert">
              <TriangleAlert size={15} />
              <span>
                {executionMode === 'local'
                  ? '로컬 Worker가 30초 이상 작업을 가져가지 못했습니다. Worker 실행 상태와 Supabase 연결 설정을 확인해주세요.'
                  : 'Cloud Run Worker가 30초 이상 시작되지 않았습니다. Launcher 배포 상태와 Cloud Run Job 설정을 확인해주세요.'}
              </span>
            </div>
          )}

          {!activeJob && (
          <>
          {!loading && !hasSingleBusOption && (
            <div className={`${styles.warning} ${styles.busOptionWarning}`}>
              <span>
                {busOptionCount === 0
                  ? '계산에 사용할 버스 옵션을 한 개 등록해주세요.'
                  : `계산하려면 버스 옵션을 하나만 남겨주세요. 현재 ${busOptionCount.toLocaleString()}개가 등록되어 있습니다.`}
              </span>
              <button
                className={styles.warningAction}
                type="button"
                onClick={() => navigate('/admin/settings?detail=bus-options')}
              >
                버스 옵션 관리 <ArrowRight size={15} />
              </button>
            </div>
          )}

          <div className={styles.recommendedSetting}>
            <div>
              <strong>권장 최소 탑승 인원</strong>
              <p>
                이 인원 미만으로 탑승하는 버스가 생기지 않도록 계산 기준으로 사용합니다.
              </p>
            </div>
            <div className={styles.recommendedSettingEditor}>
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
                className={styles.secondary}
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
                {savingConfig ? '저장 중...' : '저장'}
              </button>
            </div>
            {recommendedMinimumInvalid && (
              <small className={styles.fieldError}>
                1명 이상, 버스 정원 {config.capacity.toLocaleString()}명 이하로 입력해주세요.
              </small>
            )}
            {configSaved && (
              <small className={styles.saveSuccess} role="status">
                <CheckCircle2 size={14} /> 저장했습니다.
              </small>
            )}
          </div>

          <div className={styles.executionModePanel}>
            <div>
              <strong>계산 위치</strong>
            </div>
            <div className={styles.executionModeOptions}>
              <div
                className={`${styles.executionModeOption} ${
                  executionMode === 'cloud' ? styles.selectedMode : ''
                }`}
              >
                <label className={styles.executionModeChoice}>
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
                    <small>서버에서 계산</small>
                  </span>
                </label>
              </div>
              <div
                className={`${styles.executionModeOption} ${
                  executionMode === 'local' ? styles.selectedMode : ''
                }`}
              >
                <label className={styles.executionModeChoice}>
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
                    <small>이 PC의 Worker로 계산</small>
                  </span>
                </label>
                {executionMode === 'local' && (
                  <details
                    className={`${styles.installGuide} ${styles.embeddedInstallGuide}`}
                  >
                    <summary>
                      <span>
                        <strong>다른 노트북에서 계산하기</strong>
                      </span>
                      <em>설치 안내</em>
                    </summary>
                    <div className={styles.installGuideBody}>
                      <div className={styles.installNotice}>
                        <strong>보안 주의</strong>
                        <p>
                          로컬 워커에는 관리자급 비밀키인{' '}
                          <code>SUPABASE_SERVICE_ROLE_KEY</code>가 필요합니다. 신뢰할 수
                          있는 관리자 노트북에만 설치하고, 키를 메신저나 공개 저장소에
                          올리지 마세요. 현재 설치 파일은 코드서명되지 않아 Windows 보안
                          경고가 표시될 수 있습니다.
                        </p>
                      </div>
                      <ol className={styles.installSteps}>
                        <li>
                          <strong>설치 프로그램 다운로드</strong>
                          <p>
                            아래 버튼으로 설치 프로그램을 받은 뒤 실행합니다. Node.js,
                            Python, 프로젝트 소스 코드는 따로 설치할 필요가 없습니다.
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
                            설치 창에서 <code>1</code>을 입력하고, 시스템 관리자로부터
                            전달받은 Supabase URL과 service-role 키를 입력합니다. URL은
                            <code>https://프로젝트참조.supabase.co</code> 형식으로
                            입력하고, 대시보드 주소나 <code>/rest/v1</code> 경로는 붙이지
                            않습니다. 기존 JWT 키와 <code>sb_secret_...</code> 형식의 새
                            비밀 키를 모두 사용할 수 있습니다.
                          </p>
                        </li>
                        <li>
                          <strong>설치 완료</strong>
                          <p>
                            연결 확인 후 워커가 바로 실행되며, 다음 Windows 로그인부터
                            자동으로 실행됩니다.
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
                        여러 노트북에서 워커를 실행해도 하나의 계산 작업은 한 대만
                        선점합니다. 설치 프로그램은 현재 Windows 사용자 계정에만 설치되며
                        관리자 권한을 요구하지 않습니다.
                      </p>
                    </div>
                  </details>
                )}
              </div>
            </div>
          </div>
          <div className={styles.calculationReadiness}>
            <article>
              <span>버스 옵션</span>
              <strong>
                {loading
                  ? '확인 중'
                  : hasSingleBusOption
                    ? `정원 ${config.capacity.toLocaleString()}명`
                    : '설정 필요'}
              </strong>
            </article>
            <article>
              <span>권장 최소 탑승 인원</span>
              <strong>{config.recommended_minimum_passengers.toLocaleString()}명</strong>
            </article>
            <article>
              <span>계산 위치</span>
              <strong>{executionMode === 'cloud' ? 'Cloud Run' : '로컬 Worker'}</strong>
            </article>
          </div>
          <div className={styles.calculationStartArea}>
            <button
              className={styles.primary}
              type="button"
              disabled={calculationStartDisabledReason !== null}
              title={calculationStartDisabledReason ?? undefined}
              onClick={handleStart}
            >
              <Play size={16} />
              {starting ? '계산 작업 생성 중...' : '최적해 계산 시작'}
            </button>
            {calculationStartDisabledReason && (
              <p className={styles.actionDisabledReason}>
                <TriangleAlert size={15} />
                {calculationStartDisabledReason}
              </p>
            )}
            {calculationError && (
              <div className={styles.calculationError} role="alert">
                <TriangleAlert size={15} />
                <span>{calculationError}</span>
              </div>
            )}
          </div>
          </>
          )}

          {activeJob && currentJob && (
            <>
              <div className={styles.jobTitle}>
                <div>
                  <p className={styles.muted}>
                    {reusedResult
                      ? '신청 정보와 버스 설정의 변동이 없어 이전에 증명된 최적해를 즉시 불러왔습니다.'
                      : currentJob.status === 'OPTIMAL'
                      ? currentJob.optimization_scope === 'BASELINE'
                        ? '최저비용 기본 배차가 완료되었습니다. 지금 배차 초안을 생성해 확정할 수 있습니다.'
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
                    <strong>계산 이후 신청 변동이 있습니다</strong>
                    <p>
                      계산 당시 활성 신청{' '}
                      {currentJob.snapshot_active_reservation_count ?? '확인 불가'}명,
                      현재 {currentJob.current_active_reservation_count}명입니다.
                      인원수가 같아도 신청 정보나 상태가 변경되었을 수 있으니
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
                      동일한 신청 스냅샷의 검증된 결과를 가져왔습니다. Python
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
                  <span>{waitingForWorker ? '워커 대기 시간' : '계산 시간'}</span>
                  <strong>
                    {reusedResult
                      ? '계산 생략'
                      : formatElapsedTime(displayedElapsedSeconds)}
                  </strong>
                </article>
                <article>
                  <span>증명된 최저 대수</span>
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
                  <div className={styles.detailedBalanceActions}>
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
                    {detailedBalanceError && (
                      <div className={styles.calculationError} role="alert">
                        <TriangleAlert size={15} />
                        <span>{detailedBalanceError}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
        ) : null}

        {optimalResult && (
          <section
            className={`${styles.section} ${styles.calculationCompleted}`}
            id="optimization"
          >
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.calculationStateBadge}>계산 후</span>
                <h2><CheckCircle2 size={18} /> 최적해 계산 완료</h2>
                <p className={styles.muted}>
                  {currentJob?.optimization_scope === 'BASELINE'
                    ? '최소 버스 수와 최소 2지망 인원이 증명되었습니다. 상세 균형을 기다리지 않고 지금 배차 초안을 생성할 수 있습니다.'
                    : '최저비용 조건을 유지하면서 캠퍼스·팀·탑승 인원 상세 균형까지 계산한 결과입니다.'}
                </p>
              </div>
              <div className={styles.calculationActions}>
                <div className={styles.actions}>
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={resetting || recentJobs.length === 0}
                    onClick={handleReset}
                  >
                    <RotateCcw size={15} /> {resetting ? '리셋 중...' : '계산 기록 리셋'}
                  </button>
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={calculationStartDisabledReason !== null}
                    title={calculationStartDisabledReason ?? undefined}
                    onClick={handleStart}
                  >
                    <Play size={15} /> {starting ? '계산 작업 생성 중...' : '다시 계산'}
                  </button>
                </div>
                {calculationError && (
                  <div className={styles.calculationError} role="alert">
                    <TriangleAlert size={15} />
                    <span>{calculationError}</span>
                  </div>
                )}
                {calculationStartDisabledReason && (
                  <p className={styles.actionDisabledReason}>
                    <TriangleAlert size={15} />
                    {calculationStartDisabledReason}
                  </p>
                )}
              </div>
            </div>
            {reservationsChanged && (
              <div className={styles.reservationChangeNotice}>
                <TriangleAlert size={22} />
                <div>
                  <strong>계산 이후 신청 변동이 있습니다</strong>
                  <p>
                    이 결과로 배차 초안을 생성할 수 없습니다. 최신 신청 정보를
                    반영하려면 다시 계산해주세요.
                  </p>
                </div>
              </div>
            )}
            {reusedResult && (
              <div className={styles.reusedResultNotice}>
                <CheckCircle2 size={22} />
                <div>
                  <strong>저장된 최적해를 즉시 불러왔습니다</strong>
                  <p>신청 정보와 버스 설정이 같아 최적화 계산 단계를 생략했습니다.</p>
                </div>
              </div>
            )}
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
                    {formatWarningMessage(warning)}
                  </div>
                ))}
              </div>
            )}
            <div className={styles.draftCreator}>
              {linkedWorkspaceId ? (
                <button
                  className={styles.primary}
                  type="button"
                  onClick={() =>
                    navigate(`/admin/allocations/workspace?id=${linkedWorkspaceId}`)
                  }
                >
                  완료된 배차 초안으로 이동
                </button>
              ) : (
                <>
                  <label>
                    배차 초안 이름
                    <input
                      value={allocationName}
                      onChange={(event) => setAllocationName(event.target.value)}
                      placeholder="예: 1차 귀가버스 정확 최적 배차안"
                    />
                  </label>
                  <button
                    className={styles.primary}
                    type="button"
                    disabled={draftCreationDisabledReason !== null}
                    title={draftCreationDisabledReason ?? undefined}
                    aria-describedby={
                      draftCreationDisabledReason
                        ? 'draft-creation-disabled-reason'
                        : undefined
                    }
                    onClick={handleCreateDraft}
                  >
                    {loadingLinkedWorkspace
                      ? '연결된 배차안 확인 중...'
                      : creatingDraft
                        ? '검증 및 생성 중...'
                        : '배차 초안 생성'}
                  </button>
                  {draftCreationDisabledReason && (
                    <p
                      className={styles.draftDisabledReason}
                      id="draft-creation-disabled-reason"
                    >
                      <TriangleAlert size={15} />
                      <span>
                        <strong>현재 생성할 수 없는 이유</strong>
                        {draftCreationDisabledReason}
                      </span>
                    </p>
                  )}
                </>
              )}
            </div>
            <div className={styles.detailedBalancePanel}>
              <div>
                <span className={styles.optionalBadge}>선택 단계</span>
                <h3>
                  {currentJob?.optimization_scope === 'DETAILED'
                    ? '상세 균형 이어서 최적화'
                    : '상세 균형 최적화'}
                </h3>
                <p className={styles.muted}>
                  최저비용과 최소 2지망 인원을 유지한 채 캠퍼스·팀·버스별 탑승
                  균형을 추가로 계산합니다.
                </p>
                <details className={styles.balanceSettings}>
                  <summary>상세 균형 계산 설정</summary>
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
                </details>
              </div>
              <div className={styles.detailedBalanceActions}>
                <button
                  className={styles.secondary}
                  type="button"
                  disabled={startingDetailedBalance || reservationsChanged}
                  title={
                    reservationsChanged
                      ? '계산 이후 신청 정보가 변경되어 상세 균형 계산을 실행할 수 없습니다.'
                      : undefined
                  }
                  onClick={handleStartDetailedBalance}
                >
                  {startingDetailedBalance
                    ? '상세 균형 작업 생성 중...'
                    : currentJob?.optimization_scope === 'DETAILED'
                      ? '설정대로 이어서 계산'
                      : '상세 균형 최적화 실행'}
                </button>
                {detailedBalanceError && (
                  <div className={styles.calculationError} role="alert">
                    <TriangleAlert size={15} />
                    <span>{detailedBalanceError}</span>
                  </div>
                )}
              </div>
            </div>
            <details className={styles.calculationDetails}>
              <summary>계산 상세 보기</summary>
              <div className={styles.calculationDetailGrid}>
                <article>
                  <span>계산 유형</span>
                  <strong>
                    {currentJob?.optimization_scope === 'DETAILED'
                      ? '상세 균형'
                      : '기본 최저비용'}
                  </strong>
                </article>
                <article>
                  <span>소요 시간</span>
                  <strong>
                    {reusedResult
                      ? '계산 생략'
                      : formatElapsedTime(displayedElapsedSeconds)}
                  </strong>
                </article>
                <article>
                  <span>작업 상태</span>
                  <strong>{reusedResult ? '즉시 재사용' : currentJob?.status}</strong>
                </article>
              </div>
            </details>
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
                disabled={resetting}
                onClick={() => {
                  const requestRevision = jobsStateRevisionRef.current;
                  void getExactAllocationJob(job.id).then((detail) => {
                    if (
                      detail &&
                      requestRevision === jobsStateRevisionRef.current
                    ) {
                      setCalculationViewReset(false);
                      setCurrentJob(detail);
                    }
                  });
                }}
              >
                <strong>
                  {job.optimization_scope === 'DETAILED' ? '상세 균형' : '기본 최저비용'}
                  {' · '}
                  {job.result_reused && !job.reservations_changed
                    ? '즉시 재사용'
                    : job.status}{' '}
                  ·{' '}
                  {job.proven_bus_count ?? '-'}대
                  {job.reservations_changed && ' · 신청 변동'}
                </strong>
                <div className={styles.historyMeta}>
                  <span>{new Date(job.requested_at).toLocaleString('ko-KR')}</span>
                  <span>
                    {job.result_reused && !job.reservations_changed
                      ? '저장된 최적해 사용 · 계산 생략'
                      : `소요 ${formatElapsedTime(getRecordedElapsedSeconds(job))}`}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
        </div>
      </main>
      {manualDraftModalOpen && (
        <div className={styles.modalBackdrop} onMouseDown={closeManualDraftModal}>
          <section
            className={styles.manualDraftModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-draft-modal-title"
            aria-describedby="manual-draft-modal-description"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <div>
                <span className={styles.modalIcon}>
                  <FilePlus2 size={19} />
                </span>
                <div>
                  <h2 id="manual-draft-modal-title">수동 배차 초안 생성</h2>
                  <p id="manual-draft-modal-description">
                    버스 없이 시작하며, 현재 활성 신청자는 모두 미배차 상태로
                    추가됩니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="닫기"
                disabled={creatingManualDraft}
                onClick={closeManualDraftModal}
              >
                <X size={18} />
              </button>
            </header>
            <form
              className={styles.manualDraftForm}
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreateManualDraft();
              }}
            >
              <label>
                배차 초안 이름
                <input
                  autoFocus
                  maxLength={100}
                  placeholder="예: 1차 수동 배차안"
                  value={manualDraftName}
                  onChange={(event) => {
                    setManualDraftName(event.target.value);
                    setManualDraftError(null);
                  }}
                />
              </label>
              {manualDraftError && (
                <div className={styles.modalError} role="alert">
                  {manualDraftError}
                </div>
              )}
              <footer className={styles.modalFooter}>
                <button
                  className={styles.secondary}
                  type="button"
                  disabled={creatingManualDraft}
                  onClick={closeManualDraftModal}
                >
                  취소
                </button>
                <button
                  className={styles.primary}
                  type="submit"
                  disabled={creatingManualDraft || !manualDraftName.trim()}
                >
                  {creatingManualDraft ? '생성 중...' : '생성 후 편집하기'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {resetDialogOpen && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !resetting) {
              setResetDialogOpen(false);
            }
          }}
        >
          <section
            className={styles.resetDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="exact-allocation-reset-title"
            aria-describedby="exact-allocation-reset-description"
          >
            <span className={styles.resetDialogIcon} aria-hidden="true">
              <RotateCcw size={24} />
            </span>
            <p className={styles.resetDialogEyebrow}>최적화 계산 기록 리셋</p>
            <h2 id="exact-allocation-reset-title">
              계산 기록과 재사용 캐시를 삭제할까요?
            </h2>
            <p id="exact-allocation-reset-description">
              완료되거나 실패한 최적화 계산 기록과 재사용 캐시를 삭제합니다.
              이미 생성된 배차 초안과 확정 배차안은 유지됩니다.
            </p>
            <dl className={styles.resetDialogSummary}>
              <div>
                <dt>계산 기록</dt>
                <dd>{recentJobs.length.toLocaleString()}건 삭제 대상</dd>
              </div>
              <div>
                <dt>배차 초안</dt>
                <dd>{draftWorkspaces.length.toLocaleString()}개 유지</dd>
              </div>
              <div>
                <dt>확정 배차안</dt>
                <dd>{confirmedWorkspaces.length.toLocaleString()}개 유지</dd>
              </div>
              <div>
                <dt>진행 중 계산</dt>
                <dd>{activeJob ? `${currentJob?.status ?? '실행 중'} · 먼저 취소 필요` : '없음'}</dd>
              </div>
              <div>
                <dt>리셋 후 상태</dt>
                <dd>새 최적화 계산 가능</dd>
              </div>
            </dl>
            {activeJob && (
              <div className={styles.resetDialogWarning}>
                <TriangleAlert size={18} aria-hidden="true" />
                <span>
                  진행 중인 계산을 먼저 취소하고 완료 상태를 확인한 뒤 리셋해주세요.
                </span>
              </div>
            )}
            {resetDialogError && (
              <p className={styles.resetDialogError} role="alert">
                {resetDialogError}
              </p>
            )}
            <div className={styles.resetDialogActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setResetDialogOpen(false)}
                disabled={resetting}
                autoFocus
              >
                기록 유지
              </button>
              <button
                type="button"
                className={styles.danger}
                onClick={() => void confirmReset()}
                disabled={resetting || activeJob}
              >
                {resetting ? (
                  <>
                    <LoaderCircle className={styles.resetSpinner} size={17} />
                    리셋 중...
                  </>
                ) : (
                  <>
                    <RotateCcw size={17} />
                    계산 기록 리셋
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminExactAllocationPage;
