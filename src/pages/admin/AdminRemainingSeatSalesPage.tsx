import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, RefreshCw, Search, Ticket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import { getAdminRole, getBusAllocations } from '../../lib/adminService';
import { supabase } from '../../lib/supabase';
import type {
  ConfirmedTicket,
  ReturnBusReservation,
  StationPreference,
} from '../../types/reservation';

import styles from './AdminRemainingSeatSalesPage.module.css';

interface AllocationRow {
  id: string;
  allocation_name: string;
  allocation_data: AllocationData | null;
  total_cost: number | null;
  total_capacity: number | null;
  created_at: string | null;
}

interface AllocationData {
  totalCapacity?: number;
  emptySeats?: number;
  totalBuses?: number;
  routePlan?: AllocationRoute[];
}

interface AllocationRoute {
  busLabel: string;
  capacity: number;
  passengerCount: number;
  emptySeats: number;
  destinations: Array<{
    name: string;
    passengerCount: number;
    rank2Demand: number;
  }>;
}

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

interface RouteSeatStatus {
  route: AllocationRoute;
  soldCount: number;
  remainingForSale: number;
}

const SALE_NOTE_PREFIX = '잔여석 판매';

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

const removeUndefinedValues = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const normalize = (value: string) => value.replace(/\s/g, '').toLowerCase();

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

const getPreferenceRank = (
  reservation: ReservationItem,
  destinationNames: string[]
) => {
  const destinationSet = new Set(destinationNames);
  const matchedPreference = reservation.stationPreferences
    .filter((preference) => destinationSet.has(preference.station.name))
    .sort((a, b) => a.rank - b.rank)[0];

  return matchedPreference?.rank ?? null;
};

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

