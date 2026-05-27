import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Download,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react';
import Header from '../../components/Header';
import { supabase } from '../../lib/supabase';
import {
  addBusOption,
  calculateOptimalBusAllocation,
  deleteBusOption,
  getAdminRole,
  getBusOptions,
  getDestinationStats,
  saveBusAllocation,
} from '../../lib/adminService';
import type {
  ConfirmedTicket,
  ReturnBusReservation,
  StationPreference,
} from '../../types/reservation';
import styles from './AdminAllocationPage.module.css';

interface BusOption {
  id: string;
  capacity: number;
  estimated_price: number;
  notes?: string;
}

interface AllocationResult {
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
      rank3Demand: number;
    }>;
  }>;
}

type DestinationStat = {
  rank1: number;
  rank2: number;
  rank3: number;
  total: number;
};

interface ReservationRow {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  district: string | null;
  team: string | null;
  campus: string | null;
  station_preferences: StationPreference[] | null;
  status: ReturnBusReservation['status'] | null;
  confirmed_ticket: ConfirmedTicket | null;
  data: Partial<ReturnBusReservation> | null;
  created_at: string | null;
  updated_at: string | null;
}

interface ReservationItem {
  id: string;
  dbId: string;
  userId: string;
  name: string;
  phone: string;
  district: string;
  team: string;
  campus: string;
  stationPreferences: StationPreference[];
  status: ReturnBusReservation['status'];
  confirmedTicket?: ConfirmedTicket;
  requestedAt: string;
  updatedAt?: string;
  rawData: Partial<ReturnBusReservation> | null;
}

type AutoAssignment = {
  reservation: ReservationItem;
  route: AllocationResult['routePlan'][number];
  destinationName: string;
  seatNumber: number;
};

type OptimizationMode =
  | 'balanced'
  | 'firstChoice'
  | 'weightedPreference'
  | 'cost'
  | 'emptySeats'
  | 'busCount';

const optimizationModeLabels: Record<OptimizationMode, string> = {
  balanced: '균형 추천',
  firstChoice: '1지망 최대 반영',
  weightedPreference: '1·2지망 가중치',
  cost: '최소 비용',
  emptySeats: '빈 좌석 최소',
  busCount: '차량 수 최소',
};

const optimizationModes = Object.keys(
  optimizationModeLabels
) as OptimizationMode[];

type ModeBestAllocation = {
  mode: OptimizationMode;
  allocation: AllocationResult;
};

type AllocationMetrics = {
  demand: number;
  splitCount: number;
  mixedRouteCount: number;
  weightedPreferencePenalty: number;
};

const getAllocationDemand = (allocation: AllocationResult) =>
  allocation.routePlan.reduce((sum, route) => sum + route.passengerCount, 0);

const getFirstChoiceCoverageRate = (allocation: AllocationResult) => {
  const demand = getAllocationDemand(allocation);

  if (demand === 0) return 0;

  return (allocation.routePlan.reduce(
    (sum, route) =>
      sum +
      route.destinations.reduce(
        (routeSum, destination) => routeSum + destination.passengerCount,
        0
      ),
    0
  ) /
    demand) *
    100;
};

const getDestinationSplitCount = (allocation: AllocationResult) => {
  const destinationBusCounts = new Map<string, number>();

  allocation.routePlan.forEach((route) => {
    route.destinations.forEach((destination) => {
      destinationBusCounts.set(
        destination.name,
        (destinationBusCounts.get(destination.name) ?? 0) + 1
      );
    });
  });

  return Array.from(destinationBusCounts.values()).reduce(
    (sum, busCount) => sum + Math.max(0, busCount - 1),
    0
  );
};

const getMixedRouteCount = (allocation: AllocationResult) =>
  allocation.routePlan.filter((route) => route.destinations.length > 1).length;

const getWeightedPreferencePenalty = (
  allocation: AllocationResult,
  firstChoiceWeight: number,
  secondChoiceWeight: number
) => {
  const destinationBusCounts = new Map<string, number>();
  const destinationWeights = new Map<string, number>();

  allocation.routePlan.forEach((route) => {
    route.destinations.forEach((destination) => {
      destinationBusCounts.set(
        destination.name,
        (destinationBusCounts.get(destination.name) ?? 0) + 1
      );
      destinationWeights.set(
        destination.name,
        destination.passengerCount * firstChoiceWeight +
          destination.rank2Demand * secondChoiceWeight
      );
    });
  });

  const splitPenalty = Array.from(destinationBusCounts.entries()).reduce(
    (sum, [destinationName, busCount]) =>
      sum +
      Math.max(0, busCount - 1) *
        (destinationWeights.get(destinationName) ?? 0),
    0
  );
  const mixedPenalty = allocation.routePlan.reduce((sum, route) => {
    if (route.destinations.length <= 1) return sum;

    return (
      sum +
      route.destinations.reduce(
        (routeSum, destination) =>
          routeSum +
          destination.passengerCount * firstChoiceWeight +
          destination.rank2Demand * secondChoiceWeight,
        0
      ) *
        0.15
    );
  }, 0);

  return splitPenalty + mixedPenalty;
};

const buildAllocationMetrics = (
  allocation: AllocationResult,
  firstChoiceWeight: number,
  secondChoiceWeight: number
): AllocationMetrics => ({
  demand: getAllocationDemand(allocation),
  splitCount: getDestinationSplitCount(allocation),
  mixedRouteCount: getMixedRouteCount(allocation),
  weightedPreferencePenalty: getWeightedPreferencePenalty(
    allocation,
    firstChoiceWeight,
    secondChoiceWeight
  ),
});

const sortAllocations = (
  results: AllocationResult[],
  mode: OptimizationMode,
  firstChoiceWeight = 1,
  secondChoiceWeight = 0.5
) => {
  const nextResults = [...results];
  const metricsByAllocation = new WeakMap<AllocationResult, AllocationMetrics>();
  const getMetrics = (allocation: AllocationResult) => {
    const cachedMetrics = metricsByAllocation.get(allocation);

    if (cachedMetrics) return cachedMetrics;

    const metrics = buildAllocationMetrics(
      allocation,
      firstChoiceWeight,
      secondChoiceWeight
    );

    metricsByAllocation.set(allocation, metrics);
    return metrics;
  };

  if (mode === 'firstChoice') {
    return nextResults.sort(
      (a, b) => {
        const aMetrics = getMetrics(a);
        const bMetrics = getMetrics(b);

        return (
          aMetrics.splitCount - bMetrics.splitCount ||
          aMetrics.mixedRouteCount - bMetrics.mixedRouteCount ||
        b.efficiency - a.efficiency ||
        a.emptySeats - b.emptySeats ||
        a.totalCost - b.totalCost
        );
      }
    );
  }

  if (mode === 'weightedPreference') {
    return nextResults.sort(
      (a, b) => {
        const aMetrics = getMetrics(a);
        const bMetrics = getMetrics(b);

        return (
          (b.netValue ?? Number.NEGATIVE_INFINITY) -
            (a.netValue ?? Number.NEGATIVE_INFINITY) ||
          (a.unservedPeople ?? 0) - (b.unservedPeople ?? 0) ||
          aMetrics.weightedPreferencePenalty -
            bMetrics.weightedPreferencePenalty ||
          aMetrics.splitCount - bMetrics.splitCount ||
          aMetrics.mixedRouteCount - bMetrics.mixedRouteCount ||
          a.emptySeats - b.emptySeats ||
          a.totalCost - b.totalCost
        );
      }
    );
  }

  if (mode === 'cost') {
    return nextResults.sort(
      (a, b) =>
        a.totalCost - b.totalCost ||
        a.emptySeats - b.emptySeats ||
        a.totalBuses - b.totalBuses
    );
  }

  if (mode === 'emptySeats') {
    return nextResults.sort(
      (a, b) =>
        a.emptySeats - b.emptySeats ||
        a.totalCost - b.totalCost ||
        a.totalBuses - b.totalBuses
    );
  }

  if (mode === 'busCount') {
    return nextResults.sort(
      (a, b) =>
        a.totalBuses - b.totalBuses ||
        a.totalCost - b.totalCost ||
        a.emptySeats - b.emptySeats
    );
  }

  return nextResults.sort(
    (a, b) =>
      b.qualityScore - a.qualityScore ||
      a.totalCost - b.totalCost ||
      a.emptySeats - b.emptySeats
  );
};

