import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, MessageCircle, RefreshCw, Save, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  getPersonalInquiriesPageAsGlobalAdmin,
  getPersonalInquiryAuditLogs,
  markPersonalInquiryRead,
  personalInquiryChangedEventName,
  respondToPersonalInquiry,
  type PersonalInquiry,
  type PersonalInquiryStatus,
  type PersonalInquirySummary,
  type PersonalInquiryAuditLog,
} from '../../lib/personalInquiryService';
import { supabase } from '../../lib/supabase';
import AdminHeader from './AdminHeader';
import styles from './AdminPersonalInquiriesPage.module.css';

const PAGE_SIZE = 15;
const emptySummary: PersonalInquirySummary = { total: 0, open: 0, inProgress: 0, resolved: 0, onHold: 0 };
const statusOptions: Array<{ value: PersonalInquiryStatus; label: string }> = [
  { value: 'open', label: '접수' },
  { value: 'in_progress', label: '처리 중' },
  { value: 'resolved', label: '답변 완료' },
  { value: 'on_hold', label: '확인 보류' },
];
const categoryLabels = {
  reservation: '신청 변경·취소',
  payment: '입금·환불',
  ticket: '탑승권·배차',
  boarding: '탑승 관련',
  etc: '기타',
} as const;
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

const AdminPersonalInquiriesPage = () => {
  const navigate = useNavigate();
  const [inquiries, setInquiries] = useState<PersonalInquiry[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<PersonalInquiryStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusDrafts, setStatusDrafts] = useState<Record<string, PersonalInquiryStatus>>({});
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [auditLogs, setAuditLogs] = useState<Record<string, PersonalInquiryAuditLog[]>>({});

  const loadInquiries = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPersonalInquiriesPageAsGlobalAdmin({
        page, pageSize: PAGE_SIZE, status: statusFilter, search: debouncedSearch,
      });
      setInquiries(result.items);
      setTotal(result.total);
      setSummary(result.summary);
      setStatusDrafts(Object.fromEntries(result.items.map((item) => [item.id, item.status])));
      setResponseDrafts(Object.fromEntries(result.items.map((item) => [item.id, ''])));
      await Promise.allSettled(result.items.map((item) => markPersonalInquiryRead(item.id)));
      setError('');
    } catch (loadError) {
      console.error('개인 문의 관리자 조회 실패:', loadError);
      setError('개인 문의를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    Promise.resolve().then(() => void loadInquiries());
  }, [loadInquiries]);

  useEffect(() => {
    let timer: number | null = null;
    const schedule = () => {
      if (processingId) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = null; void loadInquiries(); }, 250);
    };
    const channel = supabase
      .channel('admin-personal-inquiries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_inquiries' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_inquiry_messages' }, schedule)
      .subscribe();
    window.addEventListener(personalInquiryChangedEventName, schedule);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener(personalInquiryChangedEventName, schedule);
      void supabase.removeChannel(channel);
    };
  }, [loadInquiries, processingId]);

  const handleSave = async (inquiry: PersonalInquiry) => {
    const status = statusDrafts[inquiry.id] ?? inquiry.status;
    const response = responseDrafts[inquiry.id]?.trim() ?? '';
    const hasPriorAdminResponse = inquiry.messages.some((message) => message.senderRole === 'global_admin');
    if (status === 'resolved' && !response && !hasPriorAdminResponse) {
      setError('답변 완료 처리 전 관리자 답변을 입력해주세요.');
      return;
    }
    setProcessingId(inquiry.id);
    setError('');
    try {
      await respondToPersonalInquiry({ inquiryId: inquiry.id, status, adminResponse: response });
      await loadInquiries();
    } catch (saveError) {
      console.error('개인 문의 처리 실패:', saveError);
      setError('개인 문의 처리 상태를 저장하지 못했습니다.');
    } finally {
      setProcessingId(null);
    }
  };

  const loadAuditLogs = async (inquiryId: string) => {
    if (auditLogs[inquiryId]) return;
    try {
      const logs = await getPersonalInquiryAuditLogs(inquiryId);
      setAuditLogs((current) => ({ ...current, [inquiryId]: logs }));
    } catch (auditError) {
      console.error('개인 문의 감사 로그 조회 실패:', auditError);
      setError('개인 문의 처리 이력을 불러오지 못했습니다.');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className={styles.page}>
      <AdminHeader />
      <main className={styles.main}>
        <button type="button" className={styles.backButton} onClick={() => navigate('/admin/communications')}><ArrowLeft size={17} />공지·문의 관리</button>
        <header className={styles.header}>
          <div><p>PERSONAL SUPPORT</p><h1>개인 문의 처리</h1><span>개인 사용자의 문의 대화와 처리 이력을 관리합니다.</span></div>
          <button type="button" onClick={() => void loadInquiries()}><RefreshCw size={16} />새로고침</button>
        </header>

        <section className={styles.summary}>
          <button type="button" onClick={() => { setStatusFilter('all'); setPage(1); }}><span>전체 문의</span><strong>{summary.total}</strong></button>
          <button type="button" onClick={() => { setStatusFilter('open'); setPage(1); }}><span>새 문의</span><strong>{summary.open}</strong></button>
          <button type="button" onClick={() => { setStatusFilter('in_progress'); setPage(1); }}><span>처리 중</span><strong>{summary.inProgress}</strong></button>
          <button type="button" onClick={() => { setStatusFilter('resolved'); setPage(1); }}><span>답변 완료</span><strong>{summary.resolved}</strong></button>
        </section>

        <label className={styles.searchBox}><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름, 연락처, 제목, 내용 검색" /></label>
        {error && <p className={styles.error} role="alert">{error}</p>}

        {loading ? <div className={styles.empty}>개인 문의를 불러오는 중...</div> : inquiries.length === 0 ? <div className={styles.empty}><MessageCircle size={22} />해당 조건의 개인 문의가 없습니다.</div> : (
          <section className={styles.list}>
            {inquiries.map((inquiry) => (
              <article className={styles.card} key={inquiry.id}>
                <div className={styles.content}>
                  <div className={styles.badges}><span>{categoryLabels[inquiry.category]}</span><strong className={styles[`status_${inquiry.status}`]}>{statusOptions.find((option) => option.value === inquiry.status)?.label}</strong></div>
                  <h2>{inquiry.title}</h2>
                  <div className={styles.userMeta}><strong>{inquiry.userName || '이름 없음'}</strong><span>{inquiry.userPhone || inquiry.userEmail || '연락처 없음'}</span><time dateTime={inquiry.createdAt}>{formatDateTime(inquiry.createdAt)}</time></div>
                  <div className={styles.conversation}>
                    {inquiry.messages.map((message) => (
                      <div key={message.id} className={message.senderRole === 'global_admin' ? styles.adminMessage : styles.userMessage}>
                        <strong>{message.senderRole === 'global_admin' ? '관리자' : inquiry.userName || '사용자'}</strong>
                        <p>{message.message}</p>
                        <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
                      </div>
                    ))}
                  </div>
                  <details className={styles.audit} onToggle={(event) => {
                    if (event.currentTarget.open) void loadAuditLogs(inquiry.id);
                  }}>
                    <summary>처리 이력</summary>
                    <div>
                      {(auditLogs[inquiry.id] ?? []).map((log) => (
                        <p key={log.id}>
                          <strong>{log.action}</strong>
                          <time dateTime={log.createdAt}>{formatDateTime(log.createdAt)}</time>
                        </p>
                      ))}
                      {auditLogs[inquiry.id]?.length === 0 && <p>기록된 처리 이력이 없습니다.</p>}
                    </div>
                  </details>
                </div>
                <div className={styles.responsePanel}>
                  <label>처리 상태<select value={statusDrafts[inquiry.id] ?? inquiry.status} onChange={(event) => setStatusDrafts((current) => ({ ...current, [inquiry.id]: event.target.value as PersonalInquiryStatus }))}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label>새 관리자 답변<textarea value={responseDrafts[inquiry.id] ?? ''} maxLength={2000} onChange={(event) => setResponseDrafts((current) => ({ ...current, [inquiry.id]: event.target.value }))} placeholder="새 답변을 입력하면 사용자에게 알림이 발송됩니다." /></label>
                  <button type="button" disabled={processingId === inquiry.id} onClick={() => void handleSave(inquiry)}><Save size={16} />{processingId === inquiry.id ? '저장 중...' : '처리 저장'}</button>
                </div>
              </article>
            ))}
          </section>
        )}
        <nav className={styles.pagination} aria-label="개인 문의 페이지">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} />이전</button>
          <span>{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>다음<ChevronRight size={16} /></button>
        </nav>
      </main>
    </div>
  );
};

export default AdminPersonalInquiriesPage;
