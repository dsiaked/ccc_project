import { supabase } from '../supabase';
import type { BusAllocationResult } from './busAllocationAlgorithm';
import type {
  ReturnBusReservation,
  StationPreference,
} from '../../types/reservation';
import {
  assignPassengersToPreferredBuses,
  optimizePassengerAssignmentsForMinimumCost,
} from './allocationPassengerOptimizer';
import { describeAllocationWorkspaceChanges } from './allocationWorkspaceHistory';

export type AllocationWorkspaceStatus = 'draft' | 'confirmed' | 'archived';

export interface AllocationWorkspaceBus {
  id: string;
  optionId?: string;
  label: string;
  capacity: number;
  price: number;
  maxAvailableCount?: number;
  destination: string;
  departureTime: string;
  boardingPlace: string;
  minimumPassengers: number;
}

export interface AllocationWorkspacePassenger {
  reservationId: string;
  name: string;
  campus: string;
  team: string;
  preferences: string[];
  busId: string | null;
  seatNumber: number | null;
}

export interface AllocationWorkspaceSnapshot {
  buses: AllocationWorkspaceBus[];
  passengers: AllocationWorkspacePassenger[];
}

export interface AllocationWorkspaceHistory {
  id: string;
  at: string;
  actorId: string;
  action: string;
  detail: string;
  changes?: string[];
  versionId?: string;
}

export interface AllocationWorkspaceVersion extends AllocationWorkspaceSnapshot {
  id: string;
  createdAt: string;
  actorId: string;
  label: string;
}

export interface AllocationWorkspaceData extends AllocationWorkspaceSnapshot {
  schemaVersion: 1;
  status: AllocationWorkspaceStatus;
  sourceAllocation: BusAllocationResult;
  optimization: {
    mode: string;
    firstChoiceWeight: number;
    costWeight: number;
  };
  allowMinimumPassengerOverride: boolean;
  versions: AllocationWorkspaceVersion[];
  history: AllocationWorkspaceHistory[];
  editLock?: {
    actorId: string;
    expiresAt: string;
  };
  confirmedAt?: string;
}

export interface AllocationWorkspaceRow {
  id: string;
  allocation_name: string;
  allocation_data: AllocationWorkspaceData;
  total_cost: number;
  total_capacity: number;
  created_by: string;
  created_at: string;
}

export interface AllocationWorkspaceSummary {
  id: string;
  allocation_name: string;
  status: AllocationWorkspaceStatus;
  total_cost: number;
  total_capacity: number;
  created_at: string;
  bus_count: number;
  passenger_count: number;
}

export interface WorkspaceValidation {
  errors: string[];
  warnings: string[];
}

export interface AllocationConfirmationPreflightCheck {
  key:
    | 'workspace_status'
    | 'payload_structure'
    | 'bus_details'
    | 'assignments'
    | 'unique_reservations'
    | 'unique_seats'
    | 'active_reservations';
  valid: boolean;
}

export interface AllocationConfirmationPreflight {
  valid: boolean;
  checked_at: string;
  allocation_status: AllocationWorkspaceStatus | null;
  passenger_count: number;
  active_reservation_count: number;
  checks: AllocationConfirmationPreflightCheck[];
}