const buildModeBestAllocations = (
  destStats: Record<string, DestinationStat>,
  busOptions: BusOption[],
  firstChoiceWeight: number,
  secondChoiceWeight: number
): ModeBestAllocation[] => {
  const standardResults = calculateOptimalBusAllocation(destStats, busOptions, {
    firstChoiceWeight,
    secondChoiceWeight,
    usePreferenceUtility: false,
  });
  const utilityResults = calculateOptimalBusAllocation(destStats, busOptions, {
    firstChoiceWeight,
    secondChoiceWeight,
    usePreferenceUtility: true,
  });

  return optimizationModes
    .map((mode) => {
      const sourceResults =
        mode === 'weightedPreference' ? utilityResults : standardResults;
      const bestAllocation = sortAllocations(
        sourceResults,
        mode,
        firstChoiceWeight,
        secondChoiceWeight
      )[0];

      return bestAllocation
        ? {
            mode,
            allocation: bestAllocation,
          }
        : null;
    })
    .filter((item): item is ModeBestAllocation => item !== null);
};

const buildRemainingSeatSummary = (allocation: AllocationResult) =>
  allocation.routePlan.map((route) => ({
    label: route.busLabel,
    capacity: route.capacity,
    passengerCount: route.passengerCount,
    emptySeats: route.emptySeats,
    destinations:
      route.destinations.map((destination) => destination.name).join(', ') ||
      '배정 없음',
  }));

const buildAllocationWarnings = (
  allocation: AllocationResult,
  totalPeople: number
) => {
  const warnings: string[] = [];

  if (allocation.efficiency < 80) {
    warnings.push('좌석 효율이 80% 미만입니다. 버스 옵션을 더 작은 차량으로 조정해보세요.');
  }

  if (allocation.emptySeats >= Math.max(10, Math.ceil(totalPeople * 0.15))) {
    warnings.push('빈 좌석이 많은 편입니다. 추가 판매 또는 차량 조합 재검토가 필요합니다.');
  }

  if (allocation.routePlan.some((route) => route.emptySeats === 0)) {
    warnings.push('만석 차량이 있습니다. 현장 예비 좌석이 필요하면 여유 좌석 기준을 확인하세요.');
  }

  if (getDestinationSplitCount(allocation) > 0) {
    warnings.push('일부 1지망 행선지가 여러 차량으로 나뉩니다. 같은 행선지 탑승자 안내를 확인하세요.');
  }

  if (getMixedRouteCount(allocation) > 0) {
    warnings.push('여러 행선지가 함께 배정된 차량이 있습니다. 하차 순서와 안내 문구가 필요합니다.');
  }

  if (
    allocation.routePlan.some((route) =>
      route.destinations.some(
        (destination) =>
          destination.rank2Demand + destination.rank3Demand >
          destination.passengerCount
      )
    )
  ) {
    warnings.push('일부 행선지는 2·3지망 수요가 1지망보다 큽니다. 추가 배정 가능성을 확인하세요.');
  }

  return warnings;
};

const escapeCsvValue = (value: string | number) =>
  `"${String(value).replace(/"/g, '""')}"`;

const removeUndefinedValues = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const toReservationItem = (row: ReservationRow): ReservationItem => {
  const savedData = row.data ?? {};
  const confirmedTicket =
    savedData.confirmedTicket ?? row.confirmed_ticket ?? undefined;

  return {
    id: savedData.id ?? row.id,
    dbId: row.id,
    userId: row.user_id,
    name: savedData.name ?? row.name ?? '',
    phone: savedData.phone ?? row.phone ?? '',
    district: savedData.district ?? row.district ?? '',
    team: savedData.team ?? row.team ?? '',
    campus: savedData.campus ?? row.campus ?? '',
    stationPreferences:
      savedData.stationPreferences ?? row.station_preferences ?? [],
    status: savedData.status ?? row.status ?? 'requested',
    confirmedTicket,
    requestedAt: savedData.requestedAt ?? row.created_at ?? '',
    updatedAt: savedData.updatedAt ?? row.updated_at ?? undefined,
    rawData: row.data,
  };
};

const getPreferenceRankForDestination = (
  reservation: ReservationItem,
  destinationName: string
) =>
  reservation.stationPreferences.find(
    (preference) => preference.station.name === destinationName
  )?.rank ?? null;

const buildReservationData = (
  reservation: ReservationItem,
  confirmedTicket: ConfirmedTicket
): ReturnBusReservation => {
  const updatedAt = new Date().toISOString();

  return {
    ...(reservation.rawData ?? {}),
    id: reservation.id,
    name: reservation.name,
    phone: reservation.phone,
    district: reservation.district,
    team: reservation.team,
    campus: reservation.campus,
    stationPreferences: reservation.stationPreferences,
    status: 'confirmed',
    confirmedTicket,
    requestedAt: reservation.requestedAt || updatedAt,
    updatedAt,
  };
};

const buildAutoAssignments = (
  allocation: AllocationResult,
  reservations: ReservationItem[]
) => {
  const usedReservationIds = new Set<string>();
  const assignments: AutoAssignment[] = [];
  const eligibleReservations = reservations.filter(
    (reservation) =>
      reservation.status !== 'cancelled' && !reservation.confirmedTicket
  );
  const confirmedSeatNumbersByBus = new Map<string, Set<number>>();
  const candidatesByDestination = new Map<string, ReservationItem[]>();

  reservations.forEach((reservation) => {
    const busNumber = reservation.confirmedTicket?.busNumber;
    const seatNumber = Number(reservation.confirmedTicket?.seatNumber);

    if (
      !busNumber ||
      !Number.isInteger(seatNumber) ||
      seatNumber < 1
    ) {
      return;
    }

    const seatNumbers =
      confirmedSeatNumbersByBus.get(busNumber) ?? new Set<number>();

    seatNumbers.add(seatNumber);
    confirmedSeatNumbersByBus.set(busNumber, seatNumbers);
  });

  eligibleReservations.forEach((reservation) => {
    reservation.stationPreferences.forEach((preference) => {
      const destinationName = preference.station.name;
      const candidates = candidatesByDestination.get(destinationName) ?? [];

      candidates.push(reservation);
      candidatesByDestination.set(destinationName, candidates);
    });
  });

  candidatesByDestination.forEach((candidates, destinationName) => {
    candidates.sort((a, b) => {
      const aRank = getPreferenceRankForDestination(a, destinationName) ?? 99;
      const bRank = getPreferenceRankForDestination(b, destinationName) ?? 99;

      return (
        aRank - bRank ||
        a.requestedAt.localeCompare(b.requestedAt) ||
        a.name.localeCompare(b.name, 'ko')
      );
    });
  });

  allocation.routePlan.forEach((route) => {
    const alreadyAssignedSeatNumbers = new Set(
      Array.from(confirmedSeatNumbersByBus.get(route.busLabel) ?? []).filter(
        (seatNumber) => seatNumber <= route.capacity
      )
    );
    const availableSeatNumbers = Array.from(
      { length: route.capacity },
      (_, index) => index + 1
    ).filter((seatNumber) => !alreadyAssignedSeatNumbers.has(seatNumber));
    let nextSeatIndex = 0;

    route.destinations.forEach((destination) => {
      const targetCount = Math.min(
        destination.passengerCount,
        availableSeatNumbers.length - nextSeatIndex
      );
      const candidates =
        candidatesByDestination.get(destination.name)?.filter(
          (reservation) => !usedReservationIds.has(reservation.id)
        ) ?? [];

      candidates.slice(0, targetCount).forEach((reservation) => {
        usedReservationIds.add(reservation.id);
        assignments.push({
          reservation,
          route,
          destinationName: destination.name,
          seatNumber: availableSeatNumbers[nextSeatIndex],
        });
        nextSeatIndex += 1;
      });
    });
  });

  return assignments;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;

  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>;

    return String(
      errorRecord.message ||
        errorRecord.details ||
        errorRecord.hint ||
        errorRecord.code ||
        JSON.stringify(errorRecord)
    );
  }

  return '알 수 없는 오류가 발생했습니다.';
};

