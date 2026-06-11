import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Bus,
  Building2,
  CheckCircle2,
  Clock,
  LoaderCircle,
  MapPin,
  Ticket,
  User,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import LoginRequiredModal from '../components/LoginRequiredModal';
import type { ReturnBusReservation } from '../types/reservation';
import styles from './TicketPage.module.css';
import { supabase } from '../lib/supabase';
import { createLoginRequiredRedirectState } from '../utils/redirect';
import { getReservation } from '../lib/reservationService';
import {
  getReservationDeadline,
  type ReservationDeadlineSetting,
} from '../lib/reservationDeadlineService';
import { formatKoreanDateTime } from '../utils/dateTime';
import { cancelRemainingSeatClaim } from '../lib/remainingSeatService';
import { formatBusLabel } from '../utils/busLabel';
import ConfirmedTicketPage from './ConfirmedTicketPage';

const TicketPage = () => {
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<ReturnBusReservation | null>(null);
  const [reservationDeadline, setReservationDeadline] =
    useState<ReservationDeadlineSetting>({
      deadlineAt: null,
      isClosed: false,
    });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const cancelInFlightRef = useRef(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [isLoginRequiredModalOpen, setIsLoginRequiredModalOpen] =
    useState(false);
  const activityDateLabel = reservation?.updatedAt ? '최종 수정 일시' : '신청 일시';
  const activityDate = reservation?.updatedAt || reservation?.requestedAt;
  const remainingSeatClaim = reservation?.remainingSeatClaim;

  const handleCancelRemainingSeat = () => {
    if (!reservation?.remainingSeatClaim || cancelling) return;
    setCancelError('');
    setCancelDialogOpen(true);
  };

  const confirmCancelRemainingSeat = async () => {
    if (
      !reservation?.remainingSeatClaim ||
      cancelling ||
      cancelInFlightRef.current
    ) {
      return;
    }

    cancelInFlightRef.current = true;
    setCancelling(true);
    setCancelError('');
    try {
      await cancelRemainingSeatClaim(reservation.id);
      navigate('/remaining-seats', { replace: true });
    } catch (error) {
      console.error('잔여 좌석 신청 취소 실패:', error);
      try {
        const currentReservation = await getReservation();
        if (!currentReservation || currentReservation.status === 'cancelled') {
          navigate('/remaining-seats', { replace: true });
          return;
        }
        setReservation(currentReservation);
      } catch (reloadError) {
        console.error('Failed to verify remaining-seat cancellation:', reloadError);
      }
      setCancelError('잔여 좌석 신청을 취소하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      cancelInFlightRef.current = false;
      setCancelling(false);
    }
  };

  useEffect(() => {
    if (!cancelDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !cancelling) {
        setCancelDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelDialogOpen, cancelling]);

  useEffect(() => {
    let isMounted = true;

    const loadReservation = async () => {
      setLoading(true);
      setLoadError('');

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (sessionError) {
          throw sessionError;
        }

        if (!session) {
          setIsLoginRequiredModalOpen(true);
          return;
        }

        const [dbReservation, deadline] = await Promise.all([
          getReservation(),
          getReservationDeadline(),
        ]);

        if (!isMounted) return;

        setReservationDeadline(deadline);

        if (dbReservation && dbReservation.status !== 'cancelled') {
          setReservation(dbReservation);
        } else {
          // DB에 없으면 아무것도 표시하지 않음
          setReservation(null);
        }
      } catch (error) {
        console.error('신청 정보 로드 실패:', error);
        if (isMounted) {
          setReservation(null);
          setLoadError('신청 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadReservation();

    return () => {
      isMounted = false;
    };
  }, [loadAttempt, navigate]);

  if (reservation?.status === 'confirmed' && reservation.confirmedTicket) {
    return <ConfirmedTicketPage initialReservation={reservation} />;
  }
  
  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <div className={styles.headerContent}>
          <div className={styles.iconCircle}>
            <Ticket size={32} color="#ffffff" />
          </div>
          <h1 className={styles.title}>버스 신청 현황</h1>
          <p className={styles.subtitle}>
            신청한 귀가 버스 정보와 확정된 탑승권을 확인할 수 있습니다
          </p>
        </div>

        {loading ? (
          <section className={styles.emptyCard}>
            <Ticket size={44} color="#98a2b3" />
            <h2 className={styles.emptyTitle}>로딩 중...</h2>
          </section>
        ) : loadError ? (
          <section className={styles.errorCard} role="alert">
            <Ticket size={44} aria-hidden="true" />
            <h2 className={styles.emptyTitle}>신청 정보를 확인하지 못했습니다</h2>
            <p className={styles.emptyText}>{loadError}</p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            >
              다시 시도
            </button>
          </section>
        ) : reservation ? (
          <section className={styles.ticketCard}>
            <div className={styles.ticketHeader}>
              <div>
                <p className={styles.badge}>버스 신청</p>
                <h2 className={styles.ticketTitle}>2026 CCC 여름수련회 귀가 버스</h2>
              </div>

              <Bus size={38} color="#2563eb" />
            </div>

            <div
              className={`${styles.requestedStatusBox} ${
                remainingSeatClaim
                  ? styles.paymentPendingStatusBox
                  : reservationDeadline.isClosed
                    ? styles.closedStatusBox
                    : ''
              }`}
            >
              {remainingSeatClaim ? (
                <>
                  <CheckCircle2 size={22} aria-hidden="true" />
                  <div>
                    <strong>잔여 좌석이 임시 확보되었습니다</strong>
                    <span>
                      입금 확인이 완료되면 확정 탑승권으로 자동 전환됩니다.
                    </span>
                  </div>
                </>
              ) : reservationDeadline.isClosed ? (
                '신청 및 정보 수정이 마감되었습니다. 제출한 희망 행선지를 바탕으로 배차를 준비하고 있으며, 확정되면 이 화면에서 탑승할 호차를 확인할 수 있습니다.'
              ) : (
                '신청이 접수되었습니다. 아직 관리자 배정 전입니다.'
              )}
            </div>

            <section className={styles.progressSection} aria-labelledby="application-progress-title">
              <div className={styles.progressHeader}>
                <div>
                  <span>신청 이후 진행 상황</span>
                  <h3 id="application-progress-title">
                    {remainingSeatClaim ? '입금 확인을 기다리고 있어요' : '배차 확정을 기다리고 있어요'}
                  </h3>
                </div>
                <Clock size={20} aria-hidden="true" />
              </div>
              <ol className={styles.progressList}>
                {(remainingSeatClaim
                  ? [
                      { label: '잔여 좌석 신청', detail: '완료', state: 'done' },
                      { label: '좌석 임시 확보', detail: '완료', state: 'done' },
                      { label: '입금 확인', detail: '현재 단계', state: 'current' },
                      { label: '탑승권 발급', detail: '예정', state: 'upcoming' },
                    ]
                  : [
                      { label: '버스 신청', detail: '완료', state: 'done' },
                      { label: '배차 확정', detail: '현재 대기 중', state: 'current' },
                      { label: '입금 확인', detail: '예정', state: 'upcoming' },
                      { label: '탑승권 발급', detail: '예정', state: 'upcoming' },
                    ]
                ).map((step) => (
                  <li
                    key={step.label}
                    className={`${styles.progressItem} ${
                      step.state === 'done'
                        ? styles.progressDone
                        : step.state === 'current'
                          ? styles.progressCurrent
                          : styles.progressUpcoming
                    }`}
                  >
                    <span className={styles.progressMarker} aria-hidden="true">
                      {step.state === 'done' ? <CheckCircle2 size={18} /> : null}
                    </span>
                    <strong>{step.label}</strong>
                    <small>{step.detail}</small>
                  </li>
                ))}
              </ol>
            </section>

            {remainingSeatClaim && (
              <section className={styles.claimSummary} aria-label="임시 확보 좌석">
                <div className={styles.claimSummaryHeader}>
                  <div>
                    <span>선택한 잔여 좌석</span>
                    <h3>
                      {remainingSeatClaim.destination}행 ·{' '}
                      {formatBusLabel(remainingSeatClaim.busLabel)}
                    </h3>
                  </div>
                  <span className={styles.pendingBadge}>입금 확인 대기</span>
                </div>

                <div className={styles.claimSummaryGrid}>
                  <div>
                    <Clock size={18} aria-hidden="true" />
                    <span>출발 일시</span>
                    <strong>{remainingSeatClaim.departureTime}</strong>
                  </div>
                  <div>
                    <MapPin size={18} aria-hidden="true" />
                    <span>탑승장소</span>
                    <strong>{remainingSeatClaim.boardingPlace}</strong>
                  </div>
                </div>
              </section>
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

              {!remainingSeatClaim && (
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
              )}

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
                    <p className={styles.label}>잔여 좌석 입금 안내</p>
                    <div className={styles.paymentDetails}>
                      <div>
                        <span>입금 금액</span>
                        <strong>{remainingSeatClaim.amount.toLocaleString()}원</strong>
                      </div>
                      <div>
                        <span>입금 계좌</span>
                        <strong>
                          {remainingSeatClaim.transferAccount ||
                            '서울지구 계좌 확인 필요'}
                        </strong>
                      </div>
                      <div>
                        <span>입금자명</span>
                        <strong>{remainingSeatClaim.depositorName}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {(remainingSeatClaim || !reservationDeadline.isClosed) && (
              <div className={styles.noticeBox}>
                <p>
                  {remainingSeatClaim
                    ? '입금 확인 전에는 직접 취소할 수 있습니다. 입금 확인 후 변경이나 취소는 관리자에게 문의해주세요.'
                    : '아직 탑승권이 확정되지 않았습니다. 관리자가 희망 행선지와 인원 현황을 확인한 뒤 호차와 행선지를 확정합니다.'}
                </p>
              </div>
            )}

            <div className={styles.buttonGroup}>
              {(remainingSeatClaim || !reservationDeadline.isClosed) && (
                <button
                  className={styles.secondaryButton}
                  onClick={() =>
                    navigate(remainingSeatClaim ? '/remaining-seats' : '/reservation')
                  }
                >
                  {remainingSeatClaim ? '잔여 좌석 현황 보기' : '신청 정보 수정하기'}
                </button>
              )}

              {remainingSeatClaim && (
                <button
                  className={styles.dangerButton}
                  onClick={handleCancelRemainingSeat}
                  disabled={cancelling}
                >
                  {cancelling ? '취소 중...' : '미입금 신청 취소'}
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
          <section
            className={`${styles.emptyCard} ${
              reservationDeadline.isClosed ? styles.closedEmptyCard : ''
            }`}
          >
            <Ticket size={44} color="#98a2b3" />
            <h2 className={styles.emptyTitle}>
              {reservationDeadline.isClosed
                ? '버스 신청이 마감되었습니다'
                : '아직 신청 정보가 없습니다'}
            </h2>
            <p className={styles.emptyText}>
              {reservationDeadline.isClosed
                ? '현재 신청 내역이 없습니다. 확정 배차 후 잔여 좌석이 열리면 잔여 좌석을 선택할 수 있습니다.'
                : '귀가 버스를 신청하면 이곳에서 신청 내역과 탑승권을 확인할 수 있습니다.'}
            </p>
            <button
              className={styles.primaryButton}
              onClick={() =>
                navigate(
                  reservationDeadline.isClosed ? '/remaining-seats' : '/reservation'
                )
              }
            >
              {reservationDeadline.isClosed
                ? '잔여 좌석 확인하기'
                : '버스 신청하기'}
            </button>
          </section>
        )}
      </main>

      {cancelDialogOpen && remainingSeatClaim && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !cancelling) {
              setCancelDialogOpen(false);
            }
          }}
        >
          <section
            className={styles.cancelDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="remaining-seat-cancel-title"
            aria-describedby="remaining-seat-cancel-description"
          >
            <span className={styles.cancelDialogIcon} aria-hidden="true">
              <AlertTriangle size={26} />
            </span>
            <p className={styles.cancelDialogEyebrow}>잔여 좌석 신청 취소</p>
            <h2 id="remaining-seat-cancel-title">
              미입금 신청을 취소할까요?
            </h2>
            <p id="remaining-seat-cancel-description">
              취소하면 확보한 좌석은 즉시 다시 공개됩니다. 이미 입금했다면 환불은
              자동 처리되지 않을 수 있으므로 관리자에게 문의하고 환불 여부를
              반드시 확인해주세요.
            </p>
            <dl className={styles.cancelDialogSummary}>
              <div>
                <dt>버스</dt>
                <dd>{formatBusLabel(remainingSeatClaim.busLabel)}</dd>
              </div>
              <div>
                <dt>도착지</dt>
                <dd>{remainingSeatClaim.destination}</dd>
              </div>
              <div>
                <dt>좌석</dt>
                <dd>{remainingSeatClaim.seatNumber}</dd>
              </div>
              <div>
                <dt>입금 안내 금액</dt>
                <dd>{remainingSeatClaim.amount.toLocaleString()}원</dd>
              </div>
              <div>
                <dt>처리 결과</dt>
                <dd>신청 취소 · 좌석 다시 공개</dd>
              </div>
            </dl>
            <div className={styles.refundWarning}>
              <AlertTriangle size={18} aria-hidden="true" />
              <span>신청 취소는 환불 완료를 의미하지 않습니다.</span>
            </div>
            {cancelError && (
              <p className={styles.cancelError} role="alert">
                {cancelError}
              </p>
            )}
            <div className={styles.cancelDialogActions}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={() => setCancelDialogOpen(false)}
                disabled={cancelling}
                autoFocus
              >
                신청 유지
              </button>
              <button
                type="button"
                className={styles.modalConfirmButton}
                onClick={() => void confirmCancelRemainingSeat()}
                disabled={cancelling}
              >
                {cancelling ? (
                  <>
                    <LoaderCircle className={styles.spin} size={18} /> 취소 중...
                  </>
                ) : (
                  '신청 취소하고 좌석 공개'
                )}
              </button>
            </div>
          </section>
        </div>
      )}

      {isLoginRequiredModalOpen && (
        <LoginRequiredModal
          onClose={() => navigate('/', { replace: true })}
          onConfirm={() =>
            navigate('/login', {
              replace: true,
              state: createLoginRequiredRedirectState('/ticket'),
            })
          }
          onSignup={() =>
            navigate('/signup', {
              replace: true,
              state: createLoginRequiredRedirectState('/ticket'),
            })
          }
        />
      )}
    </div>
  );
};

export default TicketPage;
