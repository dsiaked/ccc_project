export type PassengerQuickFilter =
  | 'all'
  | 'unassigned'
  | 'errors'
  | 'remaining-seat'
  | 'remaining-seat-pending'
  | 'first-choice-missed'
  | 'seat-missing';

export type BusOccupancyFilter = 'all' | 'available' | 'full' | 'over';
export type SharedBusField = 'departureTime' | 'boardingPlace';
export type BusIssueField =
  | 'label'
  | 'destination'
  | 'departureTime'
  | 'boardingPlace'
  | 'capacity'
  | 'availability';
export type PassengerIssueField = 'assignment' | 'seat' | 'preferences';

export interface WorkspaceIssueTargets {
  busIds: Set<string>;
  busFields: Map<string, Set<BusIssueField>>;
  passengerIds: Set<string>;
  passengerFields: Map<string, Set<PassengerIssueField>>;
  hasUnassignedIssue: boolean;
}

export const BUS_OCCUPANCY_FILTERS: Array<{
  id: BusOccupancyFilter;
  label: string;
}> = [
  { id: 'all', label: '전체' },
  { id: 'available', label: '자리 있음' },
  { id: 'full', label: '만석' },
  { id: 'over', label: '정원 초과' },
];

export const PASSENGER_QUICK_FILTERS: Array<{
  id: PassengerQuickFilter;
  label: string;
}> = [
  { id: 'all', label: '전체' },
  { id: 'unassigned', label: '미배차' },
  { id: 'errors', label: '오류 있음' },
  { id: 'remaining-seat', label: '잔여좌석' },
  { id: 'remaining-seat-pending', label: '입금 대기' },
  { id: 'first-choice-missed', label: '1지망 미반영' },
  { id: 'seat-missing', label: '좌석 미지정' },
];

const VALIDATION_ERROR_GROUPS = [
  {
    id: 'unassigned',
    title: '1. 미배차 승객',
    description: '버스가 지정되지 않은 승객을 먼저 배차하세요.',
    matches: (error: string) => error.includes('미배차 상태'),
  },
  {
    id: 'capacity-seat',
    title: '2. 정원·좌석 오류',
    description: '정원 초과와 잘못되거나 중복된 좌석을 해결하세요.',
    matches: (error: string) =>
      error.includes('정원을') ||
      error.includes('좌석') ||
      error.includes('유효한 좌석 번호'),
  },
  {
    id: 'bus-information',
    title: '3. 버스 정보·운행 조건',
    description: '필수 버스 정보와 사용 가능 대수를 확인하세요.',
    matches: (error: string) =>
      error.includes('이름이 없는 버스') ||
      error.includes('버스 이름이 중복') ||
      error.includes('행선지가 없습니다') ||
      error.includes('출발 시간이 없습니다') ||
      error.includes('탑승 장소가 없습니다') ||
      error.includes('최대'),
  },
  {
    id: 'assignment-preference',
    title: '4. 지망·배차 오류',
    description: '승객 지망 정보와 배차 대상을 확인하세요.',
    matches: (error: string) =>
      error.includes('1·2지망') ||
      error.includes('중복 배차') ||
      error.includes('존재하지 않는 버스'),
  },
] as const;

export const groupValidationErrors = (errors: string[]) => {
  const remaining = [...errors];
  const groups: Array<{
    id: string;
    title: string;
    description: string;
    items: string[];
  }> = VALIDATION_ERROR_GROUPS.map((group) => {
    const items = remaining.filter(group.matches);
    items.forEach((item) => remaining.splice(remaining.indexOf(item), 1));
    return { ...group, items };
  }).filter((group) => group.items.length > 0);

  if (remaining.length > 0) {
    groups.push({
      id: 'other',
      title: '5. 기타 오류',
      description: '나머지 차단 오류를 확인하세요.',
      items: remaining,
    });
  }

  return groups;
};

type ConfirmationPreflightKey =
  | 'workspace_status'
  | 'payload_structure'
  | 'bus_details'
  | 'assignments'
  | 'unique_reservations'
  | 'unique_seats'
  | 'active_reservations';

export const CONFIRMATION_PREFLIGHT_LABELS: Record<
  ConfirmationPreflightKey,
  string
> = {
  workspace_status: '배차안 저장 상태',
  payload_structure: '배차안 데이터 구조',
  bus_details: '버스 필수 정보',
  assignments: '승객 배차·좌석·행선지',
  unique_reservations: '승객 중복 배차',
  unique_seats: '좌석 중복 배정',
  active_reservations: '최신 활성 신청자 일치',
};

export const getAllocationWorkspaceErrorMessage = (
  error: unknown,
  fallback: string
) => {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return fallback;
};

export const cloneAllocationWorkspaceValue = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

interface PassengerSortValue {
  campus: string;
  team: string;
  name: string;
  reservationId: string;
}

export const comparePassengersByCampusAndTeam = (
  left: PassengerSortValue,
  right: PassengerSortValue
) =>
  left.campus.localeCompare(right.campus, 'ko') ||
  left.team.localeCompare(right.team, 'ko') ||
  left.name.localeCompare(right.name, 'ko') ||
  left.reservationId.localeCompare(right.reservationId);

interface SharedBusValue {
  departureTime: string;
  boardingPlace: string;
}

export const getSharedBusField = (
  buses: SharedBusValue[],
  field: SharedBusField
) => {
  const values = new Set(buses.map((bus) => bus[field]));
  return {
    value: values.size === 1 ? buses[0]?.[field] ?? '' : '',
    isMixed: values.size > 1,
  };
};

