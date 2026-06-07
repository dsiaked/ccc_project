import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  RefreshCw,
  UserX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  getPersonalTicketPage,
  type PersonalTicketCampus,
  type PersonalTicketItem,
} from '../../lib/admin/personalTicketService';
import AdminHeader from './AdminHeader';
import styles from './AdminCampusIssueReviewPage.module.css';

const AdminCampusIssueReviewPage = () => {
  const navigate = useNavigate();
  const [campuses, setCampuses] = useState<PersonalTicketCampus[]>([]);
  const [users, setUsers] = useState<PersonalTicketItem[]>([]);
  const [selectedCampus, setSelectedCampus] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const issueCampuses = useMemo(
    () =>
      campuses
        .filter((campus) => campus.issueCount > 0)
        .sort(
          (a, b) =>
            b.issueCount - a.issueCount || a.name.localeCompare(b.name, 'ko')
        ),
    [campuses]
  );
  const activeCampus =
    issueCampuses.find((campus) => campus.name === selectedCampus) ??
    issueCampuses[0] ??
    null;
  const activeIndex = activeCampus
    ? issueCampuses.findIndex((campus) => campus.name === activeCampus.name)
    : -1;

  const loadIssues = useCallback(async (campus = '') => {
    setLoading(true);
    setLoadError(null);

    try {
      const result = await getPersonalTicketPage({
        page: 1,
        pageSize: 200,
        search: '',
        status: 'all',
        ticket: 'all',
        adminRole: 'all',
        campusIssue: 'issues_only',
        campus: campus || 'all',
      });

      setCampuses((previous) =>
        campus && previous.length > 0 ? previous : result.campuses
      );
      setUsers(result.items);
      if (!campus) {
        const firstIssueCampus = result.campuses
          .filter((item) => item.issueCount > 0)
          .sort(
            (a, b) =>
              b.issueCount - a.issueCount || a.name.localeCompare(b.name, 'ko')
          )[0];
        setSelectedCampus(firstIssueCampus?.name ?? '');
      }
    } catch (error) {
      console.error('문제 캠퍼스 검토 조회 실패:', error);
      setLoadError('문제 캠퍼스 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadIssues(selectedCampus);
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadIssues, selectedCampus]);

  const moveCampus = (direction: -1 | 1) => {
    const nextCampus = issueCampuses[activeIndex + direction];
    if (nextCampus) setSelectedCampus(nextCampus.name);
  };

  const openUserManagement = () => {
    if (!activeCampus) return;
    navigate(`/admin/users?campus=${encodeURIComponent(activeCampus.name)}`);
  };

  return (
    <div className={styles.page}>
      <AdminHeader />

      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/admin/users')}
        >
          <ArrowLeft size={16} />
          개별 사용자 관리
        </button>

        <header className={styles.header}>
          <div>
            <span>운영 점검</span>
            <h1>문제 캠퍼스 검토</h1>
            <p>미신청 또는 신청 후 미입금 인원이 있는 캠퍼스를 순서대로 확인합니다.</p>
          </div>
          <button type="button" onClick={() => void loadIssues(selectedCampus)}>
            <RefreshCw size={16} />
            새로고침
          </button>
        </header>

        {loadError ? (
          <section className={styles.errorState}>
            <strong>{loadError}</strong>
            <button type="button" onClick={() => void loadIssues()}>
              다시 시도
            </button>
          </section>
        ) : loading && issueCampuses.length === 0 ? (
          <section className={styles.emptyState}>문제 캠퍼스를 확인하는 중입니다.</section>
        ) : issueCampuses.length === 0 ? (
          <section className={styles.completeState}>
            <CheckCircle2 size={28} />
            <strong>검토할 문제 캠퍼스가 없습니다.</strong>
            <p>현재 미신청 또는 미입금 문제로 분류된 캠퍼스가 없습니다.</p>
          </section>
        ) : (
          <>
            <section className={styles.overview}>
              <div>
                <span>문제 캠퍼스</span>
                <strong>{issueCampuses.length.toLocaleString()}곳</strong>
              </div>
              <div>
                <span>전체 문제 인원</span>
                <strong>
                  {issueCampuses
                    .reduce((sum, campus) => sum + campus.issueCount, 0)
                    .toLocaleString()}
                  명
                </strong>
              </div>
              <div>
                <span>현재 검토 순서</span>
                <strong>
                  {activeIndex + 1} / {issueCampuses.length}
                </strong>
              </div>
            </section>

            <section className={styles.reviewHeader}>
              <div className={styles.campusSelect}>
                <label htmlFor="issue-campus">검토 캠퍼스</label>
                <select
                  id="issue-campus"
                  value={activeCampus?.name ?? ''}
                  onChange={(event) => setSelectedCampus(event.target.value)}
                >
                  {issueCampuses.map((campus) => (
                    <option key={campus.name} value={campus.name}>
                      {campus.name} · 문제 {campus.issueCount}명
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.navigation}>
                <button
                  type="button"
                  onClick={() => moveCampus(-1)}
                  disabled={activeIndex <= 0}
                >
                  <ChevronLeft size={16} /> 이전
                </button>
                <button
                  type="button"
                  onClick={() => moveCampus(1)}
                  disabled={activeIndex >= issueCampuses.length - 1}
                >
                  다음 <ChevronRight size={16} />
                </button>
              </div>
            </section>

            {activeCampus && (
              <section className={styles.campusSummary}>
                <div>
                  <span>현재 캠퍼스</span>
                  <h2>{activeCampus.name}</h2>
                  <div className={styles.admins}>
                    <span>캠퍼스 관리자</span>
                    {activeCampus.admins.length > 0 ? (
                      activeCampus.admins.map((admin) => (
                        <strong key={admin.userId}>
                          {admin.name || '이름 없음'}
                          {admin.phone ? ` · ${admin.phone}` : ''}
                        </strong>
                      ))
                    ) : (
                      <strong>미지정</strong>
                    )}
                  </div>
                </div>
                <div className={styles.issueCounts}>
                  <span>
                    <CircleAlert size={17} />
                    전체 <strong>{activeCampus.issueCount}명</strong>
                  </span>
                  <span>
                    <UserX size={17} />
                    미신청 <strong>{activeCampus.notAppliedCount}명</strong>
                  </span>
                  <span>
                    <CreditCard size={17} />
                    미입금 <strong>{activeCampus.unpaidCount}명</strong>
                  </span>
                </div>
                <button type="button" className={styles.manageButton} onClick={openUserManagement}>
                  사용자 관리에서 처리 <ArrowRight size={16} />
                </button>
              </section>
            )}

            <section className={styles.userSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>확인할 사용자</h2>
                  <p>미신청 또는 신청 후 미입금 상태인 사용자입니다.</p>
                </div>
                <strong>{users.length.toLocaleString()}명</strong>
              </div>

              <div className={styles.userList}>
                {users.length === 0 ? (
                  <div className={styles.emptyState}>확인할 사용자가 없습니다.</div>
                ) : (
                  users.map((user) => (
                    <article key={user.id} className={styles.userCard}>
                      <div>
                        <strong>{user.name || '이름 없음'}</strong>
                        <span>{user.phone || user.email || '연락처 없음'}</span>
                      </div>
                      <span
                        className={
                          !user.hasReservation
                            ? styles.notAppliedBadge
                            : styles.unpaidBadge
                        }
                      >
                        {!user.hasReservation ? '미신청' : '신청 후 미입금'}
                      </span>
                    </article>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default AdminCampusIssueReviewPage;
