import {
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
import { formatBusLabel } from '../../utils/busLabel';

import AdminHeader from './AdminHeader';
import {
  acquireAllocationWorkspaceLock,
  cancelConfirmedWorkspace,
  confirmAllocationWorkspace,
  deleteDraftAllocationWorkspace,
  getAllocationWorkspaceVersionSnapshot,
  getAllocationWorkspaceVersions,
  getActiveDepartureCount,
  getBelowMinimumBusIds,
  getFirstChoiceCoverage,
  getOutOfPreferencePassengerIds,
  getWorkspaceTotals,
  isRemainingSeatPassenger,
  refreshDraftWorkspacePassengers,
  saveAllocationWorkspace,
  saveConfirmedWorkspaceChanges,
  validateAllocationWorkspaceConfirmation,
  validateWorkspace,
} from '../../lib/admin/allocationWorkspaceService';
import type {
  AllocationConfirmationPreflight,
  AllocationConfirmationPreflightDetail,
  AllocationWorkspaceBus,
  AllocationWorkspaceData,
  AllocationWorkspaceRow,
  AllocationWorkspaceVersionSummary,
} from '../../lib/admin/allocationWorkspaceService';
import { describeAllocationWorkspaceChanges } from '../../lib/admin/allocationWorkspaceHistory';
import { supabase } from '../../lib/supabase';
import { VirtualPassengerTable } from './components/AllocationPassengerTable';
import {
  BUS_OCCUPANCY_FILTERS,
  CONFIRMATION_PREFLIGHT_LABELS,
  PASSENGER_QUICK_FILTERS,
  cloneAllocationWorkspaceValue as clone,
  comparePassengersByCampusAndTeam,
  getAllocationWorkspaceErrorMessage as getErrorMessage,
  getNextSeatNumber as nextSeatNumber,
  getSharedBusField,
  getWorkspaceIssueTargets,
  groupValidationErrors,
  type BusOccupancyFilter,
  type PassengerQuickFilter,
  type SharedBusField,
} from './allocationWorkspaceViewModel';

import styles from './AdminAllocationWorkspacePage.module.css';
import DestinationQueueWorkspaceEditor from './DestinationQueueWorkspaceEditor';

type EditorTab = 'buses' | 'passengers';
type ConfirmationAction = 'confirm' | 'cancel';
type CompletionNotice = 'confirmed' | 'cancelled';
const SLOW_CONFIRMATION_PROMPT_MS = 30_000;

interface ConfirmationFailure {
  title: string;
  reasons: string[];
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

const AdminAllocationWorkspacePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get('id') ?? '';
  const [row, setRow] = useState<AllocationWorkspaceRow | null>(null);
  const [workspace, setWorkspace] = useState<AllocationWorkspaceData | null>(
    null
  );
  const [selectedBusId, setSelectedBusId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPassengerSearch, setSelectedPassengerSearch] = useState('');
  const [allPassengerSearch, setAllPassengerSearch] = useState('');
  const [passengerToReveal, setPassengerToReveal] = useState<string | null>(
    null
  );
  const [passengerQuickFilter, setPassengerQuickFilter] =
    useState<PassengerQuickFilter>('all');
  const [busOccupancyFilter, setBusOccupancyFilter] =
    useState<BusOccupancyFilter>('all');
  const [activeEditorTab, setActiveEditorTab] = useState<EditorTab>('buses');
  const [confirmationAction, setConfirmationAction] =
    useState<ConfirmationAction | null>(null);
  const [confirmationPreflight, setConfirmationPreflight] =
    useState<AllocationConfirmationPreflight | null>(null);
  const [confirmationFailure, setConfirmationFailure] =
    useState<ConfirmationFailure | null>(null);
  const [preflightChecking, setPreflightChecking] = useState(false);
  const confirmationInFlightRef = useRef(false);
  const confirmationAbortControllerRef = useRef<AbortController | null>(null);
  const confirmationStopRequestedRef = useRef(false);
  const slowConfirmationTimerRef = useRef<number | null>(null);
  const cancellationInFlightRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const workspaceDeletionInFlightRef = useRef(false);
  const versionRestoreInFlightRef = useRef(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [slowConfirmationDialogOpen, setSlowConfirmationDialogOpen] =
    useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [deleteWorkspaceDialogOpen, setDeleteWorkspaceDialogOpen] =
    useState(false);
  const [leaveWorkspaceDialogOpen, setLeaveWorkspaceDialogOpen] =
    useState(false);
  const [pendingBusDeletion, setPendingBusDeletion] =
    useState<AllocationWorkspaceBus | null>(null);
  const [pendingVersionRestore, setPendingVersionRestore] =
    useState<AllocationWorkspaceVersionSummary | null>(null);
  const [completionNotice, setCompletionNotice] =
    useState<CompletionNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [activeDepartureCount, setActiveDepartureCount] = useState(0);
  const [workspaceVersions, setWorkspaceVersions] = useState<
    AllocationWorkspaceVersionSummary[]
  >([]);

  useEffect(() => {
    let cancelled = false;

    if (!workspaceId) {
      navigate('/admin/allocations');
      return () => {
        cancelled = true;
      };
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
        if (
          !lockResult.readOnly &&
          lockResult.row.allocation_data.allocationStrategy !==
            'destination_queue'
        ) {
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

        const [versionsResult, departureCountResult] = await Promise.allSettled([
          getAllocationWorkspaceVersions(workspaceId),
          getActiveDepartureCount(workspaceId),
        ]);
        if (versionsResult.status === 'rejected') {
          loadWarnings.push(
            `버전 목록 조회 실패: ${getErrorMessage(
              versionsResult.reason,
              '저장 버전 목록을 조회하지 못했습니다.'
            )}`
          );
        }
        if (departureCountResult.status === 'rejected') {
          loadWarnings.push('출발 완료 호차 상태를 확인하지 못했습니다.');
        }

        const nextRow = refreshed.changed
          ? { ...lockResult.row, allocation_data: refreshed.workspace }
          : lockResult.row;

        if (cancelled) return;
        setRow(nextRow);
        setWorkspace(refreshed.workspace);
        setDirty(refreshed.changed);
        setReadOnly(
          lockResult.readOnly || refreshed.workspace.status === 'confirmed'
        );
        setActiveDepartureCount(
          departureCountResult.status === 'fulfilled'
            ? departureCountResult.value
            : 0
        );
        setSelectedBusId(refreshed.workspace.buses[0]?.id ?? '');
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
            ? `배차 초안은 불러왔지만 일부 정보 조회에 실패했습니다.\n${loadWarnings.join('\n')}`
            : null
        );
      } catch (loadError) {
        if (cancelled) return;
        console.error(loadError);
        setError(
          `배차 초안을 불러오지 못했습니다.\n${getErrorMessage(
            loadError,
            '알 수 없는 조회 오류가 발생했습니다.'
          )}`
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, workspaceId]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const navigateToAllocations = useCallback(() => {
    if (dirty) {
      setLeaveWorkspaceDialogOpen(true);
      return;
    }
    navigate('/admin/allocations');
  }, [dirty, navigate]);

  const confirmNavigateToAllocations = useCallback(() => {
    setLeaveWorkspaceDialogOpen(false);
    navigate('/admin/allocations');
  }, [navigate]);

  useEffect(() => {
    if (!leaveWorkspaceDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        setLeaveWorkspaceDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [leaveWorkspaceDialogOpen, saving]);

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
  const remainingSeatPassengerCountByBus = useMemo(() => {
    const counts = new Map<string, number>();
    workspace?.passengers.forEach((passenger) => {
      if (passenger.busId && isRemainingSeatPassenger(passenger)) {
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
  const deferredBusById = useMemo(
    () =>
      new Map(
        deferredWorkspace?.buses.map((bus) => [bus.id, bus]) ?? []
      ),
    [deferredWorkspace?.buses]
  );
  const allPassengerSearchIndex = useMemo(() => {
    if (!deferredWorkspace) return [];

    return deferredWorkspace.passengers.map((passenger) => {
      const bus = passenger.busId
        ? deferredBusById.get(passenger.busId)
        : undefined;
      return {
        passenger,
        searchText: [
          passenger.name,
          passenger.phone,
          passenger.campus,
          passenger.team,
          passenger.preferences.join(' '),
          isRemainingSeatPassenger(passenger) ? '잔여 좌석' : '일반 신청',
          passenger.remainingSeatStatus === 'pending_payment'
            ? '미입금'
            : passenger.remainingSeatStatus === 'confirmed'
              ? '입금 완료'
              : '',
          bus?.label ?? '미배차',
          bus?.destination ?? '',
          String(passenger.seatNumber ?? ''),
        ]
          .join(' ')
          .toLocaleLowerCase('ko'),
      };
    });
  }, [deferredBusById, deferredWorkspace]);
  const passengerQuickFilterCounts = useMemo(() => {
    if (!deferredWorkspace) {
      return {
        all: 0,
        unassigned: 0,
        errors: 0,
        'remaining-seat': 0,
        'remaining-seat-pending': 0,
        'first-choice-missed': 0,
        'seat-missing': 0,
      };
    }
    return {
      all: deferredWorkspace.passengers.length,
      unassigned: deferredWorkspace.passengers.filter(
        (passenger) => !passenger.busId
      ).length,
      errors: deferredWorkspace.passengers.filter((passenger) =>
        issueTargets.passengerIds.has(passenger.reservationId)
      ).length,
      'remaining-seat': deferredWorkspace.passengers.filter(
        isRemainingSeatPassenger
      ).length,
      'remaining-seat-pending': deferredWorkspace.passengers.filter(
        (passenger) => passenger.remainingSeatStatus === 'pending_payment'
      ).length,
      'first-choice-missed': deferredWorkspace.passengers.filter((passenger) => {
        if (isRemainingSeatPassenger(passenger)) return false;
        const bus = passenger.busId
          ? deferredBusById.get(passenger.busId)
          : undefined;
        return Boolean(bus && bus.destination !== passenger.preferences[0]);
      }).length,
      'seat-missing': deferredWorkspace.passengers.filter(
        (passenger) => passenger.busId && passenger.seatNumber === null
      ).length,
    };
  }, [deferredBusById, deferredWorkspace, issueTargets.passengerIds]);
  const normalizedAllPassengerSearch = allPassengerSearch
    .trim()
    .toLocaleLowerCase('ko');
  const normalizedDeferredAllPassengerSearch = deferredAllPassengerSearch
    .trim()
    .toLocaleLowerCase('ko');
  const allPassengerSearchMatches = useMemo(
    () =>
      allPassengerSearchIndex
        .filter(({ passenger, searchText }) => {
          const bus = passenger.busId
            ? deferredBusById.get(passenger.busId)
            : undefined;
          if (passengerQuickFilter === 'unassigned' && passenger.busId) return false;
          if (
            passengerQuickFilter === 'errors' &&
            !issueTargets.passengerIds.has(passenger.reservationId)
          ) return false;
          if (
            passengerQuickFilter === 'remaining-seat' &&
            !isRemainingSeatPassenger(passenger)
          ) return false;
          if (
            passengerQuickFilter === 'remaining-seat-pending' &&
            passenger.remainingSeatStatus !== 'pending_payment'
          ) return false;
          if (
            passengerQuickFilter === 'first-choice-missed' &&
            (isRemainingSeatPassenger(passenger) ||
              !bus ||
              bus.destination === passenger.preferences[0])
          ) return false;
          if (
            passengerQuickFilter === 'seat-missing' &&
            (!passenger.busId || passenger.seatNumber !== null)
          ) return false;
          if (!normalizedDeferredAllPassengerSearch) return true;
          return searchText.includes(normalizedDeferredAllPassengerSearch);
        })
        .sort((left, right) =>
          comparePassengersByCampusAndTeam(left.passenger, right.passenger)
        ),
    [
      allPassengerSearchIndex,
      issueTargets.passengerIds,
      normalizedDeferredAllPassengerSearch,
      passengerQuickFilter,
      deferredBusById,
    ]
  );

  const updateWorkspace = useCallback((
    updater: (current: AllocationWorkspaceData) => AllocationWorkspaceData
  ) => {
    if (readOnly) return;
    setWorkspace((current) => (current ? updater(current) : current));
    setDirty(true);
    setConfirmationPreflight(null);
    setConfirmationFailure(null);
  }, [readOnly]);

  const updateBus = (
    busId: string,
    key: keyof AllocationWorkspaceBus,
    value: string | number
  ) => {
    if (readOnly) return;
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

  const updateSharedBusField = (field: SharedBusField, value: string) => {
    if (readOnly) return;
    updateWorkspace((current) => ({
      ...current,
      buses: current.buses.map((bus) => ({ ...bus, [field]: value })),
    }));
  };

  const assignPassenger = useCallback((passengerId: string, busId: string | null) => {
    if (readOnly) return;
    const passenger = workspace?.passengers.find(
      (item) => item.reservationId === passengerId
    );
    if (!passenger || passenger.busId === busId) return;

    const targetBus = busId
      ? workspace?.buses.find((bus) => bus.id === busId)
      : undefined;
    const targetPassengerCount = busId
      ? workspace?.passengers.filter((item) => item.busId === busId).length ?? 0
      : 0;
    if (targetBus && targetPassengerCount >= targetBus.capacity) {
      setError(
        `${formatBusLabel(targetBus.label)}은 만석이므로 탑승자를 더 배정할 수 없습니다.`
      );
      return;
    }

    setError(null);
    updateWorkspace((current) => {
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
  }, [readOnly, updateWorkspace, workspace]);

  const dropPassenger = (
    event: React.DragEvent<HTMLElement>,
    busId: string | null
  ) => {
    event.preventDefault();
    if (readOnly) return;
    const passengerId = event.dataTransfer.getData('text/allocation-passenger');
    if (passengerId) assignPassenger(passengerId, busId);
  };

  const updatePassengerSeat = useCallback((passengerId: string, seatNumber: number | null) => {
    if (readOnly) return;
    updateWorkspace((current) => {
      return {
        ...current,
        passengers: current.passengers.map((passenger) => {
          if (passenger.reservationId !== passengerId) return passenger;
          const bus = current.buses.find((item) => item.id === passenger.busId);
          const limitedSeatNumber =
            seatNumber === null || !bus
              ? null
              : Math.min(bus.capacity, Math.max(1, Math.trunc(seatNumber)));
          return { ...passenger, seatNumber: limitedSeatNumber };
        }),
      };
    });
  }, [readOnly, updateWorkspace]);

  const addBus = () => {
    if (readOnly) return;
    updateWorkspace((current) => {
      const template = current.buses[0];
      const busNumber = current.buses.length + 1;
      const bus = template
        ? {
            ...clone(template),
            id: `bus-${Date.now()}-${busNumber}`,
            optionId: current.manualBusTemplate ? template.optionId : undefined,
            label: `${busNumber}호차`,
            maxAvailableCount: current.manualBusTemplate
              ? template.maxAvailableCount
              : undefined,
            destination: '',
          }
        : current.manualBusTemplate
          ? {
              ...clone(current.manualBusTemplate),
              id: `bus-${Date.now()}-${busNumber}`,
              label: `${busNumber}호차`,
              destination: '',
              departureTime: '',
              boardingPlace: '',
            }
          : null;
      if (!bus) return current;
      setSelectedBusId(bus.id);
      return { ...current, buses: [...current.buses, bus] };
    });
  };

  const deleteBus = (busId: string) => {
    if (readOnly) return;
    const bus = workspace?.buses.find((item) => item.id === busId);
    if (!bus) return;

    setPendingBusDeletion(bus);
  };

  const confirmBusDeletion = () => {
    if (readOnly || !pendingBusDeletion) return;

    const busId = pendingBusDeletion.id;
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
    setPendingBusDeletion(null);
  };

  useEffect(() => {
    if (!pendingBusDeletion) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingBusDeletion(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingBusDeletion]);

  const save = async () => {
    if (!row || !workspace || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
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
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const deleteWorkspace = () => {
    if (
      !row ||
      !workspace ||
      workspace.status !== 'draft' ||
      saving ||
      workspaceDeletionInFlightRef.current
    ) {
      return;
    }

    setDeleteWorkspaceDialogOpen(true);
  };

  const confirmWorkspaceDeletion = async () => {
    if (
      !row ||
      !workspace ||
      workspace.status !== 'draft' ||
      saving ||
      workspaceDeletionInFlightRef.current
    ) {
      return;
    }

    workspaceDeletionInFlightRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await deleteDraftAllocationWorkspace(row);
      navigate('/admin/allocations');
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : '배차 초안을 삭제하지 못했습니다.'
      );
      workspaceDeletionInFlightRef.current = false;
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!deleteWorkspaceDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !saving &&
        !workspaceDeletionInFlightRef.current
      ) {
        setDeleteWorkspaceDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteWorkspaceDialogOpen, saving]);

  const restoreVersion = (versionId: string) => {
    if (!workspace || readOnly || saving || versionRestoreInFlightRef.current) {
      return;
    }

    const version = workspaceVersions.find((item) => item.id === versionId);
    if (!version) return;

    setPendingVersionRestore(version);
  };

  const confirmVersionRestore = async () => {
    if (
      !workspace ||
      !pendingVersionRestore ||
      readOnly ||
      saving ||
      versionRestoreInFlightRef.current
    ) {
      return;
    }

    const versionId = pendingVersionRestore.id;
    versionRestoreInFlightRef.current = true;
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
      setPendingVersionRestore(null);
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : '저장 버전을 복원하지 못했습니다.'
      );
    } finally {
      versionRestoreInFlightRef.current = false;
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!pendingVersionRestore) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !saving &&
        !versionRestoreInFlightRef.current
      ) {
        setPendingVersionRestore(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingVersionRestore, saving]);

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

  const confirmAll = () => {
    if (
      !row ||
      !workspace ||
      readOnly ||
      dirty ||
      !canConfirm ||
      saving
    ) return;

    setConfirmDialogOpen(true);
  };

  const confirmPendingAllocation = async () => {
    if (
      !row ||
      !workspace ||
      readOnly ||
      dirty ||
      !canConfirm ||
      saving ||
      confirmationInFlightRef.current
    ) {
      return;
    }

    confirmationInFlightRef.current = true;
    confirmationStopRequestedRef.current = false;
    const abortController = new AbortController();
    confirmationAbortControllerRef.current = abortController;
    slowConfirmationTimerRef.current = window.setTimeout(() => {
      if (confirmationInFlightRef.current) {
        setSlowConfirmationDialogOpen(true);
      }
    }, SLOW_CONFIRMATION_PROMPT_MS);
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
        workspace,
        abortController.signal
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
      const saved = await confirmAllocationWorkspace(
        row,
        workspace,
        session.user.id,
        abortController.signal
      );
      setRow(saved);
      setWorkspace(saved.allocation_data);
      void getAllocationWorkspaceVersions(saved.id)
        .then(setWorkspaceVersions)
        .catch((versionError) => console.warn('Failed to refresh versions:', versionError));
      setDirty(false);
      setConfirmationFailure(null);
      setCompletionNotice('confirmed');
      setConfirmDialogOpen(false);
    } catch (confirmError) {
      if (confirmationStopRequestedRef.current) return;
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
      if (slowConfirmationTimerRef.current !== null) {
        window.clearTimeout(slowConfirmationTimerRef.current);
        slowConfirmationTimerRef.current = null;
      }
      confirmationAbortControllerRef.current = null;
      confirmationInFlightRef.current = false;
      setSlowConfirmationDialogOpen(false);
      setSaving(false);
      setConfirmationAction(null);
    }
  };

  const stopWaitingForConfirmation = () => {
    confirmationStopRequestedRef.current = true;
    confirmationAbortControllerRef.current?.abort();
    setSlowConfirmationDialogOpen(false);
    setConfirmDialogOpen(false);
    setConfirmationFailure({
      title: '배차 확정 대기를 중단했습니다.',
      reasons: [
        '서버 처리가 이미 완료되었을 수 있습니다. 잠시 후 배차 목록을 새로고침해 확정 상태를 확인해주세요.',
      ],
    });
    setError('배차 확정 대기를 중단했습니다. 서버의 최종 상태를 다시 확인해주세요.');
  };

  useEffect(() => {
    if (!confirmDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !saving &&
        !confirmationInFlightRef.current
      ) {
        setConfirmDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDialogOpen, saving]);

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

  const cancelConfirmation = () => {
    if (!row || !workspace || saving || cancellationInFlightRef.current) return;
    if (activeDepartureCount > 0) {
      setError(
        `출발 완료 호차 ${activeDepartureCount.toLocaleString()}대의 출발 완료를 모두 취소한 뒤 배차 확정을 취소할 수 있습니다.`
      );
      return;
    }

    setCancelDialogOpen(true);
  };

  const confirmCancellation = async () => {
    if (
      !row ||
      !workspace ||
      workspace.status !== 'confirmed' ||
      saving ||
      cancellationInFlightRef.current
    ) {
      return;
    }
    if (activeDepartureCount > 0) {
      setCancelDialogOpen(false);
      setError(
        `출발 완료 호차 ${activeDepartureCount.toLocaleString()}대의 출발 완료를 모두 취소한 뒤 배차 확정을 취소할 수 있습니다.`
      );
      return;
    }

    cancellationInFlightRef.current = true;
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
      setCompletionNotice('cancelled');
      setCancelDialogOpen(false);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : '확정을 취소하지 못했습니다.'
      );
    } finally {
      cancellationInFlightRef.current = false;
      setSaving(false);
      setConfirmationAction(null);
    }
  };

  useEffect(() => {
    if (!cancelDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !saving &&
        !cancellationInFlightRef.current
      ) {
        setCancelDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelDialogOpen, saving]);

  if (!workspace || !row) {
    return (
      <div className={styles.page}>
        <AdminHeader />
        <main className={styles.main}>
          {error ? (
            <div className={styles.loadFailure}>
              <strong>배차 초안을 열지 못했습니다.</strong>
              <p>{error}</p>
              <div>
                <button type="button" onClick={() => window.location.reload()}>
                  다시 불러오기
                </button>
                <button type="button" onClick={navigateToAllocations}>
                  <ArrowLeft size={16} /> 배차 계산으로
                </button>
              </div>
            </div>
          ) : (
            '배차 초안을 불러오는 중입니다.'
          )}
        </main>
      </div>
    );
  }

  if (workspace.allocationStrategy === 'destination_queue') {
    return (
      <div className={styles.page}>
        <AdminHeader />
        <main className={styles.main}>
          <DestinationQueueWorkspaceEditor
            row={row}
            workspace={workspace}
            setRow={setRow}
            setWorkspace={setWorkspace}
            dirty={dirty}
            setDirty={setDirty}
          />
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
  const busOccupancyFilterCounts: Record<BusOccupancyFilter, number> = {
    all: workspace.buses.length,
    available: workspace.buses.filter(
      (bus) => (passengerCountByBus.get(bus.id) ?? 0) < bus.capacity
    ).length,
    full: workspace.buses.filter(
      (bus) => (passengerCountByBus.get(bus.id) ?? 0) === bus.capacity
    ).length,
    over: workspace.buses.filter(
      (bus) => (passengerCountByBus.get(bus.id) ?? 0) > bus.capacity
    ).length,
  };
  const visibleBuses = workspace.buses.filter((bus) => {
    const count = passengerCountByBus.get(bus.id) ?? 0;
    if (busOccupancyFilter === 'available') return count < bus.capacity;
    if (busOccupancyFilter === 'full') return count === bus.capacity;
    if (busOccupancyFilter === 'over') return count > bus.capacity;
    return true;
  });
  const destinationOptions = [
    ...new Set(workspace.passengers.flatMap((passenger) => passenger.preferences)),
  ];
  const sharedDepartureTime = getSharedBusField(
    workspace.buses,
    'departureTime'
  );
  const sharedBoardingPlace = getSharedBusField(
    workspace.buses,
    'boardingPlace'
  );
  const hasMissingDepartureTime = workspace.buses.some(
    (bus) => !bus.departureTime.trim()
  );
  const hasMissingBoardingPlace = workspace.buses.some(
    (bus) => !bus.boardingPlace.trim()
  );
  const belowMinimumBusIds = getBelowMinimumBusIds(workspace);
  const outOfPreferencePassengerIds = getOutOfPreferencePassengerIds(workspace);
  const remainingSeatPassengers = workspace.passengers.filter(
    isRemainingSeatPassenger
  );
  const pendingRemainingSeatCount = remainingSeatPassengers.filter(
    (passenger) => passenger.remainingSeatStatus === 'pending_payment'
  ).length;
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
      ? `1·2지망 외 배정 탑승자 ${outOfPreferencePassengerIds.length}명을 별도로 승인해야 합니다.`
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
            <button type="button" className={styles.back} onClick={navigateToAllocations}>
              <ArrowLeft size={17} /> 배차 계산으로
            </button>
            <h1>{row.allocation_name}</h1>
            <p>
              {workspace.status === 'confirmed' ? '확정 배차' : '배차 초안'} ·
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
                확정 준비 {confirmationReadinessCount}/4
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
                  ? '탑승자 버스표에 확정 배차가 반영되었습니다.'
                  : '탑승자 버스표가 숨겨지고 배차 초안으로 전환되었습니다.'}
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
            {workspace.status === 'confirmed'
              ? '확정 배차안은 잠겨 있습니다. 변경하려면 아래에서 배차 확정을 먼저 취소해주세요.'
              : '다른 전체 관리자가 이 배차안을 편집 중입니다. 현재는 조회만 가능합니다.'}
          </div>
        )}
        {exceedsOptimalBaseline && workspace.optimalBaseline && (
          <div className={styles.readOnlyBanner}>
            신청 변경 또는 관리자 조정으로 기존 최적해보다 버스가 늘었습니다. 현재{' '}
            {workspace.buses.length}대 / 기준 {workspace.optimalBaseline.totalBuses}대이며,
            확정 전에 추가 버스와 탑승자 배정을 확인해주세요.
          </div>
        )}

        <section className={styles.metrics}>
          <article><Users size={20} /><strong>{workspace.passengers.length}명</strong><span>전체 탑승자</span></article>
          <article><Bus size={20} /><strong>{workspace.buses.length}대</strong><span>운행 버스</span></article>
          <article><CheckCircle2 size={20} /><strong>{getFirstChoiceCoverage(workspace).toFixed(1)}%</strong><span>1지망 반영률</span></article>
          <article><strong>{totals.totalCost.toLocaleString()}원</strong><span>총비용</span></article>
          <article className={validation.errors.length ? styles.metricError : undefined}>
            <AlertTriangle size={20} /><strong>{validation.errors.length}건</strong><span>확정 차단 오류</span>
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
            <Users size={17} /> 전체 탑승자
            {issueTargets.passengerIds.size > 0 && <em>{issueTargets.passengerIds.size}</em>}
          </button>
        </nav>

        {activeEditorTab === 'buses' && <section className={`${styles.workspace} ${readOnly ? styles.readOnly : ''}`}>
          <div className={styles.sharedBusInfo}>
            <div className={styles.sharedBusInfoHeader}>
              <div>
                <strong>공통 운행정보</strong>
                <span>출발 일시와 탑승장소는 모든 버스에 동일하게 적용됩니다.</span>
              </div>
              <small>{workspace.buses.length}대 일괄 적용</small>
            </div>
            <div className={styles.sharedBusInfoFields}>
              <label className={hasMissingDepartureTime ? styles.fieldWithError : undefined}>
                출발 일시
                <input
                  disabled={readOnly}
                  value={sharedDepartureTime.value}
                  placeholder={sharedDepartureTime.isMixed ? '버스마다 다름 - 입력하면 모두 통일됩니다' : '예: 오후 2시'}
                  onChange={(event) => updateSharedBusField('departureTime', event.target.value)}
                />
              </label>
              <label className={hasMissingBoardingPlace ? styles.fieldWithError : undefined}>
                탑승장소
                <input
                  disabled={readOnly}
                  value={sharedBoardingPlace.value}
                  placeholder={sharedBoardingPlace.isMixed ? '버스마다 다름 - 입력하면 모두 통일됩니다' : '예: 본관 앞'}
                  onChange={(event) => updateSharedBusField('boardingPlace', event.target.value)}
                />
              </label>
            </div>
          </div>
          <aside className={styles.busPanel}>
            <div className={styles.busPanelHeader}>
              <span className={styles.busPanelIcon}>
                <Bus size={18} />
              </span>
              <div>
                <h2>운행 버스</h2>
                <p>버스를 선택해 배차 현황을 확인하세요.</p>
              </div>
              <strong>{workspace.buses.length}대</strong>
            </div>
            <div className={styles.addBusControl}>
              <button
                type="button"
                className={styles.addBusButton}
                disabled={
                  readOnly ||
                  (workspace.buses.length === 0 && !workspace.manualBusTemplate)
                }
                onClick={addBus}
              >
                <Plus size={16} />{' '}
                {workspace.buses.length === 0 ? '첫 버스 추가' : '같은 규격 버스 추가'}
              </button>
            </div>
            <div className={styles.busFilterSection}>
              <div className={styles.busFilterHeader}>
                <strong>탑승 현황</strong>
                {busOccupancyFilter !== 'all' && (
                  <button type="button" onClick={() => setBusOccupancyFilter('all')}>
                    필터 해제
                  </button>
                )}
              </div>
              <div className={styles.busOccupancyFilters} aria-label="버스 탑승 상태 필터">
                {BUS_OCCUPANCY_FILTERS.map((filter) => (
                  <button
                    type="button"
                    key={filter.id}
                    className={
                      busOccupancyFilter === filter.id
                        ? styles.busOccupancyFilterActive
                        : undefined
                    }
                    onClick={() => setBusOccupancyFilter(filter.id)}
                  >
                    {filter.label}
                    <span>{busOccupancyFilterCounts[filter.id]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.busList}>
              {visibleBuses.map((bus) => {
                const count = passengerCountByBus.get(bus.id) ?? 0;
                const remainingSeatPassengerCount =
                  remainingSeatPassengerCountByBus.get(bus.id) ?? 0;
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
                      remainingSeats > 0 ? styles.busHasSeats : '',
                      remainingSeats === 0 ? styles.busFull : '',
                      remainingSeats < 0 ? styles.busOverCapacity : '',
                      remainingSeatPassengerCount > 0
                        ? styles.busWithRemainingSeatPassengers
                        : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => {
                      setSelectedBusId(bus.id);
                      setSelectedPassengerSearch('');
                    }}
                    onDragOver={(event) => !readOnly && event.preventDefault()}
                    onDrop={(event) => dropPassenger(event, bus.id)}
                  >
                    <span className={styles.busCardHeader}>
                      <strong>{formatBusLabel(bus.label)}</strong>
                      <small>{bus.destination || '행선지 미설정'}</small>
                    </span>
                    <span className={styles.busOccupancy}>
                      <strong>{count} / {bus.capacity}명</strong>
                    </span>
                    {remainingSeats !== 0 && (
                      <span className={styles.busOccupancyTrack}>
                        <span style={{ width: `${occupancyPercent}%` }} />
                      </span>
                    )}
                    {remainingSeatPassengerCount > 0 && (
                      <span className={styles.busRemainingSeatBadge}>
                        잔여 좌석 신청 <strong>+{remainingSeatPassengerCount}명</strong>
                      </span>
                    )}
                    <span className={styles.busCardBadges}>
                      <small
                        className={
                          remainingSeats > 0
                            ? styles.busBadgeAvailable
                            : remainingSeats === 0
                              ? styles.busBadgeFull
                              : styles.busBadgeOver
                        }
                      >
                        {remainingSeats > 0
                          ? `잔여 ${remainingSeats}석`
                          : remainingSeats === 0
                            ? '만석'
                            : `${Math.abs(remainingSeats)}명 초과`}
                      </small>
                      {issueCount > 0 && <em>오류 {issueCount}건</em>}
                    </span>
                  </button>
                );
              })}
              {visibleBuses.length === 0 && (
                <div className={styles.busFilterEmpty}>
                  해당 탑승 상태의 버스가 없습니다.
                </div>
              )}
              <div
                className={`${styles.unassigned} ${
                  issueTargets.hasUnassignedIssue ? styles.unassignedWithError : ''
                }`}
                onDragOver={(event) => !readOnly && event.preventDefault()}
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
                  <label className={issueTargets.busFields.get(selectedBus.id)?.has('label') ? styles.fieldWithError : undefined}>버스 이름<input disabled={readOnly} value={selectedBus.label} onChange={(event) => updateBus(selectedBus.id, 'label', event.target.value)} /></label>
                  <label className={issueTargets.busFields.get(selectedBus.id)?.has('destination') ? styles.fieldWithError : undefined}>행선지<select disabled={readOnly} value={selectedBus.destination} onChange={(event) => updateBus(selectedBus.id, 'destination', event.target.value)}><option value="">선택</option>{destinationOptions.map((destination) => <option key={destination} value={destination}>{destination}</option>)}</select></label>
                  <button type="button" className={styles.deleteButton} disabled={readOnly} onClick={() => deleteBus(selectedBus.id)}><Trash2 size={15} /> 버스 삭제</button>
                </div>

                <div className={styles.passengerHeader}>
                  <div>
                    <span className={styles.selectedBusEyebrow}>선택 호차 탑승 명단</span>
                    <h2>{formatBusLabel(selectedBus.label)} 탑승자 {selectedPassengers.length}명</h2>
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
                          !isRemainingSeatPassenger(passenger) &&
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
                          !isRemainingSeatPassenger(passenger) &&
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
                    passengerCountByBus={passengerCountByBus}
                    passengerIssueFields={issueTargets.passengerFields}
                    readOnly={readOnly}
                    onAssign={assignPassenger}
                    onSeat={updatePassengerSeat}
                  />
                ) : (
                  <div className={styles.selectedPassengerEmpty}>
                    {selectedPassengers.length === 0
                      ? `${formatBusLabel(selectedBus.label)}에 배차된 탑승자가 없습니다.`
                      : '검색 조건에 맞는 탑승자가 없습니다.'}
                  </div>
                )}
              </>
            )}
          </section>
        </section>}

        {activeEditorTab === 'passengers' && <section className={`${styles.allPassengerSection} ${readOnly ? styles.readOnly : ''}`}>
          <div className={styles.allPassengerHeader}>
            <div>
              <h2>탑승자 검색 배차 편집</h2>
              <p>이름, 캠퍼스, 팀, 지망, 버스, 좌석으로 탑승자를 찾아 배차를 변경하세요.</p>
            </div>
          </div>
          <div className={styles.passengerQuickFilters} aria-label="탑승자 빠른 필터">
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
              placeholder="탑승자 이름, 캠퍼스, 팀, 지망, 버스, 좌석 검색"
            />
            {allPassengerSearch && (
              <button type="button" onClick={() => setAllPassengerSearch('')}>
                지우기
              </button>
            )}
          </label>

          {visibleAllPassengers.length === 0 ? (
            <div className={styles.passengerSearchEmpty}>
              <strong>검색 조건에 맞는 탑승자가 없습니다.</strong>
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
                passengerCountByBus={passengerCountByBus}
                passengerIssueFields={issueTargets.passengerFields}
                revealPassengerId={passengerToReveal}
                onRevealComplete={() => setPassengerToReveal(null)}
                readOnly={readOnly}
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
                {remainingSeatPassengers.length > 0 && (
                  <div className={styles.remainingSeatSummary}>
                    <strong>잔여 좌석 탑승자 {remainingSeatPassengers.length}명</strong>
                    <span>
                      미입금 {pendingRemainingSeatCount}명 · 입금 완료{' '}
                      {remainingSeatPassengers.length - pendingRemainingSeatCount}명
                    </span>
                    <small>
                      잔여 좌석 탑승자는 직접 선택한 버스와 좌석을 사용하며 1·2지망
                      검증에서 제외됩니다.
                    </small>
                  </div>
                )}
                {belowMinimumBusIds.length > 0 ? (
                  <label className={`${styles.override} ${workspace.allowMinimumPassengerOverride ? styles.overrideApproved : ''}`}>
                    <input
                      type="checkbox"
                      disabled={readOnly}
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
                      disabled={readOnly}
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
                  <p className={styles.ok}>1·2지망 외 배정 탑승자가 없습니다.</p>
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
              <small>변경 이력 · 버전 복원</small>
            </span>
            <em>기록 {workspaceTimeline.length}개</em>
          </summary>
          <div className={styles.supportToolsGrid}>
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
                      disabled={readOnly}
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
          className={`${styles.finalSection} ${
            readOnly && workspace.status !== 'confirmed' ? styles.readOnly : ''
          }`}
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
                    탑승자에게 확정 버스표가 공개된 상태입니다. 확정을 취소하기
                    전까지 이 배차안과 다른 배차 운영 기능은 잠깁니다.
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
                  <span>확정 탑승자</span>
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
                {activeDepartureCount > 0 && (
                  <p role="alert">
                    출발 완료 호차 {activeDepartureCount.toLocaleString()}대가 있어
                    배차 확정을 취소할 수 없습니다. 출발 완료를 먼저 모두
                    취소해주세요.
                  </p>
                )}
                <div>
                  <strong>확정 상태를 되돌려야 하나요?</strong>
                  <span>
                    취소하면 탑승자 버스표가 즉시 숨겨지고 배차 초안으로 돌아갑니다.
                  </span>
                </div>
                <div className={styles.cancelConfirmationControls}>
                  <button
                    type="button"
                    className={styles.cancelConfirmationButton}
                    disabled={saving || activeDepartureCount > 0}
                    title={
                      activeDepartureCount > 0
                        ? '출발 완료를 모두 취소한 뒤 배차 확정을 취소할 수 있습니다.'
                        : undefined
                    }
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
                <small>배차 초안 삭제</small>
              </span>
            </summary>
            <div className={styles.dangerZone}>
              <div>
                <strong>배차 초안 삭제</strong>
                <span>저장하지 않은 변경사항, 배차안 기록, 복원 가능한 버전이 모두 삭제됩니다.</span>
              </div>
              <button
                type="button"
                className={styles.deleteWorkspaceButton}
                disabled={saving || readOnly}
                onClick={deleteWorkspace}
              >
                <Trash2 size={17} /> 배차 초안 삭제
              </button>
            </div>
          </details>
        )}
      </main>

      {confirmDialogOpen && workspace.status === 'draft' && (
        <div
          className={styles.confirmBackdrop}
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !saving &&
              !confirmationInFlightRef.current
            ) {
              setConfirmDialogOpen(false);
            }
          }}
        >
          <section
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="allocation-confirm-title"
            aria-describedby="allocation-confirm-description"
          >
            <span className={styles.confirmDialogIcon} aria-hidden="true">
              <ShieldCheck size={26} />
            </span>
            <p className={styles.confirmDialogEyebrow}>전체 배차 확정</p>
            <h2 id="allocation-confirm-title">
              {row.allocation_name} 배차안을 확정할까요?
            </h2>
            <p id="allocation-confirm-description">
              서버에서 최신 신청자와 배차 상태를 다시 검증한 뒤 확정합니다. 확정
              완료 즉시 탑승자에게 버스표가 공개되고 배차 편집이 잠깁니다.
            </p>
            <dl className={styles.confirmDialogSummary}>
              <div>
                <dt>확정 탑승자</dt>
                <dd>{workspace.passengers.length.toLocaleString()}명</dd>
              </div>
              <div>
                <dt>운행 버스</dt>
                <dd>{workspace.buses.length.toLocaleString()}대</dd>
              </div>
              <div>
                <dt>총 비용</dt>
                <dd>{totals.totalCost.toLocaleString()}원</dd>
              </div>
              <div>
                <dt>현재 경고</dt>
                <dd>{validation.warnings.length.toLocaleString()}건</dd>
              </div>
              <div>
                <dt>잔여 좌석 미입금</dt>
                <dd>{pendingRemainingSeatCount.toLocaleString()}명</dd>
              </div>
              <div>
                <dt>처리 결과</dt>
                <dd>버스표 공개 · 배차 편집 잠금</dd>
              </div>
            </dl>
            <div className={styles.confirmDialogActions}>
              <button
                type="button"
                className={styles.confirmDialogCancel}
                onClick={() => setConfirmDialogOpen(false)}
                disabled={saving}
                autoFocus
              >
                취소
              </button>
              <button
                type="button"
                className={styles.confirmDialogSubmit}
                onClick={() => void confirmPendingAllocation()}
                disabled={saving}
              >
                {confirmationAction === 'confirm' ? (
                  <>
                    <LoaderCircle className={styles.spin} size={18} /> 배차 확정 중...
                  </>
                ) : (
                  <>
                    <BadgeCheck size={18} /> 전체 배차 확정
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      )}

      {slowConfirmationDialogOpen && (
        <div className={styles.confirmBackdrop}>
          <section
            className={styles.confirmDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="slow-confirmation-title"
            aria-describedby="slow-confirmation-description"
          >
            <span className={styles.confirmDialogIcon} aria-hidden="true">
              <LoaderCircle className={styles.spin} size={26} />
            </span>
            <p className={styles.confirmDialogEyebrow}>배차 확정 처리 중</p>
            <h2 id="slow-confirmation-title">서버 처리가 평소보다 오래 걸리고 있습니다.</h2>
            <p id="slow-confirmation-description">
              서버에서는 배차 확정을 계속 처리하고 있습니다. 계속 기다리거나 현재
              화면의 대기를 그만둘 수 있습니다.
            </p>
            <div className={styles.confirmDialogActions}>
              <button
                type="button"
                className={styles.confirmDialogCancel}
                onClick={stopWaitingForConfirmation}
              >
                대기 그만두기
              </button>
              <button
                type="button"
                className={styles.confirmDialogSubmit}
                onClick={() => setSlowConfirmationDialogOpen(false)}
                autoFocus
              >
                계속 기다리기
              </button>
            </div>
          </section>
        </div>
      )}

      {cancelDialogOpen && workspace.status === 'confirmed' && (
        <div
          className={styles.confirmBackdrop}
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !saving &&
              !cancellationInFlightRef.current
            ) {
              setCancelDialogOpen(false);
            }
          }}
        >
          <section
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="allocation-cancel-title"
            aria-describedby="allocation-cancel-description"
          >
            <span
              className={`${styles.confirmDialogIcon} ${styles.cancelDialogIcon}`}
              aria-hidden="true"
            >
              <RotateCcw size={26} />
            </span>
            <p
              className={`${styles.confirmDialogEyebrow} ${styles.cancelDialogEyebrow}`}
            >
              배차 확정 취소
            </p>
            <h2 id="allocation-cancel-title">
              {row.allocation_name} 배차 확정을 취소할까요?
            </h2>
            <p id="allocation-cancel-description">
              탑승자에게 공개된 확정 버스표가 즉시 숨겨지고 배차안은 다시 편집 가능한
              초안 상태로 돌아갑니다.
            </p>
            <dl className={styles.confirmDialogSummary}>
              <div>
                <dt>기존 확정 시각</dt>
                <dd>
                  {workspace.confirmedAt
                    ? new Date(workspace.confirmedAt).toLocaleString('ko-KR')
                    : '-'}
                </dd>
              </div>
              <div>
                <dt>영향받는 탑승자</dt>
                <dd>{workspace.passengers.length.toLocaleString()}명</dd>
              </div>
              <div>
                <dt>운행 버스</dt>
                <dd>{workspace.buses.length.toLocaleString()}대</dd>
              </div>
              <div>
                <dt>배차안 총 비용</dt>
                <dd>{totals.totalCost.toLocaleString()}원</dd>
              </div>
              <div>
                <dt>처리 결과</dt>
                <dd>버스표 숨김 · 배차 초안 전환</dd>
              </div>
            </dl>
            <div className={styles.confirmDialogActions}>
              <button
                type="button"
                className={styles.confirmDialogCancel}
                onClick={() => setCancelDialogOpen(false)}
                disabled={saving}
                autoFocus
              >
                돌아가기
              </button>
              <button
                type="button"
                className={styles.cancelDialogSubmit}
                onClick={() => void confirmCancellation()}
                disabled={saving || activeDepartureCount > 0}
              >
                {confirmationAction === 'cancel' ? (
                  <>
                    <LoaderCircle className={styles.spin} size={18} /> 취소 처리 중...
                  </>
                ) : (
                  <>
                    <RotateCcw size={18} /> 배차 확정 취소
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingBusDeletion && workspace.status === 'draft' && (
        <div
          className={styles.confirmBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPendingBusDeletion(null);
            }
          }}
        >
          <section
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bus-delete-title"
            aria-describedby="bus-delete-description"
          >
            <span
              className={`${styles.confirmDialogIcon} ${styles.cancelDialogIcon}`}
              aria-hidden="true"
            >
              <Trash2 size={26} />
            </span>
            <p
              className={`${styles.confirmDialogEyebrow} ${styles.cancelDialogEyebrow}`}
            >
              버스 삭제
            </p>
            <h2 id="bus-delete-title">
              {formatBusLabel(pendingBusDeletion.label)} 버스를 삭제할까요?
            </h2>
            <p id="bus-delete-description">
              이 버스에 배정된 탑승자의 호차와 좌석이 모두 해제되어 미배차 상태로
              전환됩니다. 변경사항 저장 전에는 서버 배차안에 반영되지 않습니다.
            </p>
            <dl className={styles.confirmDialogSummary}>
              <div>
                <dt>삭제 버스</dt>
                <dd>{formatBusLabel(pendingBusDeletion.label)}</dd>
              </div>
              <div>
                <dt>행선지</dt>
                <dd>{pendingBusDeletion.destination || '미설정'}</dd>
              </div>
              <div>
                <dt>좌석 정원</dt>
                <dd>{pendingBusDeletion.capacity.toLocaleString()}석</dd>
              </div>
              <div>
                <dt>미배차 전환</dt>
                <dd>
                  {workspace.passengers
                    .filter((passenger) => passenger.busId === pendingBusDeletion.id)
                    .length.toLocaleString()}
                  명
                </dd>
              </div>
              <div>
                <dt>잔여 좌석 신청자</dt>
                <dd>
                  {workspace.passengers
                    .filter(
                      (passenger) =>
                        passenger.busId === pendingBusDeletion.id &&
                        isRemainingSeatPassenger(passenger)
                    )
                    .length.toLocaleString()}
                  명 포함
                </dd>
              </div>
              <div>
                <dt>처리 결과</dt>
                <dd>버스 삭제 · 탑승자 미배차 전환</dd>
              </div>
            </dl>
            <div className={styles.confirmDialogActions}>
              <button
                type="button"
                className={styles.confirmDialogCancel}
                onClick={() => setPendingBusDeletion(null)}
                autoFocus
              >
                돌아가기
              </button>
              <button
                type="button"
                className={styles.cancelDialogSubmit}
                onClick={confirmBusDeletion}
              >
                <Trash2 size={18} /> 버스 삭제
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteWorkspaceDialogOpen && workspace.status === 'draft' && (
        <div
          className={styles.confirmBackdrop}
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !saving &&
              !workspaceDeletionInFlightRef.current
            ) {
              setDeleteWorkspaceDialogOpen(false);
            }
          }}
        >
          <section
            className={`${styles.confirmDialog} ${styles.dangerConfirmDialog}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-delete-title"
            aria-describedby="workspace-delete-description"
          >
            <span
              className={`${styles.confirmDialogIcon} ${styles.cancelDialogIcon}`}
              aria-hidden="true"
            >
              <Trash2 size={26} />
            </span>
            <p
              className={`${styles.confirmDialogEyebrow} ${styles.cancelDialogEyebrow}`}
            >
              배차 초안 영구 삭제
            </p>
            <h2 id="workspace-delete-title">
              {row.allocation_name} 배차 초안을 삭제할까요?
            </h2>
            <p id="workspace-delete-description">
              삭제하면 배차안, 저장 기록, 복원 가능한 버전을 되돌릴 수 없습니다.
              탑승자의 기존 신청 정보는 삭제되지 않습니다.
            </p>
            <dl className={styles.confirmDialogSummary}>
              <div>
                <dt>배차 탑승자</dt>
                <dd>{workspace.passengers.length.toLocaleString()}명</dd>
              </div>
              <div>
                <dt>운행 버스</dt>
                <dd>{workspace.buses.length.toLocaleString()}대</dd>
              </div>
              <div>
                <dt>복원 버전</dt>
                <dd>{workspaceVersions.length.toLocaleString()}개 삭제</dd>
              </div>
              <div>
                <dt>미저장 변경사항</dt>
                <dd>{dirty ? '함께 삭제됨' : '없음'}</dd>
              </div>
              <div>
                <dt>처리 결과</dt>
                <dd>배차 초안 · 기록 · 버전 영구 삭제</dd>
              </div>
            </dl>
            <div className={styles.confirmDialogActions}>
              <button
                type="button"
                className={styles.confirmDialogCancel}
                onClick={() => setDeleteWorkspaceDialogOpen(false)}
                disabled={saving}
                autoFocus
              >
                돌아가기
              </button>
              <button
                type="button"
                className={styles.cancelDialogSubmit}
                onClick={() => void confirmWorkspaceDeletion()}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <LoaderCircle className={styles.spin} size={18} /> 삭제 중...
                  </>
                ) : (
                  <>
                    <Trash2 size={18} /> 배차 초안 영구 삭제
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      )}

      {leaveWorkspaceDialogOpen && (
        <div
          className={styles.confirmBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setLeaveWorkspaceDialogOpen(false);
            }
          }}
        >
          <section
            className={`${styles.confirmDialog} ${styles.dangerConfirmDialog}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-leave-title"
            aria-describedby="workspace-leave-description"
          >
            <span
              className={`${styles.confirmDialogIcon} ${styles.cancelDialogIcon}`}
              aria-hidden="true"
            >
              <ArrowLeft size={26} />
            </span>
            <p
              className={`${styles.confirmDialogEyebrow} ${styles.cancelDialogEyebrow}`}
            >
              저장하지 않은 변경사항
            </p>
            <h2 id="workspace-leave-title">변경사항을 버리고 이동할까요?</h2>
            <p id="workspace-leave-description">
              현재 작업공간에서 저장하지 않은 버스 설정과 승객 배정 변경사항은
              사라집니다. 마지막으로 저장한 배차 초안과 버전 기록은 그대로
              유지됩니다.
            </p>
            <dl className={styles.confirmDialogSummary}>
              <div>
                <dt>배차 초안</dt>
                <dd>{row.allocation_name}</dd>
              </div>
              <div>
                <dt>현재 작업 규모</dt>
                <dd>
                  버스 {workspace.buses.length.toLocaleString()}대 · 승객{' '}
                  {workspace.passengers.length.toLocaleString()}명
                </dd>
              </div>
              <div>
                <dt>저장된 기록</dt>
                <dd>유지됨</dd>
              </div>
              <div>
                <dt>저장하지 않은 변경사항</dt>
                <dd>이동 시 폐기됨</dd>
              </div>
              <div>
                <dt>이동 위치</dt>
                <dd>배차 계산 목록</dd>
              </div>
            </dl>
            <div className={styles.confirmDialogActions}>
              <button
                type="button"
                className={styles.confirmDialogCancel}
                onClick={() => setLeaveWorkspaceDialogOpen(false)}
                disabled={saving}
                autoFocus
              >
                계속 편집
              </button>
              <button
                type="button"
                className={styles.cancelDialogSubmit}
                onClick={confirmNavigateToAllocations}
                disabled={saving}
              >
                <ArrowLeft size={18} /> 변경사항 버리고 이동
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingVersionRestore && workspace.status === 'draft' && (
        <div
          className={styles.confirmBackdrop}
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !saving &&
              !versionRestoreInFlightRef.current
            ) {
              setPendingVersionRestore(null);
            }
          }}
        >
          <section
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="version-restore-title"
            aria-describedby="version-restore-description"
          >
            <span className={styles.confirmDialogIcon} aria-hidden="true">
              <History size={26} />
            </span>
            <p className={styles.confirmDialogEyebrow}>저장 버전 복원</p>
            <h2 id="version-restore-title">
              {pendingVersionRestore.label} 상태로 복원할까요?
            </h2>
            <p id="version-restore-description">
              현재 버스와 탑승자 배정이 선택한 저장 버전으로 교체됩니다. 복원 후
              변경사항을 저장해야 실제 서버 배차안에 반영됩니다.
            </p>
            <dl className={styles.confirmDialogSummary}>
              <div>
                <dt>복원 버전</dt>
                <dd>{pendingVersionRestore.label}</dd>
              </div>
              <div>
                <dt>저장 시각</dt>
                <dd>
                  {new Date(pendingVersionRestore.createdAt).toLocaleString(
                    'ko-KR'
                  )}
                </dd>
              </div>
              <div>
                <dt>저장자</dt>
                <dd>{pendingVersionRestore.actorId.slice(0, 8)}</dd>
              </div>
              <div>
                <dt>현재 배차 규모</dt>
                <dd>
                  버스 {workspace.buses.length.toLocaleString()}대 · 탑승자{' '}
                  {workspace.passengers.length.toLocaleString()}명
                </dd>
              </div>
              <div>
                <dt>미저장 변경사항</dt>
                <dd>{dirty ? '복원 내용으로 교체됨' : '없음'}</dd>
              </div>
              <div>
                <dt>처리 결과</dt>
                <dd>복원본 적용 · 별도 저장 필요</dd>
              </div>
            </dl>
            <div className={styles.confirmDialogActions}>
              <button
                type="button"
                className={styles.confirmDialogCancel}
                onClick={() => setPendingVersionRestore(null)}
                disabled={saving}
                autoFocus
              >
                돌아가기
              </button>
              <button
                type="button"
                className={styles.confirmDialogSubmit}
                onClick={() => void confirmVersionRestore()}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <LoaderCircle className={styles.spin} size={18} /> 복원 중...
                  </>
                ) : (
                  <>
                    <History size={18} /> 저장 버전 복원
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminAllocationWorkspacePage;
