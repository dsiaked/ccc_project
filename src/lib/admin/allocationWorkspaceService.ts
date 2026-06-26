import { supabase } from '../supabase';
import type {
  ReturnBusReservation,
  StationPreference,
} from '../../types/reservation';
import { describeAllocationWorkspaceChanges } from './allocationWorkspaceHistory';
import {
  convertToDestinationQueueWorkspace,
  type AllocationStrategy,
} from './destinationQueueAllocation';
import {
  createManualAllocationWorkspace as createManualAllocationWorkspaceModel,
  getBelowMinimumBusIds as getBelowMinimumBusIdsModel,
  getFirstChoiceCoverage as getFirstChoiceCoverageModel,
  getOutOfPreferencePassengerIds as getOutOfPreferencePassengerIdsModel,
  getWorkspaceTotals as getWorkspaceTotalsModel,
  isRemainingSeatPassenger as isRemainingSeatPassengerModel,
  mergeActivePassengersIntoDraft as mergeActivePassengersIntoDraftModel,
  validateWorkspace as validateWorkspaceModel,
} from './allocationWorkspaceModel';

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
  phone: string;
  campus: string;
  team: string;
  preferences: string[];
  source?: 'regular' | 'remaining_seat' | 'admin';
  remainingSeatStatus?: 'pending_payment' | 'confirmed';
  busId: string | null;
  seatNumber: number | null;
  assignedDestination?: string;
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

export interface AllocationWorkspaceVersionSummary {
  id: string;
  createdAt: string;
  actorId: string;
  label: string;
  changes?: string[];
}

export interface AllocationWorkspaceData extends AllocationWorkspaceSnapshot {
  schemaVersion: 1 | 2;
  status: AllocationWorkspaceStatus;
  allocationStrategy?: AllocationStrategy;
  commonBoarding?: {
    departureTime: string;
    boardingPlace: string;
  };
  sourceAllocation: Record<string, unknown>;
  manualBusTemplate?: Pick<
    AllocationWorkspaceBus,
    'optionId' | 'capacity' | 'price' | 'maxAvailableCount' | 'minimumPassengers'
  >;
  sourceOptimizationJobId?: string;
  optimalBaseline?: {
    totalBuses: number;
    totalCost: number;
    secondChoiceCount: number;
    inputHash: string;
  };
  optimization: {
    mode: string;
    firstChoiceWeight: number;
    costWeight: number;
  };
  allowMinimumPassengerOverride: boolean;
  allowOutOfPreferenceOverride?: boolean;
  outOfPreferenceAcknowledgement?: {
    actorId: string;
    at: string;
    passengerIds: string[];
  };
  versions?: AllocationWorkspaceVersion[];
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
  updated_at: string;
  revision: number;
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

export interface AllocationConfirmationPreflightDetail {
  key: AllocationConfirmationPreflightCheck['key'];
  message: string;
  passenger_id?: string;
  reservation_id?: string;
  bus_id?: string;
  requires_refresh?: boolean;
}

export interface AllocationConfirmationPreflight {
  valid: boolean;
  checked_at: string;
  allocation_status: AllocationWorkspaceStatus | null;
  passenger_count: number;
  active_reservation_count: number;
  checks: AllocationConfirmationPreflightCheck[];
  details: AllocationConfirmationPreflightDetail[];
}

interface ReservationRow {
  id: string;
  created_at: string;
  name: string | null;
  phone: string | null;
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
export const isRemainingSeatPassenger = (
  passenger: AllocationWorkspacePassenger
) =>
  isRemainingSeatPassengerModel(passenger);

const getPreferences = (row: ReservationRow) => {
  const saved = (row.data?.stationPreferences ??
    row.station_preferences ??
    []) as unknown[];

  return saved
    .map((preference, index) => {
      if (typeof preference === 'string') {
        return {
          rank: index === 0 ? 1 : index === 1 ? 2 : null,
          name: preference,
        };
      }
      if (
        !preference ||
        typeof preference !== 'object' ||
        !('rank' in preference) ||
        !('station' in preference)
      ) {
        return { rank: null, name: null };
      }
      const station =
        preference.station && typeof preference.station === 'object'
          ? preference.station
          : null;
      return {
        rank: preference.rank,
        name:
          station && 'name' in station && typeof station.name === 'string'
            ? station.name
            : null,
      };
    })
    .filter(
      (preference): preference is { rank: 1 | 2; name: string } =>
        (preference.rank === 1 || preference.rank === 2) &&
        typeof preference.name === 'string' &&
        preference.name.trim().length > 0
    )
    .sort((a, b) => a.rank - b.rank)
    .map((preference) => preference.name);
};

const getRemainingSeatStatus = (
  row: ReservationRow
): AllocationWorkspacePassenger['remainingSeatStatus'] => {
  const status = row.data?.remainingSeatClaim?.status;
  return status === 'confirmed' ? 'confirmed' : status ? 'pending_payment' : undefined;
};

const getActiveReservationRows = async () => {
  const rows: ReservationRow[] = [];
  let cursor: Pick<ReservationRow, 'created_at' | 'id'> | null = null;

  while (true) {
    let query = supabase
      .from('reservations')
      .select(
        'id, created_at, name, phone, campus, team, station_preferences, status, data'
      )
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(ACTIVE_RESERVATION_PAGE_SIZE);

    if (cursor) {
      query = query.or(
        `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`
      );
    }

    const { data, error } = await query;

    if (error) throw error;

    const page = (data ?? []) as ReservationRow[];
    rows.push(...page);

    if (page.length < ACTIVE_RESERVATION_PAGE_SIZE) break;
    cursor = page[page.length - 1];
  }

  return rows;
};

const reservationRowToWorkspacePassenger = (
  row: ReservationRow,
  existing?: AllocationWorkspacePassenger
): AllocationWorkspacePassenger => {
  const remainingSeatStatus = getRemainingSeatStatus(row);
  const remainingSeatDestination = row.data?.remainingSeatClaim?.destination;
  const preferences = getPreferences(row);

  return {
    reservationId: row.id,
    name: row.data?.name ?? row.name ?? '-',
    phone: row.data?.phone ?? row.phone ?? '-',
    campus: row.data?.campus ?? row.campus ?? '-',
    team: row.data?.team ?? row.team ?? '-',
    preferences:
      remainingSeatStatus && remainingSeatDestination
        ? [remainingSeatDestination]
        : preferences,
    source: remainingSeatStatus ? 'remaining_seat' : existing?.source ?? 'regular',
    remainingSeatStatus,
    busId: existing?.busId ?? null,
    seatNumber: existing?.seatNumber ?? null,
  };
};

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
      passenger.phone === candidate.phone &&
      passenger.campus === candidate.campus &&
      passenger.team === candidate.team &&
      passenger.source === candidate.source &&
      passenger.remainingSeatStatus === candidate.remainingSeatStatus &&
      passenger.busId === candidate.busId &&
      passenger.seatNumber === candidate.seatNumber &&
      passenger.preferences.length === candidate.preferences.length &&
      passenger.preferences.every(
        (preference, preferenceIndex) =>
          preference === candidate.preferences[preferenceIndex]
      )
    );
  });

