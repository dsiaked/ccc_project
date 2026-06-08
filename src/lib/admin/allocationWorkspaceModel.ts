import { describeAllocationWorkspaceChanges } from './allocationWorkspaceHistory.js';

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
  schemaVersion: 1 | 2;
  status: 'draft' | 'confirmed' | 'archived';
  sourceAllocation: Record<string, unknown>;
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

export interface WorkspaceValidation {
  errors: string[];
  warnings: string[];
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const uniqueId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

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

export const isRemainingSeatPassenger = (
  passenger: AllocationWorkspacePassenger
) =>
  passenger.source === 'remaining_seat' ||
  passenger.remainingSeatStatus !== undefined;

export const mergeActivePassengersIntoDraft = (
  workspace: AllocationWorkspaceData,
  activePassengers: AllocationWorkspacePassenger[]
) => {
  if (workspace.status !== 'draft') return workspace;

  const previousById = new Map(
    workspace.passengers.map((passenger) => [passenger.reservationId, passenger])
  );
  const activeById = new Map(
    activePassengers.map((passenger) => [passenger.reservationId, passenger])
  );
  const buses = clone(workspace.buses);
  const passengers = [
    ...workspace.passengers
      .filter((passenger) => activeById.has(passenger.reservationId))
      .map((passenger) => {
        const activePassenger = activeById.get(passenger.reservationId)!;
        return {
          ...activePassenger,
          busId: passenger.busId,
          seatNumber: passenger.seatNumber,
        };
      }),
    ...activePassengers
      .filter((passenger) => !previousById.has(passenger.reservationId))
      .map((passenger) => ({
        ...passenger,
        busId: null,
        seatNumber: null,
      })),
  ];
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
        detail: `활성 예약을 반영했습니다. 신규 ${newPassengerIds.size}명, 취소 승객 ${cancelledCount}명, 자동 추가 버스 ${addedBusCount}대.`,
      },
    ],
  };
};

export const getWorkspaceTotals = (workspace: AllocationWorkspaceData) => ({
  totalCost: workspace.buses.reduce((sum, bus) => sum + bus.price, 0),
  totalCapacity: workspace.buses.reduce((sum, bus) => sum + bus.capacity, 0),
});

export const getFirstChoiceCoverage = (workspace: AllocationWorkspaceData) => {
  const regularPassengers = workspace.passengers.filter(
    (passenger) => !isRemainingSeatPassenger(passenger)
  );
  if (regularPassengers.length === 0) return 0;
  const busById = new Map(workspace.buses.map((bus) => [bus.id, bus]));

  const firstChoiceCount = regularPassengers.filter((passenger) => {
    const bus = passenger.busId ? busById.get(passenger.busId) : undefined;
    return bus?.destination === passenger.preferences[0];
  }).length;

  return (firstChoiceCount / regularPassengers.length) * 100;
};

export const getOutOfPreferencePassengerIds = (
  workspace: AllocationWorkspaceData
) => {
  const busById = new Map(workspace.buses.map((bus) => [bus.id, bus]));
  return workspace.passengers
    .filter((passenger) => {
      if (isRemainingSeatPassenger(passenger)) return false;
      const bus = passenger.busId ? busById.get(passenger.busId) : undefined;
      return Boolean(bus && !passenger.preferences.includes(bus.destination));
    })
    .map((passenger) => passenger.reservationId);
};

export const getBelowMinimumBusIds = (workspace: AllocationWorkspaceData) => {
  const passengerCountByBus = new Map<string, number>();
  workspace.passengers.forEach((passenger) => {
    if (!passenger.busId) return;
    passengerCountByBus.set(
      passenger.busId,
      (passengerCountByBus.get(passenger.busId) ?? 0) + 1
    );
  });
  return workspace.buses
    .filter(
      (bus) => (passengerCountByBus.get(bus.id) ?? 0) < bus.minimumPassengers
    )
    .map((bus) => bus.id);
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

  if (workspace.buses.some((bus) => !bus.departureTime.trim())) {
    errors.push('출발 시간이 없습니다.');
  }
  if (workspace.buses.some((bus) => !bus.boardingPlace.trim())) {
    errors.push('탑승 장소가 없습니다.');
  }

  workspace.buses.forEach((bus) => {
    if (!bus.label.trim()) errors.push('이름 없는 버스가 있습니다.');
    if (labels.has(bus.label.trim())) {
      errors.push(`버스 이름이 중복되었습니다: ${bus.label}`);
    }
    labels.add(bus.label.trim());

    if (!bus.destination.trim()) {
      errors.push(`${bus.label}: 도착지가 없습니다.`);
    }

    const passengers = passengersByBus.get(bus.id) ?? [];
    const seats = new Set<number>();

    if (passengers.length > bus.capacity) {
      errors.push(
        `${bus.label}: 정원이 ${passengers.length - bus.capacity}명 초과되었습니다.`
      );
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
          `${passenger.name}: ${bus.destination}은 1·2지망 선택지가 아닙니다. 관리자 확인이 필요합니다.`
        );
      }

      if (
        passenger.seatNumber === null ||
        passenger.seatNumber < 1 ||
        passenger.seatNumber > bus.capacity
      ) {
        errors.push(`${passenger.name}: 유효한 좌석 번호가 필요합니다.`);
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
        `${bus.capacity}인승 버스는 최대 ${bus.maxAvailableCount}대까지 사용할 수 있습니다.`
      );
    }
  });

  workspace.passengers.forEach((passenger) => {
    if (assignedReservationIds.has(passenger.reservationId)) {
      errors.push(`${passenger.name}: 중복 배정되었습니다.`);
    }
    assignedReservationIds.add(passenger.reservationId);

    if (!passenger.busId) {
      errors.push(`${passenger.name}: 미배차 상태입니다.`);
    } else if (!busIds.has(passenger.busId)) {
      errors.push(`${passenger.name}: 존재하지 않는 버스에 배정되었습니다.`);
    }
    if (
      !isRemainingSeatPassenger(passenger) &&
      passenger.preferences.length < 2
    ) {
      errors.push(`${passenger.name}: 1·2지망 선택지 정보가 필요합니다.`);
    }
  });

  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
};

export const describeDraftSaveChanges = (
  previous: Pick<AllocationWorkspaceData, 'buses' | 'passengers'> | undefined,
  current: Pick<AllocationWorkspaceData, 'buses' | 'passengers'>
) => describeAllocationWorkspaceChanges(previous, current);