interface ReservationRow {
  id: string;
  name: string | null;
  campus: string | null;
  team: string | null;
  station_preferences: StationPreference[] | null;
  status: ReturnBusReservation['status'] | null;
  data: Partial<ReturnBusReservation> | null;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const uniqueId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const ACTIVE_RESERVATION_PAGE_SIZE = 1000;
const MAX_WORKSPACE_VERSIONS = 20;

const getPreferences = (row: ReservationRow) => {
  const saved = row.data?.stationPreferences ?? row.station_preferences ?? [];

  return saved
    .filter((preference) => preference.rank === 1 || preference.rank === 2)
    .sort((a, b) => a.rank - b.rank)
    .map((preference) => preference.station.name);
};

const getActiveReservationRows = async () => {
  const rows: ReservationRow[] = [];
  let totalCount: number | null = null;

  while (totalCount === null || rows.length < totalCount) {
    const from = rows.length;
    const { data, error, count } = await supabase
      .from('reservations')
      .select('id, name, campus, team, station_preferences, status, data', {
        count: totalCount === null ? 'exact' : undefined,
      })
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + ACTIVE_RESERVATION_PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as ReservationRow[];
    rows.push(...page);
    totalCount ??= count;

    if (page.length === 0) break;
  }

  return rows;
};

const reservationRowToWorkspacePassenger = (
  row: ReservationRow,
  existing?: AllocationWorkspacePassenger
): AllocationWorkspacePassenger => ({
  reservationId: row.id,
  name: row.data?.name ?? row.name ?? '-',
  campus: row.data?.campus ?? row.campus ?? '-',
  team: row.data?.team ?? row.team ?? '-',
  preferences: getPreferences(row),
  busId: existing?.busId ?? null,
  seatNumber: existing?.seatNumber ?? null,
});

const hasSamePassengers = (
  current: AllocationWorkspacePassenger[],
  next: AllocationWorkspacePassenger[]
) =>
  current.length === next.length &&
  current.every((passenger, index) => {
    const candidate = next[index];
    return (
      candidate !== undefined &&
      passenger.reservationId === candidate.reservationId &&
      passenger.name === candidate.name &&
      passenger.campus === candidate.campus &&
      passenger.team === candidate.team &&
      passenger.busId === candidate.busId &&
      passenger.seatNumber === candidate.seatNumber &&
      passenger.preferences.length === candidate.preferences.length &&
      passenger.preferences.every(
        (preference, preferenceIndex) =>
          preference === candidate.preferences[preferenceIndex]
      )
    );
  });

export const refreshDraftWorkspacePassengers = async (
  workspace: AllocationWorkspaceData
) => {
  if (workspace.status !== 'draft') {
    return { workspace, changed: false };
  }

  const reservationRows = await getActiveReservationRows();
  const existingById = new Map(
    workspace.passengers.map((passenger) => [passenger.reservationId, passenger])
  );
  const passengers = reservationRows.map((row) =>
    reservationRowToWorkspacePassenger(row, existingById.get(row.id))
  );
  const changed = !hasSamePassengers(workspace.passengers, passengers);

  return {
    workspace: changed ? { ...workspace, passengers } : workspace,
    changed,
  };
};

export const optimizeDraftWorkspace = (workspace: AllocationWorkspaceData) => {
  if (workspace.status !== 'draft') return workspace;

  const resetPassengers = workspace.passengers.map((passenger) => ({
    ...passenger,
    busId: null,
    seatNumber: null,
  }));
  const initialAssignment = assignPassengersToPreferredBuses(
    workspace.buses,
    resetPassengers
  );
  const optimized =
    workspace.optimization.mode === '최소 비용'
      ? optimizePassengerAssignmentsForMinimumCost(
          initialAssignment.buses,
          initialAssignment.passengers
        )
      : initialAssignment;

  return {
    ...workspace,
    buses: optimized.buses,
    passengers: optimized.passengers,
  };
};

export const getWorkspaceTotals = (workspace: AllocationWorkspaceData) => ({
  totalCost: workspace.buses.reduce((sum, bus) => sum + bus.price, 0),
  totalCapacity: workspace.buses.reduce((sum, bus) => sum + bus.capacity, 0),
});

export const getFirstChoiceCoverage = (workspace: AllocationWorkspaceData) => {
  if (workspace.passengers.length === 0) return 0;
  const busById = new Map(workspace.buses.map((bus) => [bus.id, bus]));

  const firstChoiceCount = workspace.passengers.filter((passenger) => {
    const bus = passenger.busId ? busById.get(passenger.busId) : undefined;
    return bus?.destination === passenger.preferences[0];
  }).length;

  return (firstChoiceCount / workspace.passengers.length) * 100;
};

export const validateWorkspace = (
  workspace: AllocationWorkspaceData
): WorkspaceValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const labels = new Set<string>();
  const assignedReservationIds = new Set<string>();
  const busIds = new Set(workspace.buses.map((bus) => bus.id));
  const passengersByBus = new Map<string, AllocationWorkspacePassenger[]>();

