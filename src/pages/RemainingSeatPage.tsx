import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  Bus,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Header from '../components/Header';
import LoginRequiredModal from '../components/LoginRequiredModal';
import { getReservationDeadline } from '../lib/reservationDeadlineService';
import { getReservation } from '../lib/reservationService';
import {
  claimRemainingSeat,
  formatRemainingSeatBusLabel,
  getAvailableRemainingSeats,
  isDestinationQueueRemainingSeat,
  type RemainingSeatOption,
} from '../lib/remainingSeatService';
import { supabase } from '../lib/supabase';
import { createLoginRequiredRedirectState } from '../utils/redirect';
import { formatBusLabel } from '../utils/busLabel';

import styles from './RemainingSeatPage.module.css';

const getErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : '잔여 좌석 처리 중 오류가 발생했습니다.';

const PAYMENT_INFO_UNAVAILABLE_MESSAGE =
  '선택한 버스의 입금 계좌 또는 금액이 등록되지 않아 신청할 수 없습니다. 관리자에게 문의해주세요.';

const hasValidPaymentInfo = (option: RemainingSeatOption) =>
  typeof option.transferAccount === 'string' &&
  Boolean(option.transferAccount.trim()) &&
  Number.isFinite(option.price) &&
  option.price > 0;

const RemainingSeatPage = () => {
  const navigate = useNavigate();
  const [options, setOptions] = useState<RemainingSeatOption[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const claimInFlightRef = useRef(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState('');
  const [claimErrorMessage, setClaimErrorMessage] = useState('');
  const [depositorName, setDepositorName] = useState('');
  const [hasActiveReservation, setHasActiveReservation] = useState(false);
  const [isPaymentConfirmOpen, setIsPaymentConfirmOpen] = useState(false);
  const [isLoginRequiredModalOpen, setIsLoginRequiredModalOpen] =
    useState(false);

  const loadOptions = async () => {
    setLoading(true);
    setLoadErrorMessage('');
    setHasActiveReservation(false);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session) {
        setIsLoginRequiredModalOpen(true);
        return;
      }

      const [reservation, deadline] = await Promise.all([
        getReservation(),
        getReservationDeadline(),
      ]);

      if (!deadline.isClosed) {
        navigate('/reservation', { replace: true });
        return;
      }

      if (reservation && reservation.status !== 'cancelled') {
        setHasActiveReservation(true);
        setOptions([]);
        return;
      }

      const nextOptions = await getAvailableRemainingSeats();
      setOptions(nextOptions);
      setSelectedKey((current) =>
        nextOptions.some(
          (option) => `${option.allocationId}:${option.busId}` === current
        )
          ? current
          : ''
      );
    } catch (error) {
      console.error('잔여 좌석 조회 실패:', error);
      setLoadErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial page load synchronizes the authenticated user's external data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedOption =
    options.find(
      (option) => `${option.allocationId}:${option.busId}` === selectedKey
    ) ?? null;
  const commonSeatDetails = selectedOption;
  const selectedPaymentInfoUnavailable =
    selectedOption !== null && !hasValidPaymentInfo(selectedOption);

  const handleClaim = () => {
    if (!selectedOption) return;
    if (!hasValidPaymentInfo(selectedOption)) {
      setClaimErrorMessage(PAYMENT_INFO_UNAVAILABLE_MESSAGE);
      return;
    }
    if (!depositorName.trim()) {
      setClaimErrorMessage('입금자명을 입력해주세요.');
      return;
    }

    setClaimErrorMessage('');
    setIsPaymentConfirmOpen(true);
  };

  const handleConfirmPaid = async () => {
    if (claimInFlightRef.current) return;
    if (!selectedOption) return;
    if (!hasValidPaymentInfo(selectedOption)) {
      setIsPaymentConfirmOpen(false);
      setClaimErrorMessage(PAYMENT_INFO_UNAVAILABLE_MESSAGE);
      return;
    }

    claimInFlightRef.current = true;
    setSaving(true);
    setClaimErrorMessage('');

    try {
      await claimRemainingSeat(
        selectedOption.allocationId,
        selectedOption.busId,
        depositorName
      );
      setIsPaymentConfirmOpen(false);
      navigate('/ticket');
    } catch (error) {
      console.error('잔여 좌석 신청 실패:', error);
      setIsPaymentConfirmOpen(false);
      setClaimErrorMessage(getErrorMessage(error));
      await loadOptions();
    } finally {
      claimInFlightRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <Header />

      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/reservation')}
        >
          <ArrowLeft size={18} />
          신청 화면으로
        </button>

        <section className={styles.header}>
          <div className={styles.headerIcon}>
            <Bus size={30} />
          </div>
          <div>
            <span>POST-DEADLINE SEATS</span>
            <h1>잔여 좌석 신청</h1>
            <p>
              신청 마감 후 잔여 좌석을 임시 확보합니다. 서울지구 계좌 입금 후
              전체 관리자가 확인하면 버스표가 확정됩니다.
            </p>
          </div>
        </section>

        {loadErrorMessage && (
          <div className={styles.errorBox} role="alert">
            {loadErrorMessage}
          </div>
        )}

        {claimErrorMessage && (
          <div className={styles.errorBox} role="alert">
            {claimErrorMessage}
          </div>
        )}

        {loading ? (
          <section className={styles.emptyState}>잔여 좌석을 확인하는 중...</section>
        ) : hasActiveReservation ? (
          <section className={styles.emptyState}>
            <strong>이미 확정되었거나 진행 중인 버스 신청이 있습니다.</strong>
            <p>
              잔여 좌석 임시 확보는 버스 신청이 없는 사용자만 가능합니다.
              기존 버스표를 확인해주세요.
            </p>
            <button type="button" onClick={() => navigate('/ticket')}>
              <CheckCircle2 size={16} />
              내 버스표 확인하기
            </button>
          </section>
        ) : options.length === 0 ? (
          <section className={styles.emptyState}>
            <strong>현재 선택 가능한 잔여 좌석이 없습니다.</strong>
            <p>취소 좌석이 발생하면 이 화면에 자동으로 표시됩니다.</p>
            <button type="button" onClick={() => void loadOptions()}>
              <RefreshCw size={16} />
              다시 확인
            </button>
          </section>
        ) : (
          <>
            <div className={styles.optionList}>
              {options.map((option) => {
                const key = `${option.allocationId}:${option.busId}`;
                const isSelected = selectedKey === key;

                return (
                  <button
                    type="button"
                    key={key}
                    className={`${styles.optionCard} ${
                      isSelected ? styles.selectedOption : ''
                    }`}
                    onClick={() => {
                      setSelectedKey(key);
                      setClaimErrorMessage('');
                    }}
                    aria-pressed={isSelected}
                  >
                    <div className={styles.optionTop}>
                      <div>
                        <span>{option.destination}행</span>
                        <strong>{formatRemainingSeatBusLabel(option.busId, formatBusLabel(option.busLabel))}</strong>
                      </div>
                      <b>{option.remainingSeats}석 남음</b>
                    </div>

                  </button>
                );
              })}
            </div>

            <div className={styles.actionBar}>
              <div>
                <span>
                  {selectedOption && isDestinationQueueRemainingSeat(selectedOption.busId)
                    ? '선택한 행선지'
                    : '선택한 좌석'}
                </span>
                <strong>
                  {selectedOption
                    ? `${selectedOption.destination}행 ${formatRemainingSeatBusLabel(selectedOption.busId, formatBusLabel(selectedOption.busLabel))}`
                    : '버스를 선택해주세요'}
                </strong>
                {commonSeatDetails && (
                  <div className={styles.selectedDetails}>
                    <div>
                      <Clock3 size={16} />
                      <span>출발 일시</span>
                      <strong>{commonSeatDetails.departureTime}</strong>
                    </div>
                    <div>
                      <MapPin size={16} />
                      <span>탑승장소</span>
                      <strong>{commonSeatDetails.boardingPlace}</strong>
                    </div>
                    <div>
                      <Banknote size={16} />
                      <span>입금금액</span>
                      <strong>{commonSeatDetails.price.toLocaleString()}원</strong>
                    </div>
                    <div>
                      <Banknote size={16} />
                      <span>입금계좌</span>
                      <strong>
                        {commonSeatDetails.transferAccount || '관리자 확인 필요'}
                      </strong>
                    </div>
                  </div>
                )}
                {selectedPaymentInfoUnavailable && (
                  <div className={styles.errorBox} role="alert">
                    {PAYMENT_INFO_UNAVAILABLE_MESSAGE}
                  </div>
                )}
                <label className={styles.depositorField}>
                  <span>입금자명</span>
                  <input
                    value={depositorName}
                    onChange={(event) => setDepositorName(event.target.value)}
                    placeholder="예: 홍길동1234"
                  />
                  <small>
                    공백 없이 이름 뒤에 휴대폰 뒷 4자리를 입력해주세요.
                  </small>
                </label>
              </div>
              <button
                type="button"
                onClick={handleClaim}
                disabled={
                  !selectedOption ||
                  selectedPaymentInfoUnavailable ||
                  !depositorName.trim() ||
                  saving
                }
              >
                <CheckCircle2 size={18} />
                {saving ? '좌석 확보 중...' : '좌석 임시 확보하기'}
              </button>
            </div>
          </>
        )}
      </main>

      {isPaymentConfirmOpen && selectedOption && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setIsPaymentConfirmOpen(false);
            }
          }}
        >
          <section
            className={styles.paymentModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-confirm-title"
            aria-describedby="payment-confirm-description"
          >
            <div className={styles.modalIcon}>
              <Banknote size={26} />
            </div>
            <div className={styles.modalHeading}>
              <span>입금 확인</span>
              <h2 id="payment-confirm-title">서울지구 계좌로 입금하셨나요?</h2>
              <p id="payment-confirm-description">
                입금을 완료한 경우에만 좌석을 임시 확보해주세요. 전체 관리자가
                입금을 확인하면 버스표가 확정됩니다.
              </p>
            </div>

            <dl className={styles.modalDetails}>
              <div>
                <dt>
                  {isDestinationQueueRemainingSeat(selectedOption.busId)
                    ? '선택 행선지'
                    : '선택 좌석'}
                </dt>
                <dd>
                  {selectedOption.destination}행{' '}
                  {formatRemainingSeatBusLabel(selectedOption.busId, formatBusLabel(selectedOption.busLabel))}
                </dd>
              </div>
              <div>
                <dt>입금 금액</dt>
                <dd>{selectedOption.price.toLocaleString()}원</dd>
              </div>
              <div>
                <dt>입금 계좌</dt>
                <dd>
                  {selectedOption.transferAccount || '관리자 확인 필요'}
                </dd>
              </div>
              <div>
                <dt>입금자명</dt>
                <dd>{depositorName.trim()}</dd>
              </div>
            </dl>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={() => setIsPaymentConfirmOpen(false)}
                disabled={saving}
                autoFocus
              >
                아직 미입금 상태예요
              </button>
              <button
                type="button"
                className={styles.modalConfirmButton}
                onClick={() => void handleConfirmPaid()}
                disabled={saving || !hasValidPaymentInfo(selectedOption)}
              >
                <CheckCircle2 size={18} />
                {saving ? '좌석 확보 중...' : '입금 완료했어요'}
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
              state: createLoginRequiredRedirectState('/remaining-seats'),
            })
          }
          onSignup={() =>
            navigate('/signup', {
              replace: true,
              state: createLoginRequiredRedirectState('/remaining-seats'),
            })
          }
        />
      )}
    </div>
  );
};

export default RemainingSeatPage;
