import { supabase } from '../supabase';
import type { AllocationWorkspaceRow } from './allocationWorkspaceService';
import {
  normalizeExactAllocationOptimizerConfig,
  type ExactAllocationOptimizerConfig,
} from './exactAllocationOptimizerConfig';

export type { ExactAllocationOptimizerConfig } from './exactAllocationOptimizerConfig';

export interface ExactAllocationBusOption {
  id: string;
  capacity: number;
  estimated_price: number;
  max_count: number | null;
  notes: string | null;
}

export type ExactAllocationJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'OPTIMAL'
  | 'INFEASIBLE'
  | 'FAILED';

export type ExactAllocationExecutionMode = 'cloud' | 'local';

export interface ExactAllocationWarning {
  code: string;
  message: string;
  destination: string | null;
  passenger_ids: string[];
}

export interface ExactAllocationBus {
  bus_id: string;
  label: string;
  destination: string;
  capacity: number;
  price: number;
  passenger_ids: string[];
}

export interface ExactAllocationResult {
  status: ExactAllocationJobStatus;
  total_buses: number;
  total_cost: number;
  second_choice_count: number;
  buses: ExactAllocationBus[];
  warnings: ExactAllocationWarning[];
  objectives: Array<{ name: string; value: number }>;
}

export interface ExactAllocationJob {
  id: string;
  optimization_scope: 'BASELINE' | 'DETAILED';
  source_job_id: string | null;
  resume_from_job_id: string | null;
  detailed_settings: { skipped_phases?: string[] };
  status: ExactAllocationJobStatus;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  progress: number;
  current_phase: string | null;
  elapsed_seconds: number;
  best_known_bus_count: number | null;
  proven_bus_count: number | null;
  result_reused: boolean;
  reservations_changed: boolean;
  snapshot_active_reservation_count: number | null;
  current_active_reservation_count: number;
  result?: ExactAllocationResult | null;
  diagnostics?: Record<string, unknown> | null;
  error_message: string | null;
}

const single = <T,>(data: T[] | T | null): T | null =>
  Array.isArray(data) ? (data[0] ?? null) : data;

type AllocationRpcError = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

const getAllocationErrorDetail = (error: AllocationRpcError) =>
  [error.message, error.details, error.hint]
    .filter((value): value is string => Boolean(value))
    .join(' ');

const requireAllocationAdminSession = async () => {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw new Error('관리자 로그인 세션이 만료되었습니다. 다시 로그인해주세요.');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(
    data.session.access_token
  );
  if (userError || !userData.user) {
    throw new Error('관리자 로그인 세션이 만료되었습니다. 다시 로그인해주세요.');
  }

  return data.session.access_token;
};

const throwAllocationWriteError = (error: AllocationRpcError) => {
  if (
    error.message?.includes(
      'Allocation is available only after the reservation deadline.'
    )
  ) {
    throw new Error('신청 마감 후에만 배차를 진행할 수 있습니다.');
  }
  if (
    error.message?.includes(
      'Cancel the confirmed allocation before using allocation planning.'
    )
  ) {
    throw new Error('확정 배차를 먼저 취소한 뒤 최적해 계산을 진행해주세요.');
  }
  if (
    error.message?.includes(
      'Only global admins can create allocation optimization jobs.'
    ) ||
    error.message?.includes('Only global admins can create detailed allocation jobs.')
  ) {
    throw new Error('전체 관리자 권한을 확인할 수 없습니다. 다시 로그인해주세요.');
  }
  if (
    error.message?.includes(
      'record "new" has no field "allocation_data"'
    )
  ) {
    throw new Error(
      '배차 계산용 DB 트리거 업데이트가 필요합니다. 최신 Supabase 마이그레이션을 적용해주세요.'
    );
  }
  const detail = getAllocationErrorDetail(error);
  throw new Error(detail || error.code || '배차 계산 요청에 실패했습니다.');
};

const throwAllocationResetError = (error: AllocationRpcError) => {
  const detail = getAllocationErrorDetail(error);

  if (detail.includes('Cancel the active allocation optimization job')) {
    throw new Error('진행 중인 계산을 먼저 취소한 뒤 다시 리셋해주세요.');
  }
  if (detail.includes('Only global admins can reset allocation optimization jobs')) {
    throw new Error('계산 기록은 전체 관리자만 리셋할 수 있습니다. 다시 로그인해 권한을 확인해주세요.');
  }
  if (error.code === 'PGRST202') {
    throw new Error('계산 리셋 DB 업데이트가 적용되지 않았습니다. 최신 Supabase 마이그레이션을 적용해주세요.');
  }
  if (detail.includes('violates foreign key constraint')) {
    throw new Error('연결된 계산 기록을 정리하지 못했습니다. 최신 Supabase 마이그레이션을 적용해주세요.');
  }

  throw new Error(detail || error.code || '계산 기록 리셋에 실패했습니다.');
};

