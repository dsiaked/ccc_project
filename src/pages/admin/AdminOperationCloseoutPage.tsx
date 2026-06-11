import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  getBoardingExceptionArchiveSnapshot,
  getManualBoardingExceptionRecords,
} from '../../lib/admin/boardingExceptionArchiveService';
import {
  getBoardingManagementSnapshot,
  getBoardingMoveRequestSnapshot,
  type BoardingSnapshot,
} from '../../lib/admin/boardingManagementService';
import { getFinalPaymentReview } from '../../lib/admin/finalPaymentReviewService';
import {
  getOperationCloseoutState,
  updateOperationCloseout,
  type OperationCloseoutState,
} from '../../lib/admin/operationCloseoutService';
import { supabase } from '../../lib/supabase';
import AdminHeader from './AdminHeader';
import { buildBoardingExceptionRecords } from './boardingExceptionRecords';
import styles from './AdminOperationCloseoutPage.module.css';

interface CloseoutCheck {
  id: string;
  title: string;
  description: string;
  passed: boolean;
  path: string;
}

const initialState: OperationCloseoutState = {
  closed: false,
  closedAt: null,
  closedBy: null,
  closedByName: null,
  reason: '',
  reopenedAt: null,
  reopenedBy: null,
  reopenedByName: null,
};

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Seoul',
      }).format(new Date(value))
    : '-';

const closeoutReadyStorageKey = 'admin-operation-closeout-ready';
const closeoutReadyEventName = 'admin-operation-closeout-ready-change';
const requiredCloseoutCheckIds = new Set([
  'departures',
  'exceptions',
  'payments',
  'transfers',
]);

