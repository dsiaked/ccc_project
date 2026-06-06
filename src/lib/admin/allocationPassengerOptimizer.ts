export interface OptimizerBus {
  id: string;
  label: string;
  capacity: number;
  price: number;
  destination: string;
}

export interface OptimizerPassenger {
  reservationId: string;
  preferences: string[];
  busId: string | null;
  seatNumber: number | null;
}

export interface GroupedOptimizerPassenger extends OptimizerPassenger {
  name: string;
  campus: string;
  team: string;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const getGroupKey = (passenger: GroupedOptimizerPassenger) =>
  `${passenger.campus}\u0000${passenger.team}`;

export const assignPassengersToPreferredBuses = <
  TBus extends OptimizerBus,
  TPassenger extends GroupedOptimizerPassenger,
>(
  inputBuses: TBus[],
  inputPassengers: TPassenger[]
) => {
  const buses = clone(inputBuses);
  const passengers = clone(inputPassengers);
  const occupancy = new Map(buses.map((bus) => [bus.id, 0]));
  const groupOccupancy = new Map<string, number>();
  const remainingByGroup = new Map<string, number>();
  const busesByDestination = new Map<string, TBus[]>();

  buses.forEach((bus) => {
    const destinationBuses = busesByDestination.get(bus.destination) ?? [];
    destinationBuses.push(bus);
    busesByDestination.set(bus.destination, destinationBuses);
  });
  passengers.forEach((passenger) => {
    const groupKey = getGroupKey(passenger);
    remainingByGroup.set(groupKey, (remainingByGroup.get(groupKey) ?? 0) + 1);
  });

  [...passengers]
    .sort(
      (a, b) =>
        a.campus.localeCompare(b.campus, 'ko') ||
        a.team.localeCompare(b.team, 'ko') ||
        a.name.localeCompare(b.name, 'ko')
    )
    .forEach((passenger) => {
      const groupKey = getGroupKey(passenger);
      const remainingGroupCount = remainingByGroup.get(groupKey) ?? 1;
      const candidates = passenger.preferences
        .flatMap((destination, rank) =>
          (busesByDestination.get(destination) ?? []).map((bus) => ({
            bus,
            rank,
            count: occupancy.get(bus.id) ?? 0,
            groupCount: groupOccupancy.get(`${bus.id}\u0000${groupKey}`) ?? 0,
            fitsRemainingGroup:
              bus.capacity - (occupancy.get(bus.id) ?? 0) >= remainingGroupCount,
          }))
        )
        .filter(({ bus, count }) => count < bus.capacity)
        .sort(
          (a, b) =>
            a.rank - b.rank ||
            Number(b.fitsRemainingGroup) - Number(a.fitsRemainingGroup) ||
            b.groupCount - a.groupCount ||
            a.count - b.count ||
            a.bus.label.localeCompare(b.bus.label, 'ko')
        );
      const selected = candidates[0]?.bus;

      if (!selected) {
        remainingByGroup.set(groupKey, remainingGroupCount - 1);
        return;
      }

      const nextCount = (occupancy.get(selected.id) ?? 0) + 1;
      passenger.busId = selected.id;
      passenger.seatNumber = nextCount;
      occupancy.set(selected.id, nextCount);
      const selectedGroupKey = `${selected.id}\u0000${groupKey}`;
      groupOccupancy.set(
        selectedGroupKey,
        (groupOccupancy.get(selectedGroupKey) ?? 0) + 1
      );
      remainingByGroup.set(groupKey, remainingGroupCount - 1);
    });

  return { buses, passengers };
};

const assignSeats = <TBus extends OptimizerBus, TPassenger extends OptimizerPassenger>(
  buses: TBus[],
  passengers: TPassenger[]
) => {
  const passengersByBus = new Map<string, TPassenger[]>();

  passengers.forEach((passenger) => {
    if (!passenger.busId) {
      passenger.seatNumber = null;
      return;
    }
    const assigned = passengersByBus.get(passenger.busId) ?? [];
    assigned.push(passenger);
    passengersByBus.set(passenger.busId, assigned);
  });

  buses.forEach((bus) => {
    (passengersByBus.get(bus.id) ?? [])
      .sort(
        (a, b) =>
          a.preferences.indexOf(bus.destination) -
            b.preferences.indexOf(bus.destination) ||
          a.reservationId.localeCompare(b.reservationId)
      )
      .forEach((passenger, index) => {
        passenger.seatNumber = index + 1;
      });
  });
};

export const optimizePassengerAssignmentsForMinimumCost = <
  TBus extends OptimizerBus,
  TPassenger extends OptimizerPassenger,
>(
  inputBuses: TBus[],
  inputPassengers: TPassenger[]
) => {
  const buses = clone(inputBuses);
  const passengers = clone(inputPassengers);
  const passengerById = new Map(
    passengers.map((passenger) => [passenger.reservationId, passenger])
  );
  let changed = true;

  while (changed) {
    changed = false;
    const occupancy = new Map(buses.map((bus) => [bus.id, 0]));
    passengers.forEach((passenger) => {
      if (passenger.busId && occupancy.has(passenger.busId)) {
        occupancy.set(passenger.busId, (occupancy.get(passenger.busId) ?? 0) + 1);
      }
    });
    const removableCandidates = [...buses].sort(
      (a, b) =>
        b.price - a.price ||
        (occupancy.get(a.id) ?? 0) - (occupancy.get(b.id) ?? 0)
    );

    for (const candidate of removableCandidates) {
      const movingPassengers = passengers.filter(
        (passenger) => passenger.busId === candidate.id
      );
      const fixedOccupancy = new Map(
        buses
          .filter((bus) => bus.id !== candidate.id)
          .map((bus) => [bus.id, occupancy.get(bus.id) ?? 0])
      );
      const alternativesByPassenger = new Map(
        movingPassengers.map((passenger) => [
          passenger.reservationId,
          buses
          .filter(
            (bus) =>
              bus.id !== candidate.id &&
              passenger.preferences.includes(bus.destination) &&
              (fixedOccupancy.get(bus.id) ?? 0) < bus.capacity
          )
          .sort(
            (a, b) =>
              passenger.preferences.indexOf(a.destination) -
                passenger.preferences.indexOf(b.destination) ||
              b.capacity -
                (fixedOccupancy.get(b.id) ?? 0) -
                (a.capacity - (fixedOccupancy.get(a.id) ?? 0)) ||
              a.price - b.price
          ),
        ])
      );
      const nextAssignments = new Map<string, string>();
      const assignedByBus = new Map<string, string[]>();
      const tryAssign = (passengerId: string, visitedBuses: Set<string>): boolean => {
        const alternatives = alternativesByPassenger.get(passengerId) ?? [];

        for (const bus of alternatives) {
          if (visitedBuses.has(bus.id)) continue;
          visitedBuses.add(bus.id);
          const assigned = assignedByBus.get(bus.id) ?? [];
          const availableSeats = bus.capacity - (fixedOccupancy.get(bus.id) ?? 0);

          if (assigned.length < availableSeats) {
            assigned.push(passengerId);
            assignedByBus.set(bus.id, assigned);
            nextAssignments.set(passengerId, bus.id);
            return true;
          }

          for (const displacedPassengerId of [...assigned]) {
            if (tryAssign(displacedPassengerId, visitedBuses)) {
              assigned.splice(assigned.indexOf(displacedPassengerId), 1, passengerId);
              nextAssignments.set(passengerId, bus.id);
              return true;
            }
          }
        }

        return false;
      };
      const canRemove = [...movingPassengers]
        .sort(
          (a, b) =>
            (alternativesByPassenger.get(a.reservationId)?.length ?? 0) -
              (alternativesByPassenger.get(b.reservationId)?.length ?? 0) ||
            a.reservationId.localeCompare(b.reservationId)
        )
        .every((passenger) =>
          tryAssign(passenger.reservationId, new Set<string>())
        );

      if (!canRemove) continue;

      nextAssignments.forEach((busId, reservationId) => {
        const passenger = passengerById.get(reservationId);
        if (passenger) passenger.busId = busId;
      });
      buses.splice(
        buses.findIndex((bus) => bus.id === candidate.id),
        1
      );
      changed = true;
      break;
    }
  }

  assignSeats(buses, passengers);
  const busById = new Map(buses.map((bus) => [bus.id, bus]));

  return {
    buses,
    passengers,
    totalCost: buses.reduce((sum, bus) => sum + bus.price, 0),
    firstChoiceCoverage:
      passengers.length === 0
        ? 0
        : (passengers.filter((passenger) => {
            const bus = passenger.busId ? busById.get(passenger.busId) : undefined;
            return bus?.destination === passenger.preferences[0];
          }).length /
            passengers.length) *
          100,
  };
};
