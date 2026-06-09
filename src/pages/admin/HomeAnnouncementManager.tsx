import { useCallback, useEffect, useState } from 'react';
import { Archive, Edit2, Eye, EyeOff, Megaphone, Pin, RefreshCw, Save, X } from 'lucide-react';

import { useAdminAuth } from '../../components/AdminAuthProvider';
import {
  createHomeAnnouncement,
  getHomeAnnouncements,
  updateHomeAnnouncement,
  type HomeAnnouncement,
} from '../../lib/announcementService';

import styles from './HomeAnnouncementManager.module.css';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const toDateTimeLocal = (value: string | null) => {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;

  return new Date(date.getTime() - timezoneOffsetMs)
    .toISOString()
    .slice(0, 16);
};

const fromDateTimeLocal = (value: string) => {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
};

let cachedHomeAnnouncements: HomeAnnouncement[] | null = null;

const HomeAnnouncementManager = () => {
  const { session } = useAdminAuth();
  const [announcements, setAnnouncements] = useState<HomeAnnouncement[]>(
    () => cachedHomeAnnouncements ?? []
  );
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(() => cachedHomeAnnouncements === null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editing, setEditing] = useState<HomeAnnouncement | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editStartAt, setEditStartAt] = useState('');
  const [editEndAt, setEditEndAt] = useState('');

  const updateAnnouncements = useCallback(
    (updater: (current: HomeAnnouncement[]) => HomeAnnouncement[]) => {
      setAnnouncements((current) => {
        const next = updater(current);
        cachedHomeAnnouncements = next;
        return next;
      });
    },
    []
  );

  const loadAnnouncements = async () => {
    setRefreshing(true);

    try {
      const items = await getHomeAnnouncements();
      updateAnnouncements(() => items);
    } catch (error) {
      console.error('홈 화면 공지 조회 실패:', error);
      alert(`홈 화면 공지를 불러오지 못했습니다: ${getErrorMessage(error)}`);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    getHomeAnnouncements()
      .then((items) => {
        if (isMounted) updateAnnouncements(() => items);
      })
      .catch((error) => {
        console.error('홈 화면 공지 조회 실패:', error);
        alert(`홈 화면 공지를 불러오지 못했습니다: ${getErrorMessage(error)}`);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [updateAnnouncements]);

  const handleCreate = async () => {
    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();

    if (!session) {
      alert('로그인 정보를 확인할 수 없습니다.');
      return;
    }

    if (!normalizedTitle || !normalizedContent) {
      alert('공지 제목과 내용을 모두 입력해주세요.');
      return;
    }

    setSaving(true);

    try {
      const created = await createHomeAnnouncement({
        title: normalizedTitle,
        content: normalizedContent,
        createdBy: session.user.id,
      });

      updateAnnouncements((current) => [created, ...current]);
      setTitle('');
      setContent('');
      setIsComposerOpen(false);
      alert('홈 화면 공지를 등록했습니다.');
    } catch (error) {
      console.error('홈 화면 공지 등록 실패:', error);
      alert(`홈 화면 공지를 등록하지 못했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const replaceAnnouncement = (next: HomeAnnouncement) => {
    updateAnnouncements((current) =>
      current.map((item) => (item.id === next.id ? next : item))
    );
  };

  const startEditing = (announcement: HomeAnnouncement) => {
    setEditing(announcement);
    setEditTitle(announcement.title);
    setEditContent(announcement.content);
    setEditStartAt(toDateTimeLocal(announcement.publishStartAt));
    setEditEndAt(toDateTimeLocal(announcement.publishEndAt));
  };

  const updateAnnouncement = async (
    announcement: HomeAnnouncement,
    overrides: Partial<{
      title: string;
      content: string;
      isPublished: boolean;
      isArchived: boolean;
      isPinned: boolean;
      publishStartAt: string | null;
      publishEndAt: string | null;
    }>
  ) => {
    setSaving(true);
    try {
      const updated = await updateHomeAnnouncement({
        id: announcement.id,
        title: overrides.title ?? announcement.title,
        content: overrides.content ?? announcement.content,
        isPublished: overrides.isPublished ?? announcement.isPublished,
        isArchived: overrides.isArchived ?? announcement.isArchived,
        isPinned: overrides.isPinned ?? announcement.isPinned,
        publishStartAt:
          overrides.publishStartAt === undefined
            ? announcement.publishStartAt
            : overrides.publishStartAt,
        publishEndAt:
          overrides.publishEndAt === undefined
            ? announcement.publishEndAt
            : overrides.publishEndAt,
      });
      replaceAnnouncement(updated);
      setEditing(null);
    } catch (error) {
      alert(`홈 화면 공지를 저장하지 못했습니다: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.manager}>
      <section className={styles.composer}>
        <div className={styles.composerHeader}>
          <div>
            <h2>홈 화면 공지</h2>
            <p>일반 사용자 홈 화면에 노출할 안내를 작성하고 확인합니다.</p>
          </div>
          <div className={styles.headerActions}>
            <span>등록된 공지 {announcements.length}건</span>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setIsComposerOpen((current) => !current)}
            >
              <Megaphone size={16} />
              {isComposerOpen ? '작성 닫기' : '홈 화면 공지 작성'}
            </button>
          </div>
        </div>

        {isComposerOpen && (
          <div className={styles.form}>
            <label>
              <span>공지 제목</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="예: 버스 신청 마감 안내"
                maxLength={80}
              />
            </label>
            <label>
              <span>공지 내용</span>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="홈 화면에 표시할 공지 내용을 입력해주세요."
                rows={6}
                maxLength={1000}
              />
            </label>
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleCreate}
                disabled={saving}
              >
                <Save size={16} />
                {saving ? '등록 중...' : '공지 등록'}
              </button>
            </div>
          </div>
        )}
      </section>

      <div className={styles.listHeader}>
        <div>
          <h2>홈 화면 공지 목록</h2>
          <p>최근 등록된 공지부터 표시됩니다.</p>
        </div>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => void loadAnnouncements()}
          disabled={refreshing}
        >
          <RefreshCw size={16} />
          새로고침
        </button>
      </div>

      <section className={styles.list}>
        {loading ? (
          <div className={styles.empty}>불러오는 중...</div>
        ) : announcements.length === 0 ? (
          <div className={styles.empty}>등록된 홈 화면 공지가 없습니다.</div>
        ) : (
          announcements.map((announcement) => (
            <article key={announcement.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.publishedBadge}>
                    {announcement.isArchived
                      ? '보관'
                      : announcement.isPublished
                        ? '게시 중'
                        : '숨김'}
                  </span>
                  {announcement.isPinned && <span className={styles.pinnedBadge}>상단 고정</span>}
                  <h3>{announcement.title}</h3>
                </div>
                <time dateTime={announcement.createdAt}>
                  {formatDateTime(announcement.createdAt)}
                </time>
              </div>
              {editing?.id === announcement.id ? (
                <div className={styles.editForm}>
                  <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
                  <textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={5} />
                  <div className={styles.dateGrid}>
                    <label><span>게시 시작</span><input type="datetime-local" value={editStartAt} onChange={(event) => setEditStartAt(event.target.value)} /></label>
                    <label><span>게시 종료</span><input type="datetime-local" value={editEndAt} onChange={(event) => setEditEndAt(event.target.value)} /></label>
                  </div>
                  <div className={styles.cardActions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => setEditing(null)}><X size={15} />취소</button>
                    <button type="button" className={styles.primaryButton} disabled={saving} onClick={() => void updateAnnouncement(announcement, {
                      title: editTitle.trim(),
                      content: editContent.trim(),
                      publishStartAt: fromDateTimeLocal(editStartAt),
                      publishEndAt: fromDateTimeLocal(editEndAt),
                    })}><Save size={15} />저장</button>
                  </div>
                </div>
              ) : (
                <>
                  <p>{announcement.content}</p>
                  <div className={styles.scheduleText}>
                    게시 기간: {announcement.publishStartAt ? formatDateTime(announcement.publishStartAt) : '즉시'} ~ {announcement.publishEndAt ? formatDateTime(announcement.publishEndAt) : '계속'}
                  </div>
                  <div className={styles.cardActions}>
                    <button type="button" onClick={() => startEditing(announcement)}><Edit2 size={15} />수정</button>
                    <button type="button" onClick={() => void updateAnnouncement(announcement, { isPinned: !announcement.isPinned })}><Pin size={15} />{announcement.isPinned ? '고정 해제' : '상단 고정'}</button>
                    <button type="button" onClick={() => void updateAnnouncement(announcement, { isPublished: !announcement.isPublished })}>{announcement.isPublished ? <EyeOff size={15} /> : <Eye size={15} />}{announcement.isPublished ? '숨기기' : '게시하기'}</button>
                    <button type="button" onClick={() => void updateAnnouncement(announcement, { isArchived: true, isPublished: false })}><Archive size={15} />보관</button>
                  </div>
                </>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
};

export default HomeAnnouncementManager;
