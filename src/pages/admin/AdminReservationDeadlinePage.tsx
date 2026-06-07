import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import {
  formatReservationDeadline,
  getReservationDeadline,
  updateReservationDeadline,
} from '../../lib/reservationDeadlineService';

import styles from './AdminReservationDeadlinePage.module.css';

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;

  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>;

    return String(
      errorRecord.message ||
        errorRecord.details ||
        errorRecord.hint ||
        errorRecord.code ||
        JSON.stringify(errorRecord)
    );
  }

  return '알 수 없는 오류가 발생했습니다.';
};

const formatDateTimeLocal = (isoValue: string | null) => {
  if (!isoValue) return '';

  const date = new Date(isoValue);

  if (Number.isNaN(date.getTime())) return '';

  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;

  return new Date(date.getTime() - timezoneOffsetMs)
    .toISOString()
    .slice(0, 16);
};

const parseDateTimeLocal = (value: string) => {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
};

const AdminReservationDeadlinePage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [deadlineInput, setDeadlineInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let isMounted = true;

    const loadDeadline = async () => {
      try {
        const setting = await getReservationDeadline();

        if (!isMounted) return;

        setDeadlineAt(setting.deadlineAt);
        setDeadlineInput(formatDateTimeLocal(setting.deadlineAt));
        setNowMs(Date.now());
      } catch (error) {
        console.error('신청 마감 정보를 불러올 수 없습니다:', error);

        if (isMounted) {
          alert(
            `신청 마감 정보를 불러올 수 없습니다: ${getErrorMessage(error)}`
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadDeadline();

    return () => {
      isMounted = false;
    };
  }, []);

  const isClosed = Boolean(deadlineAt && new Date(deadlineAt).getTime() <= nowMs);

  const handleSaveDeadline = async () => {
    const deadlineIso = parseDateTimeLocal(deadlineInput);

    if (deadlineInput && !deadlineIso) {
      alert('신청 마감 일시를 올바른 날짜와 시간으로 입력해주세요.');
      return;
    }

    const confirmMessage = deadlineIso
      ? `신청 마감 일시를 ${formatReservationDeadline(
          deadlineIso
        )}(으)로 설정할까요?`
      : '신청 마감 일시를 해제할까요?';

    const ok = window.confirm(confirmMessage);

    if (!ok) return;

    setSaving(true);

    try {
      const savedDeadline = await updateReservationDeadline(deadlineIso);

      setDeadlineAt(savedDeadline.deadlineAt);
      setDeadlineInput(formatDateTimeLocal(savedDeadline.deadlineAt));
      setNowMs(Date.now());

      alert('신청 마감 일시를 저장했습니다.');
    } catch (error) {
      console.error('신청 마감 저장 실패:', error);
      alert(
        `신청 마감 저장 중 오류가 발생했습니다: ${getErrorMessage(error)}`
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <AdminHeader />
        <main className={styles.main}>
          <p>로딩 중...</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />

      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/admin/global')}
        >
          <ArrowLeft size={18} />
          전체 관리자 화면
        </button>

        <div className={styles.header}>
          <div>
            <span className={styles.overline}>운영 시나리오 4단계</span>
            <h1>신청 마감 설정</h1>
            <p>
              설정한 기한 이후에는 사용자가 버스 신청이나 수정을 저장할 수
              없습니다.
            </p>
          </div>

          <div
            className={`${styles.statusBadge} ${
              isClosed ? styles.statusClosed : styles.statusOpen
            }`}
          >
            <CalendarClock size={18} />
            {isClosed ? '마감됨' : '신청 가능'}
          </div>
        </div>

        <section className={styles.guidePanel}>
          <h2>사용 방법</h2>
          <ol>
            <li>마감할 날짜와 시간을 선택합니다.</li>
            <li>저장하면 그 시각 이후부터 사용자 신청 저장이 막힙니다.</li>
            <li>기한을 비우고 저장하면 다시 신청 가능한 상태가 됩니다.</li>
          </ol>
        </section>

        <section className={styles.formPanel}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>신청 마감 일시</span>
              <input
                type="datetime-local"
                value={deadlineInput}
                onChange={(event) => setDeadlineInput(event.target.value)}
              />
            </label>

            <div className={styles.currentStatus}>
              <span>현재 적용된 기한</span>
              <strong>{formatReservationDeadline(deadlineAt)}</strong>
              <p>
                {deadlineAt
                  ? isClosed
                    ? '현재 사용자는 새 신청을 저장할 수 없습니다.'
                    : '마감 전까지 사용자는 신청을 저장할 수 있습니다.'
                  : '아직 신청 마감 일시가 설정되지 않았습니다.'}
              </p>
            </div>
          </div>

          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setDeadlineInput('')}
              disabled={saving}
            >
              기한 비우기
            </button>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleSaveDeadline}
              disabled={saving}
            >
              {saving ? '저장 중...' : '신청 마감 일시 저장'}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminReservationDeadlinePage;
