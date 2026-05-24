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
    const loadReservation = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setReservation(null);
          return;
        }

        const savedReservation = await getReservation();
        setReservation(savedReservation);
      } catch (error) {
        console.error('예약 정보 로드 실패:', error);
        setReservation(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadReservation();
  }, []);

  const isConfirmed = reservation?.status === 'confirmed';

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
      return '관리자가 버스표를 확정했습니다.';
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
            <h3 className={styles.title}>귀가 버스 확인표</h3>
            <p className={styles.description}>
              {isLoading ? '신청 정보를 불러오는 중...' : statusDescription}
            </p>
          </div>

          {!isLoading && reservation && (
            <div className={styles.ticketPreview}>
              <div className={styles.infoRow}>
                <span>소속</span>
                <strong>
                  {reservation.team || '팀 미입력'} ·{' '}
                  {reservation.campus || '캠퍼스 미입력'}
                </strong>
              </div>

              <div className={styles.infoRow}>
                <span>1지망</span>
                <strong>
                  {reservation.stationPreferences?.[0]?.station?.name ||
                    '미선택'}
                </strong>
              </div>

              <div className={styles.infoRow}>
                <span>2지망</span>
                <strong>
                  {reservation.stationPreferences?.[1]?.station?.name ||
                    '미선택'}
                </strong>
              </div>

              {isConfirmed && reservation.confirmedTicket && (
                <div className={styles.confirmedBox}>
                  <span>확정 도착역</span>
<strong>확정표 확인 가능</strong>
                </div>
              )}
            </div>
          )}

          {!isLoading && !reservation && (
            <div className={styles.emptyBox}>
              <p>신청을 완료하면 이곳에서 접수 상태와 확정표를 확인할 수 있습니다.</p>
            </div>
          )}

          <div className={styles.bottomArea}>
            <span>{reservation ? '확인표 보러가기' : '귀가 버스 신청하기'}</span>
            <ArrowRight size={18} />
          </div>
        </button>
      </div>
    </section>
  );
};

export default FeatureSection;