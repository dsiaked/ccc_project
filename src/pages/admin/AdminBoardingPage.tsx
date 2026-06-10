import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bus,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  ArrowRightLeft,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Phone,
  RefreshCw,
  Save,
  Search,
  UserPlus,
  UserRound,
  X,
  UserX,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  addBoardingWalkIn,
  cancelBoardingBusDeparture,
  getBoardingManagementSnapshot,
  getBoardingMoveRequestSnapshot,
  markBoardingBusDeparted,
  moveBoardingPassenger,
  requestBoardingPassengerMove,
  respondToBoardingMoveRequest,
  rotateBoardingCheckInCode,
  setBoardingPassengerStatus,
  syncBoardingRosterGoogleSheet,
  updatePassengerBoardingNote,
  type BoardingEvent,
  type BoardingMoveRequestSnapshot,
  type BoardingPassenger,
  type BoardingSnapshot,
  type BoardingStatus,
} from '../../lib/admin/boardingManagementService';
import { formatKoreanDateTime } from '../../utils/dateTime';
import { formatBusLabel } from '../../utils/busLabel';
import {
  downloadFullBoardingRosterExcel,
  printFullBoardingRosterPdf,
} from '../../utils/boardingRosterExport';
import { useAdminAuth } from '../../components/AdminAuthProvider';
import AdminHeader from './AdminHeader';
import styles from './AdminBoardingPage.module.css';

const statusLabels: Record<BoardingStatus, string> = {
  unchecked: '탑승 미확인',
  boarded: '탑승 확인',
  no_show: '미탑승',
};

const statusSortOrder: Record<BoardingStatus, number> = {
  unchecked: 0,
  no_show: 1,
  boarded: 2,
};

const boardingRosterGoogleSheetUrl = String(
  import.meta.env.VITE_BOARDING_ROSTER_GOOGLE_SHEET_URL ?? ''
).trim();
const boardingRosterGoogleSheetSyncEnabled =
  import.meta.env.VITE_BOARDING_ROSTER_GOOGLE_SHEET_SYNC_ENABLED === 'true';

const getChangeActorType = (event: BoardingEvent) => {
  if (event.actorType) return event.actorType;
  if (event.note === '탑승 확인' || event.note === 'passenger_check_in_code') {
    return 'passenger';
  }
  if (
    event.note === 'bus_departed_auto_no_show' ||
    event.note?.startsWith('호차 출발')
  ) {
    return 'automatic';
  }
  return 'boarding_manager';
};

const getChangeActorLabel = (event: BoardingEvent) => {
  const actorType = getChangeActorType(event);

  if (actorType === 'passenger') return '사용자 직접 확인';
  if (actorType === 'automatic') {
    return event.note?.includes('취소')
      ? '출발 취소 자동 복구'
      : '출발 완료 자동 처리';
  }

  return event.actorName ? `탑승 관리 간사님 ${event.actorName} 처리` : '탑승 관리 간사님 처리';
};

const getStatusChangeReason = (event: BoardingEvent) => {
  const prefix = 'boarding_status_changed:';
  return event.note?.startsWith(prefix)
    ? event.note.slice(prefix.length).trim()
    : '';
};