export const mergeActivePassengersIntoDraftLegacy = (
  workspace: AllocationWorkspaceData,
  activePassengers: AllocationWorkspacePassenger[]
) => {
  if (workspace.status !== 'draft') return workspace;

  const previousById = new Map(
    workspace.passengers.map((passenger) => [passenger.reservationId, passenger])
  );
  const buses = clone(workspace.buses);
  const passengers = activePassengers.map((passenger) => {
    const previous = previousById.get(passenger.reservationId);
    return previous
      ? {
          ...passenger,
          busId: previous.busId,
          seatNumber: previous.seatNumber,
        }
      : { ...passenger, busId: null, seatNumber: null };
  });
  const newPassengerIds = new Set(
    passengers
      .filter((passenger) => !previousById.has(passenger.reservationId))
      .map((passenger) => passenger.reservationId)
  );
  const activePassengerIds = new Set(
    passengers.map((passenger) => passenger.reservationId)
  );
  const cancelledCount = workspace.passengers.filter(
    (passenger) => !activePassengerIds.has(passenger.reservationId)
  ).length;
  const occupancy = new Map<string, number>();
  const usedSeats = new Map<string, Set<number>>();

  passengers.forEach((passenger) => {
    if (!passenger.busId || passenger.seatNumber === null) return;
    occupancy.set(passenger.busId, (occupancy.get(passenger.busId) ?? 0) + 1);
    const seats = usedSeats.get(passenger.busId) ?? new Set<number>();
    seats.add(passenger.seatNumber);
    usedSeats.set(passenger.busId, seats);
  });

  const nextSeat = (bus: AllocationWorkspaceBus) => {
    const seats = usedSeats.get(bus.id) ?? new Set<number>();
    for (let seat = 1; seat <= bus.capacity; seat += 1) {
      if (!seats.has(seat)) return seat;
    }
    return null;
  };
  const assign = (
    passenger: AllocationWorkspacePassenger,
    bus: AllocationWorkspaceBus
  ) => {
    const seat = nextSeat(bus);
    if (seat === null) return false;
    passenger.busId = bus.id;
    passenger.seatNumber = seat;
    occupancy.set(bus.id, (occupancy.get(bus.id) ?? 0) + 1);
    const seats = usedSeats.get(bus.id) ?? new Set<number>();
    seats.add(seat);
    usedSeats.set(bus.id, seats);
    return true;
  };
  const preferredAvailableBuses = (passenger: AllocationWorkspacePassenger) =>
    buses
      .filter(
        (bus) =>
          passenger.preferences.includes(bus.destination) &&
          (occupancy.get(bus.id) ?? 0) < bus.capacity
      )
      .sort((left, right) => {
        const rankDifference =
          passenger.preferences.indexOf(left.destination) -
          passenger.preferences.indexOf(right.destination);
        if (rankDifference !== 0) return rankDifference;
        const campusDifference =
          passengers.filter(
            (candidate) =>
              candidate.busId === right.id && candidate.campus === passenger.campus
          ).length -
          passengers.filter(
            (candidate) =>
              candidate.busId === left.id && candidate.campus === passenger.campus
          ).length;
        if (campusDifference !== 0) return campusDifference;
        const teamDifference =
          passengers.filter(
            (candidate) =>
              candidate.busId === right.id && candidate.team === passenger.team
          ).length -
          passengers.filter(
            (candidate) =>
              candidate.busId === left.id && candidate.team === passenger.team
          ).length;
        if (teamDifference !== 0) return teamDifference;
        const remainingSeatDifference =
          right.capacity -
          (occupancy.get(right.id) ?? 0) -
          (left.capacity - (occupancy.get(left.id) ?? 0));
        if (remainingSeatDifference !== 0) return remainingSeatDifference;
        return left.label.localeCompare(right.label);
      });

  const pending = passengers.filter(
    (passenger) =>
      newPassengerIds.has(passenger.reservationId) && !passenger.busId
  );
  pending.forEach((passenger) => {
    const bus = preferredAvailableBuses(passenger)[0];
    if (bus) assign(passenger, bus);
  });

  const template = buses[0];
  const usedLabels = new Set(buses.map((bus) => bus.label));
  let addedBusCount = 0;
  while (template && pending.some((passenger) => !passenger.busId)) {
    const remaining = pending.filter((passenger) => !passenger.busId);
    const destinationScores = new Map<
      string,
      { matching: number; firstChoice: number }
    >();
    remaining.forEach((passenger) => {
      passenger.preferences.forEach((destination, rank) => {
        if (!destination) return;
        const score = destinationScores.get(destination) ?? {
          matching: 0,
          firstChoice: 0,
        };
        score.matching += 1;
        if (rank === 0) score.firstChoice += 1;
        destinationScores.set(destination, score);
      });
    });
    const destination = [...destinationScores.entries()].sort(
      ([leftDestination, left], [rightDestination, right]) =>
        right.matching - left.matching ||
        right.firstChoice - left.firstChoice ||
        leftDestination.localeCompare(rightDestination)
    )[0]?.[0];
    if (!destination) break;

    addedBusCount += 1;
    let labelIndex = addedBusCount;
    while (usedLabels.has(`${destination} 추가 ${labelIndex}`)) labelIndex += 1;
    const label = `${destination} 추가 ${labelIndex}`;
    usedLabels.add(label);
    const bus: AllocationWorkspaceBus = {
      ...clone(template),
      id: uniqueId('auto-bus'),
      label,
      destination,
      maxAvailableCount: undefined,
    };
    buses.push(bus);

    remaining
      .filter((passenger) => passenger.preferences.includes(destination))
      .sort(
        (left, right) =>
          left.preferences.indexOf(destination) -
            right.preferences.indexOf(destination) ||
          left.campus.localeCompare(right.campus) ||
          left.team.localeCompare(right.team) ||
          left.reservationId.localeCompare(right.reservationId)
      )
      .slice(0, bus.capacity)
      .forEach((passenger) => assign(passenger, bus));
  }

  const changed =
    addedBusCount > 0 ||
    cancelledCount > 0 ||
    !hasSamePassengers(workspace.passengers, passengers);
  if (!changed) return workspace;

  const now = new Date().toISOString();
  return {
    ...workspace,
    buses,
    passengers,
    allowMinimumPassengerOverride: false,
    allowOutOfPreferenceOverride: false,
    outOfPreferenceAcknowledgement: undefined,
    history: [
      ...workspace.history,
      {
        id: uniqueId('history'),
        at: now,
        actorId: 'system',
        action: 'active_reservations_refreshed',
        detail: `활성 신청을 반영했습니다. 신규 ${newPassengerIds.size}명, 취소 제거 ${cancelledCount}명, 자동 추가 버스 ${addedBusCount}대.`,
      },
    ],
  };
};

