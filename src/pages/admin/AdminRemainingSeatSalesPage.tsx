import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  Bus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  RefreshCw,
  Ticket,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import { getLatestConfirmedBusAllocation } from '../../lib/adminService';
import {
  cancelRemainingSeatClaim,
  confirmRemainingSeatPayment,
  getRemainingSeatSalesSettings,
  updateRemainingSeatSalesSettings,
  type RemainingSeatSalesSettings,
} from '../../lib/remainingSeatService';
import { supabase } from '../../lib/supabase';
import type { RemainingSeatClaim, ReturnBusReservation } from '../../types/reservation';
import { formatKoreanDateTime } from '../../utils/dateTime';
import { formatBusLabel } from '../../utils/busLabel';

import styles from './AdminRemainingSeatSalesPage.module.css';

interface AllocationBus {
  id: string;
  label: string;
  capacity: number;
  price?: number;
  destination: string;
  departureTime: string;
  boardingPlace: string;
}

interface AllocationPassenger {
  reservationId: string;
  busId: string | null;
}

interface AllocationData {
  buses?: AllocationBus[];
  passengers?: AllocationPassenger[];
}

interface AllocationRow {
  id: string;
  allocation_name: string;
  allocation_data: AllocationData | null;
}

interface ReservationRow {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  campus: string | null;
  status: ReturnBusReservation['status'] | null;
  data: Partial<ReturnBusReservation> | null;
}

interface ClaimItem {
  reservationId: string;
  userId: string;
  name: string;
  phone: string;
  campus: string;
  reservationStatus: ReturnBusReservation['status'];
  claim: RemainingSeatClaim;
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';

const AdminRemainingSeatSalesPage = () => {
  const navigate = useNavigate();
  const [allocation, setAllocation] = useState<AllocationRow | null>(null);
  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [settings, setSettings] = useState<RemainingSeatSalesSettings>({
    enabled: true,
    hiddenBusIds: [],
  });
  const [paymentInfo, setPaymentInfo] = useState({ account: '', price: 0 });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [loadError, setLoadError] = useState('');
  const [completedOpen, setCompletedOpen] = useState(false);

  const loadData = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
      setLoadError('');
    }

