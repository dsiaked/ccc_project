import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Clipboard,
  KeyRound,
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
  const [issueCount, setIssueCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
    if (role === 'campus_admin' && !campusId) {
      setError('캠퍼스 회계 순장님 권한 등록 코드를 발급할 캠퍼스를 선택해주세요.');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const created = await createAdminInvitationCodes(
        role,
        role === 'campus_admin' ? campusId : null,
        role === 'boarding_manager' ? issueCount : 1
      );
      setCreatedInvitations(created);
      setMessage(
        `권한 등록 코드 ${created.length.toLocaleString()}개를 발급했습니다. 발급 내역에서도 원문을 확인하고 복사할 수 있습니다.`
      );
      await loadData();
    } catch (createError) {
      setError(getErrorMessage(createError, '권한 등록 코드를 발급하지 못했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (createdInvitations.length === 0) return;

    try {
      await navigator.clipboard.writeText(
        createdInvitations.map((invitation) => invitation.code).join('\n')
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

  const handleCancel = async (invitation: AdminInvitationCode) => {
    if (!window.confirm(`${invitation.code ?? invitation.codeHint} 권한 등록 코드를 취소할까요?`)) return;

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
    if (
      !window.confirm(
        '취소·만료된 코드와 사용 후 30일이 지난 코드를 삭제하고, 1년이 지난 권한 등록 코드 감사 로그를 정리할까요?'
      )
    ) {
      return;
    }

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
                  <code>{invitation.code}</code>
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
              전체 복사
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
                setIssueCount(1);
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
              value={role === 'boarding_manager' ? issueCount : 1}
              disabled={role !== 'boarding_manager'}
              onChange={(event) => {
                const nextCount = Math.trunc(Number(event.target.value));
                setIssueCount(Math.min(50, Math.max(1, nextCount || 1)));
              }}
            />
          </label>
          <button type="button" onClick={() => void handleCreate()} disabled={submitting}>
            <Plus size={17} />
            {submitting
              ? '발급하는 중...'
              : role === 'boarding_manager' && issueCount > 1
                ? `권한 등록 코드 ${issueCount.toLocaleString()}개 발급`
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
                  </div>
                  <div className={styles.meta}>
                    <span className={styles[invitation.status]}>
                      {statusLabels[invitation.status]}
                    </span>
                    <time dateTime={invitation.expiresAt}>
                      만료 {formatDateTime(invitation.expiresAt)}
                    </time>
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
    </div>
  );
};

export default AdminInvitationCodesPage;
