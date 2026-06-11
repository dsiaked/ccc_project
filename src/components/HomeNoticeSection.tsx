import { useEffect, useMemo, useState } from 'react';
import { Bell, Megaphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  getPublishedHomeAnnouncements,
  type HomeAnnouncement,
} from '../lib/announcementService';
import {
  getAdminRoles,
  getGlobalCampusNotices,
  type CampusRequest,
} from '../lib/adminService';
import {
  getUnreadCampusNotices,
  markCampusNoticesRead,
} from '../lib/adminNoticeReadState';
import {
  getMyPersonalNotifications,
  markPersonalNotificationRead,
  type PersonalNotification,
} from '../lib/personalNotificationService';
import { supabase } from '../lib/supabase';
import styles from './HomeNoticeSection.module.css';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));

type NoticeItem =
  | { kind: 'announcement'; item: HomeAnnouncement }
  | { kind: 'campus'; item: CampusRequest }
  | { kind: 'personal'; item: PersonalNotification };

const HomeNoticeSection = () => {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<HomeAnnouncement[]>([]);
  const [campusNotices, setCampusNotices] = useState<CampusRequest[]>([]);
  const [unreadCampusNoticeIds, setUnreadCampusNoticeIds] = useState<
    Set<string>
  >(new Set());
  const [personalNotifications, setPersonalNotifications] = useState<
    PersonalNotification[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [readError, setReadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadNotices = async () => {
      setIsLoading(true);
      setLoadError(false);
      setReadError(false);

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      const session = sessionData.session;
      const campusNoticePromise = session
        ? getAdminRoles(session.user.id).then(async (roles) => {
            const isCampusAdmin = roles.some(
              (role) => role.role === 'campus_admin'
            );
            const isGlobalAdmin = roles.some(
              (role) => role.role === 'global_admin'
            );

            if (!isCampusAdmin || isGlobalAdmin) {
              return { notices: [], unreadIds: new Set<string>() };
            }

            const result = await getGlobalCampusNotices();
            if (result.error) throw result.error;

            const notices = result.data ?? [];
            const unread = await getUnreadCampusNotices(
              session.user.id,
              notices
            );

            return {
              notices,
              unreadIds: new Set(unread.map((notice) => notice.id)),
            };
          })
        : Promise.resolve({ notices: [], unreadIds: new Set<string>() });

      const results = await Promise.allSettled([
        getPublishedHomeAnnouncements(),
        session ? getMyPersonalNotifications() : Promise.resolve([]),
        campusNoticePromise,
      ]);

      if (!isMounted) return;

      if (sessionError) {
        console.error('로그인 상태 확인 실패:', sessionError);
      }

      const [announcementResult, personalResult, campusResult] = results;
      if (announcementResult.status === 'fulfilled') {
        setAnnouncements(announcementResult.value);
      } else {
        console.error('홈 화면 공지 조회 실패:', announcementResult.reason);
      }

      if (personalResult.status === 'fulfilled') {
        setPersonalNotifications(personalResult.value);
      } else {
        console.error('개인 알림 조회 실패:', personalResult.reason);
      }

      if (campusResult.status === 'fulfilled') {
        setCampusNotices(campusResult.value.notices);
        setUnreadCampusNoticeIds(campusResult.value.unreadIds);
      } else {
        console.error('캠퍼스 공지 조회 실패:', campusResult.reason);
      }

      setLoadError(results.every((result) => result.status === 'rejected'));
      setIsLoading(false);
    };

    void loadNotices();
    const channel = supabase
      .channel('home-notices')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'personal_notifications' },
        () => void loadNotices()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campus_requests' },
        () => void loadNotices()
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [loadAttempt]);

  const notices = useMemo<NoticeItem[]>(
    () =>
      [
        ...announcements.map(
          (item): NoticeItem => ({ kind: 'announcement', item })
        ),
        ...campusNotices.map(
          (item): NoticeItem => ({ kind: 'campus', item })
        ),
        ...personalNotifications.map(
          (item): NoticeItem => ({ kind: 'personal', item })
        ),
      ].sort(
        (a, b) =>
          new Date(b.item.createdAt).getTime() -
          new Date(a.item.createdAt).getTime()
      ),
    [announcements, campusNotices, personalNotifications]
  );

  const markPersonalNoticeRead = async (notification: PersonalNotification) => {
    if (notification.readAt) return;

    setReadError(false);
    try {
      await markPersonalNotificationRead(notification.id);
      const readAt = new Date().toISOString();
      setPersonalNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, readAt } : item
        )
      );
      window.dispatchEvent(new CustomEvent('personal-notification-read'));
    } catch (error) {
      console.error('개인 알림 읽음 처리 실패:', error);
      setReadError(true);
    }
  };

  const markCampusNoticeRead = async (notice: CampusRequest) => {
    if (!unreadCampusNoticeIds.has(notice.id)) return;

    setReadError(false);
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return;

      await markCampusNoticesRead(userId, [notice.id]);
      setUnreadCampusNoticeIds((current) => {
        const next = new Set(current);
        next.delete(notice.id);
        return next;
      });
    } catch (error) {
      console.error('캠퍼스 공지 읽음 처리 실패:', error);
      setReadError(true);
    }
  };

  if (!isLoading && !loadError && notices.length === 0) return null;

  return (
    <section id="notices" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.iconBox}>
            <Megaphone size={18} />
          </div>
          <div>
            <p>NOTICE</p>
            <h2>공지</h2>
          </div>
        </div>

        {readError && (
          <p className={styles.readError} role="alert">
            개인 알림을 읽음 처리하지 못했습니다. 캠퍼스 공지 확인도 실패했을
            수 있습니다. 다시 눌러주세요.
          </p>
        )}

        {isLoading ? (
          <div className={styles.loading}>공지를 불러오는 중...</div>
        ) : loadError ? (
          <div className={styles.errorState} role="alert">
            <span>공지를 불러오지 못했습니다.</span>
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            >
              다시 시도
            </button>
          </div>
        ) : (
          <div className={styles.noticeList}>
            {notices.map(({ kind, item }) => {
              const isPersonal = kind === 'personal';
              const isCampus = kind === 'campus';
              const isUnread =
                (isPersonal && !(item as PersonalNotification).readAt) ||
                (isCampus && unreadCampusNoticeIds.has(item.id));
              const tagLabel = isPersonal
                ? '개인 알림'
                : isCampus
                  ? '캠퍼스 공지'
                  : '전체 공지';

              const handleNoticeClick = () => {
                if (
                  isPersonal &&
                  (item as PersonalNotification).category === 'inquiry'
                ) {
                  void markPersonalNoticeRead(item as PersonalNotification);
                  navigate('/inquiries');
                } else if (isCampus) {
                  void markCampusNoticeRead(item as CampusRequest);
                }
              };

              return (
                <article
                  className={`${styles.noticeItem} ${
                    isUnread ? styles.unreadNotice : ''
                  }`}
                  key={`${kind}-${item.id}`}
                  onClick={handleNoticeClick}
                >
                  <div className={styles.noticeMeta}>
                    <span>{formatDate(item.createdAt)}</span>
                    <button
                      type="button"
                      className={`${styles.noticeTag} ${
                        isPersonal
                          ? styles.personalTag
                          : isCampus
                            ? styles.campusTag
                            : styles.publicTag
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isPersonal) {
                          void markPersonalNoticeRead(
                            item as PersonalNotification
                          );
                        } else if (isCampus) {
                          void markCampusNoticeRead(item as CampusRequest);
                        }
                      }}
                      aria-label={`${tagLabel}${isUnread ? ' 미확인' : ''}`}
                    >
                      {isPersonal && <Bell size={12} />}
                      {tagLabel}
                      {isUnread && <i aria-label="읽지 않음" />}
                    </button>
                  </div>
                  <div className={styles.noticeContent}>
                    <h3>{item.title}</h3>
                    <p>{item.content}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default HomeNoticeSection;
