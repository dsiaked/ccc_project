import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bus,
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import { getLatestConfirmedBusAllocation } from '../../lib/adminService';
import { supabase } from '../../lib/supabase';
import type {
  ConfirmedTicket,
  ReturnBusReservation,
  StationPreference,
} from '../../types/reservation';

import styles from './AdminAllocationResultPage.module.css';

type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'none';

interface PaymentRow {
  status: Exclude<PaymentStatus, 'none'>;
}

interface ReservationRow {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  campus: string | null;
  station_preferences: StationPreference[] | null;
  status: ReturnBusReservation['status'] | null;
  confirmed_ticket: ConfirmedTicket | null;
  data: Partial<ReturnBusReservation> | null;
  payments: PaymentRow[] | null;
}

interface ReservationItem {
  id: string;
  name: string;
  phone: string;
  campus: string;
  stationPreferences: StationPreference[];
  status: ReturnBusReservation['status'];
  confirmedTicket?: ConfirmedTicket;
  paymentStatus: PaymentStatus;
  isRemainingSeat: boolean;
  isAdminCreated: boolean;
}

interface AllocationRoute {
  busLabel: string;
  capacity: number;
  destinations?: Array<{ name: string }>;
}

interface AllocationBus {
  label: string;
  capacity: number;
  destination: string;
}

interface AllocationRow {
  allocation_data: {
    buses?: AllocationBus[];
    routePlan?: AllocationRoute[];
  } | null;
}

interface BusGroup {
  busNumber: string;
  capacity: number;
  passengers: ReservationItem[];
  destinations: string[];
  departureTime: string;
  boardingPlace: string;
  emptySeats: number;
  duplicateSeats: string[];
}

const PAGE_SIZE = 20;

