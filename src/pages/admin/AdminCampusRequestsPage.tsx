import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Edit2,
  MessageSquare,
  Megaphone,
  RefreshCw,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import {
  createCampusRequest,
  createGlobalCampusNotice,
  createCampusRequestMessage,
  deleteCampusRequestMessage,
  getAdminRole,
  getCampusRequestSummary,
  getCampusRequestsPage,
  getGlobalCampusNotices,
  updateCampusRequestMessage,
  updateCampusRequestStatus,
  type AdminRole,
  type CampusRequest,
  type CampusRequestStatus,
  type CampusRequestType,
  type CampusRequestSummary,
} from '../../lib/adminService';
import { supabase } from '../../lib/supabase';
import { markCampusNoticesRead } from '../../lib/adminNoticeReadState';

import styles from './AdminCampusRequestsPage.module.css';

const requestTypeOptions: Array<{
  value: CampusRequestType;
  label: string;
}> = [
  { value: 'notice', label: '전체 공지' },
  { value: 'late_signup', label: '추가 신청' },
  { value: 'cancel_refund', label: '취소/환불' },
  { value: 'payment_issue', label: '입금 문의' },
  { value: 'roster_change', label: '명단 수정' },
  { value: 'transfer_issue', label: '송금 문의' },
  { value: 'etc', label: '기타' },
];

const statusOptions: Array<{
  value: CampusRequestStatus;
  label: string;
}> = [
  { value: 'open', label: '접수' },
  { value: 'in_progress', label: '처리 중' },
  { value: 'resolved', label: '완료' },
  { value: 'on_hold', label: '보류' },
];

const typeLabelMap = Object.fromEntries(
  requestTypeOptions.map((option) => [option.value, option.label])
) as Record<CampusRequestType, string>;

const statusLabelMap = Object.fromEntries(
  statusOptions.map((option) => [option.value, option.label])
) as Record<CampusRequestStatus, string>;

const campusRequestTypeOptions = requestTypeOptions.filter(
  (option) => option.value !== 'notice'
);
const PAGE_SIZE = 15;
const emptySummary: CampusRequestSummary = {
  total: 0,
  notices: 0,
  unresolved: 0,
  open: 0,
  inProgress: 0,
  resolved: 0,
};

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