const AdminRemainingSeatSalesPage = () => {
  const navigate = useNavigate();
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [selectedAllocationId, setSelectedAllocationId] = useState('');
  const [selectedBusLabel, setSelectedBusLabel] = useState('');
  const [selectedReservationId, setSelectedReservationId] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [boardingPlace, setBoardingPlace] = useState('');
  const [seatNumber, setSeatNumber] = useState('');
  const [managerNote, setManagerNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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

      const [allocationData, reservationResult] = await Promise.all([
        getBusAllocations(),
        supabase
          .from('reservations')
          .select(
            'id, user_id, name, phone, district, team, campus, station_preferences, status, confirmed_ticket, data, created_at, updated_at'
          )
          .order('created_at', { ascending: false }),
      ]);

      if (reservationResult.error) throw reservationResult.error;

      const nextAllocations = (allocationData ?? []) as AllocationRow[];
      const nextReservations = ((reservationResult.data ?? []) as ReservationRow[])
        .map(toReservationItem);

      setAllocations(nextAllocations);
      setReservations(nextReservations);

      const firstAllocationId = selectedAllocationId || nextAllocations[0]?.id || '';
      setSelectedAllocationId(firstAllocationId);
    } catch (error) {
      console.error('잔여좌석 판매 데이터 조회 실패:', error);
      setLoadError(getErrorMessage(error));
      setAllocations([]);
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

  const selectedAllocation = useMemo(
    () =>
      allocations.find((allocation) => allocation.id === selectedAllocationId) ??
      null,
    [allocations, selectedAllocationId]
  );

  const routeStatuses = useMemo<RouteSeatStatus[]>(() => {
    const routes = selectedAllocation?.allocation_data?.routePlan ?? [];

    return routes.map((route) => {
      const soldCount = reservations.filter((reservation) => {
        const ticket = reservation.confirmedTicket;

        return (
          ticket?.busNumber === route.busLabel &&
          ticket.managerNote?.includes(SALE_NOTE_PREFIX) &&
          ticket.managerNote?.includes(selectedAllocation?.allocation_name ?? '')
        );
      }).length;

      return {
        route,
        soldCount,
        remainingForSale: Math.max(0, route.emptySeats - soldCount),
      };
    });
  }, [reservations, selectedAllocation]);

  const selectedRouteStatus =
    routeStatuses.find((item) => item.route.busLabel === selectedBusLabel) ??
    routeStatuses.find((item) => item.remainingForSale > 0) ??
    routeStatuses[0] ??
    null;

  const selectedRoute = selectedRouteStatus?.route ?? null;
  const routeDestinationNames = useMemo(
    () => selectedRoute?.destinations.map((destination) => destination.name) ?? [],
    [selectedRoute]
  );

  const candidateReservations = useMemo(() => {
    const keyword = normalize(searchKeyword);

    if (!selectedRoute) return [];

    return reservations
      .filter((reservation) => {
        if (reservation.status === 'cancelled') return false;
        if (reservation.confirmedTicket) return false;

        const rank = getPreferenceRank(reservation, routeDestinationNames);
        const searchTarget = normalize(
          [
            reservation.name,
            reservation.phone,
            reservation.district,
            reservation.team,
            reservation.campus,
            reservation.stationPreferences
              .map((preference) => preference.station.name)
              .join(' '),
          ].join(' ')
        );

        return Boolean(rank) && (!keyword || searchTarget.includes(keyword));
      })
      .sort((a, b) => {
        const aRank = getPreferenceRank(a, routeDestinationNames) ?? 99;
        const bRank = getPreferenceRank(b, routeDestinationNames) ?? 99;

        return (
          aRank - bRank ||
          a.requestedAt.localeCompare(b.requestedAt) ||
          a.name.localeCompare(b.name, 'ko')
        );
      });
  }, [reservations, routeDestinationNames, searchKeyword, selectedRoute]);

  const selectedReservation =
    candidateReservations.find(
      (reservation) => reservation.id === selectedReservationId
    ) ?? candidateReservations[0] ?? null;

  const totalRemainingForSale = routeStatuses.reduce(
    (sum, item) => sum + item.remainingForSale,
    0
  );
  const totalSold = routeStatuses.reduce((sum, item) => sum + item.soldCount, 0);

  const handleSelectAllocation = (allocationId: string) => {
    setSelectedAllocationId(allocationId);
    setSelectedBusLabel('');
    setSelectedReservationId('');
  };

  const handleSelectRoute = (busLabel: string) => {
    setSelectedBusLabel(busLabel);
    setSelectedReservationId('');
    setSeatNumber('');
  };

  const handleConfirmSale = async () => {
    if (!selectedAllocation || !selectedRouteStatus || !selectedReservation) {
      alert('판매할 버스와 신청자를 선택해주세요.');
      return;
    }

    if (selectedRouteStatus.remainingForSale <= 0) {
      alert('선택한 버스에는 판매 가능한 잔여좌석이 없습니다.');
      return;
    }

    const trimmedDepartureTime = departureTime.trim();
    const trimmedBoardingPlace = boardingPlace.trim();

    if (!trimmedDepartureTime || !trimmedBoardingPlace) {
      alert('출발 시간과 탑승 장소를 입력해주세요.');
      return;
    }

    const destinationName =
      routeDestinationNames[0] ||
      selectedReservation.stationPreferences[0]?.station.name ||
      '현장 안내';
    const noteParts = [
      `${SALE_NOTE_PREFIX} · ${selectedAllocation.allocation_name}`,
      managerNote.trim(),
    ].filter(Boolean);
    const confirmedTicket: ConfirmedTicket = {
      busNumber: selectedRouteStatus.route.busLabel,
      departureTime: trimmedDepartureTime,
      boardingPlace: trimmedBoardingPlace,
      dropoffStation: destinationName,
      managerNote: noteParts.join(' / '),
      confirmedAt: new Date().toISOString(),
    };
    const trimmedSeatNumber = seatNumber.trim();

    if (trimmedSeatNumber) {
      confirmedTicket.seatNumber = trimmedSeatNumber;
    }

    const nextData = buildReservationData(selectedReservation, confirmedTicket);
    const cleanTicket = removeUndefinedValues(confirmedTicket);
    const cleanData = removeUndefinedValues(nextData);

    setSaving(true);

    try {
      const { error } = await supabase
        .from('reservations')
        .update({
          status: 'confirmed',
          confirmed_ticket: cleanTicket,
          data: cleanData,
          updated_at: cleanData.updatedAt,
        })
        .eq('id', selectedReservation.dbId);

      if (error) throw error;

      setReservations((prev) =>
        prev.map((reservation) =>
          reservation.id === selectedReservation.id
            ? {
                ...reservation,
                status: 'confirmed',
                confirmedTicket: cleanTicket,
                updatedAt: cleanData.updatedAt,
                rawData: cleanData,
              }
            : reservation
        )
      );
      setSelectedReservationId('');
      setSeatNumber('');

      alert('잔여좌석 판매를 확정했습니다.');
    } catch (error) {
      console.error('잔여좌석 판매 확정 실패:', error);
      alert(`잔여좌석 판매 확정 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <AdminHeader />
        <main className={styles.main}>
          <p>로딩 중...</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />

      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/admin/global')}
        >
          <ArrowLeft size={18} />
          전체 관리자 화면
        </button>

        <section className={styles.header}>
          <div className={styles.headerIcon}>
            <Ticket size={28} />
          </div>
          <div>
            <h1>잔여좌석 판매</h1>
            <p>
              저장된 배차안의 남는 좌석을 확인하고, 미확정 신청자에게 추가
              판매 좌석을 확정합니다.
            </p>
          </div>
        </section>

        <section className={styles.controlPanel}>
          <label>
            <span>기준 배차안</span>
            <select
              value={selectedAllocationId}
              onChange={(event) => handleSelectAllocation(event.target.value)}
            >
              {allocations.length === 0 ? (
                <option value="">저장된 배차안 없음</option>
              ) : (
                allocations.map((allocation) => (
                  <option key={allocation.id} value={allocation.id}>
                    {allocation.allocation_name}
                  </option>
                ))
              )}
            </select>
          </label>

          <button type="button" onClick={() => void loadData()}>
            <RefreshCw size={16} />
            새로고침
          </button>
        </section>

        {loadError && (
          <section className={styles.loadErrorBox}>
            <div>
              <strong>잔여좌석 판매 데이터를 불러올 수 없습니다.</strong>
              <p>{loadError}</p>
              {loadError.includes('bus_allocations') && (
                <small>
                  Supabase SQL Editor에서 sql/setup/52_fix_bus_allocations_policies.sql을
                  실행한 뒤 새로고침해주세요.
                </small>
              )}
            </div>
            <button type="button" onClick={() => void loadData()}>
              다시 불러오기
            </button>
          </section>
        )}

        <section className={styles.summaryGrid}>
          <div>
            <span>총 잔여 판매 가능</span>
            <strong>{totalRemainingForSale}석</strong>
          </div>
          <div>
            <span>잔여석 판매 완료</span>
            <strong>{totalSold}석</strong>
          </div>
          <div>
            <span>운영 버스</span>
            <strong>{routeStatuses.length}대</strong>
          </div>
          <div>
            <span>판매 후보</span>
            <strong>{candidateReservations.length}명</strong>
          </div>
        </section>

        {routeStatuses.length === 0 ? (
          <section className={styles.emptyState}>
            저장된 배차안이 없거나 배차안에 버스별 계획이 없습니다. 먼저 최적
            배차 화면에서 추천안을 저장해주세요.
          </section>
        ) : (
          <div className={styles.contentGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>버스별 잔여좌석</h2>
                <span>{selectedAllocation?.allocation_name}</span>
              </div>

              <div className={styles.routeList}>
                {routeStatuses.map((item) => (
                  <button
                    type="button"
                    key={item.route.busLabel}
                    className={`${styles.routeCard} ${
                      selectedRoute?.busLabel === item.route.busLabel
                        ? styles.selectedRoute
                        : ''
                    }`}
                    onClick={() => handleSelectRoute(item.route.busLabel)}
                  >
                    <div>
                      <strong>{item.route.busLabel}</strong>
                      <p>
                        {item.route.destinations
                          .map((destination) => destination.name)
                          .join(' / ') || '도착역 없음'}
                      </p>
                    </div>
                    <span>
                      {item.remainingForSale}석 남음
                      <small>판매 {item.soldCount}석</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>추가 판매 확정</h2>
                <span>{selectedRoute?.busLabel || '버스 선택'}</span>
              </div>

              <div className={styles.formGrid}>
                <label>
                  <span>출발 시간</span>
                  <input
                    value={departureTime}
                    onChange={(event) => setDepartureTime(event.target.value)}
                    placeholder="예: 2026. 8. 1. 14:00"
                  />
                </label>
                <label>
                  <span>탑승 장소</span>
                  <input
                    value={boardingPlace}
                    onChange={(event) => setBoardingPlace(event.target.value)}
                    placeholder="예: 본부 앞 버스 승강장"
                  />
                </label>
                <label>
                  <span>좌석번호</span>
                  <input
                    value={seatNumber}
                    onChange={(event) => setSeatNumber(event.target.value)}
                    placeholder="미입력 시 현장 안내"
                  />
                </label>
                <label>
                  <span>관리 메모</span>
                  <input
                    value={managerNote}
                    onChange={(event) => setManagerNote(event.target.value)}
                    placeholder="선택 입력"
                  />
                </label>
              </div>

              <div className={styles.searchBox}>
                <Search size={16} />
                <input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="이름, 전화번호, 캠퍼스, 희망역 검색"
                />
              </div>

              <div className={styles.candidateList}>
                {candidateReservations.length === 0 ? (
                  <p className={styles.emptyText}>
                    선택한 버스 도착역과 매칭되는 미확정 신청자가 없습니다.
                  </p>
                ) : (
                  candidateReservations.map((reservation) => {
                    const rank = getPreferenceRank(
                      reservation,
                      routeDestinationNames
                    );

                    return (
                      <button
                        type="button"
                        key={reservation.id}
                        className={`${styles.candidateCard} ${
                          selectedReservation?.id === reservation.id
                            ? styles.selectedCandidate
                            : ''
                        }`}
                        onClick={() => setSelectedReservationId(reservation.id)}
                      >
                        <div>
                          <strong>{reservation.name || '이름 없음'}</strong>
                          <p>
                            {reservation.campus || '캠퍼스 없음'} ·{' '}
                            {reservation.phone || '연락처 없음'}
                          </p>
                        </div>
                        <span>{rank ? `${rank}지망` : '매칭 없음'}</span>
                      </button>
                    );
                  })
                )}
              </div>

              <button
                type="button"
                className={styles.confirmButton}
                onClick={handleConfirmSale}
                disabled={
                  saving ||
                  !selectedReservation ||
                  !selectedRouteStatus ||
                  selectedRouteStatus.remainingForSale <= 0
                }
              >
                <CheckCircle2 size={18} />
                {saving ? '확정 중...' : '잔여좌석 판매 확정'}
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminRemainingSeatSalesPage;
