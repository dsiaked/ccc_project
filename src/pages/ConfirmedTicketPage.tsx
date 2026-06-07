import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bus,
  MapPin,
  Clock,
  Users,
  Smartphone,
  AlertCircle,
  CircleCheckBig,
} from 'lucide-react';
import Header from '../components/Header';
import type { ReturnBusReservation } from '../types/reservation';
import styles from './ConfirmedTicketPage.module.css';
import { supabase } from '../lib/supabase';
import { confirmBoarding, getReservation } from '../lib/reservationService';
import { formatKoreanDateTime } from '../utils/dateTime';

const ConfirmedTicketPage = () => {
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<ReturnBusReservation | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [confirmingBoarding, setConfirmingBoarding] = useState(false);
  const [showBoardingConfirmation, setShowBoardingConfirmation] =
    useState(false);
  const [boardingError, setBoardingError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadReservation = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (!session) {
          navigate('/login');
          return;
        }

        // DB에서 신청 정보 조회
        const dbReservation = await getReservation();
        if (!isMounted) return;


        if (dbReservation) {
          setReservation(dbReservation);
        } else {
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

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <Header />
        <main className={styles.main}>
          <div className={styles.loadingContainer}>
            <p>로딩 중...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className={styles.pageContainer}>
        <Header />
        <main className={styles.main}>
          <button
            className={styles.backButton}
            onClick={() => navigate('/ticket')}
          >
            <ArrowLeft size={20} />
            돌아가기
          </button>

          <div className={styles.emptyContainer}>
            <AlertCircle size={48} color="#94a3b8" />
            <h2>신청 정보가 없습니다</h2>
            <p>먼저 귀가 버스를 신청해주세요.</p>
            <button
              className={styles.primaryButton}
              onClick={() => navigate('/reservation')}
            >
              신청하기
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!reservation.confirmedTicket) {
    return (
      <div className={styles.pageContainer}>
        <Header />
        <main className={styles.main}>
          <button
            className={styles.backButton}
            onClick={() => navigate('/ticket')}
          >
            <ArrowLeft size={20} />
            돌아가기
          </button>

          <div className={styles.emptyContainer}>
            <Bus size={48} color="#94a3b8" />
            <h2>버스표가 아직 확정되지 않았습니다</h2>
            <p>관리자가 희망 행선지와 인원 현황을 확인한 후 버스표를 확정합니다.</p>
            <button
              className={styles.secondaryButton}
              onClick={() => navigate('/ticket')}
            >
              신청 현황 확인
            </button>
          </div>
        </main>
      </div>
    );
  }

  const ticket = reservation.confirmedTicket;
  const activityDateLabel = reservation.updatedAt ? '최종 수정일' : '신청일';
  const activityDate = reservation.updatedAt || reservation.requestedAt;
  const boardingConfirmedAt = reservation.boardingConfirmedAt;

  const handleConfirmBoarding = async () => {
    if (boardingConfirmedAt || confirmingBoarding) return;

    setConfirmingBoarding(true);
    setBoardingError('');

    try {
      const confirmedAt = await confirmBoarding();
      setReservation((current) =>
        current ? { ...current, boardingConfirmedAt: confirmedAt } : current
      );
      setShowBoardingConfirmation(false);
    } catch (error) {
      console.error('탑승 확인 실패:', error);
      setBoardingError('탑승 확인을 저장하지 못했습니다. 다시 눌러주세요.');
    } finally {
      setConfirmingBoarding(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <button
          className={styles.backButton}
          onClick={() => navigate('/ticket')}
        >
          <ArrowLeft size={20} />
          돌아가기
        </button>

        <div className={styles.headerSection}>
          <div className={styles.iconContainer}>
            <Bus size={40} color="#ffffff" />
          </div>
          <h1 className={styles.title}>확정 버스표</h1>
          <p className={styles.subtitle}>2026 CCC 여름수련회 귀가 버스</p>
        </div>

        {/* 메인 버스표 카드 */}
        <div className={styles.ticketContainer}>
          {/* 위쪽 - 호차 정보 */}
          <div className={styles.ticketTop}>
            <div className={styles.busNumberSection}>
              <p className={styles.label}>호차</p>
              <p className={styles.busNumber}>{ticket.busNumber}</p>
            </div>

            <div className={styles.seatSection}>
              <p className={styles.label}>좌석</p>
              <p className={styles.seatNumber}>{ticket.seatNumber || '현장 안내'}</p>
            </div>
          </div>

          {/* 구분선 */}
          <div className={styles.divider} />

          {/* 중간 - 주요 정보 */}
          <div className={styles.ticketMiddle}>
            <div className={styles.infoRow}>
              <div className={styles.infoBlock}>
                <Clock size={20} color="#2563eb" className={styles.infoIcon} />
                <div className={styles.infoBlockContent}>
                  <span className={styles.infoLabel}>출발 시간</span>
                  <span className={styles.infoValue}>{ticket.departureTime}</span>
                </div>
              </div>

              <div className={styles.infoBlock}>
                <MapPin size={20} color="#dc2626" className={styles.infoIcon} />
                <div className={styles.infoBlockContent}>
                  <span className={styles.infoLabel}>탑승 장소</span>
                  <span className={styles.infoValue}>{ticket.boardingPlace}</span>
                </div>
              </div>
            </div>

            <div className={styles.infoRow}>
              <div className={styles.infoBlockFull}>
                <MapPin size={20} color="#16a34a" className={styles.infoIcon} />
                <div className={styles.infoBlockContentFull}>
                  <div className={styles.dropoffMain}>
                    <span className={styles.infoLabel}>확정 행선지</span>
                    <span className={styles.infoValue}>{ticket.dropoffStation}</span>
                  </div>
                  {ticket.dropoffDetail && (
                    <span className={styles.infoSubValue}>{ticket.dropoffDetail}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 아래쪽 - 승객 정보 */}
          <div className={styles.ticketBottom}>
            <div className={styles.passengerInfo}>
              <Users size={18} color="#666666" className={styles.infoIcon} />
              <div className={styles.passengerTextWrapper}>
                <span className={styles.passengerLabel}>탑승자</span>
                <span className={styles.passengerName}>{reservation.name}</span>
              </div>
            </div>

            <div className={styles.passengerInfo}>
              <Smartphone size={18} color="#666666" className={styles.infoIcon} />
              <div className={styles.passengerTextWrapper}>
                <span className={styles.passengerLabel}>연락처</span>
                <span className={styles.passengerPhone}>{reservation.phone}</span>
              </div>
            </div>
          </div>
        </div>

        <section
          className={`${styles.boardingCheckCard} ${
            boardingConfirmedAt ? styles.boardingCheckCardComplete : ''
          }`}
          aria-live="polite"
        >
          <div className={styles.boardingCheckCopy}>
            <CircleCheckBig size={32} aria-hidden="true" />
            <div>
              <h2>
                {boardingConfirmedAt ? '탑승 확인 완료' : '선탑자 탑승 확인'}
              </h2>
              <p>
                {boardingConfirmedAt
                  ? `${formatKoreanDateTime(boardingConfirmedAt)}에 확인했습니다.`
                  : '승객이 버스에 타고 있는지 확인한 뒤 선탑자가 눌러주세요.'}
              </p>
            </div>
          </div>
          {boardingConfirmedAt ? (
            <button
              type="button"
              className={styles.boardingConfirmButton}
              disabled
            >
              탑승 확인됨
            </button>
          ) : showBoardingConfirmation ? (
            <div className={styles.boardingConfirmation}>
              <div className={styles.boardingConfirmationDetails}>
                <strong>{reservation.name}</strong>
                <span>
                  {ticket.busNumber} · {ticket.seatNumber || '현장 안내 좌석'}
                </span>
              </div>
              <p>실제로 버스에 탑승한 승객이 맞나요?</p>
              <div className={styles.boardingConfirmationActions}>
                <button
                  type="button"
                  className={styles.boardingCancelButton}
                  disabled={confirmingBoarding}
                  onClick={() => {
                    setShowBoardingConfirmation(false);
                    setBoardingError('');
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={styles.boardingFinalConfirmButton}
                  disabled={confirmingBoarding}
                  onClick={handleConfirmBoarding}
                >
                  {confirmingBoarding ? '저장 중...' : '네, 탑승 확인합니다'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={styles.boardingConfirmButton}
              onClick={() => {
                setShowBoardingConfirmation(true);
                setBoardingError('');
              }}
            >
              탑승 확인하기
            </button>
          )}
          {boardingError && (
            <p className={styles.boardingError} role="alert">
              {boardingError}
            </p>
          )}
        </section>

        {/* 추가 정보 섹션 */}
        <div className={styles.additionalInfo}>
          <h3>신청 정보</h3>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.itemLabel}>소속</span>
              <span className={styles.itemValue}>
                {reservation.district} {reservation.team}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.itemLabel}>캠퍼스</span>
              <span className={styles.itemValue}>{reservation.campus}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.itemLabel}>{activityDateLabel}</span>
              <span className={styles.itemValue}>
                {formatKoreanDateTime(activityDate)}
              </span>
            </div>
          </div>
        </div>

        {/* 주의사항 */}
        <div className={styles.notice}>
          <AlertCircle size={20} color="#ea580c" />
          <div>
            <p className={styles.noticeTitle}>출발 전 꼭 확인해주세요!</p>
            <ul className={styles.noticeList}>
              <li>출발 30분 전에 탑승 장소에 도착해주세요</li>
              <li>신분증을 꼭 지참해주세요</li>
              {ticket.managerNote && (
                <li>{ticket.managerNote}</li>
              )}
            </ul>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className={styles.buttonGroup}>
          <button
            className={styles.primaryButton}
            onClick={() => window.print()}
          >
            출력하기
          </button>
          <button
            className={styles.secondaryButton}
            onClick={() => navigate('/')}
          >
            홈으로
          </button>
        </div>
      </main>
    </div>
  );
};

export default ConfirmedTicketPage;