export const mergeActivePassengersIntoDraft = mergeActivePassengersIntoDraftModel;

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
  const activePassengers = reservationRows.map((row) =>
    reservationRowToWorkspacePassenger(row, existingById.get(row.id))
  );
  const refreshed = mergeActivePassengersIntoDraftModel(
    workspace,
    activePassengers
  );
  const changed = refreshed !== workspace;

  return {
    workspace: refreshed,
    changed,
  };
};

export const getWorkspaceTotals = (workspace: AllocationWorkspaceData) =>
  getWorkspaceTotalsModel(workspace);

export const getFirstChoiceCoverage = (workspace: AllocationWorkspaceData) =>
  getFirstChoiceCoverageModel(workspace);

export const getOutOfPreferencePassengerIds = (
  workspace: AllocationWorkspaceData
) => getOutOfPreferencePassengerIdsModel(workspace);

export const getBelowMinimumBusIds = (workspace: AllocationWorkspaceData) =>
  getBelowMinimumBusIdsModel(workspace);

export const validateWorkspaceLegacy = (
  workspace: AllocationWorkspaceData
): WorkspaceValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const labels = new Set<string>();
  const seenBusIds = new Set<string>();
  const assignedReservationIds = new Set<string>();
  const busIds = new Set(workspace.buses.map((bus) => bus.id));
  const passengersByBus = new Map<string, AllocationWorkspacePassenger[]>();

  if (workspace.buses.length === 0) {
    errors.push('At least one bus is required.');
  }
  if (workspace.passengers.length === 0) {
    errors.push('At least one passenger is required.');
  }

  workspace.passengers.forEach((passenger) => {
    if (!passenger.busId) return;
    const assigned = passengersByBus.get(passenger.busId) ?? [];
    assigned.push(passenger);
    passengersByBus.set(passenger.busId, assigned);
  });

  if (workspace.buses.some((bus) => !bus.departureTime.trim())) {
    errors.push('출발 일시가 없습니다.');
  }
  if (workspace.buses.some((bus) => !bus.boardingPlace.trim())) {
    errors.push('탑승장소가 없습니다.');
  }

  workspace.buses.forEach((bus) => {
    if (!bus.id.trim()) errors.push('Every bus needs an ID.');
    if (seenBusIds.has(bus.id)) {
      errors.push(`Duplicate bus ID: ${bus.id}`);
    }
    seenBusIds.add(bus.id);

    if (!Number.isInteger(bus.capacity) || bus.capacity <= 0) {
      errors.push(`${bus.label}: bus capacity must be a positive integer.`);
    }
    if (!Number.isInteger(bus.price) || bus.price < 0) {
      errors.push(`${bus.label}: bus price must be a non-negative integer.`);
    }
    if (
      !Number.isInteger(bus.minimumPassengers) ||
      bus.minimumPassengers < 0
    ) {
      errors.push(
        `${bus.label}: minimum passengers must be a non-negative integer.`
      );
    }

    if (!bus.label.trim()) errors.push('이름이 없는 버스가 있습니다.');
    if (labels.has(bus.label.trim())) {
      errors.push(`버스 이름이 중복되었습니다: ${bus.label}`);
    }
    labels.add(bus.label.trim());

    if (!bus.destination.trim()) errors.push(`${bus.label}: 행선지가 없습니다.`);

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
      if (
        !isRemainingSeatPassenger(passenger) &&
        !passenger.preferences.includes(bus.destination)
      ) {
        warnings.push(
          `${passenger.name}: ${bus.destination}은 1·2지망 외 행선지입니다. 관리자 확인이 필요합니다.`
        );
      }

      if (
        passenger.seatNumber === null ||
        !Number.isInteger(passenger.seatNumber) ||
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
    if (
      !isRemainingSeatPassenger(passenger) &&
      passenger.preferences.length < 2
    ) {
      errors.push(`${passenger.name}: 1·2지망 행선지 정보가 필요합니다.`);
    }
  });

  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
};

