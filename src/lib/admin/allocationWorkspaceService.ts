import { supabase } from '../supabase';
import type { BusAllocationResult } from './busAllocationAlgorithm';
import type {
  ConfirmedTicket,
  ReturnBusReservation,
  StationPreference,
} from '../../types/reservation';

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

export interface WorkspaceValidation {
  errors: string[];
  warnings: string[];
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

const getPreferences = (row: ReservationRow) => {
  const saved = row.data?.stationPreferences ?? row.station_preferences ?? [];

  return saved
    .filter((preference) => preference.rank === 1 || preference.rank === 2)
    .sort((a, b) => a.rank - b.rank)
    .map((preference) => preference.station.name);
};

const getActiveReservationRows = async () => {
  const { data, error } = await supabase
    .from('reservations')
    .select('id, name, campus, team, station_preferences, status, data')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ReservationRow[];
};

export const getWorkspaceTotals = (workspace: AllocationWorkspaceData) => ({
  totalCost: workspace.buses.reduce((sum, bus) => sum + bus.price, 0),
  totalCapacity: workspace.buses.reduce((sum, bus) => sum + bus.capacity, 0),
});

export const getFirstChoiceCoverage = (workspace: AllocationWorkspaceData) => {
  if (workspace.passengers.length === 0) return 0;

  const firstChoiceCount = workspace.passengers.filter((passenger) => {
    const bus = workspace.buses.find((item) => item.id === passenger.busId);
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

  workspace.buses.forEach((bus) => {
    if (!bus.label.trim()) errors.push('이름이 없는 버스가 있습니다.');
    if (labels.has(bus.label.trim())) {
      errors.push(`버스 이름이 중복되었습니다: ${bus.label}`);
    }
    labels.add(bus.label.trim());

    if (!bus.destination.trim()) errors.push(`${bus.label}: 도착역이 없습니다.`);
    if (!bus.departureTime.trim()) errors.push(`${bus.label}: 출발 시간이 없습니다.`);
    if (!bus.boardingPlace.trim()) errors.push(`${bus.label}: 탑승 장소가 없습니다.`);

    const passengers = workspace.passengers.filter(
      (passenger) => passenger.busId === bus.id
    );
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
    } else if (!workspace.buses.some((bus) => bus.id === passenger.busId)) {
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

  allocation.routePlan.forEach((route) => {
    route.destinations.forEach((destination, destinationIndex) => {
      const option = (optionRows ?? []).find(
        (item) =>
          item.capacity === route.capacity &&
          item.estimated_price === route.price
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

  const passengers: AllocationWorkspacePassenger[] = reservationRows.map((row) => ({
    reservationId: row.id,
    name: row.data?.name ?? row.name ?? '-',
    campus: row.data?.campus ?? row.campus ?? '-',
    team: row.data?.team ?? row.team ?? '-',
    preferences: getPreferences(row),
    busId: null,
    seatNumber: null,
  }));

  const groupedPassengers = [...passengers].sort(
    (a, b) =>
      a.campus.localeCompare(b.campus, 'ko') ||
      a.team.localeCompare(b.team, 'ko') ||
      a.name.localeCompare(b.name, 'ko')
  );

  groupedPassengers.forEach((passenger) => {
    const candidates = buses
      .filter((bus) => passenger.preferences.includes(bus.destination))
      .map((bus) => ({
        bus,
        count: passengers.filter((item) => item.busId === bus.id).length,
        groupCount: passengers.filter(
          (item) =>
            item.busId === bus.id &&
            item.campus === passenger.campus &&
            item.team === passenger.team
        ).length,
        rank: passenger.preferences.indexOf(bus.destination),
      }))
      .filter(({ bus, count }) => count < bus.capacity)
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          b.groupCount - a.groupCount ||
          a.count - b.count ||
          a.bus.label.localeCompare(b.bus.label, 'ko')
      );
    const selected = candidates[0]?.bus;

    if (!selected) return;

    const usedSeats = new Set(
      passengers
        .filter((item) => item.busId === selected.id && item.seatNumber !== null)
        .map((item) => item.seatNumber)
    );
    const seatNumber = Array.from(
      { length: selected.capacity },
      (_, index) => index + 1
    ).find((seat) => !usedSeats.has(seat));

    passenger.busId = selected.id;
    passenger.seatNumber = seatNumber ?? null;
  });

  const now = new Date().toISOString();
  const workspace: AllocationWorkspaceData = {
    schemaVersion: 1,
    status: 'draft',
    sourceAllocation: allocation,
    buses,
    passengers,
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

export const getAllocationWorkspaces = async () => {
  const { data, error } = await supabase
    .from('bus_allocations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).filter(
    (row) => (row.allocation_data as AllocationWorkspaceData | null)?.schemaVersion === 1
  ) as AllocationWorkspaceRow[];
};

export const saveAllocationWorkspace = async (
  row: AllocationWorkspaceRow,
  workspace: AllocationWorkspaceData,
  actorId: string,
  detail = '배차안 변경사항을 저장했습니다.'
) => {
  const now = new Date().toISOString();
  const nextWorkspace = clone(workspace);
  nextWorkspace.versions = [
    ...nextWorkspace.versions,
    {
      id: uniqueId('version'),
      createdAt: now,
      actorId,
      label: `저장 ${nextWorkspace.versions.length + 1}`,
      buses: clone(workspace.buses),
      passengers: clone(workspace.passengers),
    },
  ];
  nextWorkspace.history = [
    ...nextWorkspace.history,
    {
      id: uniqueId('history'),
      at: now,
      actorId,
      action: 'draft_saved',
      detail,
    },
  ];
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

const buildReservationData = (
  row: ReservationRow,
  ticket: ConfirmedTicket
): ReturnBusReservation => {
  const updatedAt = new Date().toISOString();

  return {
    ...(row.data ?? {}),
    id: row.id,
    name: row.data?.name ?? row.name ?? '-',
    phone: row.data?.phone ?? '',
    district: row.data?.district ?? '',
    team: row.data?.team ?? row.team ?? '',
    campus: row.data?.campus ?? row.campus ?? '',
    stationPreferences: row.data?.stationPreferences ?? row.station_preferences ?? [],
    status: 'confirmed',
    confirmedTicket: ticket,
    requestedAt: row.data?.requestedAt ?? updatedAt,
    updatedAt,
  };
};

const syncConfirmedTickets = async (workspace: AllocationWorkspaceData) => {
  const reservationRows = await getActiveReservationRows();
  const rowById = new Map(reservationRows.map((row) => [row.id, row]));
  const passengerIds = new Set(
    workspace.passengers.map((passenger) => passenger.reservationId)
  );

  if (
    reservationRows.length !== workspace.passengers.length ||
    reservationRows.some((row) => !passengerIds.has(row.id))
  ) {
    throw new Error(
      '임시 배차안 생성 후 예매 인원이 변경되었습니다. 모든 현재 예매 승객을 반영한 뒤 확정해주세요.'
    );
  }

  await Promise.all(
    workspace.passengers.map(async (passenger) => {
      const bus = workspace.buses.find((item) => item.id === passenger.busId);
      const row = rowById.get(passenger.reservationId);
      if (!bus || !row || passenger.seatNumber === null) return;

      const ticket: ConfirmedTicket = {
        busNumber: bus.label,
        seatNumber: String(passenger.seatNumber),
        departureTime: bus.departureTime,
        boardingPlace: bus.boardingPlace,
        dropoffStation: bus.destination,
        confirmedAt: new Date().toISOString(),
      };
      const nextData = buildReservationData(row, ticket);
      const { error } = await supabase
        .from('reservations')
        .update({
          status: 'confirmed',
          confirmed_ticket: ticket,
          data: nextData,
          updated_at: nextData.updatedAt,
        })
        .eq('id', passenger.reservationId);

      if (error) throw error;
    })
  );
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

  await syncConfirmedTickets(workspace);

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
  const saved = await saveAllocationWorkspace(
    row,
    nextWorkspace,
    actorId,
    '확정 배차 상태를 저장했습니다.'
  );

  const otherConfirmed = (await getAllocationWorkspaces()).filter(
    (item) => item.id !== row.id && item.allocation_data.status === 'confirmed'
  );
  await Promise.all(
    otherConfirmed.map(async (item) => {
      const archived: AllocationWorkspaceData = {
        ...clone(item.allocation_data),
        status: 'archived',
        passengers: item.allocation_data.passengers.map((passenger, index) => ({
          ...passenger,
          reservationId: `anonymous-${index + 1}`,
          name: `승객 A-${String(index + 1).padStart(3, '0')}`,
          campus: '',
          team: '',
        })),
        versions: [],
        history: [
          ...item.allocation_data.history,
          {
            id: uniqueId('history'),
            at: now,
            actorId,
            action: 'archived',
            detail: '새 배차 확정에 따라 승객 정보를 익명화하고 과거 기록으로 보관했습니다.',
          },
        ],
      };
      const { error: archiveError } = await supabase
        .from('bus_allocations')
        .update({ allocation_data: archived })
        .eq('id', item.id);
      if (archiveError) throw archiveError;
    })
  );

  const { error } = await supabase
    .from('bus_allocations')
    .delete()
    .neq('id', row.id)
    .filter('allocation_data->>status', 'eq', 'draft');

  if (error) console.error('Failed to delete unused draft allocations:', error);
  return saved;
};

export const cancelConfirmedWorkspace = async (
  row: AllocationWorkspaceRow,
  workspace: AllocationWorkspaceData,
  actorId: string
) => {
  const reservationRows = await getActiveReservationRows();
  await Promise.all(
    reservationRows.map(async (reservation) => {
      const updatedAt = new Date().toISOString();
      const nextData = {
        ...(reservation.data ?? {}),
        status: 'requested',
        confirmedTicket: undefined,
        updatedAt,
      };
      const { error } = await supabase
        .from('reservations')
        .update({
          status: 'requested',
          confirmed_ticket: null,
          data: JSON.parse(JSON.stringify(nextData)),
          updated_at: updatedAt,
        })
        .eq('id', reservation.id);

      if (error) throw error;
    })
  );

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

  return saveAllocationWorkspace(
    row,
    nextWorkspace,
    actorId,
    '확정 취소 상태를 저장했습니다.'
  );
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

  await syncConfirmedTickets(workspace);
  return saveAllocationWorkspace(
    row,
    workspace,
    actorId,
    '확정 배차 수정사항을 즉시 반영했습니다.'
  );
};

export const removeCancelledPassengerFromConfirmedWorkspace = async (
  reservationId: string,
  actorId: string
) => {
  const confirmedRows = (await getAllocationWorkspaces()).filter(
    (row) => row.allocation_data.status === 'confirmed'
  );

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
