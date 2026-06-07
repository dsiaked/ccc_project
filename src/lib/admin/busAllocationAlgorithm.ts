export type DestinationStats = Record<
  string,
  { rank1: number; rank2: number; total: number }
>;

export interface BusOptionInput {
  id: string;
  capacity: number;
  estimated_price: number;
  max_count?: number;
}

export interface BusAllocationResult {
  combination: Array<{ count: number; capacity: number; price: number }>;
  totalCost: number;
  totalCapacity: number;
  totalBuses: number;
  efficiency: number;
  emptySeats: number;
  costPerPerson: number;
  qualityScore: number;
  totalUtility?: number;
  netValue?: number;
  unservedPeople?: number;
  routePlan: Array<{
    busLabel: string;
    capacity: number;
    price: number;
    passengerCount: number;
    emptySeats: number;
    destinations: Array<{
      name: string;
      passengerCount: number;
      rank2Demand: number;
    }>;
  }>;
}

export type BusAllocationCalculateOptions = {
  firstChoiceWeight?: number;
  secondChoiceWeight?: number;
  usePreferenceUtility?: boolean;
  minimumPassengersPerBus?: number;
};

type RoutePlan = BusAllocationResult['routePlan'];
type SearchBus = { optionId: string; capacity: number; price: number };

const consolidateLowOccupancyRoutes = (
  routes: RoutePlan,
  minimumPassengersPerBus: number
) => {
  const nextRoutes = routes.map((route) => ({
    ...route,
    destinations: route.destinations.map((destination) => ({
      ...destination,
    })),
  }));
  let mergedBusCount = 0;

  while (nextRoutes.length > 1) {
    const sourceIndex = nextRoutes
      .map((route, index) => ({ route, index }))
      .filter(({ route }) => route.passengerCount < minimumPassengersPerBus)
      .sort(
        (a, b) =>
          a.route.passengerCount - b.route.passengerCount ||
          b.route.emptySeats - a.route.emptySeats
      )[0]?.index;

    if (sourceIndex === undefined) break;

    const source = nextRoutes[sourceIndex];
    const targetIndex = nextRoutes
      .map((route, index) => ({ route, index }))
      .filter(
        ({ route, index }) =>
          index !== sourceIndex &&
          route.emptySeats >= source.passengerCount &&
          route.destinations.length === 1 &&
          source.destinations.length === 1 &&
          route.destinations[0].name === source.destinations[0].name
      )
      .sort((a, b) => {
        const aPassengerCount =
          a.route.passengerCount + source.passengerCount;
        const bPassengerCount =
          b.route.passengerCount + source.passengerCount;
        const aMeetsMinimum = aPassengerCount >= minimumPassengersPerBus;
        const bMeetsMinimum = bPassengerCount >= minimumPassengersPerBus;

        if (aMeetsMinimum !== bMeetsMinimum) {
          return aMeetsMinimum ? -1 : 1;
        }

        return (
          a.route.emptySeats -
            source.passengerCount -
            (b.route.emptySeats - source.passengerCount) ||
          b.route.passengerCount - a.route.passengerCount
        );
      })[0]?.index;

    if (targetIndex === undefined) break;

    const target = nextRoutes[targetIndex];

    source.destinations.forEach((sourceDestination) => {
      if (sourceDestination.passengerCount <= 0) return;

      const existingDestination = target.destinations.find(
        (destination) => destination.name === sourceDestination.name
      );

      if (existingDestination) {
        existingDestination.passengerCount += sourceDestination.passengerCount;
        existingDestination.rank2Demand = Math.max(
          existingDestination.rank2Demand,
          sourceDestination.rank2Demand
        );
      } else {
        target.destinations.push({ ...sourceDestination });
      }
    });
    target.passengerCount += source.passengerCount;
    target.emptySeats -= source.passengerCount;
    nextRoutes.splice(sourceIndex, 1);
    mergedBusCount += 1;
  }

  return {
    routes: nextRoutes.map((route, index) => ({
      ...route,
      busLabel: `${index + 1}호차`,
    })),
    mergedBusCount,
  };
};