interface SeatWorkspace {
  buses: Array<{ id: string; capacity: number }>;
  passengers: Array<{ busId: string | null; seatNumber: number | null }>;
}

export const getNextSeatNumber = (workspace: SeatWorkspace, busId: string) => {
  const bus = workspace.buses.find((item) => item.id === busId);
  if (!bus) return null;

  const used = new Set(
    workspace.passengers
      .filter((passenger) => passenger.busId === busId)
      .map((passenger) => passenger.seatNumber)
      .filter((seat): seat is number => seat !== null)
  );

  return (
    Array.from({ length: bus.capacity }, (_, index) => index + 1).find(
      (seat) => !used.has(seat)
    ) ?? null
  );
};

interface IssueWorkspacePassenger {
  reservationId: string;
  preferences: string[];
  source?: 'regular' | 'remaining_seat' | 'admin';
  remainingSeatStatus?: 'pending_payment' | 'confirmed';
  busId: string | null;
  seatNumber: number | null;
}

interface IssueWorkspaceBus {
  id: string;
  optionId?: string;
  label: string;
  capacity: number;
  price: number;
  maxAvailableCount?: number;
  destination: string;
}

interface IssueWorkspace {
  buses: IssueWorkspaceBus[];
  passengers: IssueWorkspacePassenger[];
}

const isRemainingSeatPassenger = (passenger: IssueWorkspacePassenger) =>
  passenger.source === 'remaining_seat' ||
  passenger.remainingSeatStatus !== undefined;

export const getWorkspaceIssueTargets = (
  workspace: IssueWorkspace | null
): WorkspaceIssueTargets => {
  const targets: WorkspaceIssueTargets = {
    busIds: new Set(),
    busFields: new Map(),
    passengerIds: new Set(),
    passengerFields: new Map(),
    hasUnassignedIssue: false,
  };
  if (!workspace) return targets;

  const addBusIssue = (busId: string, field: BusIssueField) => {
    targets.busIds.add(busId);
    const fields = targets.busFields.get(busId) ?? new Set<BusIssueField>();
    fields.add(field);
    targets.busFields.set(busId, fields);
  };
  const addPassengerIssue = (
    passengerId: string,
    field: PassengerIssueField
  ) => {
    targets.passengerIds.add(passengerId);
    const fields =
      targets.passengerFields.get(passengerId) ??
      new Set<PassengerIssueField>();
    fields.add(field);
    targets.passengerFields.set(passengerId, fields);
  };
  const labelCounts = new Map<string, number>();
  const optionCounts = new Map<string, number>();
  const reservationCounts = new Map<string, number>();
  const busIds = new Set(workspace.buses.map((bus) => bus.id));
  const passengersByBus = new Map<string, IssueWorkspacePassenger[]>();

  workspace.buses.forEach((bus) => {
    const label = bus.label.trim();
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    const optionKey = bus.optionId ?? `${bus.capacity}:${bus.price}`;
    optionCounts.set(optionKey, (optionCounts.get(optionKey) ?? 0) + 1);
  });
  workspace.passengers.forEach((passenger) => {
    reservationCounts.set(
      passenger.reservationId,
      (reservationCounts.get(passenger.reservationId) ?? 0) + 1
    );
    if (passenger.busId) {
      const assigned = passengersByBus.get(passenger.busId) ?? [];
      assigned.push(passenger);
      passengersByBus.set(passenger.busId, assigned);
    }
  });

  workspace.buses.forEach((bus) => {
    if (!bus.label.trim() || (labelCounts.get(bus.label.trim()) ?? 0) > 1) {
      addBusIssue(bus.id, 'label');
    }
    if (!bus.destination.trim()) addBusIssue(bus.id, 'destination');

    const passengers = passengersByBus.get(bus.id) ?? [];
    if (passengers.length > bus.capacity) addBusIssue(bus.id, 'capacity');

    const optionKey = bus.optionId ?? `${bus.capacity}:${bus.price}`;
    if (
      bus.maxAvailableCount !== undefined &&
      (optionCounts.get(optionKey) ?? 0) > bus.maxAvailableCount
    ) {
      addBusIssue(bus.id, 'availability');
    }

    const seatCounts = new Map<number, number>();
    passengers.forEach((passenger) => {
      if (passenger.seatNumber !== null) {
        seatCounts.set(
          passenger.seatNumber,
          (seatCounts.get(passenger.seatNumber) ?? 0) + 1
        );
      }
    });
    passengers.forEach((passenger) => {
      if (
        !isRemainingSeatPassenger(passenger) &&
        !passenger.preferences.includes(bus.destination)
      ) {
        addPassengerIssue(passenger.reservationId, 'assignment');
        addPassengerIssue(passenger.reservationId, 'preferences');
      }
      if (
        passenger.seatNumber === null ||
        passenger.seatNumber < 1 ||
        passenger.seatNumber > bus.capacity ||
        (seatCounts.get(passenger.seatNumber) ?? 0) > 1
      ) {
        addPassengerIssue(passenger.reservationId, 'seat');
      }
    });
  });

  workspace.passengers.forEach((passenger) => {
    if ((reservationCounts.get(passenger.reservationId) ?? 0) > 1) {
      addPassengerIssue(passenger.reservationId, 'assignment');
    }
    if (!passenger.busId || !busIds.has(passenger.busId)) {
      addPassengerIssue(passenger.reservationId, 'assignment');
      targets.hasUnassignedIssue ||= !passenger.busId;
    }
    if (
      !isRemainingSeatPassenger(passenger) &&
      passenger.preferences.length < 2
    ) {
      addPassengerIssue(passenger.reservationId, 'preferences');
    }
  });

  return targets;
};
