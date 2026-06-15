import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bus,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Download,
  LogOut,
  Phone,
  RefreshCw,
  Save,
  UserRound,
  UsersRound,
  UserX,
  X,
} from 'lucide-react';

import {
  departDestinationQueueBus,
  getDestinationQueueBoardingSnapshot,
  setDestinationQueuePassengerStatus,
  startDestinationQueueBus,
  updatePassengerBoardingNote,
  type BoardingEvent,
  type DestinationQueueBoardingBus,
  type DestinationQueueBoardingPassenger,
  type DestinationQueueBoardingSnapshot,
  type DestinationQueueDepartureSnapshot,
  type BoardingStatus,
} from '../../lib/admin/boardingManagementService';
import { formatKoreanDateTime } from '../../utils/dateTime';
import { formatBusLabel } from '../../utils/busLabel';
import styles from './DestinationQueueBoardingPanel.module.css';

interface Props {
  initialSnapshot: DestinationQueueBoardingSnapshot;
}

const statusLabels: Record<BoardingStatus, string> = {
  unchecked: '대기',
  boarded: '탑승 완료',
  no_show: '미탑승',
};

const BUS_CAPACITY = 44;

const DestinationQueueBoardingPanel = ({ initialSnapshot }: Props) => {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedDestination, setSelectedDestination] = useState(
    initialSnapshot.destinations[0]?.destination ?? ''
  );
  const [search, setSearch] = useState('');
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date());
  const [departureCandidate, setDepartureCandidate] =
    useState<DestinationQueueBoardingBus | null>(null);
  const [completedBusesOpen, setCompletedBusesOpen] = useState(false);
  const [selectedDeparture, setSelectedDeparture] =
    useState<DestinationQueueDepartureSnapshot | null>(null);
  const [currentRosterBusId, setCurrentRosterBusId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Details drawer state
  const [selectedPassengerId, setSelectedPassengerId] = useState('');
  const [activeDrawerTab, setActiveDrawerTab] = useState<'info' | 'action' | 'logs'>('info');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNoteIds, setSavingNoteIds] = useState<Set<string>>(new Set());
  const [savedNotePassengerId, setSavedNotePassengerId] = useState('');
  const [noShowReasonPassengerId, setNoShowReasonPassengerId] = useState('');
  const [statusFilter, setStatusFilter] = useState<BoardingStatus | ''>('unchecked');

  const passengerDetailHistoryMarkerRef = useRef('destination-queue-passenger-detail');
  const passengerDetailHistoryEntryRef = useRef(false);
  const pendingKeysRef = useRef(new Set<string>());
  const refreshRequestRef = useRef(0);

  const selectDestination = (destination: string) => {
    setStatusFilter('unchecked');
    setSearch('');
    setSelectedDestination(destination);
  };

  const refresh = useCallback(async () => {
    const requestId = refreshRequestRef.current + 1;
    refreshRequestRef.current = requestId;
    setRefreshing(true);
    try {
      const next = await getDestinationQueueBoardingSnapshot();
      if (next && requestId === refreshRequestRef.current) {
        setSnapshot(next);
        setLastRefreshedAt(new Date());
      }
    } finally {
      if (requestId === refreshRequestRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh().catch(() => null), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const selectedStats =
    snapshot.destinations.find(
      (destination) => destination.destination === selectedDestination
    ) ?? snapshot.destinations[0];
  const activeDestination = selectedStats?.destination ?? '';
  const openBus = snapshot.buses.find(
    (bus) => bus.destination === activeDestination && bus.status === 'open'
  );
  const destinationBuses = snapshot.buses.filter(
    (bus) => bus.destination === activeDestination
  );
  const fullBusAwaitingDeparture = destinationBuses.find((bus) => bus.status === 'full');
  const currentBus = openBus ?? fullBusAwaitingDeparture;
  const getBusBoardedCount = useCallback(
    (busId: string) =>
      snapshot.passengers.filter(
        (passenger) => passenger.busId === busId && passenger.boardingStatus === 'boarded'
      ).length,
    [snapshot.passengers]
  );
  const currentBusBoardedCount = currentBus ? getBusBoardedCount(currentBus.id) : 0;
  const currentBusRemainingCount = Math.max(BUS_CAPACITY - currentBusBoardedCount, 0);
  const currentRosterBus = snapshot.buses.find((bus) => bus.id === currentRosterBusId);
  const currentRosterPassengers = useMemo(
    () =>
      currentRosterBusId
        ? snapshot.passengers.filter(
            (passenger) =>
              passenger.busId === currentRosterBusId && passenger.boardingStatus === 'boarded'
          )
        : [],
    [currentRosterBusId, snapshot.passengers]
  );
  const completedBuses = (snapshot.departures ?? []).filter(
    (departure) => departure.destination === activeDestination
  );
  const normalizedSearch = search.trim().toLocaleLowerCase('ko');
  const matchingPassengers = useMemo(
    () =>
      snapshot.passengers.filter(
        (passenger) =>
          passenger.assignedDestination === activeDestination &&
          (!normalizedSearch ||
            [passenger.name, passenger.phone, passenger.campus, passenger.team]
              .join(' ')
              .toLocaleLowerCase('ko')
              .includes(normalizedSearch))
      ),
    [activeDestination, normalizedSearch, snapshot.passengers]
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

  const passengers = useMemo(
    () =>
      statusFilter
        ? matchingPassengers.filter((passenger) => passenger.boardingStatus === statusFilter)
        : matchingPassengers,
    [matchingPassengers, statusFilter]
  );

  const selectedPassenger = useMemo(
    () => snapshot.passengers.find((p) => p.reservationId === selectedPassengerId),
    [selectedPassengerId, snapshot.passengers]
  );
  const selectedPassengerBusDeparted = Boolean(
    selectedPassenger?.busId &&
      snapshot.buses.some(
        (bus) => bus.id === selectedPassenger.busId && bus.status === 'departed'
      )
  );

  const selectedPassengerPreferences = useMemo(
    () => selectedPassenger?.stationPreferences ?? [],
    [selectedPassenger]
  );
  const selectedPassengerPreferenceRank = useMemo(() => {
    if (!selectedPassenger) return -1;
    return selectedPassengerPreferences.indexOf(selectedPassenger.assignedDestination) + 1;
  }, [selectedPassenger, selectedPassengerPreferences]);

  const selectedPassengerNoteDraft =
    (selectedPassenger && noteDrafts[selectedPassenger.reservationId]) ??
    selectedPassenger?.boardingNote ??
    '';
  const isSelectedPassengerNoteChanged =
    selectedPassenger &&
    selectedPassengerNoteDraft.trim() !== (selectedPassenger.boardingNote ?? '').trim();

  const isWritingNoShowReason = selectedPassengerId === noShowReasonPassengerId;
  const canConfirmNoShow =
    isWritingNoShowReason &&
    isSelectedPassengerNoteChanged &&
    Boolean(selectedPassengerNoteDraft.trim());

  const selectedPassengerEvents = useMemo(() => {
    if (!selectedPassenger || !snapshot.events) return [];
    return snapshot.events.filter((event) => event.reservationId === selectedPassengerId);
  }, [selectedPassenger, selectedPassengerId, snapshot.events]);

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

  const isPending = (key: string) => pendingKeys.has(key);
  const runAction = async (key: string, action: () => Promise<unknown>, success: string) => {
    if (pendingKeysRef.current.has(key)) return;
    pendingKeysRef.current.add(key);
    setPendingKeys((current) => new Set(current).add(key));
    setError('');
    setMessage('');
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '처리하지 못했습니다.');
    } finally {
      pendingKeysRef.current.delete(key);
      setPendingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const markNoShow = (reservationId: string, name: string) => {
    const reason = window.prompt(`${name} 미탑승 처리 사유를 입력해 주세요.`)?.trim();
    if (!reason) return;
    void runAction(
      `no-show:${reservationId}`,
      () => setDestinationQueuePassengerStatus(reservationId, 'no_show', reason),
      `${name}님을 미탑승 처리했습니다.`
    );
  };

  const handleStatusChange = async (
    passenger: DestinationQueueBoardingPassenger,
    status: BoardingStatus,
    transitionReason = ''
  ) => {
    if (status === 'no_show' && !transitionReason.trim()) {
      setSavedNotePassengerId('');
      setNoShowReasonPassengerId(passenger.reservationId);
      return;
    }

    const actionKey = `status:${passenger.reservationId}`;
    if (pendingKeysRef.current.has(actionKey)) return;
    if (
      status === 'boarded' &&
      !snapshot.buses.some(
        (bus) => bus.destination === passenger.assignedDestination && bus.status === 'open'
      )
    ) {
      setError(`${passenger.assignedDestination}행 버스 탑승을 먼저 시작해 주세요.`);
      return;
    }
    pendingKeysRef.current.add(actionKey);
    setPendingKeys((current) => new Set(current).add(actionKey));
    setError('');
    setMessage('');
    try {
      await setDestinationQueuePassengerStatus(passenger.reservationId, status, transitionReason);
      await refresh();
      setNoShowReasonPassengerId('');
      setMessage(`${passenger.name}님의 상태를 변경했습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '상태를 변경하지 못했습니다.');
    } finally {
      pendingKeysRef.current.delete(actionKey);
      setPendingKeys((current) => {
        const next = new Set(current);
        next.delete(actionKey);
        return next;
      });
    }
  };

  const handleNoteSave = async (passenger: DestinationQueueBoardingPassenger) => {
    const note = (noteDrafts[passenger.reservationId] ?? passenger.boardingNote ?? '').trim();
    const shouldConfirmNoShow = passenger.reservationId === noShowReasonPassengerId;

    if (shouldConfirmNoShow && (!note || !isSelectedPassengerNoteChanged)) {
      return;
    }

    setError('');
    setSavingNoteIds((current) => {
      const next = new Set(current);
      next.add(passenger.reservationId);
      return next;
    });

    try {
      await updatePassengerBoardingNote(
        passenger.reservationId,
        passenger.passengerKind || 'reservation',
        note
      );
      setNoteDrafts((current) => ({
        ...current,
        [passenger.reservationId]: note,
      }));
      setSavedNotePassengerId(passenger.reservationId);

      if (shouldConfirmNoShow) {
        setNoShowReasonPassengerId('');
        await handleStatusChange(passenger, 'no_show', note);
      } else {
        await refresh();
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

  const getChangeActorLabel = (event: BoardingEvent) => {
    if (event.actorType === 'passenger') return '승객 (자가 체크인)';
    if (event.actorType === 'automatic') return '시스템 (자동 처리)';
    return event.actorName ? `${event.actorName} (담당자)` : '담당자';
  };

  const getStatusChangeReason = (event: BoardingEvent) => {
    if (!event.note) return '';
    if (
      event.note === 'destination_queue_check_in_code' ||
      event.note === 'destination_queue_manager_check_in' ||
      event.note === 'destination_queue_manager_return_to_waiting'
    )
      return '';
    if (event.note.startsWith('destination_queue_no_show: ')) {
      return event.note.replace('destination_queue_no_show: ', '');
    }
    return event.note;
  };

  const downloadDepartureRoster = (departure: DestinationQueueDepartureSnapshot) => {
    const escapeCsv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [
      ['이름', '연락처', '지구', '팀', '캠퍼스', '탑승 확인 시각'],
      ...departure.passengers.map((passenger) => [
        passenger.name,
        passenger.phone,
        passenger.district,
        passenger.team,
        passenger.campus,
        passenger.boardingConfirmedAt
          ? formatKoreanDateTime(passenger.boardingConfirmedAt)
          : '',
      ]),
    ];
    const blob = new Blob(
      [`\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\n')}`],
      { type: 'text/csv;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${departure.label}-출발명단.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div>
          <span>Destination Queue Boarding</span>
          <h1>행선지 대기 탑승 관리</h1>
          <p>
            {snapshot.commonBoarding.departureTime} · {snapshot.commonBoarding.boardingPlace}
          </p>
        </div>
        <div className={styles.refreshStatus}>
          <span>자동 갱신 중 · 마지막 갱신 {lastRefreshedAt.toLocaleTimeString('ko-KR')}</span>
          <button type="button" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw size={17} className={refreshing ? styles.spinning : undefined} />
            {refreshing ? '갱신 중' : '새로고침'}
          </button>
        </div>
      </section>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {message && <p className={styles.message} role="status">{message}</p>}

      <section className={styles.destinationGrid}>
        {snapshot.destinations.map((destination) => {
          const destinationOpenBus = snapshot.buses.find(
            (bus) => bus.destination === destination.destination && bus.status === 'open'
          );
          const destinationFullBus = snapshot.buses.find(
            (bus) => bus.destination === destination.destination && bus.status === 'full'
          );
          const destinationCurrentBus = destinationOpenBus ?? destinationFullBus;
          const destinationBusBoarded = destinationCurrentBus
            ? getBusBoardedCount(destinationCurrentBus.id)
            : 0;
          const finalBusExpected = destination.total % BUS_CAPACITY || BUS_CAPACITY;
          const operationStatus = destinationFullBus
            ? '만차 · 출발 필요'
            : destinationOpenBus
              ? `탑승 중 ${destinationBusBoarded}/${BUS_CAPACITY}`
              : destination.unchecked > 0
                ? '다음 버스 시작 가능'
                : '운영 완료';
          return (
            <button
              type="button"
              key={destination.destination}
              className={`${destination.destination === activeDestination ? styles.destinationActive : ''} ${
                destinationFullBus
                  ? styles.destinationNeedsDeparture
                  : destinationOpenBus
                    ? styles.destinationBoarding
                    : destination.unchecked === 0
                      ? styles.destinationComplete
                      : ''
              }`}
              onClick={() => selectDestination(destination.destination)}
            >
              <strong>{destination.destination}</strong>
              <span>
                전체 {destination.total}명 · 예상 {destination.expectedBuses}대 · 마지막 버스 예상{' '}
                {finalBusExpected}명
              </span>
              <small>{operationStatus} · 대기 {destination.unchecked}명</small>
            </button>
          );
        })}
      </section>

      {selectedStats && (
        <>
          <section className={styles.control}>
            <div>
              <span>현재 행선지</span>
              <h2>{activeDestination}</h2>
              <p>
                탑승 {selectedStats.boarded}명 · 대기 {selectedStats.unchecked}명 · 미탑승{' '}
                {selectedStats.noShow}명
              </p>
            </div>
            {currentBus ? (
              <div className={styles.openBus}>
                <span>{currentBus.label}</span>
                <div className={styles.currentBusProgress}>
                  <strong>{currentBusBoardedCount} / {BUS_CAPACITY}명</strong>
                  <small>
                    {currentBus.status === 'full'
                      ? '만차 · 출발 처리가 필요합니다'
                      : `${currentBusRemainingCount}명 남음`}
                  </small>
                  <div aria-label={`현재 버스 탑승률 ${currentBusBoardedCount}/${BUS_CAPACITY}`}>
                    <i style={{ width: `${Math.min((currentBusBoardedCount / BUS_CAPACITY) * 100, 100)}%` }} />
                  </div>
                </div>
                {currentBus.status === 'open' && (
                  <div className={styles.checkInCode}>
                    <small>승객 입력용 탑승 코드</small>
                    <strong>{currentBus.check_in_code}</strong>
                  </div>
                )}
                <button
                  type="button"
                  className={styles.currentRosterButton}
                  onClick={() => setCurrentRosterBusId(currentBus.id)}
                >
                  <UsersRound size={17} /> 탑승 명단
                </button>
                <button
                  type="button"
                  className={styles.depart}
                  disabled={isPending(`depart:${currentBus.id}`)}
                  onClick={() => setDepartureCandidate(currentBus)}
                >
                  <LogOut size={17} /> 출발 확인
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.startBus}
                disabled={isPending(`start:${activeDestination}`) || selectedStats.unchecked === 0}
                onClick={() =>
                  void runAction(
                    `start:${activeDestination}`,
                    () => startDestinationQueueBus(activeDestination),
                    `${activeDestination}행 새 버스 탑승을 시작했습니다.`
                  )
                }
              >
                <Bus size={20} /> 다음 버스 탑승 시작
              </button>
            )}
          </section>

          {destinationBuses.some((bus) => bus.status !== 'departed') && (
            <div className={styles.busHistory}>
              {destinationBuses.filter((bus) => bus.status !== 'departed').map((bus) => (
                <div key={bus.id}>
                  <span>
                    {bus.label} ·{' '}
                    {bus.status === 'open'
                      ? '탑승 중'
                      : bus.status === 'full'
                        ? '만차'
                        : '출발 완료'}
                  </span>
                  {bus.status === 'full' && (
                    <button
                      type="button"
                      disabled={isPending(`depart:${bus.id}`)}
                      onClick={() => setDepartureCandidate(bus)}
                    >
                      <LogOut size={14} /> 출발 확인
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {completedBuses.length > 0 && (
            <section className={styles.completedBuses}>
              <button
                type="button"
                className={styles.completedBusesToggle}
                onClick={() => setCompletedBusesOpen((current) => !current)}
                aria-expanded={completedBusesOpen}
              >
                <span>
                  <strong>출발 완료 {completedBuses.length}대</strong>
                  <small>출발 당시 명단은 변경되지 않고 보존됩니다.</small>
                </span>
                <ChevronDown
                  size={19}
                  className={completedBusesOpen ? styles.completedBusesChevronOpen : undefined}
                />
              </button>
              {completedBusesOpen && (
                <div className={styles.completedBusList}>
                  {completedBuses.map((departure) => (
                    <article key={departure.busId}>
                      <div>
                        <strong>{departure.label}</strong>
                        <span>
                          {departure.boardedCount}명 · {formatKoreanDateTime(departure.departedAt)} 출발
                        </span>
                        <small>{departure.departedByName} 처리</small>
                      </div>
                      <div>
                        <button type="button" onClick={() => setSelectedDeparture(departure)}>
                          명단 보기
                        </button>
                        <button type="button" onClick={() => downloadDepartureRoster(departure)}>
                          <Download size={14} /> CSV
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className={styles.roster}>
            <header>
              <div>
                <span>행선지 대기 명단</span>
                <h2>{activeDestination} 승객</h2>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="이름, 연락처, 캠퍼스 검색"
              />
            </header>

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

            <div className={styles.passengerGrid}>
              {passengers.map((passenger) => (
                <article key={passenger.reservationId} className={styles.passenger}>
                  <div>
                    <strong>{passenger.name}</strong>
                    <span>{passenger.campus} · {passenger.team}</span>
                    <small>{passenger.phone}</small>
                    {passenger.busNumber && <em>{passenger.busNumber}</em>}
                  </div>
                  <span className={styles[passenger.boardingStatus]}>
                    {passenger.boardingStatus === 'boarded'
                      ? '탑승'
                      : passenger.boardingStatus === 'no_show'
                        ? '미탑승'
                        : '대기'}
                  </span>
                  {passenger.boardingStatus === 'unchecked' && (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        disabled={isPending(`board:${passenger.reservationId}`)}
                        onClick={() =>
                          void runAction(
                            `board:${passenger.reservationId}`,
                            async () => {
                              if (!openBus) {
                                throw new Error(`${passenger.assignedDestination}행 버스 탑승을 먼저 시작해 주세요.`);
                              }
                              await setDestinationQueuePassengerStatus(passenger.reservationId, 'boarded');
                            },
                            `${passenger.name}님 탑승 처리를 완료했습니다.`
                          )
                        }
                      >
                        <CheckCircle2 size={15} /> 탑승
                      </button>
                      <button
                        type="button"
                        disabled={isPending(`no-show:${passenger.reservationId}`)}
                        onClick={() => markNoShow(passenger.reservationId, passenger.name)}
                      >
                        <UserX size={15} /> 미탑승
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    className={styles.detailButton}
                    onClick={() => {
                      setSelectedPassengerId(passenger.reservationId);
                      setSavedNotePassengerId('');
                      setNoShowReasonPassengerId('');
                      setActiveDrawerTab('info');
                    }}
                    aria-haspopup="dialog"
                  >
                    <UserRound size={14} />
                    <span>{passenger.boardingNote ? '상세 · 전달사항 있음' : '상세 보기'}</span>
                    {passenger.boardingNote && <small>{passenger.boardingNote}</small>}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {departureCandidate && (
        <div
          className={styles.confirmBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDepartureCandidate(null);
          }}
        >
          <section
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="destination-queue-departure-title"
          >
            <span>출발 처리 확인</span>
            <h2 id="destination-queue-departure-title">{departureCandidate.label}</h2>
            <p>
              현재 탑승 {getBusBoardedCount(departureCandidate.id)}명 · 행선지 미확인{' '}
              {snapshot.destinations.find(
                (destination) => destination.destination === departureCandidate.destination
              )?.unchecked ?? 0}
              명
            </p>
            <strong>
              출발 처리 후에는 이 버스에 추가 탑승할 수 없습니다.
            </strong>
            <div>
              <button type="button" onClick={() => setDepartureCandidate(null)}>
                취소
              </button>
              <button
                type="button"
                className={styles.confirmDeparture}
                disabled={isPending(`depart:${departureCandidate.id}`)}
                onClick={() => {
                  const bus = departureCandidate;
                  setDepartureCandidate(null);
                  void runAction(
                    `depart:${bus.id}`,
                    () => departDestinationQueueBus(bus.id),
                    `${bus.label} 출발 처리를 완료했습니다.`
                  );
                }}
              >
                <LogOut size={16} /> 출발 처리
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedDeparture && (
        <div
          className={styles.departureRosterBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedDeparture(null);
          }}
        >
          <section
            className={styles.departureRosterDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="destination-queue-departure-roster-title"
          >
            <header>
              <div>
                <span>출발 완료 명단</span>
                <h2 id="destination-queue-departure-roster-title">{selectedDeparture.label}</h2>
                <p>
                  {selectedDeparture.boardedCount}명 · {formatKoreanDateTime(selectedDeparture.departedAt)} ·{' '}
                  {selectedDeparture.departedByName} 처리
                </p>
              </div>
              <button type="button" onClick={() => setSelectedDeparture(null)} aria-label="출발 명단 닫기">
                <X size={19} />
              </button>
            </header>
            <div className={styles.departureRosterActions}>
              <strong>출발 당시 저장된 불변 명단입니다.</strong>
              <button type="button" onClick={() => downloadDepartureRoster(selectedDeparture)}>
                <Download size={15} /> CSV 다운로드
              </button>
            </div>
            <div className={styles.departureRosterList}>
              {selectedDeparture.passengers.map((passenger) => (
                <article key={passenger.reservationId}>
                  <strong>{passenger.name}</strong>
                  <span>{passenger.campus} · {passenger.team}</span>
                  <small>{passenger.phone}</small>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {currentRosterBus && (
        <div
          className={styles.departureRosterBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCurrentRosterBusId('');
          }}
        >
          <section
            className={styles.departureRosterDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="destination-queue-current-roster-title"
          >
            <header>
              <div>
                <span>현재 탑승 중인 명단</span>
                <h2 id="destination-queue-current-roster-title">{currentRosterBus.label}</h2>
                <p>현재 탑승 확인된 승객 {currentRosterPassengers.length}명</p>
              </div>
              <button type="button" onClick={() => setCurrentRosterBusId('')} aria-label="현재 탑승 명단 닫기">
                <X size={19} />
              </button>
            </header>
            <div className={styles.currentRosterNotice}>
              <strong>탑승 상태가 변경되면 명단도 자동으로 갱신됩니다.</strong>
            </div>
            <div className={styles.departureRosterList}>
              {currentRosterPassengers.length > 0 ? (
                currentRosterPassengers.map((passenger) => (
                  <article key={passenger.reservationId} className={styles.currentRosterPassenger}>
                    <button
                      type="button"
                      className={styles.currentRosterPassengerDetails}
                      onClick={() => {
                        setCurrentRosterBusId('');
                        setSelectedPassengerId(passenger.reservationId);
                        setSavedNotePassengerId('');
                        setNoShowReasonPassengerId('');
                        setActiveDrawerTab('info');
                      }}
                    >
                      <strong>{passenger.name}</strong>
                      <span>{passenger.campus} · {passenger.team}</span>
                      <small>{passenger.phone}</small>
                    </button>
                    <button
                      type="button"
                      className={styles.currentRosterWaitButton}
                      onClick={() => void handleStatusChange(passenger, 'unchecked')}
                      disabled={isPending(`status:${passenger.reservationId}`)}
                    >
                      <CircleHelp size={14} />
                      대기로 변경
                    </button>
                  </article>
                ))
              ) : (
                <p className={styles.emptyCurrentRoster}>아직 탑승 확인된 승객이 없습니다.</p>
              )}
            </div>
          </section>
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
                <p>
                  {selectedPassenger.campus}
                  {selectedPassenger.district ? ` · ${selectedPassenger.district}` : ''}
                  {selectedPassenger.team ? ` · ${selectedPassenger.team}` : ''}
                </p>
              </div>
              <button type="button" onClick={closePassengerDetails} aria-label="상세보기 닫기">
                <X size={20} />
              </button>
            </header>

            <nav className={styles.drawerTabs} aria-label="상세 정보 탭">
              <button
                type="button"
                className={`${styles.drawerTabButton} ${
                  activeDrawerTab === 'info' ? styles.drawerTabButtonActive : ''
                }`}
                onClick={() => setActiveDrawerTab('info')}
              >
                기본 정보
              </button>
              <button
                type="button"
                className={`${styles.drawerTabButton} ${
                  activeDrawerTab === 'action' ? styles.drawerTabButtonActive : ''
                }`}
                onClick={() => setActiveDrawerTab('action')}
              >
                상태 조작 · 전달사항
              </button>
              <button
                type="button"
                className={`${styles.drawerTabButton} ${
                  activeDrawerTab === 'logs' ? styles.drawerTabButtonActive : ''
                }`}
                onClick={() => setActiveDrawerTab('logs')}
              >
                처리 이력
              </button>
            </nav>

            <div className={styles.drawerTabContent}>
              {activeDrawerTab === 'info' && (
                <>
                  <dl className={styles.detailFacts}>
                    <div>
                      <dt>호차</dt>
                      <dd>{formatBusLabel(selectedPassenger.busNumber)}</dd>
                    </div>
                    <div>
                      <dt>캠퍼스</dt>
                      <dd>{selectedPassenger.campus || '-'}</dd>
                    </div>
                    <div>
                      <dt>지구 · 팀</dt>
                      <dd>
                        {[selectedPassenger.district, selectedPassenger.team]
                          .filter(Boolean)
                          .join(' · ') || '-'}
                      </dd>
                    </div>
                    <div>
                      <dt>구분</dt>
                      <dd>
                        {selectedPassenger.passengerKind === 'walk_in'
                          ? '현장 추가 탑승자'
                          : '기존 신청자'}
                      </dd>
                    </div>
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

                  {selectedPassenger.phone && (
                    <a className={styles.phoneButton} href={`tel:${selectedPassenger.phone}`}>
                      <Phone size={17} />
                      {selectedPassenger.phone} 전화하기
                    </a>
                  )}
                </>
              )}

              {activeDrawerTab === 'action' && (
                <>
                  <section className={styles.detailStatusSection} aria-label="탑승 상태">
                    <div>
                      <span>현재 상태</span>
                      <strong
                        className={`${styles.detailStatus} ${
                          styles[`detailStatus_${selectedPassenger.boardingStatus}`]
                        }`}
                      >
                        {selectedPassenger.boardingStatus === 'boarded' && (
                          <CheckCircle2
                            size={12}
                            style={{ marginRight: 3, verticalAlign: -1 }}
                          />
                        )}
                        {selectedPassenger.boardingStatus === 'unchecked' && (
                          <CircleHelp
                            size={12}
                            style={{ marginRight: 3, verticalAlign: -1 }}
                          />
                        )}
                        {selectedPassenger.boardingStatus === 'no_show' && (
                          <UserX size={12} style={{ marginRight: 3, verticalAlign: -1 }} />
                        )}
                        {statusLabels[selectedPassenger.boardingStatus]}
                      </strong>
                    </div>
                    {selectedPassengerBusDeparted && (
                      <p className={styles.immutableNotice}>
                        출발 완료 호차의 탑승 기록은 변경할 수 없습니다.
                      </p>
                    )}
                    <div className={styles.detailActions}>
                      <button
                        type="button"
                        className={`${styles.boardButton} ${
                          selectedPassenger.boardingStatus === 'boarded'
                            ? styles.detailActionSelected
                            : ''
                        }`}
                        aria-pressed={selectedPassenger.boardingStatus === 'boarded'}
                        onClick={() => void handleStatusChange(selectedPassenger, 'boarded')}
                        disabled={
                          selectedPassengerBusDeparted ||
                          selectedPassenger.boardingStatus === 'boarded' ||
                          isPending(`status:${selectedPassenger.reservationId}`)
                        }
                      >
                        <CheckCircle2 size={16} />
                        탑승
                      </button>
                      <button
                        type="button"
                        className={`${styles.noShowButton} ${
                          selectedPassenger.boardingStatus === 'no_show'
                            ? styles.detailActionSelected
                            : ''
                        }`}
                        aria-pressed={selectedPassenger.boardingStatus === 'no_show'}
                        title="미탑승 사유를 작성한 뒤 저장하면 처리됩니다."
                        onClick={() => void handleStatusChange(selectedPassenger, 'no_show')}
                        disabled={
                          selectedPassengerBusDeparted ||
                          selectedPassenger.boardingStatus === 'no_show' ||
                          isPending(`status:${selectedPassenger.reservationId}`)
                        }
                      >
                        <UserX size={16} />
                        미탑승
                      </button>
                      <button
                        type="button"
                        className={`${styles.waitButton} ${
                          selectedPassenger.boardingStatus === 'unchecked'
                            ? styles.detailActionSelected
                            : ''
                        }`}
                        aria-pressed={selectedPassenger.boardingStatus === 'unchecked'}
                        onClick={() => void handleStatusChange(selectedPassenger, 'unchecked')}
                        disabled={
                          selectedPassengerBusDeparted ||
                          selectedPassenger.boardingStatus === 'unchecked' ||
                          isPending(`status:${selectedPassenger.reservationId}`)
                        }
                      >
                        <CircleHelp size={16} />
                        대기
                      </button>
                    </div>
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
                          <span>
                            사유를 새로 작성하거나 기존 전달사항을 수정해야 미탑승 처리됩니다.
                          </span>
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
                </>
              )}

              {activeDrawerTab === 'logs' && (
                <section className={styles.detailRecord}>
                  <h3>최근 처리 기록</h3>
                  {selectedPassengerEvents.length > 0 ? (
                    selectedPassengerEvents.map((event) => (
                      <div
                        key={event.id}
                        className={`${styles.changeSummary} ${
                          styles[`change_${event.actorType}`]
                        }`}
                      >
                        <strong>{getChangeActorLabel(event)}</strong>
                        <span>
                          {statusLabels[event.fromStatus as BoardingStatus]} →{' '}
                          {statusLabels[event.toStatus as BoardingStatus]}
                          {' · '}
                          {formatKoreanDateTime(event.createdAt)}
                        </span>
                        {getStatusChangeReason(event) && (
                          <p className={styles.statusChangeReason}>
                            전환 사유: {getStatusChangeReason(event)}
                          </p>
                        )}
                      </div>
                    ))
                  ) : selectedPassenger.updatedAt ? (
                    <div className={`${styles.changeSummary} ${styles.change_unknown}`}>
                      <strong>기존 처리 기록</strong>
                      <span>{formatKoreanDateTime(selectedPassenger.updatedAt)}</span>
                    </div>
                  ) : (
                    <p>아직 처리 기록이 없습니다.</p>
                  )}
                </section>
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
};

export default DestinationQueueBoardingPanel;
