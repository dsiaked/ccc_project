import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, History, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import {
  adminAuditActionLabels,
  adminAuditResourceLabels,
  getAdminAuditLogs,
  type AdminAuditAction,
  type AdminAuditLog,
} from '../../lib/admin/adminAuditLogService';
import styles from './AdminAuditLogsPage.module.css';

const PAGE_SIZE = 30;

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const AdminAuditLogsPage = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<AdminAuditAction | 'all'>('all');
  const [resourceType, setResourceType] = useState('');
  const [actorKeyword, setActorKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getAdminAuditLogs({
        action,
        resourceType,
        actorKeyword,
        dateFrom,
        dateTo,
        page,
        pageSize: PAGE_SIZE,
      });
      setLogs(result.items);
      setTotalCount(result.totalCount);
    } catch (loadError) {
      console.error('Failed to load admin audit logs:', loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : '관리 작업 기록을 불러오지 못했습니다.'
      );
    } finally {
      setLoading(false);
    }
  }, [action, actorKeyword, dateFrom, dateTo, page, resourceType]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadLogs();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadLogs]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />
      <main className={styles.main}>
        <button type="button" className={styles.backButton} onClick={() => navigate('/admin/dashboard')}>
          <ArrowLeft size={16} />
          전체 관리자 대시보드
        </button>

        <section className={styles.hero}>
          <div className={styles.heroIcon}><History size={24} /></div>
          <div>
            <span>읽기 전용</span>
            <h1>관리 작업 기록</h1>
            <p>입금 정보와 캠퍼스 송금 변경 내역을 작업자와 시간 기준으로 확인합니다.</p>
          </div>
        </section>

        <section className={styles.filters}>
          <label>
            <span>작업 종류</span>
            <select value={action} onChange={(event) => { setAction(event.target.value as AdminAuditAction | 'all'); setPage(1); }}>
              <option value="all">전체</option>
              <option value="insert">생성</option>
              <option value="update">변경</option>
              <option value="delete">삭제</option>
            </select>
          </label>
          <label>
            <span>대상</span>
            <select value={resourceType} onChange={(event) => { setResourceType(event.target.value); setPage(1); }}>
              <option value="">전체</option>
              <option value="payments">입금 정보</option>
              <option value="campus_transfers">캠퍼스 송금</option>
            </select>
          </label>
          <label>
            <span>작업자</span>
            <div className={styles.searchField}>
              <Search size={15} />
              <input value={actorKeyword} onChange={(event) => setActorKeyword(event.target.value)} onBlur={() => setPage(1)} placeholder="이름 또는 이메일" />
            </div>
          </label>
          <label><span>시작일</span><input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label>
          <label><span>종료일</span><input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label>
        </section>

        {error && (
          <section className={styles.error} role="alert">
            <strong>관리 작업 기록을 사용할 수 없습니다.</strong>
            <p>{error}</p>
            <button type="button" onClick={() => void loadLogs()}>
              다시 확인
            </button>
          </section>
        )}

        <section className={styles.logPanel}>
          <div className={styles.panelHeader}>
            <div><h2>전체 기록</h2><p>총 {totalCount.toLocaleString()}건</p></div>
            <button type="button" onClick={() => void loadLogs()} disabled={loading}>{loading ? '불러오는 중' : '새로고침'}</button>
          </div>

          {loading ? (
            <div className={styles.emptyState}>기록을 불러오는 중입니다.</div>
          ) : logs.length === 0 ? (
            <div className={styles.emptyState}>조건에 맞는 관리 작업 기록이 없습니다.</div>
          ) : (
            <div className={styles.logList}>
              {logs.map((log) => (
                <details key={log.id} className={styles.logItem}>
                  <summary>
                    <span className={`${styles.actionBadge} ${styles[log.action]}`}>{adminAuditActionLabels[log.action]}</span>
                    <div>
                      <strong>{adminAuditResourceLabels[log.resourceType] ?? log.resourceType}</strong>
                      <span>{log.actorName} · {formatDateTime(log.createdAt)}</span>
                    </div>
                    <code>{log.resourceId?.slice(0, 8) ?? '-'}</code>
                  </summary>
                  <div className={styles.detailGrid}>
                    <section><h3>변경 전</h3><pre>{JSON.stringify(log.beforeData, null, 2) || '-'}</pre></section>
                    <section><h3>변경 후</h3><pre>{JSON.stringify(log.afterData, null, 2) || '-'}</pre></section>
                  </div>
                </details>
              ))}
            </div>
          )}

          <div className={styles.pagination}>
            <button type="button" onClick={() => setPage((current) => current - 1)} disabled={page <= 1 || loading}><ChevronLeft size={16} /> 이전</button>
            <span>{page} / {totalPages}</span>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={page >= totalPages || loading}>다음 <ChevronRight size={16} /></button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminAuditLogsPage;
