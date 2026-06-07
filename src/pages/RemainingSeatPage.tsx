import { useEffect, useState } from 'react';
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
import { getReservationDeadline } from '../lib/reservationDeadlineService';
import { getReservation } from '../lib/reservationService';
import {
  claimRemainingSeat,
  getAvailableRemainingSeats,
  type RemainingSeatOption,
} from '../lib/remainingSeatService';
import { supabase } from '../lib/supabase';

import styles from './RemainingSeatPage.module.css';

const getErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : '잔여 좌석 처리 중 오류가 발생했습니다.';

const RemainingSeatPage = () => {
  const navigate = useNavigate();
  const [options, setOptions] = useState<RemainingSeatOption[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [depositorName, setDepositorName] = useState('');

  const loadOptions = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate('/login', { state: { from: '/remaining-seats' } });
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

      if (reservation) {
        navigate('/ticket', { replace: true });
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
      setErrorMessage(getErrorMessage(error));
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

  const handleClaim = async () => {
    if (!selectedOption) return;
    if (!depositorName.trim()) {
      setErrorMessage('입금자명을 입력해주세요.');
      return;
    }

    const confirmed = window.confirm(
      `${selectedOption.destination}행 ${selectedOption.busLabel} 좌석을 임시 확보할까요?\n전체 관리자가 입금을 확인하면 버스표가 확정됩니다.`
    );
    if (!confirmed) return;

    setSaving(true);
    setErrorMessage('');

    try {
      await claimRemainingSeat(
        selectedOption.allocationId,
        selectedOption.busId,
        depositorName
      );
      navigate('/ticket');
    } catch (error) {
      console.error('잔여 좌석 신청 실패:', error);
      setErrorMessage(getErrorMessage(error));
      await loadOptions();
    } finally {
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
            <h1>잔여 좌석 선택</h1>
            <p>
              신청 마감 후 남은 좌석을 임시 확보합니다. 서울지구 계좌 입금 후
              전체 관리자가 확인하면 버스표가 확정됩니다.
            </p>
          </div>
        </section>

        {errorMessage && (
          <div className={styles.errorBox} role="alert">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <section className={styles.emptyState}>잔여 좌석을 확인하는 중...</section>
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
                    onClick={() => setSelectedKey(key)}
                    aria-pressed={isSelected}
                  >
                    <div className={styles.optionTop}>
                      <div>
                        <span>{option.destination}행</span>
                        <strong>{option.busLabel}</strong>
                      </div>
                      <b>{option.remainingSeats}석 남음</b>
                    </div>

                    <div className={styles.optionDetails}>
                      <div>
                        <Clock3 size={17} />
                        <span>출발시간</span>
                        <strong>{option.departureTime}</strong>
                      </div>
                      <div>
                        <MapPin size={17} />
                        <span>탑승장소</span>
                        <strong>{option.boardingPlace}</strong>
                      </div>
                      <div>
                        <Banknote size={17} />
                        <span>입금 금액</span>
                        <strong>{option.price.toLocaleString()}원</strong>
                      </div>
                      <div>
                        <Banknote size={17} />
                        <span>서울지구 입금 계좌</span>
                        <strong>{option.transferAccount || '관리자 확인 필요'}</strong>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className={styles.actionBar}>
              <div>
                <span>선택한 좌석</span>
                <strong>
                  {selectedOption
                    ? `${selectedOption.destination}행 ${selectedOption.busLabel}`
                    : '버스를 선택해주세요'}
                </strong>
                <label className={styles.depositorField}>
                  <span>입금자명</span>
                  <input
                    value={depositorName}
                    onChange={(event) => setDepositorName(event.target.value)}
                    placeholder="실제 입금자명 입력"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void handleClaim()}
                disabled={!selectedOption || !depositorName.trim() || saving}
              >
                <CheckCircle2 size={18} />
                {saving ? '좌석 확보 중...' : '좌석 임시 확보하기'}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default RemainingSeatPage;