const formatDateTime = (value: string | null) => {
  if (!value) return '-';

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const sortRequestMessages = (messages: CampusRequest['messages']) =>
  [...messages].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

const getTimelineMessages = (request: CampusRequest) => {
  const messages = [...request.messages];
  const adminResponse = request.adminResponse?.trim();
  const hasSameGlobalMessage =
    adminResponse &&
    messages.some(
      (message) =>
        message.senderRole === 'global_admin' &&
        message.message.trim() === adminResponse
    );

  if (adminResponse && !hasSameGlobalMessage) {
    messages.push({
      id: `${request.id}-admin-response`,
      requestId: request.id,
      senderId: request.handledBy || '',
      senderRole: 'global_admin',
      message: adminResponse,
      createdAt: request.handledAt || request.updatedAt,
    });
  }

  return sortRequestMessages(messages);
};

const AdminCampusRequestsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [requests, setRequests] = useState<CampusRequest[]>([]);
  const [typeInput, setTypeInput] = useState<CampusRequestType>('late_signup');
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');
  const [noticeTitleInput, setNoticeTitleInput] = useState('');
  const [noticeContentInput, setNoticeContentInput] = useState('');
  const [globalAdminTab, setGlobalAdminTab] = useState<'requests' | 'notices'>(
    'requests'
  );
  const [isNoticeFormOpen, setIsNoticeFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampusRequestStatus | 'all'>(
    'all'
  );
  const [typeFilter, setTypeFilter] = useState<CampusRequestType | 'all'>('all');
  const [statusDrafts, setStatusDrafts] = useState<
    Record<string, CampusRequestStatus>
  >({});
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>(
    {}
  );
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>(
    {}
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageDraft, setEditingMessageDraft] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<string>>(
    () => new Set()
  );
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [summary, setSummary] = useState<CampusRequestSummary>(emptySummary);
  const [debouncedSearchKeyword, setDebouncedSearchKeyword] = useState('');

  const isGlobalAdmin = adminRole?.role === 'global_admin';
  const isCampusAdmin = adminRole?.role === 'campus_admin';

  const handleGlobalTabChange = (tab: 'requests' | 'notices') => {
    setGlobalAdminTab(tab);
    setStatusFilter('all');
    setTypeFilter('all');
    setSearchKeyword('');
    setPage(1);
  };

  const toggleRequestExpanded = (requestId: string) => {
    setExpandedRequestIds((prev) => {
      const next = new Set(prev);

      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }

      return next;
    });
  };

  const loadRequests = async (role: AdminRole, targetPage = page) => {
    setLoading(true);
    const [pageResult, noticeResult] = await Promise.all([
      getCampusRequestsPage(role, {
        page: targetPage,
        pageSize: PAGE_SIZE,
        kind: role.role === 'global_admin' ? globalAdminTab : 'requests',
        status: statusFilter,
        type: typeFilter,
        search: debouncedSearchKeyword,
      }),
      role.role === 'campus_admin'
        ? getGlobalCampusNotices()
        : Promise.resolve({ data: [], error: null }),
    ]);
    const notices = noticeResult.error ? [] : noticeResult.data ?? [];
    const nextRequests = [...notices, ...pageResult.items];

    setRequests(nextRequests);
    setTotalItems(pageResult.total);
    setStatusDrafts(
      Object.fromEntries(
        nextRequests.map((request) => [request.id, request.status])
      )
    );
    setResponseDrafts(
      Object.fromEntries(
        nextRequests.map((request) => [request.id, request.adminResponse || ''])
      )
    );
    setMessageDrafts(
      Object.fromEntries(nextRequests.map((request) => [request.id, '']))
    );
    setLoading(false);
  };

  const loadSummary = async (role: AdminRole) => {
    setSummary(await getCampusRequestSummary(role));
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchKeyword(searchKeyword);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchKeyword]);

  useEffect(() => {
    let isMounted = true;

    const checkAdminAndLoadRequests = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          navigate('/admin/login');
          return;
        }

        setCurrentUserId(session.user.id);

        const role = await getAdminRole(session.user.id);

        if (!role || !['global_admin', 'campus_admin'].includes(role.role)) {
          alert('관리자만 접근할 수 있습니다.');
          navigate('/');
          return;
        }

        if (
          role.role === 'campus_admin' &&
          (!role.district || !role.team || !role.campus)
        ) {
          alert('관리자 계정에 지구, 팀, 캠퍼스 정보가 없습니다.');
          navigate('/');
          return;
        }

        if (!isMounted) return;

        setAdminRole(role);
      } catch (error) {
        console.error('문의 게시판 조회 실패:', error);

        if (isMounted) {
          alert(`문의 게시판을 불러올 수 없습니다: ${getErrorMessage(error)}`);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkAdminAndLoadRequests();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!adminRole) return;

    // Loading the current server page synchronizes this view with Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRequests(adminRole).catch((error) => {
      console.error('문의 게시판 페이지 조회 실패:', error);
      alert(`문의 게시판을 불러올 수 없습니다: ${getErrorMessage(error)}`);
      setLoading(false);
    });
    // loadRequests intentionally follows the current page/filter state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    adminRole,
    debouncedSearchKeyword,
    globalAdminTab,
    page,
    statusFilter,
    typeFilter,
  ]);

  useEffect(() => {
    if (!adminRole || adminRole.role !== 'global_admin') return;

    // Summary counts are loaded independently so page/filter changes stay cheap.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSummary(adminRole).catch((error) => {
      console.error('문의 게시판 요약 조회 실패:', error);
    });
  }, [adminRole]);

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const filteredRequests = useMemo(() => {
    if (!isGlobalAdmin) return requests;

    const keyword = searchKeyword.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesTab =
        globalAdminTab === 'notices'
          ? request.isGlobalNotice
          : !request.isGlobalNotice;
      const matchesStatus =
        request.isGlobalNotice ||
        statusFilter === 'all' ||
        request.status === statusFilter;
      const matchesType = typeFilter === 'all' || request.type === typeFilter;
      const searchTarget = [
        request.title,
        request.content,
        request.adminResponse,
        ...request.messages.map((message) => message.message),
        request.district,
        request.team,
        request.campus,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return (
        matchesTab &&
        matchesStatus &&
        matchesType &&
        (!keyword || searchTarget.includes(keyword))
      );
    });
  }, [
    globalAdminTab,
    isGlobalAdmin,
    requests,
    searchKeyword,
    statusFilter,
    typeFilter,
  ]);

  const globalNotices = useMemo(
    () => requests.filter((request) => request.isGlobalNotice),
    [requests]
  );

  const visibleRequests = useMemo(
    () =>
      isGlobalAdmin
        ? filteredRequests
        : requests.filter((request) => !request.isGlobalNotice),
    [filteredRequests, isGlobalAdmin, requests]
  );

  const activeFilterChips = useMemo(() => {
    if (!isGlobalAdmin) return [];

    const chips: string[] = [];
    const keyword = searchKeyword.trim();

    if (keyword) chips.push(`검색: ${keyword}`);
    if (globalAdminTab === 'requests' && statusFilter !== 'all') {
      chips.push(`상태: ${statusLabelMap[statusFilter]}`);
    }
    if (typeFilter !== 'all') chips.push(`유형: ${typeLabelMap[typeFilter]}`);

    return chips;
  }, [
    globalAdminTab,
    isGlobalAdmin,
    searchKeyword,
    statusFilter,
    typeFilter,
  ]);

  const hasActiveFilters = activeFilterChips.length > 0;

  const filterSummary = useMemo(() => {
    if (!isGlobalAdmin) return '';

    return activeFilterChips.length > 0
      ? activeFilterChips.join(' · ')
      : '전체';
  }, [activeFilterChips, isGlobalAdmin]);

  const resetFilters = () => {
    setSearchKeyword('');
    setStatusFilter('all');
    setTypeFilter('all');
    setPage(1);
  };

  useEffect(() => {
    if (!isCampusAdmin || !currentUserId || globalNotices.length === 0) return;

    void markCampusNoticesRead(
      currentUserId,
      globalNotices.map((notice) => notice.id)
    ).catch((error) => {
      console.error('Failed to mark campus notices read:', error);
    });
  }, [currentUserId, globalNotices, isCampusAdmin]);

  const handleCreateGlobalNotice = async () => {
    if (!isGlobalAdmin) return;

    const title = noticeTitleInput.trim();
    const content = noticeContentInput.trim();

    if (!title || !content) {
      alert('공지 제목과 내용을 모두 입력해주세요.');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    setSubmitting(true);

    try {
      const createdNotice = await createGlobalCampusNotice({
        title,
        content,
        createdBy: user.id,
      });

      setRequests((prev) => [createdNotice, ...prev]);
      setTotalItems((prev) => prev + 1);
      setStatusDrafts((prev) => ({
        ...prev,
        [createdNotice.id]: createdNotice.status,
      }));
      setResponseDrafts((prev) => ({
        ...prev,
        [createdNotice.id]: createdNotice.adminResponse || '',
      }));
      setMessageDrafts((prev) => ({
        ...prev,
        [createdNotice.id]: '',
      }));
      setNoticeTitleInput('');
      setNoticeContentInput('');
      setIsNoticeFormOpen(false);
      if (adminRole) void loadSummary(adminRole);

      alert('전체 캠퍼스 공지를 등록했습니다.');
    } catch (error) {
      console.error('전체 공지 등록 실패:', error);
      alert(`공지 등록 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRequest = async () => {
    if (!adminRole || !isCampusAdmin) return;

    const title = titleInput.trim();
    const content = contentInput.trim();

    if (!title || !content) {
      alert('제목과 내용을 모두 입력해주세요.');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    setSubmitting(true);

    try {
      const createdRequest = await createCampusRequest({
        type: typeInput,
        title,
        content,
        district: adminRole.district || '',
        team: adminRole.team || '',
        campus: adminRole.campus || '',
        createdBy: user.id,
      });

      setRequests((prev) => [createdRequest, ...prev]);
      setTotalItems((prev) => prev + 1);
      setStatusDrafts((prev) => ({
        ...prev,
        [createdRequest.id]: createdRequest.status,
      }));
      setResponseDrafts((prev) => ({
        ...prev,
        [createdRequest.id]: '',
      }));
      setMessageDrafts((prev) => ({
        ...prev,
        [createdRequest.id]: '',
      }));
      setTitleInput('');
      setContentInput('');

      alert('문의가 등록되었습니다.');
    } catch (error) {
      console.error('문의 등록 실패:', error);
      alert(`문의 등록 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRequest = async (request: CampusRequest) => {
    if (!isGlobalAdmin || processingId) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    const nextStatus = statusDrafts[request.id] || request.status;
    const nextResponse = responseDrafts[request.id] || '';
    const trimmedResponse = nextResponse.trim();
    const previousResponse = request.adminResponse?.trim() || '';

    setProcessingId(request.id);

    try {
      const updatedRequest = await updateCampusRequestStatus({
        requestId: request.id,
        status: nextStatus,
        adminResponse: nextResponse,
        handledBy: user.id,
      });
      const createdResponseMessage =
        trimmedResponse && trimmedResponse !== previousResponse
          ? await createCampusRequestMessage({
              requestId: request.id,
              senderId: user.id,
              senderRole: 'global_admin',
              message: trimmedResponse,
            })
          : null;

      setRequests((prev) =>
        prev.map((item) =>
          item.id === updatedRequest.id
            ? {
                ...updatedRequest,
                messages: createdResponseMessage
                  ? sortRequestMessages([
                      ...item.messages,
                      createdResponseMessage,
                    ])
                  : item.messages,
              }
            : item
        )
      );
      if (adminRole) void loadSummary(adminRole);

      alert('문의 처리 상태를 저장했습니다.');
    } catch (error) {
      console.error('문의 처리 저장 실패:', error);
      alert(`문의 처리 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSendMessage = async (request: CampusRequest) => {
    if (!adminRole || processingId) return;

    const message = (messageDrafts[request.id] || '').trim();

    if (!message) {
      alert('보낼 메시지를 입력해주세요.');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    setProcessingId(request.id);

    try {
      const createdMessage = await createCampusRequestMessage({
        requestId: request.id,
        senderId: user.id,
        senderRole: adminRole.role,
        message,
      });

      setRequests((prev) =>
        prev.map((item) =>
          item.id === request.id
            ? {
                ...item,
                messages: sortRequestMessages([
                  ...item.messages,
                  createdMessage,
                ]),
              }
            : item
        )
      );
      setMessageDrafts((prev) => ({
        ...prev,
        [request.id]: '',
      }));
    } catch (error) {
      console.error('문의 메시지 등록 실패:', error);
      alert(`메시지 등록 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setProcessingId(null);
    }
  };

  const startEditMessage = (messageId: string, message: string) => {
    setEditingMessageId(messageId);
    setEditingMessageDraft(message);
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingMessageDraft('');
  };

  const handleUpdateMessage = async (request: CampusRequest) => {
    if (!editingMessageId || processingId) return;

    const nextMessage = editingMessageDraft.trim();

    if (!nextMessage) {
      alert('수정할 메시지를 입력해주세요.');
      return;
    }

    setProcessingId(request.id);

    try {
      const updatedMessage = await updateCampusRequestMessage({
        messageId: editingMessageId,
        message: nextMessage,
      });

      setRequests((prev) =>
        prev.map((item) =>
          item.id === request.id
            ? {
                ...item,
                messages: sortRequestMessages(
                  item.messages.map((message) =>
                    message.id === updatedMessage.id ? updatedMessage : message
                  )
                ),
              }
            : item
        )
      );
      cancelEditMessage();
    } catch (error) {
      console.error('문의 메시지 수정 실패:', error);
      alert(`메시지 수정 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteMessage = async (
    request: CampusRequest,
    messageId: string
  ) => {
    if (processingId) return;

    const ok = window.confirm('이 답장을 삭제할까요?');

    if (!ok) return;

    setProcessingId(request.id);

    try {
      await deleteCampusRequestMessage(messageId);

      setRequests((prev) =>
        prev.map((item) =>
          item.id === request.id
            ? {
                ...item,
                messages: item.messages.filter(
                  (message) => message.id !== messageId
                ),
              }
            : item
        )
      );

      if (editingMessageId === messageId) {
        cancelEditMessage();
      }
    } catch (error) {
      console.error('문의 메시지 삭제 실패:', error);
      alert(`메시지 삭제 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <AdminHeader />
        <main className={styles.main}>
          <p>로딩 중...</p>
        </main>
      </div>
    );
  }

  if (!adminRole) {
    return (
      <div className={styles.page}>
        <AdminHeader />
        <main className={styles.main}>
          <p>관리자만 접근할 수 있습니다.</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <AdminHeader />

      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() =>
            navigate(isGlobalAdmin ? '/admin/global' : '/admin/campus')
          }
        >
          <ArrowLeft size={18} />
          {isGlobalAdmin ? '전체 관리자 화면' : '캠퍼스 관리자 화면'}
        </button>

        <section className={styles.headerSection}>
          <div>
            <p className={styles.eyebrow}>
              {isGlobalAdmin ? '마감 후 문의 관리' : '본부 공지와 문의'}
            </p>
            <h1 className={styles.title}>
              {isGlobalAdmin ? '캠퍼스 문의 및 공지 관리' : '본부 공지와 문의'}
            </h1>
            <p className={styles.description}>
              {isGlobalAdmin
                ? '신청 마감 이후 추가 신청, 환불, 입금 오류, 명단 수정 같은 요청을 한 곳에서 기록하고 처리합니다. 모든 캠퍼스 관리자에게 공지도 일괄 전달할 수 있습니다.'
                : '본부 공지를 확인하고, 추가 신청이나 환불처럼 본부 확인이 필요한 문의를 남깁니다.'}
            </p>
          </div>

          <div className={styles.scopeBadge}>
            <MessageSquare size={18} />
            {isGlobalAdmin
              ? '전체 관리자'
              : `${adminRole.district} / ${adminRole.team} / ${adminRole.campus}`}
          </div>
        </section>

        {isGlobalAdmin && (
          <div className={styles.globalTabs} role="tablist" aria-label="관리 유형">
            <button
              type="button"
              className={
                globalAdminTab === 'requests' ? styles.globalTabActive : ''
              }
              onClick={() => handleGlobalTabChange('requests')}
            >
              문의 처리
            </button>
            <button
              type="button"
              className={
                globalAdminTab === 'notices' ? styles.globalTabActive : ''
              }
              onClick={() => handleGlobalTabChange('notices')}
            >
              공지 관리
              {summary.notices > 0 && (
                <span className={styles.tabCount}>{summary.notices}</span>
              )}
            </button>
          </div>
        )}

        {isGlobalAdmin && globalAdminTab === 'requests' && (
          <section className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <span>미완료</span>
              <strong>{summary.unresolved}</strong>
            </div>
            <div className={styles.summaryCard}>
              <span>접수</span>
              <strong>{summary.open}</strong>
            </div>
            <div className={styles.summaryCard}>
              <span>처리 중</span>
              <strong>{summary.inProgress}</strong>
            </div>
            <div className={styles.summaryCard}>
              <span>완료</span>
              <strong>{summary.resolved}</strong>
            </div>
          </section>
        )}

        {isGlobalAdmin && globalAdminTab === 'notices' && (
          <section className={`${styles.writePanel} ${styles.noticeWritePanel}`}>
            <div className={styles.noticeComposerHeader}>
              <div className={styles.sectionHeader}>
                <h2>전체 캠퍼스 공지</h2>
                <p>
                  등록한 공지는 모든 캠퍼스 관리자 홈과 문의 게시판에 표시됩니다.
                </p>
              </div>
              <div className={styles.noticeComposerActions}>
                <span>등록된 공지 {summary.notices}건</span>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setIsNoticeFormOpen((prev) => !prev)}
                >
                  <Megaphone size={16} />
                  {isNoticeFormOpen ? '작성 닫기' : '전체 공지 작성'}
                </button>
              </div>
            </div>

            {isNoticeFormOpen && (
              <div className={styles.noticeFormBody}>
                <label className={styles.field}>
                  <span>공지 제목</span>
                  <input
                    value={noticeTitleInput}
                    onChange={(event) => setNoticeTitleInput(event.target.value)}
                    placeholder="예: 마감 후 추가 신청 처리 기준 안내"
                  />
                </label>

                <label className={styles.field}>
                  <span>공지 내용</span>
                  <textarea
                    value={noticeContentInput}
                    onChange={(event) =>
                      setNoticeContentInput(event.target.value)
                    }
                    placeholder="캠퍼스 관리자에게 일괄 안내할 내용을 입력해주세요."
                    rows={5}
                  />
                </label>

                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleCreateGlobalNotice}
                    disabled={submitting}
                  >
                    <Megaphone size={16} />
                    {submitting ? '등록 중...' : '전체 공지 등록'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {isCampusAdmin && globalNotices.length > 0 && (
          <section className={styles.noticeSection}>
            <div className={styles.noticeSectionHeader}>
              <div className={styles.noticeSectionTitle}>
                <Megaphone size={18} />
                <h2>본부 공지</h2>
              </div>
              <span>최근 공지 {globalNotices.length}건</span>
            </div>

            <div className={styles.noticeList}>
              {globalNotices.map((notice) => (
                <article key={notice.id} className={styles.noticeItem}>
                  <div className={styles.noticeItemHeader}>
                    <strong>{notice.title}</strong>
                    <time dateTime={notice.createdAt}>
                      {formatDateTime(notice.createdAt)}
                    </time>
                  </div>
                  <p>{notice.content}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {isCampusAdmin && (
          <section className={styles.writePanel}>
            <div className={styles.sectionHeader}>
              <h2>문의 작성</h2>
              <p>
                본부 확인이 필요한 내용은 유형을 고르고 구체적으로 남겨주세요.
              </p>
            </div>

            <div className={styles.writeGrid}>
              <label className={styles.field}>
                <span>문의 유형</span>
                <select
                  value={typeInput}
                  onChange={(event) =>
                    setTypeInput(event.target.value as CampusRequestType)
                  }
                >
                  {campusRequestTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>제목</span>
                <input
                  value={titleInput}
                  onChange={(event) => setTitleInput(event.target.value)}
                  placeholder="예: 마감 후 추가 신청자 1명 문의"
                />
              </label>
            </div>

            <label className={styles.field}>
              <span>내용</span>
              <textarea
                value={contentInput}
                onChange={(event) => setContentInput(event.target.value)}
                placeholder="이름, 연락처, 현재 상황, 본부 확인이 필요한 내용을 적어주세요."
                rows={5}
              />
            </label>

            <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleCreateRequest}
              disabled={submitting}
            >
              <Send size={16} />
              {submitting ? '등록 중...' : '문의 등록'}
            </button>
            </div>
          </section>
        )}

        {isGlobalAdmin ? (
          <section
            className={`${styles.filterPanel} ${
              hasActiveFilters ? styles.filterPanelActive : ''
            }`}
          >
            <div className={styles.filterTitle}>
              <SlidersHorizontal size={17} />
              <span>{globalAdminTab === 'requests' ? '문의 필터' : '공지 필터'}</span>
            </div>

            <div
              className={`${styles.searchBox} ${
                searchKeyword.trim() ? styles.filterControlActive : ''
              }`}
            >
              <Search size={18} />
              <input
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                placeholder="캠퍼스, 제목, 내용 검색"
              />
              {searchKeyword.trim() && (
                <button
                  type="button"
                  className={styles.clearSearchButton}
                  onClick={() => setSearchKeyword('')}
                  aria-label="검색어 지우기"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <select
              className={`${styles.select} ${
                globalAdminTab === 'requests' && statusFilter !== 'all'
                  ? styles.filterControlActive
                  : ''
              }`}
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(
                    event.target.value as CampusRequestStatus | 'all'
                  );
                  setPage(1);
                }}
                disabled={globalAdminTab === 'notices'}
              >
              <option value="all">전체 상태</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className={`${styles.select} ${
                typeFilter !== 'all' ? styles.filterControlActive : ''
              }`}
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value as CampusRequestType | 'all');
                setPage(1);
              }}
            >
              <option value="all">전체 유형</option>
              {requestTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className={styles.filterActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={resetFilters}
                disabled={!hasActiveFilters}
              >
                <X size={16} />
                초기화
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void loadRequests(adminRole)}
              >
                <RefreshCw size={16} />
                새로고침
              </button>
            </div>

            <div className={styles.filterFeedback} aria-live="polite">
              {hasActiveFilters ? (
                <>
                  <div className={styles.filterChips}>
                    {activeFilterChips.map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                  <strong>{totalItems.toLocaleString()}건 검색됨</strong>
                </>
              ) : (
                <>
                  <span>전체 조건</span>
                  <strong>{totalItems.toLocaleString()}건 검색됨</strong>
                </>
              )}
            </div>
          </section>
        ) : (
          <div className={styles.listActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void loadRequests(adminRole)}
            >
              <RefreshCw size={16} />
              새로고침
            </button>
          </div>
        )}

        {isCampusAdmin && (
          <div className={styles.requestListHeader}>
            <div>
              <h2>내 문의</h2>
              <p>본부 확인이 필요한 요청 내역과 답변을 확인합니다.</p>
            </div>
          </div>
        )}

        {isGlobalAdmin && (
          <div className={styles.requestListHeader}>
            <div>
              <h2>{globalAdminTab === 'requests' ? '문의 목록' : '공지 목록'}</h2>
              <p>
                {totalItems.toLocaleString()}건 · {filterSummary}
              </p>
            </div>
          </div>
        )}

        <section className={styles.requestList}>
          {visibleRequests.length === 0 ? (
            <div className={styles.emptyBox}>
              {isGlobalAdmin ? '조건에 맞는 문의가 없습니다.' : '등록된 문의가 없습니다.'}
            </div>
          ) : (
            visibleRequests.map((request) => {
              const isExpanded = expandedRequestIds.has(request.id);
              const timelineMessages = getTimelineMessages(request);
              const messageCount = timelineMessages.length || 1;
              const requestPreview = request.content;
              const latestMessage =
                timelineMessages[timelineMessages.length - 1] ?? null;
              const lastActivityAt =
                latestMessage?.createdAt ?? request.updatedAt;

              return (
              <article
                key={request.id}
                className={`${styles.requestCard} ${
                  isExpanded ? '' : styles.requestCardCollapsed
                } ${request.isGlobalNotice ? styles.noticeCard : ''}`}
              >
                <div className={styles.requestMain}>
                  <div className={styles.requestHeader}>
                    <div className={styles.requestTitleBlock}>
                      <div className={styles.badgeRow}>
                        <span className={styles.typeBadge}>
                          {request.isGlobalNotice
                            ? '전체 공지'
                            : typeLabelMap[request.type]}
                        </span>
                        {!request.isGlobalNotice && (
                          <span
                            className={`${styles.statusBadge} ${
                              styles[`status_${request.status}`]
                            }`}
                          >
                            {statusLabelMap[request.status]}
                          </span>
                        )}
                      </div>
                      <h2>{request.title}</h2>
                      <p className={styles.requestPreview}>
                        {requestPreview}
                      </p>
                    </div>

                    <div className={styles.requestSide}>
                      <div className={styles.requestMeta}>
                        <span>
                          {request.isGlobalNotice
                            ? '모든 캠퍼스 관리자'
                            : `${request.district} / ${request.team} / ${request.campus}`}
                        </span>
                        <span>{formatDateTime(request.createdAt)}</span>
                        {!request.isGlobalNotice && (
                          <span>최근 활동 {formatDateTime(lastActivityAt)}</span>
                        )}
                      </div>

                      <button
                        type="button"
                        className={styles.conversationToggle}
                        onClick={() => toggleRequestExpanded(request.id)}
                        aria-expanded={isExpanded}
                      >
                        <span>
                          {isExpanded
                            ? '접기'
                            : request.isGlobalNotice
                              ? '공지 보기'
                              : '대화 보기'}
                        </span>
                        {!request.isGlobalNotice && (
                          <strong>{messageCount}개</strong>
                        )}
                        {isExpanded ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className={styles.conversationPanel}>
                  <div className={styles.messageTimeline}>
                    {(timelineMessages.length > 0
                      ? timelineMessages
                      : [
                          {
                            id: `${request.id}-content`,
                            requestId: request.id,
                            senderId: request.createdBy,
                            senderRole: request.isGlobalNotice
                              ? ('global_admin' as const)
                              : ('campus_admin' as const),
                            message: request.content,
                            createdAt: request.createdAt,
                          },
                        ]
                    ).map((message) => {
                      const canManageMessage =
                        !request.isGlobalNotice &&
                        !message.id.startsWith(`${request.id}-`) &&
                        (isGlobalAdmin || message.senderId === currentUserId);
                      const isEditing = editingMessageId === message.id;

                      return (
                        <div
                          key={message.id}
                          className={`${styles.messageItem} ${
                            message.senderRole === 'global_admin'
                              ? styles.messageGlobal
                              : styles.messageCampus
                          }`}
                        >
                          <div className={styles.messageMeta}>
                            <strong>
                              {message.senderRole === 'global_admin'
                                ? '본부'
                                : '캠퍼스'}
                            </strong>
                            <span>{formatDateTime(message.createdAt)}</span>
                          </div>

                          {isEditing ? (
                            <div className={styles.messageEditBox}>
                              <textarea
                                value={editingMessageDraft}
                                onChange={(event) =>
                                  setEditingMessageDraft(event.target.value)
                                }
                                rows={3}
                              />
                              <div className={styles.inlineActions}>
                                <button
                                  type="button"
                                  className={styles.secondaryButton}
                                  onClick={cancelEditMessage}
                                  disabled={processingId === request.id}
                                >
                                  <X size={15} />
                                  취소
                                </button>
                                <button
                                  type="button"
                                  className={styles.primaryButton}
                                  onClick={() => handleUpdateMessage(request)}
                                  disabled={processingId === request.id}
                                >
                                  <Save size={15} />
                                  저장
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className={styles.messageBody}>
                                {message.message}
                              </p>

                              {canManageMessage && (
                                <div className={styles.messageOwnerActions}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      startEditMessage(
                                        message.id,
                                        message.message
                                      )
                                    }
                                    disabled={processingId === request.id}
                                  >
                                    <Edit2 size={14} />
                                    수정
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteMessage(request, message.id)
                                    }
                                    disabled={processingId === request.id}
                                  >
                                    <Trash2 size={14} />
                                    삭제
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {!request.isGlobalNotice && (
                  <div className={styles.messageForm}>
                    <label className={styles.field}>
                      <span>답장</span>
                      <textarea
                        value={messageDrafts[request.id] || ''}
                        onChange={(event) =>
                          setMessageDrafts((prev) => ({
                            ...prev,
                            [request.id]: event.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="추가 확인이 필요한 내용을 메시지로 남겨주세요."
                      />
                    </label>

                    <div className={styles.messageActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleSendMessage(request)}
                        disabled={processingId === request.id}
                      >
                        <Send size={16} />
                        {processingId === request.id
                          ? '전송 중...'
                          : '메시지 보내기'}
                      </button>
                    </div>
                  </div>
                  )}
                    </div>
                  )}
                </div>

                {isGlobalAdmin && isExpanded && !request.isGlobalNotice && (
                  <div className={styles.adminPanel}>
                    <label className={styles.field}>
                      <span>처리 상태</span>
                      <select
                        value={statusDrafts[request.id] || request.status}
                        onChange={(event) =>
                          setStatusDrafts((prev) => ({
                            ...prev,
                            [request.id]: event.target
                              .value as CampusRequestStatus,
                          }))
                        }
                      >
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>본부 답변</span>
                      <textarea
                        value={responseDrafts[request.id] || ''}
                        onChange={(event) =>
                          setResponseDrafts((prev) => ({
                            ...prev,
                            [request.id]: event.target.value,
                          }))
                        }
                        rows={4}
                        placeholder="처리 내용이나 안내 사항을 남겨주세요."
                      />
                    </label>

                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => handleUpdateRequest(request)}
                      disabled={processingId === request.id}
                    >
                      <Save size={16} />
                      {processingId === request.id ? '저장 중...' : '처리 저장'}
                    </button>
                  </div>
                )}
              </article>
              );
            })
          )}
        </section>
        {totalItems > PAGE_SIZE && (
          <nav className={styles.pagination} aria-label="문의 목록 페이지">
            <span>
              {(page - 1) * PAGE_SIZE + 1}-
              {Math.min(page * PAGE_SIZE, totalItems)} /{' '}
              {totalItems.toLocaleString()}건
            </span>
            <div>
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                aria-label="이전 페이지"
              >
                <ChevronLeft size={16} />
              </button>
              <strong>
                {page} / {totalPages}
              </strong>
              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={page === totalPages}
                aria-label="다음 페이지"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </nav>
        )}
      </main>
    </div>
  );
};

export default AdminCampusRequestsPage;
