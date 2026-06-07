import { supabase } from '../supabase';
import type { AllocationWorkspaceRow } from './allocationWorkspaceService';

export interface ExactAllocationOptimizerConfig {
  capacity: number;
  price: number;
  recommended_minimum_passengers: number;
}

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
  result?: ExactAllocationResult | null;
  diagnostics?: Record<string, unknown> | null;
  error_message: string | null;
}

const single = <T,>(data: T[] | T | null): T | null =>
  Array.isArray(data) ? (data[0] ?? null) : data;

const throwAllocationWriteError = (error: { message?: string }) => {
  if (
    error.message?.includes(
      'Allocation is available only after the reservation deadline.'
    )
  ) {
    throw new Error('신청 마감 후에만 배차를 진행할 수 있습니다.');
  }
  throw error;
};

export const getExactAllocationOptimizerConfig = async () => {
  const { data, error } = await supabase.rpc('get_allocation_optimizer_config');
  if (error) throw error;
  return data as unknown as ExactAllocationOptimizerConfig;
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
  return data as unknown as ExactAllocationOptimizerConfig;
};

export const createExactAllocationJob = async (
  executionMode: ExactAllocationExecutionMode
) => {
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

export const launchExactAllocationJob = async (
  jobId: string,
  executionMode: ExactAllocationExecutionMode
) => {
  if (executionMode === 'local') {
    return { jobId, workerId: 'local-worker', operationName: null };
  }
  const { data, error } = await supabase.functions.invoke(
    'allocation-optimizer-launcher',
    { body: { jobId } }
  );
  if (error) throw error;
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
  const { data, error } = await supabase.rpc(
    'reset_allocation_optimization_jobs'
  );
  if (error) throw error;
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
