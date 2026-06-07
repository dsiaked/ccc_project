import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bus,
  CheckCircle2,
  CircleHelp,
  RefreshCw,
  Save,
  Search,
  UserX,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  cancelBoardingBusDeparture,
  getBoardingManagementSnapshot,
  markBoardingBusDeparted,
  setPassengerBoardingStatus,
  updatePassengerBoardingNote,
  type BoardingEvent,
  type BoardingPassenger,
  type BoardingSnapshot,
  type BoardingStatus,
} from '../../lib/admin/boardingManagementService';
import { formatKoreanDateTime } from '../../utils/dateTime';
import AdminHeader from './AdminHeader';
import styles from './AdminBoardingPage.module.css';

const statusLabels: Record<BoardingStatus, string> = {
  unchecked: '확인 대기',
  boarded: '탑승',
  no_show: '미탑승',
};

const getChangeActorType = (event: BoardingEvent) => {
  if (event.actorType) return event.actorType;
  if (event.note === '탑승 확인') return 'passenger';
  if (event.note?.startsWith('호차 출발')) return 'automatic';
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

  return event.actorName ? `선탑자 ${event.actorName} 처리` : '선탑자 처리';
};

const AdminBoardingPage = () => {
  const [snapshot, setSnapshot] = useState<BoardingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [selectedBusId, setSelectedBusId] = useState('');
  const [search, setSearch] = useState('');
  const [campusFilter, setCampusFilter] = useState('');
  const [pendingPassengerIds, setPendingPassengerIds] = useState<Set<string>>(
    () => new Set()
  );
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNoteIds, setSavingNoteIds] = useState<Set<string>>(
    () => new Set()
  );
  const [departureActionKey, setDepartureActionKey] = useState('');
  const realtimeSyncTimerRef = useRef<number | null>(null);

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
  const selectedPassengers = useMemo(() => {
    const busLabel = selectedBus?.label;
    const normalizedSearch = search.trim().toLocaleLowerCase('ko');

    return (snapshot?.passengers ?? [])
      .filter(
        (passenger) => normalizedSearch || passenger.busNumber === busLabel
      )
      .filter((passenger) => !campusFilter || passenger.campus === campusFilter)
      .filter(
        (passenger) =>
          !normalizedSearch ||
          [passenger.name, passenger.phone, passenger.campus].some((value) =>
            value.toLocaleLowerCase('ko').includes(normalizedSearch)
          )
      )
      .sort(
        (a, b) =>
          a.campus.localeCompare(b.campus, 'ko') ||
          a.name.localeCompare(b.name, 'ko')
      );
  }, [campusFilter, search, selectedBus?.label, snapshot?.passengers]);

  const campuses = useMemo(
    () =>
      Array.from(
        new Set(
          (snapshot?.passengers ?? [])
            .filter(
              (passenger) => search.trim() || passenger.busNumber === selectedBus?.label
            )
            .map((passenger) => passenger.campus)
        )
      ).sort((a, b) => a.localeCompare(b, 'ko')),
    [search, selectedBus?.label, snapshot?.passengers]
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

  const handleStatus = (passenger: BoardingPassenger, status: BoardingStatus) => {
    if (
      status !== 'unchecked' &&
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
      note: '선탑자 상태 변경',
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
        `${selectedBus.label} 출발 완료를 선언할까요?\n남은 확인 대기 ${counts.unchecked}명은 미탑승 처리됩니다.`
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
        `${selectedBus.label} 출발 완료를 취소할까요?\n일괄 미탑승 처리된 승객은 확인 대기로 복구됩니다.`
      )
    ) {
      return;
    }

    void runDepartureAction(`cancel-depart:${selectedBus.id}`, () =>
      cancelBoardingBusDeparture(selectedBus.id)
    );
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
            <h1>선탑자 탑승 현황</h1>
            <p>전체 확정 호차의 탑승·확인 대기·미탑승 인원을 실시간으로 확인합니다.</p>
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
              <strong>{snapshot.allocationName}</strong>
              <span>좌석 번호는 명단 확인용이며 실제 지정 좌석이 아닙니다.</span>
            </div>

            <section className={styles.busGrid}>
              {snapshot.buses.map((bus) => {
                const counts = busCountsByLabel.get(bus.label) ?? {
                  total: 0,
                  boarded: 0,
                  unchecked: 0,
                  noShow: 0,
                };
                return (
                  <button
                    key={bus.id}
                    type="button"
                    className={`${styles.busCard} ${selectedBusId === bus.id ? styles.busCardActive : ''}`}
                    onClick={() => {
                      setSelectedBusId(bus.id);
                      setCampusFilter('');
                    }}
                  >
                    <div><strong>{bus.label}</strong>{bus.departedAt && <span className={styles.departedBadge}>출발 완료</span>}</div>
                    <p>{bus.destination} · 총 {counts.total}명</p>
                    <div className={styles.busCounts}>
                      <span className={styles.boarded}>탑승 {counts.boarded}</span>
                      <span className={styles.unchecked}>확인 대기 {counts.unchecked}</span>
                      <span className={styles.noShow}>미탑승 {counts.noShow}</span>
                    </div>
                  </button>
                );
              })}
            </section>

            {selectedBus && (
              <section className={styles.roster}>
                <div className={styles.rosterHeader}>
                  <div>
                    <span>선택 호차</span>
                    <h2>{search.trim() ? '전체 호차 검색 결과' : `${selectedBus.label} 탑승자 명단`}</h2>
                    <p>{selectedBus.destination} · {selectedBus.departureTime} · {selectedBus.boardingPlace}</p>
                  </div>
                  {selectedBus.departedAt ? (
                    <button className={styles.cancelDeparture} type="button" onClick={handleCancelDeparture} disabled={Boolean(departureActionKey)}>
                      출발 완료 취소
                    </button>
                  ) : (
                    <button className={styles.departure} type="button" onClick={handleDeparture} disabled={Boolean(departureActionKey)}>
                      남은 확인 대기 전원 미탑승 · 출발 완료
                    </button>
                  )}
                </div>

                <div className={styles.filters}>
                  <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름, 연락처, 캠퍼스 검색" /></label>
                  <select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
                    <option value="">전체 캠퍼스</option>
                    {campuses.map((campus) => <option key={campus}>{campus}</option>)}
                  </select>
                  <strong className={styles.resultCount}>
                    {selectedPassengers.length.toLocaleString()}명
                  </strong>
                </div>

                <div className={styles.passengerList}>
                  {selectedPassengers.length === 0 ? (
                    <div className={styles.noResults}>
                      <Search size={24} />
                      <strong>검색 결과가 없습니다</strong>
                      <span>검색어 또는 캠퍼스 필터를 변경해주세요.</span>
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
                    const passengerBus = snapshot.buses.find(
                      (bus) => bus.label === passenger.busNumber
                    );
                    return (
                      <article key={passenger.reservationId} className={`${styles.passenger} ${styles[`status_${passenger.boardingStatus}`]}`}>
                        <div className={styles.passengerMain}>
                          <div className={styles.nameRow}>
                            <strong>{passenger.name}</strong>
                            <span className={styles.statusBadge}>{statusLabels[passenger.boardingStatus]}</span>
                          </div>
                          <div className={styles.meta}>
                            <span>{passenger.busNumber}</span><span>{passenger.campus}</span><span>{passenger.phone}</span><span>명단 번호 {passenger.seatNumber || '-'}</span>
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
                        </div>
                        <div className={styles.actions}>
                          <button type="button" className={styles.boardButton} onClick={() => handleStatus(passenger, 'boarded')} disabled={isPassengerPending || passenger.boardingStatus === 'boarded'}><CheckCircle2 size={15} />탑승</button>
                          <button type="button" className={styles.noShowButton} title={!passengerBus?.departedAt ? '출발 완료 후 미탑승 처리할 수 있습니다.' : undefined} onClick={() => handleStatus(passenger, 'no_show')} disabled={isPassengerPending || passenger.boardingStatus === 'no_show' || !passengerBus?.departedAt}><UserX size={15} />미탑승</button>
                          <button type="button" className={styles.resetButton} onClick={() => handleStatus(passenger, 'unchecked')} disabled={isPassengerPending || passenger.boardingStatus === 'unchecked'}><CircleHelp size={15} />확인 대기로</button>
                        </div>
                        <form
                          className={styles.noteEditor}
                          onSubmit={(event) => {
                            event.preventDefault();
                            void handleNoteSave(passenger);
                          }}
                        >
                          <label htmlFor={`boarding-note-${passenger.reservationId}`}>비고</label>
                          <input
                            id={`boarding-note-${passenger.reservationId}`}
                            value={noteDraft}
                            maxLength={500}
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
