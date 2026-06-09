import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bus,
  CheckCircle2,
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
  markBoardingBusDeparted,
  moveBoardingPassenger,
  rotateBoardingCheckInCode,
  setBoardingPassengerStatus,
  syncBoardingRosterGoogleSheet,
  updatePassengerBoardingNote,
  type BoardingEvent,
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
  boarded: 1,
  no_show: 2,
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
  const [syncing, setSyncing] = useState(false);
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [sheetSyncedAt, setSheetSyncedAt] = useState('');
  const [error, setError] = useState('');
  const [selectedBusId, setSelectedBusId] = useState('');
  const [busSearch, setBusSearch] = useState('');
  const [uncheckedBusesOnly, setUncheckedBusesOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [campusFilter, setCampusFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<BoardingStatus | ''>('');
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
  const realtimeSyncTimerRef = useRef<number | null>(null);
  const sheetAutoSyncTimerRef = useRef<number | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const loadSnapshot = useCallback(async (quiet = false, indicateSync = quiet) => {
    if (!quiet) setLoading(true);
    else if (indicateSync) setSyncing(true);
    try {
      const next = await getBoardingManagementSnapshot();
      setSnapshot(next);
      setError('');
      setSelectedBusId((current) =>
        current && next?.buses.some((bus) => bus.id === current)
          ? current
          : next?.buses[0]?.id ?? ''
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : '탑승 현황을 불러오지 못했습니다.'
      );
    } finally {
      setLoading(false);
      if (indicateSync) setSyncing(false);
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
        void loadSnapshot(true, false);
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
  const normalizedSearch = search.trim().toLocaleLowerCase('ko');
  const isGlobalSearch = Boolean(normalizedSearch);
  const busesByLabel = useMemo(
    () => new Map(snapshot?.buses.map((bus) => [bus.label, bus]) ?? []),
    [snapshot?.buses]
  );
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
          a.busNumber.localeCompare(b.busNumber, 'ko', { numeric: true }) ||
          a.seatNumber.localeCompare(b.seatNumber, 'ko', { numeric: true }) ||
          statusSortOrder[a.boardingStatus] - statusSortOrder[b.boardingStatus] ||
          a.name.localeCompare(b.name, 'ko')
      );
  }, [
    campusFilter,
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
  const visibleBuses = useMemo(() => {
    const normalizedBusSearch = busSearch.trim().toLocaleLowerCase('ko');

    return [...(snapshot?.buses ?? [])]
      .filter((bus) => {
        const counts = busCountsByLabel.get(bus.label);
        if (uncheckedBusesOnly && !counts?.unchecked) return false;
        return (
          !normalizedBusSearch ||
          [formatBusLabel(bus.label), bus.label, bus.destination].some((value) =>
            value.toLocaleLowerCase('ko').includes(normalizedBusSearch)
          )
        );
      })
      .sort((a, b) =>
        formatBusLabel(a.label).localeCompare(formatBusLabel(b.label), 'ko', {
          numeric: true,
        })
      );
  }, [busCountsByLabel, busSearch, uncheckedBusesOnly, snapshot?.buses]);
  const exceptionTargetBus = snapshot?.buses.find((bus) => bus.id === exceptionBusId);
  const exceptionTargetRemaining = exceptionTargetBus
    ? getBusRemainingCapacity(exceptionTargetBus)
    : 0;

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
  const canConfirmNoShow =
    isWritingNoShowReason &&
    isSelectedPassengerNoteChanged &&
    Boolean(selectedPassengerNoteDraft.trim());

  const closePassengerDetails = () => {
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (
        selectedPassenger &&
        isSelectedPassengerNoteChanged &&
        !window.confirm('저장하지 않은 현장 전달사항이 있습니다. 상세보기를 닫을까요?')
      ) {
        return;
      }
      setSelectedPassengerId('');
      setSavedNotePassengerId('');
      setNoShowReasonPassengerId('');
    };

    document.body.classList.add(styles.detailPanelOpen);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove(styles.detailPanelOpen);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPassengerId, isSelectedPassengerNoteChanged, selectedPassenger]);

  useEffect(() => {
    if (!isWritingNoShowReason) return;

    noteTextareaRef.current?.focus();
  }, [isWritingNoShowReason]);

  const runDepartureAction = async (key: string, action: () => Promise<void>) => {
    setDepartureActionKey(key);
    setError('');
    try {
      await action();
      await loadSnapshot(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '처리하지 못했습니다.');
    } finally {
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
      .catch((actionError) => {
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

    if (
      !window.confirm(
        `${formatBusLabel(selectedBus.label)} 출발 완료를 선언할까요?\n남은 탑승 미확인 ${counts.unchecked}명은 미탑승 처리됩니다.`
      )
    ) {
      return;
    }

    void runDepartureAction(`depart:${selectedBus.id}`, () =>
      markBoardingBusDeparted(selectedBus.id)
    );
  };

  const handleCancelDeparture = () => {
    if (!selectedBus) return;
    if (
      !window.confirm(
        `${formatBusLabel(selectedBus.label)} 출발 완료를 취소할까요?\n일괄 미탑승 처리된 탑승자는 탑승 미확인으로 복구됩니다.`
      )
    ) {
      return;
    }

    void runDepartureAction(`cancel-depart:${selectedBus.id}`, () =>
      cancelBoardingBusDeparture(selectedBus.id)
    );
  };

  const handleRotateCheckInCode = async () => {
    if (!selectedBus || selectedBus.departedAt) return;

    if (
      selectedBus.checkInCode &&
      !window.confirm('기존 탑승 코드는 즉시 사용할 수 없게 됩니다. 새 코드로 변경할까요?')
    ) {
      return;
    }

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
      setRotatingCodeBusId('');
    }
  };

  const openWalkIn = () => {
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
      snapshot?.buses.find(
        (bus) =>
          bus.id !== passenger.busId &&
          !bus.departedAt &&
          getBusRemainingCapacity(bus) > 0
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

    setSavingException(true);
    setError('');
    try {
      if (exceptionMode === 'move' && exceptionPassenger) {
        await moveBoardingPassenger(
          exceptionPassenger.reservationId,
          exceptionBusId,
          exceptionReason.trim()
        );
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
      setSavingException(false);
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
          <button type="button" onClick={() => void loadSnapshot(true)} disabled={syncing}>
            <RefreshCw size={16} /> {syncing ? '동기화 중' : '새로고침'}
          </button>
        </section>

        {error && <p className={styles.error} role="alert">{error}</p>}

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

            <div className={styles.busToolbar}>
              <label>
                <Search size={16} />
                <input
                  value={busSearch}
                  onChange={(event) => setBusSearch(event.target.value)}
                  placeholder={`${boardingScopeLabel} 또는 행선지 검색`}
                  aria-label={`${boardingScopeLabel} 또는 행선지 검색`}
                  autoComplete="off"
                />
                {busSearch && (
                  <button type="button" onClick={() => setBusSearch('')} aria-label="차량 검색어 지우기">
                    <X size={15} />
                  </button>
                )}
              </label>
              <button
                type="button"
                className={uncheckedBusesOnly ? styles.problemFilterActive : undefined}
                onClick={() => setUncheckedBusesOnly((current) => !current)}
                aria-pressed={uncheckedBusesOnly}
              >
                <CircleHelp size={16} /> 탑승 미확인 인원 남은 차량만
              </button>
              <span>{visibleBuses.length.toLocaleString()}대 표시</span>
            </div>

            <section className={styles.busGrid}>
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
            </section>
            {visibleBuses.length === 0 && (
              <div className={styles.noBuses}>
                <Search size={22} />
                <strong>
                  {snapshot.buses.length === 0
                    ? '담당 호차가 지정되지 않았습니다'
                    : '조건에 맞는 차량이 없습니다'}
                </strong>
                {snapshot.buses.length > 0 && (
                  <button type="button" onClick={() => { setBusSearch(''); setUncheckedBusesOnly(false); }}>
                    필터 초기화
                  </button>
                )}
              </div>
            )}

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
                  <div className={styles.fieldExceptionActions}>
                    <div>
                      <strong>현장 예외 처리</strong>
                      <span>담당 호차 범위에서 갑작스러운 호차 이동 또는 신규 탑승자를 기록합니다.</span>
                    </div>
                    <button type="button" onClick={openWalkIn}>
                      <UserPlus size={15} /> 현장 탑승 추가
                    </button>
                  </div>
                )}

                {!isGlobalSearch && (
                  <div className={styles.checkInCodePanel}>
                    <div className={styles.checkInCodeCopy}>
                      <KeyRound size={22} aria-hidden="true" />
                      <div>
                        <strong>탑승자 탑승 코드</strong>
                        <span>버스에 탑승한 탑승자에게 이 4자리 코드를 안내하세요.</span>
                      </div>
                    </div>
                    <div className={styles.checkInCodeValue} aria-live="polite">
                      {selectedBus.checkInCode ?? '코드 미생성'}
                    </div>
                    <div className={styles.checkInCodeActions}>
                      {selectedBus.checkInCodeExpiresAt && selectedBus.checkInCode && (
                        <span>
                          {formatKoreanDateTime(selectedBus.checkInCodeExpiresAt)}까지 유효
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
                  <strong className={styles.resultCount}>
                    {selectedPassengers.length.toLocaleString()}명
                  </strong>
                </div>

                <div className={styles.statusFilters} role="group" aria-label="탑승 상태 필터">
                  <button
                    type="button"
                    className={!statusFilter ? styles.statusFilterActive : undefined}
                    onClick={() => setStatusFilter('')}
                    aria-pressed={!statusFilter}
                  >
                    전체 {matchingPassengers.length.toLocaleString()}
                  </button>
                  {(['unchecked', 'boarded', 'no_show'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={statusFilter === status ? styles.statusFilterActive : undefined}
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
                        <div className={styles.passengerSeat}>
                          <span>명단 번호</span>
                          <strong>{passenger.seatNumber || '-'}</strong>
                        </div>
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
                          <button type="button" className={styles.boardButton} onClick={() => handleStatus(passenger, 'boarded')} disabled={isPassengerPending || passenger.boardingStatus === 'boarded'} aria-label={`${passenger.name} 탑승 확인`}><CheckCircle2 size={14} />탑승</button>
                          <button type="button" className={styles.noShowButton} title="미탑승 사유를 작성한 뒤 처리합니다." onClick={() => handleStatus(passenger, 'no_show')} disabled={isPassengerPending || passenger.boardingStatus === 'no_show'} aria-label={`${passenger.name} 미탑승 처리`}><UserX size={14} />미탑승</button>
                          <button type="button" className={styles.resetButton} onClick={() => handleStatus(passenger, 'unchecked')} disabled={isPassengerPending || passenger.boardingStatus === 'unchecked'} aria-label={`${passenger.name} 탑승 미확인으로 변경`}><CircleHelp size={14} />미확인</button>
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
                  <div className={styles.departureFooter}>
                    <div>
                      <strong>{selectedBus.departedAt ? '출발 완료 처리됨' : '명단 확인을 마쳤나요?'}</strong>
                      <span>
                        {selectedBus.departedAt
                          ? `${formatKoreanDateTime(selectedBus.departedAt)} 출발 완료`
                          : `남은 탑승 미확인 ${(
                              busCountsByLabel.get(selectedBus.label)?.unchecked ?? 0
                            ).toLocaleString()}명이 미탑승 처리됩니다.`}
                      </span>
                    </div>
                    {selectedBus.departedAt ? (
                      <button className={styles.cancelDeparture} type="button" onClick={handleCancelDeparture} disabled={Boolean(departureActionKey)}>
                        출발 완료 취소
                      </button>
                    ) : (
                      <button className={styles.departure} type="button" onClick={handleDeparture} disabled={Boolean(departureActionKey)}>
                        남은 미확인 전원 미탑승 처리 · 출발 완료
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
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
                <button type="button" className={styles.boardButton} onClick={() => handleStatus(selectedPassenger, 'boarded')} disabled={pendingPassengerIds.has(selectedPassenger.reservationId) || selectedPassenger.boardingStatus === 'boarded'}><CheckCircle2 size={16} />탑승</button>
                <button type="button" className={styles.noShowButton} title="미탑승 사유를 작성한 뒤 처리합니다." onClick={() => handleStatus(selectedPassenger, 'no_show')} disabled={pendingPassengerIds.has(selectedPassenger.reservationId) || selectedPassenger.boardingStatus === 'no_show'}><UserX size={16} />미탑승</button>
                <button type="button" className={styles.resetButton} onClick={() => handleStatus(selectedPassenger, 'unchecked')} disabled={pendingPassengerIds.has(selectedPassenger.reservationId) || selectedPassenger.boardingStatus === 'unchecked'}><CircleHelp size={16} />미확인</button>
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
                  {snapshot.buses.map((bus) => {
                    const remaining = getBusRemainingCapacity(bus);
                    const isCurrentBus =
                      exceptionMode === 'move' && bus.id === exceptionPassenger?.busId;
                    return (
                      <option
                        key={bus.id}
                        value={bus.id}
                        disabled={Boolean(bus.departedAt) || remaining === 0 || isCurrentBus}
                      >
                        {formatBusLabel(bus.label)} · {bus.destination} · 잔여 {remaining}명
                        {isCurrentBus ? ' · 현재 호차' : bus.departedAt ? ' · 출발 완료' : remaining === 0 ? ' · 정원 마감' : ''}
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
                  ? '출발 완료 또는 정원이 찬 호차로는 이동할 수 없습니다.'
                  : '출발 완료 호차에는 추가할 수 없으며, 정원과 명단 번호 중복을 서버에서 확인합니다.'}
              </p>
              <footer>
                <button type="button" onClick={closeException}>취소</button>
                <button type="submit" disabled={savingException}>
                  {savingException ? '반영 중...' : exceptionMode === 'move' ? '호차 이동 반영' : '현장 탑승 추가'}
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
                <button type="submit" disabled={!boardingTransitionReason.trim()}>
                  사유 기록 · 탑승 처리
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
