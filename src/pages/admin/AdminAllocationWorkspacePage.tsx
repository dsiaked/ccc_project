import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Bus,
  CheckCircle2,
  GripVertical,
  History,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import {
  acquireAllocationWorkspaceLock,
  cancelConfirmedWorkspace,
  confirmAllocationWorkspace,
  deleteDraftAllocationWorkspace,
  getAllocationWorkspaceVersionSnapshot,
  getAllocationWorkspaceVersions,
  getDraftAllocationWorkspaceSummaries,
  getBelowMinimumBusIds,
  getFirstChoiceCoverage,
  getOutOfPreferencePassengerIds,
  getWorkspaceTotals,
  refreshDraftWorkspacePassengers,
  saveAllocationWorkspace,
  saveConfirmedWorkspaceChanges,
  validateAllocationWorkspaceConfirmation,
  validateWorkspace,
} from '../../lib/admin/allocationWorkspaceService';
import type {
  AllocationConfirmationPreflight,
  AllocationConfirmationPreflightCheck,
  AllocationConfirmationPreflightDetail,
  AllocationWorkspaceBus,
  AllocationWorkspaceData,
  AllocationWorkspacePassenger,
  AllocationWorkspaceRow,
  AllocationWorkspaceSummary,
  AllocationWorkspaceVersionSummary,
} from '../../lib/admin/allocationWorkspaceService';
import { describeAllocationWorkspaceChanges } from '../../lib/admin/allocationWorkspaceHistory';
import { supabase } from '../../lib/supabase';

import styles from './AdminAllocationWorkspacePage.module.css';

type BusIssueField =
  | 'label'
  | 'destination'
  | 'departureTime'
  | 'boardingPlace'
  | 'capacity'
  | 'availability';
type PassengerIssueField = 'assignment' | 'seat' | 'preferences';
type PassengerQuickFilter =
  | 'all'
  | 'unassigned'
  | 'errors'
  | 'first-choice-missed'
  | 'seat-missing';
