import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import Header from '../../components/Header';
import { supabase } from '../../lib/supabase';
import {
  getAdminRole,
  getBusTicketPrice,
  getReservationsWithPaymentByTeamCampus,
  createOrUpdatePaymentStatus,
  markCampusTransferSent,
} from '../../lib/adminService';
import styles from './AdminCampusPage.module.css';

interface PaymentInfo {
  id: string;
  amount: number;
  status: 'pending' | 'completed' | 'refunded';
  paid_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface StationPreference {
  rank: 1 | 2 | 3;
  station: {
    id: string;
    name: string;
    line?: string;
    address?: string;
  };
}

interface ReservationWithPayment {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  district?: string;
  team: string;
  campus: string;
  station_preferences: StationPreference[];
  status: string;
  confirmed_ticket: unknown;
  created_at: string;
  updated_at: string;
  payments: PaymentInfo[] | null;
}

interface CampusAdminScope {
  district: string;
  team: string;
  campus: string;
}

const CampusAdminPage = () => {
  const navigate = useNavigate();

  const [reservations, setReservations] = useState<ReservationWithPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [transferSending, setTransferSending] = useState(false);

  const [adminScope, setAdminScope] = useState<CampusAdminScope | null>(null);
  const [campus, setCampus] = useState('');
  const [ticketPrice, setTicketPrice] = useState(0);

  const getPayment = (reservation: ReservationWithPayment) => {
    return reservation.payments?.[0] || null;
  };

  const refreshReservations = async (targetCampus: string, targetTeam?: string) => {
    const data = await getReservationsWithPaymentByTeamCampus(
      targetCampus,
      targetTeam
    );

    setReservations(data as ReservationWithPayment[]);
  };

  useEffect(() => {
    let isMounted = true;

    const checkAndLoadData = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          navigate('/login');
          return;
        }

        const adminRole = await getAdminRole(session.user.id);

        if (!adminRole || adminRole.role !== 'campus_admin') {
          if (isMounted) {
            alert('캠퍼스 관리자만 접근할 수 있습니다.');
            navigate('/');
          }
          return;
        }

        if (!adminRole.district || !adminRole.team || !adminRole.campus) {
          if (isMounted) {
            alert('관리자 계정에 지구, 팀, 캠퍼스 정보가 없습니다.');
            navigate('/');
          }
          return;
        }

        const [data, price] = await Promise.all([
          getReservationsWithPaymentByTeamCampus(
            adminRole.campus,
            adminRole.team
          ),
          getBusTicketPrice(),
        ]);

        if (isMounted) {
          setAdminScope({
            district: adminRole.district,
            team: adminRole.team,
            campus: adminRole.campus,
          });

          setCampus(adminRole.campus);
          setTicketPrice(price);
          setReservations(data as ReservationWithPayment[]);
        }
      } catch (error) {
        console.error('Failed to load reservations:', error);

        if (isMounted) {
          alert('예약 정보를 불러올 수 없습니다. 다시 시도해주세요.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkAndLoadData();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const stats = useMemo(() => {
    const completed = reservations.filter((reservation) => {
      const payment = getPayment(reservation);
      return payment?.status === 'completed';
    }).length;

    const pending = reservations.filter((reservation) => {
      const payment = getPayment(reservation);
      return !payment || payment.status === 'pending';
    }).length;

    const refunded = reservations.filter((reservation) => {
      const payment = getPayment(reservation);
      return payment?.status === 'refunded';
    }).length;

    return {
      total: reservations.length,
      completed,
      pending,
      refunded,
    };
  }, [reservations]);

  const checkableReservations = useMemo(() => {
    return reservations.filter((reservation) => {
      const payment = getPayment(reservation);
      return payment?.status !== 'refunded';
    });
  }, [reservations]);

  const allChecked =
    checkableReservations.length > 0 &&
    checkableReservations.every((reservation) => {
      const payment = getPayment(reservation);
      return payment?.status === 'completed';
    });

  const totalPeople = stats.total;
  const paidPeople = stats.completed;

  const totalAmount = useMemo(() => {
    return reservations.reduce((sum, reservation) => {
      const payment = getPayment(reservation);

      if (payment?.status === 'completed') {
        return sum + ticketPrice;
      }

      return sum;
    }, 0);
  }, [reservations, ticketPrice]);

  const canSendCampusTransfer =
    totalPeople > 0 && paidPeople === totalPeople && !transferSending;

  const handleDirectPaymentCheck = async (
    reservation: ReservationWithPayment,
    checked: boolean
  ) => {
    const payment = getPayment(reservation);
    const nextStatus = checked ? 'completed' : 'pending';

    setVerifying(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('로그인이 필요합니다.');
      }

      await createOrUpdatePaymentStatus({
        paymentId: payment?.id ?? null,
        reservationId: reservation.id,
        userId: reservation.user_id,
        amount: ticketPrice,
        status: nextStatus,
        verifiedBy: checked ? session.user.id : undefined,
      });

      await refreshReservations(campus, adminScope?.team);
    } catch (error: any) {
      console.error('입금 상태 변경 실패:', error);

      const message =
        error?.message ||
        error?.details ||
        error?.hint ||
        '알 수 없는 오류가 발생했습니다.';

      alert(`입금 상태 변경에 실패했습니다: ${message}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleBulkPaymentCheck = async (checked: boolean) => {
    const nextStatus = checked ? 'completed' : 'pending';

    if (checkableReservations.length === 0) {
      return;
    }

    setVerifying(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('로그인이 필요합니다.');
      }

      await Promise.all(
        checkableReservations.map((reservation) => {
          const payment = getPayment(reservation);

          return createOrUpdatePaymentStatus({
            paymentId: payment?.id ?? null,
            reservationId: reservation.id,
            userId: reservation.user_id,
            amount:ticketPrice,
            status: nextStatus,
            verifiedBy: checked ? session.user.id : undefined,
          });
        })
      );

      await refreshReservations(campus, adminScope?.team);
    } catch (error: any) {
      console.error('전체 입금 상태 변경 실패:', error);

      const message =
        error?.message ||
        error?.details ||
        error?.hint ||
        '알 수 없는 오류가 발생했습니다.';

      alert(`전체 입금 상태 변경에 실패했습니다: ${message}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleMarkCampusTransferSent = async () => {
    if (!adminScope) {
      alert('관리자 정보를 찾을 수 없습니다.');
      return;
    }

    if (paidPeople !== totalPeople) {
      alert('아직 모든 인원의 입금이 확인되지 않았습니다.');
      return;
    }

    const ok = window.confirm(
      `${adminScope.campus} 캠퍼스 전체 ${paidPeople}명의 입금을 확인했고, 전체 관리자에게 ${totalAmount.toLocaleString()}원을 송금 완료 처리할까요?`
    );

    if (!ok) return;

    setTransferSending(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate('/admin/login');
        return;
      }

      await markCampusTransferSent({
        district: adminScope.district,
        team: adminScope.team,
        campus: adminScope.campus,
        sentBy: session.user.id,
        totalPeople,
        paidPeople,
        totalAmount,
      });

      alert('전체 관리자에게 송금 완료로 표시했습니다.');
    } catch (error: any) {
      console.error('송금 완료 처리 실패:', error);

      const message =
        error?.message ||
        error?.details ||
        error?.hint ||
        '알 수 없는 오류가 발생했습니다.';

      alert(`송금 완료 처리 중 오류가 발생했습니다: ${message}`);
    } finally {
      setTransferSending(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <Header />

        <main className={styles.main}>
          <p>로딩 중...</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <div className={styles.header}>
          <h1>예약 및 입금 관리 - {campus}</h1>
          <p>캠퍼스 기준으로 예약자를 조회하고 입금 상태를 확인합니다.</p>
        </div>

        <div className={styles.statsBar}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>전체 예약</span>
            <span className={styles.statValue}>{stats.total}</span>
          </div>

          <div className={`${styles.stat} ${styles.statCompleted}`}>
            <span className={styles.statLabel}>입금 확인</span>
            <span className={styles.statValue}>{stats.completed}</span>
          </div>

          <div className={`${styles.stat} ${styles.statPending}`}>
            <span className={styles.statLabel}>미입금</span>
            <span className={styles.statValue}>{stats.pending}</span>
          </div>

          <div className={styles.stat}>
            <span className={styles.statLabel}>인당 버스 가격</span>
            <span className={styles.statValue}>
              {ticketPrice.toLocaleString()}원
            </span>
          </div>

          <div className={styles.stat}>
            <span className={styles.statLabel}>송금 예정액</span>
            <span className={styles.statValue}>
              {totalAmount.toLocaleString()}원
            </span>
          </div>
        </div>

        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCol}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => handleBulkPaymentCheck(e.target.checked)}
                    disabled={verifying || checkableReservations.length === 0}
                    title="전체 입금 확인"
                  />
                </th>
                <th>이름</th>
                <th>연락처</th>
                <th>팀</th>
                <th>캠퍼스</th>
                <th>1지망</th>
                <th>2지망</th>
                <th>입금 상태</th>
                <th>신청일</th>
              </tr>
            </thead>

            <tbody>
              {reservations.length === 0 ? (
                <tr>
                  <td colSpan={9}>예약자가 없습니다.</td>
                </tr>
              ) : (
                reservations.map((reservation) => {
                  const payment = getPayment(reservation);
                  const paymentStatus = payment?.status || 'no_payment';

                  const firstStation =
                    reservation.station_preferences?.find(
                      (preference) => preference.rank === 1
                    )?.station?.name || '-';

                  const secondStation =
                    reservation.station_preferences?.find(
                      (preference) => preference.rank === 2
                    )?.station?.name || '-';

                  return (
                    <tr
                      key={reservation.id}
                      className={`${styles.row} ${
                        paymentStatus === 'completed' ? styles.completed : ''
                      }`}
                    >
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={payment?.status === 'completed'}
                          onChange={(e) =>
                            handleDirectPaymentCheck(
                              reservation,
                              e.target.checked
                            )
                          }
                          disabled={verifying || payment?.status === 'refunded'}
                        />
                      </td>

                      <td className={styles.name}>{reservation.name}</td>
                      <td className={styles.phone}>{reservation.phone}</td>
                      <td>{reservation.team}</td>
                      <td>{reservation.campus}</td>
                      <td>{firstStation}</td>
                      <td>{secondStation}</td>

                      <td>
                        <span
                          className={`${styles.status} ${
                            payment ? styles[payment.status] : ''
                          }`}
                        >
                          {paymentStatus === 'completed'
                            ? '✓ 확인됨'
                            : paymentStatus === 'pending'
                              ? '대기중'
                              : paymentStatus === 'refunded'
                                ? '환불'
                                : '대기중'}
                        </span>
                      </td>

                      <td className={styles.date}>
                        {new Date(reservation.created_at).toLocaleDateString(
                          'ko-KR'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {stats.completed === stats.total && stats.total > 0 && (
          <div className={styles.successMessage}>
            <CheckCircle2 size={24} color="#10b981" />
            <div>
              <p className={styles.successTitle}>
                모든 입금이 확인되었습니다!
              </p>
              <p className={styles.successText}>
                총 {stats.completed}명의 입금을 확인하셨습니다.
              </p>
            </div>
          </div>
        )}

        <div className={styles.transferBox}>
          <div>
            <p className={styles.transferTitle}>전체 관리자 송금</p>
            <p className={styles.transferText}>
              캠퍼스 전체 입금 확인 후 전체 관리자에게 한 번에 송금하고,
              아래 버튼으로 송금 완료 상태를 남깁니다.
            </p>
            <p className={styles.transferText}>
              현재 인당 버스 가격은 {ticketPrice.toLocaleString()}원입니다.
            </p>
          </div>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleMarkCampusTransferSent}
            disabled={!canSendCampusTransfer}
          >
            {transferSending ? '처리 중...' : '전체 관리자에게 송금 완료'}
          </button>
        </div>
      </main>
    </div>
  );
};

export default CampusAdminPage;