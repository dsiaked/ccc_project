import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bus,
  ChevronDown,
  ChevronUp,
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

const AdminBoardingManagerPage = () => {
  const navigate = useNavigate();
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
    setLoading(true);
    try {
      const allUsersPromise = getBoardingManagerUsers('');
      const searchedUsersPromise = search.trim()
        ? getBoardingManagerUsers(search)
        : allUsersPromise;
      const [allUsers, searchedUsers, nextAssignmentOptions] = await Promise.all([
        allUsersPromise,
        searchedUsersPromise,
        getBoardingManagerAssignmentOptions(),
      ]);
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
      setMessageType('error');
      setMessage(error instanceof Error ? error.message : '사용자를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadUsers();
    }, 0);

    return () => window.clearTimeout(initialLoad);
    // Initial server synchronization intentionally uses the initial search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancelManager = async (user: BoardingManagerUser) => {
    if (!window.confirm(`${user.name}님의 탑승 관리 간사님 권한을 해제할까요?`)) return;

    setActionUserId(user.userId);
    setMessage('');
    try {
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
      setMessageType('success');
      setMessage(`${user.name}님의 탑승 관리 간사님 권한을 해제했습니다.`);
    } catch (error) {
      setMessageType('error');
      setMessage(error instanceof Error ? error.message : '권한을 변경하지 못했습니다.');
    } finally {
      setActionUserId('');
    }
  };

  const handleAssignSelected = async () => {
    const selectedUsers = candidates.filter((user) =>
      selectedCandidateIds.includes(user.userId)
    );
    if (selectedUsers.length === 0) return;
    if (!window.confirm(`선택한 ${selectedUsers.length.toLocaleString()}명을 탑승 관리 간사님으로 지정할까요?`)) {
      return;
    }

    setActionUserId('selected-candidates');
    setMessage('');
    const results = await Promise.allSettled(
      selectedUsers.map((user) => assignBoardingManager(user.userId))
    );
    const succeededIds = selectedUsers
      .filter((_, index) => results[index].status === 'fulfilled')
      .map((user) => user.userId);
    const failedResults = results.filter((result) => result.status === 'rejected');

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

    if (failedResults.length === 0) {
      setMessageType('success');
      setMessage(`${selectedUsers.length.toLocaleString()}명을 탑승 관리 간사님으로 지정했습니다.`);
    } else {
      setMessageType('error');
      setMessage(
        `${succeededIds.length.toLocaleString()}명 지정 완료, ${failedResults.length.toLocaleString()}명 지정 실패했습니다. 실패한 사용자를 다시 확인해 주세요.`
      );
    }
    setActionUserId('');
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

  const handleAssignmentSave = async (user: BoardingManagerUser) => {
    const assignedBusIds = assignmentDrafts[user.userId] ?? [];
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
            Supabase에 <code>sql/setup/96_boarding_manager_bus_assignments.sql</code>을 적용해 주세요.
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
                          <p>{[user.district, user.team, user.campus].filter(Boolean).join(' / ') || '소속 미등록'}</p>
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
                            onClick={() => void handleCancelManager(user)}
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
                                  <strong>{destination}</strong>
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
                <span>지정 가능한 사용자 {candidates.length.toLocaleString()}명</span>
                <button
                  type="button"
                  className={styles.assignSelected}
                  onClick={() => void handleAssignSelected()}
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
                        <strong>{user.name}</strong>
                        <p>{[user.district, user.team, user.campus].filter(Boolean).join(' / ') || '소속 미등록'}</p>
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
    </div>
  );
};

export default AdminBoardingManagerPage;
