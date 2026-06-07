import {
  getParticipationTargetsSetting,
  getTotalParticipationTarget,
} from '../participationTargetsService';
import { supabase } from '../supabase';

const MINIMUM_GENERAL_USER_COUNT = 2000;

interface CampusOptionRow {
  campus_id: string;
  district: string | null;
  team: string | null;
  campus: string | null;
}

export interface SimulationCampusPreview {
  key: string;
  campusId: string;
  district: string;
  team: string;
  campus: string;
  generalUserCount: number;
  campusAdminCount: number;
}

export interface SimulationStationPreview {
  stationId: string;
  name: string;
  line: string | null;
  address: string | null;
}

export interface SimulationReferenceConfig {
  applyRecommendedSeed: boolean;
  participationTarget: number;
  busTicketPrice: number;
  campusCount: number;
  selectedCampusIds: string[];
  stationCount: number;
  selectedStationIds: string[];
  busOptions: Array<{ capacity: number; estimatedPrice: number }>;
}

export interface SimulationPreview {
  safety: {
    currentProjectId: string | null;
    allowedProjectId: string | null;
    projectIdMatches: boolean;
    simulationEnabled: boolean;
    isSafeToExecute: boolean;
  };
  referenceSetup: {
    isReady: boolean;
    missing: string[];
  };
  referenceConfig: SimulationReferenceConfig;
  campuses: SimulationCampusPreview[];
  stations: SimulationStationPreview[];
  generalUserCount: number;
  campusAdminCount: number;
  totalAccountCount: number;
  existingSimulationProfileCount: number;
  activeStationCount: number;
  operation: {
    deadlineAt: string | null;
    deadlineClosed: boolean;
    reservations: {
      total: number;
      requested: number;
      confirmed: number;
      cancelled: number;
      ticketed: number;
    };
    payments: {
      total: number;
      pending: number;
      completed: number;
      refunded: number;
      verified: number;
    };
    transfers: {
      total: number;
      sent: number;
      confirmed: number;
    };
    allocations: {
      total: number;
      draft: number;
      confirmed: number;
      confirmedBuses: number;
      confirmedCapacity: number;
      confirmedPassengers: number;
      remainingSeats: number;
    };
  };
}

export const DEFAULT_SIMULATION_REFERENCE_CONFIG: SimulationReferenceConfig = {
  applyRecommendedSeed: true,
  participationTarget: 2500,
  busTicketPrice: 20000,
  campusCount: 47,
  selectedCampusIds: [],
  stationCount: 7,
  selectedStationIds: [],
  busOptions: [{ capacity: 44, estimatedPrice: 700000 }],
};

