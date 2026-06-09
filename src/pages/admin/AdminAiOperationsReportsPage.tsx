import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bot, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  generateAiOperationsReport,
  getAiOperationsReports,
  type AiOperationsReport,
} from '../../lib/admin/aiOperationsReportService';
import AdminHeader from './AdminHeader';
import styles from './AdminAiOperationsReportsPage.module.css';

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const AdminAiOperationsReportsPage = () => {
  const navigate = useNavigate();
  const defaultDates = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return { start: toDateInput(start), end: toDateInput(end) };
  }, []);
  const [periodStart, setPeriodStart] = useState(defaultDates.start);
  const [periodEnd, setPeriodEnd] = useState(defaultDates.end);
  const [reports, setReports] = useState<AiOperationsReport[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedReport = reports.find((report) => report.id === selectedId) ?? reports[0];

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextReports = await getAiOperationsReports();
      setReports(nextReports);
      setSelectedId((current) =>
        nextReports.some((report) => report.id === current)
          ? current
          : nextReports[0]?.id ?? ''
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '보고서를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReports(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReports]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const start = new Date(`${periodStart}T00:00:00`);
      const end = new Date(`${periodEnd}T23:59:59.999`);
      const reportId = await generateAiOperationsReport(
        start.toISOString(),
        end.toISOString()
      );
      await loadReports();
      setSelectedId(reportId);
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : 'AI 운영 보고서를 생성하지 못했습니다.'
      );
      await loadReports();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />
      <main className={styles.main}>
        <button className={styles.backButton} type="button" onClick={() => navigate('/admin/system')}>
          <ArrowLeft size={16} /> 관리자 도구
        </button>

        <section className={styles.hero}>
          <Bot size={28} />
          <div>
            <span>익명화 운영 분석</span>
            <h1>AI 운영 최종보고서</h1>
            <p>사용자·관리자 활동 통계와 프로젝트 구조를 함께 분석해 운영 및 코드 개선안을 작성합니다.</p>
          </div>
        </section>

        <section className={styles.generator}>
          <div className={styles.privacyNotice}>
            <ShieldCheck size={20} />
            <p><strong>개인정보 보호 기본값</strong> 이름, 이메일, 전화번호, 원본 변경 데이터는 AI에 전송하지 않습니다.</p>
          </div>
          <div className={styles.dateFields}>
            <label>
              <span>분석 시작일</span>
              <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
            </label>
            <label>
              <span>분석 종료일</span>
              <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
            </label>
            <button type="button" onClick={() => void handleGenerate()} disabled={generating || !periodStart || !periodEnd}>
              {generating ? <RefreshCw className={styles.spinning} size={17} /> : <FileText size={17} />}
              {generating ? '분석 중' : '최종보고서 생성'}
            </button>
          </div>
        </section>

        {error && <div className={styles.error} role="alert">{error}</div>}

        <div className={styles.workspace}>
          <aside className={styles.reportList}>
            <div className={styles.listHeader}>
              <strong>생성 기록</strong>
              <button type="button" onClick={() => void loadReports()} disabled={loading}>
                <RefreshCw size={14} />
              </button>
            </div>
            {reports.length === 0 ? (
              <p className={styles.empty}>아직 생성된 보고서가 없습니다.</p>
            ) : reports.map((report) => (
              <button
                type="button"
                key={report.id}
                className={selectedReport?.id === report.id ? styles.selectedReport : ''}
                onClick={() => setSelectedId(report.id)}
              >
                <strong>{formatDateTime(report.createdAt)}</strong>
                <span>{report.periodStart.slice(0, 10)} ~ {report.periodEnd.slice(0, 10)}</span>
                <em className={styles[report.status]}>{report.status}</em>
              </button>
            ))}
          </aside>

          <section className={styles.reportViewer}>
            {!selectedReport ? (
              <div className={styles.empty}>분석 기간을 선택해 첫 보고서를 생성해보세요.</div>
            ) : (
              <>
                <header>
                  <div>
                    <span>{selectedReport.periodStart.slice(0, 10)} ~ {selectedReport.periodEnd.slice(0, 10)}</span>
                    <h2>운영 분석 최종보고서</h2>
                  </div>
                  <code>{selectedReport.model ?? selectedReport.status}</code>
                </header>
                {selectedReport.status === 'failed' ? (
                  <div className={styles.failed}>{selectedReport.errorMessage}</div>
                ) : selectedReport.status === 'pending' ? (
                  <div className={styles.empty}>보고서를 생성하고 있습니다.</div>
                ) : (
                  <pre className={styles.markdown}>{selectedReport.reportMarkdown}</pre>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default AdminAiOperationsReportsPage;