export function calculateOptimalBusAllocation(
  destinationStats: DestinationStats,
  busOptions: BusOptionInput[],
  options: BusAllocationCalculateOptions = {}
): BusAllocationResult[] {
  const MAX_DESTINATION_PLAN_CANDIDATES = 200;
  const MAX_STANDARD_CANDIDATES = 1200;
  const firstChoiceWeight = Math.max(0, Number(options.firstChoiceWeight ?? 1));
  const secondChoiceWeight = Math.max(
    0,
    Number(options.secondChoiceWeight ?? 0.5)
  );
  const minimumPassengersPerBus = Math.max(
    1,
    Math.floor(Number(options.minimumPassengersPerBus ?? 36))
  );
  const destinations = Object.entries(destinationStats)
    .map(([name, stats]) => ({
      name,
      passengerCount: Number(stats.rank1 || 0),
      rank2Demand: Number(stats.rank2 || 0),
      weightedDemand:
        Number(stats.rank1 || 0) * firstChoiceWeight +
        Number(stats.rank2 || 0) * secondChoiceWeight,
    }))
    .filter((destination) => destination.passengerCount > 0)
    .sort(
      (a, b) =>
        b.weightedDemand - a.weightedDemand ||
        b.passengerCount - a.passengerCount
    );
  const normalizedOptions = busOptions
    .filter((option) => option.capacity > 0 && option.estimated_price >= 0)
    .sort(
      (a, b) =>
        a.estimated_price / a.capacity - b.estimated_price / b.capacity ||
        b.capacity - a.capacity
    );
  const totalPeople = destinations.reduce(
    (sum, destination) => sum + destination.passengerCount,
    0
  );

  if (totalPeople === 0 || normalizedOptions.length === 0) {
    return [];
  }

  if (options.usePreferenceUtility) {
    type DestinationPlan = {
      destinationName: string;
      passengerCount: number;
      rank2Demand: number;
      totalCapacity: number;
      totalCost: number;
      totalUtility: number;
      netValue: number;
      routePlan: BusAllocationResult['routePlan'];
    };

    const buildDestinationPlans = (
      destination: (typeof destinations)[number]
    ): DestinationPlan[] => {
      const maxCapacity = Math.max(
        ...normalizedOptions.map((option) => option.capacity)
      );
      const maxBusesForDestination =
        Math.ceil(destination.passengerCount / maxCapacity) + 3;
      const destinationCandidates: DestinationPlan[] = [];
      const utility =
        destination.passengerCount * firstChoiceWeight +
        destination.rank2Demand * secondChoiceWeight;

      const searchDestination = (
        startIndex: number,
        buses: SearchBus[],
        capacity = 0,
        cost = 0
      ) => {
        if (capacity >= destination.passengerCount) {
          const sortedBuses = [...buses].sort((a, b) => b.capacity - a.capacity);
          let remaining = destination.passengerCount;
          const routePlan = sortedBuses.map((bus, index) => {
            const passengerCount = Math.min(remaining, bus.capacity);
            remaining -= passengerCount;

            return {
              busLabel: '',
              capacity: bus.capacity,
              price: bus.price,
              passengerCount,
              emptySeats: bus.capacity - passengerCount,
              destinations: [
                {
                  name: destination.name,
                  passengerCount,
                  rank2Demand: destination.rank2Demand,
                },
              ],
              routeIndex: index,
            };
          });
          destinationCandidates.push({
            destinationName: destination.name,
            passengerCount: destination.passengerCount,
            rank2Demand: destination.rank2Demand,
            totalCapacity: capacity,
            totalCost: cost,
            totalUtility: utility,
            netValue: utility - cost,
            routePlan,
          });

          if (destinationCandidates.length >= MAX_DESTINATION_PLAN_CANDIDATES) {
            return;
          }
        }

        if (buses.length >= maxBusesForDestination) return;

        for (let i = startIndex; i < normalizedOptions.length; i += 1) {
          if (destinationCandidates.length >= MAX_DESTINATION_PLAN_CANDIDATES) {
            return;
          }

          const option = normalizedOptions[i];
          const optionCount = buses.filter(
            (bus) => bus.optionId === option.id
          ).length;
          if (optionCount >= (option.max_count ?? 999)) continue;

          searchDestination(
            i,
            [
              ...buses,
              {
                optionId: option.id,
                capacity: option.capacity,
                price: option.estimated_price,
              },
            ],
            capacity + option.capacity,
            cost + option.estimated_price
          );
        }
      };

      searchDestination(0, [], 0, 0);

      const uniquePlans = new Map<string, DestinationPlan>();

      destinationCandidates.forEach((candidate) => {
        const key = candidate.routePlan
          .map((route) => `${route.capacity}:${route.price}`)
          .sort()
          .join('|');
        const existing = uniquePlans.get(key);

        if (!existing || candidate.netValue > existing.netValue) {
          uniquePlans.set(key, candidate);
        }
      });

      return Array.from(uniquePlans.values())
        .sort(
          (a, b) =>
            b.netValue - a.netValue ||
            a.totalCost - b.totalCost ||
            a.totalCapacity - b.totalCapacity
        )
        .slice(0, 4);
    };

    type CombinedPlan = {
      plans: DestinationPlan[];
      totalCost: number;
      totalCapacity: number;
      totalUtility: number;
      passengerCount: number;
    };

    let beam: CombinedPlan[] = [
      {
        plans: [],
        totalCost: 0,
        totalCapacity: 0,
        totalUtility: 0,
        passengerCount: 0,
      },
    ];

    destinations.forEach((destination) => {
      const destinationPlans = buildDestinationPlans(destination);
      const choices: DestinationPlan[] = destinationPlans;
      const nextBeam: CombinedPlan[] = [];

      beam.forEach((combinedPlan) => {
        choices.forEach((plan) => {
          nextBeam.push({
            plans: [...combinedPlan.plans, plan],
            totalCost: combinedPlan.totalCost + plan.totalCost,
            totalCapacity:
              combinedPlan.totalCapacity + plan.totalCapacity,
            totalUtility:
              combinedPlan.totalUtility + plan.totalUtility,
            passengerCount:
              combinedPlan.passengerCount + plan.passengerCount,
          });
        });
      });

      beam = nextBeam
        .sort(
          (a, b) =>
            b.totalUtility -
              b.totalCost -
              (a.totalUtility - a.totalCost) ||
            b.passengerCount - a.passengerCount ||
            a.totalCost - b.totalCost
        )
        .slice(0, 20);
    });

    const combinedResults = beam
      .filter((plan) => plan.plans.length > 0)
      .map((plan): BusAllocationResult => {
        const initialRoutePlan = plan.plans
          .flatMap((destinationPlan) => destinationPlan.routePlan)
          .map((route, index) => ({
            busLabel: `${index + 1}호차`,
            capacity: route.capacity,
            price: route.price,
            passengerCount: route.passengerCount,
            emptySeats: route.emptySeats,
            destinations: route.destinations,
          }));
        const { routes: routePlan } = consolidateLowOccupancyRoutes(
          initialRoutePlan,
          minimumPassengersPerBus
        );
        const totalBuses = routePlan.length;
        const totalCapacity = routePlan.reduce(
          (sum, route) => sum + route.capacity,
          0
        );
        const totalCost = routePlan.reduce((sum, route) => sum + route.price, 0);
        const passengerCount = routePlan.reduce(
          (sum, route) => sum + route.passengerCount,
          0
        );
        const emptySeats = totalCapacity - passengerCount;
        const efficiency =
          totalCapacity > 0
            ? (passengerCount / totalCapacity) * 100
            : 0;
        const costPerPerson =
          passengerCount > 0 ? totalCost / passengerCount : 0;
        const combinationMap = new Map<
          string,
          { count: number; capacity: number; price: number }
        >();

        routePlan.forEach((route) => {
          const key = `${route.capacity}-${route.price}`;
          const current = combinationMap.get(key);

          if (current) {
            current.count += 1;
          } else {
            combinationMap.set(key, {
              count: 1,
              capacity: route.capacity,
              price: route.price,
            });
          }
        });

        return {
          combination: Array.from(combinationMap.values()),
          totalCost,
          totalCapacity,
          totalBuses,
          efficiency,
          emptySeats,
          costPerPerson,
          qualityScore: plan.totalUtility - totalCost,
          totalUtility: plan.totalUtility,
          netValue: plan.totalUtility - totalCost,
          unservedPeople: totalPeople - passengerCount,
          routePlan,
        };
      });

    const uniqueResults = new Map<string, BusAllocationResult>();

    combinedResults.forEach((candidate) => {
      const key = candidate.routePlan
        .map(
          (route) =>
            `${route.destinations[0]?.name}:${route.capacity}:${route.price}`
        )
        .sort()
        .join('|');
      const existing = uniqueResults.get(key);

      if (!existing || (candidate.netValue ?? 0) > (existing.netValue ?? 0)) {
        uniqueResults.set(key, candidate);
      }
    });

    return Array.from(uniqueResults.values())
      .sort(
        (a, b) =>
          (b.netValue ?? 0) - (a.netValue ?? 0) ||
          (a.unservedPeople ?? 0) - (b.unservedPeople ?? 0) ||
          a.totalCost - b.totalCost
      )
      .slice(0, 5);
  }

  const maxCapacity = Math.max(
    ...normalizedOptions.map((option) => option.capacity)
  );
  const maxBuses = Math.min(
    totalPeople,
    Math.ceil(totalPeople / maxCapacity) + destinations.length + 4
  );
  const candidates: BusAllocationResult[] = [];

  const buildResult = (
    buses: SearchBus[]
  ): BusAllocationResult | null => {
    const sortedBuses = [...buses].sort((a, b) => b.capacity - a.capacity);
    const initialRoutePlan = sortedBuses.map((bus, index) => ({
      busLabel: `${index + 1}호차`,
      capacity: bus.capacity,
      price: bus.price,
      passengerCount: 0,
      emptySeats: bus.capacity,
      destinations: [] as BusAllocationResult['routePlan'][number]['destinations'],
    }));
    const remainingDestinations = destinations.map((destination) => ({
      ...destination,
      remaining: destination.passengerCount,
    }));

    remainingDestinations.forEach((destination) => {
      while (destination.remaining > 0) {
        const targetBus = initialRoutePlan
          .filter((bus) => bus.destinations.length === 0)
          .sort(
            (a, b) => {
              const aCanFit = a.capacity >= destination.remaining;
              const bCanFit = b.capacity >= destination.remaining;

              if (aCanFit && bCanFit) {
                return (
                  a.capacity -
                  destination.remaining -
                  (b.capacity - destination.remaining)
                );
              }

              if (aCanFit !== bCanFit) {
                return aCanFit ? -1 : 1;
              }

              return b.capacity - a.capacity;
            }
          )[0];

        if (!targetBus) break;

        const passengerCount = Math.min(
          destination.remaining,
          targetBus.emptySeats
        );

        targetBus.destinations.push({
          name: destination.name,
          passengerCount,
          rank2Demand: destination.rank2Demand,
        });
        targetBus.passengerCount += passengerCount;
        targetBus.emptySeats -= passengerCount;
        destination.remaining -= passengerCount;
      }
    });

    if (remainingDestinations.some((destination) => destination.remaining > 0)) {
      return null;
    }

    const { routes: routePlan } = consolidateLowOccupancyRoutes(
      initialRoutePlan,
      minimumPassengersPerBus
    );

    const totalCapacity = routePlan.reduce(
      (sum, route) => sum + route.capacity,
      0
    );
    const totalCost = routePlan.reduce((sum, route) => sum + route.price, 0);
    const totalBuses = routePlan.length;
    const emptySeats = totalCapacity - totalPeople;
    const efficiency = totalCapacity > 0 ? (totalPeople / totalCapacity) * 100 : 0;
    const costPerPerson = totalPeople > 0 ? totalCost / totalPeople : 0;
    const qualityScore =
      efficiency * 1000 -
      totalCost / 10000 -
      emptySeats * 25 -
      totalBuses * 100;
    const combinationMap = new Map<
      string,
      { count: number; capacity: number; price: number }
    >();

    routePlan.forEach((bus) => {
      const key = `${bus.capacity}-${bus.price}`;
      const current = combinationMap.get(key);

      if (current) {
        current.count += 1;
      } else {
        combinationMap.set(key, {
          count: 1,
          capacity: bus.capacity,
          price: bus.price,
        });
      }
    });

    return {
      combination: Array.from(combinationMap.values()),
      totalCost,
      totalCapacity,
      totalBuses,
      efficiency,
      emptySeats,
      costPerPerson,
      qualityScore,
      routePlan,
    };
  };

  const search = (
    startIndex: number,
    buses: SearchBus[],
    capacity = 0
  ) => {
    if (capacity >= totalPeople) {
      const result = buildResult(buses);

      if (result) {
        candidates.push(result);
      }

      if (candidates.length >= MAX_STANDARD_CANDIDATES) return;
      if (buses.length >= maxBuses) return;
    }

    if (buses.length >= maxBuses) return;

    for (let i = startIndex; i < normalizedOptions.length; i += 1) {
      if (candidates.length >= MAX_STANDARD_CANDIDATES) return;

      const option = normalizedOptions[i];
      const optionCount = buses.filter(
        (bus) => bus.optionId === option.id
      ).length;
      if (optionCount >= (option.max_count ?? 999)) continue;

      search(
        i,
        [
          ...buses,
          {
            optionId: option.id,
            capacity: option.capacity,
            price: option.estimated_price,
          },
        ],
        capacity + option.capacity
      );
    }
  };

  search(0, [], 0);

  const uniqueResults = new Map<string, BusAllocationResult>();

  candidates.forEach((candidate) => {
    const key = candidate.combination
      .map((bus) => `${bus.count}x${bus.capacity}:${bus.price}`)
      .sort()
      .join('|');
    const existing = uniqueResults.get(key);

    if (!existing || candidate.qualityScore > existing.qualityScore) {
      uniqueResults.set(key, candidate);
    }
  });

  return Array.from(uniqueResults.values())
    .sort(
      (a, b) =>
        b.qualityScore - a.qualityScore ||
        a.totalCost - b.totalCost ||
        a.emptySeats - b.emptySeats
    )
    .slice(0, 5);
}
