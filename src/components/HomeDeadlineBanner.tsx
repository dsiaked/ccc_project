import { useEffect, useMemo, useState } from 'react';
import { Clock3 } from 'lucide-react';

import {
  formatReservationDeadline,
  getReservationDeadline,
} from '../lib/reservationDeadlineService';
import styles from './HomeDeadlineBanner.module.css';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const getRemainingText = (deadlineAt: string, nowMs: number) => {
  const remainingMs = new Date(deadlineAt).getTime() - nowMs;

  if (remainingMs <= 0) return '신청이 마감되었습니다.';

  const days = Math.floor(remainingMs / DAY_MS);
  const hours = Math.floor((remainingMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((remainingMs % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((remainingMs % MINUTE_MS) / SECOND_MS);

  if (days > 0) return `${days}일 ${hours}시간 ${minutes}분 남음`;
  if (hours > 0) return `${hours}시간 ${minutes}분 ${seconds}초 남음`;
  return `${minutes}분 ${seconds}초 남음`;
};

const HomeDeadlineBanner = () => {
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let isMounted = true;

    const loadDeadline = async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const setting = await getReservationDeadline();
        if (isMounted) setDeadlineAt(setting.deadlineAt);
      } catch (error) {
        console.error('신청 마감 정보 로드 실패:', error);
        if (isMounted) setLoadError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadDeadline();
    const timerId = window.setInterval(() => setNowMs(Date.now()), SECOND_MS);

    return () => {
      isMounted = false;
      window.clearInterval(timerId);
    };
  }, [loadAttempt]);

  const isClosed = Boolean(deadlineAt && new Date(deadlineAt).getTime() <= nowMs);
  const remainingText = useMemo(
    () => (deadlineAt ? getRemainingText(deadlineAt, nowMs) : ''),
    [deadlineAt, nowMs]
  );

  if (loading || (!deadlineAt && !loadError)) return null;

  return (
    <section
      className={`${styles.banner} ${isClosed ? styles.closedBanner : ''}`}
      aria-label="버스 신청 마감 안내"
    >
      <div className={styles.iconBox}>
        <Clock3 size={18} />
      </div>
      <div className={styles.content}>
        <span>신청 마감</span>
        <strong>{loadError ? '마감 정보를 확인하지 못했습니다.' : remainingText}</strong>
        {loadError && (
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            다시 시도
          </button>
        )}
        {deadlineAt && <p>신청 마감 일시: {formatReservationDeadline(deadlineAt)}</p>}
      </div>
    </section>
  );
};

export default HomeDeadlineBanner;
