import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, ClipboardCheck, History, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getOperationCloseoutSummary, setOperationCloseout, type OperationCloseoutSummary } from '../../lib/admin/operationCloseoutService';
import AdminHeader from './AdminHeader';
import styles from './AdminOperationCloseoutPage.module.css';

const formatDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '-';

const AdminOperationCloseoutPage = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<OperationCloseoutSummary | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isCloseoutConfirmOpen, setIsCloseoutConfirmOpen] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await getOperationCloseoutSummary();
      setSummary(next);
      setNote(next.note);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '사후 관리 상태를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSummary(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSummary]);

  const handleCloseout = async (closed: boolean) => {
    setSaving(true);
    setError('');
    try {
      setSummary(await setOperationCloseout(closed, note));
      setIsCloseoutConfirmOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '사후 관리 상태를 저장하지 못했습니다.');
      await loadSummary();
    } finally {
      setSaving(false);
    }
  };

  const checks = summary ? [
    { title: '확정 호차 출발 완료', detail: `${summary.departedBusTotal} / ${summary.busTotal}호차 출발`, passed: summary.hasConfirmedAllocation && summary.busTotal === summary.departedBusTotal, path: '/admin/boarding' },
    { title: '특수상황 기록 처리 완료', detail: `미처리 ${summary.unresolvedExceptionTotal}건`, passed: summary.unresolvedExceptionTotal === 0, path: '/admin/boarding/exceptions' },
    { title: '개인 입금 확인 완료', detail: `${summary.paidReservationTotal} / ${summary.activeReservationTotal}명 확인`, passed: summary.activeReservationTotal === summary.paidReservationTotal, path: '/admin/payments/final-review' },
    { title: '서울 캠퍼스 송금 확인 완료', detail: `${summary.confirmedTransferTotal} / ${summary.seoulCampusTotal}캠퍼스 확인`, passed: summary.seoulCampusTotal === summary.confirmedTransferTotal, path: '/admin/payments/final-review' },
  ] : [];

  return <div className={styles.pageContainer}>
    <AdminHeader />
    <main className={styles.main}>
      <header className={styles.hero}>
        <div><span>6. 사후 관리</span><h1>운영 마감</h1><p>필수 운영 항목을 확인하고 완료 상태를 기록합니다. 완료 후에도 기존 데이터는 계속 수정할 수 있습니다.</p></div>
        <button type="button" onClick={() => void loadSummary()} disabled={loading || saving}><RefreshCw size={16} /> 새로고침</button>
      </header>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {summary && <>
        <section className={`${styles.statusPanel} ${summary.closed ? styles.closed : ''}`}>
          <ClipboardCheck size={24} /><div><strong>{summary.closed ? '운영 마감 완료' : summary.ready ? '운영 마감 가능' : '필수 확인 진행 중'}</strong>
          <span>{summary.closed ? `${formatDateTime(summary.closedAt)} · ${summary.closedByName ?? '전체 관리자'}` : '필수 항목이 모두 완료되면 운영 마감을 기록할 수 있습니다.'}</span></div>
        </section>
        {summary.closed && !summary.ready && <div className={styles.warning} role="alert">
          운영 마감 이후 필수 확인 항목이 다시 미완료 상태가 되었습니다. 마감 상태는 유지되며, 아래 항목을 확인해주세요.
        </div>}
        <section><h2>필수 확인</h2><div className={styles.checkGrid}>{checks.map((check) =>
          <button type="button" key={check.title} className={styles.checkCard} onClick={() => navigate(check.path)}>
            {check.passed ? <CheckCircle2 className={styles.pass} /> : <XCircle className={styles.fail} />}<strong>{check.title}</strong><span>{check.detail}</span>
          </button>)}</div></section>
        <section><h2>추가 확인</h2><div className={styles.extraGrid}>
          <button type="button" onClick={() => navigate('/admin/communications')}><AlertTriangle /><strong>미처리 문의 {summary.unresolvedInquiryTotal}건</strong><span>경고만 표시되며 운영 마감을 막지 않습니다.</span></button>
          <button type="button" onClick={() => navigate('/admin/system/audit-logs')}><History /><strong>관리자 작업 기록 확인</strong><span>권장 항목</span></button>
          <button type="button" onClick={() => navigate('/admin/system/ai-reports')}><Bot /><strong>AI 운영 최종보고서</strong><span>선택 항목</span></button>
        </div></section>
        <section className={styles.actionPanel}>
          <label><span>메모 (선택)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></label>
          {summary.closed
            ? <button type="button" className={styles.reopenButton} onClick={() => void handleCloseout(false)} disabled={saving}><RotateCcw size={16} /> 운영 마감 취소</button>
            : <button type="button" className={styles.closeButton} onClick={() => setIsCloseoutConfirmOpen(true)} disabled={saving || !summary.ready}><ClipboardCheck size={16} /> 운영 마감 완료 기록</button>}
        </section>
      </>}
    </main>
    {summary && isCloseoutConfirmOpen && <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => !saving && setIsCloseoutConfirmOpen(false)}>
      <section className={styles.confirmModal} role="dialog" aria-modal="true" aria-labelledby="closeout-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><ClipboardCheck size={22} /><div><h2 id="closeout-confirm-title">운영 마감을 완료할까요?</h2><p>완료 후에도 수정은 가능하며, 상태가 다시 미완료가 되면 경고가 표시됩니다.</p></div></header>
        <div className={styles.modalChecks}>
          {checks.map((check) => <div key={check.title}><CheckCircle2 /><span><strong>{check.title}</strong><small>{check.detail}</small></span></div>)}
        </div>
        <div className={styles.modalWarning}><AlertTriangle size={18} /><span><strong>경고 항목</strong> 미처리 문의 {summary.unresolvedInquiryTotal}건은 운영 마감을 막지 않습니다.</span></div>
        <div className={styles.modalActions}>
          <button type="button" onClick={() => setIsCloseoutConfirmOpen(false)} disabled={saving}>돌아가기</button>
          <button type="button" className={styles.closeButton} onClick={() => void handleCloseout(true)} disabled={saving}>{saving ? '저장 중' : '운영 마감 완료'}</button>
        </div>
      </section>
    </div>}
  </div>;
};

export default AdminOperationCloseoutPage;