const AdminBoardingPage = () => {
  const { adminRole } = useAdminAuth();
  const isGlobalAdmin = adminRole?.role === 'global_admin';
  const boardingScopeLabel = isGlobalAdmin ? '전체 확정 호차' : '내 담당 호차';
  const [snapshot, setSnapshot] = useState<BoardingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [sheetSyncedAt, setSheetSyncedAt] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [moveRequestSnapshot, setMoveRequestSnapshot] =
    useState<BoardingMoveRequestSnapshot | null>(null);
  const [moveRequestActionId, setMoveRequestActionId] = useState('');
  const [selectedBusId, setSelectedBusId] = useState('');
  const [search, setSearch] = useState('');
  const [campusFilter, setCampusFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<BoardingStatus | ''>('');
  const [locallyBoardedPassengerIds, setLocallyBoardedPassengerIds] = useState<Set<string>>(
    () => new Set()
  );
  const [boardingFeedback, setBoardingFeedback] = useState('');
  const [pendingPassengerIds, setPendingPassengerIds] = useState<Set<string>>(
    () => new Set()
  );
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNoteIds, setSavingNoteIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedPassengerId, setSelectedPassengerId] = useState('');
  const [savedNotePassengerId, setSavedNotePassengerId] = useState('');
  const [noShowReasonPassengerId, setNoShowReasonPassengerId] = useState('');
  const [boardingTransitionPassenger, setBoardingTransitionPassenger] =
    useState<BoardingPassenger | null>(null);
  const [boardingTransitionReason, setBoardingTransitionReason] = useState('');
  const [departureActionKey, setDepartureActionKey] = useState('');
  const [departureConfirmOpen, setDepartureConfirmOpen] = useState(false);
  const [departureCancelOpen, setDepartureCancelOpen] = useState(false);
  const [departureCancelReason, setDepartureCancelReason] = useState('');
  const [rotatingCodeBusId, setRotatingCodeBusId] = useState('');
  const [exceptionMode, setExceptionMode] = useState<'walk_in' | 'move' | null>(null);
  const [exceptionPassenger, setExceptionPassenger] = useState<BoardingPassenger | null>(null);
  const [exceptionBusId, setExceptionBusId] = useState('');
  const [exceptionSeatNumber, setExceptionSeatNumber] = useState('');
  const [exceptionName, setExceptionName] = useState('');
  const [exceptionPhone, setExceptionPhone] = useState('');
  const [exceptionCampus, setExceptionCampus] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [savingException, setSavingException] = useState(false);
  const pendingPassengerIdsRef = useRef<Set<string>>(new Set());
  const savingNoteIdsRef = useRef<Set<string>>(new Set());
  const departureActionInFlightRef = useRef(false);
  const rotatingCodeInFlightRef = useRef(false);
  const exceptionInFlightRef = useRef(false);
  const moveRequestInFlightRef = useRef(false);
  const snapshotRequestRevisionRef = useRef(0);
  const realtimeSyncTimerRef = useRef<number | null>(null);
  const sheetAutoSyncTimerRef = useRef<number | null>(null);
  const boardingFeedbackTimerRef = useRef<number | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const passengerDetailHistoryEntryRef = useRef(false);
  const passengerDetailHistoryMarkerRef = useRef('boarding-passenger-detail');

  useEffect(
    () => () => {
      if (boardingFeedbackTimerRef.current !== null) {
        window.clearTimeout(boardingFeedbackTimerRef.current);
      }
    },
    []
  );

  const loadSnapshot = useCallback(async (quiet = false) => {
    const requestRevision = ++snapshotRequestRevisionRef.current;
    if (!quiet) setLoading(true);
    try {
      const [next, nextMoveRequests] = await Promise.all([
        getBoardingManagementSnapshot(),
        getBoardingMoveRequestSnapshot(),
      ]);
      if (requestRevision !== snapshotRequestRevisionRef.current) return;
      setSnapshot(next);
      setMoveRequestSnapshot(nextMoveRequests);
      setError('');
      setSelectedBusId((current) =>
        current && next?.buses.some((bus) => bus.id === current)
          ? current
          : next?.buses[0]?.id ?? ''
      );
    } catch (loadError) {
      if (requestRevision !== snapshotRequestRevisionRef.current) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : '탑승 현황을 불러오지 못했습니다.'
      );
    } finally {
      if (requestRevision === snapshotRequestRevisionRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadSnapshot();
    }, 0);

    const scheduleRealtimeSync = () => {
      if (realtimeSyncTimerRef.current !== null) {
        window.clearTimeout(realtimeSyncTimerRef.current);
      }

      realtimeSyncTimerRef.current = window.setTimeout(() => {
        realtimeSyncTimerRef.current = null;
        void loadSnapshot(true);
      }, 1500);
    };

    const channel = supabase
      .channel('boarding-management-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations' },
        scheduleRealtimeSync
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'boarding_bus_departures' },
        scheduleRealtimeSync
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'boarding_move_requests' },
        scheduleRealtimeSync
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'personal_notifications' },
        (payload) => {
          const notification = payload.new as {
            title?: string;
            content?: string;
            category?: string;
          };
          if (notification.category === 'boarding') {
            setMessage(
              [notification.title, notification.content]
                .filter(Boolean)
                .join(' · ')
            );
          }
          scheduleRealtimeSync();
        }
      )
      .subscribe();

    return () => {
      window.clearTimeout(initialLoad);
      if (realtimeSyncTimerRef.current !== null) {
        window.clearTimeout(realtimeSyncTimerRef.current);
      }
      void supabase.removeChannel(channel);
    };
  }, [loadSnapshot]);

  const selectedBus = snapshot?.buses.find((bus) => bus.id === selectedBusId);
  const isSelectedBusLocked = Boolean(selectedBus?.departedAt);
  const normalizedSearch = search.trim().toLocaleLowerCase('ko');
  const isGlobalSearch = Boolean(normalizedSearch);
  const matchingPassengers = useMemo(() => {
    const busLabel = selectedBus?.label;

    return (snapshot?.passengers ?? [])
      .filter(
        (passenger) => normalizedSearch || passenger.busNumber === busLabel
      )
      .filter((passenger) => !campusFilter || passenger.campus === campusFilter)
      .filter(
        (passenger) =>
          !normalizedSearch ||
          [
            passenger.name,
            passenger.phone,
            passenger.campus,
            passenger.district,
            passenger.team,
            passenger.busNumber,
            passenger.seatNumber,
            passenger.boardingNote ?? '',
          ].some((value) => value.toLocaleLowerCase('ko').includes(normalizedSearch))
      )
      .sort(
        (a, b) =>
          (locallyBoardedPassengerIds.has(a.reservationId) &&
          a.boardingStatus === 'boarded'
            ? statusSortOrder.unchecked
            : statusSortOrder[a.boardingStatus]) -
            (locallyBoardedPassengerIds.has(b.reservationId) &&
            b.boardingStatus === 'boarded'
              ? statusSortOrder.unchecked
              : statusSortOrder[b.boardingStatus]) ||
          a.busNumber.localeCompare(b.busNumber, 'ko', { numeric: true }) ||
          a.seatNumber.localeCompare(b.seatNumber, 'ko', { numeric: true }) ||
          a.name.localeCompare(b.name, 'ko')
      );
  }, [
    campusFilter,
    locallyBoardedPassengerIds,
    normalizedSearch,
    selectedBus?.label,
    snapshot?.passengers,
  ]);
  const selectedPassengers = useMemo(
    () =>
      statusFilter
        ? matchingPassengers.filter(
            (passenger) => passenger.boardingStatus === statusFilter
          )
        : matchingPassengers,
    [matchingPassengers, statusFilter]
  );

  const campuses = useMemo(
    () =>
      Array.from(
        new Set(
          (snapshot?.passengers ?? [])
            .filter(
              (passenger) => normalizedSearch || passenger.busNumber === selectedBus?.label
            )
            .map((passenger) => passenger.campus)
        )
      ).sort((a, b) => a.localeCompare(b, 'ko')),
    [normalizedSearch, selectedBus?.label, snapshot?.passengers]
  );

  const visibleCounts = useMemo(
    () =>
      matchingPassengers.reduce(
        (counts, passenger) => {
          counts[passenger.boardingStatus] += 1;
          return counts;
        },
        { unchecked: 0, boarded: 0, no_show: 0 } as Record<BoardingStatus, number>
      ),
    [matchingPassengers]
  );

  const busCountsByLabel = useMemo(() => {
    const counts = new Map<
      string,
      { total: number; boarded: number; unchecked: number; noShow: number }
    >();

    snapshot?.passengers.forEach((passenger) => {
      const current = counts.get(passenger.busNumber) ?? {
        total: 0,
        boarded: 0,
        unchecked: 0,
        noShow: 0,
      };

      current.total += 1;
      if (passenger.boardingStatus === 'boarded') current.boarded += 1;
      else if (passenger.boardingStatus === 'unchecked') current.unchecked += 1;
      else current.noShow += 1;
      counts.set(passenger.busNumber, current);
    });

    return counts;
  }, [snapshot?.passengers]);

  const overallCounts = useMemo(
    () =>
      (snapshot?.passengers ?? []).reduce(
        (counts, passenger) => {
          counts.total += 1;
          if (passenger.boardingStatus === 'boarded') counts.boarded += 1;
          else if (passenger.boardingStatus === 'unchecked') counts.unchecked += 1;
          else counts.noShow += 1;
          return counts;
        },
        { total: 0, boarded: 0, unchecked: 0, noShow: 0 }
      ),
    [snapshot?.passengers]
  );
  const departedBusCount = (snapshot?.buses ?? []).filter(
    (bus) => Boolean(bus.departedAt)
  ).length;
  const getBusRemainingCapacity = (bus: BoardingSnapshot['buses'][number]) =>
    Math.max(0, bus.capacity - (busCountsByLabel.get(bus.label)?.total ?? 0));
  const visibleBuses = useMemo(
    () =>
      [...(snapshot?.buses ?? [])].sort((a, b) =>
        formatBusLabel(a.label).localeCompare(formatBusLabel(b.label), 'ko', {
          numeric: true,
        })
      ),
    [snapshot?.buses]
  );
  const moveTargetBuses =
    moveRequestSnapshot?.targetBuses ??
    (snapshot?.buses.map((bus) => ({
      ...bus,
      remainingCapacity: getBusRemainingCapacity(bus),
      canManage: true,
    })) ?? []);
  const exceptionTargetBus = moveTargetBuses.find((bus) => bus.id === exceptionBusId);
  const exceptionTargetRemaining = exceptionTargetBus?.remainingCapacity ?? 0;
  const pendingIncomingMoveRequests = moveRequestSnapshot?.requests.filter(
    (request) => request.status === 'pending' && request.canRespond
  ) ?? [];
  const departureCancellationRestoreCount = selectedBus
    ? snapshot?.passengers.filter((passenger) => {
        const latestEvent = snapshot.events.find(
          (event) => event.reservationId === passenger.reservationId
        );
        return (
          passenger.busId === selectedBus.id &&
          passenger.boardingStatus === 'no_show' &&
          latestEvent?.note === 'bus_departed_auto_no_show'
        );
      }).length ?? 0
    : 0;
  const selectedBusCounts = selectedBus
    ? busCountsByLabel.get(selectedBus.label) ?? {
        total: 0,
        boarded: 0,
        unchecked: 0,
        noShow: 0,
      }
    : null;

  const latestEventByReservationId = useMemo(() => {
    const events = new Map<string, BoardingEvent>();

    snapshot?.events.forEach((event) => {
      if (!events.has(event.reservationId)) {
        events.set(event.reservationId, event);
      }
    });

    return events;
  }, [snapshot?.events]);
  const selectedPassenger = snapshot?.passengers.find(
    (passenger) => passenger.reservationId === selectedPassengerId
  );
  const selectedPassengerBus = selectedPassenger
    ? snapshot?.buses.find((bus) => bus.id === selectedPassenger.busId)
    : undefined;
  const isSelectedPassengerBusDeparted = Boolean(selectedPassengerBus?.departedAt);
  const selectedPassengerEvent = selectedPassenger
    ? latestEventByReservationId.get(selectedPassenger.reservationId)
    : undefined;
  const selectedPassengerNoteDraft = selectedPassenger
    ? noteDrafts[selectedPassenger.reservationId] ?? selectedPassenger.boardingNote ?? ''
    : '';
  const selectedPassengerPreferences = selectedPassenger?.stationPreferences ?? [];
  const selectedPassengerPreferenceRank = selectedPassenger?.assignedDestination
    ? selectedPassengerPreferences.findIndex(
        (preference) => preference === selectedPassenger.assignedDestination
      ) + 1
    : 0;
  const isSelectedPassengerNoteChanged = selectedPassenger
    ? selectedPassengerNoteDraft.trim() !== (selectedPassenger.boardingNote ?? '').trim()
    : false;
  const isWritingNoShowReason =
    selectedPassenger?.reservationId === noShowReasonPassengerId;
  const selectedPassengerActionStatus: BoardingStatus = isWritingNoShowReason
    ? 'no_show'
    : selectedPassenger?.boardingStatus ?? 'unchecked';
  const canConfirmNoShow =
    isWritingNoShowReason &&
    isSelectedPassengerNoteChanged &&
    Boolean(selectedPassengerNoteDraft.trim());

  const closePassengerDetails = () => {
    if (
      passengerDetailHistoryEntryRef.current &&
      window.history.state?.boardingPassengerDetail ===
        passengerDetailHistoryMarkerRef.current
    ) {
      window.history.back();
      return;
    }

    if (selectedPassenger && isSelectedPassengerNoteChanged) {
      if (!window.confirm('저장하지 않은 현장 전달사항이 있습니다. 상세보기를 닫을까요?')) {
        return;
      }
    }
    setSelectedPassengerId('');
    setSavedNotePassengerId('');
    setNoShowReasonPassengerId('');
  };

  useEffect(() => {
    if (!selectedPassengerId) return;

    if (!passengerDetailHistoryEntryRef.current) {
      window.history.pushState(
        {
          ...window.history.state,
          boardingPassengerDetail: passengerDetailHistoryMarkerRef.current,
        },
        '',
        window.location.href
      );
      passengerDetailHistoryEntryRef.current = true;
    }

    const handlePopState = () => {
      if (!passengerDetailHistoryEntryRef.current) return;

      if (
        selectedPassenger &&
        isSelectedPassengerNoteChanged &&
        !window.confirm('저장하지 않은 현장 전달사항이 있습니다. 상세보기를 닫을까요?')
      ) {
        window.history.pushState(
          {
            ...window.history.state,
            boardingPassengerDetail: passengerDetailHistoryMarkerRef.current,
          },
          '',
          window.location.href
        );
        return;
      }

      passengerDetailHistoryEntryRef.current = false;
      setSelectedPassengerId('');
      setSavedNotePassengerId('');
      setNoShowReasonPassengerId('');
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      window.history.back();
    };

    document.body.classList.add(styles.detailPanelOpen);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove(styles.detailPanelOpen);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPassengerId, isSelectedPassengerNoteChanged, selectedPassenger]);

  useEffect(() => {
    if (!isWritingNoShowReason) return;

    noteTextareaRef.current?.focus();
  }, [isWritingNoShowReason]);

  const runDepartureAction = async (key: string, action: () => Promise<void>) => {
    if (departureActionInFlightRef.current) return;
    departureActionInFlightRef.current = true;
    setDepartureActionKey(key);
    setError('');
    try {
      await action();
      await loadSnapshot(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '처리하지 못했습니다.');
    } finally {
      departureActionInFlightRef.current = false;
      setDepartureActionKey('');
    }
  };

  const handleGoogleSheetSync = useCallback(async (quiet = false) => {
    setSheetSyncing(true);
    if (!quiet) setError('');
    try {
      const result = await syncBoardingRosterGoogleSheet();
      setSheetSyncedAt(result.syncedAt);
    } catch (syncError) {
      if (!quiet) {
        setError(
          syncError instanceof Error
            ? syncError.message
            : 'Google Sheet 동기화에 실패했습니다.'
        );
      }
    } finally {
      setSheetSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (
      !isGlobalAdmin ||
      !boardingRosterGoogleSheetSyncEnabled ||
      !boardingRosterGoogleSheetUrl ||
      !snapshot
    ) {
      return;
    }

    if (sheetAutoSyncTimerRef.current !== null) {
      window.clearTimeout(sheetAutoSyncTimerRef.current);
    }
    sheetAutoSyncTimerRef.current = window.setTimeout(() => {
      sheetAutoSyncTimerRef.current = null;
      void handleGoogleSheetSync(true);
    }, 5000);

    return () => {
      if (sheetAutoSyncTimerRef.current !== null) {
        window.clearTimeout(sheetAutoSyncTimerRef.current);
        sheetAutoSyncTimerRef.current = null;
      }
    };
  }, [handleGoogleSheetSync, isGlobalAdmin, snapshot]);

  const handleStatus = (
    passenger: BoardingPassenger,
    status: BoardingStatus,
    noShowReasonSaved = false,
    transitionReason = ''
  ) => {
    const passengerBus = snapshot?.buses.find((bus) => bus.id === passenger.busId);
    if (status === 'unchecked' && passengerBus?.departedAt) {
      setError(
        '출발 완료된 호차에서는 탑승자를 미확인 상태로 되돌릴 수 없습니다. 출발 완료를 먼저 취소해주세요.'
      );
      return;
    }
    if (
      passenger.reservationId === noShowReasonPassengerId &&
      status === passenger.boardingStatus
    ) {
      setNoShowReasonPassengerId('');
      return;
    }
    if (
      passenger.reservationId === noShowReasonPassengerId &&
      status !== 'no_show'
    ) {
      setNoShowReasonPassengerId('');
    }
    if (status === 'no_show' && !noShowReasonSaved) {
      setSelectedPassengerId(passenger.reservationId);
      setSavedNotePassengerId('');
      setNoShowReasonPassengerId(passenger.reservationId);
      return;
    }
    if (
      passenger.boardingStatus === 'no_show' &&
      status === 'boarded' &&
      !transitionReason
    ) {
      setBoardingTransitionPassenger(passenger);
      setBoardingTransitionReason('');
      return;
    }
    if (pendingPassengerIdsRef.current.has(passenger.reservationId)) return;

    const previousPassenger = passenger;
    const previousEvent = latestEventByReservationId.get(passenger.reservationId);
    const changedAt = new Date().toISOString();
    const optimisticEvent: BoardingEvent = {
      id: `optimistic:${passenger.reservationId}:${changedAt}`,
      reservationId: passenger.reservationId,
      fromStatus: passenger.boardingStatus,
      toStatus: status,
      actorType: 'boarding_manager',
      createdAt: changedAt,
      note: transitionReason
        ? `boarding_status_changed: ${transitionReason}`
        : 'boarding_status_changed',
    };

    pendingPassengerIdsRef.current.add(passenger.reservationId);
    if (status === 'boarded' && passenger.boardingStatus !== 'boarded') {
      setLocallyBoardedPassengerIds((current) => {
        const next = new Set(current);
        next.add(passenger.reservationId);
        return next;
      });
    } else if (status !== 'boarded') {
      setLocallyBoardedPassengerIds((current) => {
        const next = new Set(current);
        next.delete(passenger.reservationId);
        return next;
      });
    }
    setPendingPassengerIds((current) => {
      const next = new Set(current);
      next.add(passenger.reservationId);
      return next;
    });
    setError('');
    setSnapshot((current) =>
      current
        ? {
            ...current,
            passengers: current.passengers.map((item) =>
              item.reservationId === passenger.reservationId
                ? { ...item, boardingStatus: status, updatedAt: changedAt }
                : item
            ),
            events: [
              optimisticEvent,
              ...current.events.filter(
                (event) => event.reservationId !== passenger.reservationId
              ),
            ],
          }
        : current
    );

    void setBoardingPassengerStatus(passenger, status, transitionReason)
      .then(() => {
        if (status !== 'boarded' || passenger.boardingStatus === 'boarded') return;
        if (boardingFeedbackTimerRef.current !== null) {
          window.clearTimeout(boardingFeedbackTimerRef.current);
        }
        setBoardingFeedback(`${passenger.name}님 탑승 확인 완료`);
        boardingFeedbackTimerRef.current = window.setTimeout(() => {
          boardingFeedbackTimerRef.current = null;
          setBoardingFeedback('');
        }, 2500);
      })
      .catch((actionError) => {
        setLocallyBoardedPassengerIds((current) => {
          const next = new Set(current);
          if (previousPassenger.boardingStatus === 'boarded') {
            next.add(passenger.reservationId);
          } else {
            next.delete(passenger.reservationId);
          }
          return next;
        });
        setSnapshot((current) =>
          current
            ? {
                ...current,
                passengers: current.passengers.map((item) =>
                  item.reservationId === passenger.reservationId
                    ? previousPassenger
                    : item
                ),
                events: [
                  ...(previousEvent ? [previousEvent] : []),
                  ...current.events.filter(
                    (event) => event.reservationId !== passenger.reservationId
                  ),
                ],
              }
            : current
        );
        setError(
          actionError instanceof Error ? actionError.message : '처리하지 못했습니다.'
        );
      })
      .finally(() => {
        pendingPassengerIdsRef.current.delete(passenger.reservationId);
        setPendingPassengerIds((current) => {
          const next = new Set(current);
          next.delete(passenger.reservationId);
          return next;
        });
      });
  };

  const handleBoardingTransition = (event: React.FormEvent) => {
    event.preventDefault();
    const reason = boardingTransitionReason.trim();
    if (!boardingTransitionPassenger || !reason) return;

    handleStatus(boardingTransitionPassenger, 'boarded', false, reason);
    setBoardingTransitionPassenger(null);
    setBoardingTransitionReason('');
  };

  const handleNoteSave = async (passenger: BoardingPassenger) => {
    const note = (noteDrafts[passenger.reservationId] ?? passenger.boardingNote ?? '')
      .trim();
    const shouldConfirmNoShow = passenger.reservationId === noShowReasonPassengerId;

    if (shouldConfirmNoShow && (!note || !isSelectedPassengerNoteChanged)) {
      return;
    }
    if (savingNoteIdsRef.current.has(passenger.reservationId)) return;

    savingNoteIdsRef.current.add(passenger.reservationId);
    setSavingNoteIds((current) => {
      const next = new Set(current);
      next.add(passenger.reservationId);
      return next;
    });
    setError('');

    try {
      await updatePassengerBoardingNote(
        passenger.reservationId,
        passenger.passengerKind,
        note
      );
      const updatedAt = new Date().toISOString();

      setSnapshot((current) =>
        current
          ? {
              ...current,
              passengers: current.passengers.map((item) =>
                item.reservationId === passenger.reservationId
                  ? { ...item, boardingNote: note || null, boardingNoteUpdatedAt: updatedAt }
                  : item
              ),
            }
          : current
      );
      setNoteDrafts((current) => ({
        ...current,
        [passenger.reservationId]: note,
      }));
      setSavedNotePassengerId(passenger.reservationId);
      if (shouldConfirmNoShow) {
        setNoShowReasonPassengerId('');
        handleStatus(
          { ...passenger, boardingNote: note, boardingNoteUpdatedAt: updatedAt },
          'no_show',
          true,
          note
        );
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : '비고를 저장하지 못했습니다.'
      );
    } finally {
      savingNoteIdsRef.current.delete(passenger.reservationId);
      setSavingNoteIds((current) => {
        const next = new Set(current);
        next.delete(passenger.reservationId);
        return next;
      });
    }
  };

  const handleDeparture = () => {
    if (!selectedBus) return;
    const counts = busCountsByLabel.get(selectedBus.label) ?? {
      total: 0,
      boarded: 0,
      unchecked: 0,
      noShow: 0,
    };
    if (counts.unchecked > 0) {
      setError(
        `탑승 미확인 ${counts.unchecked.toLocaleString()}명을 모두 탑승 확인 또는 미탑승 처리한 뒤 출발 완료해주세요.`
      );
      return;
    }

    setDepartureConfirmOpen(true);
  };

  const confirmDeparture = () => {
    if (!selectedBus || selectedBus.departedAt || !selectedBusCounts) return;
    if (selectedBusCounts.unchecked > 0) {
      setDepartureConfirmOpen(false);
      setError(
        `탑승 미확인 ${selectedBusCounts.unchecked.toLocaleString()}명을 모두 탑승 확인 또는 미탑승 처리한 뒤 출발 완료해주세요.`
      );
      return;
    }

    setDepartureConfirmOpen(false);
    void runDepartureAction(`depart:${selectedBus.id}`, () =>
      markBoardingBusDeparted(selectedBus.id)
    );
  };

  const handleCancelDeparture = () => {
    if (!selectedBus?.departedAt) return;
    setDepartureCancelReason('');
    setDepartureCancelOpen(true);
  };

  const confirmCancelDeparture = async (event: React.FormEvent) => {
    event.preventDefault();
    const reason = departureCancelReason.trim();
    if (!selectedBus?.departedAt || !reason) return;

    await runDepartureAction(`cancel-depart:${selectedBus.id}`, async () => {
      const restoredCount = await cancelBoardingBusDeparture(selectedBus.id, reason);
      setMessage(
        `출발 완료를 취소했습니다. 자동 미탑승 ${restoredCount.toLocaleString()}명이 탑승 미확인으로 복구되었습니다.`
      );
      setDepartureCancelOpen(false);
      setDepartureCancelReason('');
    });
  };

  const handleRotateCheckInCode = async () => {
    if (!selectedBus || selectedBus.departedAt || rotatingCodeInFlightRef.current) return;

    if (
      selectedBus.checkInCode &&
      !window.confirm('기존 탑승 코드는 즉시 사용할 수 없게 됩니다. 새 코드로 변경할까요?')
    ) {
      return;
    }

    rotatingCodeInFlightRef.current = true;
    setRotatingCodeBusId(selectedBus.id);
    setError('');
    try {
      await rotateBoardingCheckInCode(selectedBus.id);
      await loadSnapshot(true);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : '탑승 코드를 생성하지 못했습니다.'
      );
    } finally {
      rotatingCodeInFlightRef.current = false;
      setRotatingCodeBusId('');
    }
  };

  const openWalkIn = () => {
    if (selectedBus?.departedAt) {
      setError(
        '출발 완료된 호차는 변경할 수 없습니다. 출발 완료를 먼저 취소해주세요.'
      );
      return;
    }
    setExceptionMode('walk_in');
    setExceptionPassenger(null);
    setExceptionBusId(selectedBus?.id ?? snapshot?.buses[0]?.id ?? '');
    setExceptionSeatNumber('');
    setExceptionName('');
    setExceptionPhone('');
    setExceptionCampus('');
    setExceptionReason('');
  };

  const openMove = (passenger: BoardingPassenger) => {
    const passengerBus = snapshot?.buses.find((bus) => bus.id === passenger.busId);
    if (passengerBus?.departedAt) {
      setError(
        '출발 완료된 호차는 변경할 수 없습니다. 출발 완료를 먼저 취소해주세요.'
      );
      return;
    }
    if (
      selectedPassenger?.reservationId === passenger.reservationId &&
      isSelectedPassengerNoteChanged &&
      !window.confirm('저장하지 않은 현장 전달사항이 있습니다. 호차 이동을 계속할까요?')
    ) {
      return;
    }
    setSelectedPassengerId('');
    setSavedNotePassengerId('');
    setExceptionMode('move');
    setExceptionPassenger(passenger);
    setExceptionBusId(
      moveTargetBuses.find(
        (bus) =>
          bus.id !== passenger.busId &&
          !bus.departedAt &&
          bus.remainingCapacity > 0
      )?.id ?? ''
    );
    setExceptionReason('');
  };

  const closeException = () => {
    if (savingException) return;
    setExceptionMode(null);
    setExceptionPassenger(null);
  };

  const handleExceptionSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (exceptionInFlightRef.current) return;
    const seatNumber = Number(exceptionSeatNumber);

    if (!exceptionBusId) {
      setError('이동할 대상 호차를 선택해주세요.');
      return;
    }
    if (
      exceptionMode === 'walk_in' &&
      (!Number.isInteger(seatNumber) || seatNumber < 1)
    ) {
      setError('올바른 명단 번호를 입력해주세요.');
      return;
    }
    if (!exceptionReason.trim()) {
      setError('현장 예외 처리 사유를 입력해주세요.');
      return;
    }

    exceptionInFlightRef.current = true;
    setSavingException(true);
    setError('');
    setMessage('');
    try {
      if (exceptionMode === 'move' && exceptionPassenger) {
        if (exceptionTargetBus?.canManage) {
          await moveBoardingPassenger(
            exceptionPassenger.reservationId,
            exceptionBusId,
            exceptionReason.trim()
          );
          setMessage('호차 이동을 반영했습니다.');
        } else {
          await requestBoardingPassengerMove(
            exceptionPassenger.reservationId,
            exceptionBusId,
            exceptionReason.trim()
          );
          setMessage('대상 호차 담당자에게 이동 승인 요청을 보냈습니다.');
        }
      } else if (exceptionMode === 'walk_in') {
        if (!exceptionName.trim() || !exceptionPhone.trim()) {
          throw new Error('신규 탑승자의 이름과 연락처를 입력해주세요.');
        }
        await addBoardingWalkIn({
          busId: exceptionBusId,
          seatNumber,
          name: exceptionName.trim(),
          phone: exceptionPhone.trim(),
          campus: exceptionCampus.trim(),
          reason: exceptionReason.trim(),
        });
      }

      await loadSnapshot(true);
      setExceptionMode(null);
      setExceptionPassenger(null);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : '현장 예외 처리를 반영하지 못했습니다.'
      );
    } finally {
      exceptionInFlightRef.current = false;
      setSavingException(false);
    }
  };

  const handleMoveRequestResponse = async (
    requestId: string,
    approve: boolean
  ) => {
    if (moveRequestInFlightRef.current) return;
    const responseReason = approve
      ? ''
      : window.prompt('거절 사유를 입력해주세요.')?.trim() ?? '';
    if (!approve && !responseReason) return;

    moveRequestInFlightRef.current = true;
    setMoveRequestActionId(requestId);
    setError('');
    setMessage('');
    try {
      await respondToBoardingMoveRequest(requestId, approve, responseReason);
      await loadSnapshot(true);
      setMessage(approve ? '호차 이동 요청을 승인하고 이동을 반영했습니다.' : '호차 이동 요청을 거절했습니다.');
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '호차 이동 요청을 처리하지 못했습니다.');
    } finally {
      moveRequestInFlightRef.current = false;
      setMoveRequestActionId('');
    }
  };

  if (loading) {
    return <div className={styles.pageContainer}><AdminHeader /><main className={styles.main}>탑승 현황을 불러오는 중...</main></div>;
  }

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />
      <main className={styles.main}>
        <section className={styles.hero}>
          <div>
            <span>Boarding Control</span>
            <h1>탑승 확인 관리</h1>
            <p>{boardingScopeLabel}의 탑승·탑승 미확인·미탑승 인원을 실시간으로 확인합니다.</p>
          </div>
        </section>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {message && <p className={styles.message} role="status">{message}</p>}

        {!snapshot ? (
          <section className={styles.empty}><Bus size={42} /><h2>확정 배차가 없습니다</h2><p>전체 관리자가 배차를 확정하면 탑승 현황이 표시됩니다.</p></section>
        ) : (
          <>
            <div className={styles.allocationTitle}>
              <div>
                <strong>{snapshot.allocationName}</strong>
                <span>
                  {isGlobalAdmin
                    ? '좌석번호는 명단 확인용이며 실제 지정 좌석이 아닙니다.'
                    : '배정받은 담당 호차만 표시됩니다. 좌석번호는 명단 확인용입니다.'}
                </span>
              </div>
              {isGlobalAdmin && (
                <div className={styles.exportActions}>
                <button
                  type="button"
                  onClick={() => downloadFullBoardingRosterExcel(snapshot)}
                >
                  <FileSpreadsheet size={16} />
                  전체 명단 Excel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      printFullBoardingRosterPdf(snapshot);
                    } catch (exportError) {
                      setError(
                        exportError instanceof Error
                          ? exportError.message
                          : 'PDF 명단을 열지 못했습니다.'
                      );
                    }
                  }}
                >
                  <FileText size={16} />
                  전체 명단 PDF
                </button>
                {boardingRosterGoogleSheetUrl &&
                  boardingRosterGoogleSheetSyncEnabled &&
                  isGlobalAdmin && (
                  <button
                    type="button"
                    onClick={() => void handleGoogleSheetSync()}
                    disabled={sheetSyncing}
                  >
                    <RefreshCw size={16} />
                    {sheetSyncing ? 'Sheet 동기화 중' : 'Google Sheet 동기화'}
                  </button>
                )}
                {boardingRosterGoogleSheetUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        boardingRosterGoogleSheetUrl,
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                  >
                    <ExternalLink size={16} />
                    조회용 Google Sheet
                  </button>
                )}
                {isGlobalAdmin && sheetSyncedAt && (
                  <span className={styles.sheetSyncStatus}>
                    {formatKoreanDateTime(sheetSyncedAt)} 동기화 완료
                  </span>
                )}
                </div>
              )}
            </div>

            <div
              className={`${styles.boardingContent} ${
                !isGlobalAdmin ? styles.boardingContentManager : ''
              }`}
            >
            <section className={styles.overview} aria-label={`${boardingScopeLabel} 탑승 확인 현황`}>
              <div className={styles.overviewHeading}>
                <div>
                  <span>{isGlobalAdmin ? '전체 인원' : '담당 인원'}</span>
                  <strong>{overallCounts.total.toLocaleString()}명</strong>
                </div>
                <span>
                  {isGlobalAdmin ? '출발 차량 / 운영 차량' : '출발 차량 / 담당 호차'}{' '}
                  <strong>
                    {departedBusCount.toLocaleString()}/{snapshot.buses.length.toLocaleString()}대
                  </strong>
                </span>
              </div>
              <div className={styles.overviewProgress} aria-hidden="true">
                <span
                  className={styles.overviewProgressBoarded}
                  style={{ width: `${overallCounts.total ? (overallCounts.boarded / overallCounts.total) * 100 : 0}%` }}
                />
                <span
                  className={styles.overviewProgressUnchecked}
                  style={{ width: `${overallCounts.total ? (overallCounts.unchecked / overallCounts.total) * 100 : 0}%` }}
                />
                <span
                  className={styles.overviewProgressNoShow}
                  style={{ width: `${overallCounts.total ? (overallCounts.noShow / overallCounts.total) * 100 : 0}%` }}
                />
              </div>
              <div className={styles.overviewLegend} role="group" aria-label="탑승 상태 필터">
                {([
                  ['boarded', '탑승 확인', overallCounts.boarded],
                  ['unchecked', '탑승 미확인', overallCounts.unchecked],
                  ['no_show', '미탑승', overallCounts.noShow],
                ] as const).map(([status, label, count]) => (
                  <button
                    key={status}
                    type="button"
                    className={`${styles[`overviewLegend_${status}`]} ${statusFilter === status ? styles.overviewLegendActive : ''}`}
                    onClick={() => setStatusFilter((current) => current === status ? '' : status)}
                    aria-pressed={statusFilter === status}
                  >
                    <span aria-hidden="true" />
                    {label}
                    <strong>{count.toLocaleString()}명</strong>
                  </button>
                ))}
              </div>
            </section>

            {(moveRequestSnapshot?.requests.length ?? 0) > 0 && (
              <section className={styles.moveRequestPanel} aria-label="호차 이동 요청">
                <div className={styles.moveRequestHeading}>
                  <div>
                    <span>호차 이동 요청</span>
                    <strong>
                      승인 대기 {pendingIncomingMoveRequests.length.toLocaleString()}건
                    </strong>
                  </div>
                  <p>대상 호차 담당자가 승인하면 즉시 이동 처리됩니다.</p>
                </div>
                <div className={styles.moveRequestList}>
                  {moveRequestSnapshot?.requests.map((request) => (
                    <article key={request.id} className={styles.moveRequestCard}>
                      <div>
                        <strong>{request.passengerName}</strong>
                        <span>
                          {formatBusLabel(request.sourceBusLabel)} → {formatBusLabel(request.targetBusLabel)}
                        </span>
                        <small>
                          {request.requestedByName || '탑승 관리 간사님'} 요청 · {formatKoreanDateTime(request.requestedAt)}
                        </small>
                        <p>{request.reason}</p>
                        {request.responseReason && <p>처리 사유: {request.responseReason}</p>}
                      </div>
                      <div className={styles.moveRequestActions}>
                        <span className={styles[`moveRequestStatus_${request.status}`]}>
                          {request.status === 'pending' ? '승인 대기' : request.status === 'approved' ? '승인 완료' : '거절됨'}
                        </span>
                        {request.canRespond && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleMoveRequestResponse(request.id, true)}
                              disabled={
                                Boolean(moveRequestActionId) ||
                                moveTargetBuses.some(
                                  (bus) =>
                                    (bus.id === request.sourceBusId ||
                                      bus.id === request.targetBusId) &&
                                    Boolean(bus.departedAt)
                                )
                              }
                            >
                              승인 · 이동 처리
                            </button>
                            <button
                              type="button"
                              className={styles.rejectMoveRequest}
                              onClick={() => void handleMoveRequestResponse(request.id, false)}
                              disabled={Boolean(moveRequestActionId)}
                            >
                              거절
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className={styles.busSelection} aria-label={boardingScopeLabel}>
              <div className={styles.busGrid}>
                {visibleBuses.map((bus) => {
                  const counts = busCountsByLabel.get(bus.label) ?? {
                    total: 0,
                    boarded: 0,
                    unchecked: 0,
                    noShow: 0,
                  };
                  const hasDepartedWithUnchecked =
                    Boolean(bus.departedAt) && counts.unchecked > 0;
                  return (
                    <button
                      key={bus.id}
                      type="button"
                      className={`${styles.busCard} ${selectedBusId === bus.id ? styles.busCardActive : ''} ${counts.noShow ? styles.busCardProblem : ''} ${hasDepartedWithUnchecked ? styles.busCardDepartureWarning : ''}`}
                      onClick={() => {
                        setSelectedBusId(bus.id);
                        setLocallyBoardedPassengerIds(new Set());
                        setSearch('');
                        setCampusFilter('');
                        setStatusFilter('');
                        setSelectedPassengerId('');
                      }}
                      aria-pressed={selectedBusId === bus.id && !isGlobalSearch}
                    >
                      <div>
                        <strong>{formatBusLabel(bus.label)}</strong>
                        <span className={styles.busCardStatus}>
                          {selectedBusId === bus.id && !isGlobalSearch && (
                            <span className={styles.selectedBadge}><CheckCircle2 size={12} /> 선택됨</span>
                          )}
                          {bus.departedAt && <span className={styles.departedBadge}>출발 완료</span>}
                          {hasDepartedWithUnchecked && (
                            <span className={styles.departedUncheckedBadge}>
                              출발 후 미확인 {counts.unchecked}명
                            </span>
                          )}
                        </span>
                      </div>
                      <p>{bus.destination}</p>
                      <div className={styles.busProgressHeader}>
                        <span>탑승 현황</span>
                        <strong>전체 {counts.total.toLocaleString()}명</strong>
                      </div>
                      <div
                        className={styles.busProgress}
                        role="img"
                        aria-label={`${formatBusLabel(bus.label)} 탑승 ${counts.boarded}명, 미확인 ${counts.unchecked}명, 미탑승 ${counts.noShow}명`}
                      >
                        <span
                          className={styles.busProgressBoarded}
                          style={{ width: `${counts.total ? (counts.boarded / counts.total) * 100 : 0}%` }}
                        />
                        <span
                          className={styles.busProgressUnchecked}
                          style={{ width: `${counts.total ? (counts.unchecked / counts.total) * 100 : 0}%` }}
                        />
                        <span
                          className={styles.busProgressNoShow}
                          style={{ width: `${counts.total ? (counts.noShow / counts.total) * 100 : 0}%` }}
                        />
                      </div>
                      <div className={styles.busCounts}>
                        <span className={styles.busCountBoarded}>탑승 {counts.boarded}</span>
                        <span className={styles.busCountUnchecked}>미확인 {counts.unchecked}</span>
                        <span className={styles.busCountNoShow}>미탑승 {counts.noShow}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {visibleBuses.length === 0 && (
                <div className={styles.noBuses}>
                  <Bus size={22} />
                  <strong>담당 호차가 지정되지 않았습니다</strong>
                </div>
              )}
            </section>

            {selectedBus && (
              <section className={styles.roster}>
                <div className={styles.rosterHeader}>
                  <div>
                    <span>{isGlobalSearch ? `${boardingScopeLabel} 검색` : '선택 호차'}</span>
                    <h2>{isGlobalSearch ? `${boardingScopeLabel} 검색 결과` : `${formatBusLabel(selectedBus.label)} 탑승자 명단`}</h2>
                    <p>
                      {isGlobalSearch
                        ? '검색 결과에는 여러 호차의 탑승자가 포함될 수 있습니다.'
                        : `${selectedBus.destination} · ${selectedBus.departureTime} · ${selectedBus.boardingPlace}`}
                    </p>
                  </div>
                  {isGlobalSearch && (
                    <button
                      className={styles.clearSearch}
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setCampusFilter('');
                        setStatusFilter('');
                      }}
                    >
                      <X size={16} /> 검색 종료 · {formatBusLabel(selectedBus.label)} 보기
                    </button>
                  )}
                </div>

                {!isGlobalSearch && (
                  <div className={styles.checkInCodePanel}>
                    <div className={styles.checkInCodeCopy}>
                      <KeyRound size={16} aria-hidden="true" />
                      <strong>탑승 코드</strong>
                    </div>
                    <div className={styles.checkInCodeValue} aria-live="polite">
                      {selectedBus.checkInCode ?? '코드 미생성'}
                    </div>
                    <div className={styles.checkInCodeActions}>
                      {selectedBus.checkInCodeExpiresAt && selectedBus.checkInCode && (
                        <span>
                          {formatKoreanDateTime(selectedBus.checkInCodeExpiresAt)}까지
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleRotateCheckInCode()}
                        disabled={
                          Boolean(rotatingCodeBusId) || Boolean(selectedBus.departedAt)
                        }
                      >
                        <RefreshCw size={15} />
                        {rotatingCodeBusId === selectedBus.id
                          ? '생성 중...'
                          : selectedBus.checkInCode
                            ? '코드 변경'
                            : '탑승 코드 생성'}
                      </button>
                    </div>
                  </div>
                )}

                {isSelectedBusLocked && !isGlobalSearch && (
                  <div className={styles.departureLockNotice} role="status">
                    <CircleAlert size={18} />
                    <div>
                      <strong>출발 완료 후에는 탑승 결과 정정과 전달사항만 수정할 수 있습니다.</strong>
                      <span>미확인 복귀, 호차 이동, 현장 탑승 추가가 필요하면 출발 완료를 먼저 취소해주세요.</span>
                    </div>
                  </div>
                )}

                <div className={styles.filters}>
                  <label>
                    <Search size={16} />
                    <input
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setCampusFilter('');
                      }}
                      placeholder={`${boardingScopeLabel}에서 이름, 연락처, 소속, 호차 검색`}
                      aria-label={`${boardingScopeLabel} 탑승자 검색`}
                      autoComplete="off"
                    />
                    {search && (
                      <button
                        className={styles.inputClear}
                        type="button"
                        onClick={() => setSearch('')}
                        aria-label="검색어 지우기"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </label>
                  <select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
                    <option value="">전체 캠퍼스</option>
                    {campuses.map((campus) => <option key={campus}>{campus}</option>)}
                  </select>
                </div>

                <div className={styles.statusFilters} role="group" aria-label="탑승 상태 필터">
                  <button
                    type="button"
                    className={`${styles.statusFilterAll} ${!statusFilter ? styles.statusFilterActive : ''}`}
                    onClick={() => setStatusFilter('')}
                    aria-pressed={!statusFilter}
                  >
                    전체 {matchingPassengers.length.toLocaleString()}
                  </button>
                  {(['unchecked', 'boarded', 'no_show'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`${styles[`statusFilter_${status}`]} ${statusFilter === status ? styles.statusFilterActive : ''}`}
                      onClick={() => setStatusFilter((current) => current === status ? '' : status)}
                      aria-pressed={statusFilter === status}
                    >
                      {statusLabels[status]} {visibleCounts[status].toLocaleString()}
                    </button>
                  ))}
                </div>

                <div className={styles.passengerList}>
                  {selectedPassengers.length === 0 ? (
                    <div className={styles.noResults}>
                      <Search size={24} />
                      <strong>검색 결과가 없습니다</strong>
                      <span>검색어, 캠퍼스 또는 상태 필터를 변경해주세요.</span>
                    </div>
                  ) : selectedPassengers.map((passenger) => {
                    const isPassengerPending = pendingPassengerIds.has(
                      passenger.reservationId
                    );
                    return (
                      <article key={passenger.reservationId} className={`${styles.passenger} ${styles[`status_${passenger.boardingStatus}`]}`}>
                        <div className={styles.passengerMain}>
                          <strong className={styles.passengerName} title={passenger.name}>
                            {passenger.name}
                          </strong>
                          <span className={styles.passengerCampus} title={passenger.campus}>
                            {passenger.campus}
                          </span>
                          {passenger.passengerKind === 'walk_in' && (
                            <span className={styles.walkInBadge}>현장 추가</span>
                          )}
                          <span className={styles.statusBadge}>{statusLabels[passenger.boardingStatus]}</span>
                        </div>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={`${styles.boardingCheck} ${
                              passenger.boardingStatus === 'boarded'
                                ? styles.boardingCheckActive
                                : ''
                            }`}
                            onClick={() => handleStatus(passenger, 'boarded')}
                            disabled={
                              isPassengerPending ||
                              passenger.boardingStatus === 'boarded'
                            }
                            aria-label={`${passenger.name} 탑승 확인`}
                          >
                            <CheckCircle2 size={15} />
                            {passenger.boardingStatus === 'boarded'
                              ? '탑승 확인됨'
                              : '탑승 확인'}
                          </button>
                        </div>
                        <button
                          type="button"
                          className={styles.detailButton}
                          onClick={() => {
                            setSelectedPassengerId(passenger.reservationId);
                            setSavedNotePassengerId('');
                            setNoShowReasonPassengerId('');
                          }}
                          aria-haspopup="dialog"
                        >
                          <UserRound size={14} />
                          <span>{passenger.boardingNote ? '상세 · 전달사항 있음' : '상세 보기'}</span>
                          {passenger.boardingNote && <small>{passenger.boardingNote}</small>}
                        </button>
                      </article>
                    );
                  })}
                </div>

                {!isGlobalSearch && (
                  <div className={styles.fieldExceptionActions}>
                    <div>
                      <strong>현장 예외 처리</strong>
                      <span>명단에 없는 신규 탑승자를 기록한 뒤 출발 전 최종 확인을 진행합니다.</span>
                    </div>
                    <button
                      type="button"
                      onClick={openWalkIn}
                      disabled={isSelectedBusLocked}
                    >
                      <UserPlus size={15} /> 현장 탑승 추가
                    </button>
                  </div>
                )}

                {!isGlobalSearch && (
                  <div className={styles.departureFooter}>
                    <div>
                      <strong>{selectedBus.departedAt ? '출발 완료 처리됨' : '명단 확인을 마쳤나요?'}</strong>
                      <span>
                        {selectedBus.departedAt
                          ? `${formatKoreanDateTime(selectedBus.departedAt)} 출발 완료`
                          : `남은 탑승 미확인 ${(
                              busCountsByLabel.get(selectedBus.label)?.unchecked ?? 0
                            ).toLocaleString()}명 · 모두 처리해야 출발 완료할 수 있습니다.`}
                      </span>
                    </div>
                    {selectedBus.departedAt ? (
                      <button className={styles.cancelDeparture} type="button" onClick={handleCancelDeparture} disabled={Boolean(departureActionKey)}>
                        출발 완료 취소
                      </button>
                    ) : (
                      <button
                        className={styles.departure}
                        type="button"
                        onClick={handleDeparture}
                        disabled={
                          Boolean(departureActionKey) ||
                          (busCountsByLabel.get(selectedBus.label)?.unchecked ?? 0) > 0
                        }
                        title={
                          (busCountsByLabel.get(selectedBus.label)?.unchecked ?? 0) > 0
                            ? '탑승 미확인 인원을 모두 처리한 뒤 출발 완료할 수 있습니다.'
                            : undefined
                        }
                      >
                        모든 탑승 상태 확인 · 출발 완료
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
            </div>
          </>
        )}
      </main>
      {boardingFeedback && (
        <div className={styles.boardingFeedback} role="status">
          <CheckCircle2 size={18} />
          {boardingFeedback}
        </div>
      )}
      {selectedPassenger && (
        <div
          className={styles.detailBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePassengerDetails();
          }}
        >
          <aside
            className={styles.detailPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="boarding-passenger-detail-title"
          >
            <header className={styles.detailHeader}>
              <div>
                <span>탑승자 상세</span>
                <h2 id="boarding-passenger-detail-title">{selectedPassenger.name}</h2>
                <p>{selectedPassenger.campus} · {selectedPassenger.district} · {selectedPassenger.team}</p>
              </div>
              <button type="button" onClick={closePassengerDetails} aria-label="상세보기 닫기">
                <X size={20} />
              </button>
            </header>

            <section className={styles.detailStatusSection} aria-label="탑승 상태">
              <div>
                <span>현재 상태</span>
                <strong className={`${styles.detailStatus} ${styles[`detailStatus_${selectedPassenger.boardingStatus}`]}`}>
                  {statusLabels[selectedPassenger.boardingStatus]}
                </strong>
              </div>
              <div className={styles.detailActions}>
                <button type="button" className={`${styles.boardButton} ${selectedPassengerActionStatus === 'boarded' ? styles.detailActionSelected : ''}`} aria-pressed={selectedPassengerActionStatus === 'boarded'} onClick={() => handleStatus(selectedPassenger, 'boarded')} disabled={pendingPassengerIds.has(selectedPassenger.reservationId) || selectedPassengerActionStatus === 'boarded'}><CheckCircle2 size={16} />탑승</button>
                <button type="button" className={`${styles.noShowButton} ${selectedPassengerActionStatus === 'no_show' ? styles.detailActionSelected : ''}`} aria-pressed={selectedPassengerActionStatus === 'no_show'} title="미탑승 사유를 작성한 뒤 저장하면 처리됩니다." onClick={() => handleStatus(selectedPassenger, 'no_show')} disabled={pendingPassengerIds.has(selectedPassenger.reservationId) || selectedPassengerActionStatus === 'no_show'}><UserX size={16} />미탑승</button>
                <button
                  type="button"
                  className={`${styles.resetButton} ${selectedPassengerActionStatus === 'unchecked' ? styles.detailActionSelected : ''}`}
                  aria-pressed={selectedPassengerActionStatus === 'unchecked'}
                  title={
                    isSelectedPassengerBusDeparted
                      ? '출발 완료를 취소한 뒤 미확인 상태로 변경할 수 있습니다.'
                      : undefined
                  }
                  onClick={() => handleStatus(selectedPassenger, 'unchecked')}
                  disabled={
                    pendingPassengerIds.has(selectedPassenger.reservationId) ||
                    selectedPassengerActionStatus === 'unchecked' ||
                    isSelectedPassengerBusDeparted
                  }
                >
                  <CircleHelp size={16} />미확인
                </button>
              </div>
            </section>

            <dl className={styles.detailFacts}>
              <div><dt>호차</dt><dd>{formatBusLabel(selectedPassenger.busNumber)}</dd></div>
              <div><dt>캠퍼스</dt><dd>{selectedPassenger.campus || '-'}</dd></div>
              <div><dt>지구 · 팀</dt><dd>{[selectedPassenger.district, selectedPassenger.team].filter(Boolean).join(' · ') || '-'}</dd></div>
              <div><dt>구분</dt><dd>{selectedPassenger.passengerKind === 'walk_in' ? '현장 추가 탑승자' : '기존 신청자'}</dd></div>
            </dl>

            <section className={styles.preferenceSection}>
              <div className={styles.preferenceHeading}>
                <h3>귀가역 지망 정보</h3>
                <span>
                  실제 배정 · {selectedPassenger.assignedDestination || '미확인'}
                  {selectedPassengerPreferenceRank > 0
                    ? ` (${selectedPassengerPreferenceRank}지망)`
                    : ''}
                </span>
              </div>
              {selectedPassenger.passengerKind === 'walk_in' ? (
                <p>현장 추가 탑승자는 신청 지망 정보가 없습니다.</p>
              ) : (
                <ol className={styles.preferenceList}>
                  {[0, 1].map((index) => {
                    const preference = selectedPassengerPreferences[index];
                    const isAssigned =
                      Boolean(preference) &&
                      preference === selectedPassenger.assignedDestination;
                    return (
                      <li
                        key={index}
                        className={isAssigned ? styles.preferenceAssigned : undefined}
                      >
                        <span>{index + 1}지망</span>
                        <strong>{preference || '정보 없음'}</strong>
                        {isAssigned && <small>배정됨</small>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {selectedPassenger.passengerKind !== 'walk_in' && (
              <button
                type="button"
                className={styles.movePassengerButton}
                onClick={() => openMove(selectedPassenger)}
                disabled={isSelectedPassengerBusDeparted}
              >
                <ArrowRightLeft size={16} />
                다른 호차로 이동
              </button>
            )}

            <a className={styles.phoneButton} href={`tel:${selectedPassenger.phone}`}>
              <Phone size={17} />
              {selectedPassenger.phone} 전화하기
            </a>

            <section className={styles.detailRecord}>
              <h3>최근 처리 기록</h3>
              {selectedPassenger.fieldExceptionReason && (
                <p className={styles.exceptionReasonText}>
                  현장 추가 사유: {selectedPassenger.fieldExceptionReason}
                </p>
              )}
              {selectedPassengerEvent ? (
                <div className={`${styles.changeSummary} ${styles[`change_${getChangeActorType(selectedPassengerEvent)}`]}`}>
                  <strong>{getChangeActorLabel(selectedPassengerEvent)}</strong>
                  <span>
                    {statusLabels[selectedPassengerEvent.fromStatus]} → {statusLabels[selectedPassengerEvent.toStatus]}
                    {' · '}
                    {formatKoreanDateTime(selectedPassengerEvent.createdAt)}
                  </span>
                  {getStatusChangeReason(selectedPassengerEvent) && (
                    <p className={styles.statusChangeReason}>
                      전환 사유: {getStatusChangeReason(selectedPassengerEvent)}
                    </p>
                  )}
                </div>
              ) : selectedPassenger.updatedAt ? (
                <div className={`${styles.changeSummary} ${styles.change_unknown}`}>
                  <strong>기존 처리 기록</strong>
                  <span>{formatKoreanDateTime(selectedPassenger.updatedAt)}</span>
                </div>
              ) : (
                <p>아직 처리 기록이 없습니다.</p>
              )}
            </section>

            <form
              className={`${styles.detailNoteEditor} ${
                isWritingNoShowReason ? styles.noShowReasonEditor : ''
              }`}
              onSubmit={(event) => {
                event.preventDefault();
                void handleNoteSave(selectedPassenger);
              }}
            >
              {isWritingNoShowReason && (
                <div className={styles.noShowReasonNotice} role="status">
                  <UserX size={17} />
                  <div>
                    <strong>미탑승 사유를 작성해주세요.</strong>
                    <span>사유를 새로 작성하거나 기존 전달사항을 수정해야 미탑승 처리됩니다.</span>
                  </div>
                </div>
              )}
              <div className={styles.detailNoteHeading}>
                <label htmlFor={`boarding-note-${selectedPassenger.reservationId}`}>
                  {isWritingNoShowReason ? '미탑승 사유 (필수)' : '현장 전달사항'}
                </label>
                {selectedPassenger.boardingNoteUpdatedAt && (
                  <span>
                    {selectedPassenger.boardingNoteUpdatedByName
                      ? `${selectedPassenger.boardingNoteUpdatedByName} · `
                      : ''}
                    {formatKoreanDateTime(selectedPassenger.boardingNoteUpdatedAt)} 수정
                  </span>
                )}
              </div>
              <textarea
                ref={noteTextareaRef}
                id={`boarding-note-${selectedPassenger.reservationId}`}
                value={selectedPassengerNoteDraft}
                maxLength={500}
                rows={5}
                required={isWritingNoShowReason}
                aria-required={isWritingNoShowReason}
                placeholder={
                  isWritingNoShowReason
                    ? '연락 결과 등 미탑승 사유를 입력하세요'
                    : '현장에서 함께 확인할 전달사항을 입력하세요'
                }
                onChange={(event) => {
                  setSavedNotePassengerId('');
                  setNoteDrafts((current) => ({
                    ...current,
                    [selectedPassenger.reservationId]: event.target.value,
                  }));
                }}
              />
              <div className={styles.noteSaveRow}>
                <span aria-live="polite">
                  {savedNotePassengerId === selectedPassenger.reservationId
                    ? isWritingNoShowReason
                      ? '미탑승 사유를 저장했습니다.'
                      : '전달사항을 저장했습니다.'
                    : isWritingNoShowReason && !selectedPassengerNoteDraft.trim()
                      ? '미탑승 사유를 반드시 입력해야 합니다.'
                      : isWritingNoShowReason && !isSelectedPassengerNoteChanged
                        ? '미탑승 처리를 위해 사유를 새로 작성하거나 수정해주세요.'
                    : isSelectedPassengerNoteChanged
                      ? '저장하지 않은 변경사항이 있습니다.'
                      : ''}
                </span>
                <button
                  type="submit"
                  disabled={
                    savingNoteIds.has(selectedPassenger.reservationId) ||
                    (isWritingNoShowReason
                      ? !canConfirmNoShow
                      : !isSelectedPassengerNoteChanged)
                  }
                >
                  <Save size={15} />
                  {savingNoteIds.has(selectedPassenger.reservationId)
                    ? '저장 중'
                    : isWritingNoShowReason
                      ? '사유 저장 · 미탑승 처리'
                      : '저장'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
      {exceptionMode && snapshot && (
        <div className={styles.exceptionBackdrop} onMouseDown={closeException}>
          <section
            className={styles.exceptionModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="boarding-exception-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>현장 예외 처리</span>
                <h2 id="boarding-exception-title">
                  {exceptionMode === 'move'
                    ? `${exceptionPassenger?.name ?? '탑승자'} 호차 이동`
                    : '신청 없는 신규 탑승자 추가'}
                </h2>
              </div>
              <button type="button" onClick={closeException} aria-label="닫기">
                <X size={18} />
              </button>
            </header>
            <form onSubmit={(event) => void handleExceptionSubmit(event)}>
              {exceptionMode === 'walk_in' && (
                <>
                  <label>
                    <span>이름</span>
                    <input value={exceptionName} onChange={(event) => setExceptionName(event.target.value)} required />
                  </label>
                  <label>
                    <span>연락처</span>
                    <input value={exceptionPhone} onChange={(event) => setExceptionPhone(event.target.value)} placeholder="010-1234-5678" required />
                  </label>
                  <label>
                    <span>소속</span>
                    <input value={exceptionCampus} onChange={(event) => setExceptionCampus(event.target.value)} placeholder="캠퍼스 또는 소속" />
                  </label>
                </>
              )}
              <label>
                <span>대상 호차</span>
                <select value={exceptionBusId} onChange={(event) => setExceptionBusId(event.target.value)} required>
                  <option value="">호차 선택</option>
                  {(exceptionMode === 'move' ? moveTargetBuses : moveTargetBuses.filter((bus) => bus.canManage)).map((bus) => {
                    const remaining = bus.remainingCapacity;
                    const isCurrentBus =
                      exceptionMode === 'move' && bus.id === exceptionPassenger?.busId;
                    return (
                      <option
                        key={bus.id}
                        value={bus.id}
                        disabled={Boolean(bus.departedAt) || remaining === 0 || isCurrentBus}
                      >
                        {formatBusLabel(bus.label)} · {bus.destination} · 잔여 {remaining}명
                        {isCurrentBus ? ' · 현재 호차' : bus.departedAt ? ' · 출발 완료' : remaining === 0 ? ' · 정원 마감' : !bus.canManage ? ' · 승인 필요' : ''}
                      </option>
                    );
                  })}
                </select>
              </label>
              {exceptionMode === 'move' ? (
                <div className={styles.targetBusCapacity} aria-live="polite">
                  <span>대상 호차 잔여 인원</span>
                  <strong>
                    {exceptionTargetBus
                      ? `${exceptionTargetRemaining.toLocaleString()}명`
                      : '호차를 선택해주세요'}
                  </strong>
                  <small>이동 시 비어 있는 명단 번호가 자동으로 배정됩니다.</small>
                </div>
              ) : (
                <label>
                  <span>명단 번호</span>
                  <input type="number" min={1} value={exceptionSeatNumber} onChange={(event) => setExceptionSeatNumber(event.target.value)} required />
                </label>
              )}
              <label className={styles.exceptionReason}>
                <span>처리 사유</span>
                <textarea value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} rows={3} placeholder="예: 현장 책임자 승인으로 잔여 자리 이동" required />
              </label>
              <p>
                {exceptionMode === 'move'
                  ? exceptionTargetBus && !exceptionTargetBus.canManage
                    ? '미담당 호차이므로 대상 호차 담당자에게 승인 요청을 보냅니다.'
                    : '출발 완료 또는 정원이 찬 호차로는 이동할 수 없습니다.'
                  : '출발 완료 호차에는 추가할 수 없으며, 정원과 명단 번호 중복을 서버에서 확인합니다.'}
              </p>
              <footer>
                <button type="button" onClick={closeException}>취소</button>
                <button type="submit" disabled={savingException}>
                  {savingException
                    ? '반영 중...'
                    : exceptionMode === 'move'
                      ? exceptionTargetBus && !exceptionTargetBus.canManage
                        ? '이동 승인 요청'
                        : '호차 이동 반영'
                      : '현장 탑승 추가'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {boardingTransitionPassenger && (
        <div
          className={styles.exceptionBackdrop}
          onMouseDown={() => setBoardingTransitionPassenger(null)}
        >
          <section
            className={styles.exceptionModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="boarding-transition-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>상태 변경 확인</span>
                <h2 id="boarding-transition-title">
                  {boardingTransitionPassenger.name}님 탑승 전환
                </h2>
              </div>
              <button type="button" onClick={() => setBoardingTransitionPassenger(null)} aria-label="닫기">
                <X size={18} />
              </button>
            </header>
            <form onSubmit={handleBoardingTransition}>
              <div className={styles.previousNoShowReason}>
                <span>기존 미탑승 사유</span>
                <strong>{boardingTransitionPassenger.boardingNote || '기록 없음'}</strong>
                <small>기존 사유는 수정하거나 삭제하지 않고 보존됩니다.</small>
              </div>
              <label className={styles.exceptionReason}>
                <span>탑승 전환 사유 (필수)</span>
                <textarea
                  value={boardingTransitionReason}
                  onChange={(event) => setBoardingTransitionReason(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="예: 지각 도착 후 현장에서 탑승 확인"
                  required
                  autoFocus
                />
              </label>
              <footer>
                <button type="button" onClick={() => setBoardingTransitionPassenger(null)}>취소</button>
                <button
                  type="submit"
                  disabled={
                    !boardingTransitionReason.trim() ||
                    Boolean(
                      snapshot?.buses.find(
                        (bus) => bus.id === boardingTransitionPassenger.busId
                      )?.departedAt
                    )
                  }
                >
                  사유 기록 · 탑승 처리
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {departureConfirmOpen && selectedBus && !selectedBus.departedAt && selectedBusCounts && (
        <div
          className={styles.exceptionBackdrop}
          onMouseDown={() => {
            if (!departureActionKey) setDepartureConfirmOpen(false);
          }}
        >
          <section
            className={styles.exceptionModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="departure-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>출발 완료 최종 확인</span>
                <h2 id="departure-confirm-title">
                  {formatBusLabel(selectedBus.label)} 출발 완료를 선언할까요?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDepartureConfirmOpen(false)}
                disabled={Boolean(departureActionKey)}
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </header>
            <div className={styles.departureConfirmBody}>
              <p>아래 최종 탑승 현황을 확인한 뒤 출발 완료해주세요.</p>
              <div className={styles.departureConfirmCounts}>
                <div>
                  <span>탑승 확인</span>
                  <strong>{selectedBusCounts.boarded.toLocaleString()}명</strong>
                </div>
                <div>
                  <span>미탑승</span>
                  <strong>{selectedBusCounts.noShow.toLocaleString()}명</strong>
                </div>
                <div>
                  <span>전체</span>
                  <strong>{selectedBusCounts.total.toLocaleString()}명</strong>
                </div>
              </div>
              <small>출발 완료 후에는 탑승 결과 정정과 전달사항만 수정할 수 있습니다.</small>
            </div>
            <footer>
              <button
                type="button"
                onClick={() => setDepartureConfirmOpen(false)}
                disabled={Boolean(departureActionKey)}
              >
                다시 확인
              </button>
              <button
                type="button"
                className={styles.confirmDeparture}
                onClick={confirmDeparture}
                disabled={Boolean(departureActionKey)}
              >
                {departureActionKey ? '출발 완료 처리 중...' : '현황 확인 · 출발 완료'}
              </button>
            </footer>
          </section>
        </div>
      )}
      {departureCancelOpen && selectedBus?.departedAt && (
        <div
          className={styles.exceptionBackdrop}
          onMouseDown={() => {
            if (!departureActionKey) setDepartureCancelOpen(false);
          }}
        >
          <section
            className={styles.exceptionModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="departure-cancel-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>출발 완료 취소</span>
                <h2 id="departure-cancel-title">
                  {formatBusLabel(selectedBus.label)} 잠금을 해제할까요?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDepartureCancelOpen(false)}
                disabled={Boolean(departureActionKey)}
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </header>
            <form onSubmit={(event) => void confirmCancelDeparture(event)}>
              <div className={styles.previousNoShowReason}>
                <span>취소 영향</span>
                <strong>
                  자동 미탑승 {departureCancellationRestoreCount.toLocaleString()}명 복구
                </strong>
                <small>
                  호차가 다시 편집 가능해지고 복구 대상은 탑승 미확인 상태로 돌아갑니다.
                </small>
              </div>
              <label className={styles.exceptionReason}>
                <span>출발 완료 취소 사유 (필수)</span>
                <textarea
                  value={departureCancelReason}
                  onChange={(event) => setDepartureCancelReason(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="예: 실제 차량이 아직 출발하지 않아 명단을 다시 확인"
                  required
                  autoFocus
                />
              </label>
              <footer>
                <button
                  type="button"
                  onClick={() => setDepartureCancelOpen(false)}
                  disabled={Boolean(departureActionKey)}
                >
                  잠금 유지
                </button>
                <button
                  type="submit"
                  disabled={
                    Boolean(departureActionKey) || !departureCancelReason.trim()
                  }
                >
                  {departureActionKey ? '취소 처리 중...' : '사유 기록 · 출발 완료 취소'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminBoardingPage;
