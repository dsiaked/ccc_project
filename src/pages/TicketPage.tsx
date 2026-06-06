import { useEffect, useState } from 'react';
import { Bus, Building2, CheckCircle2, Clock, MapPin, Ticket, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import type { ReturnBusReservation } from '../types/reservation';
import styles from './TicketPage.module.css';
import { supabase } from '../lib/supabase';
import { getReservation } from '../lib/reservationService';
import { formatKoreanDateTime } from '../utils/dateTime';

const TicketPage = () => {
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<ReturnBusReservation | null>(null);
  const [loading, setLoading] = useState(true);
  const isConfirmed = reservation?.status === 'confirmed';
  const confirmedTicket = reservation?.confirmedTicket;
  const activityDateLabel = reservation?.updatedAt ? '최종 수정 일시' : '신청 일시';
  const activityDate = reservation?.updatedAt || reservation?.requestedAt;

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

        // DB에서 먼저 예약 정보 조회
        const dbReservation = await getReservation();

        if (!isMounted) return;

        if (dbReservation) {
          setReservation(dbReservation);
        } else {
          // DB에 없으면 아무것도 표시하지 않음
          setReservation(null);
        }
      } catch (error) {
        console.error('예약 정보 로드 실패:', error);
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
                <p className={styles.badge}>
                  {isConfirmed
                    ? 'CONFIRMED BUS TICKET'
                    : 'RETURN BUS REQUEST'}
                </p>
                <h2 className={styles.ticketTitle}>2026 CCC 여름수련회 귀가 버스</h2>
              </div>

              {isConfirmed ? (
                <CheckCircle2 size={38} color="#16a34a" />
              ) : (
                <Bus size={38} color="#2563eb" />
              )}
            </div>

            <div
              className={
                isConfirmed
                  ? styles.confirmedStatusBox
                  : styles.requestedStatusBox
              }
            >
              {isConfirmed
                ? '버스표가 확정되었습니다.'
                : '신청이 접수되었습니다. 아직 관리자 배정 전입니다.'}
            </div>

            {isConfirmed && confirmedTicket && (
              <div className={styles.confirmedFeedbackPanel}>
                <div className={styles.confirmedFeedbackHeader}>
                  <CheckCircle2 size={28} color="#16a34a" />
                  <div>
                    <span>신청 확정 완료</span>
                    <strong>귀가 버스가 배정되었습니다</strong>
                    <p>
                      탑승 전 호차, 출발 시간, 탑승 장소를 꼭 확인해주세요.
                    </p>
                  </div>
                </div>

                <dl className={styles.confirmedSummaryList}>
                  <div>
                    <dt>호차</dt>
                    <dd>{confirmedTicket.busNumber}</dd>
                  </div>
                  <div>
                    <dt>출발시간</dt>
                    <dd>{confirmedTicket.departureTime}</dd>
                  </div>
                  <div>
                    <dt>탑승 장소</dt>
                    <dd>{confirmedTicket.boardingPlace}</dd>
                  </div>
                  <div>
                    <dt>도착역</dt>
                    <dd>{confirmedTicket.dropoffStation}</dd>
                  </div>
                </dl>
              </div>
            )}

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
                  <p className={styles.label}>희망 도착역</p>
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
            </div>

            {!isConfirmed && (
              <div className={styles.noticeBox}>
                <p>
                  아직 버스표가 확정되지 않았습니다. 관리자가 희망 도착역과 인원
                  현황을 확인한 뒤 호차와 도착역을 확정합니다.
                </p>
              </div>
            )}

            <div className={styles.buttonGroup}>
              {!isConfirmed && (
                <button
                  className={styles.secondaryButton}
                  onClick={() => navigate('/reservation')}
                >
                  신청 정보 수정하기
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
