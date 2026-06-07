import { useEffect, useState } from 'react';
import { ArrowLeft, Search, ShieldCheck, UserPlus, UserX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  assignBoardingManager,
  cancelBoardingManager,
  getBoardingManagerUsers,
  type BoardingManagerUser,
} from '../../lib/admin/boardingManagementService';
import AdminHeader from './AdminHeader';
import styles from './AdminBoardingManagerPage.module.css';

const AdminBoardingManagerPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<BoardingManagerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionUserId, setActionUserId] = useState('');
  const [message, setMessage] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    try {
      setUsers(await getBoardingManagerUsers(search));
      setMessage('');
    } catch (error) {
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

  const handleToggle = async (user: BoardingManagerUser) => {
    const action = user.isBoardingManager ? '해제' : '부여';
    if (!window.confirm(`${user.name}님의 선탑자 권한을 ${action}할까요?`)) return;

    setActionUserId(user.userId);
    try {
      if (user.isBoardingManager) await cancelBoardingManager(user.userId);
      else await assignBoardingManager(user.userId);
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '권한을 변경하지 못했습니다.');
    } finally {
      setActionUserId('');
    }
  };

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />
      <main className={styles.main}>
        <button type="button" className={styles.back} onClick={() => navigate('/admin/global')}>
          <ArrowLeft size={16} /> 전체 관리자 대시보드
        </button>

        <section className={styles.hero}>
          <ShieldCheck size={32} />
          <div>
            <span>Boarding Manager</span>
            <h1>선탑자 권한 관리</h1>
            <p>가입된 사용자에게 전체 호차 탑승 현황 조회와 상태 처리 권한을 부여합니다.</p>
          </div>
        </section>

        <form
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault();
            void loadUsers();
          }}
        >
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름, 이메일, 연락처, 캠퍼스 검색" />
          <button type="submit">검색</button>
        </form>

        {message && <p className={styles.message}>{message}</p>}

        <section className={styles.list}>
          {loading ? (
            <p>사용자를 불러오는 중...</p>
          ) : users.length === 0 ? (
            <p>검색 결과가 없습니다.</p>
          ) : (
            users.map((user) => (
              <article key={user.userId} className={user.isBoardingManager ? styles.assigned : ''}>
                <div className={styles.avatar}>{user.name.slice(0, 1)}</div>
                <div>
                  <div className={styles.titleRow}>
                    <strong>{user.name}</strong>
                    {user.isBoardingManager && <span>선탑자</span>}
                  </div>
                  <p>{[user.district, user.team, user.campus].filter(Boolean).join(' / ') || '소속 미등록'}</p>
                  <small>{user.phone || '연락처 없음'} · {user.email || '이메일 없음'}</small>
                </div>
                <button
                  type="button"
                  className={user.isBoardingManager ? styles.cancel : styles.assign}
                  onClick={() => void handleToggle(user)}
                  disabled={actionUserId === user.userId}
                >
                  {user.isBoardingManager ? <UserX size={16} /> : <UserPlus size={16} />}
                  {actionUserId === user.userId
                    ? '처리 중...'
                    : user.isBoardingManager
                      ? '권한 해제'
                      : '선탑자 지정'}
                </button>
              </article>
            ))
          )}
        </section>
      </main>
    </div>
  );
};

export default AdminBoardingManagerPage;
