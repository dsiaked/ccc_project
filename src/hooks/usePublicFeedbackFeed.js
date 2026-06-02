import { useEffect, useMemo, useState } from 'react';
import { loadFirebaseApi, scheduleAfterInitialPaint } from '../utils/firebaseApi';

const getTimestamp = value => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'number') return value;
  return new Date(value).getTime() || 0;
};

const sortRecent = items => (
  items.sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt))
);

export default function usePublicFeedbackFeed({ enabled }) {
  const [publishedFeedbacks, setPublishedFeedbacks] = useState([]);
  const [publicComments, setPublicComments] = useState([]);

  useEffect(() => {
    if (!enabled) return undefined;

    let unsubscribe;
    let isCancelled = false;

    const cancelSchedule = scheduleAfterInitialPaint(() => {
      loadFirebaseApi().then(({ collection, db, limit, onSnapshot, query, where }) => {
        if (isCancelled) return;

        unsubscribe = onSnapshot(
          query(
            collection(db, 'tour_feedbacks'),
            where('isPublished', '==', true),
            limit(30),
          ),
          snapshot => {
            const nextFeedbacks = sortRecent(snapshot.docs.map(feedbackDoc => ({
              id: `feedback-${feedbackDoc.id}`,
              source: 'feedback',
              sourceLabel: '여행자 소감',
              ...feedbackDoc.data(),
            })));
            setPublishedFeedbacks(nextFeedbacks);
          },
          error => {
            console.error('공개 소감 로드 실패:', error);
            setPublishedFeedbacks([]);
          },
        );
      });
    });

    return () => {
      isCancelled = true;
      cancelSchedule();
      unsubscribe?.();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    let unsubscribe;
    let isCancelled = false;

    const cancelSchedule = scheduleAfterInitialPaint(() => {
      loadFirebaseApi().then(({ collection, db, limit, onSnapshot, query, where }) => {
        if (isCancelled) return;

        unsubscribe = onSnapshot(
          query(
            collection(db, 'comments'),
            where('isPublished', '==', true),
            limit(30),
          ),
          snapshot => {
            const nextComments = sortRecent(snapshot.docs
              .map(commentDoc => {
                const comment = commentDoc.data();
                const content = String(comment.content || '').trim();

                if (!content) return null;

                return {
                  id: `comment-${commentDoc.id}`,
                  name: comment.name,
                  feedback: content,
                  createdAt: comment.createdAt,
                  source: 'comment',
                  sourceLabel: '작품 댓글',
                  symbolId: comment.artistId,
                };
              })
              .filter(Boolean));
            setPublicComments(nextComments);
          },
          error => {
            console.error('작품 댓글 로드 실패:', error);
            setPublicComments([]);
          },
        );
      });
    });

    return () => {
      isCancelled = true;
      cancelSchedule();
      unsubscribe?.();
    };
  }, [enabled]);

  return useMemo(
    () => sortRecent([...publishedFeedbacks, ...publicComments]).slice(0, 30),
    [publishedFeedbacks, publicComments],
  );
}
