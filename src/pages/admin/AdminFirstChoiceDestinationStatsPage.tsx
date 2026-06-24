import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { supabase } from '../../lib/supabase';
import type { ReturnBusReservation, StationPreference } from '../../types/reservation';
import AdminHeader from './AdminHeader';
import styles from './AdminFirstChoiceDestinationStatsPage.module.css';

const RESERVATION_PAGE_SIZE = 1000;

interface ReservationRow {
  id: string;
  station_preferences: ReturnBusReservation['stationPreferences'] | null;
  status: ReturnBusReservation['status'] | null;
  data: Partial<ReturnBusReservation> | null;
  created_at: string | null;
}

interface DestinationSummaryRow {
  destination: string;
  count: number;
}

const getAllReservationRows = async (): Promise<ReservationRow[]> => {
  const rows: ReservationRow[] = [];
  let cursor: Pick<ReservationRow, 'created_at' | 'id'> | null = null;

  while (true) {
    let query = supabase
      .from('reservations')
      .select('id, station_preferences, status, data, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(RESERVATION_PAGE_SIZE);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
      );
    }

    const { data, error } = await query;

    if (error) throw error;

    const page = (data || []) as unknown as ReservationRow[];
    rows.push(...page);

    if (page.length < RESERVATION_PAGE_SIZE) return rows;
    cursor = page[page.length - 1];
  }
};

const getFirstChoiceDestination = (row: ReservationRow) => {
  const preferences = row.station_preferences ?? row.data?.stationPreferences ?? [];
  const firstPreference = preferences.find(
    (preference): preference is StationPreference =>
      preference?.rank === 1 && Boolean(preference.station?.name?.trim())
  );

  return firstPreference?.station.name.trim() ?? '';
};

const getDestinationSummary = (
  reservations: ReservationRow[]
): DestinationSummaryRow[] => {
  const countByDestination = new Map<string, number>();

  reservations.forEach((reservation) => {
    if (reservation.status === 'cancelled') return;

    const destination = getFirstChoiceDestination(reservation);
    if (!destination) return;

    countByDestination.set(destination, (countByDestination.get(destination) ?? 0) + 1);
  });

  return [...countByDestination.entries()]
    .map(([destination, count]) => ({ destination, count }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.destination.localeCompare(right.destination, 'ko')
    );
};

const AdminFirstChoiceDestinationStatsPage = () => {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadReservations = async () => {
      setRefreshing(true);
      setLoadError('');

      try {
        const reservationRows = await getAllReservationRows();

        if (!isMounted) return;
        setReservations(reservationRows);
        setLastUpdatedAt(new Date());
      } catch (error) {
        console.error('Failed to load first choice destination stats:', error);
        if (isMounted) {
          setLoadError(
            '1지망 행선지별 신청 현황을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void loadReservations();

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  const destinationRows = useMemo(
    () => getDestinationSummary(reservations),
    [reservations]
  );
  const totalFirstChoiceApplicants = useMemo(
    () => destinationRows.reduce((sum, row) => sum + row.count, 0),
    [destinationRows]
  );

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <AdminHeader />
        <main className={styles.main}>
          <div className={styles.loadingCard} aria-live="polite">
            <RefreshCw size={20} />
            <strong>1지망 신청 현황을 불러오는 중입니다.</strong>
            <span>전체 신청자 목록에서 행선지별 인원을 집계하고 있습니다.</span>
          </div>
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
          onClick={() => navigate('/admin/system')}
        >
          <ArrowLeft size={16} />
          관리자 도구
        </button>

        <section className={styles.hero}>
          <div className={styles.heroIcon}>
            <BarChart3 size={24} />
          </div>
          <div>
            <span>신청 현황</span>
            <h1>1지망 행선지별 신청 현황</h1>
            <p>
              전체 신청자 목록의 1지망 선택값을 기준으로 행선지별 신청 인원을
              확인합니다.
            </p>
          </div>
        </section>

        {loadError && (
          <section className={styles.errorBanner} role="alert">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              다시 시도
            </button>
          </section>
        )}

        <section className={styles.summaryPanel} aria-label="1지망 신청자 요약">
          <div>
            <span>전체 1지망 신청자 수</span>
            <strong>{totalFirstChoiceApplicants.toLocaleString()}명</strong>
          </div>
          <button
            type="button"
            className={styles.refreshButton}
            disabled={refreshing}
            onClick={() => setReloadKey((value) => value + 1)}
          >
            <RefreshCw size={15} />
            {refreshing ? '갱신 중...' : '새로고침'}
          </button>
          <p>
            {lastUpdatedAt
              ? `마지막 갱신 ${lastUpdatedAt.toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : '아직 갱신되지 않음'}
          </p>
        </section>

        <section className={styles.tablePanel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>행선지별 신청 인원</h2>
              <p>신청 인원이 많은 행선지부터 표시합니다.</p>
            </div>
            <strong>{destinationRows.length.toLocaleString()}개 행선지</strong>
          </div>

          {destinationRows.length === 0 ? (
            <div className={styles.emptyState}>
              신청자가 없거나 1지망 데이터가 없습니다.
            </div>
          ) : (
            <div
              className={styles.tableWrap}
              role="region"
              aria-label="1지망 행선지별 신청 인원 표"
              tabIndex={0}
            >
              <table className={styles.destinationTable}>
                <thead>
                  <tr>
                    <th>행선지명</th>
                    <th>1지망 신청 인원</th>
                  </tr>
                </thead>
                <tbody>
                  {destinationRows.map((row) => (
                    <tr key={row.destination}>
                      <td>{row.destination}</td>
                      <td>{row.count.toLocaleString()}명</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default AdminFirstChoiceDestinationStatsPage;