export interface SimulationStageRun {
  id: string;
  stage: string;
  status: 'running' | 'completed' | 'failed';
  summary: Record<string, unknown>;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

const getProjectId = (url: string | undefined) => {
  try {
    return url ? new URL(url).hostname.split('.')[0] || null : null;
  } catch {
    return null;
  }
};

const normalizeSimulationEnabled = (value: unknown) => {
  if (value === true) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const source = value as Record<string, unknown>;
  return source.enabled === true || source.simulation_enabled === true;
};

const getSettingObject = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const getCount = (result: { count: number | null }) => result.count ?? 0;

const getAllocationArray = (value: unknown, key: 'buses' | 'passengers') => {
  const source = getSettingObject(value);
  return Array.isArray(source[key]) ? source[key] as Record<string, unknown>[] : [];
};

const hashString = (value: string) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const getCampusKey = (row: CampusOptionRow) =>
  `campus|${row.district ?? ''}|${row.team ?? ''}|${row.campus ?? ''}`;

const getCampusDistributionFactor = (key: string) => {
  const tierUnit = hashString(`${key}:distribution-tier`) / 0x100000000;
  const tierFactor =
    tierUnit < 0.15
      ? 0.5
      : tierUnit < 0.45
        ? 0.76
        : tierUnit < 0.78
          ? 1
          : tierUnit < 0.94
            ? 1.35
            : 1.75;
  const jitter = 0.94 + (hashString(`${key}:distribution-jitter`) % 13) / 100;
  return tierFactor * jitter;
};

const allocateGeneralUsers = (
  campuses: CampusOptionRow[],
  targets: Record<string, number>
) => {
  const configuredTotal = campuses.reduce(
    (sum, campus) => sum + Math.max(0, targets[getCampusKey(campus)] ?? 0),
    0
  );
  const total = Math.max(MINIMUM_GENERAL_USER_COUNT, configuredTotal);
  const hasConfiguredTargets = configuredTotal > 0;
  const weights = campuses.map((campus) => {
    const key = getCampusKey(campus);
    const configuredTarget = Math.max(0, targets[key] ?? 0);
    return hasConfiguredTargets
      ? Math.max(1, configuredTarget)
      : 25 * getCampusDistributionFactor(key);
  });
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const allocations = weights.map((weight) =>
    Math.max(1, Math.floor((weight / weightTotal) * total))
  );
  let difference =
    total - allocations.reduce((sum, allocation) => sum + allocation, 0);
  let index = 0;

  while (difference !== 0 && allocations.length > 0) {
    const direction = difference > 0 ? 1 : -1;
    const targetIndex = index % allocations.length;
    if (direction > 0 || allocations[targetIndex] > 1) {
      allocations[targetIndex] += direction;
      difference -= direction;
    }
    index += 1;
  }

  return allocations;
};

export async function getSimulationPreview(): Promise<SimulationPreview> {
  const [
    campusResult,
    targetSetting,
    enabledResult,
    simulationProfileResult,
    activeStationResult,
    simulationBusOptionResult,
    setupSettingResult,
    reservationResult,
    requestedReservationResult,
    confirmedReservationResult,
    cancelledReservationResult,
    ticketedReservationResult,
    paymentResult,
    pendingPaymentResult,
    completedPaymentResult,
    refundedPaymentResult,
    verifiedPaymentResult,
    transferResult,
    sentTransferResult,
    confirmedTransferResult,
    allocationResult,
    draftAllocationResult,
    confirmedAllocationResult,
  ] = await Promise.all([
    supabase
      .from('campus_options')
      .select('campus_id, district, team, campus')
      .order('district', { ascending: true })
      .order('team', { ascending: true })
      .order('campus', { ascending: true }),
    getParticipationTargetsSetting(),
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'simulation_enabled')
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .like('email', 'sim-%@ccc-bus.test'),
    supabase
      .from('stations')
      .select('id,name,line,address', { count: 'exact' })
      .eq('is_active', true)
      .order('sort_order')
      .order('name'),
    supabase
      .from('bus_options')
      .select('capacity,estimated_price', { count: 'exact' })
      .like('notes', 'SIM-%'),
    supabase
      .from('app_settings')
      .select('key,value')
      .in('key', [
        'bus_ticket_price',
        'seoul_district_transfer_account',
        'first_reservation_deadline',
        'global_scenario_checklist',
        'simulation_reference_scope',
      ]),
    supabase.from('reservations').select('id', { count: 'exact', head: true }),
    supabase.from('reservations').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
    supabase.from('reservations').select('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
    supabase.from('reservations').select('id', { count: 'exact', head: true }).eq('status', 'cancelled'),
    supabase.from('reservations').select('id', { count: 'exact', head: true }).not('confirmed_ticket', 'is', null),
    supabase.from('payments').select('id', { count: 'exact', head: true }),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'refunded'),
    supabase.from('payments').select('id', { count: 'exact', head: true }).not('verified_at', 'is', null),
    supabase.from('campus_transfers').select('id', { count: 'exact', head: true }),
    supabase.from('campus_transfers').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
    supabase.from('campus_transfers').select('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
    supabase.from('bus_allocations').select('id', { count: 'exact', head: true }),
    supabase.from('bus_allocations').select('id', { count: 'exact', head: true }).filter('allocation_data->>status', 'eq', 'draft'),
    supabase.from('bus_allocations').select('allocation_data').filter('allocation_data->>status', 'eq', 'confirmed'),
  ]);

  if (campusResult.error) throw campusResult.error;
  if (enabledResult.error && enabledResult.error.code !== 'PGRST116') {
    throw enabledResult.error;
  }
  if (simulationProfileResult.error) throw simulationProfileResult.error;
  if (activeStationResult.error) throw activeStationResult.error;
  if (simulationBusOptionResult.error) throw simulationBusOptionResult.error;
  if (setupSettingResult.error) throw setupSettingResult.error;
  const operationErrors = [
    reservationResult.error,
    requestedReservationResult.error,
    confirmedReservationResult.error,
    cancelledReservationResult.error,
    ticketedReservationResult.error,
    paymentResult.error,
    pendingPaymentResult.error,
    completedPaymentResult.error,
    refundedPaymentResult.error,
    verifiedPaymentResult.error,
    transferResult.error,
    sentTransferResult.error,
    confirmedTransferResult.error,
    allocationResult.error,
    draftAllocationResult.error,
    confirmedAllocationResult.error,
  ].filter(Boolean);
  if (operationErrors.length > 0) throw operationErrors[0];

  const campuses = (campusResult.data ?? []) as CampusOptionRow[];
  const allocations = allocateGeneralUsers(campuses, targetSetting.targets);
  const currentProjectId = getProjectId(import.meta.env.VITE_SUPABASE_URL);
  const allowedProjectId =
    String(import.meta.env.VITE_SIMULATION_PROJECT_ID ?? '').trim() || null;
  const value = (enabledResult.data as { value?: unknown } | null)?.value;
  const simulationEnabled = normalizeSimulationEnabled(value);
  const projectIdMatches = Boolean(
    currentProjectId && allowedProjectId && currentProjectId === allowedProjectId
  );
  const setupSettings = new Map(
    (setupSettingResult.data ?? []).map((setting) => [setting.key, setting.value])
  );
  const ticketPrice = Number(
    getSettingObject(setupSettings.get('bus_ticket_price')).price
  );
  const districtTransferAccount = String(
    getSettingObject(setupSettings.get('seoul_district_transfer_account')).account_number ??
      ''
  ).trim();
  const deadlineAt = String(
    getSettingObject(setupSettings.get('first_reservation_deadline')).deadline_at ??
      ''
  );
  const checklist = getSettingObject(
    setupSettings.get('global_scenario_checklist')
  );
  const referenceScope = getSettingObject(
    setupSettings.get('simulation_reference_scope')
  );
  const selectedCampusIds = Array.isArray(referenceScope.campus_ids)
    ? referenceScope.campus_ids
    : [];
  const selectedStationIds = Array.isArray(referenceScope.station_ids)
    ? referenceScope.station_ids
    : [];
  const configuredBusOptions = (simulationBusOptionResult.data ?? []).map((option) => ({
    capacity: Number(option.capacity),
    estimatedPrice: Number(option.estimated_price),
  }));
  const missingSetup = [
    { ready: selectedCampusIds.length > 0, label: '사용 캠퍼스 범위' },
    { ready: selectedStationIds.length > 0, label: '사용 행선지 범위' },
    { ready: (simulationBusOptionResult.count ?? 0) >= 1, label: 'SIM 버스 옵션' },
    {
      ready: Number.isFinite(ticketPrice) && ticketPrice > 0,
      label: '버스표 가격',
    },
    {
      ready: districtTransferAccount.length > 0,
      label: '서울지구 송금 계좌',
    },
    {
      ready: getTotalParticipationTarget(targetSetting) >= MINIMUM_GENERAL_USER_COUNT,
      label: '예상 참여 인원 2,000명',
    },
    {
      ready: Array.isArray(checklist.checked_step_ids),
      label: '시나리오 체크리스트',
    },
  ]
    .filter(({ ready }) => !ready)
    .map(({ label }) => label);
  const previewCampuses = campuses.map((campus, index) => ({
    key: getCampusKey(campus),
    campusId: campus.campus_id,
    district: campus.district ?? '미등록 지구',
    team: campus.team ?? '미등록 팀',
    campus: campus.campus ?? '미등록 캠퍼스',
    generalUserCount: allocations[index] ?? 0,
    campusAdminCount: 1,
  }));
  const generalUserCount = previewCampuses.reduce(
    (sum, campus) => sum + campus.generalUserCount,
    0
  );
  const multiCampusAdminCount = Math.min(5, Math.floor(previewCampuses.length / 2));
  const campusAdminCount = previewCampuses.length - multiCampusAdminCount;
  const confirmedAllocations = confirmedAllocationResult.data ?? [];
  const confirmedAllocationTotals = confirmedAllocations.reduce(
    (totals, row) => {
      const buses = getAllocationArray(row.allocation_data, 'buses');
      const passengers = getAllocationArray(row.allocation_data, 'passengers');
      const capacity = buses.reduce(
        (sum, bus) => sum + Math.max(0, Number(bus.capacity) || 0),
        0
      );
      return {
        buses: totals.buses + buses.length,
        capacity: totals.capacity + capacity,
        passengers: totals.passengers + passengers.length,
      };
    },
    { buses: 0, capacity: 0, passengers: 0 }
  );

  return {
    safety: {
      currentProjectId,
      allowedProjectId,
      projectIdMatches,
      simulationEnabled,
      isSafeToExecute: projectIdMatches && simulationEnabled,
    },
    referenceSetup: {
      isReady: missingSetup.length === 0,
      missing: missingSetup,
    },
    referenceConfig: {
      applyRecommendedSeed: false,
      participationTarget: Math.max(
        MINIMUM_GENERAL_USER_COUNT,
        getTotalParticipationTarget(targetSetting)
      ),
      busTicketPrice:
        Number.isFinite(ticketPrice) && ticketPrice > 0
          ? ticketPrice
          : DEFAULT_SIMULATION_REFERENCE_CONFIG.busTicketPrice,
      campusCount: selectedCampusIds.length || Math.max(1, campuses.length),
      selectedCampusIds: selectedCampusIds.length
        ? selectedCampusIds.filter((campusId): campusId is string => typeof campusId === 'string')
        : campuses.map((campus) => campus.campus_id),
      stationCount:
        selectedStationIds.length || Math.max(1, activeStationResult.count ?? 0),
      selectedStationIds: selectedStationIds.length
        ? selectedStationIds.filter((stationId): stationId is string => typeof stationId === 'string')
        : (activeStationResult.data ?? []).map((station) => station.id),
      busOptions: configuredBusOptions.length
        ? configuredBusOptions
        : DEFAULT_SIMULATION_REFERENCE_CONFIG.busOptions.map((option) => ({ ...option })),
    },
    campuses: previewCampuses,
    stations: (activeStationResult.data ?? []).map((station) => ({
      stationId: station.id,
      name: station.name,
      line: station.line,
      address: station.address,
    })),
    generalUserCount,
    campusAdminCount,
    totalAccountCount: generalUserCount + campusAdminCount,
    existingSimulationProfileCount: simulationProfileResult.count ?? 0,
    activeStationCount: activeStationResult.count ?? 0,
    operation: {
      deadlineAt: Number.isFinite(Date.parse(deadlineAt)) ? deadlineAt : null,
      deadlineClosed:
        Number.isFinite(Date.parse(deadlineAt)) && Date.parse(deadlineAt) <= Date.now(),
      reservations: {
        total: getCount(reservationResult),
        requested: getCount(requestedReservationResult),
        confirmed: getCount(confirmedReservationResult),
        cancelled: getCount(cancelledReservationResult),
        ticketed: getCount(ticketedReservationResult),
      },
      payments: {
        total: getCount(paymentResult),
        pending: getCount(pendingPaymentResult),
        completed: getCount(completedPaymentResult),
        refunded: getCount(refundedPaymentResult),
        verified: getCount(verifiedPaymentResult),
      },
      transfers: {
        total: getCount(transferResult),
        sent: getCount(sentTransferResult),
        confirmed: getCount(confirmedTransferResult),
      },
      allocations: {
        total: getCount(allocationResult),
        draft: getCount(draftAllocationResult),
        confirmed: confirmedAllocations.length,
        confirmedBuses: confirmedAllocationTotals.buses,
        confirmedCapacity: confirmedAllocationTotals.capacity,
        confirmedPassengers: confirmedAllocationTotals.passengers,
        remainingSeats: Math.max(
          0,
          confirmedAllocationTotals.capacity - confirmedAllocationTotals.passengers
        ),
      },
    },
  };
}

export async function getSimulationStageRuns(): Promise<SimulationStageRun[]> {
  const { data, error } = await supabase
    .from('simulation_stage_runs')
    .select('id,stage,status,summary,error_message,started_at,completed_at')
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw error;
  }