export const validateWorkspace = validateWorkspaceModel;

export const acquireAllocationWorkspaceLock = async (id: string) => {
  const { data, error } = await supabase.rpc('acquire_allocation_workspace_lock', {
    p_allocation_id: id,
  });

  if (error) throwAllocationRpcError(error);
  const result = data as {
    lock_acquired: boolean;
    row: AllocationWorkspaceRow;
  };
  return { row: result.row, readOnly: !result.lock_acquired };
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

export const getConfirmedAllocationWorkspaceSummaries = async () => {
  const { data, error } = await supabase.rpc(
    'get_confirmed_allocation_summaries'
  );

  if (error) throwAllocationRpcError(error);
  const rows = (data ?? []) as Array<
    Omit<AllocationWorkspaceSummary, 'status'>
  >;
  return rows.map((row) => ({
    ...row,
    status: 'confirmed' as const,
    total_cost: Number(row.total_cost),
    total_capacity: Number(row.total_capacity),
    bus_count: Number(row.bus_count),
    passenger_count: Number(row.passenger_count),
  }));
};

export const createManualAllocationWorkspace = async (allocationName: string) => {
  const name = allocationName.trim();
  if (!name) {
    throw new Error('배차 초안 이름을 입력해주세요.');
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw new Error('관리자 로그인 세션이 만료되었습니다. 다시 로그인해주세요.');
  }

  const [reservationRows, busOptionsResult, optimizerConfigResult] =
    await Promise.all([
      getActiveReservationRows(),
      supabase
        .from('bus_options')
        .select('id, capacity, estimated_price, max_count')
        .order('capacity', { ascending: false }),
      supabase.rpc('get_allocation_optimizer_config'),
    ]);
  if (busOptionsResult.error) throw busOptionsResult.error;
  if (optimizerConfigResult.error) throw optimizerConfigResult.error;

  const busOptions = busOptionsResult.data ?? [];
  if (busOptions.length !== 1) {
    throw new Error(
      busOptions.length === 0
        ? '수동 배차에 사용할 버스 옵션을 먼저 등록해주세요.'
        : '수동 배차에 사용할 버스 옵션을 하나만 남겨주세요.'
    );
  }
  const busOption = busOptions[0];
  const rawConfig = optimizerConfigResult.data as
    | { recommended_minimum_passengers?: unknown }
    | null;
  const recommendedMinimum = Number(rawConfig?.recommended_minimum_passengers);
  const passengers = reservationRows.map((row) =>
    reservationRowToWorkspacePassenger(row)
  );
  const workspace = createManualAllocationWorkspaceModel(
    passengers,
    session.user.id,
    undefined,
    {
      optionId: busOption.id,
      capacity: Number(busOption.capacity),
      price: Number(busOption.estimated_price),
      maxAvailableCount:
        busOption.max_count === null ? undefined : Number(busOption.max_count),
      minimumPassengers: Number.isInteger(recommendedMinimum)
        ? recommendedMinimum
        : 0,
    }
  );
  const { data, error } = await supabase.rpc(
    'create_bus_allocation_as_global_admin',
    {
      p_allocation_name: name,
      p_allocation_data: workspace,
    }
  );

  if (error) throwAllocationRpcError(error);
  return data as unknown as AllocationWorkspaceRow;
};

export const deleteDraftAllocationWorkspace = async (
  row: AllocationWorkspaceRow
) => {
  if (row.allocation_data.status !== 'draft') {
    throw new Error('배차 초안만 삭제할 수 있습니다.');
  }

  const { error } = await supabase.rpc('delete_draft_allocation_workspace', {
    p_allocation_id: row.id,
    p_expected_revision: row.revision,
  });

  if (error) throwAllocationRpcError(error);
};

export const saveAllocationWorkspace = async (
  row: AllocationWorkspaceRow,
  workspace: AllocationWorkspaceData,
  actorId: string,
  detail = '배차안 변경사항을 저장했습니다.'
) => {
  const prepared = prepareWorkspaceForSave(row.allocation_data, workspace, actorId, detail);
  const totals = getWorkspaceTotals(prepared.workspace);
  const { data, error } = await supabase
    .rpc('save_draft_allocation_workspace_v2', {
      p_allocation_id: row.id,
      p_expected_revision: row.revision,
      p_allocation_data: prepared.workspace,
      p_total_cost: totals.totalCost,
      p_total_capacity: totals.totalCapacity,
      p_version_id: prepared.version.id,
      p_version_label: prepared.version.label,
      p_version_changes: prepared.version.changes,
    })
    .single();

  if (error) throwAllocationRpcError(error);
  return data as AllocationWorkspaceRow;
};

export const convertAllocationWorkspaceToDestinationQueue = async (
  row: AllocationWorkspaceRow
) => {
  if (row.allocation_data.status !== 'draft') {
    throw new Error('배차 초안에서만 배차 방식을 변경할 수 있습니다.');
  }
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw new Error('관리자 로그인이 필요합니다.');
  }

  const lockResult = await acquireAllocationWorkspaceLock(row.id);
  if (lockResult.readOnly) {
    throw new Error('다른 관리자가 이 배차안을 편집 중입니다.');
  }
  const lockedRow = lockResult.row;
  const workspace = convertToDestinationQueueWorkspace(lockedRow.allocation_data);
  return saveAllocationWorkspace(
    lockedRow,
    workspace,
    session.user.id,
    '배차 방식을 행선지 대기 배차로 선택했습니다.'
  );
};

