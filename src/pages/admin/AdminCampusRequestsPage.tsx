import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Edit2,
  History,
  House,
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
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAdminAuth } from '../../components/AdminAuthProvider';
import AdminHeader from './AdminHeader';
import {
  createCampusRequest,
  createGlobalCampusNotice,
  createCampusRequestMessage,
  deleteCampusRequestMessage,
  getCampusRequestSummary,
  getCampusRequestAuditLogs,
  getCampusRequestsPage,
  getCampusTransferStats,
  getGlobalCampusNotices,
  getUnreadCampusRequestIds,
  markCampusRequestRead,
  updateGlobalCampusNotice,
  updateCampusRequestMessage,
  updateCampusRequestStatus,
  type AdminRole,
  type CampusRequest,
  type CampusRequestAuditLog,
  type CampusRequestStatus,
  type CampusRequestType,
  type CampusRequestSummary,
  type CampusNoticeTarget,
  type CampusTransferStat,
} from '../../lib/adminService';
import { supabase } from '../../lib/supabase';
import { markCampusNoticesRead } from '../../lib/adminNoticeReadState';
import HomeAnnouncementManager from './HomeAnnouncementManager';

import styles from './AdminCampusRequestsPage.module.css';

const requestTypeOptions: Array<{
  value: CampusRequestType;
  label: string;
}> = [
  { value: 'notice', label: '전체 공지' },
  { value: 'late_signup', label: '추가 신청' },
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

const auditActionLabelMap = {
  status_changed: '처리 상태 변경',
  response_changed: '본부 답변 변경',
  message_updated: '메시지 수정',
  message_deleted: '메시지 삭제',
} as const;

const campusRequestTypeOptions = requestTypeOptions.filter(
  (option) => option.value !== 'notice'
);
const PAGE_SIZE = 15;
type GlobalAdminTab = 'requests' | 'notices' | 'home';
type NoticeAudienceMode = 'all' | 'unpaid' | 'custom';

const getCampusTargetKey = (target: CampusNoticeTarget) =>
  `${target.district}\u0000${target.team}\u0000${target.campus}`;

const emptySummary: CampusRequestSummary = {
  total: 0,
  notices: 0,
  unresolved: 0,
  open: 0,
  inProgress: 0,
  resolved: 0,
  onHold: 0,
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
  [...messages].sort((a, b) => {
    const createdAtDifference =
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

    return createdAtDifference || a.id.localeCompare(b.id);
  });

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, adminRole: activeAdminRole } = useAdminAuth();
  const [loading, setLoading] = useState(() => searchParams.get('tab') !== 'home');
  const adminRole = activeAdminRole;
  const [requests, setRequests] = useState<CampusRequest[]>([]);
  const [typeInput, setTypeInput] = useState<CampusRequestType>('late_signup');
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');
  const [noticeTitleInput, setNoticeTitleInput] = useState('');
  const [noticeContentInput, setNoticeContentInput] = useState('');
  const requestedTab = searchParams.get('tab');
  const globalAdminTab: GlobalAdminTab =
    requestedTab === 'notices' || requestedTab === 'home'
      ? requestedTab
      : 'requests';
  const [isNoticeFormOpen, setIsNoticeFormOpen] = useState(false);
  const [campusTargets, setCampusTargets] = useState<CampusTransferStat[]>([]);
  const [noticeAudienceMode, setNoticeAudienceMode] =
    useState<NoticeAudienceMode>('all');
  const [selectedCampusTargetKeys, setSelectedCampusTargetKeys] = useState<
    Set<string>
  >(() => new Set());
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
  const currentUserId = session?.user.id ?? null;
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<string>>(
    () => new Set()
  );
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [summary, setSummary] = useState<CampusRequestSummary>(emptySummary);
  const [debouncedSearchKeyword, setDebouncedSearchKeyword] = useState('');
  const [unreadRequestIds, setUnreadRequestIds] = useState<Set<string>>(
    () => new Set()
  );
  const [auditLogsByRequest, setAuditLogsByRequest] = useState<
    Record<string, CampusRequestAuditLog[]>
  >({});

  const isGlobalAdmin = adminRole?.role === 'global_admin';
  const isCampusAdmin = adminRole?.role === 'campus_admin';
  const hasUnsavedBoardDrafts =
    Boolean(titleInput.trim()) ||
    Boolean(contentInput.trim()) ||
    Boolean(noticeTitleInput.trim()) ||
    Boolean(noticeContentInput.trim()) ||
    Object.values(messageDrafts).some((draft) => Boolean(draft.trim())) ||
    Object.entries(responseDrafts).some(([requestId, draft]) => {
      const request = requests.find((item) => item.id === requestId);
      return draft.trim() !== (request?.adminResponse?.trim() ?? '');
    });

  const handleGlobalTabChange = (tab: GlobalAdminTab) => {
    setSearchParams(tab === 'requests' ? {} : { tab });
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
        if (isGlobalAdmin) {
          void getCampusRequestAuditLogs(requestId)
            .then((logs) =>
              setAuditLogsByRequest((current) => ({
                ...current,
                [requestId]: logs,
              }))
            )
            .catch((error) => console.error('문의 변경 이력 조회 실패:', error));
        }
      }

      return next;
    });

    if (unreadRequestIds.has(requestId)) {
      void markCampusRequestRead(requestId)
        .then(() => {
          setUnreadRequestIds((current) => {
            const next = new Set(current);
            next.delete(requestId);
            return next;
          });
        })
        .catch((error) => console.error('문의 읽음 처리 실패:', error));
    }
  };

  const loadRequests = async (role: AdminRole, targetPage = page) => {
    const [pageResult, noticeResult] = await Promise.all([
      getCampusRequestsPage(role, {
        page: targetPage,
        pageSize: PAGE_SIZE,
        kind:
          role.role === 'global_admin' && globalAdminTab === 'notices'
            ? 'notices'
            : 'requests',
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
    if (role.role !== 'global_admin') return;
    setSummary(await getCampusRequestSummary());
  };

  const loadUnreadRequests = async () => {
    setUnreadRequestIds(await getUnreadCampusRequestIds());
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchKeyword(searchKeyword);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchKeyword]);

  useEffect(() => {
    if (!adminRole) return;

    if (adminRole.role === 'global_admin' && globalAdminTab === 'home') {
      return;
    }

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
    void getCampusTransferStats()
      .then(setCampusTargets)
      .catch((error) => console.error('공지 대상 캠퍼스 조회 실패:', error));
  }, [adminRole]);

  useEffect(() => {
    if (!adminRole) return;

    // Unread state is synchronized from Supabase when the active role changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUnreadRequests().catch((error) => {
      console.error('읽지 않은 문의 조회 실패:', error);
    });

    let realtimeSyncTimerId: number | null = null;
    let shouldLoadSummary = false;
    const scheduleRealtimeSync = (includeSummary: boolean) => {
      shouldLoadSummary ||= includeSummary;
      if (realtimeSyncTimerId !== null) {
        window.clearTimeout(realtimeSyncTimerId);
      }
      realtimeSyncTimerId = window.setTimeout(() => {
        realtimeSyncTimerId = null;
        void loadRequests(adminRole);
        void loadUnreadRequests();
        if (shouldLoadSummary) void loadSummary(adminRole);
        shouldLoadSummary = false;
      }, 250);
    };

    const channel = supabase
      .channel(`campus-request-board-${adminRole.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campus_requests' },
        () => {
          if (
            document.visibilityState !== 'visible' ||
            processingId ||
            submitting ||
            hasUnsavedBoardDrafts
          ) return;
          scheduleRealtimeSync(adminRole.role === 'global_admin');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campus_request_messages' },
        () => {
          if (
            document.visibilityState !== 'visible' ||
            processingId ||
            submitting ||
            editingMessageId ||
            hasUnsavedBoardDrafts
          ) return;
          scheduleRealtimeSync(false);
        }
      )
      .subscribe();

    return () => {
      if (realtimeSyncTimerId !== null) {
        window.clearTimeout(realtimeSyncTimerId);
      }
      void supabase.removeChannel(channel);
    };
    // The current board state is intentionally read by realtime callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    adminRole,
    editingMessageId,
    hasUnsavedBoardDrafts,
    processingId,
    submitting,
  ]);

  const selectedNoticeTargets = useMemo<CampusNoticeTarget[]>(() => {
    const availableTargets = campusTargets.map(({ district, team, campus }) => ({
      district,
      team,
      campus,
    }));

    if (noticeAudienceMode === 'all') return availableTargets;
    if (noticeAudienceMode === 'unpaid') {
      return campusTargets
        .filter((target) => target.status === 'pending')
        .map(({ district, team, campus }) => ({ district, team, campus }));
    }
    return availableTargets.filter((target) =>
      selectedCampusTargetKeys.has(getCampusTargetKey(target))
    );
  }, [campusTargets, noticeAudienceMode, selectedCampusTargetKeys]);

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

    if (selectedNoticeTargets.length === 0) {
      alert('공지를 받을 캠퍼스를 한 곳 이상 선택해주세요.');
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
        targets: selectedNoticeTargets,
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

  const handleArchiveGlobalNotice = async (notice: CampusRequest) => {
    if (!window.confirm('이 공지를 보관할까요? 대상 캠퍼스에서는 더 이상 보이지 않습니다.')) return;
    setProcessingId(notice.id);
    try {
      const updated = await updateGlobalCampusNotice({
        noticeId: notice.id,
        title: notice.title,
        content: notice.content,
        targets: notice.noticeTargets,
        archived: true,
      });
      setRequests((current) =>
        current.map((item) => (item.id === notice.id ? updated : item))
      );
    } catch (error) {
      alert(`공지를 보관하지 못했습니다: ${getErrorMessage(error)}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleEditGlobalNotice = async (notice: CampusRequest) => {
    const title = window.prompt('공지 제목', notice.title)?.trim();
    if (!title) return;
    const content = window.prompt('공지 내용', notice.content)?.trim();
    if (!content) return;
    setProcessingId(notice.id);
    try {
      const updated = await updateGlobalCampusNotice({
        noticeId: notice.id,
        title,
        content,
        targets: notice.noticeTargets,
        archived: false,
      });
      setRequests((current) =>
        current.map((item) => (item.id === notice.id ? updated : item))
      );
      alert('공지를 수정했습니다. 대상 캠퍼스에 새 공지로 다시 알립니다.');
    } catch (error) {
      alert(`공지를 수정하지 못했습니다: ${getErrorMessage(error)}`);
    } finally {
      setProcessingId(null);
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
    const hasGlobalResponse =
      Boolean(nextResponse.trim()) ||
      request.messages.some((message) => message.senderRole === 'global_admin');

    if (nextStatus === 'resolved' && !hasGlobalResponse) {
      alert('문의 완료 처리 전에 본부 답변을 입력해주세요.');
      return;
    }

    setProcessingId(request.id);

    try {
      const { request: updatedRequest, message: createdResponseMessage } =
        await updateCampusRequestStatus({
          requestId: request.id,
          status: nextStatus,
          adminResponse: nextResponse,
        });

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

  const globalSectionContent = {
    requests: {
      eyebrow: '문의 운영',
      title: '문의 처리',
      description:
        '신청 마감 이후 추가 신청, 입금 오류, 명단 수정 요청을 확인하고 처리합니다.',
    },
    notices: {
      eyebrow: '캠퍼스 커뮤니케이션',
      title: '캠퍼스 공지',
      description:
        '전체 또는 선택한 캠퍼스 회계 순장님에게 전달할 운영 공지를 작성하고 관리합니다.',
    },
    home: {
      eyebrow: '사용자 커뮤니케이션',
      title: '홈 화면 공지',
      description:
        '일반 사용자의 홈 화면에 표시되는 안내와 중요 공지를 관리합니다.',
    },
  } satisfies Record<
    GlobalAdminTab,
    { eyebrow: string; title: string; description: string }
  >;
  const activeGlobalSection = globalSectionContent[globalAdminTab];

  const renderGlobalSectionNav = () => (
    <nav className={styles.globalSectionNav} aria-label="공지·문의 관리 메뉴">
      <button
        type="button"
        className={globalAdminTab === 'requests' ? styles.globalSectionActive : ''}
        onClick={() => handleGlobalTabChange('requests')}
        aria-current={globalAdminTab === 'requests' ? 'page' : undefined}
      >
        <span className={styles.globalSectionIcon}>
          <MessageSquare size={18} />
        </span>
        <span className={styles.globalSectionCopy}>
          <strong>문의 처리</strong>
          <small>접수된 요청을 확인하고 답변합니다.</small>
        </span>
        <em className={summary.unresolved > 0 ? styles.attentionCount : ''}>
          {summary.unresolved}
        </em>
      </button>

      <button
        type="button"
        className={globalAdminTab === 'notices' ? styles.globalSectionActive : ''}
        onClick={() => handleGlobalTabChange('notices')}
        aria-current={globalAdminTab === 'notices' ? 'page' : undefined}
      >
        <span className={styles.globalSectionIcon}>
          <Megaphone size={18} />
        </span>
        <span className={styles.globalSectionCopy}>
          <strong>캠퍼스 공지</strong>
          <small>캠퍼스 회계 순장님 대상 공지를 관리합니다.</small>
        </span>
        <em>{summary.notices}</em>
      </button>

      <button
        type="button"
        className={globalAdminTab === 'home' ? styles.globalSectionActive : ''}
        onClick={() => handleGlobalTabChange('home')}
        aria-current={globalAdminTab === 'home' ? 'page' : undefined}
      >
        <span className={styles.globalSectionIcon}>
          <House size={18} />
        </span>
        <span className={styles.globalSectionCopy}>
          <strong>홈 화면 공지</strong>
          <small>일반 사용자 대상 공지를 관리합니다.</small>
        </span>
      </button>

      <button
        type="button"
        onClick={() => navigate('/admin/communications/personal')}
      >
        <span className={styles.globalSectionIcon}>
          <MessageSquare size={18} />
        </span>
        <span className={styles.globalSectionCopy}>
          <strong>개인 문의</strong>
          <small>개인 사용자의 문의를 확인하고 답변합니다.</small>
        </span>
      </button>
    </nav>
  );

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

  if (isGlobalAdmin && globalAdminTab === 'home') {
    return (
      <div className={styles.page}>
        <AdminHeader />

        <main className={styles.main}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/admin/dashboard')}
          >
            <ArrowLeft size={18} />
            전체 관리자 화면
          </button>

          <section className={styles.headerSection}>
            <div>
              <p className={styles.eyebrow}>{activeGlobalSection.eyebrow}</p>
              <h1 className={styles.title}>{activeGlobalSection.title}</h1>
              <p className={styles.description}>{activeGlobalSection.description}</p>
            </div>

            <div className={styles.scopeBadge}>
              <MessageSquare size={18} />
              전체 관리자
            </div>
          </section>

          {renderGlobalSectionNav()}

          <HomeAnnouncementManager />
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
            navigate(isGlobalAdmin ? '/admin/dashboard' : '/admin/campus-dashboard')
          }
        >
          <ArrowLeft size={18} />
          {isGlobalAdmin ? '전체 관리자 화면' : '캠퍼스 회계 순장님 화면'}
        </button>

        <section className={styles.headerSection}>
          <div>
            <p className={styles.eyebrow}>
              {isGlobalAdmin ? activeGlobalSection.eyebrow : '본부 공지와 문의'}
            </p>
            <h1 className={styles.title}>
              {isGlobalAdmin ? activeGlobalSection.title : '본부 공지와 문의'}
            </h1>
            <p className={styles.description}>
              {isGlobalAdmin
                ? activeGlobalSection.description
                : '본부 공지를 확인하고, 추가 신청이나 입금 오류처럼 본부 확인이 필요한 문의를 남깁니다.'}
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
          renderGlobalSectionNav()
        )}

        {isGlobalAdmin && globalAdminTab === 'requests' && (
          <section className={styles.summaryGrid}>
            <button type="button" className={styles.summaryCard} onClick={() => setStatusFilter('all')}>
              <span>전체 문의</span>
              <strong>{summary.total}</strong>
            </button>
            <button type="button" className={styles.summaryCard} onClick={() => setStatusFilter('open')}>
              <span>접수</span>
              <strong>{summary.open}</strong>
            </button>
            <button type="button" className={styles.summaryCard} onClick={() => setStatusFilter('in_progress')}>
              <span>처리 중</span>
              <strong>{summary.inProgress}</strong>
            </button>
            <button type="button" className={styles.summaryCard} onClick={() => setStatusFilter('resolved')}>
              <span>완료</span>
              <strong>{summary.resolved}</strong>
            </button>
            <button type="button" className={styles.summaryCard} onClick={() => setStatusFilter('on_hold')}>
              <span>보류</span>
              <strong>{summary.onHold}</strong>
            </button>
          </section>
        )}

        {isGlobalAdmin && globalAdminTab === 'notices' && (
          <section className={`${styles.writePanel} ${styles.noticeWritePanel}`}>
            <div className={styles.noticeComposerHeader}>
              <div className={styles.sectionHeader}>
                <h2>전체 캠퍼스 공지</h2>
                <p>
                  등록한 공지는 모든 캠퍼스 회계 순장님 홈과 문의 게시판에 표시됩니다.
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
                    placeholder="캠퍼스 회계 순장님에게 일괄 안내할 내용을 입력해주세요."
                    rows={5}
                  />
                </label>

                <div className={styles.audiencePanel}>
                  <div className={styles.sectionHeader}>
                    <h2>발송 대상</h2>
                    <p>선택 결과는 발송 시점의 캠퍼스 목록으로 확정됩니다.</p>
                  </div>
                  <div className={styles.audienceModes}>
                    <button type="button" className={noticeAudienceMode === 'all' ? styles.audienceModeActive : ''} onClick={() => setNoticeAudienceMode('all')}>
                      전체 캠퍼스
                    </button>
                    <button type="button" className={noticeAudienceMode === 'unpaid' ? styles.audienceModeActive : ''} onClick={() => setNoticeAudienceMode('unpaid')}>
                      미송금 캠퍼스
                    </button>
                    <button type="button" className={noticeAudienceMode === 'custom' ? styles.audienceModeActive : ''} onClick={() => setNoticeAudienceMode('custom')}>
                      직접 선택
                    </button>
                  </div>
                  <strong className={styles.audienceCount}>
                    선택된 캠퍼스 {selectedNoticeTargets.length}곳
                  </strong>
                  {noticeAudienceMode === 'custom' && (
                    <div className={styles.campusTargetList}>
                      {campusTargets.map((target) => {
                        const targetKey = getCampusTargetKey(target);
                        return (
                          <label key={targetKey}>
                            <input
                              type="checkbox"
                              checked={selectedCampusTargetKeys.has(targetKey)}
                              onChange={(event) =>
                                setSelectedCampusTargetKeys((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) next.add(targetKey);
                                  else next.delete(targetKey);
                                  return next;
                                })
                              }
                            />
                            <span>{target.district} / {target.team} / {target.campus}</span>
                            <em>{target.status === 'pending' ? '미송금' : target.status === 'sent' ? '송금 보고' : '입금 확인'}</em>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

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
              const isUnread = unreadRequestIds.has(request.id);
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
                } ${request.isGlobalNotice ? styles.noticeCard : ''} ${
                  isUnread ? styles.unreadRequestCard : ''
                }`}
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
                        {isUnread && (
                          <span className={styles.unreadBadge}>새 답변</span>
                        )}
                      </div>
                      <h2>{request.title}</h2>
                      <p className={styles.requestPreview}>
                        {requestPreview}
                      </p>
                      {request.isGlobalNotice && (
                        <p className={styles.targetSummary}>
                          발송 대상 {request.noticeTargets.length}개 캠퍼스
                          {request.isArchived ? ' · 보관됨' : ''}
                        </p>
                      )}
                    </div>

                    <div className={styles.requestSide}>
                      <div className={styles.requestMeta}>
                        <span>
                          {request.isGlobalNotice
                            ? '모든 캠퍼스 회계 순장님'
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
                      const isOriginalRequestMessage =
                        !request.isGlobalNotice &&
                        request.messages[0]?.id === message.id;
                      const canManageMessage =
                        !request.isGlobalNotice &&
                        !isOriginalRequestMessage &&
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
                            {isOriginalRequestMessage && (
                              <span className={styles.originalMessageBadge}>
                                최초 문의 내용
                              </span>
                            )}
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
                  {isGlobalAdmin && request.isGlobalNotice && (
                    <div className={styles.noticeManageActions}>
                      <button type="button" className={styles.secondaryButton} disabled={processingId === request.id} onClick={() => void handleEditGlobalNotice(request)}>
                        <Edit2 size={15} />
                        수정 후 재알림
                      </button>
                      <button type="button" className={styles.secondaryButton} disabled={processingId === request.id || request.isArchived} onClick={() => void handleArchiveGlobalNotice(request)}>
                        <Archive size={15} />
                        보관
                      </button>
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

                    <details className={styles.auditPanel}>
                      <summary>
                        <History size={15} />
                        변경 이력
                      </summary>
                      <div className={styles.auditList}>
                        {(auditLogsByRequest[request.id] ?? []).length === 0 ? (
                          <p>기록된 변경 이력이 없습니다.</p>
                        ) : (
                          (auditLogsByRequest[request.id] ?? []).map((log) => (
                            <div key={log.id} className={styles.auditItem}>
                              <strong>{auditActionLabelMap[log.action]}</strong>
                              <time dateTime={log.createdAt}>
                                {formatDateTime(log.createdAt)}
                              </time>
                            </div>
                          ))
                        )}
                      </div>
                    </details>
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
