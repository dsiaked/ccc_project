import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAdminAuth } from '../../components/AdminAuthProvider';
import {
  cancelCampusAdmin,
  getCampusAdminAssignments,
  getCampusScopesForAdmin,
  registerCampusAdmin,
  searchUsersForCampusManager,
  type AdminCampusScope,
  type AdminUserSearchResult,
  type CampusAdminAssignment,
} from '../../lib/adminService';
import AdminHeader from './AdminHeader';

import styles from './AdminCampusAdminManagePage.module.css';

const USER_PAGE_SIZE = 50;
const ALL_USERS_SCOPE: AdminCampusScope = {
  campusId: '',
  district: '',
  team: '',
  campus: '',
};
const scopeKey = (scope: Pick<AdminCampusScope, 'district' | 'team' | 'campus'>) =>
  `${scope.district}|${scope.team}|${scope.campus}`;
const managesSelectedCampus = (
  user: AdminUserSearchResult,
  campus: AdminCampusScope
) =>
  user.managedCampuses?.some(
    (managed) =>
      managed.district === campus.district &&
      managed.team === campus.team &&
      managed.campus === campus.campus
  ) ?? false;

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return String(record.message || record.details || record.hint || record.code);
  }
  return '알 수 없는 오류가 발생했습니다.';
};