const prepareWorkspaceForSave = (
  previousWorkspace: AllocationWorkspaceData,
  workspace: AllocationWorkspaceData,
  actorId: string,
  detail: string
) => {
  const now = new Date().toISOString();
  const versionId = uniqueId('version');
  const changes = describeAllocationWorkspaceChanges(
    previousWorkspace,
    workspace
  );
  const { versions: _legacyVersions, ...workspaceWithoutVersions } = clone(workspace);
  void _legacyVersions;
  const label = `저장 ${previousWorkspace.history.filter(
    (item) => item.versionId
  ).length + 1}`;
  const nextWorkspace: AllocationWorkspaceData = {
    ...workspaceWithoutVersions,
    schemaVersion: 2,
  };
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
  return {
    workspace: nextWorkspace,
    version: {
      id: versionId,
      label,
      changes,
    },
  };
};

export const getAllocationWorkspaceVersions = async (
  allocationId: string
): Promise<AllocationWorkspaceVersionSummary[]> => {
  const { data, error } = await supabase.rpc('get_allocation_workspace_versions', {
    p_allocation_id: allocationId,
  });
  if (error) throwAllocationRpcError(error);

  return ((data ?? []) as Array<{
    id: string;
    created_at: string;
    actor_id: string;
    label: string;
    changes: string[] | null;
  }>).map((version) => ({
    id: version.id,
    createdAt: version.created_at,
    actorId: version.actor_id,
    label: version.label,
    changes: version.changes ?? undefined,
  }));
};

