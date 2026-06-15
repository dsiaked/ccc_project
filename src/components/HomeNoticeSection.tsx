import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Bell, ChevronDown, ChevronRight, ChevronUp, Megaphone } from 'lucide-react';
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
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));

const COLLAPSED_NOTICE_COUNT = 3;

type NoticeItem =
  | { kind: 'announcement'; item: HomeAnnouncement }
  | { kind: 'campus'; item: CampusRequest }
  | { kind: 'personal'; item: PersonalNotification & { groupedIds?: string[]; unreadCount?: number } };

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
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let currentSession: Session | null = null;

    const fetchCampusNotices = (session: Session | null) =>
      session
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

    const refreshPersonalNotifications = async () => {
      const notifications = currentSession
        ? await getMyPersonalNotifications()
        : [];
      if (isMounted) setPersonalNotifications(notifications);
    };

    const refreshCampusNotices = async () => {
      const result = await fetchCampusNotices(currentSession);
      if (!isMounted) return;
      setCampusNotices(result.notices);
      setUnreadCampusNoticeIds(result.unreadIds);
    };

    const loadNotices = async () => {
      setIsLoading(true);
      setLoadError(false);
      setReadError(false);

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      currentSession = sessionData.session;

      const results = await Promise.allSettled([
        getPublishedHomeAnnouncements(),
        currentSession ? getMyPersonalNotifications() : Promise.resolve([]),
        fetchCampusNotices(currentSession),
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
        { event: '*', schema: 'public', table: 'personal_notifications' },
        () =>
          void refreshPersonalNotifications().catch((error) =>
            console.error('Failed to refresh personal notifications:', error)
          )
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campus_requests' },
        () =>
          void refreshCampusNotices().catch((error) =>
            console.error('Failed to refresh campus notices:', error)
          )
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [loadAttempt]);

  const groupedPersonalNotifications = useMemo<(PersonalNotification & { groupedIds?: string[]; unreadCount?: number })[]>(() => {
    const inquiryGroups: Record<string, PersonalNotification[]> = {};
    const nonInquiryNotifications: PersonalNotification[] = [];

    for (const notification of personalNotifications) {
      if (notification.category === 'inquiry') {
        const title = notification.content.split('\n\n')[0] || '';
        if (!inquiryGroups[title]) {
          inquiryGroups[title] = [];
        }
        inquiryGroups[title].push(notification);
      } else {
        nonInquiryNotifications.push(notification);
      }
    }

    const processedNotifications: (PersonalNotification & { groupedIds?: string[]; unreadCount?: number })[] = [];

    for (const group of Object.values(inquiryGroups)) {
      group.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const latest = group[0];
      const unreadCount = group.filter((n) => !n.readAt).length;

      processedNotifications.push({
        ...latest,
        groupedIds: group.map((n) => n.id),
        unreadCount,
      });
    }

    return [...processedNotifications, ...nonInquiryNotifications];
  }, [personalNotifications]);

  const notices = useMemo<NoticeItem[]>(
    () =>
      [
        ...announcements.map(
          (item): NoticeItem => ({ kind: 'announcement', item })
        ),
        ...campusNotices.map(
          (item): NoticeItem => ({ kind: 'campus', item })
        ),
        ...groupedPersonalNotifications.map(
          (item): NoticeItem => ({ kind: 'personal', item })
        ),
      ].sort(
        (a, b) =>
          new Date(b.item.createdAt).getTime() -
          new Date(a.item.createdAt).getTime()
      ),
    [announcements, campusNotices, groupedPersonalNotifications]
  );
  const visibleNotices = isExpanded
    ? notices
    : notices.slice(0, COLLAPSED_NOTICE_COUNT);
  const hasMoreNotices = notices.length > COLLAPSED_NOTICE_COUNT;

  const markPersonalNoticeRead = async (notification: PersonalNotification & { groupedIds?: string[] }) => {
    if (notification.readAt && (!notification.groupedIds || notification.groupedIds.length === 0)) return;

    setReadError(false);
    try {
      const idsToMark = notification.groupedIds || [notification.id];
      await Promise.all(idsToMark.map(id => markPersonalNotificationRead(id)));
      const readAt = new Date().toISOString();
      setPersonalNotifications((current) =>
        current.map((item) =>
          idsToMark.includes(item.id) ? { ...item, readAt } : item
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
    <section id="notices" className={styles.section} tabIndex={-1}>
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
            {visibleNotices.map(({ kind, item }) => {
              const personalItem = kind === 'personal' ? item : null;
              const campusItem = kind === 'campus' ? item : null;
              const isPersonal = personalItem !== null;
              const isCampus = campusItem !== null;
              const opensInquiry =
                isPersonal &&
                personalItem.category === 'inquiry';
              const isUnread =
                ((personalItem?.unreadCount ?? 0) > 0) ||
                (campusItem !== null && unreadCampusNoticeIds.has(campusItem.id));
              const isActionable = opensInquiry || (isCampus && isUnread);
              const tagLabel = isPersonal
                ? '개인 알림'
                : isCampus
                  ? '캠퍼스 공지'
                  : '전체 공지';

              const handleNoticeClick = () => {
                if (
                  opensInquiry
                ) {
                  void markPersonalNoticeRead(personalItem);
                  navigate('/inquiries');
                } else if (campusItem) {
                  void markCampusNoticeRead(campusItem);
                }
              };

              return (
                <article
                  className={`${styles.noticeItem} ${
                    isUnread ? styles.unreadNotice : ''
                  } ${isActionable ? styles.actionableNotice : ''} ${
                    opensInquiry ? styles.linkedNotice : ''
                  }`}
                  key={`${kind}-${item.id}`}
                  onClick={handleNoticeClick}
                  onKeyDown={(event) => {
                    if (
                      isActionable &&
                      (event.key === 'Enter' || event.key === ' ')
                    ) {
                      event.preventDefault();
                      handleNoticeClick();
                    }
                  }}
                  role={isActionable ? 'button' : undefined}
                  tabIndex={isActionable ? 0 : undefined}
                >
                  <div className={styles.noticeMeta}>
                    <span>{formatDate(item.createdAt)}</span>
                    <div
                      className={`${styles.noticeTag} ${
                        isPersonal
                          ? styles.personalTag
                          : isCampus
                            ? styles.campusTag
                            : styles.publicTag
                      }`}
                    >
                      {isPersonal && <Bell size={12} />}
                      {tagLabel}
                      {isUnread && <i aria-label="읽지 않음" />}
                    </div>
                  </div>
                  <div className={styles.noticeContent}>
                    <h3>
                      {opensInquiry
                        ? (() => {
                            const category = personalItem.content.split('\n\n')[0] || '문의';
                            const unreadSuffix = (personalItem.unreadCount ?? 0) > 1
                              ? ` (${personalItem.unreadCount})`
                              : '';
                            return `[문의 답변] ${category}${unreadSuffix}`;
                          })()
                        : personalItem && (personalItem.unreadCount ?? 0) > 1
                          ? `${personalItem.title} (${personalItem.unreadCount})`
                          : item.title}
                    </h3>
                    {opensInquiry ? (() => {
                      const parts = personalItem.content.split('\n\n');
                      if (parts.length >= 3) {
                        const [, reply, footerText] = parts;
                        return (
                          <div className={styles.inquiryNotificationContent}>
                            <div className={styles.inquiryReplyBox}>
                              <p className={styles.inquiryReplyText}>{reply}</p>
                            </div>
                            <span className={styles.inquiryFooter}>{footerText}</span>
                          </div>
                        );
                      }
                      return <p>{item.content}</p>;
                    })() : (
                      <p>{item.content}</p>
                    )}
                  </div>
                  {opensInquiry && (
                    <ChevronRight
                      className={styles.noticeChevron}
                      size={18}
                      aria-hidden="true"
                    />
                  )}
                </article>
              );
            })}
            {hasMoreNotices && (
              <button
                type="button"
                className={styles.expandButton}
                onClick={() => setIsExpanded((current) => !current)}
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <>
                    공지 접기 <ChevronUp size={16} />
                  </>
                ) : (
                  <>
                    공지 전체보기 ({notices.length}) <ChevronDown size={16} />
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default HomeNoticeSection;