  return (data ?? []) as SimulationStageRun[];
}

export async function setSimulationEnabled(enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('update_app_setting_as_global_admin', {
    p_key: 'simulation_enabled',
    p_value: { enabled },
  });

  if (error) throw error;
}

export interface SimulationStageResponse extends SimulationStageRun {
  done: boolean;
  next_offset: number | null;
}

export async function runSimulationStage(
  stage: 'cleanup' | 'reference' | 'accounts' | 'reservations' | 'payments' | 'transfers',
  options: {
    runId?: string;
    offset?: number;
    batchSize?: number;
    userCount?: number;
    referenceConfig?: SimulationReferenceConfig;
    paymentMode?: 'random' | 'all';
  } = {}
): Promise<SimulationStageResponse> {
  const { data, error } = await supabase.functions.invoke('simulation-runner', {
    body: {
      stage,
      run_id: options.runId,
      offset: options.offset,
      batch_size: options.batchSize,
      user_count: options.userCount,
      reference_config: options.referenceConfig,
      payment_mode: options.paymentMode,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));

  return {
    id: String(data.run_id),
    stage: String(data.stage),
    status: data.status,
    summary: data.summary ?? {},
    error_message: null,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    done: data.done ?? true,
    next_offset:
      typeof data.next_offset === 'number' ? data.next_offset : null,
  };
}
