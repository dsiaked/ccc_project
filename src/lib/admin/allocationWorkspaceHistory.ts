export interface AllocationHistoryBus {
  id: string;
  label: string;
  capacity: number;
  price: number;
  destination: string;
  departureTime: string;
  boardingPlace: string;
  minimumPassengers: number;
}

export interface AllocationHistoryPassenger {
  reservationId: string;
  name: string;
  busId: string | null;
  seatNumber: number | null;
}

export interface AllocationHistorySnapshot {
  buses: AllocationHistoryBus[];
  passengers: AllocationHistoryPassenger[];
}

const MAX_INDIVIDUAL_DETAILS = 10;

const formatValue = (value: string | number) =>
  value === '' ? '미설정' : String(value);

const formatAssignment = (
  passenger: AllocationHistoryPassenger,
  busById: Map<string, AllocationHistoryBus>
) => {
  if (!passenger.busId) return '미배차';
  const bus = busById.get(passenger.busId);
  return `${bus?.label ?? '삭제된 버스'} ${
    passenger.seatNumber === null ? '좌석 미지정' : `${passenger.seatNumber}번`
  }`;
};

export const describeAllocationWorkspaceChanges = (
  previous: AllocationHistorySnapshot | undefined,
  current: AllocationHistorySnapshot
) => {
  if (!previous) {
    return [
      `최초 저장 상태: 버스 ${current.buses.length}대, 탑승자 ${current.passengers.length}명.`,
    ];
  }

  const previousBusById = new Map(previous.buses.map((bus) => [bus.id, bus]));
  const currentBusById = new Map(current.buses.map((bus) => [bus.id, bus]));
  const individualDetails: string[] = [];
  let changedBusCount = 0;

  const addedBuses = current.buses.filter((bus) => !previousBusById.has(bus.id));
  const removedBuses = previous.buses.filter((bus) => !currentBusById.has(bus.id));

  current.buses.forEach((bus) => {
    const oldBus = previousBusById.get(bus.id);
    if (!oldBus) return;

    const changes = [
      ['이름', oldBus.label, bus.label],
      ['행선지', oldBus.destination, bus.destination],
      ['출발 일시', oldBus.departureTime, bus.departureTime],
      ['탑승장소', oldBus.boardingPlace, bus.boardingPlace],
      ['정원', oldBus.capacity, bus.capacity],
      ['비용', oldBus.price, bus.price],
      ['최소 탑승 인원', oldBus.minimumPassengers, bus.minimumPassengers],
    ]
      .filter(([, before, after]) => before !== after)
      .map(
        ([field, before, after]) =>
          `${field} ${formatValue(before)} → ${formatValue(after)}`
      );

    if (changes.length > 0) {
      changedBusCount += 1;
      individualDetails.push(`${oldBus.label}: ${changes.join(', ')}`);
    }
  });

  addedBuses.forEach((bus) => {
    individualDetails.push(
      `${bus.label} 추가: ${formatValue(bus.destination)}, ${bus.capacity}석`
    );
  });
  removedBuses.forEach((bus) => {
    individualDetails.push(`${bus.label} 삭제`);
  });

  const previousPassengerById = new Map(
    previous.passengers.map((passenger) => [passenger.reservationId, passenger])
  );
  const currentPassengerById = new Map(
    current.passengers.map((passenger) => [passenger.reservationId, passenger])
  );
  const addedPassengers = current.passengers.filter(
    (passenger) => !previousPassengerById.has(passenger.reservationId)
  );
  const removedPassengers = previous.passengers.filter(
    (passenger) => !currentPassengerById.has(passenger.reservationId)
  );
  let movedPassengerCount = 0;
  let seatChangedPassengerCount = 0;

  current.passengers.forEach((passenger) => {
    const oldPassenger = previousPassengerById.get(passenger.reservationId);
    if (!oldPassenger) return;

    const busChanged = oldPassenger.busId !== passenger.busId;
    const seatChanged = oldPassenger.seatNumber !== passenger.seatNumber;
    if (!busChanged && !seatChanged) return;

    if (busChanged) movedPassengerCount += 1;
    else seatChangedPassengerCount += 1;

    individualDetails.push(
      `${passenger.name}: ${formatAssignment(
        oldPassenger,
        previousBusById
      )} → ${formatAssignment(passenger, currentBusById)}`
    );
  });

  addedPassengers.forEach((passenger) => {
    individualDetails.push(
      `${passenger.name} 탑승자 추가: ${formatAssignment(passenger, currentBusById)}`
    );
  });
  removedPassengers.forEach((passenger) => {
    individualDetails.push(`${passenger.name} 탑승자 제외`);
  });

  const summaries: string[] = [];
  if (addedBuses.length || removedBuses.length || changedBusCount) {
    summaries.push(
      `버스 변경: 추가 ${addedBuses.length}대, 삭제 ${removedBuses.length}대, 설정 수정 ${changedBusCount}대.`
    );
  }
  if (
    addedPassengers.length ||
    removedPassengers.length ||
    movedPassengerCount ||
    seatChangedPassengerCount
  ) {
    summaries.push(
      `탑승자 변경: 추가 ${addedPassengers.length}명, 제외 ${removedPassengers.length}명, 호차 이동 ${movedPassengerCount}명, 좌석 변경 ${seatChangedPassengerCount}명.`
    );
  }

  if (summaries.length === 0) {
    return ['직전 저장 버전과 배차 구성 변경이 없습니다.'];
  }

  const visibleDetails = individualDetails.slice(0, MAX_INDIVIDUAL_DETAILS);
  const hiddenCount = individualDetails.length - visibleDetails.length;
  return [
    ...summaries,
    ...visibleDetails,
    ...(hiddenCount > 0 ? [`그 외 개별 변경 ${hiddenCount}건.`] : []),
  ];
};