  workspace.passengers.forEach((passenger) => {
    if (!passenger.busId) return;
    const assigned = passengersByBus.get(passenger.busId) ?? [];
    assigned.push(passenger);
    passengersByBus.set(passenger.busId, assigned);
  });

  workspace.buses.forEach((bus) => {
    if (!bus.label.trim()) errors.push('이름이 없는 버스가 있습니다.');
    if (labels.has(bus.label.trim())) {
      errors.push(`버스 이름이 중복되었습니다: ${bus.label}`);
    }
    labels.add(bus.label.trim());

    if (!bus.destination.trim()) errors.push(`${bus.label}: 도착역이 없습니다.`);
    if (!bus.departureTime.trim()) errors.push(`${bus.label}: 출발 시간이 없습니다.`);
    if (!bus.boardingPlace.trim()) errors.push(`${bus.label}: 탑승 장소가 없습니다.`);

    const passengers = passengersByBus.get(bus.id) ?? [];
    const seats = new Set<number>();

    if (passengers.length > bus.capacity) {
      errors.push(`${bus.label}: 정원을 ${passengers.length - bus.capacity}명 초과했습니다.`);
    }

    if (passengers.length < bus.minimumPassengers) {
      warnings.push(
        `${bus.label}: 최소 탑승 인원 ${bus.minimumPassengers}명보다 적습니다.`
      );
    }

    passengers.forEach((passenger) => {
      if (!passenger.preferences.includes(bus.destination)) {
        errors.push(
          `${passenger.name}: ${bus.destination}은 1·2지망 도착역이 아닙니다.`
        );
      }

      if (
        passenger.seatNumber === null ||
        passenger.seatNumber < 1 ||
        passenger.seatNumber > bus.capacity
      ) {
        errors.push(`${passenger.name}: 유효한 좌석번호가 필요합니다.`);
      } else if (seats.has(passenger.seatNumber)) {
        errors.push(`${bus.label}: ${passenger.seatNumber}번 좌석이 중복되었습니다.`);
      } else {
        seats.add(passenger.seatNumber);
      }
    });
  });

  const optionCounts = new Map<string, number>();
  workspace.buses.forEach((bus) => {
    const key = bus.optionId ?? `${bus.capacity}:${bus.price}`;
    optionCounts.set(key, (optionCounts.get(key) ?? 0) + 1);
  });
  workspace.buses.forEach((bus) => {
    const key = bus.optionId ?? `${bus.capacity}:${bus.price}`;
    if (
      bus.maxAvailableCount !== undefined &&
      (optionCounts.get(key) ?? 0) > bus.maxAvailableCount
    ) {
      errors.push(
        `${bus.capacity}석 버스는 최대 ${bus.maxAvailableCount}대까지만 사용할 수 있습니다.`
      );
    }
  });

  workspace.passengers.forEach((passenger) => {
    if (assignedReservationIds.has(passenger.reservationId)) {
      errors.push(`${passenger.name}: 중복 배차되었습니다.`);
    }
    assignedReservationIds.add(passenger.reservationId);

    if (!passenger.busId) {
      errors.push(`${passenger.name}: 미배차 상태입니다.`);
    } else if (!busIds.has(passenger.busId)) {
      errors.push(`${passenger.name}: 존재하지 않는 버스에 배차되었습니다.`);
    }
    if (passenger.preferences.length < 2) {
      errors.push(`${passenger.name}: 1·2지망 도착역 정보가 필요합니다.`);
    }
  });

  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
};

