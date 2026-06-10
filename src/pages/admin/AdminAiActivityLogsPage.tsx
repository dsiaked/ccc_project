import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  History,
  ListTree,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  getActivityEventLogs,
  type ActivityEventLog,
} from '../../lib/admin/aiOperationsReportService';
import {
  adminAuditActionLabels,
  adminAuditResourceLabels,
  getAdminAuditLogs,
  type AdminAuditAction,
  type AdminAuditLog,
  type AdminAuditLogCursor,
} from '../../lib/admin/adminAuditLogService';
import AdminHeader from './AdminHeader';
import styles from './AdminAiActivityLogsPage.module.css';

const PAGE_SIZE = 30;

type LogSource = 'activity' | 'adminAudit';

const categoryLabels: Record<string, string> = {
  navigation: '페이지 이동',
  authentication: '인증 활동',
  data_change: '주요 데이터 변경',
};

const actorKindLabels: Record<string, string> = {
  user: '사용자',
  admin: '관리자',
  system: '시스템',
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));

const AdminAiActivityLogsPage = () => {
  const navigate = useNavigate();
  const [source, setSource] = useState<LogSource>(() => {
    const sourceParam = new URLSearchParams(window.location.search).get('source');
    return sourceParam === 'adminAudit' ? 'adminAudit' : 'activity';
  });
  const [activityLogs, setActivityLogs] = useState<ActivityEventLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [category, setCategory] = useState('');
  const [actorKind, setActorKind] = useState('');
  const [action, setAction] = useState<AdminAuditAction | 'all'>('all');
  const [resourceType, setResourceType] = useState('');
  const [actorKeyword, setActorKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<Array<AdminAuditLogCursor | null>>([
    null,
  ]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<AdminAuditLogCursor | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const logsRequestRevisionRef = useRef(0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentCursor = cursorHistory[cursorIndex] ?? null;

  const resourceOptions = useMemo(
    () =>
      Object.entries(adminAuditResourceLabels).map(([value, label]) => ({
        value,
        label,
      })),
    []
  );

  const loadLogs = useCallback(async () => {
    const requestRevision = ++logsRequestRevisionRef.current;
    setLoading(true);
    setError(null);

    try {
      if (source === 'activity') {
        const result = await getActivityEventLogs({
          category,
          actorKind,
          dateFrom,
          dateTo,
          page,
          pageSize: PAGE_SIZE,
        });
        if (requestRevision !== logsRequestRevisionRef.current) return;
        setActivityLogs(result.items);
        setTotal(result.total);
      } else {
        const result = await getAdminAuditLogs({
          action,
          resourceType,
          actorKeyword,
          dateFrom,
          dateTo,
          pageSize: PAGE_SIZE,
          cursor: currentCursor,
        });
        if (requestRevision !== logsRequestRevisionRef.current) return;
        setAuditLogs(result.items);
        setNextCursor(result.nextCursor);
        setHasNext(result.hasNext);
      }
    } catch (loadError) {
      if (requestRevision !== logsRequestRevisionRef.current) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : '수집 로그를 불러오지 못했습니다.'
      );
    } finally {
      if (requestRevision === logsRequestRevisionRef.current) {
        setLoading(false);
      }
    }
  }, [
    action,
    actorKind,
    actorKeyword,
    category,
    currentCursor,
    dateFrom,
    dateTo,
    page,
    resourceType,
    source,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLogs(), 0);
    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  const resetActivityPagination = () => {
    logsRequestRevisionRef.current += 1;
    setPage(1);
  };

  const resetAuditPagination = () => {
    logsRequestRevisionRef.current += 1;
    setCursorHistory([null]);
    setCursorIndex(0);
    setNextCursor(null);
    setHasNext(false);
  };

  const updateSource = (nextSource: LogSource) => {
    logsRequestRevisionRef.current += 1;
    setSource(nextSource);
    setError(null);
    if (nextSource === 'activity') {
      setPage(1);
    } else {
      setCursorHistory([null]);
      setCursorIndex(0);
      setNextCursor(null);
      setHasNext(false);
    }
  };

  const showNextAuditPage = () => {
    if (!nextCursor || !hasNext) return;
    logsRequestRevisionRef.current += 1;
    setCursorHistory((current) => [...current.slice(0, cursorIndex + 1), nextCursor]);
    setCursorIndex((current) => current + 1);
  };

  const showPreviousAuditPage = () => {
    if (cursorIndex === 0) return;
    logsRequestRevisionRef.current += 1;
    setCursorIndex((current) => Math.max(0, current - 1));
  };

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />
      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/admin/system/ai-reports')}
        >
          <ArrowLeft size={16} />
          AI 운영 최종보고서
        </button>

        <section className={styles.hero}>
          <span>
            {source === 'activity' ? <ListTree size={24} /> : <History size={24} />}
          </span>
          <div>
            <strong>AI 분석 원천 로그</strong>
            <h1>수집 로그 확인</h1>
            <p>
              활동 로그와 관리 감사 기록을 직접 검토해 AI 보고서에 포함될 범위를
              확인합니다.
            </p>
          </div>
        </section>

        <section className={styles.sourceTabs} aria-label="로그 원본 선택">
          <button
            type="button"
            className={source === 'activity' ? styles.activeTab : undefined}
            onClick={() => updateSource('activity')}
            aria-pressed={source === 'activity'}
          >
            <ListTree size={16} />
            활동 로그
          </button>
          <button
            type="button"
            className={source === 'adminAudit' ? styles.activeTab : undefined}
            onClick={() => updateSource('adminAudit')}
            aria-pressed={source === 'adminAudit'}
          >
            <History size={16} />
            관리 감사 기록
          </button>
        </section>

        {source === 'activity' ? (
          <section className={styles.filters}>
            <label>
              <span>로그 종류</span>
              <select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  resetActivityPagination();
                }}
              >
                <option value="">전체</option>
                <option value="navigation">페이지 이동</option>
                <option value="authentication">인증 활동</option>
                <option value="data_change">주요 데이터 변경</option>
              </select>
            </label>
            <label>
              <span>발생 주체</span>
              <select
                value={actorKind}
                onChange={(event) => {
                  setActorKind(event.target.value);
                  resetActivityPagination();
                }}
              >
                <option value="">전체</option>
                <option value="user">사용자</option>
                <option value="admin">관리자</option>
                <option value="system">시스템</option>
              </select>
            </label>
            <label>
              <span>시작일</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  resetActivityPagination();
                }}
              />
            </label>
            <label>
              <span>종료일</span>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value);
                  resetActivityPagination();
                }}
              />
            </label>
          </section>
        ) : (
          <section className={styles.filters}>
            <label>
              <span>작업 종류</span>
              <select
                value={action}
                onChange={(event) => {
                  setAction(event.target.value as AdminAuditAction | 'all');
                  resetAuditPagination();
                }}
              >
                <option value="all">전체</option>
                <option value="insert">생성</option>
                <option value="update">수정</option>
                <option value="delete">삭제</option>
              </select>
            </label>
            <label>
              <span>대상</span>
              <select
                value={resourceType}
                onChange={(event) => {
                  setResourceType(event.target.value);
                  resetAuditPagination();
                }}
              >
                <option value="">전체</option>
                {resourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>작업자</span>
              <div className={styles.searchField}>
                <Search size={15} />
                <input
                  value={actorKeyword}
                  onChange={(event) => {
                    setActorKeyword(event.target.value);
                    resetAuditPagination();
                  }}
                  placeholder="이름 또는 이메일"
                />
              </div>
            </label>
            <label>
              <span>시작일</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  resetAuditPagination();
                }}
              />
            </label>
            <label>
              <span>종료일</span>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value);
                  resetAuditPagination();
                }}
              />
            </label>
          </section>
        )}

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <section className={styles.logPanel}>
          <header>
            <div>
              <h2>{source === 'activity' ? '활동 이벤트' : '관리 감사 기록'}</h2>
              <p>
                {source === 'activity'
                  ? `총 ${total.toLocaleString()}건 · ${page}페이지`
                  : `${cursorIndex + 1}페이지 · 현재 ${auditLogs.length.toLocaleString()}건`}
              </p>
            </div>
            <button type="button" onClick={() => void loadLogs()} disabled={loading}>
              <RefreshCw size={14} />
              새로고침
            </button>
          </header>

          {loading ? (
            <div className={styles.empty}>로그를 불러오는 중입니다.</div>
          ) : source === 'activity' ? (
            activityLogs.length === 0 ? (
              <div className={styles.empty}>조건에 맞는 활동 로그가 없습니다.</div>
            ) : (
              <div className={styles.logList}>
                {activityLogs.map((log) => (
                  <details className={styles.logItem} key={log.id}>
                    <summary>
                      <span className={`${styles.badge} ${styles[log.category] ?? ''}`}>
                        {categoryLabels[log.category] ?? log.category}
                      </span>
                      <div>
                        <strong>{log.eventName}</strong>
                        <span>
                          {actorKindLabels[log.actorKind]} ·{' '}
                          {formatDateTime(log.occurredAt)}
                        </span>
                      </div>
                      <code>{log.route ?? '-'}</code>
                    </summary>
                    <div className={styles.details}>
                      <dl>
                        <div>
                          <dt>이벤트 ID</dt>
                          <dd>{log.id}</dd>
                        </div>
                        <div>
                          <dt>발생 시각</dt>
                          <dd>{log.occurredAt}</dd>
                        </div>
                        <div>
                          <dt>경로</dt>
                          <dd>{log.route ?? '-'}</dd>
                        </div>
                      </dl>
                      <section>
                        <h3>메타데이터</h3>
                        <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                      </section>
                    </div>
                  </details>
                ))}
              </div>
            )
          ) : auditLogs.length === 0 ? (
            <div className={styles.empty}>조건에 맞는 감사 기록이 없습니다.</div>
          ) : (
            <div className={styles.logList}>
              {auditLogs.map((log) => (
                <details className={styles.logItem} key={log.id}>
                  <summary>
                    <span className={`${styles.badge} ${styles.auditBadge}`}>
                      {adminAuditActionLabels[log.action]}
                    </span>
                    <div>
                      <strong>
                        {adminAuditResourceLabels[log.resourceType] ?? log.resourceType}
                      </strong>
                      <span>
                        {log.actorName} · {formatDateTime(log.createdAt)}
                      </span>
                    </div>
                    <code>{log.resourceId ?? '-'}</code>
                  </summary>
                  <div className={styles.details}>
                    <dl>
                      <div>
                        <dt>기록 ID</dt>
                        <dd>{log.id}</dd>
                      </div>
                      <div>
                        <dt>작업자</dt>
                        <dd>{log.actorEmail ?? log.actorName}</dd>
                      </div>
                      <div>
                        <dt>생성 시각</dt>
                        <dd>{log.createdAt}</dd>
                      </div>
                    </dl>
                    <section>
                      <h3>변경 전</h3>
                      <pre>{JSON.stringify(log.beforeData, null, 2)}</pre>
                    </section>
                    <section>
                      <h3>변경 후</h3>
                      <pre>{JSON.stringify(log.afterData, null, 2)}</pre>
                    </section>
                  </div>
                </details>
              ))}
            </div>
          )}

          <footer>
            {source === 'activity' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    logsRequestRevisionRef.current += 1;
                    setPage((current) => Math.max(1, current - 1));
                  }}
                  disabled={loading || page <= 1}
                >
                  <ChevronLeft size={16} /> 이전
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    logsRequestRevisionRef.current += 1;
                    setPage((current) => Math.min(totalPages, current + 1));
                  }}
                  disabled={loading || page >= totalPages}
                >
                  다음 <ChevronRight size={16} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={showPreviousAuditPage}
                  disabled={loading || cursorIndex === 0}
                >
                  <ChevronLeft size={16} /> 이전
                </button>
                <span>{cursorIndex + 1} 페이지</span>
                <button
                  type="button"
                  onClick={showNextAuditPage}
                  disabled={loading || !hasNext}
                >
                  다음 <ChevronRight size={16} />
                </button>
              </>
            )}
          </footer>
        </section>
      </main>
    </div>
  );
};

export default AdminAiActivityLogsPage;
