import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bus,
  MapPin,
  Clock,
  AlertCircle,
  CircleCheckBig,
  ClipboardCheck,
} from 'lucide-react';
import Header from '../components/Header';
import type { ReturnBusReservation } from '../types/reservation';
import styles from './ConfirmedTicketPage.module.css';
import { supabase } from '../lib/supabase';
import {
  getReservation,
  submitBoardingCheckInCode,
} from '../lib/reservationService';
import { formatKoreanDateTime } from '../utils/dateTime';
import { formatBusLabel } from '../utils/busLabel';

interface ConfirmedTicketPageProps {
  initialReservation?: ReturnBusReservation;
}

const ConfirmedTicketPage = ({
  initialReservation,
}: ConfirmedTicketPageProps = {}) => {
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<ReturnBusReservation | null>(
    initialReservation ?? null
  );
  const [loading, setLoading] = useState(!initialReservation);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [confirmingBoarding, setConfirmingBoarding] = useState(false);
  const boardingConfirmationInFlightRef = useRef(false);
  const [boardingCode, setBoardingCode] = useState('');
  const [boardingError, setBoardingError] = useState('');
  const [liveTime, setLiveTime] = useState(() => new Date());

  useEffect(() => {
    if (initialReservation) return;

    let isMounted = true;

    const loadReservation = async () => {
      setLoading(true);
      setLoadError('');

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (sessionError) throw sessionError;

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
        if (isMounted) {
          setLoadError(
            '확정 티켓 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadReservation();

    return () => {
      isMounted = false;
    };
  }, [initialReservation, loadAttempt, navigate]);

  useEffect(() => {
    const updateLiveTime = () => setLiveTime(new Date());
    const timer = window.setInterval(updateLiveTime, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

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

  if (loadError) {
    return (
      <div className={styles.pageContainer}>
        <Header />
        <main className={styles.main}>
          <div className={styles.emptyContainer} role="alert">
            <AlertCircle size={48} color="#94a3b8" />
            <h2>확정 티켓을 확인하지 못했습니다</h2>
            <p>{loadError}</p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            >
              다시 시도
            </button>
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
  const preferredStations = reservation.stationPreferences
    .filter((preference) => preference.rank === 1 || preference.rank === 2)
    .sort((a, b) => a.rank - b.rank);
  const normalizedDropoffStation = ticket.dropoffStation.trim().toLocaleLowerCase();
  const isOutsidePreferredStations =
    preferredStations.length > 0 &&
    !preferredStations.some(
      (preference) =>
        preference.station.name.trim().toLocaleLowerCase() ===
        normalizedDropoffStation
    );
  const activityDateLabel = reservation.updatedAt ? '최종 수정일' : '신청일';
  const activityDate = reservation.updatedAt || reservation.requestedAt;
  const boardingConfirmedAt = reservation.boardingConfirmedAt;

  const handleConfirmBoarding = async () => {
    if (
      boardingConfirmedAt ||
      confirmingBoarding ||
      boardingConfirmationInFlightRef.current
    ) {
      return;
    }
    if (!/^\d{4}$/.test(boardingCode)) {
      setBoardingError('버스에서 안내받은 4자리 탑승 코드를 입력해주세요.');
      return;
    }

    boardingConfirmationInFlightRef.current = true;
    setConfirmingBoarding(true);
    setBoardingError('');

    try {
      const confirmedAt = await submitBoardingCheckInCode(boardingCode);
      setReservation((current) =>
        current ? { ...current, boardingConfirmedAt: confirmedAt } : current
      );
      setBoardingCode('');
    } catch (error) {
      console.error('탑승 확인 실패:', error);
      const message = error instanceof Error ? error.message : '';
      setBoardingError(
        message.includes('incorrect or expired')
          ? '탑승 코드가 올바르지 않거나 만료되었습니다. 탑승 관리 간사님에게 코드를 다시 확인해주세요.'
          : message.includes('already departed')
            ? '이미 출발 완료된 버스입니다. 탑승 관리 간사님에게 탑승 상태 확인을 요청해주세요.'
            : '탑승 코드를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.'
      );
    } finally {
      boardingConfirmationInFlightRef.current = false;
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
          <p className={styles.subtitle}>2026 서울행 버스 신청</p>
        </div>

        {/* 메인 버스표 카드 */}
        <div className={styles.movingVerificationBar} aria-live="off">
          <div className={styles.verificationBarContent}>
            <span className={styles.liveDot} aria-hidden="true" />
            <strong>LIVE TICKET</strong>
            <span>실시간 유효 버스표</span>
            <time dateTime={liveTime.toISOString()}>
              {liveTime.toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              })}
            </time>
          </div>
        </div>

        <div className={styles.ticketContainer}>
          {/* 위쪽 - 호차 정보 */}
          <div className={styles.ticketTop}>
            <div className={styles.busNumberSection}>
              <p className={styles.label}>호차</p>
              <p className={styles.busNumber}>{formatBusLabel(ticket.busNumber)}</p>
              <p className={styles.freeSeatingNotice}>해당 호차 내 자유석입니다</p>
            </div>
          </div>

          {/* 구분선 */}
          <div className={styles.divider} />

          {/* 중간 - 주요 정보 */}
          <div className={styles.ticketMiddle}>
            <div className={`${styles.infoRow} ${styles.tripSummaryRow}`}>
              <div className={`${styles.infoBlock} ${styles.tripSummaryBlock}`}>
                <Clock size={20} color="#2563eb" className={styles.infoIcon} />
                <div className={styles.infoBlockContent}>
                  <span className={styles.infoLabel}>출발 일시</span>
                  <span className={styles.infoValue}>{ticket.departureTime}</span>
                </div>
              </div>

              <div className={`${styles.infoBlock} ${styles.tripSummaryBlock}`}>
                <MapPin size={20} color="#dc2626" className={styles.infoIcon} />
                <div className={styles.infoBlockContent}>
                  <span className={styles.infoLabel}>탑승장소</span>
                  <span className={styles.infoValue}>{ticket.boardingPlace}</span>
                </div>
              </div>

              <div className={`${styles.infoBlock} ${styles.tripSummaryBlock}`}>
                <MapPin size={20} color="#16a34a" className={styles.infoIcon} />
                <div className={styles.infoBlockContent}>
                  <span className={styles.infoLabel}>확정 행선지</span>
                  <span className={styles.infoValue}>{ticket.dropoffStation}</span>
                  {ticket.dropoffDetail && (
                    <span className={styles.infoSubValue}>{ticket.dropoffDetail}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.ticketDetails}>
            <h3>탑승자 및 신청 정보</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.itemLabel}>탑승자</span>
                <span className={styles.itemValue}>{reservation.name}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.itemLabel}>연락처</span>
                <span className={styles.itemValue}>{reservation.phone}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.itemLabel}>소속 및 캠퍼스</span>
                <span className={styles.itemValue}>
                  {reservation.district} {reservation.team} · {reservation.campus}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.itemLabel}>{activityDateLabel}</span>
                <span className={styles.itemValue}>
                  {formatKoreanDateTime(activityDate)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {isOutsidePreferredStations && (
          <section className={styles.outOfPreferenceNotice} role="alert">
            <AlertCircle size={26} aria-hidden="true" />
            <div>
              <strong>신청한 1·2지망 외 행선지로 배정되었습니다.</strong>
              <p>
                관리자와 사전에 소통된 배정이 아니라면 반드시 관리자에게
                문의해주세요.
              </p>
              <div className={styles.preferenceSummary}>
                {preferredStations.map((preference) => (
                  <span key={preference.rank}>
                    {preference.rank}지망 {preference.station.name}
                  </span>
                ))}
                <span className={styles.assignedStation}>
                  확정 행선지 {ticket.dropoffStation}
                </span>
              </div>
            </div>
          </section>
        )}

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
                {boardingConfirmedAt ? '탑승 확인' : '버스 탑승 체크인'}
              </h2>
              <p>
                {boardingConfirmedAt
                  ? `${formatKoreanDateTime(boardingConfirmedAt)}에 확인했습니다.`
                  : '버스에 탑승한 뒤 탑승 관리 간사님이 안내하는 4자리 코드를 입력하세요.'}
              </p>
            </div>
          </div>
          {boardingConfirmedAt ? (
            <button
              type="button"
              className={styles.boardingConfirmButton}
              disabled
            >
              탑승 확인
            </button>
          ) : (
            <form
              className={styles.boardingConfirmation}
              onSubmit={(event) => {
                event.preventDefault();
                void handleConfirmBoarding();
              }}
            >
              <label className={styles.boardingCodeField}>
                <span>4자리 탑승 코드</span>
                <input
                  value={boardingCode}
                  onChange={(event) => {
                    setBoardingCode(event.target.value.replace(/\D/g, '').slice(0, 4));
                    setBoardingError('');
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={4}
                  placeholder="0000"
                  aria-label="4자리 탑승 코드"
                />
              </label>
              <div className={styles.boardingConfirmationActions}>
                <button
                  type="submit"
                  className={styles.boardingFinalConfirmButton}
                  disabled={confirmingBoarding || boardingCode.length !== 4}
                >
                  {confirmingBoarding ? '확인 중...' : '탑승 체크인'}
                </button>
              </div>
            </form>
          )}
          {boardingError && (
            <p className={styles.boardingError} role="alert">
              {boardingError}
            </p>
          )}
        </section>

        {/* 주의사항 */}
        <div className={styles.notice}>
          <ClipboardCheck size={20} aria-hidden="true" />
          <div>
            <p className={styles.noticeTitle}>출발 전 체크리스트</p>
            <ul className={styles.noticeList}>
              <li>출발 30분 전에 탑승장소에 도착해주세요</li>
              <li>확정된 호차를 확인하고 해당 호차의 빈 좌석에 탑승해주세요</li>
              {ticket.managerNote && (
                <li>{ticket.managerNote}</li>
              )}
            </ul>
          </div>
        </div>

      </main>
    </div>
  );
};

export default ConfirmedTicketPage;
