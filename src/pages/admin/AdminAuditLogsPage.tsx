import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  History,
  Search,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import {
  adminAuditActionLabels,
  adminAuditResourceLabels,
  getAdminAuditLogs,
  type AdminAuditAction,
  type AdminAuditLogCursor,
  type AdminAuditLog,
} from '../../lib/admin/adminAuditLogService';
import styles from './AdminAuditLogsPage.module.css';

const PAGE_SIZE = 30;

const fieldLabels: Record<string, string> = {
  id: '대상 ID',
  user_id: '사용자 ID',
  reservation_id: '신청 ID',
  district_id: '지구 ID',
  team_id: '팀 ID',
  campus_id: '캠퍼스 ID',
  district: '지구',
  team: '팀',
  campus: '캠퍼스',
  amount: '금액',
  total_amount: '총 송금액',
  actual_confirmed_amount: '실제 확인 금액',
  total_people: '전체 인원',
  paid_people: '입금 완료 인원',
  status: '상태',
  notes: '메모',
  paid_at: '입금 일시',
  verified_by: '입금 확인자 ID',
  verified_at: '입금 확인 일시',
  sent_by: '송금 보고자 ID',
  sent_at: '송금 보고 일시',
  confirmed_by: '송금 확인자 ID',
  confirmed_at: '송금 확인 일시',
  created_at: '생성 일시',
  updated_at: '수정 일시',
};

const statusLabels: Record<string, string> = {
  pending: '대기',
  completed: '완료',
  refunded: '환불',
  sent: '송금 보고',
  confirmed: '확인 완료',
};

const dateFields = new Set([
  'paid_at',
  'verified_at',
  'sent_at',
  'confirmed_at',
  'created_at',
  'updated_at',
]);

const amountFields = new Set(['amount', 'total_amount', 'actual_confirmed_amount']);

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));

const formatValue = (field: string, value: unknown) => {
  if (value === null || value === undefined || value === '') return '-';
  if (field === 'status' && typeof value === 'string') {
    return statusLabels[value] ?? value;
  }
  if (amountFields.has(field) && typeof value === 'number') {
    return `${value.toLocaleString('ko-KR')}원`;
  }
  if (dateFields.has(field) && typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : formatDateTime(value);
  }
  if (typeof value === 'boolean') return value ? '예' : '아니오';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const areValuesEqual = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

const getChangedFields = (log: AdminAuditLog) => {
  const before = log.beforeData ?? {};
  const after = log.afterData ?? {};
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];

  return fields
    .filter((field) => !areValuesEqual(before[field], after[field]))
    .sort((left, right) => {
      const leftKnown = fieldLabels[left] ? 0 : 1;
      const rightKnown = fieldLabels[right] ? 0 : 1;
      return leftKnown - rightKnown || left.localeCompare(right);
    });
};

const getResourceDescription = (log: AdminAuditLog) => {
  const data = log.afterData ?? log.beforeData ?? {};

  if (log.resourceType === 'campus_transfers') {
    const scope = [data.district, data.team, data.campus]
      .filter((value): value is string => typeof value === 'string' && Boolean(value))
      .join(' · ');
    return scope || '캠퍼스 송금 내역';
  }

  if (log.resourceType === 'payments') {
    const amount = formatValue('amount', data.amount);
    const status = formatValue('status', data.status);
    return `입금 ${amount} · ${status}`;
  }

  return adminAuditResourceLabels[log.resourceType] ?? log.resourceType;
};

const getActionDescription = (log: AdminAuditLog, changedFieldCount: number) => {
  const resource = adminAuditResourceLabels[log.resourceType] ?? log.resourceType;

  if (log.action === 'insert') return `${resource} 기록을 새로 생성했습니다.`;
  if (log.action === 'delete') return `${resource} 기록을 삭제했습니다.`;
  return `${resource}의 ${changedFieldCount.toLocaleString()}개 항목을 변경했습니다.`;
};

