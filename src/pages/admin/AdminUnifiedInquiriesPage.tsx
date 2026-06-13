import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { useAdminAuth } from '../../components/AdminAuthProvider';
import {
  deleteCampusRequestAsGlobalAdmin,
  getCampusRequestsPage,
  getCampusRequestSummary,
  markCampusRequestRead,
  updateCampusRequestStatus,
  type AdminRole,
  type CampusRequest,
} from '../../lib/adminService';
import {
  deletePersonalInquiryAsGlobalAdmin,
  getPersonalInquiriesPageAsGlobalAdmin,
  markPersonalInquiryRead,
  respondToPersonalInquiry,
  type PersonalInquiry,
  type PersonalInquiryStatus,
} from '../../lib/personalInquiryService';
import { supabase } from '../../lib/supabase';
import AdminHeader from './AdminHeader';
import styles from './AdminUnifiedInquiriesPage.module.css';

const PAGE_SIZE = 15;
type SourceFilter = 'all' | 'campus' | 'personal';
type StatusFilter = 'active' | 'resolved' | 'all';

type UnifiedMessage = {
  id: string;
  senderLabel: string;
  isAdmin: boolean;
  message: string;
  createdAt: string;
};

type UnifiedInquiry = {
  key: string;
  id: string;
  source: Exclude<SourceFilter, 'all'>;
  sourceLabel: string;
  requesterLabel: string;
  categoryLabel: string;
  status: StatusFilter;
  title: string;
  updatedAt: string;
  messages: UnifiedMessage[];
};

const personalCategoryLabels = {
  reservation: '신청 변경·취소',
  payment: '입금·환불',
  ticket: '탑승권·배차',
  boarding: '탑승 관련',
  etc: '기타',
} as const;

const campusCategoryLabels = {
  notice: '전체 공지',
  late_signup: '추가 신청',
  payment_issue: '입금 문의',
  roster_change: '명단 수정',
  transfer_issue: '송금 문의',
  cancel_refund: '취소·환불',
  etc: '기타',
} as const;

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-';

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';

  return dateTimeFormatter.format(date);
};

const toPersonalStatus = (status: StatusFilter): PersonalInquiryStatus =>
  status === 'resolved' ? 'resolved' : 'in_progress';

const mapCampusInquiry = (request: CampusRequest): UnifiedInquiry => ({
  key: `campus:${request.id}`,
  id: request.id,
  source: 'campus',
  sourceLabel: '캠퍼스 문의',
  requesterLabel: `${request.district} · ${request.team} · ${request.campus}`,
  categoryLabel: campusCategoryLabels[request.type],
  status: request.status === 'resolved' ? 'resolved' : 'active',
  title: request.title,
  updatedAt: request.updatedAt,
  messages:
    request.messages.length > 0
      ? request.messages.map((message) => ({
          id: message.id,
          senderLabel:
            message.senderRole === 'global_admin' ? '전체 관리자' : '캠퍼스 관리자',
          isAdmin: message.senderRole === 'global_admin',
          message: message.message,
          createdAt: message.createdAt,
        }))
      : [
          {
            id: `initial-${request.id}`,
            senderLabel: '캠퍼스 관리자',
            isAdmin: false,
            message: request.content,
            createdAt: request.createdAt,
          },
        ],
});

const mapPersonalInquiry = (inquiry: PersonalInquiry): UnifiedInquiry => ({
  key: `personal:${inquiry.id}`,
  id: inquiry.id,
  source: 'personal',
  sourceLabel: '개인 문의',
  requesterLabel:
    [inquiry.userName, inquiry.userPhone || inquiry.userEmail]
      .filter(Boolean)
      .join(' · ') || '사용자 정보 없음',
  categoryLabel: personalCategoryLabels[inquiry.category],
  status: inquiry.status === 'resolved' ? 'resolved' : 'active',
  title: inquiry.title,
  updatedAt: inquiry.updatedAt,
  messages: inquiry.messages.map((message) => ({
    id: message.id,
    senderLabel:
      message.senderRole === 'global_admin'
        ? '전체 관리자'
        : inquiry.userName || '사용자',
    isAdmin: message.senderRole === 'global_admin',
    message: message.message,
    createdAt: message.createdAt,
  })),
});

