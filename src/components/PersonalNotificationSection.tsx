import { useEffect, useState } from 'react';
import { Bell, ChevronDown, ChevronUp } from 'lucide-react';

import {
  getMyPersonalNotifications,
  markPersonalNotificationRead,
  type PersonalNotification,
} from '../lib/personalNotificationService';
import styles from './PersonalNotificationSection.module.css';

const PersonalNotificationSection = () => {
  const [notifications, setNotifications] = useState<PersonalNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [readError, setReadError] = useState(false);

  const loadNotifications = async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      setNotifications(await getMyPersonalNotifications());
    } catch (error) {
      console.error('개인 알림 조회 실패:', error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    getMyPersonalNotifications()
      .then((items) => {
        if (active) setNotifications(items);
      })
      .catch((error) => {
        console.error('개인 알림 조회 실패:', error);
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (notifications.length === 0 && !loadError) return null;
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  const toggleNotificationCenter = async () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (!nextOpen || unreadCount === 0) return;

    setReadError(false);
    const unreadIds = notifications
      .filter((item) => !item.readAt)
      .map((item) => item.id);
    const results = await Promise.allSettled(
      unreadIds.map(markPersonalNotificationRead)
    );
    const readIds = unreadIds.filter(
      (_, index) => results[index].status === 'fulfilled'
    );
    if (readIds.length !== unreadIds.length) setReadError(true);
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) =>
        readIds.includes(item.id) ? { ...item, readAt } : item
      )
    );
  };

  if (loadError && notifications.length === 0) {
    return (
      <section className={`${styles.section} ${styles.errorState}`} aria-live="polite">
        <Bell size={20} />
        <div>
          <h2>개인 알림을 불러오지 못했습니다.</h2>
          <p>잠시 후 다시 시도해주세요.</p>
        </div>
        <button
          type="button"
          className={styles.retryButton}
          disabled={isLoading}
          onClick={() => void loadNotifications()}
        >
          {isLoading ? '불러오는 중' : '다시 시도'}
        </button>
      </section>
    );
  }

  return (
    <section id="personal-notifications" className={styles.section} aria-labelledby="personal-notification-title">
      <button
        type="button"
        className={styles.header}
        onClick={() => void toggleNotificationCenter()}
        aria-expanded={isOpen}
      >
        <Bell size={20} />
        <div>
          <span>나에게 온 알림</span>
          <h2 id="personal-notification-title">개인 알림함</h2>
        </div>
        {unreadCount > 0 && (
          <strong className={styles.unreadBadge}>{unreadCount}</strong>
        )}
        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {readError && (
        <p className={styles.errorMessage} role="alert">
          일부 알림의 읽음 상태를 저장하지 못했습니다. 다시 열어 시도해주세요.
        </p>
      )}
      {isOpen && (
        <div className={styles.list}>
          {notifications.map((notification) => (
            <article
              key={notification.id}
              className={`${styles.item} ${
                !notification.readAt ? styles.unread : ''
              }`}
            >
              <div>
                <strong>{notification.title}</strong>
                <time dateTime={notification.createdAt}>
                  {new Intl.DateTimeFormat('ko-KR', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(notification.createdAt))}
                </time>
              </div>
              <p>{notification.content}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default PersonalNotificationSection;