const AdminAuditLogsPage = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [cursorHistory, setCursorHistory] = useState<
    Array<AdminAuditLogCursor | null>
  >([null]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<AdminAuditLogCursor | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [action, setAction] = useState<AdminAuditAction | 'all'>('all');
  const [resourceType, setResourceType] = useState('');
  const [actorKeyword, setActorKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentCursor = cursorHistory[cursorIndex] ?? null;

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
        pageSize: PAGE_SIZE,
        cursor: currentCursor,
      });
      setLogs(result.items);
      setNextCursor(result.nextCursor);
      setHasNext(result.hasNext);
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
  }, [action, actorKeyword, currentCursor, dateFrom, dateTo, resourceType]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadLogs();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadLogs]);

  const resetCursorPagination = () => {
    setCursorHistory([null]);
    setCursorIndex(0);
  };

  const showNextPage = () => {
    if (!nextCursor || !hasNext) return;
    setCursorHistory((current) => [
      ...current.slice(0, cursorIndex + 1),
      nextCursor,
    ]);
    setCursorIndex((current) => current + 1);
  };

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />
      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/admin/dashboard')}
        >
          <ArrowLeft size={16} />
          전체 관리자 대시보드
        </button>

        <section className={styles.hero}>
          <div className={styles.heroIcon}>
            <History size={24} />
          </div>
          <div>
            <span>읽기 전용</span>
            <h1>관리 작업 기록</h1>
            <p>
              관리자가 입금 정보와 캠퍼스 송금을 생성·변경·삭제한 내역을
              작업자, 시각, 변경 항목 기준으로 확인합니다.
            </p>
          </div>
        </section>

        <section className={styles.filters}>
          <label>
            <span>작업 종류</span>
            <select
              value={action}
              onChange={(event) => {
                setAction(event.target.value as AdminAuditAction | 'all');
                resetCursorPagination();
              }}
            >
              <option value="all">전체</option>
              <option value="insert">생성</option>
              <option value="update">변경</option>
              <option value="delete">삭제</option>
            </select>
          </label>
          <label>
            <span>대상</span>
            <select
              value={resourceType}
              onChange={(event) => {
                setResourceType(event.target.value);
                resetCursorPagination();
              }}
            >
              <option value="">전체</option>
              <option value="payments">입금 정보</option>
              <option value="campus_transfers">캠퍼스 송금</option>
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
                  resetCursorPagination();
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
                resetCursorPagination();
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
                resetCursorPagination();
              }}
            />
          </label>
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
            <div>
              <h2>전체 기록</h2>
              <p>
                {cursorIndex + 1}페이지 · 현재 {logs.length.toLocaleString()}건
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadLogs()}
              disabled={loading}
            >
              {loading ? '불러오는 중' : '새로고침'}
            </button>
          </div>

          {loading ? (
            <div className={styles.emptyState}>기록을 불러오는 중입니다.</div>
          ) : logs.length === 0 ? (
            <div className={styles.emptyState}>
              조건에 맞는 관리 작업 기록이 없습니다.
            </div>
          ) : (
            <div className={styles.logList}>
              {logs.map((log) => {
                const changedFields = getChangedFields(log);

                return (
                  <details key={log.id} className={styles.logItem}>
                    <summary>
                      <span
                        className={`${styles.actionBadge} ${styles[log.action]}`}
                      >
                        {adminAuditActionLabels[log.action]}
                      </span>
                      <div>
                        <strong>{getResourceDescription(log)}</strong>
                        <span>
                          {log.actorName} · {formatDateTime(log.createdAt)} · 변경{' '}
                          {changedFields.length}개
                        </span>
                      </div>
                      <code>{log.resourceId?.slice(0, 8) ?? '-'}</code>
                    </summary>

                    <div className={styles.logDetails}>
                      <p className={styles.actionDescription}>
                        {getActionDescription(log, changedFields.length)}
                      </p>

                      <dl className={styles.metaGrid}>
                        <div>
                          <dt>작업자</dt>
                          <dd>{log.actorName}</dd>
                          <span>{log.actorEmail ?? '이메일 정보 없음'}</span>
                        </div>
                        <div>
                          <dt>작업 시각</dt>
                          <dd>{formatDateTime(log.createdAt)}</dd>
                          <span>{log.createdAt}</span>
                        </div>
                        <div>
                          <dt>대상 종류</dt>
                          <dd>
                            {adminAuditResourceLabels[log.resourceType] ??
                              log.resourceType}
                          </dd>
                          <span>{log.resourceType}</span>
                        </div>
                        <div>
                          <dt>대상 ID</dt>
                          <dd className={styles.resourceId}>
                            {log.resourceId ?? '-'}
                          </dd>
                          <span>로그 ID: {log.id}</span>
                        </div>
                      </dl>

                      <section className={styles.changeSection}>
                        <div className={styles.changeHeader}>
                          <div>
                            <h3>변경된 항목</h3>
                            <p>실제로 값이 달라진 항목만 표시합니다.</p>
                          </div>
                          <strong>{changedFields.length}개</strong>
                        </div>
                        {changedFields.length === 0 ? (
                          <div className={styles.noChanges}>
                            비교할 수 있는 변경 항목이 없습니다.
                          </div>
                        ) : (
                          <div className={styles.changeTable}>
                            <div className={styles.changeTableHeader}>
                              <span>항목</span>
                              <span>변경 전</span>
                              <span>변경 후</span>
                            </div>
                            {changedFields.map((field) => (
                              <div className={styles.changeRow} key={field}>
                                <div>
                                  <strong>{fieldLabels[field] ?? field}</strong>
                                  {fieldLabels[field] && <code>{field}</code>}
                                </div>
                                <span>{formatValue(field, log.beforeData?.[field])}</span>
                                <span>{formatValue(field, log.afterData?.[field])}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>

                      <details className={styles.rawDetails}>
                        <summary>원본 데이터 보기</summary>
                        <div className={styles.detailGrid}>
                          <section>
                            <h3>변경 전 원본</h3>
                            <pre>
                              {log.beforeData
                                ? JSON.stringify(log.beforeData, null, 2)
                                : '-'}
                            </pre>
                          </section>
                          <section>
                            <h3>변경 후 원본</h3>
                            <pre>
                              {log.afterData
                                ? JSON.stringify(log.afterData, null, 2)
                                : '-'}
                            </pre>
                          </section>
                        </div>
                      </details>
                    </div>
                  </details>
                );
              })}
            </div>
          )}

          <div className={styles.pagination}>
            <button
              type="button"
              onClick={() => setCursorIndex((current) => Math.max(0, current - 1))}
              disabled={cursorIndex === 0 || loading}
            >
              <ChevronLeft size={16} /> 이전
            </button>
            <span>
              {cursorIndex + 1}페이지
            </span>
            <button
              type="button"
              onClick={showNextPage}
              disabled={!hasNext || !nextCursor || loading}
            >
              다음 <ChevronRight size={16} />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminAuditLogsPage;