const loadPersonalStatusItems = async (
  status: PersonalInquiryStatus | 'all',
  search: string,
  itemCount: number
) => {
  const pageSize = Math.min(50, itemCount);
  const pageCount = Math.ceil(itemCount / pageSize);
  const results = await Promise.all(
    Array.from({ length: pageCount }, (_, index) =>
      getPersonalInquiriesPageAsGlobalAdmin({
        page: index + 1,
        pageSize,
        status,
        search,
      })
    )
  );

  return {
    items: results.flatMap((result) => result.items),
    total: results[0]?.total ?? 0,
    summary: results[0]?.summary ?? {
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      onHold: 0,
    },
  };
};

const loadPersonalItems = async (
  status: StatusFilter,
  search: string,
  itemCount: number
) => {
  if (status !== 'active') {
    return loadPersonalStatusItems(status, search, itemCount);
  }

  const results = await Promise.all(
    (['open', 'in_progress', 'on_hold'] as const).map((personalStatus) =>
      loadPersonalStatusItems(personalStatus, search, itemCount)
    )
  );

  return {
    items: results.flatMap((result) => result.items),
    total: results.reduce((sum, result) => sum + result.total, 0),
    summary: results[0]?.summary ?? {
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      onHold: 0,
    },
  };
};

const AdminUnifiedInquiriesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { adminRole } = useAdminAuth();
  const requestedSource = searchParams.get('source');
  const sourceFilter: SourceFilter =
    requestedSource === 'campus' || requestedSource === 'personal'
      ? requestedSource
      : 'all';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [items, setItems] = useState<UnifiedInquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ active: 0, resolved: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>(
    {}
  );
  const [statusDrafts, setStatusDrafts] = useState<
    Record<string, StatusFilter>
  >({});

  const globalAdminRole =
    adminRole?.role === 'global_admin' ? (adminRole as AdminRole) : null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadInquiries = useCallback(async () => {
    if (!globalAdminRole) return;

    setLoading(true);
    try {
      const fetchSize = page * PAGE_SIZE;
      const includeCampus = sourceFilter !== 'personal';
      const includePersonal = sourceFilter !== 'campus';
      const [campusResult, personalResult, campusSummary, personalSummaryResult] =
        await Promise.all([
          includeCampus
            ? getCampusRequestsPage(globalAdminRole, {
                page: 1,
                pageSize: fetchSize,
                kind: 'requests',
                status: statusFilter,
                search: debouncedSearch,
              })
            : Promise.resolve({ items: [], total: 0 }),
          includePersonal
            ? loadPersonalItems(statusFilter, debouncedSearch, fetchSize)
            : Promise.resolve({ items: [], total: 0, summary: null }),
          includeCampus
            ? getCampusRequestSummary()
            : Promise.resolve({ unresolved: 0, resolved: 0 }),
          includePersonal
            ? getPersonalInquiriesPageAsGlobalAdmin({
                page: 1,
                pageSize: 1,
                status: 'all',
                search: '',
              })
            : Promise.resolve({ summary: null }),
        ]);

      const merged = [
        ...campusResult.items.map(mapCampusInquiry),
        ...personalResult.items.map(mapPersonalInquiry),
      ].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      const offset = (page - 1) * PAGE_SIZE;
      const visibleItems = merged.slice(offset, offset + PAGE_SIZE);

      setItems(visibleItems);
      setTotal(campusResult.total + personalResult.total);
      setSummary({
        active:
          Number(campusSummary.unresolved ?? 0) +
          Number(personalSummaryResult.summary?.open ?? 0) +
          Number(personalSummaryResult.summary?.inProgress ?? 0) +
          Number(personalSummaryResult.summary?.onHold ?? 0),
        resolved:
          Number(campusSummary.resolved ?? 0) +
          Number(personalSummaryResult.summary?.resolved ?? 0),
      });
      setStatusDrafts(
        Object.fromEntries(visibleItems.map((item) => [item.key, item.status]))
      );
      setResponseDrafts((current) =>
        Object.fromEntries(
          visibleItems.map((item) => [item.key, current[item.key] ?? ''])
        )
      );
      void Promise.allSettled(
        visibleItems.map((item) =>
          item.source === 'personal'
            ? markPersonalInquiryRead(item.id)
            : markCampusRequestRead(item.id)
        )
      ).then((results) => {
        results.forEach((result) => {
          if (result.status === 'rejected') {
            console.error('통합 문의 읽음 처리 실패:', result.reason);
          }
        });
      });
      setError('');
    } catch (loadError) {
      console.error('통합 문의함 조회 실패:', loadError);
      setError('문의함을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, globalAdminRole, page, sourceFilter, statusFilter]);

  useEffect(() => {
    Promise.resolve().then(() => void loadInquiries());
  }, [loadInquiries]);

  const refreshFromRealtime = useEffectEvent(() => {
    if (!processingKey) void loadInquiries();
  });

  useEffect(() => {
    let timer: number | null = null;
    const scheduleRefresh = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        refreshFromRealtime();
      }, 250);
    };
    const channel = supabase
      .channel('admin-unified-inquiries')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campus_requests' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campus_request_messages' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'personal_inquiries' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'personal_inquiry_messages' },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  const handleSourceChange = (source: SourceFilter) => {
    setSearchParams(source === 'all' ? {} : { source });
    setPage(1);
  };

  const handleSave = async (inquiry: UnifiedInquiry) => {
    const nextStatus = statusDrafts[inquiry.key] ?? inquiry.status;
    const response = responseDrafts[inquiry.key]?.trim() ?? '';
    const hasAdminResponse = inquiry.messages.some((message) => message.isAdmin);

    if (nextStatus === 'resolved' && !response && !hasAdminResponse) {
      setError('완료 처리 전에 관리자 답변을 입력해주세요.');
      return;
    }

    setProcessingKey(inquiry.key);
    setError('');
    try {
      if (inquiry.source === 'personal') {
        await respondToPersonalInquiry({
          inquiryId: inquiry.id,
          status: toPersonalStatus(nextStatus),
          adminResponse: response,
        });
      } else {
        await updateCampusRequestStatus({
          requestId: inquiry.id,
          status: nextStatus === 'resolved' ? 'resolved' : 'in_progress',
          adminResponse: response,
        });
      }
      await loadInquiries();
    } catch (saveError) {
      console.error('통합 문의 처리 실패:', saveError);
      setError('문의 답변과 처리 상태를 저장하지 못했습니다.');
    } finally {
      setProcessingKey(null);
    }
  };

  const handleDelete = async (inquiry: UnifiedInquiry) => {
    const sourceLabel =
      inquiry.source === 'personal' ? '개인 문의' : '캠퍼스 문의';
    const ok = window.confirm(
      `"${inquiry.title}" ${sourceLabel}를 삭제할까요?\n삭제한 문의와 대화 내용은 복구할 수 없습니다.`
    );
    if (!ok) return;

    setProcessingKey(inquiry.key);
    setError('');
    try {
      if (inquiry.source === 'personal') {
        await deletePersonalInquiryAsGlobalAdmin(inquiry.id);
      } else {
        await deleteCampusRequestAsGlobalAdmin(inquiry.id);
      }

      if (items.length === 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        await loadInquiries();
      }
    } catch (deleteError) {
      console.error('통합 문의 삭제 실패:', deleteError);
      setError('문의를 삭제하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setProcessingKey(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sourceLabel = useMemo(
    () =>
      sourceFilter === 'all'
        ? '전체 문의'
        : sourceFilter === 'personal'
          ? '개인 문의'
          : '캠퍼스 문의',
    [sourceFilter]
  );

  return (
    <div className={styles.page}>
      <AdminHeader />
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <p>UNIFIED INBOX</p>
            <h1>문의함</h1>
            <span>개인 사용자와 캠퍼스 관리자의 문의를 한곳에서 처리합니다.</span>
          </div>
        </header>

        <section className={styles.summary}>
          <button
            type="button"
            className={statusFilter === 'active' ? styles.activeSummary : ''}
            onClick={() => {
              setStatusFilter('active');
              setPage(1);
            }}
          >
            <span>미처리</span>
            <strong>{summary.active}</strong>
          </button>
          <button
            type="button"
            className={statusFilter === 'resolved' ? styles.activeSummary : ''}
            onClick={() => {
              setStatusFilter('resolved');
              setPage(1);
            }}
          >
            <span>완료</span>
            <strong>{summary.resolved}</strong>
          </button>
        </section>

        <section className={styles.filters} aria-label="문의함 필터">
          <div className={styles.sourceTabs}>
            {(['all', 'campus', 'personal'] as const).map((source) => (
              <button
                key={source}
                type="button"
                className={sourceFilter === source ? styles.activeSource : ''}
                onClick={() => handleSourceChange(source)}
              >
                {source === 'all'
                  ? '전체'
                  : source === 'campus'
                    ? '캠퍼스'
                    : '개인'}
              </button>
            ))}
          </div>
          <label className={styles.searchBox}>
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="이름, 캠퍼스, 연락처, 제목, 내용 검색"
            />
          </label>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void loadInquiries()}
          >
            <RefreshCw size={16} />
            새로고침
          </button>
        </section>

        <div className={styles.resultSummary}>
          <strong>{sourceLabel}</strong>
          <span>{total.toLocaleString()}건</span>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}

        {loading ? (
          <div className={styles.empty}>문의함을 불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>
            <MessageCircle size={22} />
            해당 조건의 문의가 없습니다.
          </div>
        ) : (
          <section className={styles.list}>
            {items.map((inquiry) => (
              <article className={styles.card} key={inquiry.key}>
                <div className={styles.content}>
                  <div className={styles.badges}>
                    <span className={styles.sourceBadge}>{inquiry.sourceLabel}</span>
                    <span>{inquiry.categoryLabel}</span>
                    <strong
                      className={
                        inquiry.status === 'resolved'
                          ? styles.statusResolved
                          : styles.statusActive
                      }
                    >
                      {inquiry.status === 'resolved' ? '완료' : '미처리'}
                    </strong>
                  </div>
                  <h2>{inquiry.title}</h2>
                  <div className={styles.requesterMeta}>
                    <strong>{inquiry.requesterLabel}</strong>
                    <time dateTime={inquiry.updatedAt}>
                      {formatDateTime(inquiry.updatedAt)}
                    </time>
                  </div>
                  <div className={styles.conversation}>
                    {inquiry.messages.map((message) => {
                      const isAdmin = message.isAdmin;
                      return (
                        <div
                          key={message.id}
                          className={
                            isAdmin
                              ? styles.adminMessageWrapper
                              : styles.requesterMessageWrapper
                          }
                        >
                          <div
                            className={
                              isAdmin ? styles.adminBubble : styles.requesterBubble
                            }
                          >
                            <strong className={styles.bubbleSender}>
                              {message.senderLabel}
                            </strong>
                            <p className={styles.bubbleText}>{message.message}</p>
                            <time className={styles.messageTime} dateTime={message.createdAt}>
                              {formatDateTime(message.createdAt)}
                            </time>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className={styles.responsePanel}>
                  <label>
                    처리 상태
                    <select
                      value={statusDrafts[inquiry.key] ?? inquiry.status}
                      onChange={(event) =>
                        setStatusDrafts((current) => ({
                          ...current,
                          [inquiry.key]: event.target.value as StatusFilter,
                        }))
                      }
                    >
                      <option value="active">미처리</option>
                      <option value="resolved">완료</option>
                    </select>
                  </label>
                  <label>
                    새 관리자 답변
                    <textarea
                      value={responseDrafts[inquiry.key] ?? ''}
                      onChange={(event) =>
                        setResponseDrafts((current) => ({
                          ...current,
                          [inquiry.key]: event.target.value,
                        }))
                      }
                      placeholder="답변을 입력하면 문의 작성자에게 전달됩니다."
                    />
                  </label>
                  <button
                    type="button"
                    disabled={processingKey === inquiry.key}
                    onClick={() => void handleSave(inquiry)}
                  >
                    <Save size={16} />
                    {processingKey === inquiry.key ? '저장 중...' : '답변 및 상태 저장'}
                  </button>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    disabled={processingKey === inquiry.key}
                    onClick={() => void handleDelete(inquiry)}
                  >
                    <Trash2 size={16} />
                    문의 삭제
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        <nav className={styles.pagination} aria-label="통합 문의함 페이지">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            <ChevronLeft size={16} />
            이전
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            다음
            <ChevronRight size={16} />
          </button>
        </nav>
      </main>
    </div>
  );
};

export default AdminUnifiedInquiriesPage;
