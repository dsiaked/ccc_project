import { useEffect, useState } from 'react';
import { Banknote, Bus, Building2, Clock, MapPin, Ticket, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import type { ReturnBusReservation } from '../types/reservation';
import styles from './TicketPage.module.css';
import { supabase } from '../lib/supabase';
import { getReservation } from '../lib/reservationService';
import { formatKoreanDateTime } from '../utils/dateTime';
import { cancelRemainingSeatClaim } from '../lib/remainingSeatService';

const TicketPage = () => {
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<ReturnBusReservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const activityDateLabel = reservation?.updatedAt ? '최종 수정 일시' : '신청 일시';
  const activityDate = reservation?.updatedAt || reservation?.requestedAt;
  const remainingSeatClaim = reservation?.remainingSeatClaim;

  const handleCancelRemainingSeat = async () => {
    if (!reservation?.remainingSeatClaim) return;
    if (!window.confirm('입금 대기 중인 잔여좌석 신청을 취소할까요? 좌석은 다시 공개됩니다.')) return;

    setCancelling(true);
    try {
      await cancelRemainingSeatClaim(reservation.id);
      navigate('/remaining-seats', { replace: true });
    } catch (error) {
      console.error('잔여좌석 신청 취소 실패:', error);
      alert('잔여좌석 신청을 취소하지 못했습니다.');
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadReservation = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (sessionError || !session) {
          navigate('/login');
          return;
        }

        // DB에서 먼저 신청 정보 조회
        const dbReservation = await getReservation();

        if (!isMounted) return;

        if (dbReservation) {
          if (
            dbReservation.status === 'confirmed' &&
            dbReservation.confirmedTicket
          ) {
            navigate('/confirmed-ticket', { replace: true });
            return;
          }

          setReservation(dbReservation);
        } else {
          // DB에 없으면 아무것도 표시하지 않음
          setReservation(null);
        }
      } catch (error) {
        console.error('신청 정보 로드 실패:', error);
        if (isMounted) setReservation(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadReservation();

    return () => {
      isMounted = false;
    };
  }, [navigate]);
  
  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <div className={styles.headerContent}>
          <div className={styles.iconCircle}>
            <Ticket size={32} color="#ffffff" />
          </div>
          <h1 className={styles.title}>귀가 버스표</h1>
          <p className={styles.subtitle}>
            신청한 귀가 버스 정보와 확정된 버스표를 확인할 수 있습니다
          </p>
        </div>

        {loading ? (
          <section className={styles.emptyCard}>
            <Ticket size={44} color="#98a2b3" />
            <h2 className={styles.emptyTitle}>로딩 중...</h2>
          </section>
        ) : reservation ? (
          <section className={styles.ticketCard}>
            <div className={styles.ticketHeader}>
              <div>
                <p className={styles.badge}>RETURN BUS REQUEST</p>
                <h2 className={styles.ticketTitle}>2026 CCC 여름수련회 귀가 버스</h2>
              </div>

              <Bus size={38} color="#2563eb" />
            </div>

            <div
              className={`${styles.requestedStatusBox} ${
                remainingSeatClaim ? styles.paymentPendingStatusBox : ''
              }`}
            >
              {remainingSeatClaim
                ? '좌석이 임시 확보되었습니다. 전체 관리자가 입금을 확인하면 버스표가 확정됩니다.'
                : '신청이 접수되었습니다. 아직 관리자 배정 전입니다.'}
            </div>

            <div className={styles.divider} />

            <div className={styles.infoList}>
              <div className={styles.infoItem}>
                <User size={20} color="#475467" className={styles.infoIcon} />
                <div className={styles.infoContent}>
                  <p className={styles.label}>이름 / 연락처</p>
                  <div className={styles.horizontalRow}>
                    <span className={styles.value}>{reservation.name}</span>
                    <span className={styles.subValue}>{reservation.phone}</span>
                  </div>
                </div>
              </div>

              <div className={styles.infoItem}>
                <Building2 size={20} color="#475467" className={styles.infoIcon} />
                <div className={styles.infoContent}>
                  <p className={styles.label}>소속</p>
                  <div className={styles.horizontalRow}>
                    <span className={styles.value}>
                      {reservation.district} {reservation.team}
                    </span>
                    <span className={styles.subValue}>{reservation.campus}</span>
                  </div>
                </div>
              </div>

              <div className={styles.infoItem}>
                <MapPin size={20} color="#475467" className={styles.infoIcon} />
                <div className={styles.infoContent}>
                  <p className={styles.label}>희망 행선지</p>
                  <div className={styles.preferenceList}>
                    {reservation.stationPreferences.map((preference) => (
                      <div
                        key={`${preference.rank}-${preference.station.id}`}
                        className={styles.preferenceItem}
                      >
                        <strong>{preference.rank}지망</strong>
                        <span>{preference.station.name}</span>
                        <small>{preference.station.line}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.infoItem}>
                <Clock size={20} color="#475467" className={styles.infoIcon} />
                <div className={styles.infoContent}>
                  <p className={styles.label}>{activityDateLabel}</p>
                  <div className={styles.horizontalRow}>
                    <span className={styles.value}>
                      {formatKoreanDateTime(activityDate)}
                    </span>
                  </div>
                </div>
              </div>

              {remainingSeatClaim && (
                <div className={styles.infoItem}>
                  <Banknote size={20} color="#475467" className={styles.infoIcon} />
                  <div className={styles.infoContent}>
                    <p className={styles.label}>잔여좌석 입금 안내</p>
                    <div className={styles.paymentDetails}>
                      <strong>{remainingSeatClaim.amount.toLocaleString()}원</strong>
                      <span>
                        {remainingSeatClaim.transferAccount || '서울지구 계좌 확인 필요'}
                      </span>
                      <small>입금자명: {remainingSeatClaim.depositorName}</small>
                      <small>
                        {remainingSeatClaim.destination}행 · {remainingSeatClaim.busLabel}
                      </small>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.noticeBox}>
              <p>
                {remainingSeatClaim
                  ? '입금 확인 전에는 직접 취소할 수 있습니다. 입금 확인 후 변경이나 취소는 관리자에게 문의해주세요.'
                  : '아직 버스표가 확정되지 않았습니다. 관리자가 희망 행선지와 인원 현황을 확인한 뒤 호차와 행선지를 확정합니다.'}
              </p>
            </div>

            <div className={styles.buttonGroup}>
              <button
                className={styles.secondaryButton}
                onClick={() =>
                  navigate(remainingSeatClaim ? '/remaining-seats' : '/reservation')
                }
              >
                {remainingSeatClaim ? '잔여좌석 현황 보기' : '신청 정보 수정하기'}
              </button>

              {remainingSeatClaim && (
                <button
                  className={styles.dangerButton}
                  onClick={() => void handleCancelRemainingSeat()}
                  disabled={cancelling}
                >
                  {cancelling ? '취소 중...' : '입금 대기 신청 취소'}
                </button>
              )}

              <button
                className={styles.secondaryButton}
                onClick={() => navigate('/')}
              >
                홈으로 가기
              </button>
            </div>
          </section>
        ) : (
          <section className={styles.emptyCard}>
            <Ticket size={44} color="#98a2b3" />
            <h2 className={styles.emptyTitle}>아직 신청 정보가 없습니다</h2>
            <p className={styles.emptyText}>
              귀가 버스를 신청하면 이곳에서 신청 내역과 버스표를 확인할 수 있습니다.
            </p>
            <button
              className={styles.primaryButton}
              onClick={() => navigate('/reservation')}
            >
              귀가 버스 신청하기
            </button>
          </section>
        )}
      </main>
    </div>
  );
};

export default TicketPage;
