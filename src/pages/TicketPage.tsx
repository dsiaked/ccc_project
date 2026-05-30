import { useEffect, useState } from 'react';
import { Bus, Building2, CheckCircle2, Clock, MapPin, Ticket, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import type { ReturnBusReservation } from '../types/reservation';
import styles from './TicketPage.module.css';
import { supabase } from '../lib/supabase';
import { getReservation } from '../lib/reservationService';

const TicketPage = () => {
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<ReturnBusReservation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReservation = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
          navigate('/login');
          return;
        }

        // DB에서 먼저 예약 정보 조회
        const dbReservation = await getReservation();

        if (dbReservation) {
          setReservation(dbReservation);
        } else {
          // DB에 없으면 아무것도 표시하지 않음
          setReservation(null);
        }
      } catch (error) {
        console.error('예약 정보 로드 실패:', error);
        setReservation(null);
      } finally {
        setLoading(false);
      }
    };

    loadReservation();
  }, [navigate]);
  
  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <div className={styles.headerContent}>
          <div className={styles.iconCircle}>
            <Ticket size={32} color="#ffffff" />
          </div>
          <h1 className={styles.title}>귀가 버스 확인표</h1>
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
                  {reservation.status === 'confirmed'
                    ? 'CONFIRMED BUS TICKET'
                    : 'RETURN BUS REQUEST'}
                </p>
                <h2 className={styles.ticketTitle}>2026 CCC 여름수련회 귀가 버스</h2>
              </div>

              {reservation.status === 'confirmed' ? (
                <CheckCircle2 size={38} color="#16a34a" />
              ) : (
                <Bus size={38} color="#2563eb" />
              )}
            </div>

            <div
              className={
                reservation.status === 'confirmed'
                  ? styles.confirmedStatusBox
                  : styles.requestedStatusBox
              }
            >
              {reservation.status === 'confirmed'
                ? '버스표가 확정되었습니다.'
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
                  <p className={styles.label}>신청 일시</p>
                  <div className={styles.horizontalRow}>
                    <span className={styles.value}>{reservation.requestedAt}</span>
                    {reservation.updatedAt && (
                      <span className={styles.subValue}>수정 일시: {reservation.updatedAt}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {reservation.status === 'confirmed' && reservation.confirmedTicket ? (
              <div className={styles.confirmedTicketBox}>
                <h3>확정 버스표</h3>

                <div className={styles.confirmedGrid}>
                  <div>
                    <p className={styles.label}>호차</p>
                    <p className={styles.value}>{reservation.confirmedTicket.busNumber}</p>
                  </div>

                  <div>
                    <p className={styles.label}>좌석</p>
                    <p className={styles.value}>
                      {reservation.confirmedTicket.seatNumber || '현장 안내'}
                    </p>
                  </div>

                  <div>
                    <p className={styles.label}>출발 시간</p>
                    <p className={styles.value}>
                      {reservation.confirmedTicket.departureTime}
                    </p>
                  </div>

                  <div>
                    <p className={styles.label}>탑승 장소</p>
                    <p className={styles.value}>
                      {reservation.confirmedTicket.boardingPlace}
                    </p>
                  </div>

                  <div>
                    <p className={styles.label}>확정 하차역</p>
                    <p className={styles.value}>
                      {reservation.confirmedTicket.dropoffStation}
                    </p>
                  </div>

                  <div>
                    <p className={styles.label}>세부 하차 위치</p>
                    <p className={styles.value}>
                      {reservation.confirmedTicket.dropoffDetail || '추후 안내'}
                    </p>
                  </div>
                </div>

                {reservation.confirmedTicket.managerNote && (
                  <div className={styles.managerNote}>
                    {reservation.confirmedTicket.managerNote}
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.noticeBox}>
                <p>
                  아직 버스표가 확정되지 않았습니다. 관리자가 희망 도착역과 인원
                  현황을 확인한 뒤 호차와 하차역을 확정합니다.
                </p>
              </div>
            )}

            <div className={styles.buttonGroup}>
              {reservation.status === 'confirmed' && reservation.confirmedTicket && (
                <button
                  className={styles.primaryButton}
                  onClick={() => navigate('/confirmed-ticket')}
                >
                  버스표 확인하기
                </button>
              )}

              {reservation.status !== 'confirmed' && (
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
              귀가 버스를 신청하면 이곳에서 신청 내역과 확정표를 확인할 수 있습니다.
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