const AdminOperationCloseoutPage = () => {
  const navigate = useNavigate();
  const [checks, setChecks] = useState<CloseoutCheck[]>([]);
  const [closeout, setCloseout] = useState(initialState);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        boarding,
        moves,
        archive,
        manualExceptions,
        payment,
        unresolvedRequests,
        closeoutState,
      ] = await Promise.all([
        getBoardingManagementSnapshot(),
        getBoardingMoveRequestSnapshot(),
        getBoardingExceptionArchiveSnapshot(),
        getManualBoardingExceptionRecords(),
        getFinalPaymentReview(),
        supabase
          .from('campus_requests')
          .select('id', { count: 'exact', head: true })
          .neq('status', 'resolved')
          .eq('is_global_notice', false),
        getOperationCloseoutState(),
      ]);

      if (unresolvedRequests.error) throw unresolvedRequests.error;

      const snapshot = boarding as BoardingSnapshot | null;
      const automaticExceptions = buildBoardingExceptionRecords(snapshot);
      const manualExceptionKeys = manualExceptions.map(
        (record) => `${record.allocationId}:manual:${record.id}`
      );
      const archivedKeys = new Set(archive.archivedKeys);
      const unresolvedExceptionCount = [
        ...automaticExceptions.map((record) => record.id),
        ...manualExceptionKeys,
      ].filter((key) => !archivedKeys.has(key)).length;
      const totalBusCount = snapshot?.buses.length ?? 0;
      const departedBusCount =
        snapshot?.buses.filter((bus) => Boolean(bus.departedAt)).length ?? 0;
      const uncheckedCount =
        snapshot?.passengers.filter(
          (passenger) => passenger.boardingStatus === 'unchecked'
        ).length ?? 0;
      const pendingMoveCount =
        moves?.requests.filter((request) => request.status === 'pending').length ?? 0;
      const unpaidCount = Math.max(
        payment.totalPaymentTargets - payment.paidPaymentTargets,
        0
      );
      const unconfirmedTransferCount = payment.campusTransfers.filter(
        (campus) => campus.status !== 'confirmed' || campus.hasAdditionalSettlement
      ).length;
      const unresolvedRequestCount = unresolvedRequests.count ?? 0;

      setChecks([
        {
          id: 'departures',
          title: '전체 버스 출발 확인',
          description: `${departedBusCount.toLocaleString()} / ${totalBusCount.toLocaleString()}대 출발`,
          passed: totalBusCount > 0 && departedBusCount === totalBusCount,
          path: '/admin/boarding',
        },
        {
          id: 'boarding-status',
          title: '미확인 탑승자 정리',
          description: `미확인 ${uncheckedCount.toLocaleString()}명`,
          passed: uncheckedCount === 0,
          path: '/admin/boarding',
        },
        {
          id: 'move-requests',
          title: '탑승 이동 요청 처리',
          description: `대기 요청 ${pendingMoveCount.toLocaleString()}건`,
          passed: pendingMoveCount === 0,
          path: '/admin/boarding',
        },
        {
          id: 'exceptions',
          title: '특수상황 기록 정리',
          description: `미보관 기록 ${unresolvedExceptionCount.toLocaleString()}건`,
          passed: unresolvedExceptionCount === 0,
          path: '/admin/boarding/exceptions',
        },
        {
          id: 'payments',
          title: '개인 입금 확인',
          description: `미완료 ${unpaidCount.toLocaleString()}건`,
          passed: unpaidCount === 0,
          path: '/admin/payments/final-review',
        },
        {
          id: 'transfers',
          title: '캠퍼스 송금·추가 정산 확인',
          description: `확인 필요 ${unconfirmedTransferCount.toLocaleString()}개 캠퍼스`,
          passed: unconfirmedTransferCount === 0,
          path: '/admin/payments/final-review',
        },
        {
          id: 'requests',
          title: '문의 처리',
          description: `미처리 ${unresolvedRequestCount.toLocaleString()}건`,
          passed: unresolvedRequestCount === 0,
          path: '/admin/communications',
        },
      ]);
      setCloseout(closeoutState);
    } catch (loadError) {
      console.error('Failed to load operation closeout:', loadError);
      setError('운영 종료 점검 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadData]);

  const warningCount = useMemo(
    () => checks.filter((check) => !check.passed).length,
    [checks]
  );
  const isCloseoutReady =
    !loading &&
    !closeout.closed &&
    checks.filter((check) => requiredCloseoutCheckIds.has(check.id)).every(
      (check) => check.passed
    );

  useEffect(() => {
    try {
      window.localStorage.setItem(closeoutReadyStorageKey, String(isCloseoutReady));
    } catch {
      // The in-page status remains available when browser storage is unavailable.
    }
    window.dispatchEvent(
      new CustomEvent(closeoutReadyEventName, {
        detail: { ready: isCloseoutReady },
      })
    );
  }, [isCloseoutReady]);

  const expectedConfirmation = closeout.closed ? '종료 취소' : '운영 종료';
  const canSubmit =
    reviewed &&
    reason.trim().length > 0 &&
    confirmation.trim() === expectedConfirmation &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const next = await updateOperationCloseout(!closeout.closed, reason);
      setCloseout(next);
      setReviewed(false);
      setReason('');
      setConfirmation('');
    } catch (submitError) {
      console.error('Failed to update operation closeout:', submitError);
      setError('운영 종료 상태를 저장하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />
      <main className={styles.main}>
        <button className={styles.backButton} type="button" onClick={() => navigate('/admin/dashboard')}>
          <ArrowLeft size={16} /> 전체 관리자 대시보드
        </button>

        <section className={`${styles.hero} ${closeout.closed ? styles.closedHero : ''}`}>
          <span className={styles.heroIcon}><ClipboardCheck size={26} /></span>
          <div>
            <span>{closeout.closed ? '운영 종료 기록됨' : '6단계 사후 관리'}</span>
            <h1>
              운영 종료 점검
              {isCloseoutReady && <em className={styles.readyBadge}>마감 가능</em>}
            </h1>
            <p>자동 점검 결과와 관리자 최종 확인을 함께 기록합니다.</p>
          </div>
          <button type="button" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw size={15} /> 새로고침
          </button>
        </section>

        <aside className={styles.policyNotice}>
          <CheckCircle2 size={18} />
          <div>
            <strong>종료 상태는 기록용입니다.</strong>
            <p>운영 종료 후에도 기존 관리 기능은 잠기지 않으며, 대시보드 6단계 수동 체크 상태와도 별도로 유지됩니다.</p>
          </div>
        </aside>

        {error && <p className={styles.error}>{error}</p>}

        {loading ? (
          <div className={styles.loading}><LoaderCircle size={22} /> 점검 데이터를 불러오는 중입니다.</div>
        ) : (
          <>
            <section className={styles.summary}>
              <div>
                <span>자동 점검</span>
                <strong>{checks.length - warningCount} / {checks.length} 완료</strong>
              </div>
              <div>
                <span>확인 필요</span>
                <strong className={warningCount > 0 ? styles.warningText : ''}>{warningCount}건</strong>
              </div>
              <div>
                <span>현재 상태</span>
                <strong>{closeout.closed ? '운영 종료' : '운영 중'}</strong>
              </div>
            </section>

            <section className={styles.checkSection}>
              <header>
                <div>
                  <h2>자동 점검 항목</h2>
                  <p>확인 필요 항목이 있어도 사유를 남기면 종료할 수 있습니다.</p>
                </div>
              </header>
              <div className={styles.checkGrid}>
                {checks.map((check) => (
                  <button type="button" key={check.id} className={styles.checkCard} onClick={() => navigate(check.path)}>
                    {check.passed ? <CheckCircle2 className={styles.passed} /> : <AlertTriangle className={styles.warning} />}
                    <span>
                      <strong>{check.title}</strong>
                      <small>{check.description}</small>
                    </span>
                    <ExternalLink size={14} />
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.actionPanel}>
              <div className={styles.actionHeader}>
                <div>
                  <h2>{closeout.closed ? '운영 종료 취소' : '최종 운영 종료 기록'}</h2>
                  <p>
                    {closeout.closed
                      ? `${formatDateTime(closeout.closedAt)} · ${closeout.closedByName ?? '관리자'}`
                      : '자동 점검과 주요 관리 기록을 검토한 뒤 종료 상태를 기록합니다.'}
                  </p>
                </div>
                {closeout.closed && <RotateCcw size={22} />}
              </div>

              {closeout.closed && closeout.reason && (
                <p className={styles.savedReason}>최근 사유: {closeout.reason}</p>
              )}

              <label className={styles.reviewCheck}>
                <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
                <span>자동 점검 결과와 주요 관리자 기록을 직접 확인했습니다.</span>
              </label>
              <label className={styles.field}>
                <span>{closeout.closed ? '종료 취소 사유' : '종료 기록 사유'}</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="남은 확인 사항 또는 인수인계 내용을 적어주세요." />
              </label>
              <label className={styles.field}>
                <span>확인을 위해 `{expectedConfirmation}` 입력</span>
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </label>
              <button className={styles.submitButton} type="button" disabled={!canSubmit} onClick={() => void handleSubmit()}>
                {submitting ? <LoaderCircle size={17} /> : closeout.closed ? <RotateCcw size={17} /> : <ClipboardCheck size={17} />}
                {closeout.closed ? '운영 종료 취소' : warningCount > 0 ? `확인 필요 ${warningCount}건과 함께 종료 기록` : '운영 종료 기록'}
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default AdminOperationCloseoutPage;