const PASSENGER_QUICK_FILTERS: Array<{
  id: PassengerQuickFilter;
  label: string;
}> = [
  { id: 'all', label: '전체' },
  { id: 'unassigned', label: '미배차' },
  { id: 'errors', label: '오류 있음' },
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

const groupValidationErrors = (errors: string[]) => {
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

const PASSENGER_ROW_HEIGHT = 58;
const PASSENGER_TABLE_VIEWPORT_HEIGHT = 520;
const PASSENGER_TABLE_OVERSCAN = 6;
const CONFIRMATION_PREFLIGHT_LABELS: Record<
  AllocationConfirmationPreflightCheck['key'],
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
type EditorTab = 'buses' | 'passengers';
type ConfirmationAction = 'confirm' | 'cancel';
type CompletionNotice = 'confirmed' | 'cancelled';
interface ConfirmationFailure {
  title: string;
  reasons: string[];
}

const getErrorMessage = (error: unknown, fallback: string) => {
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

interface WorkspaceIssueTargets {
  busIds: Set<string>;
  busFields: Map<string, Set<BusIssueField>>;
  passengerIds: Set<string>;
  passengerFields: Map<string, Set<PassengerIssueField>>;
  hasUnassignedIssue: boolean;
}

interface WorkspaceTimelineItem {
  id: string;
  at: string;
  actorId: string;
  action: string;
  detail: string;
  changes?: string[];
  version?: AllocationWorkspaceVersionSummary;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const getWorkspaceIssueTargets = (
  workspace: AllocationWorkspaceData | null
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
  const passengersByBus = new Map<string, AllocationWorkspacePassenger[]>();

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
    if (!bus.departureTime.trim()) addBusIssue(bus.id, 'departureTime');
    if (!bus.boardingPlace.trim()) addBusIssue(bus.id, 'boardingPlace');

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
      if (!passenger.preferences.includes(bus.destination)) {
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
    if (
      !passenger.busId ||
      !busIds.has(passenger.busId)
    ) {
      addPassengerIssue(passenger.reservationId, 'assignment');
      targets.hasUnassignedIssue ||= !passenger.busId;
    }
    if (passenger.preferences.length < 2) {
      addPassengerIssue(passenger.reservationId, 'preferences');
    }
  });

  return targets;
};

const nextSeatNumber = (
  workspace: AllocationWorkspaceData,
  busId: string
) => {
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

const AdminAllocationWorkspacePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get('id') ?? '';
  const [row, setRow] = useState<AllocationWorkspaceRow | null>(null);
  const [workspace, setWorkspace] = useState<AllocationWorkspaceData | null>(
    null
  );
  const [otherWorkspaces, setOtherWorkspaces] = useState<
    AllocationWorkspaceSummary[]
  >([]);
  const [selectedBusId, setSelectedBusId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [cancelText, setCancelText] = useState('');
  const [selectedPassengerSearch, setSelectedPassengerSearch] = useState('');
  const [allPassengerSearch, setAllPassengerSearch] = useState('');
  const [passengerToReveal, setPassengerToReveal] = useState<string | null>(
    null
  );
  const [passengerQuickFilter, setPassengerQuickFilter] =
    useState<PassengerQuickFilter>('all');
  const [activeEditorTab, setActiveEditorTab] = useState<EditorTab>('buses');
  const [confirmationAction, setConfirmationAction] =
    useState<ConfirmationAction | null>(null);
  const [confirmationPreflight, setConfirmationPreflight] =
    useState<AllocationConfirmationPreflight | null>(null);
  const [confirmationFailure, setConfirmationFailure] =
    useState<ConfirmationFailure | null>(null);
  const [preflightChecking, setPreflightChecking] = useState(false);
  const [completionNotice, setCompletionNotice] =
    useState<CompletionNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [workspaceVersions, setWorkspaceVersions] = useState<
    AllocationWorkspaceVersionSummary[]
  >([]);

  useEffect(() => {
    if (!workspaceId) {
      navigate('/admin/allocation');
      return;
    }

    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error('로그인이 필요합니다.');

        const lockResult = await acquireAllocationWorkspaceLock(workspaceId);
        const loadWarnings: string[] = [];
        let refreshed = {
          workspace: lockResult.row.allocation_data,
          changed: false,
        };
        if (!lockResult.readOnly) {
          try {
            refreshed = await refreshDraftWorkspacePassengers(
              lockResult.row.allocation_data
            );
          } catch (refreshError) {
            loadWarnings.push(
              `최신 활성 신청자 반영 실패: ${getErrorMessage(
                refreshError,
                '신청자 목록을 조회하지 못했습니다.'
              )}`
            );
          }
        }

        const [summariesResult, versionsResult] = await Promise.allSettled([
          getDraftAllocationWorkspaceSummaries(),
          getAllocationWorkspaceVersions(workspaceId),
        ]);
        const nextRows =
          summariesResult.status === 'fulfilled' ? summariesResult.value : [];
        if (summariesResult.status === 'rejected') {
          loadWarnings.push(
            `다른 임시 배차안 목록 조회 실패: ${getErrorMessage(
              summariesResult.reason,
              '임시 배차안 목록을 조회하지 못했습니다.'
            )}`
          );
        }
        if (versionsResult.status === 'rejected') {
          loadWarnings.push(
            `버전 목록 조회 실패: ${getErrorMessage(
              versionsResult.reason,
              '저장 버전 목록을 조회하지 못했습니다.'
            )}`
          );
        }

        const nextRow = refreshed.changed
          ? { ...lockResult.row, allocation_data: refreshed.workspace }
          : lockResult.row;

        setRow(nextRow);
        setWorkspace(refreshed.workspace);
        setDirty(refreshed.changed);
        setReadOnly(lockResult.readOnly);
        setSelectedBusId(refreshed.workspace.buses[0]?.id ?? '');
        setOtherWorkspaces(
          nextRows.filter(
            (item) =>
              item.id !== workspaceId && item.status === 'draft'
          )
        );
        setWorkspaceVersions(
          versionsResult.status === 'fulfilled'
            ? versionsResult.value
            : (refreshed.workspace.versions ?? []).map((version) => ({
                id: version.id,
                createdAt: version.createdAt,
                actorId: version.actorId,
                label: version.label,
              }))
        );
        setError(
          loadWarnings.length > 0
            ? `배차 작업안은 불러왔지만 일부 정보 조회에 실패했습니다.\n${loadWarnings.join('\n')}`
            : null
        );
      } catch (loadError) {
        console.error(loadError);
        setError(
          `배차 작업안을 불러오지 못했습니다.\n${getErrorMessage(
            loadError,
            '알 수 없는 조회 오류가 발생했습니다.'
          )}`
        );
      }
    })();
  }, [navigate, workspaceId]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const selectedBus = workspace?.buses.find((bus) => bus.id === selectedBusId);
  const deferredWorkspace = useDeferredValue(workspace);
  const validation = useMemo(
    () =>
      deferredWorkspace
        ? validateWorkspace(deferredWorkspace)
        : { errors: [], warnings: [] },
    [deferredWorkspace]
  );
  const validationErrorGroups = useMemo(
    () => groupValidationErrors(validation.errors),
    [validation.errors]
  );
  const totals = useMemo(
    () => (workspace ? getWorkspaceTotals(workspace) : { totalCost: 0, totalCapacity: 0 }),
    [workspace]
  );
  const passengerCountByBus = useMemo(() => {
    const counts = new Map<string, number>();
    workspace?.passengers.forEach((passenger) => {
      if (passenger.busId) {
        counts.set(passenger.busId, (counts.get(passenger.busId) ?? 0) + 1);
      }
    });
    return counts;
  }, [workspace]);
  const issueTargets = useMemo(
    () => getWorkspaceIssueTargets(deferredWorkspace),
    [deferredWorkspace]
  );
  const deferredAllPassengerSearch = useDeferredValue(allPassengerSearch);
  const allPassengerSearchIndex = useMemo(() => {
    if (!deferredWorkspace) return [];
    const busById = new Map(
      deferredWorkspace.buses.map((bus) => [bus.id, bus])
    );

    return deferredWorkspace.passengers.map((passenger) => {
      const bus = passenger.busId ? busById.get(passenger.busId) : undefined;
      return {
        passenger,
        searchText: [
          passenger.name,
          passenger.phone,
          passenger.campus,
          passenger.team,
          passenger.preferences.join(' '),
          bus?.label ?? '미배차',
          bus?.destination ?? '',
          String(passenger.seatNumber ?? ''),
        ]
          .join(' ')
          .toLocaleLowerCase('ko'),
      };
    });
  }, [deferredWorkspace]);
  const passengerQuickFilterCounts = useMemo(() => {
    if (!deferredWorkspace) {
      return {
        all: 0,
        unassigned: 0,
        errors: 0,
        'first-choice-missed': 0,
        'seat-missing': 0,
      };
    }
    const busById = new Map(
      deferredWorkspace.buses.map((bus) => [bus.id, bus])
    );
    return {
      all: deferredWorkspace.passengers.length,
      unassigned: deferredWorkspace.passengers.filter(
        (passenger) => !passenger.busId
      ).length,
      errors: deferredWorkspace.passengers.filter((passenger) =>
        issueTargets.passengerIds.has(passenger.reservationId)
      ).length,
      'first-choice-missed': deferredWorkspace.passengers.filter((passenger) => {
        const bus = passenger.busId ? busById.get(passenger.busId) : undefined;
        return Boolean(bus && bus.destination !== passenger.preferences[0]);
      }).length,
      'seat-missing': deferredWorkspace.passengers.filter(
        (passenger) => passenger.busId && passenger.seatNumber === null
      ).length,
    };
  }, [deferredWorkspace, issueTargets.passengerIds]);
  const normalizedAllPassengerSearch = allPassengerSearch
    .trim()
    .toLocaleLowerCase('ko');
  const normalizedDeferredAllPassengerSearch = deferredAllPassengerSearch
    .trim()
    .toLocaleLowerCase('ko');
  const allPassengerSearchMatches = useMemo(
    () =>
      allPassengerSearchIndex.filter(({ passenger, searchText }) => {
        const bus = deferredWorkspace?.buses.find(
          (item) => item.id === passenger.busId
        );
        if (passengerQuickFilter === 'unassigned' && passenger.busId) return false;
        if (
          passengerQuickFilter === 'errors' &&
          !issueTargets.passengerIds.has(passenger.reservationId)
        ) return false;
        if (
          passengerQuickFilter === 'first-choice-missed' &&
          (!bus || bus.destination === passenger.preferences[0])
        ) return false;
        if (
          passengerQuickFilter === 'seat-missing' &&
          (!passenger.busId || passenger.seatNumber !== null)
        ) return false;
        if (!normalizedDeferredAllPassengerSearch) return true;
        return searchText.includes(normalizedDeferredAllPassengerSearch);
      }),
    [
      allPassengerSearchIndex,
      issueTargets.passengerIds,
      normalizedDeferredAllPassengerSearch,
      passengerQuickFilter,
      deferredWorkspace?.buses,
    ]
  );

  const updateWorkspace = useCallback((
    updater: (current: AllocationWorkspaceData) => AllocationWorkspaceData
  ) => {
    setWorkspace((current) => (current ? updater(current) : current));
    setDirty(true);
    setConfirmationPreflight(null);
    setConfirmationFailure(null);
  }, []);

  const updateBus = (
    busId: string,
    key: keyof AllocationWorkspaceBus,
    value: string | number
  ) => {
    updateWorkspace((current) => {
      const buses = current.buses.map((bus) =>
        bus.id === busId ? { ...bus, [key]: value } : bus
      );
      return buses === current.buses
        ? current
        : {
            ...current,
            buses,
            allowOutOfPreferenceOverride:
              key === 'destination'
                ? false
                : current.allowOutOfPreferenceOverride,
            outOfPreferenceAcknowledgement:
              key === 'destination'
                ? undefined
                : current.outOfPreferenceAcknowledgement,
          };
    });
  };

  const assignPassenger = useCallback((passengerId: string, busId: string | null) => {
    updateWorkspace((current) => {
      const passenger = current.passengers.find(
        (item) => item.reservationId === passengerId
      );
      if (!passenger) return current;
      const seatNumber = busId ? nextSeatNumber(current, busId) : null;
      return {
        ...current,
        allowOutOfPreferenceOverride: false,
        outOfPreferenceAcknowledgement: undefined,
        passengers: current.passengers.map((item) =>
          item.reservationId === passengerId
            ? { ...item, busId, seatNumber }
            : item
        ),
      };
    });
  }, [updateWorkspace]);

  const dropPassenger = (
    event: React.DragEvent<HTMLElement>,
    busId: string | null
  ) => {
    event.preventDefault();
    const passengerId = event.dataTransfer.getData('text/allocation-passenger');
    if (passengerId) assignPassenger(passengerId, busId);
  };

  const updatePassengerSeat = useCallback((passengerId: string, seatNumber: number | null) => {
    updateWorkspace((current) => {
      return {
        ...current,
        passengers: current.passengers.map((passenger) =>
          passenger.reservationId === passengerId
            ? { ...passenger, seatNumber }
            : passenger
        ),
      };
    });
  }, [updateWorkspace]);

  const addBus = () => {
    updateWorkspace((current) => {
      const template = current.buses[0];
      if (!template) return current;
      const busNumber = current.buses.length + 1;
      const bus: AllocationWorkspaceBus = {
        ...clone(template),
        id: `bus-${Date.now()}-${busNumber}`,
        optionId: undefined,
        label: `${busNumber}호차`,
        maxAvailableCount: undefined,
        destination: '',
      };
      setSelectedBusId(bus.id);
      return { ...current, buses: [...current.buses, bus] };
    });
  };

  const deleteBus = (busId: string) => {
    if (!window.confirm('이 버스를 삭제하고 탑승객을 미배차 상태로 옮길까요?')) return;
    updateWorkspace((current) => {
      const buses = current.buses.filter((bus) => bus.id !== busId);
      const passengers = current.passengers.map((passenger) =>
        passenger.busId === busId
          ? { ...passenger, busId: null, seatNumber: null }
          : passenger
      );
      setSelectedBusId(buses[0]?.id ?? '');
      return { ...current, buses, passengers };
    });
  };

  const save = async () => {
    if (!row || !workspace) return;
    setSaving(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('로그인이 필요합니다.');

      const saved =
        workspace.status === 'confirmed'
          ? await saveConfirmedWorkspaceChanges(row, workspace, session.user.id)
          : await saveAllocationWorkspace(row, workspace, session.user.id);
      setRow(saved);
      setWorkspace(saved.allocation_data);
      void getAllocationWorkspaceVersions(saved.id)
        .then(setWorkspaceVersions)
        .catch((versionError) => console.warn('Failed to refresh versions:', versionError));
      setDirty(false);
      setConfirmationPreflight(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const deleteWorkspace = async () => {
    if (
      !row ||
      !workspace ||
      workspace.status !== 'draft' ||
      !window.confirm(
        `"${row.allocation_name}" 임시 배차안을 삭제할까요? 저장하지 않은 변경사항과 배차안 기록이 모두 삭제됩니다.`
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await deleteDraftAllocationWorkspace(row);
      navigate('/admin/allocation');
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : '임시 배차안을 삭제하지 못했습니다.'
      );
      setSaving(false);
    }
  };

  const restoreVersion = async (versionId: string) => {
    if (!workspace) return;
    const version = workspaceVersions.find((item) => item.id === versionId);
    if (!version || !window.confirm(`${version.label} 상태로 복원할까요?`)) return;
    setSaving(true);
    setError(null);
    try {
      const legacyVersion = workspace.versions?.find((item) => item.id === versionId);
      const snapshot =
        legacyVersion ?? (await getAllocationWorkspaceVersionSnapshot(versionId));
      updateWorkspace((current) => ({
        ...current,
        buses: clone(snapshot.buses),
        passengers: clone(snapshot.passengers),
      }));
      setSelectedBusId(snapshot.buses[0]?.id ?? '');
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : '저장 버전을 복원하지 못했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  const workspaceTimeline = useMemo<WorkspaceTimelineItem[]>(() => {
    if (!workspace) return [];

    const unmatchedVersions = new Map(
      workspaceVersions.map((version) => [version.id, version])
    );
    const legacyVersions = workspace.versions ?? [];
    const getLegacyChanges = (version: AllocationWorkspaceVersionSummary) => {
      if (version.changes) return version.changes;
      const versionIndex = legacyVersions.findIndex(
        (candidate) => candidate.id === version.id
      );
      if (versionIndex <= 0) return undefined;
      return describeAllocationWorkspaceChanges(
        legacyVersions[versionIndex - 1],
        legacyVersions[versionIndex]
      );
    };
    const timeline = workspace.history.map((item) => {
      const explicitlyLinkedVersion = item.versionId
        ? unmatchedVersions.get(item.versionId)
        : undefined;
      const legacyLinkedVersion =
        explicitlyLinkedVersion ??
        Array.from(unmatchedVersions.values()).find(
          (version) =>
            version.createdAt === item.at && version.actorId === item.actorId
        );
      if (legacyLinkedVersion) unmatchedVersions.delete(legacyLinkedVersion.id);

      return {
        ...item,
        changes: item.changes ?? (
          legacyLinkedVersion ? getLegacyChanges(legacyLinkedVersion) : undefined
        ),
        version: legacyLinkedVersion,
      };
    });

    unmatchedVersions.forEach((version) => {
      timeline.push({
        id: `legacy-${version.id}`,
        at: version.createdAt,
        actorId: version.actorId,
        action: 'version_saved',
        detail: `${version.label} 상태를 저장했습니다.`,
        changes: getLegacyChanges(version),
        version,
      });
    });

    return timeline.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    );
  }, [workspace, workspaceVersions]);

  const confirmAll = async () => {
    if (
      !row ||
      !workspace ||
      readOnly ||
      dirty ||
      !canConfirm ||
      saving ||
      confirmText !== '전체 배차를 확정합니다'
    ) return;
    setSaving(true);
    setConfirmationAction('confirm');
    setCompletionNotice(null);
    setConfirmationFailure(null);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('로그인이 필요합니다.');
      const preflight = await validateAllocationWorkspaceConfirmation(
        row,
        workspace
      );
      setConfirmationPreflight(preflight);
      if (!preflight.valid) {
        const reasons =
          preflight.details?.length > 0
            ? preflight.details.map((detail) => detail.message)
            : preflight.checks
                .filter((check) => !check.valid)
                .map(
                  (check) =>
                    `${CONFIRMATION_PREFLIGHT_LABELS[check.key]} 확인이 필요합니다.`
                );
        setConfirmationFailure({
          title: '서버 검증을 통과하지 못해 배차가 확정되지 않았습니다.',
          reasons:
            reasons.length > 0
              ? reasons
              : ['서버 검증 실패 항목을 확인해주세요.'],
        });
        setError('배차 확정에 실패했습니다. 확정 영역의 실패 이유를 확인해주세요.');
        return;
      }
      const saved = await confirmAllocationWorkspace(row, workspace, session.user.id);
      setRow(saved);
      setWorkspace(saved.allocation_data);
      void getAllocationWorkspaceVersions(saved.id)
        .then(setWorkspaceVersions)
        .catch((versionError) => console.warn('Failed to refresh versions:', versionError));
      setDirty(false);
      setConfirmText('');
      setConfirmationFailure(null);
      setCompletionNotice('confirmed');
    } catch (confirmError) {
      const reason =
        confirmError instanceof Error
          ? confirmError.message
          : '알 수 없는 서버 오류가 발생했습니다.';
      setConfirmationFailure({
        title: '서버에서 배차 확정 처리를 완료하지 못했습니다.',
        reasons: [reason],
      });
      setError(
        '배차 확정에 실패했습니다. 확정 영역의 실패 이유를 확인해주세요.'
      );
    } finally {
      setSaving(false);
      setConfirmationAction(null);
    }
  };

  const runConfirmationPreflight = async () => {
    if (!row || !workspace || dirty) return;
    setPreflightChecking(true);
    setError(null);
    try {
      const preflight = await validateAllocationWorkspaceConfirmation(
        row,
        workspace
      );
      setConfirmationPreflight(preflight);
      if (!preflight.valid) {
        setError(
          '서버 사전 검증을 통과하지 못했습니다. 실패 항목을 확인해주세요.'
        );
      }
    } catch (preflightError) {
      setConfirmationPreflight(null);
      setError(
        preflightError instanceof Error
          ? preflightError.message
          : '서버 사전 검증을 실행하지 못했습니다.'
      );
    } finally {
      setPreflightChecking(false);
    }
  };

  const cancelConfirmation = async () => {
    if (!row || !workspace || cancelText !== '배차 확정을 취소합니다') return;
    setSaving(true);
    setConfirmationAction('cancel');
    setCompletionNotice(null);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('로그인이 필요합니다.');
      const saved = await cancelConfirmedWorkspace(row, workspace, session.user.id);
      setRow(saved);
      setWorkspace(saved.allocation_data);
      void getAllocationWorkspaceVersions(saved.id)
        .then(setWorkspaceVersions)
        .catch((versionError) => console.warn('Failed to refresh versions:', versionError));
      setDirty(false);
      setCancelText('');
      setCompletionNotice('cancelled');
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : '확정을 취소하지 못했습니다.'
      );
    } finally {
      setSaving(false);
      setConfirmationAction(null);
    }
  };

  if (!workspace || !row) {
    return (
      <div className={styles.page}>
        <AdminHeader />
        <main className={styles.main}>
          {error ? (
            <div className={styles.loadFailure}>
              <strong>배차 작업안을 열지 못했습니다.</strong>
              <p>{error}</p>
              <div>
                <button type="button" onClick={() => window.location.reload()}>
                  다시 불러오기
                </button>
                <button type="button" onClick={() => navigate('/admin/allocation')}>
                  <ArrowLeft size={16} /> 배차 계산으로
                </button>
              </div>
            </div>
          ) : (
            '배차 작업안을 불러오는 중입니다.'
          )}
        </main>
      </div>
    );
  }

  const selectedPassengers = workspace.passengers
    .filter((passenger) => passenger.busId === selectedBusId)
    .sort(
      (a, b) =>
        (a.seatNumber ?? Number.MAX_SAFE_INTEGER) -
          (b.seatNumber ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name, 'ko')
    );
  const normalizedSelectedPassengerSearch = selectedPassengerSearch
    .trim()
    .toLocaleLowerCase('ko');
  const visibleSelectedPassengers = selectedPassengers.filter((passenger) =>
    [
      passenger.name,
      passenger.phone,
      passenger.campus,
      passenger.team,
      String(passenger.seatNumber ?? ''),
    ]
      .join(' ')
      .toLocaleLowerCase('ko')
      .includes(normalizedSelectedPassengerSearch)
  );
  const visibleAllPassengers = allPassengerSearchMatches.map(
    ({ passenger }) => passenger
  );
  const isAllPassengerSearchPending =
    normalizedAllPassengerSearch !== normalizedDeferredAllPassengerSearch;
  const unassignedPassengers = workspace.passengers.filter(
    (passenger) => !passenger.busId
  );
  const destinationOptions = [
    ...new Set(workspace.passengers.flatMap((passenger) => passenger.preferences)),
  ];
  const belowMinimumBusIds = getBelowMinimumBusIds(workspace);
  const outOfPreferencePassengerIds = getOutOfPreferencePassengerIds(workspace);
  const minimumWarningsApproved =
    belowMinimumBusIds.length === 0 || workspace.allowMinimumPassengerOverride;
  const preferenceWarningsApproved =
    outOfPreferencePassengerIds.length === 0 ||
    workspace.allowOutOfPreferenceOverride;
  const canConfirm =
    validation.errors.length === 0 &&
    minimumWarningsApproved &&
    preferenceWarningsApproved;
  const exceedsOptimalBaseline = Boolean(
    workspace.optimalBaseline &&
      (workspace.buses.length > workspace.optimalBaseline.totalBuses ||
        totals.totalCost > workspace.optimalBaseline.totalCost)
  );
  const confirmationReadinessCount = [
    validation.errors.length === 0,
    minimumWarningsApproved,
    preferenceWarningsApproved,
    !dirty,
    confirmText === '전체 배차를 확정합니다',
  ].filter(Boolean).length;
  const saveDisabledReason = saving
    ? '변경사항을 저장하고 있습니다.'
    : readOnly
      ? '다른 전체 관리자가 편집 중이라 저장할 수 없습니다.'
      : !dirty
        ? '저장할 변경사항이 없습니다.'
        : null;
  const confirmDisabledReasons = [
    readOnly ? '다른 전체 관리자가 편집 중입니다.' : null,
    saving ? '배차 확정 작업을 처리 중입니다.' : null,
    dirty ? '저장하지 않은 변경사항이 있습니다. 변경사항 저장 버튼을 눌러주세요.' : null,
    validation.errors.length > 0
      ? `차단 오류 ${validation.errors.length}건을 해결해야 합니다.`
      : null,
    belowMinimumBusIds.length > 0 && !workspace.allowMinimumPassengerOverride
      ? `최소 탑승 인원 미달 버스 ${belowMinimumBusIds.length}대를 예외 승인해야 합니다.`
      : null,
    outOfPreferencePassengerIds.length > 0 &&
    !workspace.allowOutOfPreferenceOverride
      ? `1·2지망 외 배정 승객 ${outOfPreferencePassengerIds.length}명을 별도로 승인해야 합니다.`
      : null,
    confirmText !== '전체 배차를 확정합니다'
      ? '확정 문구 "전체 배차를 확정합니다"를 정확히 입력해주세요.'
      : null,
  ].filter((reason): reason is string => reason !== null);
  const confirmDisabledReason =
    confirmDisabledReasons.length > 0 ? confirmDisabledReasons.join('\n') : null;
  const goToIssue = (issue: string) => {
    const passenger = workspace.passengers.find((item) =>
      issue.startsWith(`${item.name}:`)
    );
    if (passenger) {
      setActiveEditorTab('passengers');
      setAllPassengerSearch(passenger.name);
      setPassengerQuickFilter('all');
      setPassengerToReveal(passenger.reservationId);
      return;
    }

    const bus = workspace.buses.find(
      (item) =>
        issue.startsWith(`${item.label}:`) ||
        issue.includes(`중복되었습니다: ${item.label}`)
    ) ?? workspace.buses.find((item) => issueTargets.busIds.has(item.id));
    if (bus) {
      setActiveEditorTab('buses');
      setSelectedBusId(bus.id);
      setSelectedPassengerSearch('');
      window.setTimeout(
        () =>
          document
            .getElementById('bus-editor')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        0
      );
      return;
    }

    document
      .getElementById('validation-review')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const goToPreflightDetail = async (
    detail: AllocationConfirmationPreflightDetail
  ) => {
    let passenger = detail.passenger_id
      ? workspace.passengers.find(
          (item) => item.reservationId === detail.passenger_id
        )
      : undefined;
    if (!passenger && detail.requires_refresh && detail.reservation_id) {
      setPreflightChecking(true);
      setError(null);
      try {
        const refreshed = await refreshDraftWorkspacePassengers(workspace);
        if (refreshed.changed) {
          setWorkspace(refreshed.workspace);
          setDirty(true);
          setConfirmationPreflight(null);
        }
        passenger = refreshed.workspace.passengers.find(
          (item) => item.reservationId === detail.reservation_id
        );
      } catch (refreshError) {
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : '최신 신청자를 배차안에 반영하지 못했습니다.'
        );
      } finally {
        setPreflightChecking(false);
      }
    }
    if (passenger) {
      setActiveEditorTab('passengers');
      setAllPassengerSearch(passenger.name);
      setPassengerQuickFilter('all');
      setPassengerToReveal(passenger.reservationId);
      return;
    }

    const bus = detail.bus_id
      ? workspace.buses.find((item) => item.id === detail.bus_id)
      : undefined;
    if (bus) {
      setActiveEditorTab('buses');
      setSelectedBusId(bus.id);
      setSelectedPassengerSearch('');
      window.setTimeout(
        () =>
          document
            .getElementById('bus-editor')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        0
      );
    }
  };

  return (
    <div className={styles.page}>
      <AdminHeader />
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <button type="button" className={styles.back} onClick={() => navigate('/admin/allocation')}>
              <ArrowLeft size={17} /> 배차 계산으로
            </button>
            <h1>{row.allocation_name}</h1>
            <p>
              {workspace.status === 'confirmed' ? '확정 배차' : '임시 배차안'} ·
              저장 버튼을 눌러야 변경사항이 반영됩니다.
            </p>
          </div>
        </header>

        <div className={styles.actionBar}>
          <div className={styles.actionStatus}>
            <span className={`${styles.saveStatus} ${dirty ? styles.unsavedStatus : styles.savedStatus}`}>
              {dirty ? '저장하지 않은 변경사항 있음' : '모든 변경사항 저장됨'}
            </span>
            {workspace.status === 'draft' ? (
              <button
                type="button"
                className={styles.readinessLink}
                onClick={() =>
                  document
                    .getElementById('allocation-confirmation')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                확정 준비 {confirmationReadinessCount}/5
              </button>
            ) : (
              <span className={styles.confirmedStatus}>확정 완료</span>
            )}
          </div>
          <div className={styles.saveAction}>
            <button
              type="button"
              className={styles.saveButton}
              disabled={saveDisabledReason !== null}
              title={saveDisabledReason ?? undefined}
              onClick={save}
            >
              <Save size={17} />{' '}
              {saving
                ? confirmationAction
                  ? '처리 중...'
                  : '저장 중...'
                : '변경사항 저장'}
            </button>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {completionNotice && (
          <div
            className={`${styles.completionNotice} ${
              completionNotice === 'confirmed'
                ? styles.confirmedNotice
                : styles.cancelledNotice
            }`}
            role="status"
            aria-live="polite"
          >
            <div className={styles.completionNoticeIcon}>
              {completionNotice === 'confirmed' ? (
                <BadgeCheck size={24} />
              ) : (
                <RotateCcw size={22} />
              )}
            </div>
            <div>
              <strong>
                {completionNotice === 'confirmed'
                  ? '전체 배차를 확정했습니다.'
                  : '배차 확정을 취소했습니다.'}
              </strong>
              <span>
                {completionNotice === 'confirmed'
                  ? '승객 버스표에 확정 배차가 반영되었습니다.'
                  : '승객 버스표가 숨겨지고 임시 배차안으로 전환되었습니다.'}
              </span>
            </div>
            <button
              type="button"
              aria-label="알림 닫기"
              onClick={() => setCompletionNotice(null)}
            >
              <X size={17} />
            </button>
          </div>
        )}
        {readOnly && (
          <div className={styles.readOnlyBanner}>
            다른 전체 관리자가 이 배차안을 편집 중입니다. 현재는 조회만 가능합니다.
          </div>
        )}
        {exceedsOptimalBaseline && workspace.optimalBaseline && (
          <div className={styles.readOnlyBanner}>
            예약 변경 또는 관리자 조정으로 기존 최적해보다 버스가 늘었습니다. 현재{' '}
            {workspace.buses.length}대 / 기준 {workspace.optimalBaseline.totalBuses}대이며,
            확정 전에 추가 버스와 승객 배정을 확인해주세요.
          </div>
        )}

        <section className={styles.metrics}>
          <article><Users size={20} /><strong>{workspace.passengers.length}명</strong><span>전체 승객</span></article>
          <article><Bus size={20} /><strong>{workspace.buses.length}대</strong><span>운행 버스</span></article>
          <article><CheckCircle2 size={20} /><strong>{getFirstChoiceCoverage(workspace).toFixed(1)}%</strong><span>1지망 반영률</span></article>
          <article><strong>{totals.totalCost.toLocaleString()}원</strong><span>총비용</span></article>
          <article className={validation.errors.length ? styles.metricError : undefined}>
            <AlertTriangle size={20} /><strong>{validation.errors.length}건</strong><span>확정 차단 오류</span>
            {validation.errors.length > 0 && (
              <div className={styles.metricErrorDetails}>
                {validation.errors.slice(0, 1).map((item) => (
                  <button type="button" key={item} onClick={() => goToIssue(item)}>
                    {item}
                  </button>
                ))}
                {validation.errors.length > 1 && (
                  <button type="button" onClick={() => document.getElementById('validation-review')?.scrollIntoView({ behavior: 'smooth' })}>
                    외 {validation.errors.length - 1}건 모두 보기
                  </button>
                )}
              </div>
            )}
          </article>
        </section>

        <nav className={styles.editorTabs} aria-label="배차안 편집 범위">
          <button
            type="button"
            className={activeEditorTab === 'buses' ? styles.activeEditorTab : undefined}
            onClick={() => setActiveEditorTab('buses')}
          >
            <Bus size={17} /> 버스별 편집
          </button>
          <button
            type="button"
            className={activeEditorTab === 'passengers' ? styles.activeEditorTab : undefined}
            onClick={() => setActiveEditorTab('passengers')}
          >
            <Users size={17} /> 전체 승객
            {issueTargets.passengerIds.size > 0 && <em>{issueTargets.passengerIds.size}</em>}
          </button>
        </nav>

        {activeEditorTab === 'buses' && <section className={`${styles.workspace} ${readOnly ? styles.readOnly : ''}`}>
          <aside className={styles.busPanel}>
            <h2>버스와 미배차 승객</h2>
            <div className={styles.addBusControl}>
              <button
                type="button"
                className={styles.addBusButton}
                disabled={readOnly || workspace.buses.length === 0}
                onClick={addBus}
              >
                <Plus size={15} /> 동일 규격 버스 추가
              </button>
            </div>
            <div className={styles.busList}>
              {workspace.buses.map((bus) => {
                const count = passengerCountByBus.get(bus.id) ?? 0;
                const passengerIssueCount = workspace.passengers.filter(
                  (passenger) =>
                    passenger.busId === bus.id &&
                    issueTargets.passengerIds.has(passenger.reservationId)
                ).length;
                const issueCount =
                  (issueTargets.busFields.get(bus.id)?.size ?? 0) +
                  passengerIssueCount;
                const hasIssue = issueCount > 0;
                const occupancyPercent = Math.min(
                  100,
                  Math.round((count / bus.capacity) * 100)
                );
                const remainingSeats = bus.capacity - count;
                return (
                  <button
                    type="button"
                    key={bus.id}
                    className={[
                      bus.id === selectedBusId ? styles.selectedBus : '',
                      hasIssue ? styles.busWithError : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => {
                      setSelectedBusId(bus.id);
                      setSelectedPassengerSearch('');
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropPassenger(event, bus.id)}
                  >
                    <span className={styles.busCardHeader}>
                      <strong>{bus.label}</strong>
                      <small>{bus.destination || '행선지 미설정'}</small>
                    </span>
                    <span className={styles.busOccupancy}>
                      <strong>{count}</strong>
                      <small>/ {bus.capacity}명 · {occupancyPercent}%</small>
                    </span>
                    <span className={styles.busOccupancyTrack}>
                      <span style={{ width: `${occupancyPercent}%` }} />
                    </span>
                    <span className={styles.busCardBadges}>
                      <small className={remainingSeats < 0 ? styles.busBadgeOver : undefined}>
                        {remainingSeats >= 0 ? `잔여 ${remainingSeats}석` : `${Math.abs(remainingSeats)}명 초과`}
                      </small>
                      {issueCount > 0 && <em>오류 {issueCount}건</em>}
                    </span>
                  </button>
                );
              })}
              <div
                className={`${styles.unassigned} ${
                  issueTargets.hasUnassignedIssue ? styles.unassignedWithError : ''
                }`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropPassenger(event, null)}
              >
                <strong>미배차 {unassignedPassengers.length}명</strong>
                {unassignedPassengers.map((passenger) => (
                  <div key={passenger.reservationId}>{passenger.name}</div>
                ))}
              </div>
            </div>
          </aside>

          <section
            id="bus-editor"
            className={`${styles.editor} ${
              selectedBus && issueTargets.busIds.has(selectedBus.id)
                ? styles.editorWithError
                : ''
            }`}
          >
            {!selectedBus ? (
              <div className={styles.empty}>편집할 버스를 선택하거나 추가하세요.</div>
            ) : (
              <>
                <div className={styles.busForm}>
                  <label className={issueTargets.busFields.get(selectedBus.id)?.has('label') ? styles.fieldWithError : undefined}>버스 이름<input value={selectedBus.label} onChange={(event) => updateBus(selectedBus.id, 'label', event.target.value)} /></label>
                  <label className={issueTargets.busFields.get(selectedBus.id)?.has('destination') ? styles.fieldWithError : undefined}>행선지<select value={selectedBus.destination} onChange={(event) => updateBus(selectedBus.id, 'destination', event.target.value)}><option value="">선택</option>{destinationOptions.map((destination) => <option key={destination} value={destination}>{destination}</option>)}</select></label>
                  <label className={issueTargets.busFields.get(selectedBus.id)?.has('departureTime') ? styles.fieldWithError : undefined}>출발 시간<input value={selectedBus.departureTime} onChange={(event) => updateBus(selectedBus.id, 'departureTime', event.target.value)} /></label>
                  <label className={issueTargets.busFields.get(selectedBus.id)?.has('boardingPlace') ? styles.fieldWithError : undefined}>탑승 장소<input value={selectedBus.boardingPlace} onChange={(event) => updateBus(selectedBus.id, 'boardingPlace', event.target.value)} /></label>
                  <button type="button" className={styles.deleteButton} onClick={() => deleteBus(selectedBus.id)}><Trash2 size={15} /> 버스 삭제</button>
                </div>

                <div className={styles.passengerHeader}>
                  <div>
                    <span className={styles.selectedBusEyebrow}>선택 호차 탑승 명단</span>
                    <h2>{selectedBus.label} 승객 {selectedPassengers.length}명</h2>
                  </div>
                  <span>좌석 1번부터 {selectedBus.capacity}번까지</span>
                </div>
                <div className={styles.selectedBusSummary}>
                  <div className={issueTargets.busFields.get(selectedBus.id)?.has('capacity') ? styles.summaryWithError : undefined}>
                    <span>탑승 인원</span>
                    <strong>{selectedPassengers.length}명</strong>
                  </div>
                  <div className={issueTargets.busFields.get(selectedBus.id)?.has('capacity') ? styles.summaryWithError : undefined}>
                    <span>잔여 좌석</span>
                    <strong>{selectedBus.capacity - selectedPassengers.length}석</strong>
                  </div>
                  <div>
                    <span>1지망 배차</span>
                    <strong>
                      {selectedPassengers.filter(
                        (passenger) =>
                          passenger.preferences[0] === selectedBus.destination
                      ).length}
                      명
                    </strong>
                  </div>
                  <div>
                    <span>2지망 배차</span>
                    <strong>
                      {selectedPassengers.filter(
                        (passenger) =>
                          passenger.preferences[1] === selectedBus.destination
                      ).length}
                      명
                    </strong>
                  </div>
                </div>
                <label className={styles.selectedPassengerSearch}>
                  <Search size={17} />
                  <input
                    value={selectedPassengerSearch}
                    onChange={(event) =>
                      setSelectedPassengerSearch(event.target.value)
                    }
                    placeholder="선택 호차에서 이름, 캠퍼스, 팀, 좌석 검색"
                  />
                </label>
                <div className={styles.selectedPassengerResult}>
                  {selectedPassengerSearch.trim() && (
                    <span>
                      검색 결과 {visibleSelectedPassengers.length}명 / 전체{' '}
                      {selectedPassengers.length}명
                    </span>
                  )}
                </div>
                {visibleSelectedPassengers.length > 0 ? (
                  <VirtualPassengerTable
                    passengers={visibleSelectedPassengers}
                    buses={workspace.buses}
                    passengerIssueFields={issueTargets.passengerFields}
                    onAssign={assignPassenger}
                    onSeat={updatePassengerSeat}
                  />
                ) : (
                  <div className={styles.selectedPassengerEmpty}>
                    {selectedPassengers.length === 0
                      ? `${selectedBus.label}에 배차된 승객이 없습니다.`
                      : '검색 조건에 맞는 승객이 없습니다.'}
                  </div>
                )}
              </>
            )}
          </section>
        </section>}

        {activeEditorTab === 'passengers' && <section className={`${styles.allPassengerSection} ${readOnly ? styles.readOnly : ''}`}>
          <div className={styles.allPassengerHeader}>
            <div>
              <h2>승객 검색 배차 편집</h2>
              <p>이름, 캠퍼스, 팀, 지망, 버스, 좌석으로 승객을 찾아 배차를 변경하세요.</p>
            </div>
          </div>
          <div className={styles.passengerQuickFilters} aria-label="승객 빠른 필터">
            {PASSENGER_QUICK_FILTERS.map((filter) => (
              <button
                type="button"
                key={filter.id}
                className={
                  passengerQuickFilter === filter.id
                    ? styles.passengerQuickFilterActive
                    : undefined
                }
                onClick={() => setPassengerQuickFilter(filter.id)}
              >
                {filter.label}
                <span>{passengerQuickFilterCounts[filter.id].toLocaleString()}</span>
              </button>
            ))}
          </div>
          <label className={styles.allPassengerSearch}>
            <Search size={18} />
            <input
              value={allPassengerSearch}
              onChange={(event) => setAllPassengerSearch(event.target.value)}
              placeholder="승객 이름, 캠퍼스, 팀, 지망, 버스, 좌석 검색"
            />
            {allPassengerSearch && (
              <button type="button" onClick={() => setAllPassengerSearch('')}>
                지우기
              </button>
            )}
          </label>

          {visibleAllPassengers.length === 0 ? (
            <div className={styles.passengerSearchEmpty}>
              <strong>검색 조건에 맞는 승객이 없습니다.</strong>
            </div>
          ) : (
            <>
              <div className={styles.allPassengerResult}>
                검색 결과 {allPassengerSearchMatches.length.toLocaleString()}명
                {isAllPassengerSearchPending && ' · 검색 중...'}
              </div>
              <VirtualPassengerTable
                passengers={visibleAllPassengers}
                buses={workspace.buses}
                passengerIssueFields={issueTargets.passengerFields}
                revealPassengerId={passengerToReveal}
                onRevealComplete={() => setPassengerToReveal(null)}
                onAssign={assignPassenger}
                onSeat={updatePassengerSeat}
              />
            </>
          )}
        </section>}

        <section id="validation-review" className={`${styles.reviewGrid} ${readOnly ? styles.readOnly : ''}`}>
          <article className={styles.validationPanel}>
            <div className={styles.validationHeader}>
              <div className={styles.validationTitle}>
                <span className={styles.validationTitleIcon}>
                  <ShieldCheck size={22} />
                </span>
                <div>
                  <h2>최종 검증</h2>
                  <p>배차 확정 전에 오류와 최소 탑승 인원 경고를 확인하세요.</p>
                </div>
              </div>
              <div className={styles.validationCounts}>
                <span className={validation.errors.length > 0 ? styles.validationCountError : styles.validationCountComplete}>
                  오류 {validation.errors.length}건
                </span>
                <span className={validation.warnings.length > 0 ? styles.validationCountWarning : styles.validationCountComplete}>
                  경고 {validation.warnings.length}건
                </span>
              </div>
            </div>
            <div className={styles.validationBody}>
              <div className={styles.validationApprovalColumn}>
                <div className={styles.validationApprovalSummary}>
                  <strong>확정 준비 상태</strong>
                  <span>
                    {validation.errors.length > 0
                      ? `차단 오류 ${validation.errors.length}건을 먼저 해결하세요.`
                      : !minimumWarningsApproved || !preferenceWarningsApproved
                        ? '경고 내용을 검토하고 필요한 관리자 승인을 완료하세요.'
                        : '최종 확정을 진행할 수 있습니다.'}
                  </span>
                </div>
                {belowMinimumBusIds.length > 0 ? (
                  <label className={`${styles.override} ${workspace.allowMinimumPassengerOverride ? styles.overrideApproved : ''}`}>
                    <input
                      type="checkbox"
                      checked={workspace.allowMinimumPassengerOverride}
                      onChange={(event) => updateWorkspace((current) => ({ ...current, allowMinimumPassengerOverride: event.target.checked }))}
                    />
                    <span className={styles.overrideCheck}>
                      {workspace.allowMinimumPassengerOverride && <CheckCircle2 size={16} />}
                    </span>
                    <span className={styles.overrideContent}>
                      <strong>최소 탑승 인원 미달 예외 승인</strong>
                      <small>경고 내용을 검토한 뒤 관리자 권한으로 확정을 허용합니다.</small>
                    </span>
                    <em>{workspace.allowMinimumPassengerOverride ? '승인 완료' : '승인 필요'}</em>
                  </label>
                ) : (
                  <p className={styles.ok}>확인할 최소 탑승 인원 경고가 없습니다.</p>
                )}
                {outOfPreferencePassengerIds.length > 0 ? (
                  <label className={`${styles.override} ${workspace.allowOutOfPreferenceOverride ? styles.overrideApproved : ''}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(workspace.allowOutOfPreferenceOverride)}
                      onChange={(event) => updateWorkspace((current) => ({ ...current, allowOutOfPreferenceOverride: event.target.checked }))}
                    />
                    <span className={styles.overrideCheck}>
                      {workspace.allowOutOfPreferenceOverride && <CheckCircle2 size={16} />}
                    </span>
                    <span className={styles.overrideContent}>
                      <strong>1·2지망 외 배정 별도 승인</strong>
                      <small>{outOfPreferencePassengerIds.length}명의 지망 외 이동과 강한 경고를 확인했습니다.</small>
                    </span>
                    <em>{workspace.allowOutOfPreferenceOverride ? '승인 완료' : '승인 필요'}</em>
                  </label>
                ) : (
                  <p className={styles.ok}>1·2지망 외 배정 승객이 없습니다.</p>
                )}
              </div>
              <div className={styles.validationResultColumn}>
                <div className={styles.validationResultHeader}>
                  <strong>검증 결과</strong>
                  <span>오류를 누르면 수정할 위치로 이동합니다.</span>
                </div>
                <div className={styles.validationScroll}>
                  {validation.errors.length === 0 ? (
                    <p className={styles.ok}>차단 오류가 없습니다.</p>
                  ) : (
                    validationErrorGroups.map((group) => (
                      <section className={styles.validationGroup} key={group.id}>
                        <div className={styles.validationGroupHeader}>
                          <span>
                            <strong>{group.title}</strong>
                            <small>{group.description}</small>
                          </span>
                          <em>{group.items.length}건</em>
                        </div>
                        {group.items.map((item) => (
                          <button type="button" className={styles.validationError} key={item} onClick={() => goToIssue(item)}>
                            <AlertTriangle size={16} />
                            <span>{item}</span>
                          </button>
                        ))}
                      </section>
                    ))
                  )}
                  {validation.warnings.length > 0 && (
                    <section className={styles.validationGroup}>
                      <div className={styles.validationGroupHeader}>
                        <span>
                          <strong>
                            {validationErrorGroups.some((group) => group.id === 'other') ? '6' : '5'}. 경고·예외 승인
                          </strong>
                          <small>확정 전에 경고를 검토하고 필요하면 예외 승인하세요.</small>
                        </span>
                        <em>{validation.warnings.length}건</em>
                      </div>
                      {validation.warnings.map((item) => <p className={styles.warning} key={item}>{item}</p>)}
                    </section>
                  )}
                </div>
              </div>
            </div>
          </article>

        </section>

        <details className={`${styles.supportTools} ${readOnly ? styles.readOnly : ''}`}>
          <summary>
            <span>
              <History size={18} />
              <strong>보조 도구</strong>
              <small>다른 임시 배차안 비교 · 변경 이력 · 버전 복원</small>
            </span>
            <em>비교 {otherWorkspaces.length}개 · 기록 {workspaceTimeline.length}개</em>
          </summary>
          <div className={styles.supportToolsGrid}>
            <article>
              <h2>다른 임시 배차안 비교</h2>
              {otherWorkspaces.length === 0 ? <p>비교할 다른 임시 배차안이 없습니다.</p> : otherWorkspaces.map((item) => (
                <button type="button" className={styles.versionButton} key={item.id} onClick={() => navigate(`/admin/allocation/workspace?id=${item.id}`)}>
                  {item.allocation_name} · {item.total_cost.toLocaleString()}원
                </button>
              ))}
            </article>

            <article className={styles.timelinePanel}>
              <h2><History size={18} /> 변경 이력 및 복원</h2>
              <p className={styles.timelineDescription}>
                복원 가능한 저장 기록에는 복원 버튼이 표시됩니다. 복원 후 저장해야 실제 배차안에 반영됩니다.
              </p>
              {workspaceTimeline.map((item) => (
                <div className={styles.timelineItem} key={item.id}>
                  <div className={styles.timelineItemHeader}>
                    <strong>{item.detail}</strong>
                    {item.version && <span className={styles.timelineBadge}>복원 가능</span>}
                  </div>
                  <span>{new Date(item.at).toLocaleString()} · {item.actorId.slice(0, 8)}</span>
                  {item.changes && item.changes.length > 0 && (
                    <ul className={styles.timelineChanges}>
                      {item.changes.map((change, index) => (
                        <li key={`${item.id}-change-${index}`}>{change}</li>
                      ))}
                    </ul>
                  )}
                  {item.version && (
                    <button
                      type="button"
                      className={styles.timelineRestoreButton}
                      onClick={() => void restoreVersion(item.version!.id)}
                    >
                      <RotateCcw size={14} /> 이 시점으로 복원
                    </button>
                  )}
                </div>
              ))}
            </article>
          </div>
        </details>

        <section
          id="allocation-confirmation"
          className={`${styles.finalSection} ${readOnly ? styles.readOnly : ''}`}
        >
          <h2>{workspace.status === 'confirmed' ? '확정 배차 관리' : '최종 배차 확정'}</h2>
          {workspace.status === 'draft' ? (
            <>
              <p>아래 조건을 모두 충족한 뒤 <strong>전체 배차를 확정합니다</strong>를 입력하세요.</p>
              <div className={styles.confirmReadiness}>
                <div className={validation.errors.length === 0 ? styles.readinessComplete : styles.readinessBlocked}>
                  {validation.errors.length === 0 ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  <span>
                    <strong>차단 오류 해결</strong>
                    <small>{validation.errors.length === 0 ? '모든 차단 오류를 해결했습니다.' : `${validation.errors.length}건의 오류를 해결해야 합니다.`}</small>
                  </span>
                </div>
                <div className={minimumWarningsApproved && preferenceWarningsApproved ? styles.readinessComplete : styles.readinessBlocked}>
                  {minimumWarningsApproved && preferenceWarningsApproved ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  <span>
                    <strong>경고 확인</strong>
                    <small>{validation.warnings.length === 0 ? '확인할 경고가 없습니다.' : minimumWarningsApproved && preferenceWarningsApproved ? '필요한 관리자 승인을 완료했습니다.' : `${validation.warnings.length}건의 경고와 별도 승인 항목을 확인해야 합니다.`}</small>
                  </span>
                </div>
                <div className={!dirty ? styles.readinessComplete : styles.readinessBlocked}>
                  {!dirty ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  <span>
                    <strong>변경사항 저장</strong>
                    <small>{!dirty ? '최신 변경사항이 저장되었습니다.' : '변경사항 저장 버튼을 눌러야 합니다.'}</small>
                  </span>
                </div>
                <div className={confirmText === '전체 배차를 확정합니다' ? styles.readinessComplete : styles.readinessPending}>
                  {confirmText === '전체 배차를 확정합니다' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  <span>
                    <strong>확정 문구 입력</strong>
                    <small>확정 작업을 실행하려면 아래 문구를 정확히 입력하세요.</small>
                  </span>
                </div>
              </div>
              <div className={styles.preflightPanel}>
                <div className={styles.preflightHeader}>
                  <div>
                    <strong>서버 확정 전 검증</strong>
                    <span>
                      최신 활성 신청자와 저장된 배차 상태를 DB에서 다시 대조합니다.
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.preflightButton}
                    disabled={dirty || saving || preflightChecking}
                    onClick={runConfirmationPreflight}
                  >
                    {preflightChecking ? (
                      <><LoaderCircle className={styles.spin} size={16} /> 검증 중...</>
                    ) : (
                      <><ShieldCheck size={16} /> 서버 사전 검증</>
                    )}
                  </button>
                </div>
                {confirmationPreflight ? (
                  <>
                    <div
                      className={
                        confirmationPreflight.valid
                          ? styles.preflightPassed
                          : styles.preflightFailed
                      }
                    >
                      {confirmationPreflight.valid
                        ? '서버 사전 검증을 통과했습니다.'
                        : '서버 사전 검증 실패 항목이 있습니다.'}
                      {' · '}
                      배차안 {confirmationPreflight.passenger_count.toLocaleString()}명
                      {' / '}
                      활성 신청 {confirmationPreflight.active_reservation_count.toLocaleString()}명
                    </div>
                    <div className={styles.preflightChecks}>
                      {confirmationPreflight.checks.map((check) => (
                        <span
                          key={check.key}
                          className={
                            check.valid
                              ? styles.preflightCheckPassed
                              : styles.preflightCheckFailed
                          }
                        >
                          {check.valid ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                          {CONFIRMATION_PREFLIGHT_LABELS[check.key]}
                        </span>
                      ))}
                    </div>
                    {confirmationPreflight.details?.length > 0 && (
                      <div className={styles.preflightDetails}>
                        <strong>실패 상세</strong>
                        {confirmationPreflight.details.map((detail, index) => {
                          const canNavigate =
                            Boolean(detail.passenger_id) ||
                            Boolean(detail.bus_id) ||
                            Boolean(detail.requires_refresh);
                          return canNavigate ? (
                            <button
                              type="button"
                              key={`${detail.key}-${detail.passenger_id ?? detail.bus_id}-${index}`}
                              onClick={() => void goToPreflightDetail(detail)}
                            >
                              <AlertTriangle size={14} />
                              <span>{detail.message}</span>
                              <em>
                                {detail.requires_refresh
                                  ? '배차안 갱신 후 이동'
                                  : '해당 항목으로 이동'}
                              </em>
                            </button>
                          ) : (
                            <div
                              key={`${detail.key}-${detail.reservation_id ?? index}`}
                            >
                              <AlertTriangle size={14} />
                              <span>{detail.message}</span>
                              {detail.requires_refresh && <em>배차안 갱신 필요</em>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.preflightPending}>
                    선택적으로 미리 검증할 수 있으며, 전체 배차 확정 시 서버 검증이
                    자동 실행됩니다.
                  </div>
                )}
              </div>
              <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="전체 배차를 확정합니다" />
              <button
                type="button"
                className={styles.confirmButton}
                disabled={confirmDisabledReason !== null}
                title={confirmDisabledReason ?? undefined}
                onClick={confirmAll}
              >
                {confirmationAction === 'confirm' ? (
                  <><LoaderCircle className={styles.spin} size={18} /> 배차 확정 중...</>
                ) : (
                  <><BadgeCheck size={18} /> 전체 배차 확정</>
                )}
              </button>
              {confirmDisabledReason && (
                <div className={styles.confirmDisabledReasons}>
                  <strong>
                    <AlertTriangle size={16} />
                    전체 배차 확정이 비활성화된 이유
                  </strong>
                  <ul>
                    {confirmDisabledReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              {confirmationFailure && (
                <div className={styles.confirmationFailure}>
                  <strong>
                    <AlertTriangle size={17} />
                    {confirmationFailure.title}
                  </strong>
                  <ul>
                    {confirmationFailure.reasons.map((reason, index) => (
                      <li key={`${reason}-${index}`}>{reason}</li>
                    ))}
                  </ul>
                  <small>
                    위 내용을 수정한 뒤 변경사항을 저장하고 다시 확정해주세요.
                  </small>
                </div>
              )}
            </>
          ) : (
            <div className={styles.confirmedState}>
              <div className={styles.confirmedHero}>
                <div className={styles.confirmedHeroIcon}>
                  <ShieldCheck size={30} />
                </div>
                <div>
                  <span className={styles.confirmedEyebrow}>CONFIRMED</span>
                  <h3>배차 확정이 완료되었습니다</h3>
                  <p>
                    승객에게 확정 버스표가 공개된 상태입니다. 이후 변경사항을
                    저장하면 버스표에도 함께 반영됩니다.
                  </p>
                </div>
              </div>
              <div className={styles.confirmedSummary}>
                <div>
                  <span>확정 시각</span>
                  <strong>
                    {workspace.confirmedAt
                      ? new Date(workspace.confirmedAt).toLocaleString('ko-KR')
                      : '-'}
                  </strong>
                </div>
                <div>
                  <span>확정 승객</span>
                  <strong>{workspace.passengers.length.toLocaleString()}명</strong>
                </div>
                <div>
                  <span>운행 버스</span>
                  <strong>{workspace.buses.length.toLocaleString()}대</strong>
                </div>
                <div>
                  <span>총 비용</span>
                  <strong>{totals.totalCost.toLocaleString()}원</strong>
                </div>
              </div>
              <div className={styles.cancelConfirmationZone}>
                <div>
                  <strong>확정 상태를 되돌려야 하나요?</strong>
                  <span>
                    취소하면 승객 버스표가 즉시 숨겨지고 임시 배차안으로 돌아갑니다.
                  </span>
                </div>
                <div className={styles.cancelConfirmationControls}>
                  <input
                    value={cancelText}
                    onChange={(event) => setCancelText(event.target.value)}
                    placeholder="배차 확정을 취소합니다"
                  />
                  <button
                    type="button"
                    className={styles.cancelConfirmationButton}
                    disabled={cancelText !== '배차 확정을 취소합니다' || saving}
                    onClick={cancelConfirmation}
                  >
                    {confirmationAction === 'cancel' ? (
                      <><LoaderCircle className={styles.spin} size={17} /> 취소 처리 중...</>
                    ) : (
                      <><RotateCcw size={17} /> 배차 확정 취소</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {workspace.status === 'draft' && (
          <details className={`${styles.dangerTools} ${readOnly ? styles.readOnly : ''}`}>
            <summary>
              <span>
                <Trash2 size={17} />
                <strong>위험 작업</strong>
                <small>임시 배차안 삭제</small>
              </span>
            </summary>
            <div className={styles.dangerZone}>
              <div>
                <strong>임시 배차안 삭제</strong>
                <span>저장하지 않은 변경사항, 배차안 기록, 복원 가능한 버전이 모두 삭제됩니다.</span>
              </div>
              <button
                type="button"
                className={styles.deleteWorkspaceButton}
                disabled={saving || readOnly}
                onClick={deleteWorkspace}
              >
                <Trash2 size={17} /> 임시 배차안 삭제
              </button>
            </div>
          </details>
        )}
      </main>
    </div>
  );
};

const PassengerRow = memo(function PassengerRow({
  passenger,
  buses,
  issueFields,
  onAssign,
  onSeat,
}: {
  passenger: AllocationWorkspacePassenger;
  buses: AllocationWorkspaceBus[];
  issueFields?: Set<PassengerIssueField>;
  onAssign: (passengerId: string, busId: string | null) => void;
  onSeat: (passengerId: string, seat: number | null) => void;
}) {
  return (
  <tr
    id={`passenger-${passenger.reservationId}`}
    className={issueFields?.size ? styles.passengerRowWithError : undefined}
    draggable
    onDragStart={(event) =>
      event.dataTransfer.setData(
        'text/allocation-passenger',
        passenger.reservationId
      )
    }
  >
    <td className={styles.dragHandleCell}>
      <span className={styles.dragHandle} title="끌어서 다른 버스로 이동">
        <GripVertical size={16} />
        <small>이동</small>
      </span>
    </td>
    <td><strong>{passenger.name}</strong></td>
    <td className={styles.passengerPhone}>{passenger.phone || '-'}</td>
    <td>{passenger.campus} · {passenger.team}</td>
    <td className={issueFields?.has('preferences') ? styles.cellWithError : undefined}>{passenger.preferences.join(' / ') || '지망 정보 없음'}</td>
    <td className={issueFields?.has('assignment') ? styles.cellWithError : undefined}>
      <select className={issueFields?.has('assignment') ? styles.controlWithError : undefined} value={passenger.busId ?? ''} onChange={(event) => onAssign(passenger.reservationId, event.target.value || null)}>
        <option value="">미배차</option>
        {buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.label} · {bus.destination || '행선지 미설정'}</option>)}
      </select>
    </td>
    <td className={issueFields?.has('seat') ? styles.cellWithError : undefined}><input className={issueFields?.has('seat') ? styles.controlWithError : undefined} type="number" min="1" value={passenger.seatNumber ?? ''} disabled={!passenger.busId} onChange={(event) => onSeat(passenger.reservationId, event.target.value ? Number(event.target.value) : null)} /></td>
  </tr>
  );
});

const VirtualPassengerTable = memo(function VirtualPassengerTable({
  passengers,
  buses,
  passengerIssueFields,
  revealPassengerId,
  onRevealComplete,
  onAssign,
  onSeat,
}: {
  passengers: AllocationWorkspacePassenger[];
  buses: AllocationWorkspaceBus[];
  passengerIssueFields: Map<string, Set<PassengerIssueField>>;
  revealPassengerId?: string | null;
  onRevealComplete?: () => void;
  onAssign: (passengerId: string, busId: string | null) => void;
  onSeat: (passengerId: string, seat: number | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const visibleRowCount = Math.ceil(
    PASSENGER_TABLE_VIEWPORT_HEIGHT / PASSENGER_ROW_HEIGHT
  );
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / PASSENGER_ROW_HEIGHT) - PASSENGER_TABLE_OVERSCAN
  );
  const endIndex = Math.min(
    passengers.length,
    startIndex + visibleRowCount + PASSENGER_TABLE_OVERSCAN * 2
  );
  const visiblePassengers = passengers.slice(startIndex, endIndex);
  const topSpacerHeight = startIndex * PASSENGER_ROW_HEIGHT;
  const bottomSpacerHeight =
    (passengers.length - endIndex) * PASSENGER_ROW_HEIGHT;

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const maximumScrollTop = Math.max(
      0,
      passengers.length * PASSENGER_ROW_HEIGHT -
        PASSENGER_TABLE_VIEWPORT_HEIGHT
    );
    if (viewport.scrollTop > maximumScrollTop) {
      viewport.scrollTop = maximumScrollTop;
    }
  }, [passengers.length]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport || !revealPassengerId) return;
    const passengerIndex = passengers.findIndex(
      (passenger) => passenger.reservationId === revealPassengerId
    );
    if (passengerIndex < 0) return;

    const nextScrollTop = Math.max(
      0,
      passengerIndex * PASSENGER_ROW_HEIGHT -
        (PASSENGER_TABLE_VIEWPORT_HEIGHT - PASSENGER_ROW_HEIGHT) / 2
    );
    viewport.scrollTop = nextScrollTop;
    onRevealComplete?.();
  }, [onRevealComplete, passengers, revealPassengerId]);

  return (
    <div className={styles.passengerTableArea}>
      <div className={styles.passengerDragGuide}>
        <GripVertical size={15} />
        <span>행 왼쪽의 이동 핸들을 끌어 원하는 버스 카드에 놓으세요.</span>
      </div>
      <div
        ref={scrollRef}
        className={styles.passengerTableWrap}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
      <table className={styles.passengerTable}>
        <colgroup>
          <col className={styles.passengerDragColumn} />
          <col className={styles.passengerNameColumn} />
          <col className={styles.passengerPhoneColumn} />
          <col className={styles.passengerTeamColumn} />
          <col className={styles.passengerPreferenceColumn} />
          <col className={styles.passengerBusColumn} />
          <col className={styles.passengerSeatColumn} />
        </colgroup>
        <thead>
          <tr>
            <th aria-label="드래그 이동" />
            <th>승객</th>
            <th>전화번호</th>
            <th>캠퍼스·팀</th>
            <th>1·2지망</th>
            <th>버스 이동</th>
            <th>좌석</th>
          </tr>
        </thead>
        <tbody>
          {topSpacerHeight > 0 && (
            <tr aria-hidden="true" className={styles.virtualSpacerRow}>
              <td colSpan={7} style={{ height: topSpacerHeight }} />
            </tr>
          )}
          {visiblePassengers.map((passenger) => (
            <PassengerRow
              key={passenger.reservationId}
              passenger={passenger}
              buses={buses}
              issueFields={passengerIssueFields.get(passenger.reservationId)}
              onAssign={onAssign}
              onSeat={onSeat}
            />
          ))}
          {bottomSpacerHeight > 0 && (
            <tr aria-hidden="true" className={styles.virtualSpacerRow}>
              <td colSpan={7} style={{ height: bottomSpacerHeight }} />
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
});

export default AdminAllocationWorkspacePage;
