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

  useEffect(() => {
    getMyPersonalNotifications()
      .then(setNotifications)
      .catch((error) => console.error('개인 알림 조회 실패:', error));
  }, []);

  if (notifications.length === 0) return null;
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  const toggleNotificationCenter = async () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (!nextOpen || unreadCount === 0) return;

    const unreadIds = notifications
      .filter((item) => !item.readAt)
      .map((item) => item.id);
    await Promise.all(unreadIds.map(markPersonalNotificationRead));
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) =>
        unreadIds.includes(item.id) ? { ...item, readAt } : item
      )
    );
  };

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