export const createAllocationWorkspace = async ({
  name,
  allocation,
  departureTime,
  boardingPlace,
  actorId,
  optimizationMode,
  firstChoiceWeight,
  costWeight,
}: {
  name: string;
  allocation: BusAllocationResult;
  departureTime: string;
  boardingPlace: string;
  actorId: string;
  optimizationMode: string;
  firstChoiceWeight: number;
  costWeight: number;
}) => {
  const reservationRows = await getActiveReservationRows();
  const { data: optionRows, error: optionError } = await supabase
    .from('bus_options')
    .select('*');
  if (optionError) throw optionError;
  const buses: AllocationWorkspaceBus[] = [];
  const optionByCapacityAndPrice = new Map(
    (optionRows ?? []).map((option) => [
      `${option.capacity}:${option.estimated_price}`,
      option,
    ])
  );

  allocation.routePlan.forEach((route) => {
    route.destinations.forEach((destination, destinationIndex) => {
      const option = optionByCapacityAndPrice.get(
        `${route.capacity}:${route.price}`
      );
      buses.push({
        id: uniqueId('bus'),
        optionId: option?.id,
        label:
          route.destinations.length === 1
            ? route.busLabel
            : `${route.busLabel}-${destinationIndex + 1}`,
        capacity: route.capacity,
        price: route.price,
        maxAvailableCount: option?.max_count ?? 999,
        destination: destination.name,
        departureTime,
        boardingPlace,
        minimumPassengers: 36,
      });
    });
  });

  const passengers = reservationRows.map((row) =>
    reservationRowToWorkspacePassenger(row)
  );

  const initialAssignment = assignPassengersToPreferredBuses(buses, passengers);

  const optimized =
    optimizationMode === '최소 비용'
      ? optimizePassengerAssignmentsForMinimumCost(
          initialAssignment.buses,
          initialAssignment.passengers
        )
      : initialAssignment;
  const now = new Date().toISOString();
  const workspace: AllocationWorkspaceData = {
    schemaVersion: 1,
    status: 'draft',
    sourceAllocation: allocation,
    buses: optimized.buses,
    passengers: optimized.passengers,
    optimization: {
      mode: optimizationMode,
      firstChoiceWeight,
      costWeight,
    },
    allowMinimumPassengerOverride: false,
    versions: [],
    history: [
      {
        id: uniqueId('history'),
        at: now,
        actorId,
        action: 'draft_created',
        detail: '자동 배차 임시안을 생성했습니다.',
      },
    ],
  };
  const totals = getWorkspaceTotals(workspace);
  const { data, error } = await supabase
    .from('bus_allocations')
    .insert({
      allocation_name: name,
      allocation_data: workspace,
      total_cost: totals.totalCost,
      total_capacity: totals.totalCapacity,
      created_by: actorId,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as AllocationWorkspaceRow;
};

export const getAllocationWorkspace = async (id: string) => {
  const { data, error } = await supabase
    .from('bus_allocations')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as AllocationWorkspaceRow;
};

export const acquireAllocationWorkspaceLock = async (
  id: string,
  actorId: string
) => {
  const row = await getAllocationWorkspace(id);
  const lock = row.allocation_data.editLock;
  const isLockedByOther =
    lock &&
    lock.actorId !== actorId &&
    new Date(lock.expiresAt).getTime() > Date.now();

  if (isLockedByOther) {
    return { row, readOnly: true };
  }

  const nextData: AllocationWorkspaceData = {
    ...row.allocation_data,
    editLock: {
      actorId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
  };
  const { data, error } = await supabase
    .from('bus_allocations')
    .update({ allocation_data: nextData })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return { row: data as AllocationWorkspaceRow, readOnly: false };
};

export const getDraftAllocationWorkspaceSummaries = async () => {
  const { data, error } = await supabase.rpc('get_draft_allocation_summaries');

  if (error) throwAllocationRpcError(error);
  const rows = (data ?? []) as Array<
    Omit<AllocationWorkspaceSummary, 'status'>
  >;
  return rows.map((row) => ({
    ...row,
    status: 'draft' as const,
    total_cost: Number(row.total_cost),
    total_capacity: Number(row.total_capacity),
    bus_count: Number(row.bus_count),
    passenger_count: Number(row.passenger_count),
  }));
};

export const deleteDraftAllocationWorkspace = async (
  row: AllocationWorkspaceRow
) => {
  if (row.allocation_data.status !== 'draft') {
    throw new Error('임시 배차안만 삭제할 수 있습니다.');
  }

  const { data, error } = await supabase
    .from('bus_allocations')
    .delete()
    .eq('id', row.id)
    .filter('allocation_data->>status', 'eq', 'draft')
    .select('id');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('임시 배차안이 이미 변경되었거나 삭제되었습니다.');
  }
};

export const saveAllocationWorkspace = async (
  row: AllocationWorkspaceRow,
  workspace: AllocationWorkspaceData,
  actorId: string,
  detail = '배차안 변경사항을 저장했습니다.'
) => {
  const nextWorkspace = prepareWorkspaceForSave(workspace, actorId, detail);
  const totals = getWorkspaceTotals(nextWorkspace);
  const { data, error } = await supabase
    .from('bus_allocations')
    .update({
      allocation_data: nextWorkspace,
      total_cost: totals.totalCost,
      total_capacity: totals.totalCapacity,
    })
    .eq('id', row.id)
    .select('*')
    .single();

  if (error) throw error;
  return data as AllocationWorkspaceRow;
};

const prepareWorkspaceForSave = (
  workspace: AllocationWorkspaceData,
  actorId: string,
  detail: string
) => {
  const now = new Date().toISOString();
  const nextWorkspace = clone(workspace);
  const versionId = uniqueId('version');
  const changes = describeAllocationWorkspaceChanges(
    workspace.versions.at(-1),
    workspace
  );
  nextWorkspace.versions = [
    ...nextWorkspace.versions,
    {
      id: versionId,
      createdAt: now,
      actorId,
      label: `저장 ${nextWorkspace.versions.length + 1}`,
      buses: clone(workspace.buses),
      passengers: clone(workspace.passengers),
    },
  ].slice(-MAX_WORKSPACE_VERSIONS);
  nextWorkspace.history = [
    ...nextWorkspace.history,
    {
      id: uniqueId('history'),
      at: now,
      actorId,
      action: 'draft_saved',
      detail,
      changes,
      versionId,
    },
  ];
  return nextWorkspace;
};

const throwAllocationRpcError = (error: {
  code?: string;
  message?: string;
}) => {
  if (
    error.code === 'PGRST202' ||
    error.message?.includes('schema cache') ||
    error.message?.includes('get_draft_allocation_summaries') ||
    error.message?.includes('validate_allocation_workspace_confirmation') ||
    error.message?.includes('save_confirmed_allocation_workspace') ||
    error.message?.includes('cancel_confirmed_allocation_workspace')
  ) {
    throw new Error(
      '배차 확정 DB 함수가 설치되지 않았습니다. Supabase SQL Editor에서 sql/setup/55_atomic_allocation_confirmation.sql을 실행해주세요.'
    );
  }
  throw error;
};

export const validateAllocationWorkspaceConfirmation = async (
  row: AllocationWorkspaceRow,
  workspace: AllocationWorkspaceData
) => {
  const { data, error } = await supabase.rpc(
    'validate_allocation_workspace_confirmation',
    {
      p_allocation_id: row.id,
      p_allocation_data: workspace,
    }
  );
  if (error) throwAllocationRpcError(error);
  return data as AllocationConfirmationPreflight;
};

export const confirmAllocationWorkspace = async (
  row: AllocationWorkspaceRow,
  workspace: AllocationWorkspaceData,
  actorId: string
) => {
  const validation = validateWorkspace(workspace);
  if (validation.errors.length > 0) {
    throw new Error(validation.errors[0]);
  }
  if (validation.warnings.length > 0 && !workspace.allowMinimumPassengerOverride) {
    throw new Error('최소 탑승 인원 미달 경고를 예외 승인해야 합니다.');
  }

  const now = new Date().toISOString();
  const nextWorkspace: AllocationWorkspaceData = {
    ...clone(workspace),
    status: 'confirmed',
    confirmedAt: now,
    history: [
      ...workspace.history,
      {
        id: uniqueId('history'),
        at: now,
        actorId,
        action: 'confirmed',
        detail:
          validation.warnings.length > 0
            ? '최소 탑승 인원 미달을 예외 승인하고 전체 배차를 확정했습니다.'
            : '전체 배차를 확정했습니다.',
      },
    ],
  };
  const savedWorkspace = prepareWorkspaceForSave(
    nextWorkspace,
    actorId,
    '확정 배차 상태를 저장했습니다.'
  );
  const totals = getWorkspaceTotals(savedWorkspace);
  const { data, error } = await supabase
    .rpc('save_confirmed_allocation_workspace', {
      p_allocation_id: row.id,
      p_allocation_data: savedWorkspace,
      p_total_cost: totals.totalCost,
      p_total_capacity: totals.totalCapacity,
    })
    .single();

  if (error) throwAllocationRpcError(error);
  return data as AllocationWorkspaceRow;
};

export const cancelConfirmedWorkspace = async (
  row: AllocationWorkspaceRow,
  workspace: AllocationWorkspaceData,
  actorId: string
) => {
  const nextWorkspace: AllocationWorkspaceData = {
    ...clone(workspace),
    status: 'draft',
    confirmedAt: undefined,
    history: [
      ...workspace.history,
      {
        id: uniqueId('history'),
        at: new Date().toISOString(),
        actorId,
        action: 'confirmation_cancelled',
        detail: '전체 배차 확정을 취소했습니다.',
      },
    ],
  };
  const savedWorkspace = prepareWorkspaceForSave(
    nextWorkspace,
    actorId,
    '확정 취소 상태를 저장했습니다.'
  );
  const totals = getWorkspaceTotals(savedWorkspace);
  const { data, error } = await supabase
    .rpc('cancel_confirmed_allocation_workspace', {
      p_allocation_id: row.id,
      p_allocation_data: savedWorkspace,
      p_total_cost: totals.totalCost,
      p_total_capacity: totals.totalCapacity,
    })
    .single();

  if (error) throwAllocationRpcError(error);
  return data as AllocationWorkspaceRow;
};

export const saveConfirmedWorkspaceChanges = async (
  row: AllocationWorkspaceRow,
  workspace: AllocationWorkspaceData,
  actorId: string
) => {
  const validation = validateWorkspace(workspace);
  if (validation.errors.length > 0) throw new Error(validation.errors[0]);
  if (validation.warnings.length > 0 && !workspace.allowMinimumPassengerOverride) {
    throw new Error('최소 탑승 인원 미달 경고를 예외 승인해야 합니다.');
  }

  const savedWorkspace = prepareWorkspaceForSave(
    workspace,
    actorId,
    '확정 배차 수정사항을 즉시 반영했습니다.'
  );
  const totals = getWorkspaceTotals(savedWorkspace);
  const { data, error } = await supabase
    .rpc('save_confirmed_allocation_workspace', {
      p_allocation_id: row.id,
      p_allocation_data: savedWorkspace,
      p_total_cost: totals.totalCost,
      p_total_capacity: totals.totalCapacity,
    })
    .single();

  if (error) throwAllocationRpcError(error);
  return data as AllocationWorkspaceRow;
};

export const removeCancelledPassengerFromConfirmedWorkspace = async (
  reservationId: string,
  actorId: string
) => {
  const { data, error: loadError } = await supabase
    .from('bus_allocations')
    .select('*')
    .filter('allocation_data->>status', 'eq', 'confirmed');
  if (loadError) throw loadError;
  const confirmedRows = (data ?? []) as AllocationWorkspaceRow[];

  await Promise.all(
    confirmedRows.map(async (row) => {
      const passenger = row.allocation_data.passengers.find(
        (item) => item.reservationId === reservationId
      );
      if (!passenger) return;

      const bus = row.allocation_data.buses.find(
        (item) => item.id === passenger.busId
      );
      const nextWorkspace: AllocationWorkspaceData = {
        ...clone(row.allocation_data),
        passengers: row.allocation_data.passengers.filter(
          (item) => item.reservationId !== reservationId
        ),
        history: [
          ...row.allocation_data.history,
          {
            id: uniqueId('history'),
            at: new Date().toISOString(),
            actorId,
            action: 'passenger_cancelled',
            detail: `${passenger.name} 예매 취소: ${bus?.label ?? '미배차'} ${
              passenger.seatNumber ?? '-'
            }번 좌석을 빈자리로 남겼습니다.`,
          },
        ],
      };
      const totals = getWorkspaceTotals(nextWorkspace);
      const { error } = await supabase
        .from('bus_allocations')
        .update({
          allocation_data: nextWorkspace,
          total_cost: totals.totalCost,
          total_capacity: totals.totalCapacity,
        })
        .eq('id', row.id);

      if (error) throw error;
    })
  );
};
