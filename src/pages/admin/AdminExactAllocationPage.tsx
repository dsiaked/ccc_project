import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, LoaderCircle, Play, Square } from 'lucide-react';
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
  saveExactAllocationOptimizerConfig,
  type ExactAllocationJob,
  type ExactAllocationOptimizerConfig,
} from '../../lib/admin/exactAllocationOptimizationService';
import styles from './AdminExactAllocationPage.module.css';

const activeStatuses = new Set(['PENDING', 'RUNNING', 'CANCEL_REQUESTED']);

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

type PhaseGroupState = 'completed' | 'current' | 'pending' | 'halted';

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const getRecordedElapsedSeconds = (job: ExactAllocationJob) => {
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
};

const AdminExactAllocationPage = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState(initialConfig);
  const [currentJob, setCurrentJob] = useState<ExactAllocationJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<ExactAllocationJob[]>([]);
  const [busOptionCount, setBusOptionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [starting, setStarting] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [linkedWorkspace, setLinkedWorkspace] = useState<{
    jobId: string;
    workspaceId: string | null;
  } | null>(null);
  const [startingDetailedBalance, setStartingDetailedBalance] = useState(false);
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
      const [nextConfig, busOptions] = await Promise.all([
        getExactAllocationOptimizerConfig(),
        getExactAllocationBusOptions(),
        loadRecentJobs(),
      ]);
      setBusOptionCount(busOptions.length);
      const busOption = busOptions[0];
      setConfig({
        ...nextConfig,
        capacity: busOption?.capacity ?? nextConfig.capacity,
        price: busOption?.estimated_price ?? nextConfig.price,
        recommended_minimum_passengers: Math.min(
          nextConfig.recommended_minimum_passengers,
          busOption?.capacity ?? nextConfig.capacity
        ),
      });
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
  const linkedWorkspaceId =
    linkedWorkspace && linkedWorkspace.jobId === currentJob?.id
      ? linkedWorkspace.workspaceId
      : null;
  const loadingLinkedWorkspace =
    currentJob?.status === 'OPTIMAL' &&
    linkedWorkspace?.jobId !== currentJob.id;
  const hasSingleBusOption = busOptionCount === 1;
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

  const handleSaveConfig = async () => {
    if (!hasSingleBusOption) {
      setError('버스 옵션 관리에서 버스 옵션을 하나만 등록해주세요.');
      return;
    }
    setSavingConfig(true);
    setError(null);
    try {
      setConfig(await saveExactAllocationOptimizerConfig(config));
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
    setStarting(true);
    setError(null);
    try {
      await saveExactAllocationOptimizerConfig(config);
      const jobId = await createExactAllocationJob();
      const job = await getExactAllocationJob(jobId);
      if (job) setCurrentJob(job);
      await launchExactAllocationJob(jobId);
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
      navigate(`/admin/allocation/workspace?id=${row.id}`);
    } catch (draftError) {
      const existing = await getAllocationWorkspaceForExactJob(currentJob.id)
        .catch(() => null);
      if (existing) {
        navigate(`/admin/allocation/workspace?id=${existing.id}`);
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
      const jobId = await createDetailedBalanceJob(currentJob.id);
      const job = await getExactAllocationJob(jobId);
      if (job) setCurrentJob(job);
      await launchExactAllocationJob(jobId);
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
            <h1>최저비용 배차</h1>
            <p>
              모든 승객을 1·2지망 안에서 배차하며, 최저 버스 대수가 수학적으로
              증명된 결과만 사용합니다.
            </p>
          </div>
          <span className={styles.proofBadge}>
            로컬 Python Worker · OPTIMAL 증명 필수
          </span>
        </header>

        {error && <div className={styles.error}>{error}</div>}

        <section className={styles.section}>
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
                onClick={() => navigate('/admin/setup-check?detail=bus-options')}
              >
                버스 옵션 관리
              </button>
              <button
                className={styles.secondary}
                type="button"
                disabled={loading || savingConfig || Boolean(activeJob) || !hasSingleBusOption}
                onClick={handleSaveConfig}
              >
                {savingConfig ? '저장 중...' : '권장 인원 저장'}
              </button>
            </div>
          </div>
          {!loading && !hasSingleBusOption && (
            <div className={styles.warning}>
              {busOptionCount === 0
                ? '등록된 버스 옵션이 없습니다. 버스 옵션 관리에서 한 개를 등록해주세요.'
                : `버스 옵션이 ${busOptionCount.toLocaleString()}개 등록되어 있습니다. 단일 버스 계산을 위해 하나만 남겨주세요.`}
            </div>
          )}
          <div className={styles.configGrid}>
            <label>
              버스 정원
              <input
                type="number"
                min="1"
                disabled
                value={config.capacity}
              />
            </label>
            <label>
              대당 예상 비용
              <input
                type="number"
                min="0"
                disabled
                value={config.price}
              />
            </label>
            <label>
              권장 최소 탑승 인원
              <input
                type="number"
                min="1"
                disabled={Boolean(activeJob)}
                value={config.recommended_minimum_passengers}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    recommended_minimum_passengers: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>최적해 계산</h2>
              <p className={styles.muted}>
                이 PC에서 로컬 Python Worker가 실행 중이면 브라우저를 닫아도 계산이 계속됩니다.
              </p>
            </div>
            <div className={styles.actions}>
              {activeJob ? (
                <button className={styles.danger} type="button" onClick={handleCancel}>
                  <Square size={14} /> 계산 취소
                </button>
              ) : (
                <button
                  className={styles.primary}
                  type="button"
                  disabled={starting || loading || !hasSingleBusOption}
                  onClick={handleStart}
                >
                  <Play size={15} /> {starting ? '시작 중...' : '정확 계산 시작'}
                </button>
              )}
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
                    {currentJob.status === 'OPTIMAL'
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
                <span className={styles.jobStatus}>{currentJob.status}</span>
              </div>
              <div className={styles.progressTrack}>
                <span style={{ width: `${currentJob.progress}%` }} />
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
              <div className={styles.metricGrid}>
                <article>
                  <span>진행률</span>
                  <strong>{currentJob.progress}%</strong>
                </article>
                <article>
                  <span>경과 시간</span>
                  <strong>{displayedElapsedSeconds.toLocaleString()}초</strong>
                </article>
                <article>
                  <span>현재 최저</span>
                  <strong>
                    {currentJob.best_known_bus_count === null
                      ? '-'
                      : `${currentJob.best_known_bus_count}대`}
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
              {currentJob.optimization_scope === 'BASELINE' && (
                <div className={styles.detailedBalancePanel}>
                  <div>
                    <span className={styles.optionalBadge}>선택 단계</span>
                    <h3>상세 균형 최적화</h3>
                    <p className={styles.muted}>
                      최저비용과 최소 2지망 인원을 유지한 채 캠퍼스 분산,
                      캠퍼스별 인원 균형, 팀 분산, 버스별 탑승 균형을 추가로 계산합니다.
                    </p>
                  </div>
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={
                      currentJob.status !== 'OPTIMAL' ||
                      startingDetailedBalance ||
                      Boolean(activeJob)
                    }
                    onClick={handleStartDetailedBalance}
                  >
                    {startingDetailedBalance
                      ? '상세 균형 작업 생성 중...'
                      : currentJob.status === 'OPTIMAL'
                        ? '상세 균형 최적화 실행'
                        : '기본 계산 완료 후 실행 가능'}
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
                  <strong>{bus.label} · {bus.destination}</strong>
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
                    navigate(`/admin/allocation/workspace?id=${linkedWorkspaceId}`)
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
                      !allocationName.trim()
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
                  {job.status} · {job.proven_bus_count ?? '-'}대
                </strong>
                <div className={styles.historyMeta}>
                  <span>{new Date(job.requested_at).toLocaleString('ko-KR')}</span>
                  <span>
                    소요 {getRecordedElapsedSeconds(job).toLocaleString()}초
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminExactAllocationPage;
