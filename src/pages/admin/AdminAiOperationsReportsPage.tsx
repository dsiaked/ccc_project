import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  FileText,
  ListTree,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  generateAiOperationsReport,
  getAiReportLogSettings,
  getAiOperationsReports,
  updateAiReportLogSettings,
  type AiOperationsReport,
  type AiReportLogSettings,
} from '../../lib/admin/aiOperationsReportService';
import AdminHeader from './AdminHeader';
import styles from './AdminAiOperationsReportsPage.module.css';

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const logOptions = [
  ['includeNavigation', '페이지 이동', '사용자와 관리자의 주요 방문 경로'],
  ['includeAuthentication', '인증 활동', '로그인과 세션 갱신, 인증 성공 이벤트'],
  ['includeDataChanges', '주요 데이터 변경', '예약·입금·배정·탑승 상태 변경'],
  [
    'includeAdminAudit',
    '관리 작업 감사 기록',
    '관리자의 생성·수정·삭제 기록과 사유',
  ],
] as const satisfies ReadonlyArray<
  readonly [keyof Omit<AiReportLogSettings, 'updatedAt'>, string, string]
>;

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
  const [settings, setSettings] = useState<AiReportLogSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationInFlightRef = useRef(false);
  const settingsSaveInFlightRef = useRef(false);
  const reportsRequestRevisionRef = useRef(0);
  const settingsRequestRevisionRef = useRef(0);
  const settingsEditRevisionRef = useRef(0);
  const selectedReport =
    reports.find((report) => report.id === selectedId) ?? reports[0];

  const loadReports = useCallback(async (clearError = true) => {
    const requestRevision = ++reportsRequestRevisionRef.current;
    setLoading(true);
    if (clearError) setError(null);

    try {
      const nextReports = await getAiOperationsReports();
      if (requestRevision !== reportsRequestRevisionRef.current) return;

      setReports(nextReports);
      setSelectedId((current) =>
        nextReports.some((report) => report.id === current)
          ? current
          : nextReports[0]?.id ?? ''
      );
    } catch (loadError) {
      if (requestRevision !== reportsRequestRevisionRef.current) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : '보고서를 불러오지 못했습니다.'
      );
    } finally {
      if (requestRevision === reportsRequestRevisionRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const loadSettings = useCallback(async () => {
    const requestRevision = ++settingsRequestRevisionRef.current;
    const editRevision = settingsEditRevisionRef.current;
    setSettingsLoading(true);
    setSettingsError(null);

    try {
      const loadedSettings = await getAiReportLogSettings();
      if (
        requestRevision !== settingsRequestRevisionRef.current ||
        editRevision !== settingsEditRevisionRef.current
      ) {
        return;
      }

      setSettings(loadedSettings);
    } catch (loadError) {
      if (requestRevision !== settingsRequestRevisionRef.current) return;
      setSettingsError(
        loadError instanceof Error
          ? loadError.message
          : 'AI 로그 설정을 불러오지 못했습니다.'
      );
    } finally {
      if (requestRevision === settingsRequestRevisionRef.current) {
        setSettingsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReports(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReports]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSettings(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSettings]);

  const handleSaveSettings = async () => {
    if (settingsSaveInFlightRef.current || !settings) return;

    settingsSaveInFlightRef.current = true;
    settingsRequestRevisionRef.current += 1;
    const editRevision = settingsEditRevisionRef.current;
    const settingsToSave = {
      includeNavigation: settings.includeNavigation,
      includeAuthentication: settings.includeAuthentication,
      includeDataChanges: settings.includeDataChanges,
      includeAdminAudit: settings.includeAdminAudit,
    };

    setSavingSettings(true);
    setSettingsSaved(false);
    setError(null);

    try {
      const saved = await updateAiReportLogSettings(settingsToSave);
      if (editRevision === settingsEditRevisionRef.current) {
        setSettings(saved);
        setSettingsSaved(true);
        setSettingsError(null);
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'AI 로그 설정을 저장하지 못했습니다.'
      );
    } finally {
      settingsSaveInFlightRef.current = false;
      setSavingSettings(false);
    }
  };

  const handleGenerate = async () => {
    if (generationInFlightRef.current) return;

    generationInFlightRef.current = true;
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
      const generateErrorMessage =
        generateError instanceof Error
          ? generateError.message
          : 'AI 운영 보고서를 생성하지 못했습니다.';
      await loadReports(false);
      setError(generateErrorMessage);
    } finally {
      generationInFlightRef.current = false;
      setGenerating(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />
      <main className={styles.main}>
        <button
          className={styles.backButton}
          type="button"
          onClick={() => navigate('/admin/system')}
        >
          <ArrowLeft size={16} /> 관리자 도구
        </button>

        <section className={styles.hero}>
          <Bot size={28} />
          <div>
            <span>운영 분석</span>
            <h1>AI 운영 최종보고서</h1>
            <p>
              사용자와 관리자 활동 통계를 바탕으로 운영 개선 포인트를
              정리합니다.
            </p>
          </div>
        </section>

        <section className={styles.generator}>
          <div className={styles.privacyNotice}>
            <ShieldCheck size={20} />
            <p>
              <strong>개인정보 보호 기본값</strong> 이름, 이메일, 전화번호,
              원본 변경 데이터는 AI에 전달하지 않습니다.
            </p>
          </div>
          <div className={styles.dateFields}>
            <label>
              <span>분석 시작일</span>
              <input
                type="date"
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
              />
            </label>
            <label>
              <span>분석 종료일</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(event) => setPeriodEnd(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating || !periodStart || !periodEnd}
            >
              {generating ? (
                <RefreshCw className={styles.spinning} size={17} />
              ) : (
                <FileText size={17} />
              )}
              {generating ? '분석 중' : '최종보고서 생성'}
            </button>
          </div>
        </section>

        <section
          className={styles.settingsPanel}
          aria-busy={settingsLoading}
        >
          <div className={styles.settingsHeader}>
            <div>
              <span>AI 입력 범위 설정</span>
              <h2>보고서에 포함할 로그 선택</h2>
              <p>
                활동 로그와 관리 감사 기록 중 AI 분석에 반영할 범위를 직접
                조정할 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              className={styles.logsButton}
              onClick={() => navigate('/admin/system/ai-reports/logs')}
            >
              <ListTree size={16} />
              수집 로그 확인
            </button>
          </div>

          {settingsLoading ? (
            <p className={styles.empty}>AI 로그 설정을 불러오는 중입니다.</p>
          ) : settings === null ? (
            <div className={styles.settingsError} role="alert">
              <div>
                <strong>AI 로그 설정을 불러오지 못했습니다.</strong>
                <p>{settingsError ?? '잠시 후 다시 시도해주세요.'}</p>
              </div>
              <button type="button" onClick={() => void loadSettings()}>
                다시 시도
              </button>
            </div>
          ) : (
            <>
              <div className={styles.settingGrid}>
                {logOptions.map(([key, title, description]) => (
                  <label className={styles.settingOption} key={key}>
                    <input
                      type="checkbox"
                      checked={settings[key]}
                      disabled={savingSettings}
                      onChange={() => {
                        settingsEditRevisionRef.current += 1;
                        setSettingsSaved(false);
                        setSettings((current) =>
                          current ? { ...current, [key]: !current[key] } : current
                        );
                      }}
                    />
                    <span>
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>
                  </label>
                ))}
              </div>
              <div className={styles.settingsFooter}>
                <span>
                  {settingsSaved
                    ? '설정이 저장되었습니다.'
                    : settings.updatedAt
                      ? `마지막 저장 ${formatDateTime(settings.updatedAt)}`
                      : '기본 설정을 사용 중입니다.'}
                </span>
                <button
                  type="button"
                  onClick={() => void handleSaveSettings()}
                  disabled={savingSettings}
                >
                  <Save size={15} />
                  {savingSettings ? '저장 중' : '선택 저장'}
                </button>
              </div>
            </>
          )}
        </section>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <div className={styles.workspace}>
          <aside className={styles.reportList}>
            <div className={styles.listHeader}>
              <strong>생성 기록</strong>
              <button
                type="button"
                onClick={() => void loadReports()}
                disabled={loading}
              >
                <RefreshCw size={14} />
              </button>
            </div>
            {reports.length === 0 ? (
              <p className={styles.empty}>아직 생성된 보고서가 없습니다.</p>
            ) : (
              reports.map((report) => (
                <button
                  type="button"
                  key={report.id}
                  className={
                    selectedReport?.id === report.id ? styles.selectedReport : ''
                  }
                  onClick={() => setSelectedId(report.id)}
                >
                  <strong>{formatDateTime(report.createdAt)}</strong>
                  <span>
                    {report.periodStart.slice(0, 10)} ~{' '}
                    {report.periodEnd.slice(0, 10)}
                  </span>
                  <em className={styles[report.status]}>{report.status}</em>
                </button>
              ))
            )}
          </aside>

          <section className={styles.reportViewer}>
            {!selectedReport ? (
              <div className={styles.empty}>
                분석 기간을 선택한 뒤 첫 보고서를 생성해보세요.
              </div>
            ) : (
              <>
                <header>
                  <div>
                    <span>
                      {selectedReport.periodStart.slice(0, 10)} ~{' '}
                      {selectedReport.periodEnd.slice(0, 10)}
                    </span>
                    <h2>운영 분석 최종보고서</h2>
                  </div>
                  <code>{selectedReport.model ?? selectedReport.status}</code>
                </header>
                {selectedReport.status === 'failed' ? (
                  <div className={styles.failed}>
                    {selectedReport.errorMessage}
                  </div>
                ) : selectedReport.status === 'pending' ? (
                  <div className={styles.empty}>
                    보고서를 생성하고 있습니다.
                  </div>
                ) : (
                  <pre className={styles.markdown}>
                    {selectedReport.reportMarkdown}
                  </pre>
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