export const getExactAllocationOptimizerConfig = async () => {
  const { data, error } = await supabase.rpc('get_allocation_optimizer_config');
  if (error) throw error;
  return normalizeExactAllocationOptimizerConfig(data);
};

export const getExactAllocationBusOptions = async () => {
  const { data, error } = await supabase
    .from('bus_options')
    .select('id, capacity, estimated_price, max_count, notes')
    .order('capacity', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ExactAllocationBusOption[];
};

export const saveExactAllocationOptimizerConfig = async (
  config: ExactAllocationOptimizerConfig
) => {
  const { data, error } = await supabase.rpc('save_allocation_optimizer_config', {
    p_capacity: config.capacity,
    p_price: config.price,
    p_recommended_minimum_passengers:
      config.recommended_minimum_passengers,
  });
  if (error) throw error;
  return normalizeExactAllocationOptimizerConfig(data, config);
};

export const createExactAllocationJob = async (
  executionMode: ExactAllocationExecutionMode
) => {
  await requireAllocationAdminSession();
  const { data, error } = await supabase.rpc(
    'create_allocation_optimization_job_for_execution',
    { p_execution_mode: executionMode }
  );
  if (error) throwAllocationWriteError(error);
  return data as unknown as string;
};

export const createDetailedBalanceJob = async (
  sourceJobId: string,
  skippedPhases: string[],
  resumeFromJobId: string | null,
  executionMode: ExactAllocationExecutionMode
) => {
  await requireAllocationAdminSession();
  const { data, error } = await supabase.rpc(
    'create_detailed_allocation_optimization_job_for_execution',
    {
      p_source_job_id: sourceJobId,
      p_skipped_phases: skippedPhases,
      p_resume_from_job_id: resumeFromJobId,
      p_execution_mode: executionMode,
    }
  );
  if (error) throwAllocationWriteError(error);
  return data as unknown as string;
};

const getFunctionErrorMessage = async (error: unknown) => {
  if (!error || typeof error !== 'object' || !('context' in error)) return null;

  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return null;

  const body = (await context.clone().json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === 'string' ? body.error : null;
};

export const launchExactAllocationJob = async (
  jobId: string,
  executionMode: ExactAllocationExecutionMode
) => {
  if (executionMode === 'local') {
    return { jobId, workerId: 'local-worker', operationName: null };
  }
  const accessToken = await requireAllocationAdminSession();
  const { data, error } = await supabase.functions.invoke(
    'allocation-optimizer-launcher',
    {
      body: { jobId },
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (error) {
    const functionErrorMessage = await getFunctionErrorMessage(error);
    if (functionErrorMessage) throw new Error(functionErrorMessage);
    throw error;
  }
  if (data?.error) throw new Error(String(data.error));
  return data as { jobId: string; workerId: string; operationName: string | null };
};

export const getExactAllocationJob = async (jobId: string) => {
  const { data, error } = await supabase.rpc('get_allocation_optimization_job', {
    p_job_id: jobId,
  });
  if (error) throw error;
  return single(data as unknown as ExactAllocationJob[]);
};

export const getRecentExactAllocationJobs = async (limit = 20) => {
  const { data, error } = await supabase.rpc(
    'get_recent_allocation_optimization_jobs',
    { p_limit: limit }
  );
  if (error) throw error;
  return (data ?? []) as unknown as ExactAllocationJob[];
};

export const cancelExactAllocationJob = async (jobId: string) => {
  const { data, error } = await supabase.rpc(
    'cancel_allocation_optimization_job',
    { p_job_id: jobId }
  );
  if (error) throw error;
  return data as unknown as ExactAllocationJobStatus;
};

export const resetExactAllocationJobs = async () => {
  await requireAllocationAdminSession();
  const { data, error } = await supabase.rpc(
    'reset_allocation_optimization_jobs'
  );
  if (error) throwAllocationResetError(error);
  return data as unknown as number;
};

export const createDraftFromExactAllocationJob = async (
  jobId: string,
  allocationName: string
) => {
  const { data, error } = await supabase.rpc(
    'create_allocation_draft_from_optimal_job',
    {
      p_job_id: jobId,
      p_allocation_name: allocationName,
    }
  );
  if (error) throwAllocationWriteError(error);
  return data as unknown as AllocationWorkspaceRow;
};

export const getAllocationWorkspaceForExactJob = async (jobId: string) => {
  const { data, error } = await supabase
    .from('bus_allocations')
    .select('id, allocation_name, allocation_data')
    .eq('allocation_data->>sourceOptimizationJobId', jobId)
    .in('allocation_data->>status', ['draft', 'confirmed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as Pick<
    AllocationWorkspaceRow,
    'id' | 'allocation_name' | 'allocation_data'
  > | null;
};
