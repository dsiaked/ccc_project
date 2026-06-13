import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Clipboard,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { getCampusScopesForAdmin, type AdminCampusScope } from '../../lib/adminService';
import {
  cancelAdminInvitationCode,
  cleanupAdminInvitationCodes,
  createAllCampusAdminInvitationCodes,
  createAdminInvitationCodes,
  getAdminInvitationCodes,
  type AdminInvitationCode,
  type CreatedInvitationCode,
  type InvitationRole,
  type InvitationStatus,
} from '../../lib/invitationCodeService';
import AdminHeader from './AdminHeader';
import styles from './AdminInvitationCodesPage.module.css';

const statusLabels: Record<InvitationStatus, string> = {
  active: '사용 가능',
  used: '사용 완료',
  expired: '만료',
  cancelled: '취소',
};

const roleLabels: Record<InvitationRole, string> = {
  campus_admin: '캠퍼스 회계 순장님',
  boarding_manager: '탑승 관리 간사님',
};

const ALL_CAMPUSES_VALUE = 'all';

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return fallback;
};

const AdminInvitationCodesPage = () => {
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState<AdminInvitationCode[]>([]);
  const [campuses, setCampuses] = useState<AdminCampusScope[]>([]);
  const [role, setRole] = useState<InvitationRole>('campus_admin');
  const [campusId, setCampusId] = useState('');
  const [createdInvitations, setCreatedInvitations] = useState<CreatedInvitationCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const createInFlightRef = useRef(false);
  const invitationActionInFlightRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<
    | { mode: 'cancel'; invitation: AdminInvitationCode }
    | { mode: 'cleanup' }
    | null
  >(null);
  const [actionDialogError, setActionDialogError] = useState('');
  const [cleanupReferenceTime] = useState(() => Date.now());

  const campusNames = useMemo(
    () =>
      new Map(
        campuses.map((campus) => [
          campus.campusId,
          `${campus.district} / ${campus.team} / ${campus.campus}`,
        ])
      ),
    [campuses]
  );

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [nextInvitations, nextCampuses] = await Promise.all([
        getAdminInvitationCodes(),
        getCampusScopesForAdmin(),
      ]);
      setInvitations(nextInvitations);
      setCampuses(nextCampuses);
    } catch (loadError) {
      setError(getErrorMessage(loadError, '권한 등록 코드 목록을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const handleCreate = async () => {
    if (submitting || createInFlightRef.current) return;

    if (role === 'campus_admin' && !campusId) {
      setError('캠퍼스 회계 순장님 권한 등록 코드를 발급할 캠퍼스를 선택해주세요.');
      return;
    }

    createInFlightRef.current = true;
    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const isAllCampuses =
        role === 'campus_admin' && campusId === ALL_CAMPUSES_VALUE;
      const created = isAllCampuses
        ? await createAllCampusAdminInvitationCodes()
        : await createAdminInvitationCodes(
            role,
            role === 'campus_admin' ? campusId : null,
            1
          );
      setCreatedInvitations(created);
      setMessage(created.length === 0
        ? '모든 캠퍼스에 이미 회계 순장님 또는 사용 가능한 권한 등록 코드가 있습니다.'
        : isAllCampuses
          ? `기존 회계 순장님과 활성 코드가 있는 캠퍼스를 제외하고 권한 등록 코드 ${created.length.toLocaleString()}개를 발급했습니다.`
          : `권한 등록 코드 ${created.length.toLocaleString()}개를 발급했습니다. 발급 내역에서도 원문을 확인하고 복사할 수 있습니다.`);
      await loadData();
    } catch (createError) {
      setError(getErrorMessage(createError, '권한 등록 코드를 발급하지 못했습니다.'));
    } finally {
      createInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (createdInvitations.length === 0) return;

    try {
      await navigator.clipboard.writeText(
        createdInvitations
          .map((invitation) => {
            if (!invitation.campusId) return invitation.code;
            const campusName =
              campusNames.get(invitation.campusId) ?? invitation.campusId;
            return `${campusName}\t${invitation.code}`;
          })
          .join('\n')
      );
      setMessage(`권한 등록 코드 ${createdInvitations.length.toLocaleString()}개를 복사했습니다.`);
    } catch {
      setError('클립보드에 복사하지 못했습니다.');
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setError('');
      setMessage(`${code} 코드를 복사했습니다.`);
    } catch {
      setError('클립보드에 복사하지 못했습니다.');
    }
  };

  const handleCopyActive = async () => {
    const activeInvitations = invitations.filter(
      (inv) => inv.status === 'active' && inv.code
    );

    if (activeInvitations.length === 0) {
      setError('복사할 수 있는 활성 권한 등록 코드가 없습니다.');
      return;
    }

    try {
      await navigator.clipboard.writeText(
        activeInvitations
          .map((invitation) => {
            const roleLabel = roleLabels[invitation.role];
            if (invitation.role === 'campus_admin' && invitation.campusId) {
              const campusName =
                campusNames.get(invitation.campusId) ?? invitation.campusId;
              return `${campusName}\t${invitation.code}`;
            }
            return `${roleLabel}\t${invitation.code}`;
          })
          .join('\n')
      );
      setError('');
      setMessage(
        `사용 가능한 권한 등록 코드 ${activeInvitations.length.toLocaleString()}개를 복사했습니다.`
      );
    } catch {
      setError('클립보드에 복사하지 못했습니다.');
    }
  };

  const handleCancel = async (invitation: AdminInvitationCode) => {
    setActionDialogError('');
    setPendingAction({ mode: 'cancel', invitation });
    return;

    setActionId(invitation.id);
    setError('');
    setMessage('');

    try {
      const cancelled = await cancelAdminInvitationCode(invitation.id);
      if (!cancelled) throw new Error('이미 사용되었거나 만료된 코드입니다.');

      setMessage('권한 등록 코드를 취소했습니다.');
      await loadData();
    } catch (cancelError) {
      setError(getErrorMessage(cancelError, '권한 등록 코드를 취소하지 못했습니다.'));
    } finally {
      setActionId('');
    }
  };

  const handleCleanup = async () => {
    setActionDialogError('');
    setPendingAction({ mode: 'cleanup' });
    return;

    setActionId('cleanup');
    setError('');
    setMessage('');

    try {
      const result = await cleanupAdminInvitationCodes();
      setMessage(
        `권한 등록 코드 ${result.deletedInvitations.toLocaleString()}개와 감사 로그 ${result.deletedAuditLogs.toLocaleString()}개를 정리했습니다.`
      );
      await loadData();
    } catch (cleanupError) {
      setError(
        getErrorMessage(
          cleanupError,
          '지난 권한 등록 코드 기록을 정리하지 못했습니다.'
        )
      );
    } finally {
      setActionId('');
    }
  };

  const cleanupCandidateCount = useMemo(() => {
    const thirtyDaysAgo = cleanupReferenceTime - 30 * 24 * 60 * 60 * 1000;

    return invitations.filter(
      (invitation) =>
        invitation.status === 'cancelled' ||
        invitation.status === 'expired' ||
        (invitation.usedAt !== null &&
          new Date(invitation.usedAt).getTime() <= thirtyDaysAgo)
    ).length;
  }, [cleanupReferenceTime, invitations]);

  const confirmPendingAction = async () => {
    if (!pendingAction || actionId || invitationActionInFlightRef.current) return;

    const action = pendingAction;
    invitationActionInFlightRef.current = true;
    setActionId(action.mode === 'cancel' ? action.invitation.id : 'cleanup');
    setError('');
    setMessage('');
    setActionDialogError('');

    try {
      if (action.mode === 'cancel') {
        const cancelled = await cancelAdminInvitationCode(action.invitation.id);
        if (!cancelled) throw new Error('이미 사용하였거나 만료된 코드입니다.');
        setMessage('권한 등록 코드를 취소했습니다.');
      } else {
        const result = await cleanupAdminInvitationCodes();
        setMessage(
          `권한 등록 코드 ${result.deletedInvitations.toLocaleString()}개와 감사 로그 ${result.deletedAuditLogs.toLocaleString()}개를 정리했습니다.`
        );
      }
      await loadData();
      setPendingAction(null);
    } catch (actionError) {
      setActionDialogError(
        getErrorMessage(
          actionError,
          action.mode === 'cancel'
            ? '권한 등록 코드를 취소하지 못했습니다.'
            : '지난 권한 등록 코드 기록을 정리하지 못했습니다.'
        )
      );
    } finally {
      invitationActionInFlightRef.current = false;
      setActionId('');
    }
  };

  useEffect(() => {
    if (!pendingAction) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !actionId) setPendingAction(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actionId, pendingAction]);

  return (
    <div className={styles.page}>
      <AdminHeader />
      <main className={styles.main}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate('/admin/system')}
        >
          <ArrowLeft size={16} />
          관리자 도구
        </button>

        <section className={styles.hero}>
          <KeyRound size={30} />
          <div>
            <span>Global admin</span>
            <h1>권한 등록 코드 관리</h1>
            <p>캠퍼스 회계 순장님과 탑승 관리 간사님 권한용 일회성 권한 등록 코드를 발급하고 취소합니다.</p>
          </div>
          <button type="button" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw size={16} />
            새로고침
          </button>
        </section>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {message && <p className={styles.success} role="status">{message}</p>}

        {createdInvitations.length > 0 && (
          <section className={styles.createdCard}>
            <div>
              <strong>
                방금 발급한 권한 등록 코드 {createdInvitations.length.toLocaleString()}개
              </strong>
              <span>발급 내역에서도 원문을 다시 확인하고 복사할 수 있습니다.</span>
            </div>
            <div className={styles.createdCodes}>
              {createdInvitations.map((invitation) => (
                <div key={invitation.id} className={styles.createdCode}>
                  <div>
                    {invitation.campusId && (
                      <span>
                        {campusNames.get(invitation.campusId) ?? '캠퍼스 정보 없음'}
                      </span>
                    )}
                    <code>{invitation.code}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopyCode(invitation.code)}
                    aria-label={`${invitation.code} 복사`}
                  >
                    <Clipboard size={15} />
                    복사
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => void handleCopy()}>
              <Clipboard size={16} />
              {createdInvitations.some((invitation) => invitation.campusId)
                ? '캠퍼스명과 코드 전체 복사'
                : '전체 복사'}
            </button>
          </section>
        )}

        <section className={styles.issueCard}>
          <div>
            <h2>새 권한 등록 코드 발급</h2>
            <p>발급 후 14일 동안 한 번만 사용할 수 있습니다.</p>
          </div>
          <label>
            역할
            <select
              value={role}
              onChange={(event) => {
                const nextRole = event.target.value as InvitationRole;
                setRole(nextRole);
                setCreatedInvitations([]);
              }}
            >
              <option value="campus_admin">캠퍼스 회계 순장님</option>
              <option value="boarding_manager">탑승 관리 간사님</option>
            </select>
          </label>
          {role === 'campus_admin' && (
            <label>
              담당 캠퍼스
              <select value={campusId} onChange={(event) => setCampusId(event.target.value)}>
                <option value="">캠퍼스를 선택하세요</option>
                <option value={ALL_CAMPUSES_VALUE}>
                  모든 캠퍼스 일괄 발급 (기존 권한·코드 제외)
                </option>
                {campuses.map((campus) => (
                  <option key={campus.campusId} value={campus.campusId}>
                    {campusNames.get(campus.campusId)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            발급 개수
            <input
              type="number"
              min={1}
              max={50}
              value={
                role === 'boarding_manager'
                  ? 1
                  : campusId === ALL_CAMPUSES_VALUE
                    ? campuses.length
                    : 1
              }
              disabled={true}
            />
          </label>
          <button type="button" onClick={() => void handleCreate()} disabled={submitting}>
            <Plus size={17} />
            {submitting
              ? '발급하는 중...'
              : role === 'campus_admin' && campusId === ALL_CAMPUSES_VALUE
                ? '모든 캠퍼스 코드 일괄 발급'
                : '권한 등록 코드 발급'}
          </button>
        </section>

        <section className={styles.listCard}>
          <div className={styles.listHeader}>
            <div>
              <h2>발급 내역</h2>
              <p>새로 발급한 코드 원문을 확인하고 바로 복사할 수 있습니다.</p>
            </div>
            <div className={styles.listHeaderActions}>
              <strong>{invitations.length.toLocaleString()}개</strong>
              <button
                type="button"
                onClick={() => void handleCopyActive()}
                disabled={!invitations.some((inv) => inv.status === 'active' && inv.code)}
                title="사용 가능한 모든 권한 등록 코드를 복사합니다."
              >
                <Clipboard size={16} />
                사용 가능 코드 복사
              </button>
              <button
                type="button"
                onClick={() => void handleCleanup()}
                disabled={Boolean(actionId)}
              >
                <Trash2 size={16} />
                {actionId === 'cleanup' ? '정리하는 중...' : '지난 기록 정리'}
              </button>
            </div>
          </div>

          {loading ? (
            <p className={styles.empty}>권한 등록 코드 목록을 불러오는 중...</p>
          ) : invitations.length === 0 ? (
            <p className={styles.empty}>발급된 권한 등록 코드가 없습니다.</p>
          ) : (
            <div className={styles.list}>
              {invitations.map((invitation) => (
                <article key={invitation.id}>
                  <div>
                    <code>{invitation.code ?? invitation.codeHint}</code>
                    {!invitation.code && <small>기존 발급 코드라 원문을 복구할 수 없습니다.</small>}
                    <strong>{roleLabels[invitation.role]}</strong>
                    {invitation.campusId && (
                      <span>{campusNames.get(invitation.campusId) ?? '캠퍼스 정보 없음'}</span>
                    )}
                    {invitation.status === 'used' && (
                      <span className={styles.usedBy}>
                        사용자:{' '}
                        {invitation.usedByUser ? (
                          <>
                            <strong>{invitation.usedByUser.name || '이름 없음'}</strong>{' '}
                            <span>({invitation.usedByUser.email || '이메일 없음'})</span>
                            {invitation.usedByUser.phone && (
                              <span className={styles.usedByMeta}>
                                 • {invitation.usedByUser.phone}
                              </span>
                            )}
                            <span className={styles.usedByMeta}>
                               • {[
                                 invitation.usedByUser.district,
                                 invitation.usedByUser.team,
                                 invitation.usedByUser.campus,
                               ].filter(Boolean).join(' / ') || '소속 미등록'}
                            </span>
                          </>
                        ) : invitation.usedBy ? (
                          `ID: ${invitation.usedBy}`
                        ) : (
                          '정보 없음'
                        )}
                      </span>
                    )}
                  </div>
                  <div className={styles.meta}>
                    <span className={styles[invitation.status]}>
                      {statusLabels[invitation.status]}
                    </span>
                    {invitation.status === 'used' && invitation.usedAt ? (
                      <time dateTime={invitation.usedAt}>
                        사용 {formatDateTime(invitation.usedAt)}
                      </time>
                    ) : (
                      <time dateTime={invitation.expiresAt}>
                        만료 {formatDateTime(invitation.expiresAt)}
                      </time>
                    )}
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      onClick={() => invitation.code && void handleCopyCode(invitation.code)}
                      disabled={!invitation.code}
                      title={invitation.code ? '코드 복사' : '기존 코드 원문은 복구할 수 없습니다.'}
                    >
                      <Clipboard size={16} />
                      복사
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCancel(invitation)}
                      disabled={invitation.status !== 'active' || Boolean(actionId)}
                    >
                      <XCircle size={16} />
                      취소
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
      {pendingAction && (
        <div
          className={styles.actionBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !actionId) {
              setPendingAction(null);
            }
          }}
        >
          <section
            className={styles.actionDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invitation-action-dialog-title"
            aria-describedby="invitation-action-dialog-description"
          >
            <span className={styles.actionDialogIcon} aria-hidden="true">
              {pendingAction.mode === 'cancel' ? (
                <XCircle size={25} />
              ) : (
                <Trash2 size={25} />
              )}
            </span>
            <p className={styles.actionDialogEyebrow}>
              {pendingAction.mode === 'cancel'
                ? '활성 코드 취소'
                : '지난 기록 영구 정리'}
            </p>
            <h2 id="invitation-action-dialog-title">
              {pendingAction.mode === 'cancel'
                ? `${pendingAction.invitation.code ?? pendingAction.invitation.codeHint} 코드를 취소할까요?`
                : '지난 권한 등록 코드 기록을 정리할까요?'}
            </h2>
            <p id="invitation-action-dialog-description">
              {pendingAction.mode === 'cancel'
                ? '취소 즉시 이 코드는 권한 등록에 사용할 수 없게 됩니다. 코드 발급 기록은 목록과 감사 기록에 유지됩니다.'
                : '취소·만료된 코드, 사용 후 30일이 지난 코드와 1년이 지난 권한 등록 코드 감사 로그를 영구 삭제합니다.'}
            </p>
            {pendingAction.mode === 'cancel' ? (
              <div className={styles.actionSummary}>
                <div>
                  <span>등록 권한</span>
                  <strong>{roleLabels[pendingAction.invitation.role]}</strong>
                </div>
                <div>
                  <span>대상</span>
                  <strong>
                    {pendingAction.invitation.campusId
                      ? campusNames.get(pendingAction.invitation.campusId) ??
                        '캠퍼스 정보 없음'
                      : '전체 탑승 관리'}
                  </strong>
                </div>
                <div>
                  <span>만료 예정</span>
                  <strong>
                    {formatDateTime(pendingAction.invitation.expiresAt)}
                  </strong>
                </div>
              </div>
            ) : (
              <div className={styles.actionSummary}>
                <div>
                  <span>현재 목록 기준 삭제 예상</span>
                  <strong>{cleanupCandidateCount.toLocaleString()}개 코드</strong>
                </div>
                <div>
                  <span>삭제 대상 코드</span>
                  <strong>취소·만료 또는 사용 후 30일 경과</strong>
                </div>
                <div>
                  <span>감사 로그 보존</span>
                  <strong>최근 1년 기록 유지</strong>
                </div>
              </div>
            )}
            <div className={styles.actionNotice}>
              <AlertTriangle size={18} aria-hidden="true" />
              <span>
                {pendingAction.mode === 'cancel'
                  ? '취소한 코드는 다시 활성화할 수 없습니다. 필요하면 새 코드를 발급해야 합니다.'
                  : '정리된 코드와 1년이 지난 감사 로그는 복구할 수 없습니다. 실제 삭제 건수는 서버 실행 시점에 결정됩니다.'}
              </span>
            </div>
            {actionDialogError && (
              <p className={styles.actionDialogError} role="alert">
                {actionDialogError}
              </p>
            )}
            <footer className={styles.actionDialogActions}>
              <button
                type="button"
                autoFocus
                onClick={() => setPendingAction(null)}
                disabled={Boolean(actionId)}
              >
                현재 상태 유지
              </button>
              <button
                type="button"
                className={styles.actionSubmit}
                onClick={() => void confirmPendingAction()}
                disabled={Boolean(actionId)}
              >
                {actionId ? (
                  <>
                    <LoaderCircle className={styles.spinning} size={17} />
                    처리 중...
                  </>
                ) : pendingAction.mode === 'cancel' ? (
                  '코드 취소'
                ) : (
                  '지난 기록 영구 정리'
                )}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminInvitationCodesPage;
