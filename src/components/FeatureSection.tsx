import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, Ticket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ReturnBusReservation } from '../types/reservation';
import { supabase } from '../lib/supabase';
import { getReservation } from '../lib/reservationService';
import styles from './FeatureSection.module.css';

const FeatureSection = () => {
  const navigate = useNavigate();

  const [reservation, setReservation] = useState<ReturnBusReservation | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadReservation = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (!session) {
          setReservation(null);
          return;
        }

        const savedReservation = await getReservation();
        if (!isMounted) return;

        setReservation(savedReservation);
      } catch (error) {
        console.error('예약 정보 로드 실패:', error);
        if (isMounted) setReservation(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadReservation();

    return () => {
      isMounted = false;
    };
  }, []);

  const isConfirmed = reservation?.status === 'confirmed';
  const confirmedTicket = reservation?.confirmedTicket;

  const handleClick = () => {
    if (reservation) {
      navigate('/ticket');
      return;
    }

    navigate('/reservation');
  };

  const statusLabel = (() => {
    if (!reservation) return '미신청';
    if (isConfirmed) return '확정 완료';
    return '신청 접수';
  })();

  const statusDescription = (() => {
    if (!reservation) {
      return '아직 귀가 버스 신청 정보가 없습니다.';
    }

    if (isConfirmed) {
      return '관리자가 버스표를 확정했습니다. 탑승 전 호차, 좌석, 출발 정보를 꼭 확인해주세요.';
    }

    return '신청 정보가 접수되었고 관리자 확인을 기다리고 있습니다.';
  })();

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <button className={styles.card} type="button" onClick={handleClick}>
          <div className={styles.topArea}>
            <div className={styles.iconContainer}>
              <Ticket size={30} color="#ffffff" />
            </div>

            <div
              className={`${styles.statusBadge} ${
                reservation
                  ? isConfirmed
                    ? styles.confirmedBadge
                    : styles.requestedBadge
                  : styles.emptyBadge
              }`}
            >
              {reservation ? (
                isConfirmed ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <Clock3 size={14} />
                )
              ) : (
                <Ticket size={14} />
              )}
              <span>{statusLabel}</span>
            </div>
          </div>

          <div className={styles.content}>
            <p className={styles.eyebrow}>RETURN BUS TICKET</p>
            <h3 className={styles.title}>귀가 버스표</h3>
            <p className={styles.description}>
              {isLoading ? '신청 정보를 불러오는 중...' : statusDescription}
            </p>
          </div>

          {!isLoading && reservation && (
            <div className={styles.ticketPreview}>
              <div className={styles.infoRow}>
                <span>신청자</span>
                <strong>{reservation.name || '미입력'}</strong>
              </div>

              <div className={styles.infoRow}>
                <span>소속</span>
                <strong>
                  {reservation.team || '팀 미입력'} ·{' '}
                  {reservation.campus || '캠퍼스 미입력'}
                </strong>
              </div>

              <div className={styles.infoRow}>
                <span>희망 도착역</span>
                <strong>
                  {reservation.stationPreferences
                    ?.slice(0, 3)
                    .map(
                      (preference) =>
                        `${preference.rank}지망 ${preference.station.name}`
                    )
                    .join(' / ') || '미선택'}
                </strong>
              </div>

              {isConfirmed && confirmedTicket ? (
                <div className={styles.confirmedTicketPreview}>
                  <div className={styles.confirmedBox}>
                    <span>확정 탑승 정보</span>
                    <strong>{confirmedTicket.busNumber}</strong>
                  </div>

                  <dl className={styles.confirmedSummaryList}>
                    <div>
                      <dt>좌석</dt>
                      <dd>{confirmedTicket.seatNumber || '현장 안내'}</dd>
                    </div>
                    <div>
                      <dt>출발</dt>
                      <dd>{confirmedTicket.departureTime}</dd>
                    </div>
                    <div>
                      <dt>탑승</dt>
                      <dd>{confirmedTicket.boardingPlace}</dd>
                    </div>
                    <div>
                      <dt>하차</dt>
                      <dd>{confirmedTicket.dropoffStation}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div className={styles.confirmedBox}>
                  <span>배차 상태</span>
                  <strong>관리자 확인 대기</strong>
                </div>
              )}
            </div>
          )}

          {!isLoading && !reservation && (
            <div className={styles.emptyBox}>
              <p>
                신청을 완료하면 이곳에서 신청자, 소속, 희망 도착역, 확정
                탑승 정보를 확인할 수 있습니다.
              </p>
            </div>
          )}

          <div className={styles.bottomArea}>
            <span>
              {isConfirmed
                ? '확정 버스표 보기'
                : reservation
                  ? '버스표 보러가기'
                  : '귀가 버스 신청하기'}
            </span>
            <ArrowRight size={18} />
          </div>
        </button>
      </div>
    </section>
  );
};

export default FeatureSection;