export const getAllocationWorkspaceVersionSnapshot = async (
  versionId: string
): Promise<AllocationWorkspaceSnapshot> => {
  const { data, error } = await supabase.rpc('get_allocation_workspace_version_snapshot', {
    p_version_id: versionId,
  });
  if (error) throwAllocationRpcError(error);
  return data as unknown as AllocationWorkspaceSnapshot;
};

const throwAllocationRpcError = (error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}) => {
  if (
    error.code === 'PGRST202' ||
    error.message?.includes('schema cache') ||
    error.message?.includes('get_draft_allocation_summaries') ||
    error.message?.includes('get_confirmed_allocation_summaries') ||
    error.message?.includes('create_bus_allocation_as_global_admin') ||
    error.message?.includes('validate_allocation_workspace_confirmation') ||
    error.message?.includes('acquire_allocation_workspace_lock') ||
    error.message?.includes('save_draft_allocation_workspace') ||
    error.message?.includes('get_allocation_workspace_versions') ||
    error.message?.includes('get_allocation_workspace_version_snapshot') ||
    error.message?.includes('delete_draft_allocation_workspace') ||
    error.message?.includes('remove_cancelled_passenger_from_confirmed_allocations') ||
    error.message?.includes('save_confirmed_allocation_workspace') ||
    error.message?.includes('cancel_confirmed_allocation_workspace') ||
    error.message?.includes('cancel_destination_queue_allocation')
  ) {
    throw new Error(
      '배차 확정 또는 버전 저장 DB 함수가 설치되지 않았습니다. Supabase SQL Editor에서 sql/setup/55_atomic_allocation_confirmation.sql과 sql/setup/64_allocation_workspace_versions.sql을 순서대로 실행해주세요.'
    );
  }
  const confirmationErrorMessages: Record<string, string> = {
    'Allocation workspace changed. Reload before saving.':
      '다른 관리자가 이 배차안을 변경했습니다. 최신 내용을 다시 불러온 뒤 저장해주세요.',
    'Allocation workspace lock is owned by another administrator.':
      '다른 관리자가 이 배차안을 편집 중입니다.',
    'Allocation workspace lock expired. Reopen the workspace.':
      '편집 잠금이 만료되었습니다. 배차안을 다시 열어주세요.',
    'Allocation workspace not found.':
      '배차안을 찾을 수 없습니다.',
    'Only draft allocations can be deleted.':
      '배차 초안만 삭제할 수 있습니다.',
    'Only global admins can edit allocations.':
      '전체 관리자 권한이 있어야 배차안을 수정할 수 있습니다.',
    'Only global admins can create allocations.':
      '전체 관리자 권한이 있어야 배차 초안을 생성할 수 있습니다.',
    'Only global admins can confirm allocations.':
      '전체 관리자 권한이 없어 배차를 확정할 수 없습니다.',
    'Invalid confirmed allocation payload.':
      '확정할 배차 데이터의 형식이 올바르지 않습니다.',
    'Only draft or confirmed allocations can be saved as confirmed.':
      '이미 삭제되었거나 확정할 수 없는 상태의 배차안입니다.',
    'Confirmed allocations need at least one bus and passenger.':
      '배차 확정에는 버스와 탑승자가 각각 한 명 이상 필요합니다.',
    'Every bus needs valid required details.':
      '필수 정보가 누락되었거나 정원이 올바르지 않은 버스가 있습니다.',
    'Every passenger needs a bus and valid seat number.':
      '버스 또는 유효한 좌석번호가 지정되지 않은 탑승자가 있습니다.',
    'Duplicate reservation IDs exist in the allocation.':
      '같은 신청자가 배차안에 중복으로 포함되어 있습니다.',
    'Invalid bus, seat, or destination assignment exists.':
      '버스, 좌석번호 또는 행선지가 올바르지 않은 배차가 있습니다.',
    'Duplicate seat assignments exist.':
      '같은 버스에서 중복으로 배정된 좌석이 있습니다.',
    'Active reservations changed after the draft was created.':
      '배차 초안 생성 후 활성 신청자가 변경되었습니다. 최신 신청자를 반영해주세요.',
    'Not every active reservation was confirmed.':
      '일부 활성 신청자의 배차 확정 처리가 누락되었습니다.',
    'Allocation is available only after the reservation deadline.':
      '신청 마감 후에만 배차를 진행할 수 있습니다.',
    'Cancel the existing confirmed allocation before confirming another.':
      '기존 확정 배차를 먼저 취소한 뒤 새 배차를 확정해주세요.',
    'Cancel the confirmed allocation before using allocation planning.':
      '확정 배차를 먼저 취소한 뒤 배차 운영 기능을 이용해주세요.',
    'Confirmed allocation is locked until confirmation is cancelled.':
      '확정 배차는 취소 전까지 수정할 수 없습니다.',
    'Cancel all bus departures before cancelling the confirmed allocation.':
      '출발 완료 호차의 출발 완료를 모두 취소한 뒤 배차 확정을 취소해주세요.',
    'Departed destination queue buses prevent allocation cancellation.':
      '이미 출발한 행선지 대기 호차가 있어 배차 확정을 취소할 수 없습니다.',
    'canceling statement due to statement timeout':
      '서버 처리 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.',
    'No-show status is available after bus departure.':
      '호차 출발 완료 이후에 미탑승 처리할 수 있습니다.',
  };
  const translatedMessage = error.message
    ? confirmationErrorMessages[error.message]
    : undefined;
  if (translatedMessage) throw new Error(translatedMessage);
  throw new Error(
    error.message ||
      error.details ||
      error.hint ||
      (error.code ? `배차 서버 오류 (${error.code})` : '알 수 없는 배차 서버 오류가 발생했습니다.')
  );
};

