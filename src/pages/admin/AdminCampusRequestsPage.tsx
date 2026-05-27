import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Edit2,
  MessageSquare,
  RefreshCw,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Header from '../../components/Header';
import {
  createCampusRequest,
  createCampusRequestMessage,
  deleteCampusRequestMessage,
  getAdminRole,
  getCampusRequests,
  updateCampusRequestMessage,
  updateCampusRequestStatus,
  type AdminRole,
  type CampusRequest,
  type CampusRequestStatus,
  type CampusRequestType,
} from '../../lib/adminService';
import { supabase } from '../../lib/supabase';

import styles from './AdminCampusRequestsPage.module.css';

const requestTypeOptions: Array<{
  value: CampusRequestType;
  label: string;
}> = [
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

  const isGlobalAdmin = adminRole?.role === 'global_admin';
  const isCampusAdmin = adminRole?.role === 'campus_admin';

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

  const loadRequests = async (role: AdminRole) => {
    const nextRequests = await getCampusRequests(role);

    setRequests(nextRequests);
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
  };

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

        const nextRequests = await getCampusRequests(role);

        if (!isMounted) return;

        setAdminRole(role);
        setRequests(nextRequests);
        setStatusDrafts(
          Object.fromEntries(
            nextRequests.map((request) => [request.id, request.status])
          )
        );
        setResponseDrafts(
          Object.fromEntries(
            nextRequests.map((request) => [
              request.id,
              request.adminResponse || '',
            ])
          )
        );
        setMessageDrafts(
          Object.fromEntries(nextRequests.map((request) => [request.id, '']))
        );
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

  const summary = useMemo(() => {
    const unresolved = requests.filter(
      (request) => request.status !== 'resolved'
    ).length;
    return {
      total: requests.length,
      unresolved,
      open: requests.filter((request) => request.status === 'open').length,
      resolved: requests.filter((request) => request.status === 'resolved')
        .length,
    };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    if (!isGlobalAdmin) return requests;

    const keyword = searchKeyword.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesStatus =
        statusFilter === 'all' || request.status === statusFilter;
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
        matchesStatus &&
        matchesType &&
        (!keyword || searchTarget.includes(keyword))
      );
    });
  }, [isGlobalAdmin, requests, searchKeyword, statusFilter, typeFilter]);

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
        <Header />
        <main className={styles.main}>
          <p>로딩 중...</p>
        </main>
      </div>
    );
  }

  if (!adminRole) {
    return (
      <div className={styles.page}>
        <Header />
        <main className={styles.main}>
          <p>관리자만 접근할 수 있습니다.</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Header />

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
            <p className={styles.eyebrow}>마감 후 문의 관리</p>
            <h1 className={styles.title}>캠퍼스 문의 게시판</h1>
            <p className={styles.description}>
              신청 마감 이후 추가 신청, 환불, 입금 오류, 명단 수정 같은
              요청을 한 곳에서 기록하고 처리합니다.
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
          <section className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <span>전체 문의</span>
              <strong>{summary.total}</strong>
            </div>
            <div className={styles.summaryCard}>
              <span>미완료</span>
              <strong>{summary.unresolved}</strong>
            </div>
            <div className={styles.summaryCard}>
              <span>접수</span>
              <strong>{summary.open}</strong>
            </div>
            <div className={styles.summaryCard}>
              <span>완료</span>
              <strong>{summary.resolved}</strong>
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
                  {requestTypeOptions.map((option) => (
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
          <section className={styles.filterPanel}>
            <div className={styles.filterTitle}>
              <SlidersHorizontal size={17} />
              <span>목록 필터</span>
            </div>

            <div className={styles.searchBox}>
              <Search size={18} />
              <input
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                placeholder="캠퍼스, 제목, 내용 검색"
              />
            </div>

            <select
              className={styles.select}
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as CampusRequestStatus | 'all'
                )
              }
            >
              <option value="all">전체 상태</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className={styles.select}
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as CampusRequestType | 'all')
              }
            >
              <option value="all">전체 유형</option>
              {requestTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void loadRequests(adminRole)}
            >
              <RefreshCw size={16} />
              새로고침
            </button>
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

        <section className={styles.requestList}>
          {filteredRequests.length === 0 ? (
            <div className={styles.emptyBox}>
              {isGlobalAdmin ? '조건에 맞는 문의가 없습니다.' : '등록된 문의가 없습니다.'}
            </div>
          ) : (
            filteredRequests.map((request) => {
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
                }`}
              >
                <div className={styles.requestMain}>
                  <div className={styles.requestHeader}>
                    <div className={styles.requestTitleBlock}>
                      <div className={styles.badgeRow}>
                        <span className={styles.typeBadge}>
                          {typeLabelMap[request.type]}
                        </span>
                        <span
                          className={`${styles.statusBadge} ${
                            styles[`status_${request.status}`]
                          }`}
                        >
                          {statusLabelMap[request.status]}
                        </span>
                      </div>
                      <h2>{request.title}</h2>
                      <p className={styles.requestPreview}>
                        {requestPreview}
                      </p>
                    </div>

                    <div className={styles.requestSide}>
                      <div className={styles.requestMeta}>
                        <span>
                          {request.district} / {request.team} / {request.campus}
                        </span>
                        <span>{formatDateTime(request.createdAt)}</span>
                        <span>최근 활동 {formatDateTime(lastActivityAt)}</span>
                      </div>

                      <button
                        type="button"
                        className={styles.conversationToggle}
                        onClick={() => toggleRequestExpanded(request.id)}
                        aria-expanded={isExpanded}
                      >
                        <span>{isExpanded ? '접기' : '대화 보기'}</span>
                        <strong>{messageCount}개</strong>
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
                            senderRole: 'campus_admin' as const,
                            message: request.content,
                            createdAt: request.createdAt,
                          },
                        ]
                    ).map((message) => {
                      const canManageMessage =
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
                    </div>
                  )}
                </div>

                {isGlobalAdmin && isExpanded && (
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
      </main>
    </div>
  );
};

export default AdminCampusRequestsPage;
