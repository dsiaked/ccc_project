import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';

import {
  getPublishedHomeAnnouncements,
  type HomeAnnouncement,
} from '../lib/announcementService';
import styles from './HomeNoticeSection.module.css';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));

const HomeNoticeSection = () => {
  const [announcements, setAnnouncements] = useState<HomeAnnouncement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadAnnouncements = async () => {
      setIsLoading(true);
      setLoadError(false);
      try {
        const items = await getPublishedHomeAnnouncements();
        if (!isMounted) return;

        setAnnouncements(items);
      } catch (error) {
        console.error('홈 화면 공지 로드 실패:', error);
        if (isMounted) setLoadError(true);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadAnnouncements();

    return () => {
      isMounted = false;
    };
  }, [loadAttempt]);

  if (!isLoading && !loadError && announcements.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.iconBox}>
            <Megaphone size={18} />
          </div>
          <div>
            <p>NOTICE</p>
            <h2>홈 화면 공지</h2>
          </div>
        </div>

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
            {announcements.map((announcement) => (
              <article className={styles.noticeItem} key={announcement.id}>
                <div className={styles.noticeMeta}>
                  <span>{formatDate(announcement.createdAt)}</span>
                </div>
                <div className={styles.noticeContent}>
                  <h3>{announcement.title}</h3>
                  <p>{announcement.content}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default HomeNoticeSection;