    try {
      const [latestAllocation, reservationResult, nextSettings, paymentSettingResult] = await Promise.all([
        getLatestConfirmedBusAllocation(),
        supabase
          .from('reservations')
          .select('id, user_id, name, phone, campus, status, data')
          .order('created_at', { ascending: false }),
        getRemainingSeatSalesSettings(),
        supabase
          .from('app_settings')
          .select('key, value')
          .in('key', ['bus_ticket_price', 'seoul_district_transfer_account']),
      ]);

      if (reservationResult.error) throw reservationResult.error;
      if (paymentSettingResult.error) throw paymentSettingResult.error;

      const nextClaims = ((reservationResult.data ?? []) as ReservationRow[])
        .filter((row) => row.data?.remainingSeatClaim)
        .map((row): ClaimItem => ({
          reservationId: row.id,
          userId: row.user_id,
          name: row.data?.name ?? row.name ?? '',
          phone: row.data?.phone ?? row.phone ?? '',
          campus: row.data?.campus ?? row.campus ?? '',
          reservationStatus: row.status ?? 'requested',
          claim: row.data?.remainingSeatClaim as RemainingSeatClaim,
        }));

      setAllocation(latestAllocation as AllocationRow | null);
      setClaims(nextClaims);
      setSettings(nextSettings);
      const paymentSettings = Object.fromEntries(
        (paymentSettingResult.data ?? []).map((item) => [item.key, item.value])
      ) as Record<string, Record<string, unknown>>;
      setPaymentInfo({
        account: String(
          paymentSettings.seoul_district_transfer_account?.account_number ?? ''
        ),
        price: Number(paymentSettings.bus_ticket_price?.price ?? 0),
      });
    } catch (error) {
      console.error('잔여 좌석 관리 데이터 조회 실패:', error);
      if (showLoading) {
        setLoadError(getErrorMessage(error));
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // Initial page load synchronizes external Supabase data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();

    const refresh = () => void loadData(false);
    const intervalId = window.setInterval(refresh, 5_000);
    window.addEventListener('focus', refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const buses = allocation?.allocation_data?.buses ?? [];
  const passengers = allocation?.allocation_data?.passengers ?? [];
  const pendingClaims = claims.filter((item) => item.claim.status === 'pending_payment');
  const completedClaims = claims.filter((item) => item.claim.status === 'confirmed');

  const busStatuses = buses.map((bus) => {
    const assigned = passengers.filter((passenger) => passenger.busId === bus.id).length;
    const pending = pendingClaims.filter((item) => item.claim.busId === bus.id).length;
    const completed = completedClaims.filter((item) => item.claim.busId === bus.id).length;

    return {
      bus,
      assigned,
      pending,
      completed,
      available: Math.max(0, bus.capacity - assigned),
      initialAvailable: Math.max(0, bus.capacity - assigned) + pending + completed,
      visible: !settings.hiddenBusIds.includes(bus.id),
    };
  });
  const busesWithRemainingSeats = busStatuses.filter((item) => item.initialAvailable > 0);

  const totalAvailable = busesWithRemainingSeats.reduce((sum, item) => sum + item.available, 0);
  const totalInitialAvailable = busesWithRemainingSeats.reduce(
    (sum, item) => sum + item.initialAvailable,
    0
  );

  const saveSettings = async (nextSettings: RemainingSeatSalesSettings, key: string) => {
    setSavingKey(key);
    try {
      await updateRemainingSeatSalesSettings(nextSettings);
      setSettings(nextSettings);
    } catch (error) {
      alert(`신청 설정을 변경하지 못했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSavingKey('');
    }
  };

  const handleToggleBus = async (busId: string) => {
    const hiddenBusIds = settings.hiddenBusIds.includes(busId)
      ? settings.hiddenBusIds.filter((id) => id !== busId)
      : [...settings.hiddenBusIds, busId];

    await saveSettings({ ...settings, hiddenBusIds }, `bus:${busId}`);
  };

  const handleConfirmPayment = async (item: ClaimItem) => {
    if (
      !window.confirm(
        `${item.name}님의 ${item.claim.amount.toLocaleString()}원 입금을 확인하고 버스표를 확정할까요?`
      )
    ) {
      return;
    }

    setSavingKey(`confirm:${item.reservationId}`);
    try {
      await confirmRemainingSeatPayment(item.reservationId);
      await loadData();
    } catch (error) {
      alert(`입금 확인에 실패했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSavingKey('');
    }
  };

  const handleCancelClaim = async (item: ClaimItem) => {
    if (!window.confirm(`${item.name}님의 임시 확보를 취소하고 좌석을 다시 공개할까요?`)) {
      return;
    }

    setSavingKey(`cancel:${item.reservationId}`);
    try {
      await cancelRemainingSeatClaim(item.reservationId);
      await loadData();
    } catch (error) {
      alert(`임시 확보 취소에 실패했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSavingKey('');
    }
  };

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <AdminHeader />
        <main className={styles.main}>잔여 좌석 현황을 불러오는 중...</main>
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
          onClick={() => navigate('/admin/dashboard')}
        >
          <ArrowLeft size={18} />
          전체 관리자 화면
        </button>

        <section className={styles.header}>
          <div className={styles.headerIcon}>
            <Ticket size={28} />
          </div>
          <div>
            <h1>잔여 좌석 신청·입금 관리</h1>
            <p>
              미신청자가 임시 확보한 좌석의 서울지구 입금을 확인하고 버스표를
              확정합니다.
            </p>
          </div>
        </section>

        {loadError && (
          <section className={styles.loadErrorBox}>
            <div>
              <strong>잔여 좌석 관리 데이터를 불러올 수 없습니다.</strong>
              <p>{loadError}</p>
              <small>
                새 워크플로를 사용하려면 Supabase에서
                {' '}sql/setup/80_remaining_seat_payment_workflow.sql을 실행해주세요.
              </small>
            </div>
            <button type="button" onClick={() => void loadData()}>
              다시 불러오기
            </button>
          </section>
        )}

        <section className={styles.operationPanel}>
          <div>
            <span>전체 잔여 좌석 신청</span>
            <strong>{settings.enabled ? '신청 가능' : '신청 마감'}</strong>
            <p>
              서울지구 계좌 {paymentInfo.account || '설정 필요'} · 좌석 가격{' '}
              {paymentInfo.price.toLocaleString()}원
            </p>
          </div>
          <button
            type="button"
            className={settings.enabled ? styles.closeSalesButton : styles.openSalesButton}
            disabled={savingKey === 'global'}
            onClick={() =>
              void saveSettings({ ...settings, enabled: !settings.enabled }, 'global')
            }
          >
            {settings.enabled ? <EyeOff size={17} /> : <Eye size={17} />}
            {settings.enabled ? '전체 신청 마감' : '전체 신청 열기'}
          </button>
          <button type="button" className={styles.refreshButton} onClick={() => void loadData()}>
            <RefreshCw size={17} />
            새로고침 · 5초 자동 갱신
          </button>
        </section>

        <section className={styles.summaryGrid}>
          <div>
            <span>현재 잔여 좌석 / 최초 잔여 좌석</span>
            <strong>{totalAvailable}석 / {totalInitialAvailable}석</strong>
          </div>
          <div className={pendingClaims.length > 0 ? styles.attentionSummary : ''}>
            <span>입금 확인 필요</span>
            <strong>{pendingClaims.length}명</strong>
          </div>
          <div>
            <span>입금 확인·확정</span>
            <strong>{completedClaims.length}명</strong>
          </div>
          <div>
            <span>공개 중인 버스</span>
            <strong>
              {busesWithRemainingSeats.filter((item) => item.visible && item.available > 0).length}대
            </strong>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span>우선 처리</span>
              <h2>입금 대기 신청</h2>
            </div>
            <strong>{pendingClaims.length}건</strong>
          </div>

          {pendingClaims.length === 0 ? (
            <p className={styles.emptyText}>현재 입금 확인이 필요한 신청이 없습니다.</p>
          ) : (
            <div className={styles.claimList}>
              {pendingClaims.map((item) => (
                <article key={item.reservationId} className={styles.claimCard}>
                  <div className={styles.claimMain}>
                    <div>
                      <span className={styles.pendingBadge}>입금 대기</span>
                      <h3>{item.name || '이름 없음'}</h3>
                      <p>{item.campus || '캠퍼스 없음'} · {item.phone || '연락처 없음'}</p>
                    </div>
                    <div className={styles.amountBlock}>
                      <span>확인할 입금</span>
                      <strong>{item.claim.amount.toLocaleString()}원</strong>
                      <small>입금자명 {item.claim.depositorName}</small>
                    </div>
                  </div>
                  <dl className={styles.claimDetails}>
                    <div><dt>호차</dt><dd>{formatBusLabel(item.claim.busLabel)}</dd></div>
                    <div><dt>행선지</dt><dd>{item.claim.destination}</dd></div>
                    <div><dt>신청 시각</dt><dd>{formatKoreanDateTime(item.claim.requestedAt)}</dd></div>
                    <div><dt>입금 계좌</dt><dd>{item.claim.transferAccount || '설정 필요'}</dd></div>
                  </dl>
                  <div className={styles.claimActions}>
                    <button
                      type="button"
                      className={styles.confirmButton}
                      disabled={savingKey !== ''}
                      onClick={() => void handleConfirmPayment(item)}
                    >
                      <CheckCircle2 size={17} />
                      {savingKey === `confirm:${item.reservationId}` ? '확인 중...' : '입금 확인·버스표 확정'}
                    </button>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      disabled={savingKey !== ''}
                      onClick={() => void handleCancelClaim(item)}
                    >
                      <XCircle size={17} />
                      임시 확보 취소
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span>공개 범위</span>
              <h2>버스별 잔여 좌석 공개</h2>
            </div>
            <strong>{allocation?.allocation_name ?? '확정 배차안 없음'}</strong>
          </div>

          {busesWithRemainingSeats.length === 0 ? (
            <p className={styles.emptyText}>현재 잔여 좌석이 있는 버스가 없습니다.</p>
          ) : (
            <div className={styles.busGrid}>
              {busesWithRemainingSeats.map((item) => (
                <article
                  key={item.bus.id}
                  className={`${styles.busCard} ${!item.visible ? styles.hiddenBusCard : ''}`}
                >
                  <div className={styles.busCardHeader}>
                    <div>
                      <Bus size={19} />
                      <strong>{formatBusLabel(item.bus.label)}</strong>
                      <span>{item.bus.destination}행</span>
                    </div>
                    <button
                      type="button"
                      disabled={savingKey !== ''}
                      onClick={() => void handleToggleBus(item.bus.id)}
                    >
                      {item.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                      {item.visible ? '공개 중' : '숨김'}
                    </button>
                  </div>
                  <div className={styles.busMetrics}>
                    <div>
                      <span>현재 남음 / 최초</span>
                      <strong>{item.available}석 / {item.initialAvailable}석</strong>
                    </div>
                    <div><span>입금 대기</span><strong>{item.pending}석</strong></div>
                    <div><span>확정 완료</span><strong>{item.completed}석</strong></div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <button
            type="button"
            className={styles.completedToggle}
            onClick={() => setCompletedOpen((current) => !current)}
            aria-expanded={completedOpen}
          >
            <span>
              <Banknote size={18} />
              완료된 입금 확인 {completedClaims.length}건
            </span>
            {completedOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {completedOpen && (
            <div className={styles.completedList}>
              {completedClaims.length === 0 ? (
                <p className={styles.emptyText}>완료된 잔여 좌석 입금 확인이 없습니다.</p>
              ) : (
                completedClaims.map((item) => (
                  <div key={item.reservationId}>
                    <strong>{item.name}</strong>
                    <span>{formatBusLabel(item.claim.busLabel)} · {item.claim.destination}행</span>
                    <b>{item.claim.amount.toLocaleString()}원</b>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default AdminRemainingSeatSalesPage;
