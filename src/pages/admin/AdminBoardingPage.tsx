import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bus,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  KeyRound,
  RefreshCw,
  Save,
  Search,
  X,
  UserX,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  cancelBoardingBusDeparture,
  getBoardingManagementSnapshot,
  markBoardingBusDeparted,
  rotateBoardingCheckInCode,
  setPassengerBoardingStatus,
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
  const [problemBusesOnly, setProblemBusesOnly] = useState(false);
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
  const [departureActionKey, setDepartureActionKey] = useState('');
  const [rotatingCodeBusId, setRotatingCodeBusId] = useState('');
  const realtimeSyncTimerRef = useRef<number | null>(null);
  const sheetAutoSyncTimerRef = useRef<number | null>(null);

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
          statusSortOrder[a.boardingStatus] - statusSortOrder[b.boardingStatus] ||
          a.busNumber.localeCompare(b.busNumber, 'ko', { numeric: true }) ||
          a.campus.localeCompare(b.campus, 'ko') ||
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
  const visibleBuses = useMemo(() => {
    const normalizedBusSearch = busSearch.trim().toLocaleLowerCase('ko');

    return [...(snapshot?.buses ?? [])]
      .filter((bus) => {
        const counts = busCountsByLabel.get(bus.label);
        if (problemBusesOnly && !counts?.noShow) return false;
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
  }, [busCountsByLabel, busSearch, problemBusesOnly, snapshot?.buses]);

  const latestEventByReservationId = useMemo(() => {
    const events = new Map<string, BoardingEvent>();

    snapshot?.events.forEach((event) => {
      if (!events.has(event.reservationId)) {
        events.set(event.reservationId, event);
      }
    });

    return events;
  }, [snapshot?.events]);

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

  const handleStatus = (passenger: BoardingPassenger, status: BoardingStatus) => {
    if (
      status === 'no_show' &&
      !window.confirm(
        `${passenger.name}님을 ${statusLabels[status]} 상태로 변경할까요?`
      )
    ) {
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
      note: '탑승 관리 간사님 상태 변경',
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

    void setPassengerBoardingStatus(passenger.reservationId, status)
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

  const handleNoteSave = async (passenger: BoardingPassenger) => {
    const note = (noteDrafts[passenger.reservationId] ?? passenger.boardingNote ?? '')
      .trim();

    setSavingNoteIds((current) => {
      const next = new Set(current);
      next.add(passenger.reservationId);
      return next;
    });
    setError('');

    try {
      await updatePassengerBoardingNote(passenger.reservationId, note);
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
                    ? '좌석 번호는 명단 확인용이며 실제 지정 좌석이 아닙니다.'
                    : '배정받은 담당 호차만 표시됩니다. 좌석 번호는 명단 확인용입니다.'}
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
              <dl className={styles.overviewStats}>
                <div><dt>{isGlobalAdmin ? '운행 차량' : '담당 호차'}</dt><dd>{snapshot.buses.length.toLocaleString()}대</dd></div>
                <div><dt>{isGlobalAdmin ? '전체 인원' : '담당 인원'}</dt><dd>{overallCounts.total.toLocaleString()}명</dd></div>
                <div><dt>탑승 확인</dt><dd>{overallCounts.boarded.toLocaleString()}명</dd></div>
                <div><dt>탑승 미확인</dt><dd>{overallCounts.unchecked.toLocaleString()}명</dd></div>
                <div className={overallCounts.noShow ? styles.overviewAlert : undefined}>
                  <dt>미탑승</dt><dd>{overallCounts.noShow.toLocaleString()}명</dd>
                </div>
              </dl>
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
                className={problemBusesOnly ? styles.problemFilterActive : undefined}
                onClick={() => setProblemBusesOnly((current) => !current)}
                aria-pressed={problemBusesOnly}
              >
                <UserX size={16} /> 미탑승 발생 차량만
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
                const checkedCount = counts.boarded + counts.noShow;
                const busCompletionRate = counts.total
                  ? Math.round((checkedCount / counts.total) * 100)
                  : 0;
                return (
                  <button
                    key={bus.id}
                    type="button"
                    className={`${styles.busCard} ${selectedBusId === bus.id ? styles.busCardActive : ''} ${counts.noShow ? styles.busCardProblem : ''}`}
                    onClick={() => {
                      setSelectedBusId(bus.id);
                      setSearch('');
                      setCampusFilter('');
                      setStatusFilter('');
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
                      </span>
                    </div>
                    <p>{bus.destination}</p>
                    <div className={styles.busProgressHeader}>
                      <span>호차 확인 진행률</span>
                      <strong>{busCompletionRate}%</strong>
                    </div>
                    <div
                      className={styles.busProgress}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={counts.total}
                      aria-valuenow={checkedCount}
                      aria-label={`${formatBusLabel(bus.label)} 확인 진행률`}
                    >
                      <span style={{ width: `${busCompletionRate}%` }} />
                    </div>
                    <div className={styles.busCounts}>
                      <span>확인 {checkedCount} / {counts.total}명</span>
                      <span>탑승 미확인 {counts.unchecked}</span>
                      {counts.noShow > 0 && <span className={styles.noShow}>미탑승 {counts.noShow}</span>}
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
                  <button type="button" onClick={() => { setBusSearch(''); setProblemBusesOnly(false); }}>
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
                  {isGlobalSearch ? (
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
                  ) : selectedBus.departedAt ? (
                    <button className={styles.cancelDeparture} type="button" onClick={handleCancelDeparture} disabled={Boolean(departureActionKey)}>
                      출발 완료 취소
                    </button>
                  ) : (
                    <button className={styles.departure} type="button" onClick={handleDeparture} disabled={Boolean(departureActionKey)}>
                      남은 탑승 미확인 전원 미탑승 · 출발 완료
                    </button>
                  )}
                </div>

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
                    const latestEvent = latestEventByReservationId.get(
                      passenger.reservationId
                    );
                    const isPassengerPending = pendingPassengerIds.has(
                      passenger.reservationId
                    );
                    const noteDraft =
                      noteDrafts[passenger.reservationId] ??
                      passenger.boardingNote ??
                      '';
                    const isNoteSaving = savingNoteIds.has(passenger.reservationId);
                    const isNoteChanged =
                      noteDraft.trim() !== (passenger.boardingNote ?? '').trim();
                    const passengerBus = busesByLabel.get(passenger.busNumber);
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
                          <span className={styles.statusBadge}>{statusLabels[passenger.boardingStatus]}</span>
                        </div>
                        <div className={styles.actions}>
                          <button type="button" className={styles.boardButton} onClick={() => handleStatus(passenger, 'boarded')} disabled={isPassengerPending || passenger.boardingStatus === 'boarded'} aria-label={`${passenger.name} 탑승 확인`}><CheckCircle2 size={14} />탑승</button>
                          <button type="button" className={styles.noShowButton} title={!passengerBus?.departedAt ? '출발 완료 후 미탑승 처리할 수 있습니다.' : undefined} onClick={() => handleStatus(passenger, 'no_show')} disabled={isPassengerPending || passenger.boardingStatus === 'no_show' || !passengerBus?.departedAt} aria-label={`${passenger.name} 미탑승 처리`}><UserX size={14} />미탑승</button>
                          <button type="button" className={styles.resetButton} onClick={() => handleStatus(passenger, 'unchecked')} disabled={isPassengerPending || passenger.boardingStatus === 'unchecked'} aria-label={`${passenger.name} 탑승 미확인으로 변경`}><CircleHelp size={14} />미확인</button>
                        </div>
                        <details className={styles.passengerDetails}>
                          <summary>
                            <span>{passenger.boardingNote ? '상세 · 비고 있음' : '상세 보기'}</span>
                            {passenger.boardingNote && <small>{passenger.boardingNote}</small>}
                          </summary>
                          <div className={styles.meta}>
                            <span>{formatBusLabel(passenger.busNumber)}</span>
                            <a href={`tel:${passenger.phone}`} aria-label={`${passenger.name}님에게 전화`}>
                              {passenger.phone}
                            </a>
                          </div>
                          {latestEvent ? (
                            <div className={`${styles.changeSummary} ${styles[`change_${getChangeActorType(latestEvent)}`]}`}>
                              <strong>{getChangeActorLabel(latestEvent)}</strong>
                              <span>
                                {statusLabels[latestEvent.fromStatus]} → {statusLabels[latestEvent.toStatus]}
                                {' · '}
                                {formatKoreanDateTime(latestEvent.createdAt)}
                              </span>
                            </div>
                          ) : passenger.updatedAt ? (
                            <div className={`${styles.changeSummary} ${styles.change_unknown}`}>
                              <strong>기존 처리 기록</strong>
                              <span>{formatKoreanDateTime(passenger.updatedAt)}</span>
                            </div>
                          ) : null}
                          <form
                            className={styles.noteEditor}
                            onSubmit={(event) => {
                              event.preventDefault();
                              void handleNoteSave(passenger);
                            }}
                          >
                            <label htmlFor={`boarding-note-${passenger.reservationId}`}>현장 전달사항</label>
                            <textarea
                              id={`boarding-note-${passenger.reservationId}`}
                              value={noteDraft}
                              maxLength={500}
                              rows={2}
                              placeholder="현장 전달사항을 입력하세요"
                              onChange={(event) =>
                                setNoteDrafts((current) => ({
                                  ...current,
                                  [passenger.reservationId]: event.target.value,
                                }))
                              }
                            />
                            <button type="submit" disabled={isNoteSaving || !isNoteChanged}>
                              <Save size={14} />
                              {isNoteSaving ? '저장 중' : '저장'}
                            </button>
                          </form>
                        </details>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default AdminBoardingPage;
