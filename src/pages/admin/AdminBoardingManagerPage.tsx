import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bus,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Save,
  Search,
  ShieldCheck,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  assignBoardingManager,
  cancelBoardingManager,
  getBoardingManagerAssignmentOptions,
  getBoardingManagerUsers,
  saveBoardingManagerBusAssignments,
  type BoardingManagerAssignmentBus,
  type BoardingManagerAssignmentOptions,
  type BoardingManagerUser,
} from '../../lib/admin/boardingManagementService';
import { formatBusLabel } from '../../utils/busLabel';
import AdminHeader from './AdminHeader';
import styles from './AdminBoardingManagerPage.module.css';

type PendingRoleAction =
  | { mode: 'cancel'; user: BoardingManagerUser }
  | { mode: 'assign'; users: BoardingManagerUser[] };

const AdminBoardingManagerPage = () => {
  const navigate = useNavigate();
  const roleActionInFlightRef = useRef(false);
  const usersRequestRevisionRef = useRef(0);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<BoardingManagerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionUserId, setActionUserId] = useState('');
  const [showCandidates, setShowCandidates] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [assignmentOptions, setAssignmentOptions] =
    useState<BoardingManagerAssignmentOptions>({
      isAvailable: false,
      allocationId: null,
      allocationName: null,
      buses: [],
    });
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success'>('error');
  const [pendingRoleAction, setPendingRoleAction] = useState<PendingRoleAction | null>(null);
  const [roleActionDialogError, setRoleActionDialogError] = useState('');
  const [staffOnlyFilter, setStaffOnlyFilter] = useState(true);

  const managers = useMemo(
    () => users.filter((user) => user.isBoardingManager),
    [users]
  );
  const candidates = useMemo(
    () => users.filter((user) => !user.isBoardingManager),
    [users]
  );
  const busesByDestination = useMemo(
    () =>
      Object.entries(
        assignmentOptions.buses.reduce<Record<string, BoardingManagerAssignmentBus[]>>(
          (groups, bus) => {
            const destination = bus.destination || '행선지 미지정';
            groups[destination] = [...(groups[destination] ?? []), bus];
            return groups;
          },
          {}
        )
      ),
    [assignmentOptions.buses]
  );

  const loadUsers = async () => {
    const requestRevision = ++usersRequestRevisionRef.current;
    setLoading(true);
    try {
      // Always fetch all users (without staff filter) to populate existing boarding managers
      const allUsersPromise = getBoardingManagerUsers('', false);
      const searchedUsersPromise = search.trim()
        ? getBoardingManagerUsers(search, staffOnlyFilter)
        : getBoardingManagerUsers('', staffOnlyFilter);
      const [allUsers, searchedUsers, nextAssignmentOptions] = await Promise.all([
        allUsersPromise,
        searchedUsersPromise,
        getBoardingManagerAssignmentOptions(),
      ]);
      if (requestRevision !== usersRequestRevisionRef.current) return;
      const nextUsers = [
        ...allUsers.filter((user) => user.isBoardingManager),
        ...searchedUsers.filter((user) => !user.isBoardingManager),
      ];
      setUsers(nextUsers);
      setAssignmentOptions(nextAssignmentOptions);
      setAssignmentDrafts(
        Object.fromEntries(nextUsers.map((user) => [user.userId, user.assignedBusIds]))
      );
      setSelectedCandidateIds([]);
      setMessage('');
    } catch (error) {
      if (requestRevision !== usersRequestRevisionRef.current) return;
      setMessageType('error');
      setMessage(error instanceof Error ? error.message : '사용자를 불러오지 못했습니다.');
    } finally {
      if (requestRevision === usersRequestRevisionRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedCandidateIds([]);
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffOnlyFilter]);

  useEffect(() => {
    if (!pendingRoleAction) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !actionUserId) {
        setPendingRoleAction(null);
        setRoleActionDialogError('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actionUserId, pendingRoleAction]);

  const closeRoleActionDialog = () => {
    if (actionUserId) return;
    setPendingRoleAction(null);
    setRoleActionDialogError('');
  };

  const handleCancelManager = (user: BoardingManagerUser) => {
    if (actionUserId) return;
    setRoleActionDialogError('');
    setPendingRoleAction({ mode: 'cancel', user });
  };

  const handleAssignSelected = () => {
    if (actionUserId) return;
    const selectedUsers = candidates.filter((user) =>
      selectedCandidateIds.includes(user.userId)
    );
    if (selectedUsers.length === 0) return;
    setRoleActionDialogError('');
    setPendingRoleAction({ mode: 'assign', users: selectedUsers });
  };

  const confirmRoleAction = async () => {
    if (!pendingRoleAction || actionUserId || roleActionInFlightRef.current) return;

    roleActionInFlightRef.current = true;
    setActionUserId(
      pendingRoleAction.mode === 'cancel'
        ? pendingRoleAction.user.userId
        : 'selected-candidates'
    );
    setMessage('');
    setRoleActionDialogError('');

    try {
      if (pendingRoleAction.mode === 'cancel') {
        const { user } = pendingRoleAction;
        await cancelBoardingManager(user.userId);
        setUsers((current) =>
          current.map((item) =>
            item.userId === user.userId
              ? { ...item, isBoardingManager: false, assignedBusIds: [] }
              : item
          )
        );
        setAssignmentDrafts((current) => ({ ...current, [user.userId]: [] }));
        setEditingUserId((current) => (current === user.userId ? '' : current));
        setPendingRoleAction(null);
        setMessageType('success');
        setMessage(`${user.name}님의 탑승 관리 간사님 권한을 해제했습니다.`);
        return;
      }

      const selectedUsers = pendingRoleAction.users;
      const results = await Promise.allSettled(
        selectedUsers.map((user) => assignBoardingManager(user.userId))
      );
      const succeededIds = selectedUsers
        .filter((_, index) => results[index].status === 'fulfilled')
        .map((user) => user.userId);
      const failedUsers = selectedUsers.filter(
        (_, index) => results[index].status === 'rejected'
      );

      setUsers((current) =>
        current.map((user) =>
          succeededIds.includes(user.userId)
            ? { ...user, isBoardingManager: true }
            : user
        )
      );
      setSelectedCandidateIds((current) =>
        current.filter((userId) => !succeededIds.includes(userId))
      );

      if (failedUsers.length === 0) {
        setPendingRoleAction(null);
        setMessageType('success');
        setMessage(`${selectedUsers.length.toLocaleString()}명을 탑승 관리 간사님으로 지정했습니다.`);
      } else {
        setPendingRoleAction({ mode: 'assign', users: failedUsers });
        setRoleActionDialogError(
          `${succeededIds.length.toLocaleString()}명은 지정되었고 ${failedUsers.length.toLocaleString()}명은 실패했습니다. 아래 실패 대상만 다시 시도할 수 있습니다.`
        );
      }
    } catch (error) {
      setRoleActionDialogError(
        error instanceof Error ? error.message : '권한을 변경하지 못했습니다.'
      );
    } finally {
      roleActionInFlightRef.current = false;
      setActionUserId('');
    }
  };

  const getAffiliation = (user: BoardingManagerUser) =>
    [user.district, user.team, user.campus].filter(Boolean).join(' / ') || '소속 미등록';

  const getRoleActionTitle = () => {
    if (pendingRoleAction?.mode === 'cancel') {
      return `${pendingRoleAction.user.name}님의 권한을 해제할까요?`;
    }
    if (pendingRoleAction?.mode === 'assign') {
      return `선택한 ${pendingRoleAction.users.length.toLocaleString()}명을 지정할까요?`;
    }
    return '';
  };

  const getRoleActionConfirmLabel = () => {
    if (actionUserId) {
      return pendingRoleAction?.mode === 'cancel' ? '권한 해제 중...' : '지정 중...';
    }
    return pendingRoleAction?.mode === 'cancel' ? '권한 해제' : '선택 사용자 지정';
  };

  const handleAssignmentToggle = (userId: string, busId: string) => {
    setAssignmentDrafts((current) => {
      const assignedBusIds = current[userId] ?? [];
      return {
        ...current,
        [userId]: assignedBusIds.includes(busId)
          ? assignedBusIds.filter((id) => id !== busId)
          : [...assignedBusIds, busId],
      };
    });
  };

  const handleDestinationAssignmentToggle = (
    userId: string,
    buses: BoardingManagerAssignmentBus[]
  ) => {
    setAssignmentDrafts((current) => {
      const assignedBusIds = current[userId] ?? [];
      const destinationBusIds = buses.map((bus) => bus.id);
      const allDestinationBusesAssigned = destinationBusIds.every((busId) =>
        assignedBusIds.includes(busId)
      );

      return {
        ...current,
        [userId]: allDestinationBusesAssigned
          ? assignedBusIds.filter((busId) => !destinationBusIds.includes(busId))
          : [...new Set([...assignedBusIds, ...destinationBusIds])],
      };
    });
  };

  const handleAssignmentSave = async (user: BoardingManagerUser) => {
    if (actionUserId || roleActionInFlightRef.current) return;
    const assignedBusIds = assignmentDrafts[user.userId] ?? [];
    roleActionInFlightRef.current = true;
    setActionUserId(user.userId);
    setMessage('');

    try {
      await saveBoardingManagerBusAssignments(user.userId, assignedBusIds);
      setUsers((current) =>
        current.map((item) =>
          item.userId === user.userId ? { ...item, assignedBusIds } : item
        )
      );
      setEditingUserId('');
      setMessageType('success');
      setMessage(
        `${user.name}님의 담당 호차를 ${assignedBusIds.length.toLocaleString()}대로 저장했습니다.`
      );
    } catch (error) {
      setMessageType('error');
      setMessage(error instanceof Error ? error.message : '담당 호차를 저장하지 못했습니다.');
    } finally {
      roleActionInFlightRef.current = false;
      setActionUserId('');
    }
  };

  const getAssignedBusLabels = (user: BoardingManagerUser) =>
    assignmentOptions.buses
      .filter((bus) => user.assignedBusIds.includes(bus.id))
      .map((bus) => formatBusLabel(bus.label));

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />
      <main className={styles.main}>
        <button type="button" className={styles.back} onClick={() => navigate('/admin/dashboard')}>
          <ArrowLeft size={16} /> 전체 관리자 대시보드
        </button>

        <section className={styles.hero}>
          <ShieldCheck size={32} />
          <div>
            <span>Boarding Manager</span>
            <h1>탑승 관리 간사님 권한·담당 호차 관리</h1>
            <p>지정된 탑승 관리 간사님을 관리하고, 필요한 사용자를 검색해 새 탑승 관리 간사님으로 지정합니다.</p>
          </div>
        </section>

        {message && (
          <p
            className={`${styles.message} ${messageType === 'success' ? styles.success : ''}`}
            role={messageType === 'error' ? 'alert' : 'status'}
          >
            {message}
          </p>
        )}

        {!loading && !assignmentOptions.isAvailable && (
          <p className={styles.migrationNotice} role="status">
            탑승 관리 간사님 권한 관리는 사용할 수 있지만 담당 호차 지정 기능은 아직 DB에 설치되지 않았습니다.
            Supabase에 <code>sql/setup/96_boarding_manager_bus_assignments.sql</code>을 적용해주세요.
          </p>
        )}

        <section className={styles.managementSection}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionIcon}><Bus size={17} /></span>
              <div>
                <h2>지정된 탑승 관리 간사님</h2>
                <p>담당 호차가 없는 탑승 관리 간사님을 먼저 확인하세요.</p>
              </div>
            </div>
            <strong>{managers.length.toLocaleString()}명</strong>
          </div>

          <div className={styles.managerList}>
            {loading ? (
              <p className={styles.empty}>탑승 관리 간사님을 불러오는 중...</p>
            ) : managers.length === 0 ? (
              <p className={styles.empty}>지정된 탑승 관리 간사님이 없습니다.</p>
            ) : (
              [...managers]
                .sort((a, b) => a.assignedBusIds.length - b.assignedBusIds.length)
                .map((user) => {
                  const assignmentDraft = assignmentDrafts[user.userId] ?? [];
                  const assignmentsChanged =
                    assignmentDraft.length !== user.assignedBusIds.length ||
                    assignmentDraft.some((busId) => !user.assignedBusIds.includes(busId));
                  const busLabels = getAssignedBusLabels(user);
                  const isEditing = editingUserId === user.userId;

                  return (
                    <article key={user.userId} className={styles.managerItem}>
                      <div className={styles.managerRow}>
                        <div className={styles.avatar}>{user.name.slice(0, 1)}</div>
                        <div className={styles.userInfo}>
                          <div className={styles.titleRow}>
                            <strong>{user.name}</strong>
                            <span>{user.assignedBusIds.length.toLocaleString()}대 담당</span>
                          </div>
                          <p>{getAffiliation(user)}</p>
                        </div>
                        <div className={styles.busSummary}>
                          {busLabels.length > 0 ? (
                            <>
                              {busLabels.slice(0, 2).map((label) => <span key={label}>{label}</span>)}
                              {busLabels.length > 2 && <small>외 {busLabels.length - 2}대</small>}
                            </>
                          ) : (
                            <em>담당 호차 없음</em>
                          )}
                        </div>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.edit}
                            onClick={() => setEditingUserId(isEditing ? '' : user.userId)}
                            disabled={Boolean(actionUserId)}
                          >
                            <Bus size={15} /> 호차 편집
                            {isEditing ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </button>
                          <button
                            type="button"
                            className={styles.cancel}
                            onClick={() => handleCancelManager(user)}
                            disabled={Boolean(actionUserId)}
                          >
                            <UserX size={15} /> 해제
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className={styles.assignmentEditor}>
                          <div className={styles.assignmentHeader}>
                            <div>
                              <strong><Bus size={15} /> 담당 호차 선택</strong>
                              <span>
                                {assignmentOptions.allocationName
                                  ? `${assignmentOptions.allocationName} · ${assignmentDraft.length.toLocaleString()}대 선택`
                                  : '확정 배차안이 없습니다.'}
                              </span>
                            </div>
                            <button
                              type="button"
                              className={styles.saveAssignments}
                              onClick={() => void handleAssignmentSave(user)}
                              disabled={
                                Boolean(actionUserId) ||
                                !assignmentOptions.isAvailable ||
                                !assignmentOptions.allocationId ||
                                !assignmentsChanged
                              }
                            >
                              <Save size={15} />
                              {actionUserId === user.userId ? '저장 중...' : '변경사항 저장'}
                            </button>
                          </div>
                          {assignmentOptions.buses.length > 0 ? (
                            <div className={styles.destinationGroups}>
                              {busesByDestination.map(([destination, buses]) => (
                                <div key={destination} className={styles.destinationGroup}>
                                  <label className={styles.destinationSelector}>
                                    <input
                                      type="checkbox"
                                      checked={buses.every((bus) =>
                                        assignmentDraft.includes(bus.id)
                                      )}
                                      ref={(input) => {
                                        if (!input) return;
                                        const selectedBusCount = buses.filter((bus) =>
                                          assignmentDraft.includes(bus.id)
                                        ).length;
                                        input.indeterminate =
                                          selectedBusCount > 0 && selectedBusCount < buses.length;
                                      }}
                                      onChange={() =>
                                        handleDestinationAssignmentToggle(user.userId, buses)
                                      }
                                      disabled={Boolean(actionUserId)}
                                      aria-label={`${destination}행 버스 전체 선택`}
                                    />
                                    <strong>{destination}</strong>
                                    <span>{buses.length.toLocaleString()}대</span>
                                  </label>
                                  <div className={styles.busOptions}>
                                    {buses.map((bus) => (
                                      <label key={bus.id}>
                                        <input
                                          type="checkbox"
                                          checked={assignmentDraft.includes(bus.id)}
                                          onChange={() => handleAssignmentToggle(user.userId, bus.id)}
                                          disabled={Boolean(actionUserId)}
                                        />
                                        <span>{formatBusLabel(bus.label)}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : assignmentOptions.isAvailable ? (
                            <p className={styles.noAllocation}>확정 배차안이 생성되면 담당 호차를 지정할 수 있습니다.</p>
                          ) : (
                            <p className={styles.noAllocation}>DB 업데이트 후 담당 호차를 지정할 수 있습니다.</p>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
            )}
          </div>
        </section>

        <section className={styles.managementSection}>
          <button
            type="button"
            className={styles.candidateToggle}
            onClick={() => setShowCandidates((current) => !current)}
          >
            <span className={styles.sectionIcon}><Users size={17} /></span>
            <span>
              <strong>탑승 관리 간사님 추가</strong>
              <small>사용자를 검색해 여러 명을 한 번에 지정합니다.</small>
            </span>
            {showCandidates ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {showCandidates && (
            <div className={styles.candidatePanel}>
              <form
                className={styles.search}
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadUsers();
                }}
              >
                <Search size={18} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="이름, 이메일, 연락처, 캠퍼스 검색"
                  aria-label="탑승 관리 간사님 지정 대상 검색"
                />
                <button type="submit" disabled={loading}>{loading ? '검색 중' : '검색'}</button>
              </form>

              <div className={styles.candidateToolbar}>
                <div className={styles.candidateFilterGroup}>
                  <span>지정 가능한 사용자 {candidates.length.toLocaleString()}명</span>
                  <button
                    type="button"
                    className={`${styles.filterButton} ${staffOnlyFilter ? styles.active : ''}`}
                    onClick={() => setStaffOnlyFilter((prev) => !prev)}
                  >
                    간사만 보기
                  </button>
                </div>
                <button
                  type="button"
                  className={styles.assignSelected}
                  onClick={handleAssignSelected}
                  disabled={Boolean(actionUserId) || selectedCandidateIds.length === 0}
                >
                  <UserPlus size={15} />
                  {actionUserId === 'selected-candidates'
                    ? '지정 중...'
                    : `선택 ${selectedCandidateIds.length.toLocaleString()}명 지정`}
                </button>
              </div>

              <div className={styles.candidateList}>
                {loading ? (
                  <p className={styles.empty}>사용자를 불러오는 중...</p>
                ) : candidates.length === 0 ? (
                  <p className={styles.empty}>지정 가능한 검색 결과가 없습니다.</p>
                ) : (
                  candidates.map((user) => (
                    <label key={user.userId} className={styles.candidateItem}>
                      <input
                        type="checkbox"
                        checked={selectedCandidateIds.includes(user.userId)}
                        onChange={() =>
                          setSelectedCandidateIds((current) =>
                            current.includes(user.userId)
                              ? current.filter((id) => id !== user.userId)
                              : [...current, user.userId]
                          )
                        }
                      />
                      <div className={styles.avatar}>{user.name.slice(0, 1)}</div>
                      <div className={styles.userInfo}>
                        <strong>
                          {user.name}
                          {user.isStaff && <span className={styles.staffBadge}>간사</span>}
                        </strong>
                        <p>{getAffiliation(user)}</p>
                        <small>{user.phone || '연락처 없음'} · {user.email || '이메일 없음'}</small>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {pendingRoleAction && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRoleActionDialog();
          }}
        >
          <section
            className={styles.roleActionModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-action-title"
            aria-describedby="role-action-description"
          >
            <div
              className={`${styles.modalIcon} ${
                pendingRoleAction.mode === 'cancel' ? styles.dangerIcon : ''
              }`}
            >
              {pendingRoleAction.mode === 'cancel'
                ? <AlertTriangle size={24} />
                : <ShieldCheck size={24} />}
            </div>

            <div className={styles.modalHeading}>
              <span>
                {pendingRoleAction.mode === 'cancel' ? '권한 해제 검토' : '권한 지정 검토'}
              </span>
              <h2 id="role-action-title">{getRoleActionTitle()}</h2>
              <p id="role-action-description">
                {pendingRoleAction.mode === 'cancel'
                  ? '탑승 관리 권한과 현재 담당 호차가 함께 해제됩니다.'
                  : '선택한 사용자에게 탑승 관리 권한을 부여합니다.'}
              </p>
            </div>

            {pendingRoleAction.mode === 'cancel' ? (
              <>
                <div className={styles.reviewCard}>
                  <strong>{pendingRoleAction.user.name}</strong>
                  <span>{getAffiliation(pendingRoleAction.user)}</span>
                  <small>
                    현재 담당 호차 {pendingRoleAction.user.assignedBusIds.length.toLocaleString()}대
                  </small>
                </div>
                <div className={styles.impactBox}>
                  <strong><AlertTriangle size={16} /> 해제 시 적용되는 변경</strong>
                  <p>탑승 관리 화면 접근 권한을 잃고, 현재 담당 호차 지정이 모두 삭제됩니다.</p>
                  {getAssignedBusLabels(pendingRoleAction.user).length > 0 && (
                    <div className={styles.modalBusList}>
                      {getAssignedBusLabels(pendingRoleAction.user).map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className={styles.userPreviewList}>
                  {pendingRoleAction.users.slice(0, 5).map((user) => (
                    <div key={user.userId} className={styles.userPreview}>
                      <span>{user.name.slice(0, 1)}</span>
                      <div>
                        <strong>{user.name}</strong>
                        <small>{getAffiliation(user)}</small>
                      </div>
                    </div>
                  ))}
                  {pendingRoleAction.users.length > 5 && (
                    <p>외 {(pendingRoleAction.users.length - 5).toLocaleString()}명</p>
                  )}
                </div>
                <div className={styles.noticeBox}>
                  <strong>지정 후 담당 호차를 별도로 선택해야 합니다.</strong>
                  <p>여러 사용자를 지정하면 일부 사용자만 먼저 완료될 수 있습니다. 실패 대상은 모달에서 다시 시도할 수 있습니다.</p>
                </div>
              </>
            )}

            {roleActionDialogError && (
              <p className={styles.modalError} role="alert">{roleActionDialogError}</p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.keepButton}
                onClick={closeRoleActionDialog}
                disabled={Boolean(actionUserId)}
                autoFocus
              >
                {pendingRoleAction.mode === 'cancel' ? '현재 권한 유지' : '지정 취소'}
              </button>
              <button
                type="button"
                className={
                  pendingRoleAction.mode === 'cancel'
                    ? styles.dangerButton
                    : styles.confirmButton
                }
                onClick={() => void confirmRoleAction()}
                disabled={Boolean(actionUserId)}
              >
                {actionUserId && <LoaderCircle size={16} className={styles.spinner} />}
                {getRoleActionConfirmLabel()}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminBoardingManagerPage;
