import { useEffect, useState } from 'react';
import { ArrowLeft, Megaphone, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminHeader from './AdminHeader';
import { getAdminRole } from '../../lib/adminService';
import {
  createHomeAnnouncement,
  type HomeAnnouncement,
} from '../../lib/announcementService';
import { supabase } from '../../lib/supabase';

import styles from './AdminHomeAnnouncementPage.module.css';

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

const AdminHomeAnnouncementPage = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [latestNotice, setLatestNotice] = useState<HomeAnnouncement | null>(
    null
  );

  useEffect(() => {
    let isMounted = true;

    const checkAdminRole = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          navigate('/admin/login');
          return;
        }

        const adminRole = await getAdminRole(session.user.id);

        if (!adminRole || adminRole.role !== 'global_admin') {
          if (isMounted) {
            alert('전체 관리자만 접근할 수 있습니다.');
            navigate('/');
          }
          return;
        }

        if (isMounted) {
          setAdminUserId(session.user.id);
        }
      } catch (error) {
        console.error('전체 관리자 권한 확인 실패:', error);

        if (isMounted) {
          alert('관리자 정보를 확인할 수 없습니다.');
          navigate('/admin/login');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkAdminRole();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const handleCreateNotice = async () => {
    const normalizedTitle = noticeTitle.trim();
    const normalizedContent = noticeContent.trim();

    if (!adminUserId) {
      alert('로그인 정보를 확인할 수 없습니다.');
      return;
    }

    if (!normalizedTitle || !normalizedContent) {
      alert('공지 제목과 내용을 모두 입력해주세요.');
      return;
    }

    setNoticeSaving(true);

    try {
      const createdNotice = await createHomeAnnouncement({
        title: normalizedTitle,
        content: normalizedContent,
        createdBy: adminUserId,
      });

      setLatestNotice(createdNotice);
      setNoticeTitle('');
      setNoticeContent('');
      alert('홈 화면 공지를 등록했습니다.');
    } catch (error) {
      console.error('홈 공지 등록 실패:', error);
      alert(`홈 공지 등록 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
    } finally {
      setNoticeSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <AdminHeader />
        <main className={styles.main}>
          <p>로딩 중...</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <AdminHeader />

      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/admin/global')}
        >
          <ArrowLeft size={18} />
          전체 관리자 화면
        </button>

        <section className={styles.header}>
          <div className={styles.headerIcon}>
            <Megaphone size={26} />
          </div>
          <div>
            <h1>홈 화면 공지 작성</h1>
            <p>등록한 공지는 홈 화면 공지사항 영역에 바로 표시됩니다.</p>
          </div>
        </section>

        <section className={styles.editorPanel}>
          <div className={styles.field}>
            <label>공지 제목</label>
            <input
              type="text"
              value={noticeTitle}
              onChange={(event) => setNoticeTitle(event.target.value)}
              placeholder="예: 버스 신청 마감 안내"
              maxLength={80}
            />
          </div>

          <div className={styles.field}>
            <label>공지 내용</label>
            <textarea
              value={noticeContent}
              onChange={(event) => setNoticeContent(event.target.value)}
              placeholder="홈 화면에 표시할 공지 내용을 입력해주세요."
              rows={8}
              maxLength={1000}
            />
          </div>

          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleCreateNotice}
              disabled={noticeSaving}
            >
              <Save size={16} />
              {noticeSaving ? '등록 중...' : '공지 등록'}
            </button>
          </div>
        </section>

        {latestNotice && (
          <section className={styles.latestNoticeBox}>
            <strong>최근 등록 공지</strong>
            <h2>{latestNotice.title}</h2>
            <p>{latestNotice.content}</p>
          </section>
        )}
      </main>
    </div>
  );
};

export default AdminHomeAnnouncementPage;