const BusAllocationPage = () => {
  const navigate = useNavigate();
  const [busOptions, setBusOptions] = useState<BusOption[]>([]);
  const [destStats, setDestStats] = useState<Record<string, DestinationStat>>(
    {}
  );
  const [allocations, setAllocations] = useState<AllocationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBusCapacity, setNewBusCapacity] = useState('');
  const [newBusPrice, setNewBusPrice] = useState('');
  const [allocationName, setAllocationName] = useState('');
  const [selectedAllocation, setSelectedAllocation] =
    useState<AllocationResult | null>(null);
  const [optimizationMode, setOptimizationMode] =
    useState<OptimizationMode>('balanced');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [compareAllocationIndexes, setCompareAllocationIndexes] = useState<
    number[]
  >([]);
  const [modeBestAllocations, setModeBestAllocations] = useState<
    ModeBestAllocation[]
  >([]);
  const [showDetailedComparison, setShowDetailedComparison] = useState(false);
  const [showBusOptionsPanel, setShowBusOptionsPanel] = useState(false);
  const [hasSavedAllocation, setHasSavedAllocation] = useState(false);
  const [firstChoiceWeight, setFirstChoiceWeight] = useState('10000');
  const [secondChoiceWeight, setSecondChoiceWeight] = useState('5000');
  const [autoAssignDepartureTime, setAutoAssignDepartureTime] = useState('');
  const [autoAssignBoardingPlace, setAutoAssignBoardingPlace] = useState('');
  const [autoAssignManagerNote, setAutoAssignManagerNote] = useState('');
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [lastAutoAssignSummary, setLastAutoAssignSummary] = useState<
    string | null
  >(null);
  const [selectionFeedback, setSelectionFeedback] = useState<string | null>(
    null
  );

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate('/admin/login');
        return;
      }

      const adminRole = await getAdminRole(session.user.id);

      if (!adminRole || adminRole.role !== 'global_admin') {
        alert('전체 관리자만 접근할 수 있습니다.');
        navigate('/');
        return;
      }

      const [optionsResult, statsResult] = await Promise.allSettled([
        getBusOptions(),
        getDestinationStats(),
      ]);

      if (optionsResult.status === 'fulfilled') {
        setBusOptions(optionsResult.value);
        setShowBusOptionsPanel(optionsResult.value.length === 0);
      } else {
        console.error('버스 옵션 조회 실패:', optionsResult.reason);
        setBusOptions([]);
        setShowBusOptionsPanel(true);
      }

      if (statsResult.status === 'fulfilled') {
        setDestStats(statsResult.value);
      } else {
        console.error('신청 통계 조회 실패:', statsResult.reason);
        setDestStats({});
      }

      const errors = [
        optionsResult.status === 'rejected'
          ? `버스 옵션: ${getErrorMessage(optionsResult.reason)}`
          : '',
        statsResult.status === 'rejected'
          ? `신청 통계: ${getErrorMessage(statsResult.reason)}`
          : '',
      ].filter(Boolean);

      if (errors.length > 0) {
        setLoadError(errors.join(' / '));
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial page load is an external Supabase synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddBusOption = async () => {
    const capacity = Number(newBusCapacity);
    const price = Number(newBusPrice);

    if (!capacity || capacity < 1 || Number.isNaN(capacity)) {
      alert('탑승 인원을 1명 이상으로 입력해주세요.');
      return;
    }

    if (Number.isNaN(price) || price < 0) {
      alert('예상 가격을 0원 이상으로 입력해주세요.');
      return;
    }

    try {
      await addBusOption(Math.floor(capacity), Math.floor(price));
      const options = await getBusOptions();

      setBusOptions(options);
      setNewBusCapacity('');
      setNewBusPrice('');
      setAllocations([]);
      setModeBestAllocations([]);
      setSelectedAllocation(null);

      alert('버스 옵션을 추가했습니다.');
    } catch (error) {
      console.error('Failed to add bus option:', error);
      alert(`버스 옵션 추가에 실패했습니다: ${getErrorMessage(error)}`);
    }
  };

  const handleDeleteBusOption = async (id: string) => {
    if (!window.confirm('이 버스 옵션을 삭제할까요?')) return;

    try {
      await deleteBusOption(id);
      const options = await getBusOptions();

      setBusOptions(options);
      setAllocations([]);
      setModeBestAllocations([]);
      setSelectedAllocation(null);

      alert('버스 옵션을 삭제했습니다.');
    } catch (error) {
      console.error('Failed to delete bus option:', error);
      alert(`버스 옵션 삭제에 실패했습니다: ${getErrorMessage(error)}`);
    }
  };

  const handleCalculateAllocation = () => {
    if (Object.keys(destStats).length === 0) {
      alert('신청 정보가 없습니다.');
      return;
    }

    if (busOptions.length === 0) {
      alert('버스 옵션을 먼저 추가해주세요.');
      return;
    }

    try {
      const normalizedFirstChoiceWeight = Math.max(
        0,
        Number(firstChoiceWeight) || 0
      );
      const normalizedSecondChoiceWeight = Math.max(
        0,
        Number(secondChoiceWeight) || 0
      );
      const calculatedResults = calculateOptimalBusAllocation(destStats, busOptions, {
        firstChoiceWeight: normalizedFirstChoiceWeight,
        secondChoiceWeight: normalizedSecondChoiceWeight,
        usePreferenceUtility: optimizationMode === 'weightedPreference',
      });
      const results = sortAllocations(
        calculatedResults,
        optimizationMode,
        normalizedFirstChoiceWeight,
        normalizedSecondChoiceWeight
      );
      const bestAllocations = buildModeBestAllocations(
        destStats,
        busOptions,
        normalizedFirstChoiceWeight,
        normalizedSecondChoiceWeight
      );

      setAllocations(results);
      setModeBestAllocations(bestAllocations);
      setSelectedAllocation(results[0] ?? null);
      setShowDetailedComparison(false);
      setHasSavedAllocation(false);
      setSelectionFeedback(
        results[0]
          ? `${optimizationModeLabels[optimizationMode]} 추천 1안이 선택되었습니다.`
          : null
      );
      setCompareAllocationIndexes(
        results.slice(0, Math.min(3, results.length)).map((_, index) => index)
      );

      if (results.length === 0) {
        alert(
          '추천 가능한 버스 조합을 찾을 수 없습니다. 각 버스는 하나의 행선지만 담당해야 하므로 버스 옵션이나 대수를 추가해보세요.'
        );
      }
    } catch (error) {
      console.error('Failed to calculate allocation:', error);
      alert('배분 계산에 실패했습니다.');
    }
  };

  const handleOptimizationModeChange = (mode: OptimizationMode) => {
    setOptimizationMode(mode);

    if (allocations.length === 0) return;

    const sortedResults = sortAllocations(
      allocations,
      mode,
      Math.max(0, Number(firstChoiceWeight) || 0),
      Math.max(0, Number(secondChoiceWeight) || 0)
    );

    setAllocations(sortedResults);
    setSelectedAllocation(sortedResults[0] ?? null);
    setSelectionFeedback(
      sortedResults[0]
        ? `${optimizationModeLabels[mode]} 추천 1안이 선택되었습니다.`
        : null
    );
    setCompareAllocationIndexes(
      sortedResults
        .slice(0, Math.min(3, sortedResults.length))
        .map((_, index) => index)
    );
  };

  const handleToggleCompareAllocation = (index: number) => {
    setCompareAllocationIndexes((prev) => {
      if (prev.includes(index)) {
        return prev.filter((value) => value !== index);
      }

      return [...prev, index].sort((a, b) => a - b);
    });
  };

  const handleSaveAllocation = async () => {
    if (!selectedAllocation || !allocationName.trim()) {
      alert('저장할 추천안을 선택하고 배분 이름을 입력해주세요.');
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) throw new Error('Session not found');

      await saveBusAllocation(
        allocationName.trim(),
        selectedAllocation,
        selectedAllocation.totalCost,
        selectedAllocation.totalCapacity,
        session.user.id
      );

      alert('버스 배분안을 저장했습니다.');
      setAllocationName('');
      setHasSavedAllocation(true);
    } catch (error) {
      console.error('Failed to save allocation:', error);
      alert('버스 배분 저장에 실패했습니다.');
    }
  };

  const handleDownloadSelectedAllocation = () => {
    if (!selectedAllocation) {
      alert('다운로드할 추천안을 먼저 선택해주세요.');
      return;
    }

    const rows = [
      ['버스', '좌석', '탑승 인원', '빈 좌석', '행선지', '행선지별 인원'],
      ...selectedAllocation.routePlan.map((route) => [
        route.busLabel,
        route.capacity,
        route.passengerCount,
        route.emptySeats,
        route.destinations.map((destination) => destination.name).join(' / ') ||
          '배정 없음',
        route.destinations
          .map(
            (destination) =>
              `${destination.name} ${destination.passengerCount}명`
          )
          .join(' / ') || '배정 없음',
      ]),
      [],
      ['총 좌석', selectedAllocation.totalCapacity],
      ['총 탑승 인원', totalPeople],
      ['빈 좌석', selectedAllocation.emptySeats],
      ['총 버스', selectedAllocation.totalBuses],
      ['예상 비용', selectedAllocation.totalCost],
      ['1인 비용', Math.round(selectedAllocation.costPerPerson)],
      ['효율률', `${selectedAllocation.efficiency.toFixed(1)}%`],
    ];
    const csv = rows
      .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${allocationName.trim() || 'bus-allocation'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectAllocation = (allocation: AllocationResult, label: string) => {
    setSelectedAllocation(allocation);
    setSelectionFeedback(`${label}을 선택했습니다. 저장과 자동 배차는 이 안으로 진행됩니다.`);
  };

  const handleAutoAssignSelectedAllocation = async () => {
    if (!selectedAllocation) {
      alert('자동 배차할 추천안을 먼저 선택해주세요.');
      return;
    }

    const departureTime = autoAssignDepartureTime.trim();
    const boardingPlace = autoAssignBoardingPlace.trim();

    if (!departureTime || !boardingPlace) {
      alert('자동 배차에 사용할 출발 시간과 탑승 장소를 입력해주세요.');
      return;
    }

    setAutoAssigning(true);
    setLastAutoAssignSummary(null);

    try {
      const { data, error } = await supabase
        .from('reservations')
        .select(
          'id, user_id, name, phone, district, team, campus, station_preferences, status, confirmed_ticket, data, created_at, updated_at'
        )
        .order('created_at', { ascending: true });

      if (error) throw error;

      const reservations = ((data ?? []) as ReservationRow[]).map(
        toReservationItem
      );
      const assignments = buildAutoAssignments(selectedAllocation, reservations);
      const plannedPassengerCount = getAllocationDemand(selectedAllocation);

      if (assignments.length === 0) {
        alert('자동 배차할 미확정 신청자를 찾을 수 없습니다.');
        return;
      }

      const ok = window.confirm(
        `${optimizationModeLabels[optimizationMode]} 기준 선택안으로 ${assignments.length}명을 자동 배차할까요?\n이미 확정된 버스표는 변경하지 않습니다.`
      );

      if (!ok) return;

      await Promise.all(
        assignments.map(async (assignment) => {
          const noteParts = [
            `자동 배차 · ${optimizationModeLabels[optimizationMode]}`,
            autoAssignManagerNote.trim(),
          ].filter(Boolean);
          const confirmedTicket: ConfirmedTicket = {
            busNumber: assignment.route.busLabel,
            seatNumber: String(assignment.seatNumber),
            departureTime,
            boardingPlace,
            dropoffStation: assignment.destinationName,
            managerNote: noteParts.join(' / '),
            confirmedAt: new Date().toISOString(),
          };
          const nextData = buildReservationData(
            assignment.reservation,
            confirmedTicket
          );
          const cleanTicket = removeUndefinedValues(confirmedTicket);
          const cleanData = removeUndefinedValues(nextData);
          const { error: updateError } = await supabase
            .from('reservations')
            .update({
              status: 'confirmed',
              confirmed_ticket: cleanTicket,
              data: cleanData,
              updated_at: cleanData.updatedAt,
            })
            .eq('id', assignment.reservation.dbId);

          if (updateError) throw updateError;
        })
      );

      const summaryText =
        assignments.length === plannedPassengerCount
          ? `${assignments.length}명 자동 배차를 완료했습니다.`
          : `${assignments.length}명 자동 배차 완료, ${plannedPassengerCount - assignments.length}명은 매칭 가능한 미확정 신청자가 부족해 남았습니다.`;

      setLastAutoAssignSummary(summaryText);
      alert(summaryText);
    } catch (error) {
      console.error('자동 배차 실패:', error);
      alert(`자동 배차 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setAutoAssigning(false);
    }
  };

  const totalPeople = Object.values(destStats).reduce(
    (sum, stat) => sum + stat.rank1,
    0
  );
  const totalPreferenceCount = Object.values(destStats).reduce(
    (sum, stat) => sum + stat.total,
    0
  );
  const selectedWarnings = selectedAllocation
    ? buildAllocationWarnings(selectedAllocation, totalPeople)
    : [];
  const selectedRemainingSeats = selectedAllocation
    ? buildRemainingSeatSummary(selectedAllocation)
    : [];
  const normalizedFirstChoiceWeight = Math.max(
    0,
    Number(firstChoiceWeight) || 0
  );
  const normalizedSecondChoiceWeight = Math.max(
    0,
    Number(secondChoiceWeight) || 0
  );
  const comparedAllocations = compareAllocationIndexes
    .map((index) => ({
      index,
      allocation: allocations[index],
      warnings: allocations[index]
        ? buildAllocationWarnings(allocations[index], totalPeople)
        : [],
    }))
    .filter((item) => item.allocation);
  const modeBestRows = modeBestAllocations.map((item) => ({
    ...item,
    warnings: buildAllocationWarnings(item.allocation, totalPeople),
  }));
  const calculationChecks = [
    {
      label: '신청 인원',
      value:
        totalPeople > 0
          ? `${totalPeople.toLocaleString()}명 불러옴`
          : '신청 인원 없음',
      ready: totalPeople > 0,
    },
    {
      label: '버스 옵션',
      value:
        busOptions.length > 0
          ? `${busOptions.length.toLocaleString()}개 등록`
          : '버스 옵션 없음',
      ready: busOptions.length > 0,
    },
    {
      label: '최적화 기준',
      value: optimizationModeLabels[optimizationMode],
      ready: Boolean(optimizationMode),
    },
    {
      label: '1지망 수요',
      value:
        Object.keys(destStats).length > 0
          ? `${Object.keys(destStats).length.toLocaleString()}개 목적지`
          : '목적지 없음',
      ready: Object.keys(destStats).length > 0,
    },
  ];
  const primaryRecommendation = selectedAllocation ?? allocations[0] ?? null;
  const primaryWarnings = primaryRecommendation
    ? buildAllocationWarnings(primaryRecommendation, totalPeople)
    : [];
  const visibleRecommendationCards = allocations.slice(0, 3);

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <Header />
        <main className={styles.main}>
          <p>로딩 중...</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <div className={styles.header}>
          <h1>버스 배분 최적화</h1>
          <p>
            1지망 수요를 기준으로 총비용, 빈 좌석, 차량 대수를 함께 고려해
            현실적인 버스 조합과 노선 초안을 추천합니다.
          </p>
        </div>

        {loadError && (
          <div className={styles.loadErrorBox}>
            <div>
              <strong>일부 데이터를 불러오지 못했습니다.</strong>
              <p>{loadError}</p>
            </div>
            <button type="button" onClick={() => void loadData()}>
              다시 불러오기
            </button>
          </div>
        )}

        <div className={styles.summaryBox}>
          <div className={styles.summaryItem}>
            <span className={styles.label}>1지망 기준 인원</span>
            <span className={styles.value}>{totalPeople}명</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.label}>행선지</span>
            <span className={styles.value}>{Object.keys(destStats).length}개</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.label}>버스 옵션</span>
            <span className={styles.value}>{busOptions.length}개</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.label}>전체 지망 수</span>
            <span className={styles.value}>{totalPreferenceCount}건</span>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.collapsibleHeader}>
            <div>
              <h2>버스 옵션 관리</h2>
              <p>차량 종류와 예상 대절비가 바뀔 때만 펼쳐서 수정합니다.</p>
            </div>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setShowBusOptionsPanel((prev) => !prev)}
            >
              {showBusOptionsPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {showBusOptionsPanel ? '접기' : '옵션 수정'}
            </button>
          </div>

          {!showBusOptionsPanel && (
            <div className={styles.busOptionSummary}>
              <strong>{busOptions.length.toLocaleString()}개 옵션 등록됨</strong>
              <span>
                {busOptions.length > 0
                  ? busOptions
                      .map(
                        (option) =>
                          `${option.capacity}인승 ${option.estimated_price.toLocaleString()}원`
                      )
                      .join(' / ')
                  : '계산을 시작하려면 버스 옵션을 먼저 추가해주세요.'}
              </span>
            </div>
          )}

          {showBusOptionsPanel && (
            <>
              <div className={styles.busOptionForm}>
                <input
                  type="number"
                  placeholder="탑승 인원"
                  value={newBusCapacity}
                  onChange={(event) => setNewBusCapacity(event.target.value)}
                  min="1"
                />
                <input
                  type="number"
                  placeholder="예상 가격 원"
                  value={newBusPrice}
                  onChange={(event) => setNewBusPrice(event.target.value)}
                  min="0"
                />
                <button className={styles.addButton} onClick={handleAddBusOption}>
                  <Plus size={18} /> 추가
                </button>
              </div>

              <div className={styles.busOptionsList}>
                {busOptions.length > 0 ? (
                  busOptions.map((option) => (
                    <div key={option.id} className={styles.busOptionItem}>
                      <div className={styles.optionInfo}>
                        <p className={styles.optionCapacity}>
                          {option.capacity}인승
                        </p>
                        <p className={styles.optionPrice}>
                          {option.estimated_price.toLocaleString()}원
                        </p>
                      </div>
                      <button
                        className={styles.deleteButton}
                        onClick={() => handleDeleteBusOption(option.id)}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className={styles.emptyMessage}>버스 옵션이 없습니다.</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>최적 배분 계산</h2>
              <p className={styles.sectionDescription}>
                추천 점수는 좌석 효율 보상에서 비용, 빈 좌석, 차량 수 페널티를
                뺀 값입니다. 점수가 높을수록 좋은 안이며, 각 버스는 하나의
                행선지만 담당합니다. 1·2지망 효용 금액 모드에서는 총 효용에서
                버스 대여비를 뺀 순효용이 큰 안을 우선합니다.
              </p>
            </div>
            <div className={styles.calculateActions}>
              <button
                type="button"
                className={styles.logicLinkButton}
                onClick={() => navigate('/admin/allocation/logic')}
              >
                <BookOpen size={16} />
                로직 설명
              </button>
              <select
                value={optimizationMode}
                onChange={(event) =>
                  handleOptimizationModeChange(
                    event.target.value as OptimizationMode
                  )
                }
                className={styles.modeSelect}
              >
                {Object.entries(optimizationModeLabels).map(([mode, label]) => (
                  <option key={mode} value={mode}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                className={styles.calculateButton}
                onClick={handleCalculateAllocation}
                disabled={busOptions.length === 0 || totalPeople === 0}
              >
                <Zap size={18} /> 계산하기
              </button>
            </div>
          </div>

          <div className={styles.calculationCheckGrid}>
            {calculationChecks.map((check) => (
              <div
                key={check.label}
                className={`${styles.calculationCheckItem} ${
                  check.ready ? styles.calculationCheckReady : ''
                }`}
              >
                <CheckCircle2 size={18} />
                <div>
                  <strong>{check.label}</strong>
                  <span>{check.value}</span>
                </div>
              </div>
            ))}
          </div>

          {optimizationMode === 'weightedPreference' && (
            <div className={styles.weightControlGroup}>
              <div className={styles.weightHeader}>
                <div>
                  <h3>1·2지망 효용 금액 설정</h3>
                  <p>
                    각 지망을 만족시킬 때 얻는 운영상 가치를 원 단위로 입력합니다.
                  </p>
                </div>
                <span>순효용 = 총 효용 - 버스 대여비</span>
              </div>

              <div className={styles.weightInputs}>
                <label>
                  <span>1지망 1명당 효용</span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={firstChoiceWeight}
                    onChange={(event) =>
                      setFirstChoiceWeight(event.target.value)
                    }
                  />
                  <b>원</b>
                </label>
                <label>
                  <span>2지망 1명당 효용</span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={secondChoiceWeight}
                    onChange={(event) =>
                      setSecondChoiceWeight(event.target.value)
                    }
                  />
                  <b>원</b>
                </label>
              </div>

              <p className={styles.weightHelpText}>
                예를 들어 1지망 10,000원, 2지망 5,000원이면 1지망 배정 1명은
                10,000원, 2지망 수요 1명은 5,000원의 효용으로 계산합니다. 총
                효용보다 버스 대여비가 큰 행선지는 배차하지 않는 추천안이 더
                좋게 평가될 수 있습니다.
              </p>
            </div>
          )}

          <div className={styles.logicGuide}>
            <h3>계산 로직 설명</h3>
            <div className={styles.logicGrid}>
              <div className={styles.logicItem}>
                <strong>1. 수요 기준</strong>
                <p>
                  신청자의 1지망 도착역 인원을 기본 탑승 수요로 계산합니다.
                  2·3지망은 경고와 운영 참고 지표로 함께 확인합니다.
                </p>
              </div>

              <div className={styles.logicItem}>
                <strong>2. 후보 조합 생성</strong>
                <p>
                  등록된 버스 옵션을 조합해 전체 1지망 인원을 태울 수 있는
                  후보안을 만들고, 중복되는 차량 구성은 하나로 정리합니다.
                </p>
              </div>

              <div className={styles.logicItem}>
                <strong>3. 버스별 배정</strong>
                <p>
                  수요가 큰 도착역부터 빈 버스를 배정합니다. 한 버스는 하나의
                  행선지만 담당하고, 한 도착역 인원이 차량 정원을 넘으면 여러
                  차량으로 나뉠 수 있습니다.
                </p>
              </div>

              <div className={styles.logicItem}>
                <strong>4. 추천 점수</strong>
                <p>
                  기본 점수는 좌석 효율 보상 - 비용 페널티 - 빈 좌석 페널티 -
                  차량 대수 페널티입니다. 점수가 높을수록 좋은 추천안입니다.
                  1·2지망 효용 금액 모드에서는 총 효용 - 버스 대여비가 큰
                  추천안을 우선합니다.
                </p>
              </div>
            </div>

            <div className={styles.modeGuide}>
              <span>균형 추천: 비용, 빈 좌석, 차량 수를 함께 고려</span>
              <span>1지망 최대 반영: 1지망 행선지가 덜 쪼개지고 덜 섞이는 안 우선</span>
              <span>1·2지망 가중치: 입력한 1지망/2지망 효용 금액과 버스 대여비를 함께 비교</span>
              <span>최소 비용: 총 대여 비용이 낮은 안 우선</span>
              <span>빈 좌석 최소: 남는 좌석이 적은 안 우선</span>
              <span>차량 수 최소: 운영할 버스 대수가 적은 안 우선</span>
            </div>
          </div>

          {allocations.length > 0 && (
            <div className={styles.allocationResults}>
              <div className={styles.resultsHeader}>
                <div>
                  <h3>추천 조합</h3>
                  <p>
                    추천 1안을 먼저 확인하고, 필요한 경우 상세 비교표를 펼쳐 다른
                    기준의 결과를 비교합니다.
                  </p>
                </div>
              </div>

              {primaryRecommendation && (
                <div
                  className={`${styles.primaryRecommendation} ${
                    selectedAllocation === primaryRecommendation
                      ? styles.primaryRecommendationSelected
                      : ''
                  }`}
                >
                  <div className={styles.primaryRecommendationHeader}>
                    <div>
                      <span>현재 기준 추천 1안</span>
                      <h3>{optimizationModeLabels[optimizationMode]}</h3>
                    </div>
                    <button
                      type="button"
                      className={styles.primarySelectButton}
                      onClick={() =>
                        handleSelectAllocation(
                          primaryRecommendation,
                          `${optimizationModeLabels[optimizationMode]} 추천 1안`
                        )
                      }
                    >
                      {selectedAllocation === primaryRecommendation
                        ? '선택됨'
                        : '이 안 선택'}
                    </button>
                  </div>

                  {selectionFeedback && (
                    <p className={styles.selectionFeedback}>
                      {selectionFeedback}
                    </p>
                  )}

                  <div className={styles.primaryMetricGrid}>
                    <div>
                      <span>총 버스</span>
                      <strong>{primaryRecommendation.totalBuses}대</strong>
                    </div>
                    <div>
                      <span>총 좌석</span>
                      <strong>{primaryRecommendation.totalCapacity}석</strong>
                    </div>
                    <div>
                      <span>빈 좌석</span>
                      <strong>{primaryRecommendation.emptySeats}석</strong>
                    </div>
                    <div>
                      <span>예상 비용</span>
                      <strong>{primaryRecommendation.totalCost.toLocaleString()}원</strong>
                    </div>
                    <div>
                      <span>1인 비용</span>
                      <strong>
                        {Math.round(primaryRecommendation.costPerPerson).toLocaleString()}원
                      </strong>
                    </div>
                    <div>
                      <span>좌석 효율</span>
                      <strong>{primaryRecommendation.efficiency.toFixed(1)}%</strong>
                    </div>
                  </div>

                  <div className={styles.primaryWarningRow}>
                    {primaryWarnings.length > 0 ? (
                      <span className={styles.compareWarningBadge}>
                        운영 체크 {primaryWarnings.length}건
                      </span>
                    ) : (
                      <span className={styles.compareSafeBadge}>운영 체크 양호</span>
                    )}
                    <span>
                      {primaryRecommendation.combination
                        .map((bus) => `${bus.count}대 ${bus.capacity}석`)
                        .join(' + ')}
                    </span>
                  </div>
                </div>
              )}

              <div className={styles.detailToggleRow}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setShowDetailedComparison((prev) => !prev)}
                >
                  {showDetailedComparison ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                  {showDetailedComparison ? '상세 비교 접기' : '상세 비교 보기'}
                </button>
              </div>

              {showDetailedComparison && modeBestRows.length > 0 && (
                <div className={`${styles.comparePanel} ${styles.modeBestPanel}`}>
                  <div className={styles.compareHeader}>
                    <div>
                      <h4>로직별 최선안 비교</h4>
                      <p>
                        같은 수요와 버스 옵션에서 각 계산 로직이 1등으로 고른
                        선택지만 모아 비교합니다.
                      </p>
                    </div>
                    <span>{modeBestRows.length}개 로직</span>
                  </div>

                  <div className={styles.compareTableWrap}>
                    <table className={styles.compareTable}>
                      <thead>
                        <tr>
                          <th>로직</th>
                          <th>구성</th>
                          <th>총 좌석</th>
                          <th>빈 좌석</th>
                          <th>버스</th>
                          <th>예상 비용</th>
                          <th>1인 비용</th>
                          <th>총 효용</th>
                          <th>순효용</th>
                          <th>미배차</th>
                          <th>1지망</th>
                          <th>추천 점수</th>
                          <th>분산</th>
                          <th>효율률</th>
                          <th>운영 체크</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modeBestRows.map(({ mode, allocation, warnings }) => (
                          <tr
                            key={`${mode}-${allocation.totalCost}-${allocation.totalCapacity}`}
                            className={
                              selectedAllocation === allocation
                                ? styles.compareSelectedRow
                                : ''
                            }
                          >
                            <td>
                              <button
                                type="button"
                                className={styles.compareSelectButton}
                                onClick={() =>
                                  handleSelectAllocation(
                                    allocation,
                                    optimizationModeLabels[mode]
                                  )
                                }
                              >
                                {optimizationModeLabels[mode]}
                              </button>
                            </td>
                            <td>
                              {allocation.combination
                                .map((bus) => `${bus.count}대 ${bus.capacity}인`)
                                .join(' + ')}
                            </td>
                            <td>{allocation.totalCapacity}석</td>
                            <td>{allocation.emptySeats}석</td>
                            <td>{allocation.totalBuses}대</td>
                            <td>{allocation.totalCost.toLocaleString()}원</td>
                            <td>
                              {Math.round(
                                allocation.costPerPerson
                              ).toLocaleString()}
                              원
                            </td>
                            <td>
                              {typeof allocation.totalUtility === 'number'
                                ? `${Math.round(
                                    allocation.totalUtility
                                  ).toLocaleString()}원`
                                : '-'}
                            </td>
                            <td>
                              {typeof allocation.netValue === 'number'
                                ? `${Math.round(
                                    allocation.netValue
                                  ).toLocaleString()}원`
                                : '-'}
                            </td>
                            <td>
                              {typeof allocation.unservedPeople === 'number'
                                ? `${allocation.unservedPeople}명`
                                : '-'}
                            </td>
                            <td>
                              {getFirstChoiceCoverageRate(allocation).toFixed(0)}
                              %
                            </td>
                            <td>{allocation.qualityScore.toFixed(1)}</td>
                            <td>
                              {getDestinationSplitCount(allocation)}건 / 혼합{' '}
                              {getMixedRouteCount(allocation)}대
                            </td>
                            <td>{allocation.efficiency.toFixed(1)}%</td>
                            <td>
                              {warnings.length > 0 ? (
                                <span className={styles.compareWarningBadge}>
                                  {warnings.length}건
                                </span>
                              ) : (
                                <span className={styles.compareSafeBadge}>
                                  양호
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {showDetailedComparison && comparedAllocations.length > 0 && (
                <div className={styles.comparePanel}>
                  <div className={styles.compareHeader}>
                    <h4>추천안 비교</h4>
                    <span>{comparedAllocations.length}개 선택</span>
                  </div>

                  <div className={styles.compareTableWrap}>
                    <table className={styles.compareTable}>
                      <thead>
                        <tr>
                          <th>추천안</th>
                          <th>구성</th>
                          <th>총 좌석</th>
                          <th>빈 좌석</th>
                          <th>버스</th>
                          <th>예상 비용</th>
                          <th>1인 비용</th>
                          <th>총 효용</th>
                          <th>순효용</th>
                          <th>미배차</th>
                          <th>1지망</th>
                          <th>가중 페널티</th>
                          <th>분산</th>
                          <th>효율률</th>
                          <th>운영 체크</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparedAllocations.map(
                          ({ index, allocation, warnings }) => (
                            <tr
                              key={`${allocation.totalCost}-${allocation.totalCapacity}-${index}`}
                              className={
                                selectedAllocation === allocation
                                  ? styles.compareSelectedRow
                                  : ''
                              }
                            >
                              <td>
                                <button
                                  type="button"
                                  className={styles.compareSelectButton}
                                  onClick={() =>
                                    handleSelectAllocation(
                                      allocation,
                                      `추천안 ${index + 1}`
                                    )
                                  }
                                >
                                  추천안 {index + 1}
                                </button>
                              </td>
                              <td>
                                {allocation.combination
                                  .map(
                                    (bus) => `${bus.count}대 ${bus.capacity}인`
                                  )
                                  .join(' + ')}
                              </td>
                              <td>{allocation.totalCapacity}석</td>
                              <td>{allocation.emptySeats}석</td>
                              <td>{allocation.totalBuses}대</td>
                              <td>{allocation.totalCost.toLocaleString()}원</td>
                              <td>
                                {Math.round(
                                  allocation.costPerPerson
                                ).toLocaleString()}
                                원
                              </td>
                              <td>
                                {typeof allocation.totalUtility === 'number'
                                  ? `${Math.round(
                                      allocation.totalUtility
                                    ).toLocaleString()}원`
                                  : '-'}
                              </td>
                              <td>
                                {typeof allocation.netValue === 'number'
                                  ? `${Math.round(
                                      allocation.netValue
                                    ).toLocaleString()}원`
                                  : '-'}
                              </td>
                              <td>
                                {typeof allocation.unservedPeople === 'number'
                                  ? `${allocation.unservedPeople}명`
                                  : '-'}
                              </td>
                              <td>
                                {getFirstChoiceCoverageRate(allocation).toFixed(
                                  0
                                )}
                                %
                              </td>
                              <td>
                                {getWeightedPreferencePenalty(
                                  allocation,
                                  normalizedFirstChoiceWeight,
                                  normalizedSecondChoiceWeight
                                ).toFixed(1)}
                              </td>
                              <td>
                                {getDestinationSplitCount(allocation)}건 / 혼합{' '}
                                {getMixedRouteCount(allocation)}대
                              </td>
                              <td>{allocation.efficiency.toFixed(1)}%</td>
                              <td>
                                {warnings.length > 0 ? (
                                  <span className={styles.compareWarningBadge}>
                                    {warnings.length}건
                                  </span>
                                ) : (
                                  <span className={styles.compareSafeBadge}>
                                    양호
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className={styles.recommendationCardHeader}>
                <h4>추천안 카드</h4>
                <p>상위 3개 안만 먼저 보여줍니다. 상세 비교에서 나머지 기준을 확인하세요.</p>
              </div>

              {visibleRecommendationCards.map((allocation, index) => (
                <div
                  key={`${allocation.totalCost}-${allocation.totalCapacity}-${index}`}
                  className={`${styles.allocationCard} ${
                    selectedAllocation === allocation ? styles.selected : ''
                  }`}
                  onClick={() =>
                    handleSelectAllocation(allocation, `추천안 ${index + 1}`)
                  }
                >
                  <div className={styles.allocationHeader}>
                    <h4>
                      추천안 {index + 1}
                      {index === 0
                        ? ` · ${optimizationModeLabels[optimizationMode]}`
                        : ''}
                    </h4>
                    <div className={styles.allocationHeaderActions}>
                      <label
                        className={styles.compareToggle}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={compareAllocationIndexes.includes(index)}
                          onChange={() => handleToggleCompareAllocation(index)}
                        />
                        비교
                      </label>
                      <input
                        type="radio"
                        name="allocation"
                        checked={selectedAllocation === allocation}
                        onChange={() =>
                          handleSelectAllocation(
                            allocation,
                            `추천안 ${index + 1}`
                          )
                        }
                        onClick={(event) => event.stopPropagation()}
                      />
                    </div>
                  </div>

                  <div className={styles.allocationDetails}>
                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>구성</span>
                      <span className={styles.detailValue}>
                        {allocation.combination
                          .map((bus) => `${bus.count}대 ${bus.capacity}인`)
                          .join(' + ')}
                      </span>
                    </div>

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>총 좌석</span>
                      <span className={styles.detailValue}>
                        {allocation.totalCapacity}석
                      </span>
                    </div>

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>빈 좌석</span>
                      <span className={styles.detailValue}>
                        {allocation.emptySeats}석
                      </span>
                    </div>

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>총 버스</span>
                      <span className={styles.detailValue}>
                        {allocation.totalBuses}대
                      </span>
                    </div>

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>예상 비용</span>
                      <span className={styles.detailValue}>
                        {allocation.totalCost.toLocaleString()}원
                      </span>
                    </div>

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>1인 비용</span>
                      <span className={styles.detailValue}>
                        {Math.round(allocation.costPerPerson).toLocaleString()}원
                      </span>
                    </div>

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>효율률</span>
                      <span className={styles.detailValue}>
                        {allocation.efficiency.toFixed(1)}%
                      </span>
                    </div>

                    {typeof allocation.totalUtility === 'number' && (
                      <div className={styles.detail}>
                        <span className={styles.detailLabel}>총 효용</span>
                        <span className={styles.detailValue}>
                          {Math.round(allocation.totalUtility).toLocaleString()}원
                        </span>
                      </div>
                    )}

                    {typeof allocation.netValue === 'number' && (
                      <div className={styles.detail}>
                        <span className={styles.detailLabel}>순효용</span>
                        <span className={styles.detailValue}>
                          {Math.round(allocation.netValue).toLocaleString()}원
                        </span>
                      </div>
                    )}

                    {typeof allocation.unservedPeople === 'number' && (
                      <div className={styles.detail}>
                        <span className={styles.detailLabel}>미배차</span>
                        <span className={styles.detailValue}>
                          {allocation.unservedPeople}명
                        </span>
                      </div>
                    )}

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>1지망 반영</span>
                      <span className={styles.detailValue}>
                        {getFirstChoiceCoverageRate(allocation).toFixed(0)}%
                      </span>
                    </div>

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>행선지 분산</span>
                      <span className={styles.detailValue}>
                        {getDestinationSplitCount(allocation)}건
                      </span>
                    </div>

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>가중 페널티</span>
                      <span className={styles.detailValue}>
                        {getWeightedPreferencePenalty(
                          allocation,
                          normalizedFirstChoiceWeight,
                          normalizedSecondChoiceWeight
                        ).toFixed(1)}
                      </span>
                    </div>

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>혼합 차량</span>
                      <span className={styles.detailValue}>
                        {getMixedRouteCount(allocation)}대
                      </span>
                    </div>

                    <div className={styles.detail}>
                      <span className={styles.detailLabel}>추천 점수</span>
                      <span className={styles.detailValue}>
                        {Math.round(allocation.qualityScore).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className={styles.routePlan}>
                    <strong>버스별 행선지 초안</strong>
                    {allocation.routePlan.map((route) => (
                      <div key={route.busLabel} className={styles.routeItem}>
                        <div className={styles.routeHeader}>
                          <span>
                            {route.busLabel} · {route.capacity}인승
                          </span>
                          <span>
                            {route.passengerCount}명 / 빈 {route.emptySeats}석
                          </span>
                        </div>
                        <p>
                          {route.destinations.length === 0
                            ? '배정 없음'
                            : route.destinations
                                .map(
                                  (destination) =>
                                    `${destination.name} ${destination.passengerCount}명`
                                )
                                .join(' · ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {selectedAllocation && (
                <>
                  <div className={styles.selectedInsightGrid}>
                    <div className={styles.insightPanel}>
                      <h4>잔여석 요약</h4>
                      <div className={styles.remainingSeatList}>
                        {selectedRemainingSeats.map((item) => (
                          <div key={item.label} className={styles.remainingSeatItem}>
                            <div>
                              <strong>{item.label}</strong>
                              <span>{item.destinations}</span>
                            </div>
                            <b>
                              {item.emptySeats}석 남음 / {item.capacity}석
                            </b>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={styles.insightPanel}>
                      <h4>운영 체크</h4>
                      {selectedWarnings.length > 0 ? (
                        <div className={styles.warningList}>
                          {selectedWarnings.map((warning) => (
                            <div key={warning} className={styles.warningItem}>
                              <AlertTriangle size={16} />
                              <span>{warning}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className={styles.safeMessage}>
                          특별한 경고 없이 운영 가능한 배차안입니다.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className={styles.autoAssignPanel}>
                    <div className={styles.autoAssignHeader}>
                      <div>
                        <h4>선택 로직대로 인원 자동 배차</h4>
                        <p>
                          현재 선택한 추천안을 기준으로 미확정 신청자를 버스별
                          행선지에 맞춰 자동 확정합니다. 기존 확정 버스표는
                          변경하지 않습니다.
                        </p>
                      </div>
                      <span>{optimizationModeLabels[optimizationMode]}</span>
                    </div>

                    <div className={styles.autoAssignFields}>
                      <label>
                        <span>출발 시간</span>
                        <input
                          value={autoAssignDepartureTime}
                          onChange={(event) =>
                            setAutoAssignDepartureTime(event.target.value)
                          }
                          placeholder="예: 2026. 8. 1. 14:00"
                        />
                      </label>
                      <label>
                        <span>탑승 장소</span>
                        <input
                          value={autoAssignBoardingPlace}
                          onChange={(event) =>
                            setAutoAssignBoardingPlace(event.target.value)
                          }
                          placeholder="예: 본부 앞 버스 승강장"
                        />
                      </label>
                      <label>
                        <span>관리 메모</span>
                        <input
                          value={autoAssignManagerNote}
                          onChange={(event) =>
                            setAutoAssignManagerNote(event.target.value)
                          }
                          placeholder="선택 입력"
                        />
                      </label>
                    </div>

                    <div className={styles.autoAssignFooter}>
                      {lastAutoAssignSummary ? (
                        <p>{lastAutoAssignSummary}</p>
                      ) : (
                        <p>
                          좌석번호는 버스별 1번부터 자동 부여되며, 희망 순위가
                          높은 신청자와 신청 시간이 빠른 신청자를 먼저 배치합니다.
                        </p>
                      )}
                      <button
                        type="button"
                        className={styles.saveButton}
                        onClick={handleAutoAssignSelectedAllocation}
                        disabled={
                          autoAssigning ||
                          !autoAssignDepartureTime.trim() ||
                          !autoAssignBoardingPlace.trim()
                        }
                      >
                        <CheckCircle2 size={16} />
                        {autoAssigning ? '자동 배차 중...' : '선택 로직대로 배차'}
                      </button>
                    </div>
                  </div>

                  <div className={styles.saveSection}>
                    <input
                      type="text"
                      placeholder="배분 이름 (예: 1차 귀가 버스 배분안)"
                      value={allocationName}
                      onChange={(event) => setAllocationName(event.target.value)}
                      className={styles.allocationNameInput}
                    />
                    <button
                      className={styles.secondaryButton}
                      onClick={handleDownloadSelectedAllocation}
                    >
                      <Download size={16} />
                      CSV
                    </button>
                    <button
                      className={styles.saveButton}
                      onClick={handleSaveAllocation}
                      disabled={!allocationName.trim()}
                    >
                      저장하기
                    </button>
                  </div>

                  {hasSavedAllocation && (
                    <div className={styles.nextActionPanel}>
                      <div>
                        <strong>배분안 저장 완료</strong>
                        <p>이제 개인 버스표 관리에서 신청자별 배차를 확정할 수 있습니다.</p>
                      </div>
                      <div className={styles.nextActionButtons}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={handleDownloadSelectedAllocation}
                        >
                          <Download size={16} />
                          CSV 다운로드
                        </button>
                        <button
                          type="button"
                          className={styles.saveButton}
                          onClick={() => navigate('/admin/personal-tickets')}
                        >
                          개인 버스표 관리로 이동
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default BusAllocationPage;
