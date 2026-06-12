import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  LoaderCircle,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import {
  formatReservationDeadline,
  getReservationDeadline,
  hasConfirmedAllocation,
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
  const [opensAt, setOpensAt] = useState<string | null>(null);
  const [opensInput, setOpensInput] = useState('');
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [deadlineInput, setDeadlineInput] = useState('');
  const [confirmedAllocationExists, setConfirmedAllocationExists] =
    useState(false);
  const [saving, setSaving] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const deadlineActionInFlightRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<
    | { mode: 'set'; deadlineIso: string }
    | { mode: 'clear' }
    | { mode: 'immediate' }
    | null
  >(null);
  const [dialogError, setDialogError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadDeadline = async () => {
      try {
        const [setting, hasConfirmed] = await Promise.all([
          getReservationDeadline(),
          hasConfirmedAllocation(),
        ]);

        if (!isMounted) return;

        setOpensAt(setting.opensAt);
        setOpensInput(formatDateTimeLocal(setting.opensAt));
        setDeadlineAt(setting.deadlineAt);
        setDeadlineInput(formatDateTimeLocal(setting.deadlineAt));
        setConfirmedAllocationExists(hasConfirmed);
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
  const isBeforeOpening = Boolean(
    opensAt && new Date(opensAt).getTime() > nowMs
  );

  const handleSaveDeadline = async () => {
    const opensIso = parseDateTimeLocal(opensInput);
    const deadlineIso = parseDateTimeLocal(deadlineInput);

    if (opensInput && !opensIso) {
      alert('신청 시작 일시를 올바른 날짜와 시간으로 입력해주세요.');
      return;
    }
    if (deadlineInput && !deadlineIso) {
      alert('신청 마감 일시를 올바른 날짜와 시간으로 입력해주세요.');
      return;
    }
    if (
      opensIso &&
      deadlineIso &&
      new Date(opensIso).getTime() >= new Date(deadlineIso).getTime()
    ) {
      setMessage('신청 시작 일시는 신청 마감 일시보다 빨라야 합니다.');
      return;
    }

    const reopensReservations =
      deadlineIso === null || new Date(deadlineIso).getTime() > Date.now();
    if (confirmedAllocationExists && reopensReservations) {
      setMessage('확정 배차를 먼저 취소한 뒤 신청을 다시 열 수 있습니다.');
      setDialogError(
        '확정 배차를 먼저 취소한 뒤 신청을 다시 열 수 있습니다.'
      );
      return;
    }

    setDialogError('');
    if (deadlineIso) {
      setPendingAction({ mode: 'set', deadlineIso });
    } else {
      setPendingAction({ mode: 'clear' });
    }
  };

  const handleCloseImmediately = () => {
    setDialogError('');
    setPendingAction({ mode: 'immediate' });
  };

  const confirmDeadlineAction = async () => {
    if (!pendingAction || saving || deadlineActionInFlightRef.current) return;

    const action = pendingAction;
    const nextDeadline =
      action.mode === 'set'
        ? action.deadlineIso
        : action.mode === 'immediate'
          ? new Date().toISOString()
          : null;
    const reopensReservations =
      nextDeadline === null || new Date(nextDeadline).getTime() > Date.now();
    if (confirmedAllocationExists && reopensReservations) {
      setDialogError(
        '확정 배차를 먼저 취소한 뒤 신청을 다시 열 수 있습니다.'
      );
      return;
    }

    deadlineActionInFlightRef.current = true;
    setSaving(true);
    setDialogError('');
    setMessage('');

    try {
      const nextOpensAt =
        action.mode === 'immediate' ? null : parseDateTimeLocal(opensInput);
      const savedDeadline = await updateReservationDeadline(
        nextDeadline,
        nextOpensAt
      );

      setOpensAt(savedDeadline.opensAt);
      setOpensInput(formatDateTimeLocal(savedDeadline.opensAt));
      setDeadlineAt(savedDeadline.deadlineAt);
      setDeadlineInput(formatDateTimeLocal(savedDeadline.deadlineAt));
      setNowMs(Date.now());
      setPendingAction(null);
      setMessage(
        action.mode === 'clear'
          ? '신청 마감 일시를 해제했습니다.'
          : action.mode === 'immediate'
            ? '신청을 즉시 마감했습니다.'
            : '신청 마감 일시를 저장했습니다.'
      );
    } catch (error) {
      console.error('신청 마감 변경 실패:', error);
      setDialogError(`신청 마감 변경 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      deadlineActionInFlightRef.current = false;
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!pendingAction) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setPendingAction(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingAction, saving]);

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
          onClick={() => navigate('/admin/dashboard')}
        >
          <ArrowLeft size={18} />
          전체 관리자 화면
        </button>

        <div className={styles.header}>
          <div>
            <span className={styles.overline}>운영 시나리오 2단계</span>
            <h1>신청 마감 설정</h1>
            <p>
              설정한 기한 이후에는 사용자가 버스 신청이나 수정을 저장할 수
              없습니다.
            </p>
          </div>

          <div
            className={`${styles.statusBadge} ${
              isClosed || isBeforeOpening
                ? styles.statusClosed
                : styles.statusOpen
            }`}
          >
            <CalendarClock size={18} />
            {isClosed ? '마감됨' : isBeforeOpening ? '시작 전 잠금' : '신청 가능'}
          </div>
        </div>

        <section className={styles.guidePanel}>
          <h2>사용 방법</h2>
          <ol>
            <li>신청 시작 일시를 설정하면 해당 시각 전까지 신청이 잠깁니다.</li>
            <li>마감할 날짜와 시간을 선택합니다.</li>
            <li>저장하면 그 시각 이후부터 사용자 신청 저장이 막힙니다.</li>
            <li>기한을 비우고 저장하면 다시 신청 가능한 상태가 됩니다.</li>
          </ol>
        </section>

        <section className={styles.formPanel}>
          {message && (
            <p className={styles.successMessage} role="status">
              {message}
            </p>
          )}
          {confirmedAllocationExists && (
            <p className={styles.actionDialogError} role="alert">
              확정 배차가 존재하여 신청 마감 해제와 미래 시각 변경이 잠겨 있습니다.
              배차 확정을 먼저 취소해주세요.
            </p>
          )}
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>신청 시작 일시</span>
              <input
                type="datetime-local"
                value={opensInput}
                onChange={(event) => setOpensInput(event.target.value)}
              />
              <small>
                설정한 시각 전에는 사용자의 신규 신청, 수정, 삭제가 잠깁니다.
              </small>
            </label>

            <label className={styles.field}>
              <span>신청 마감 일시</span>
              <input
                type="datetime-local"
                value={deadlineInput}
                onChange={(event) => setDeadlineInput(event.target.value)}
              />
            </label>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.currentStatus}>
              <span>현재 적용된 신청 시작 일시</span>
              <strong>{formatReservationDeadline(opensAt)}</strong>
              <p>
                {opensAt && new Date(opensAt).getTime() > nowMs
                  ? '현재 신청 시작 전 잠금 상태입니다.'
                  : '현재 사용자가 신청할 수 있는 시작 조건입니다.'}
              </p>
            </div>
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
              className={styles.dangerButton}
              onClick={handleCloseImmediately}
              disabled={saving || isClosed}
            >
              <Zap size={17} />
              {isClosed ? '이미 마감됨' : '즉시 마감'}
            </button>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setOpensInput('')}
              disabled={saving}
            >
              시작 잠금 해제
            </button>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setDeadlineInput('')}
              disabled={saving || confirmedAllocationExists}
              title={
                confirmedAllocationExists
                  ? '확정 배차를 먼저 취소한 뒤 신청 마감을 해제할 수 있습니다.'
                  : undefined
              }
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
      {pendingAction && (
        <div
          className={styles.actionBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setPendingAction(null);
            }
          }}
        >
          <section
            className={styles.actionDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="deadline-action-dialog-title"
            aria-describedby="deadline-action-dialog-description"
          >
            <span className={styles.actionDialogIcon} aria-hidden="true">
              {pendingAction.mode === 'immediate' ? (
                <Zap size={25} />
              ) : (
                <CalendarClock size={25} />
              )}
            </span>
            <p className={styles.actionDialogEyebrow}>
              {pendingAction.mode === 'clear'
                ? '신청 마감 해제'
                : pendingAction.mode === 'immediate'
                  ? '신청 즉시 마감'
                  : '신청 마감 일시 변경'}
            </p>
            <h2 id="deadline-action-dialog-title">
              {pendingAction.mode === 'clear'
                ? '신청을 다시 열까요?'
                : pendingAction.mode === 'immediate'
                  ? '지금 즉시 신청을 마감할까요?'
                  : `${formatReservationDeadline(pendingAction.deadlineIso)}에 마감할까요?`}
            </h2>
            <p id="deadline-action-dialog-description">
              {pendingAction.mode === 'clear'
                ? '마감 제한을 해제해 사용자가 신청 정보를 다시 저장하고 수정할 수 있게 합니다.'
                : pendingAction.mode === 'immediate'
                  ? '확정 즉시 사용자는 신청 정보를 저장하거나 수정할 수 없게 됩니다.'
                  : '지정한 시각부터 사용자는 신청 정보를 저장하거나 수정할 수 없게 됩니다.'}
            </p>
            <div className={styles.actionSummary}>
              <div>
                <span>현재 마감 일시</span>
                <strong>{formatReservationDeadline(deadlineAt)}</strong>
              </div>
              <div>
                <span>변경 후</span>
                <strong>
                  {pendingAction.mode === 'clear'
                    ? '마감 제한 없음 · 신청 가능'
                    : pendingAction.mode === 'immediate'
                      ? '즉시 마감'
                      : formatReservationDeadline(pendingAction.deadlineIso)}
                </strong>
              </div>
            </div>
            <div className={styles.actionNotice}>
              <AlertTriangle size={18} aria-hidden="true" />
              <span>
                {pendingAction.mode === 'clear'
                  ? '신청을 다시 열면 마감 후에만 가능한 배차 계산, 잔여 좌석 신청, 캠퍼스 송금 보고가 다시 제한됩니다.'
                  : '마감 후에는 배차 계산, 잔여 좌석 신청, 캠퍼스 송금 보고 등 후속 운영 단계를 진행할 수 있습니다.'}
              </span>
            </div>
            {dialogError && (
              <p className={styles.actionDialogError} role="alert">
                {dialogError}
              </p>
            )}
            <footer className={styles.actionDialogActions}>
              <button
                type="button"
                autoFocus
                onClick={() => setPendingAction(null)}
                disabled={saving}
              >
                현재 설정 유지
              </button>
              <button
                type="button"
                className={styles.actionSubmit}
                onClick={() => void confirmDeadlineAction()}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <LoaderCircle className={styles.spinning} size={17} />
                    저장 중...
                  </>
                ) : pendingAction.mode === 'clear' ? (
                  '신청 다시 열기'
                ) : pendingAction.mode === 'immediate' ? (
                  '지금 즉시 마감'
                ) : (
                  '마감 일시 저장'
                )}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminReservationDeadlinePage;