const paymentLabels: Record<PaymentStatus, string> = {
  completed: '입금 완료',
  pending: '미입금',
  refunded: '환불',
  none: '결제 정보 없음',
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '배차 결과를 불러오지 못했습니다.';

const seatValue = (seatNumber?: string) => {
  const parsed = Number.parseInt(seatNumber ?? '', 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const toReservationItem = (
  row: ReservationRow,
  adminCreatedUserIds: Set<string>
): ReservationItem => {
  const saved = row.data ?? {};

  return {
    id: row.id,
    name: saved.name ?? row.name ?? '-',
    phone: saved.phone ?? row.phone ?? '-',
    campus: saved.campus ?? row.campus ?? '-',
    stationPreferences:
      saved.stationPreferences ?? row.station_preferences ?? [],
    status: row.status ?? saved.status ?? 'requested',
    confirmedTicket:
      row.confirmed_ticket ?? saved.confirmedTicket ?? undefined,
    paymentStatus: row.payments?.[0]?.status ?? 'none',
    isRemainingSeat: Boolean(saved.remainingSeatClaim),
    isAdminCreated: adminCreatedUserIds.has(row.user_id),
  };
};

const csvCell = (value: string | number) =>
  `"${String(value).replaceAll('"', '""')}"`;

const getVisiblePages = (currentPage: number, totalPages: number) => {
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

const Pagination = ({
  page,
  totalItems,
  onChange,
}: {
  page: number;
  totalItems: number;
  onChange: (page: number) => void;
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * PAGE_SIZE, totalItems);

  if (totalItems <= PAGE_SIZE) return null;

  return (
    <div className={styles.pagination}>
      <span>
        {startItem}-{endItem} / {totalItems}명
      </span>
      <div className={styles.pageButtons}>
        <button
          type="button"
          aria-label="이전 페이지"
          disabled={currentPage === 1}
          onClick={() => onChange(currentPage - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        {getVisiblePages(currentPage, totalPages).map((pageNumber) => (
          <button
            type="button"
            key={pageNumber}
            className={pageNumber === currentPage ? styles.activePage : undefined}
            aria-label={`${pageNumber} 페이지`}
            aria-current={pageNumber === currentPage ? 'page' : undefined}
            onClick={() => onChange(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          aria-label="다음 페이지"
          disabled={currentPage === totalPages}
          onClick={() => onChange(currentPage + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

const AdminAllocationResultPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationAllocation = (
    location.state as { allocation?: { routePlan?: AllocationRoute[] } } | null
  )?.allocation;
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [routes, setRoutes] = useState<AllocationRoute[]>([]);
  const [selectedBusNumber, setSelectedBusNumber] = useState('');
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [destinationFilter, setDestinationFilter] = useState('all');
  const [passengerPage, setPassengerPage] = useState(1);
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const [latestAllocation, reservationResult] = await Promise.all([
        getLatestConfirmedBusAllocation(),
        supabase
          .from('reservations')
          .select(
            'id, user_id, name, phone, campus, station_preferences, status, confirmed_ticket, data, payments(status)'
          )
          .order('created_at', { ascending: true }),
      ]);

      if (reservationResult.error) throw reservationResult.error;

      const profileResult = await supabase
        .from('profiles')
        .select('id, account_source')
        .eq('account_source', 'admin_created');
      const adminCreatedUserIds = new Set(
        (profileResult.data ?? []).map((profile) => profile.id)
      );

      const allocationData = (latestAllocation as AllocationRow | null)
        ?.allocation_data;
      const workspaceRoutes = allocationData?.buses?.map((bus) => ({
        busLabel: bus.label,
        capacity: bus.capacity,
        destinations: [{ name: bus.destination }],
      }));
      setRoutes(
        navigationAllocation?.routePlan ??
          workspaceRoutes ??
          allocationData?.routePlan ??
          []
      );
      setReservations(
        ((reservationResult.data ?? []) as unknown as ReservationRow[]).map(
          (reservation) => toReservationItem(reservation, adminCreatedUserIds)
        )
      );
    } catch (error) {
      console.error('Failed to load allocation result:', error);
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [navigationAllocation]);

  useEffect(() => {
    // Initial page load synchronizes external Supabase data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  const confirmedPassengers = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          reservation.status === 'confirmed' && reservation.confirmedTicket
      ),
    [reservations]
  );

  const busGroups = useMemo<BusGroup[]>(() => {
    const routeByBus = new Map(routes.map((route) => [route.busLabel, route]));
    const groups = new Map<string, ReservationItem[]>();

    confirmedPassengers.forEach((reservation) => {
      const busNumber = reservation.confirmedTicket?.busNumber?.trim();
      if (!busNumber) return;
      groups.set(busNumber, [...(groups.get(busNumber) ?? []), reservation]);
    });

    return [...groups.entries()]
      .map(([busNumber, passengers]) => {
        const sortedPassengers = [...passengers].sort(
          (a, b) =>
            seatValue(a.confirmedTicket?.seatNumber) -
              seatValue(b.confirmedTicket?.seatNumber) ||
            a.name.localeCompare(b.name, 'ko')
        );
        const route = routeByBus.get(busNumber);
        const maxSeat = sortedPassengers.reduce(
          (maximum, passenger) =>
            Math.max(
              maximum,
              seatValue(passenger.confirmedTicket?.seatNumber) ===
                Number.MAX_SAFE_INTEGER
                ? 0
                : seatValue(passenger.confirmedTicket?.seatNumber)
            ),
          0
        );
        const capacity =
          route?.capacity && route.capacity > 0
            ? route.capacity
            : Math.max(maxSeat, sortedPassengers.length);
        const seatCounts = new Map<string, number>();
        sortedPassengers.forEach((passenger) => {
          const seat = passenger.confirmedTicket?.seatNumber?.trim();
          if (seat) seatCounts.set(seat, (seatCounts.get(seat) ?? 0) + 1);
        });

        return {
          busNumber,
          capacity,
          passengers: sortedPassengers,
          destinations: [
            ...new Set(
              sortedPassengers
                .map(
                  (passenger) => passenger.confirmedTicket?.dropoffStation ?? ''
                )
                .filter(Boolean)
            ),
          ],
          departureTime:
            sortedPassengers[0]?.confirmedTicket?.departureTime ?? '-',
          boardingPlace:
            sortedPassengers[0]?.confirmedTicket?.boardingPlace ?? '-',
          emptySeats: Math.max(0, capacity - sortedPassengers.length),
          duplicateSeats: [...seatCounts.entries()]
            .filter(([, count]) => count > 1)
            .map(([seat]) => seat),
        };
      })
      .sort((a, b) =>
        a.busNumber.localeCompare(b.busNumber, 'ko', { numeric: true })
      );
  }, [confirmedPassengers, routes]);

  const effectiveSelectedBusNumber = busGroups.some(
    (bus) => bus.busNumber === selectedBusNumber
  )
    ? selectedBusNumber
    : busGroups[0]?.busNumber ?? '';
  const selectedBus =
    busGroups.find((bus) => bus.busNumber === effectiveSelectedBusNumber) ??
    null;

  const unassigned = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          reservation.status !== 'cancelled' && !reservation.confirmedTicket
      ),
    [reservations]
  );

  const filteredPassengers = useMemo(() => {
    if (!selectedBus) return [];
    const keyword = search.replaceAll(/\s/g, '').toLowerCase();

    return selectedBus.passengers.filter((passenger) => {
      const ticket = passenger.confirmedTicket;
      const searchable = [
        passenger.name,
        passenger.campus,
        passenger.phone,
      ]
        .join('')
        .replaceAll(/\s/g, '')
        .toLowerCase();

      return (
        (!keyword || searchable.includes(keyword)) &&
        (paymentFilter === 'all' ||
          passenger.paymentStatus === paymentFilter) &&
        (destinationFilter === 'all' ||
          ticket?.dropoffStation === destinationFilter)
      );
    });
  }, [destinationFilter, paymentFilter, search, selectedBus]);

  const effectivePassengerPage = Math.min(
    passengerPage,
    Math.max(1, Math.ceil(filteredPassengers.length / PAGE_SIZE))
  );
  const pagedPassengers = filteredPassengers.slice(
    (effectivePassengerPage - 1) * PAGE_SIZE,
    effectivePassengerPage * PAGE_SIZE
  );
  const effectiveUnassignedPage = Math.min(
    unassignedPage,
    Math.max(1, Math.ceil(unassigned.length / PAGE_SIZE))
  );
  const pagedUnassigned = unassigned.slice(
    (effectiveUnassignedPage - 1) * PAGE_SIZE,
    effectiveUnassignedPage * PAGE_SIZE
  );

  const summary = useMemo(
    () => ({
      buses: busGroups.length,
      confirmed: confirmedPassengers.length,
      unassigned: unassigned.length,
      empty: busGroups.reduce((sum, bus) => sum + bus.emptySeats, 0),
    }),
    [busGroups, confirmedPassengers.length, unassigned.length]
  );

  const warnings = useMemo(() => {
    const result: string[] = [];
    const duplicateCount = busGroups.reduce(
      (sum, bus) => sum + bus.duplicateSeats.length,
      0
    );
    const overCapacity = busGroups.filter(
      (bus) => bus.passengers.length > bus.capacity
    );
    const unpaid = confirmedPassengers.filter(
      (passenger) => passenger.paymentStatus !== 'completed'
    );

    if (summary.empty > 0) result.push(`빈 좌석 ${summary.empty}석`);
    if (duplicateCount > 0) result.push(`중복 좌석 ${duplicateCount}건`);
    if (overCapacity.length > 0)
      result.push(`정원 초과 버스 ${overCapacity.length}대`);
    if (unpaid.length > 0) result.push(`미입금 확정자 ${unpaid.length}명`);
    return result;
  }, [busGroups, confirmedPassengers, summary.empty]);

  const downloadCsv = () => {
    const rows = [
      ['호차', '좌석', '이름', '캠퍼스', '연락처', '입금 상태', '행선지'],
      ...busGroups.flatMap((bus) =>
        bus.passengers.map((passenger) => [
          bus.busNumber,
          passenger.confirmedTicket?.seatNumber ?? '',
          passenger.name,
          passenger.isRemainingSeat ? '잔여좌석' : '일반 배정',
          passenger.isAdminCreated ? '관리자 추가' : '직접 가입',
          passenger.campus,
          passenger.phone,
          paymentLabels[passenger.paymentStatus],
          passenger.confirmedTicket?.dropoffStation ?? '',
        ])
      ),
    ];
    rows[0].splice(3, 0, '신청 구분');
    rows[0].splice(4, 0, '계정 구분');
    const blob = new Blob(
      ['\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')],
      { type: 'text/csv;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'allocation-result.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.page}>
      <AdminHeader />
      <main className={styles.main}>
        <div className={styles.titleRow}>
          <div>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => navigate('/admin/allocation')}
            >
              <ArrowLeft size={16} />
              배차 계산
            </button>
            <h1>배차 결과</h1>
            <p>확정된 호차별 좌석과 탑승 명단을 검토합니다.</p>
          </div>
          <div className={styles.titleActions}>
            <button type="button" onClick={() => void loadData()}>
              <RefreshCw size={16} />
              새로고침
            </button>
            <button type="button" onClick={downloadCsv}>
              <Download size={16} />
              CSV
            </button>
          </div>
        </div>

        {loadError && (
          <div className={styles.errorBox}>
            <AlertTriangle size={18} />
            <span>{loadError}</span>
          </div>
        )}

        <section className={styles.summaryGrid} aria-label="배차 결과 요약">
          {[
            ['총 버스 수', summary.buses, '대'],
            ['확정 탑승자', summary.confirmed, '명'],
            ['미배차 신청자', summary.unassigned, '명'],
            ['빈 좌석', summary.empty, '석'],
          ].map(([label, value, unit]) => (
            <div key={label} className={styles.summaryItem}>
              <span>{label}</span>
              <strong>
                {value}
                <small>{unit}</small>
              </strong>
            </div>
          ))}
        </section>

        {warnings.length > 0 && (
          <div className={styles.warningBar}>
            <AlertTriangle size={18} />
            {warnings.map((warning) => (
              <span key={warning}>{warning}</span>
            ))}
          </div>
        )}

        {loading ? (
          <div className={styles.emptyState}>배차 결과를 불러오는 중입니다.</div>
        ) : busGroups.length === 0 ? (
          <div className={styles.emptyState}>
            확정 버스표가 있는 배차 결과가 없습니다.
          </div>
        ) : (
          <>
            <section className={styles.busSection}>
              <div className={styles.sectionHeading}>
                <Bus size={19} />
                <h2>버스별 현황</h2>
              </div>
              <div className={styles.busTabs}>
                {busGroups.map((bus) => (
                  <button
                    type="button"
                    key={bus.busNumber}
                    className={
                      bus.busNumber === effectiveSelectedBusNumber
                        ? styles.activeBus
                        : undefined
                    }
                    onClick={() => {
                      setSelectedBusNumber(bus.busNumber);
                      setPassengerPage(1);
                    }}
                  >
                    <strong>{bus.busNumber}</strong>
                    <span>
                      {bus.passengers.length}/{bus.capacity}명 · 빈 좌석{' '}
                      {bus.emptySeats}
                    </span>
                    <small>{bus.destinations.join(' · ') || '행선지 미지정'}</small>
                  </button>
                ))}
              </div>
            </section>

            {selectedBus && (
              <>
                <section className={styles.busDetail}>
                  <div className={styles.sectionHeading}>
                    <Bus size={19} />
                    <h2>{selectedBus.busNumber} 좌석 배치</h2>
                  </div>
                  <div className={styles.busMeta}>
                    <span>정원 {selectedBus.capacity}명</span>
                    <span>탑승 {selectedBus.passengers.length}명</span>
                    <span>출발 {selectedBus.departureTime}</span>
                    <span>탑승 장소 {selectedBus.boardingPlace}</span>
                  </div>
                  <div className={styles.legend}>
                    <span><i className={styles.assignedDot} />배정</span>
                    <span><i className={styles.emptyDot} />빈 좌석</span>
                    <span><i className={styles.unpaidDot} />미입금</span>
                    <span><i className={styles.remainingSeatDot} />잔여좌석 신청자</span>
                    <span><i className={styles.adminCreatedDot} />관리자 추가 계정</span>
                  </div>
                  <div className={styles.seatMap}>
                    {Array.from({ length: selectedBus.capacity }, (_, index) => {
                      const seatNumber = String(index + 1);
                      const passenger = selectedBus.passengers.find(
                        (item) => item.confirmedTicket?.seatNumber === seatNumber
                      );
                      const duplicate =
                        selectedBus.duplicateSeats.includes(seatNumber);
                      const unpaid =
                        passenger && passenger.paymentStatus !== 'completed';

                      return (
                        <div
                          key={seatNumber}
                          className={[
                            styles.seat,
                            passenger ? styles.assignedSeat : styles.emptySeat,
                            unpaid ? styles.unpaidSeat : '',
                            duplicate ? styles.duplicateSeat : '',
                          ].join(' ')}
                        >
                          <span>{seatNumber}</span>
                          <strong>{passenger?.name ?? '빈 좌석'}</strong>
                          {passenger?.isRemainingSeat && (
                            <small className={styles.remainingSeatLabel}>잔여좌석</small>
                          )}
                          {passenger?.isAdminCreated && (
                            <small className={styles.adminCreatedLabel}>관리자 추가</small>
                          )}
                          {unpaid && <small>미입금</small>}
                          {duplicate && <small>중복</small>}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className={styles.listSection}>
                  <div className={styles.sectionHeading}>
                    <Users size={19} />
                    <h2>{selectedBus.busNumber} 탑승자 명단</h2>
                    <span>{filteredPassengers.length}명</span>
                  </div>
                  <div className={styles.filters}>
                    <label className={styles.searchBox}>
                      <Search size={16} />
                      <input
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value);
                          setPassengerPage(1);
                        }}
                        placeholder="이름, 캠퍼스, 연락처 검색"
                      />
                    </label>
                    <select
                      value={paymentFilter}
                      onChange={(event) => {
                        setPaymentFilter(event.target.value);
                        setPassengerPage(1);
                      }}
                      aria-label="입금 상태 필터"
                    >
                      <option value="all">모든 입금 상태</option>
                      <option value="completed">입금 완료</option>
                      <option value="pending">미입금</option>
                      <option value="refunded">환불</option>
                      <option value="none">결제 정보 없음</option>
                    </select>
                    <select
                      value={destinationFilter}
                      onChange={(event) => {
                        setDestinationFilter(event.target.value);
                        setPassengerPage(1);
                      }}
                      aria-label="행선지 필터"
                    >
                      <option value="all">모든 행선지</option>
                      {selectedBus.destinations.map((destination) => (
                        <option key={destination} value={destination}>
                          {destination}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>좌석</th>
                          <th>이름</th>
                          <th>캠퍼스</th>
                          <th>연락처</th>
                          <th>결제</th>
                          <th>확정 행선지</th>
                          <th>수정</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedPassengers.map((passenger) => (
                          <tr key={passenger.id}>
                            <td>{passenger.confirmedTicket?.seatNumber ?? '-'}</td>
                            <td>
                              <span className={styles.passengerName}>
                                {passenger.name}
                                {passenger.isRemainingSeat && (
                                  <small className={styles.remainingSeatBadge}>잔여좌석</small>
                                )}
                                {passenger.isAdminCreated && (
                                  <small className={styles.adminCreatedBadge}>관리자 추가</small>
                                )}
                              </span>
                            </td>
                            <td>{passenger.campus}</td>
                            <td>{passenger.phone}</td>
                            <td>
                              <span
                                className={`${styles.paymentBadge} ${
                                  styles[passenger.paymentStatus]
                                }`}
                              >
                                {paymentLabels[passenger.paymentStatus]}
                              </span>
                            </td>
                            <td>
                              {passenger.confirmedTicket?.dropoffStation ?? '-'}
                            </td>
                            <td>
                              <button
                                type="button"
                                className={styles.iconButton}
                                title="사용자 관리에서 수정"
                                onClick={() => navigate('/admin/users')}
                              >
                                <Pencil size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={effectivePassengerPage}
                    totalItems={filteredPassengers.length}
                    onChange={setPassengerPage}
                  />
                </section>
              </>
            )}
          </>
        )}

        <section className={styles.listSection}>
          <div className={styles.sectionHeading}>
            <AlertTriangle size={19} />
            <h2>미배차 신청자</h2>
            <span>{unassigned.length}명</span>
          </div>
          {unassigned.length === 0 ? (
            <div className={styles.inlineEmpty}>미배차 신청자가 없습니다.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>캠퍼스</th>
                    <th>1지망</th>
                    <th>2지망</th>
                    <th>미배차 사유</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedUnassigned.map((reservation) => (
                    <tr key={reservation.id}>
                      <td>{reservation.name}</td>
                      <td>{reservation.campus}</td>
                      {([1, 2] as const).map((rank) => (
                        <td key={rank}>
                          {reservation.stationPreferences.find(
                            (preference) => preference.rank === rank
                          )?.station.name ?? '-'}
                        </td>
                      ))}
                      <td>
                        {reservation.stationPreferences.length === 0
                          ? '행선지 선호 정보 없음'
                          : '배차 가능한 좌석 또는 선호 행선지 미매칭'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={effectiveUnassignedPage}
            totalItems={unassigned.length}
            onChange={setUnassignedPage}
          />
        </section>
      </main>
    </div>
  );
};

export default AdminAllocationResultPage;