export const validateAllocationWorkspaceConfirmation = async (
  row: AllocationWorkspaceRow,
  workspace: AllocationWorkspaceData,
  signal?: AbortSignal
) => {
  let request = supabase.rpc(
    'validate_allocation_workspace_confirmation_v2',
    {
      p_allocation_id: row.id,
      p_allocation_data: workspace,
    }
  );
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throwAllocationRpcError(error);
  return data as AllocationConfirmationPreflight;
};

export const confirmAllocationWorkspace = async (
  row: AllocationWorkspaceRow,
  workspace: AllocationWorkspaceData,
  actorId: string,
  signal?: AbortSignal
) => {
  const validation = validateWorkspace(workspace);
  const belowMinimumBusIds = getBelowMinimumBusIds(workspace);
  const outOfPreferencePassengerIds = getOutOfPreferencePassengerIds(workspace);
  if (validation.errors.length > 0) {
    throw new Error(validation.errors[0]);
  }
  if (belowMinimumBusIds.length > 0 && !workspace.allowMinimumPassengerOverride) {
    throw new Error('최소 탑승 인원 미달 경고를 예외 승인해야 합니다.');
  }
  if (
    outOfPreferencePassengerIds.length > 0 &&
    !workspace.allowOutOfPreferenceOverride
  ) {
    throw new Error('1·2지망 외 배정 경고를 별도로 승인해야 합니다.');
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
            ? '관리자 경고 사항을 확인하고 전체 배차를 확정했습니다.'
            : '전체 배차를 확정했습니다.',
      },
    ],
  };
  const prepared = prepareWorkspaceForSave(
    row.allocation_data,
    nextWorkspace,
    actorId,
    '확정 배차 상태를 저장했습니다.'
  );
  const totals = getWorkspaceTotals(prepared.workspace);
  let request = supabase.rpc('save_confirmed_allocation_workspace_v3', {
      p_allocation_id: row.id,
      p_expected_revision: row.revision,
      p_allocation_data: prepared.workspace,
      p_total_cost: totals.totalCost,
      p_total_capacity: totals.totalCapacity,
      p_version_id: prepared.version.id,
      p_version_label: prepared.version.label,
      p_version_changes: prepared.version.changes,
    });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request.single();

  if (error) throwAllocationRpcError(error);
  return data as AllocationWorkspaceRow;
};

export const confirmDestinationQueueAllocation = async (
  row: AllocationWorkspaceRow,
  workspace: AllocationWorkspaceData
) => {
  const { data, error } = await supabase
    .rpc('confirm_destination_queue_allocation', {
      p_allocation_id: row.id,
      p_expected_revision: row.revision,
      p_allocation_data: workspace,
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
  const prepared = prepareWorkspaceForSave(
    row.allocation_data,
    nextWorkspace,
    actorId,
    '확정 취소 상태를 저장했습니다.'
  );
  const totals = getWorkspaceTotals(prepared.workspace);
  const rpcName =
    workspace.allocationStrategy === 'destination_queue'
      ? 'cancel_destination_queue_allocation'
      : 'cancel_confirmed_allocation_workspace_v2';
  const { data, error } = await supabase
    .rpc(rpcName, {
      p_allocation_id: row.id,
      p_expected_revision: row.revision,
      p_allocation_data: prepared.workspace,
      p_total_cost: totals.totalCost,
      p_total_capacity: totals.totalCapacity,
      p_version_id: prepared.version.id,
      p_version_label: prepared.version.label,
      p_version_changes: prepared.version.changes,
    })
    .single();

  if (error) throwAllocationRpcError(error);
  return data as AllocationWorkspaceRow;
};

export const getActiveDepartureCount = async (allocationId: string) => {
  const { count, error } = await supabase
    .from('boarding_bus_departures')
    .select('id', { count: 'exact', head: true })
    .eq('allocation_id', allocationId)
    .is('cancelled_at', null);

  if (error) throw error;
  return count ?? 0;
};

export const saveConfirmedWorkspaceChanges = async (
  row: AllocationWorkspaceRow,
  workspace: AllocationWorkspaceData,
  actorId: string
) => {
  const validation = validateWorkspace(workspace);
  const belowMinimumBusIds = getBelowMinimumBusIds(workspace);
  const outOfPreferencePassengerIds = getOutOfPreferencePassengerIds(workspace);
  if (validation.errors.length > 0) throw new Error(validation.errors[0]);
  if (belowMinimumBusIds.length > 0 && !workspace.allowMinimumPassengerOverride) {
    throw new Error('최소 탑승 인원 미달 경고를 예외 승인해야 합니다.');
  }
  if (
    outOfPreferencePassengerIds.length > 0 &&
    !workspace.allowOutOfPreferenceOverride
  ) {
    throw new Error('1·2지망 외 배정 경고를 별도로 승인해야 합니다.');
  }

  const prepared = prepareWorkspaceForSave(
    row.allocation_data,
    workspace,
    actorId,
    '확정 배차 수정사항을 즉시 반영했습니다.'
  );
  const totals = getWorkspaceTotals(prepared.workspace);
  const { data, error } = await supabase
    .rpc('save_confirmed_allocation_workspace_v3', {
      p_allocation_id: row.id,
      p_expected_revision: row.revision,
      p_allocation_data: prepared.workspace,
      p_total_cost: totals.totalCost,
      p_total_capacity: totals.totalCapacity,
      p_version_id: prepared.version.id,
      p_version_label: prepared.version.label,
      p_version_changes: prepared.version.changes,
    })
    .single();

  if (error) throwAllocationRpcError(error);
  return data as AllocationWorkspaceRow;
};

export const removeCancelledPassengerFromConfirmedWorkspace = async (
  reservationId: string,
  _actorId?: string
) => {
  void _actorId;
  const { error } = await supabase.rpc(
    'remove_cancelled_passenger_from_confirmed_allocations',
    { p_reservation_id: reservationId }
  );

  if (error) throwAllocationRpcError(error);
};