const AdminCampusAdminManagePage = () => {
  const navigate = useNavigate();
  const { adminRole } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [campuses, setCampuses] = useState<AdminCampusScope[]>([]);
  const [assignments, setAssignments] = useState<CampusAdminAssignment[]>([]);
  const [campusQuery, setCampusQuery] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [target, setTarget] = useState<AdminCampusScope | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<AdminUserSearchResult[]>([]);
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const assignmentMap = useMemo(
    () => new Map(assignments.map((assignment) => [scopeKey(assignment), assignment])),
    [assignments]
  );
  const currentTargetAdmin = target ? assignmentMap.get(scopeKey(target)) ?? null : null;
  const unassignedCount = campuses.filter((campus) => !assignmentMap.has(scopeKey(campus))).length;
  const filteredCampuses = useMemo(() => {
    const query = campusQuery.trim().toLocaleLowerCase('ko');
    return campuses.filter((campus) => {
      const assignment = assignmentMap.get(scopeKey(campus));
      if (unassignedOnly && assignment) return false;
      return !query || [campus.district, campus.team, campus.campus, assignment?.name]
        .filter(Boolean).join(' ').toLocaleLowerCase('ko').includes(query);
    });
  }, [assignmentMap, campusQuery, campuses, unassignedOnly]);

  const loadOverview = async () => {
    setLoading(true);
    try {
      if (!adminRole || adminRole.role !== 'global_admin') {
        navigate('/');
        return;
      }
      const [nextCampuses, nextAssignments] = await Promise.all([
        getCampusScopesForAdmin(),
        getCampusAdminAssignments(),
      ]);
      setCampuses(nextCampuses);
      setAssignments(nextAssignments);
    } catch (error) {
      setMessage({ type: 'error', text: `관리자 현황을 불러오지 못했습니다: ${getErrorMessage(error)}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(loadOverview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchUsers = async (page = 1, campus = target, query = searchQuery) => {
    if (!campus) return;
    setSearching(true);
    try {
      const searchParams = {
        district: campus.district,
        team: campus.team,
        campus: campus.campus,
        query: query || undefined,
        page,
        pageSize: USER_PAGE_SIZE,
      };
      const result = await searchUsersForCampusManager(searchParams);
      setUsers(result.users);
      setUserPage(result.page);
      setUserTotal(result.totalCount);
    } catch (error) {
      setMessage({ type: 'error', text: `사용자 검색 중 오류가 발생했습니다: ${getErrorMessage(error)}` });
    } finally {
      setSearching(false);
    }
  };

  const openModal = (campus: AdminCampusScope) => {
    setTarget(campus);
    setSearchQuery('');
    setUsers([]);
    setUserPage(1);
    setUserTotal(0);
    setMessage(null);
    void searchUsers(1, campus, '');
  };

  const openAllUsersModal = () => openModal(ALL_USERS_SCOPE);

  const assignUser = async (user: AdminUserSearchResult) => {
    if (!target || user.role === 'global_admin') return;
    const changing = Boolean(currentTargetAdmin && currentTargetAdmin.userId !== user.userId);
    if (!window.confirm(changing
      ? `${target.campus} 캠퍼스 회계 순장님을 ${user.name}님으로 변경할까요?`
      : `${user.name}님을 ${target.campus} 캠퍼스 회계 순장님으로 지정할까요?`
    )) return;

    setActionId(user.userId);
    try {
      await registerCampusAdmin({ userId: user.userId, district: target.district, team: target.team, campus: target.campus });
      await loadOverview();
      setMessage({ type: 'success', text: `${target.campus} 캠퍼스 회계 순장님을 ${user.name}님으로 지정했습니다.` });
      setTarget(null);
    } catch (error) {
      setMessage({ type: 'error', text: `관리자 지정 중 오류가 발생했습니다: ${getErrorMessage(error)}` });
    } finally {
      setActionId(null);
    }
  };

  const removeAssignment = async (assignment: CampusAdminAssignment) => {
    if (!window.confirm(`${assignment.campus} 캠퍼스의 ${assignment.name}님 관리자 권한을 해제할까요?`)) return;
    setActionId(assignment.adminRoleId);
    try {
      await cancelCampusAdmin(assignment.adminRoleId);
      await loadOverview();
      setMessage({ type: 'success', text: `${assignment.campus} 캠퍼스 회계 순장님 지정을 해제했습니다.` });
    } catch (error) {
      setMessage({ type: 'error', text: `관리자 해제 중 오류가 발생했습니다: ${getErrorMessage(error)}` });
    } finally {
      setActionId(null);
    }
  };

  if (loading && campuses.length === 0) {
    return <div className={styles.pageContainer}><AdminHeader /><main className={styles.main}><p className={styles.loadingText}>관리자 현황을 불러오는 중...</p></main></div>;
  }

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />
      <main className={styles.main}>
        <button type="button" className={styles.backButton} onClick={() => navigate('/admin/dashboard')}>
          <ArrowLeft size={16} /> 전체 관리자 대시보드
        </button>

        <section className={styles.header}>
          <div className={styles.headerIntro}>
            <div className={styles.headerIcon}><ShieldCheck size={24} /></div>
            <div><span className={styles.eyebrow}>Campus Admin</span><h1>캠퍼스 회계 순장님 관리</h1><p>캠퍼스별 현황을 확인하고 필요한 캠퍼스에서 바로 담당자를 지정하세요. 관리 대상 캠퍼스를 선택하지 않아도 전체 사용자를 검색할 수 있습니다.</p></div>
          </div>
          <button type="button" className={styles.refreshButton} onClick={() => void loadOverview()}><RefreshCw size={16} /> 새로고침</button>
        </section>

        <section className={styles.summaryGrid}>
          <div><Building2 size={20} /><span>전체 캠퍼스</span><strong>{campuses.length}</strong></div>
          <div><CheckCircle2 size={20} /><span>관리자 지정</span><strong>{campuses.length - unassignedCount}</strong></div>
          <div className={unassignedCount ? styles.warningSummary : ''}><UserCog size={20} /><span>미지정</span><strong>{unassignedCount}</strong></div>
        </section>

        {message && <p className={message.type === 'success' ? styles.successMessage : styles.errorMessage}>{message.text}</p>}

        <section className={styles.campusPanel}>
          <div className={styles.panelHeader}>
            <div><span className={styles.sectionLabel}>캠퍼스별 현황</span><h2>관리자 지정 현황</h2><p>관리자를 지정하거나 변경할 캠퍼스를 선택하세요.</p></div>
            <span><Users size={14} /> {filteredCampuses.length}개</span>
          </div>
          <div className={styles.toolbar}>
            <label className={styles.searchBox}><Search size={16} /><input value={campusQuery} onChange={(event) => setCampusQuery(event.target.value)} placeholder="캠퍼스 또는 관리자 검색" /></label>
            <label className={styles.toggle}><input type="checkbox" checked={unassignedOnly} onChange={(event) => setUnassignedOnly(event.target.checked)} /> 미지정 캠퍼스만 보기</label>
            <button type="button" className={styles.mutedButton} onClick={openAllUsersModal}><Users size={16} /> 전체 사용자 검색</button>
          </div>
          <div className={styles.campusList}>
            {filteredCampuses.map((campus) => {
              const assignment = assignmentMap.get(scopeKey(campus));
              return (
                <article className={styles.campusRow} key={scopeKey(campus)}>
                  <div className={styles.campusIdentity}><span className={styles.campusIcon}><Building2 size={18} /></span><div><strong>{campus.campus}</strong><span>{campus.district} / {campus.team}</span></div></div>
                  <div className={styles.assignmentInfo}>
                    {assignment ? <><span className={styles.assignedBadge}>지정 완료</span><strong>{assignment.name}</strong><small>{assignment.phone || assignment.email || '연락처 없음'}</small></> : <><span className={styles.unassignedBadge}>미지정</span><strong>등록된 관리자가 없습니다</strong></>}
                  </div>
                  <div className={styles.rowActions}>
                    {assignment && <button type="button" className={styles.dangerButton} disabled={actionId === assignment.adminRoleId} onClick={() => void removeAssignment(assignment)}>해제</button>}
                    <button type="button" className={styles.primaryButton} onClick={() => openModal(campus)}>{assignment ? '관리자 변경' : '관리자 지정'}</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      {target && (
        <div className={styles.backdrop} onMouseDown={() => !actionId && setTarget(null)}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="assign-admin-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div><span className={styles.modalIcon}><UserCog size={19} /></span><div><h2 id="assign-admin-title">{target.campus ? `${target.campus} 관리자 ${currentTargetAdmin ? '변경' : '지정'}` : '전체 사용자 검색'}</h2><p>{target.campus ? `${target.district} / ${target.team}` : '관리 대상 캠퍼스를 선택하지 않아도 전체 사용자를 검색할 수 있습니다'}</p></div></div>
              <button type="button" onClick={() => !actionId && setTarget(null)} aria-label="닫기"><X size={19} /></button>
            </header>
            {currentTargetAdmin && <div className={styles.currentAssignment}><span>현재 관리자</span><strong>{currentTargetAdmin.name}</strong><small>{currentTargetAdmin.phone || currentTargetAdmin.email || '연락처 없음'}</small></div>}
            <div className={styles.modalSearch}>
              <label className={styles.searchBox}><Search size={16} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchUsers(1); }} placeholder="이름, 이메일, 연락처, 소속 검색" /></label>
              <button type="button" className={styles.primaryButton} onClick={() => void searchUsers(1)} disabled={searching}>{searching ? '검색 중...' : '검색'}</button>
            </div>
            <div className={styles.modalUserList}>
              {users.length === 0 && !searching ? <div className={styles.emptyState}><Users size={28} /><strong>검색 결과가 없습니다</strong></div> : users.map((user) => {
                const isCurrent =
                  currentTargetAdmin?.userId === user.userId ||
                  managesSelectedCampus(user, target);
                const isGlobal = user.role === 'global_admin';
                return (
                  <article className={`${styles.userCard} ${isCurrent ? styles.currentAdminCard : ''}`} key={user.userId}>
                    <div className={styles.userAvatar}>{user.name.trim().slice(0, 1) || '?'}</div>
                    <div className={styles.userInfo}><div className={styles.userTitleRow}><strong>{user.name}</strong>{isCurrent && <span className={styles.assignedBadge}>현재 관리자</span>}{isGlobal && <span className={styles.globalBadge}>전체 관리자</span>}</div><div className={styles.userMeta}><span>{user.district || '지구 미등록'} / {user.team || '팀 미등록'} / {user.campus || '캠퍼스 미등록'}</span>{user.phone && <span>{user.phone}</span>}{user.email && <span>{user.email}</span>}</div>{user.managedCampuses && user.managedCampuses.length > 0 && <small className={styles.managedText}>현재 관리 캠퍼스 {user.managedCampuses.length}개</small>}</div>
                    {target.campus && <button type="button" className={isCurrent ? styles.mutedButton : styles.primaryButton} disabled={isCurrent || isGlobal || actionId === user.userId} onClick={() => void assignUser(user)}>{isCurrent ? '현재 관리자' : '선택'}</button>}
                  </article>
                );
              })}
            </div>
            {userTotal > USER_PAGE_SIZE && <footer className={styles.modalFooter}><span>{userPage} / {Math.ceil(userTotal / USER_PAGE_SIZE)} 페이지</span><div><button type="button" className={styles.mutedButton} disabled={userPage <= 1 || searching} onClick={() => void searchUsers(userPage - 1)}>이전</button><button type="button" className={styles.primaryButton} disabled={userPage >= Math.ceil(userTotal / USER_PAGE_SIZE) || searching} onClick={() => void searchUsers(userPage + 1)}>다음</button></div></footer>}
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminCampusAdminManagePage;
