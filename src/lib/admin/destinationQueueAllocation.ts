export const DESTINATION_QUEUE_CAPACITY = 44;

export type AllocationStrategy = 'preassigned_bus' | 'destination_queue';

export interface DestinationQueuePassenger {
  reservationId: string;
  name: string;
  phone: string;
  campus: string;
  team: string;
  preferences: string[];
  assignedDestination: string;
  busId: null;
  seatNumber: null;
}

export interface DestinationQueueWorkspace {
  allocationStrategy: 'destination_queue';
  commonBoarding: {
    departureTime: string;
    boardingPlace: string;
  };
  buses: [];
  passengers: DestinationQueuePassenger[];
}

interface LegacyWorkspacePassenger {
  reservationId: string;
  name: string;
  phone: string;
  campus: string;
  team: string;
  preferences: string[];
  busId: string | null;
  seatNumber: number | null;
  assignedDestination?: string;
}

interface LegacyWorkspaceBus {
  id: string;
  destination: string;
  departureTime?: string;
  boardingPlace?: string;
}

export const isDestinationQueueWorkspace = (workspace: {
  allocationStrategy?: AllocationStrategy;
}) => workspace.allocationStrategy === 'destination_queue';

export const isSecondChoiceDestinationAssignment = (
  passenger: Pick<DestinationQueuePassenger, 'assignedDestination' | 'preferences'>
) =>
  passenger.assignedDestination !== passenger.preferences[0] &&
  passenger.assignedDestination === passenger.preferences[1];

export const convertToDestinationQueueWorkspace = <
  T extends {
    buses: LegacyWorkspaceBus[];
    passengers: LegacyWorkspacePassenger[];
    allocationStrategy?: AllocationStrategy;
    commonBoarding?: DestinationQueueWorkspace['commonBoarding'];
  },
>(
  workspace: T
): Omit<T, 'allocationStrategy' | 'commonBoarding' | 'buses' | 'passengers'> &
  DestinationQueueWorkspace => {
  const busById = new Map(workspace.buses.map((bus) => [bus.id, bus]));
  const commonBoarding = workspace.commonBoarding ?? {
    departureTime:
      workspace.buses.find((bus) => bus.departureTime?.trim())?.departureTime ??
      '',
    boardingPlace:
      workspace.buses.find((bus) => bus.boardingPlace?.trim())?.boardingPlace ??
      '',
  };

  return {
    ...structuredClone(workspace),
    allocationStrategy: 'destination_queue',
    commonBoarding,
    buses: [],
    passengers: workspace.passengers.map((passenger) => {
      const assignedDestination =
        passenger.assignedDestination ??
        (passenger.busId ? busById.get(passenger.busId)?.destination : '') ??
        passenger.preferences[0] ??
        '';

      return {
        ...passenger,
        assignedDestination,
        busId: null,
        seatNumber: null,
      };
    }),
  };
};

export const getDestinationQueueStats = (
  passengers: Array<Pick<DestinationQueuePassenger, 'assignedDestination' | 'preferences'>>
) => {
  const stats = new Map<
    string,
    {
      destination: string;
      passengerCount: number;
      firstChoiceCount: number;
      secondChoiceCount: number;
      expectedBusCount: number;
      remainderCount: number;
    }
  >();

  passengers.forEach((passenger) => {
    const destination = passenger.assignedDestination.trim();
    if (!destination) return;
    const current = stats.get(destination) ?? {
      destination,
      passengerCount: 0,
      firstChoiceCount: 0,
      secondChoiceCount: 0,
      expectedBusCount: 0,
      remainderCount: 0,
    };
    current.passengerCount += 1;
    if (passenger.preferences[0] === destination) current.firstChoiceCount += 1;
    if (isSecondChoiceDestinationAssignment(passenger)) current.secondChoiceCount += 1;
    current.expectedBusCount = Math.ceil(
      current.passengerCount / DESTINATION_QUEUE_CAPACITY
    );
    current.remainderCount =
      current.passengerCount % DESTINATION_QUEUE_CAPACITY;
    stats.set(destination, current);
  });

  return [...stats.values()].sort((left, right) =>
    left.destination.localeCompare(right.destination, 'ko')
  );
};

export const validateDestinationQueueWorkspace = (
  workspace: Pick<DestinationQueueWorkspace, 'commonBoarding' | 'passengers'>
) => {
  const errors: string[] = [];
  if (!workspace.commonBoarding.departureTime.trim()) {
    errors.push('공통 운영 시작 시간을 입력해주세요.');
  }
  if (!workspace.commonBoarding.boardingPlace.trim()) {
    errors.push('공통 탑승 장소를 입력해주세요.');
  }
  workspace.passengers.forEach((passenger) => {
    if (!passenger.assignedDestination.trim()) {
      errors.push(`${passenger.name}: 확정 행선지를 선택해주세요.`);
    }
  });
  return errors;
};
