import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  MapPinned,
  Megaphone,
  MessageSquareText,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { db, doc, getDoc, setDoc } from '../firebase';
import { symbolData } from '../data/symbolData';
import { DEFAULT_MAP_PINS } from './MapArea';
import AdminAnnouncementSection from './admin/AdminAnnouncementSection';
import AdminCoordinatesSection from './admin/AdminCoordinatesSection';
import AdminFeatureTabs from './admin/AdminFeatureTabs';
import AdminLinksSection from './admin/AdminLinksSection';
import AdminMapSection from './admin/AdminMapSection';
import AdminRecordsSection from './admin/AdminRecordsSection';
import AdminStats from './admin/AdminStats';

const adminLinks = [
  { label: '관리자 대시보드', path: '/admin-panel', desc: '기록 확인과 지도 핀 위치를 관리합니다.' },
  { label: '전체 작품 열기', path: '/admin', desc: '하트, 나누기, 십자가 작품을 모두 엽니다.' },
  { label: '하트 작품 열기', path: '/admin/heart', desc: '하트 카테고리 작품만 엽니다.' },
  { label: '나누기 작품 열기', path: '/admin/divide', desc: '나누기 카테고리 작품만 엽니다.' },
  { label: '십자가 작품 열기', path: '/admin/cross', desc: '십자가 카테고리 작품만 엽니다.' },
  { label: '기본 3개 열기', path: '/unlock/basic', desc: '각 카테고리 대표 작품 1개씩 엽니다.' },
  { label: '물음표 QR 페이지', path: '/?symbol=question', desc: '마지막 참여 페이지로 진입합니다.' },
  { label: '방문 기록 초기화', path: '/?reset=true', desc: '현재 기기의 발견 상태를 초기화합니다.' },
];

const recordTabs = [
  { id: 'visitors', label: '발견 기록', icon: Users },
  { id: 'artworks', label: '작품별', icon: MapPinned },
  { id: 'comments', label: '댓글', icon: MessageSquareText },
  { id: 'feedbacks', label: '소감', icon: Megaphone },
];

const symbolOrder = Object.keys(symbolData);

const getTimestamp = value => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'number') return value;
  return new Date(value).getTime() || 0;
};

const formatDate = value => {
  const timestamp = getTimestamp(value);
  if (!timestamp) return '기록 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};

const getSymbolLabel = id => {
  if (id === 'question') return '물음표 부스';
  const symbol = symbolData[id];
  return symbol?.qr?.title || symbol?.title || id;
};

const getCategoryLabel = category => ({
  heart: '하트',
  divide: '나누기',
  cross: '십자가',
  question: '물음표',
}[category] || category || '기타');

const getRecordSymbolId = record => record?.symbolId || record?.artistId || '';

const getViewedSymbols = symbols => (
  symbolOrder
    .filter(id => symbols?.[id])
    .map(id => ({ id, label: getSymbolLabel(id) }))
);

const normalizeSearchText = value => String(value || '').toLowerCase().trim();

export default function AdminPanel({ onBack }) {
  const [pins, setPins] = useState(DEFAULT_MAP_PINS);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingPins, setIsLoadingPins] = useState(true);
  const [isLoadingVisitors, setIsLoadingVisitors] = useState(true);
  const [visitors, setVisitors] = useState([]);
  const [comments, setComments] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [activeFeature, setActiveFeature] = useState('records');
  const [activeTab, setActiveTab] = useState('visitors');
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [recordError, setRecordError] = useState('');
  const [announcementDraft, setAnnouncementDraft] = useState({
    title: '공지',
    message: '',
    isActive: false,
  });
  const [isLoadingAnnouncement, setIsLoadingAnnouncement] = useState(true);
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);

  const baseUrl = window.location.origin;

  useEffect(() => {
    document.body.classList.add('admin-shell');
    return () => document.body.classList.remove('admin-shell');
  }, []);

  const showNotification = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    window.setTimeout(() => {
      setNotification({ message: '', type: '' });
    }, 2800);
  }, []);

  const loadPins = useCallback(async () => {
    setIsLoadingPins(true);
    try {
      const pinsDocRef = doc(db, 'settings', 'map_pins');
      const pinsDocSnap = await getDoc(pinsDocRef);

      if (pinsDocSnap.exists()) {
        const cloudPins = pinsDocSnap.data().pins;
        if (Array.isArray(cloudPins) && cloudPins.length > 0) {
          const mergedPins = DEFAULT_MAP_PINS.map(defaultPin => {
            const cloudMatch = cloudPins.find(pin => pin.id === defaultPin.id);
            return cloudMatch ? { ...defaultPin, ...cloudMatch } : defaultPin;
          });
          setPins(mergedPins);
        }
      }
    } catch (err) {
      console.error('지도 핀 데이터 로드 실패:', err);
      showNotification('지도 핀 데이터를 불러오지 못했습니다.', 'error');
    } finally {
      setIsLoadingPins(false);
    }
  }, [showNotification]);

  const loadAnnouncement = useCallback(async () => {
    setIsLoadingAnnouncement(true);
    try {
      const announcementDocRef = doc(db, 'settings', 'announcement');
      const announcementDocSnap = await getDoc(announcementDocRef);

      if (announcementDocSnap.exists()) {
        const data = announcementDocSnap.data();
        setAnnouncementDraft({
          title: String(data.title || '공지'),
          message: String(data.message || ''),
          isActive: !!data.isActive,
        });
      }
    } catch (err) {
      console.error('공지 데이터 로드 실패:', err);
      showNotification('공지 데이터를 불러오지 못했습니다.', 'error');
    } finally {
      setIsLoadingAnnouncement(false);
    }
  }, [showNotification]);

  const loadVisitors = useCallback(async () => {
    setIsLoadingVisitors(true);
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const nextVisitors = snapshot.docs
        .map(userDoc => {
          const data = userDoc.data();
          const viewedSymbols = getViewedSymbols(data.symbols || {});
          return {
            id: userDoc.id,
            symbols: data.symbols || {},
            viewedSymbols,
            updatedAt: data.updatedAt,
          };
        })
        .sort((a, b) => getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt));
      setVisitors(nextVisitors);
    } catch (err) {
      console.error('방문 기록 로드 실패:', err);
      setRecordError('방문 기록을 불러오지 못했습니다. Firestore 읽기 권한을 확인해 주세요.');
    } finally {
      setIsLoadingVisitors(false);
    }
  }, []);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      loadPins();
      loadAnnouncement();
      loadVisitors();
    }, 0);

    const unsubscribeComments = onSnapshot(
      collection(db, 'comments'),
      snapshot => {
        const nextComments = snapshot.docs
          .map(commentDoc => ({ id: commentDoc.id, ...commentDoc.data() }))
          .sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));
        setComments(nextComments);
      },
      err => {
        console.error('댓글 기록 로드 실패:', err);
        setRecordError('댓글 기록을 불러오지 못했습니다. Firestore 읽기 권한을 확인해 주세요.');
      },
    );

    const unsubscribeFeedbacks = onSnapshot(
      collection(db, 'tour_feedbacks'),
      snapshot => {
        const nextFeedbacks = snapshot.docs
          .map(feedbackDoc => ({ id: feedbackDoc.id, ...feedbackDoc.data() }))
          .sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));
        setFeedbacks(nextFeedbacks);
      },
      err => {
        console.error('소감 기록 로드 실패:', err);
        setRecordError('소감 기록을 불러오지 못했습니다. Firestore 읽기 권한을 확인해 주세요.');
      },
    );

    return () => {
      window.clearTimeout(initialLoadId);
      unsubscribeComments();
      unsubscribeFeedbacks();
    };
  }, [loadAnnouncement, loadPins, loadVisitors]);

  const visitorRecords = useMemo(
    () => visitors.filter(visitor => visitor.viewedSymbols.length > 0),
    [visitors],
  );

  const discoveryCountDistribution = useMemo(() => {
    const counts = visitorRecords.reduce((acc, visitor) => {
      const discoveredCount = visitor.viewedSymbols.length;
      acc[discoveredCount] = (acc[discoveredCount] || 0) + 1;
      return acc;
    }, {});
    const maxVisitors = Math.max(0, ...Object.values(counts));

    return Array.from({ length: symbolOrder.length }, (_, index) => {
      const count = index + 1;
      const visitorsForCount = counts[count] || 0;

      return {
        count,
        visitors: visitorsForCount,
        percent: maxVisitors ? Math.max(8, Math.round((visitorsForCount / maxVisitors) * 100)) : 0,
      };
    }).filter(item => item.visitors > 0);
  }, [visitorRecords]);

  const completedVisitors = useMemo(
    () => visitors.filter(visitor => {
      const symbols = visitor.symbols || {};
      const hasHeart = symbols.heart_kymin || symbols.heart_yewon || symbols.heart_eunhye || symbols.heart_jihoon || symbols.heart_eunchae;
      const hasDivide = symbols.divide_kyeomjun || symbols.divide_yewon;
      const hasCross = symbols.cross || symbols.cross_jihoon;
      return hasHeart && hasDivide && hasCross;
    }).length,
    [visitors],
  );

  const publishedFeedbackCount = feedbacks.filter(feedback => feedback.isPublished).length;
  const hiddenFeedbackCount = feedbacks.length - publishedFeedbackCount;
  const publishedCommentCount = comments.filter(comment => comment.isPublished).length;
  const hiddenCommentCount = comments.length - publishedCommentCount;

  const artworkSummaries = useMemo(() => (
    symbolOrder.map(id => {
      const symbol = symbolData[id];
      const artworkComments = comments.filter(comment => getRecordSymbolId(comment) === id);
      const discoveredVisitors = visitorRecords.filter(visitor => visitor.symbols?.[id]).length;
      const publishedCommentsForArtwork = artworkComments.filter(comment => comment.isPublished);

      return {
        id,
        title: symbol?.qr?.title || symbol?.title || id,
        artist: symbol?.artist || '작가 정보 없음',
        category: getCategoryLabel(symbol?.category),
        desc: symbol?.qr?.desc || symbol?.map?.undiscovered?.desc || '',
        meaning: symbol?.qr?.meaning || symbol?.map?.discovered?.message || '',
        location: symbol?.qr?.location || symbol?.map?.undiscovered?.hint || '',
        discoveredVisitors,
        comments: artworkComments.length,
        publishedComments: publishedCommentsForArtwork.length,
        recentComments: artworkComments.slice(0, 3),
      };
    })
  ), [comments, visitorRecords]);

  const stats = [
    { label: '발견 방문', value: visitorRecords.length, desc: 'QR을 1개 이상 발견', chart: discoveryCountDistribution },
    { label: '3분류 완료', value: completedVisitors, desc: '하트, 나누기, 십자가' },
    {
      label: '소감',
      value: feedbacks.length,
      desc: '참여 페이지 제출',
      breakdown: [
        { label: '공개', value: publishedFeedbackCount, tone: 'text-cyan-200' },
        { label: '비공개', value: hiddenFeedbackCount, tone: 'text-amber-200' },
      ],
    },
    {
      label: '댓글',
      value: comments.length,
      desc: '작품별 감상 댓글',
      breakdown: [
        { label: '공개', value: publishedCommentCount, tone: 'text-cyan-200' },
        { label: '비공개', value: hiddenCommentCount, tone: 'text-amber-200' },
      ],
    },
  ];

  const tabCounts = {
    visitors: visitorRecords.length,
    artworks: artworkSummaries.length,
    comments: `${publishedCommentCount}/${comments.length}`,
    feedbacks: feedbacks.length,
  };

  const filteredVisitors = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    if (!query) return visitorRecords;
    return visitorRecords.filter(visitor => {
      const target = [
        visitor.id,
        formatDate(visitor.updatedAt),
        visitor.viewedSymbols.map(symbol => symbol.label).join(' '),
      ].join(' ');
      return normalizeSearchText(target).includes(query);
    });
  }, [searchQuery, visitorRecords]);

  const filteredArtworkSummaries = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    if (!query) return artworkSummaries;
    return artworkSummaries.filter(artwork => {
      const target = [
        artwork.title,
        artwork.artist,
        artwork.category,
        artwork.desc,
        artwork.meaning,
        artwork.location,
        artwork.recentComments.map(comment => `${comment.name} ${comment.content}`).join(' '),
      ].join(' ');
      return normalizeSearchText(target).includes(query);
    });
  }, [artworkSummaries, searchQuery]);

  const filteredComments = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    if (!query) return comments;
    return comments.filter(comment => {
      const target = [
        comment.name,
        comment.content,
        getSymbolLabel(getRecordSymbolId(comment)),
        comment.isPublished ? '공개' : '비공개',
        formatDate(comment.createdAt),
      ].join(' ');
      return normalizeSearchText(target).includes(query);
    });
  }, [comments, searchQuery]);

  const filteredFeedbacks = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    if (!query) return feedbacks;
    return feedbacks.filter(feedback => {
      const target = [feedback.name, feedback.feedback, feedback.isPublished ? '공개' : '비공개', formatDate(feedback.createdAt)].join(' ');
      return normalizeSearchText(target).includes(query);
    });
  }, [feedbacks, searchQuery]);

  const handlePinMove = (id, newLeft, newTop) => {
    setPins(prevPins =>
      prevPins.map(pin =>
        pin.id === id
          ? {
              ...pin,
              pinLeft: newLeft,
              pinTop: newTop,
              textLeft: `${parseFloat(newLeft) + (parseFloat(pin.textLeft) - parseFloat(pin.pinLeft))}%`,
              textTop: `${parseFloat(newTop) + (parseFloat(pin.textTop) - parseFloat(pin.pinTop))}%`,
            }
          : pin,
      ),
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const pinsDocRef = doc(db, 'settings', 'map_pins');
      await setDoc(pinsDocRef, { pins }, { merge: true });
      showNotification('지도 핀 위치가 저장되었습니다.');
    } catch (err) {
      console.error('지도 핀 저장 실패:', err);
      showNotification('지도 핀 저장에 실패했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnnouncementChange = event => {
    const { name, type, checked, value } = event.target;
    setAnnouncementDraft(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSaveAnnouncement = async () => {
    const message = announcementDraft.message.trim();
    if (announcementDraft.isActive && !message) {
      showNotification('공지 내용을 입력해야 노출할 수 있습니다.', 'warning');
      return;
    }

    setIsSavingAnnouncement(true);
    try {
      const announcementDocRef = doc(db, 'settings', 'announcement');
      await setDoc(
        announcementDocRef,
        {
          title: announcementDraft.title.trim() || '공지',
          message,
          isActive: announcementDraft.isActive,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setAnnouncementDraft(prev => ({
        ...prev,
        title: prev.title.trim() || '공지',
        message,
      }));
      showNotification('공지사항이 저장되었습니다.');
    } catch (err) {
      console.error('공지 저장 실패:', err);
      showNotification('공지사항 저장에 실패했습니다.', 'error');
    } finally {
      setIsSavingAnnouncement(false);
    }
  };

  const handleReset = () => {
    if (!window.confirm('지도 핀 위치를 기본값으로 되돌릴까요?')) return;
    setPins(DEFAULT_MAP_PINS);
    showNotification('기본 위치로 되돌렸습니다. 저장 버튼을 눌러 반영해 주세요.', 'warning');
  };

  const handleCopy = async path => {
    try {
      await navigator.clipboard.writeText(`${baseUrl}${path}`);
      showNotification('주소를 복사했습니다.');
    } catch {
      showNotification('주소 복사에 실패했습니다.', 'error');
    }
  };

  const handleToggleFeedbackPublish = async feedback => {
    try {
      await updateDoc(doc(db, 'tour_feedbacks', feedback.id), {
        isPublished: !feedback.isPublished,
      });
      showNotification(
        feedback.isPublished
          ? '방문자 화면에서 소감을 숨겼습니다.'
          : '방문자 화면에 소감을 공개했습니다.',
      );
    } catch (err) {
      console.error('소감 공개 상태 변경 실패:', err);
      showNotification('소감 공개 상태를 변경하지 못했습니다.', 'error');
    }
  };

  const handleToggleCommentPublish = async comment => {
    try {
      await updateDoc(doc(db, 'comments', comment.id), {
        isPublished: !comment.isPublished,
      });
      showNotification(
        comment.isPublished
          ? '방문자 화면에서 작품 댓글을 숨겼습니다.'
          : '방문자 화면에 작품 댓글을 공개했습니다.',
      );
    } catch (err) {
      console.error('댓글 공개 상태 변경 실패:', err);
      showNotification('댓글 공개 상태를 변경하지 못했습니다.', 'error');
    }
  };

  const handleRefreshAll = () => {
    loadVisitors();
    loadPins();
    loadAnnouncement();
  };

  const mockSymbols = useMemo(
    () => DEFAULT_MAP_PINS.reduce((acc, pin) => ({ ...acc, [pin.id]: true }), {}),
    [],
  );

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 font-['Jua']">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10">
              <ShieldAlert className="h-5 w-5 text-cyan-200" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-white">작품 투어 관리자</h1>
              <p className="text-xs text-slate-400">운영 현황, 소감 공개, 공지, 지도 핀을 관리합니다.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 transition active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" />
              돌아가기
            </button>
            <button
              type="button"
              onClick={handleRefreshAll}
              className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 transition active:scale-95"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingVisitors || isLoadingPins ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5">
        <div className="grid content-start gap-5">
          <AdminStats stats={stats} />

          <AdminFeatureTabs activeFeature={activeFeature} onChange={setActiveFeature} />

          {activeFeature === 'records' && (
            <AdminRecordsSection
              recordTabs={recordTabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              tabCounts={tabCounts}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              recordError={recordError}
            >
            {activeTab === 'visitors' && (
              <VisitorList
                isLoading={isLoadingVisitors}
                visitors={filteredVisitors}
                emptyTitle="표시할 발견 기록이 없습니다."
              />
            )}

            {activeTab === 'artworks' && (
              <ArtworkList artworks={filteredArtworkSummaries} />
            )}

            {activeTab === 'comments' && (
              <RecordList
                records={filteredComments}
                emptyTitle="표시할 작품 댓글이 없습니다."
                renderItem={comment => (
                  <RecordCard
                    key={comment.id}
                    title={comment.name || '이름 없음'}
                    meta={`${getSymbolLabel(getRecordSymbolId(comment))} / ${formatDate(comment.createdAt)}`}
                    body={comment.content}
                    badge={comment.isPublished ? '공개 중' : '비공개'}
                    action={
                      <button
                        type="button"
                        onClick={() => handleToggleCommentPublish(comment)}
                        className={[
                          'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition active:scale-95',
                          comment.isPublished
                            ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                            : 'border-slate-700 bg-slate-900 text-slate-300',
                        ].join(' ')}
                      >
                        {comment.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        {comment.isPublished ? '숨기기' : '공개'}
                      </button>
                    }
                  />
                )}
              />
            )}

            {activeTab === 'feedbacks' && (
              <RecordList
                records={filteredFeedbacks}
                emptyTitle="표시할 투어 소감이 없습니다."
                renderItem={feedback => (
                  <RecordCard
                    key={feedback.id}
                    title={feedback.name || '익명'}
                    meta={formatDate(feedback.createdAt)}
                    body={feedback.feedback}
                    badge={feedback.isPublished ? '공개 중' : '비공개'}
                    action={
                      <button
                        type="button"
                        onClick={() => handleToggleFeedbackPublish(feedback)}
                        className={[
                          'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition active:scale-95',
                          feedback.isPublished
                            ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                            : 'border-slate-700 bg-slate-900 text-slate-300',
                        ].join(' ')}
                      >
                        {feedback.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        {feedback.isPublished ? '숨기기' : '공개'}
                      </button>
                    }
                  />
                )}
              />
            )}
            </AdminRecordsSection>
          )}

                    {activeFeature === 'map' && (
            <AdminMapSection
              isLoadingPins={isLoadingPins}
              isSaving={isSaving}
              mockSymbols={mockSymbols}
              pins={pins}
              onPinMove={handlePinMove}
              onReset={handleReset}
              onSave={handleSave}
            />
          )}
        </div>

        <div className="grid content-start gap-5">
                    {activeFeature === 'announcement' && (
            <AdminAnnouncementSection
              draft={announcementDraft}
              isLoading={isLoadingAnnouncement}
              isSaving={isSavingAnnouncement}
              onChange={handleAnnouncementChange}
              onSave={handleSaveAnnouncement}
            />
          )}

                    {activeFeature === 'links' && (
            <AdminLinksSection links={adminLinks} baseUrl={baseUrl} onCopy={handleCopy} />
          )}

                    {activeFeature === 'coordinates' && (
            <AdminCoordinatesSection pins={pins} getSymbolLabel={getSymbolLabel} />
          )}
        </div>
      </main>

      {notification.message && (
        <div
          className={[
            'fixed bottom-6 left-1/2 z-[100] flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2 rounded-lg border px-4 py-3 shadow-2xl backdrop-blur',
            notification.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-950/90 text-emerald-200'
              : notification.type === 'warning'
                ? 'border-amber-500/30 bg-amber-950/90 text-amber-200'
                : 'border-rose-500/30 bg-rose-950/90 text-rose-200',
          ].join(' ')}
        >
          {notification.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
          <span className="text-sm">{notification.message}</span>
        </div>
      )}
    </div>
  );
}

function ArtworkList({ artworks }) {
  if (artworks.length === 0) {
    return <EmptyState icon={MapPinned} title="표시할 작품 정보가 없습니다." />;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {artworks.map(artwork => (
        <article key={artwork.id} className="rounded-lg border border-slate-800 bg-slate-950/55 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-cyan-200">{artwork.category}</p>
              <h3 className="mt-1 text-lg font-bold text-white">{artwork.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{artwork.artist}</p>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">발견 {artwork.discoveredVisitors}</span>
              <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
                댓글 {artwork.publishedComments}/{artwork.comments}
              </span>
            </div>
          </div>
          {artwork.desc && <p className="mt-3 text-sm leading-relaxed text-slate-300">{artwork.desc}</p>}
          {artwork.meaning && <p className="mt-2 text-sm leading-relaxed text-slate-400">{artwork.meaning}</p>}
          {artwork.location && (
            <p className="mt-3 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400">
              위치: {artwork.location}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

function VisitorList({ isLoading, visitors, emptyTitle }) {
  if (isLoading) {
    return <EmptyState icon={RefreshCw} title="방문 기록을 불러오는 중입니다." spinning />;
  }

  if (visitors.length === 0) {
    return <EmptyState icon={Users} title={emptyTitle} />;
  }

  return (
    <div className="grid gap-3">
      {visitors.map(visitor => (
        <article key={visitor.id} className="rounded-lg border border-slate-800 bg-slate-950/55 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-100">방문자 {visitor.id.slice(0, 8)}</p>
              <p className="mt-1 text-xs text-slate-500">최근 갱신 {formatDate(visitor.updatedAt)}</p>
            </div>
            <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200">
              {visitor.viewedSymbols.length}개 발견
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {visitor.viewedSymbols.map(symbol => (
              <span key={symbol.id} className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300">
                {symbol.label}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, spinning = false }) {
  return (
    <div className="flex min-h-[170px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-4 text-center">
      {React.createElement(icon, {
        className: `mb-3 h-7 w-7 text-slate-500 ${spinning ? 'animate-spin' : ''}`,
      })}
      <p className="text-sm text-slate-400">{title}</p>
    </div>
  );
}

function RecordList({ records, emptyTitle, renderItem }) {
  if (records.length === 0) {
    return <EmptyState icon={MessageSquareText} title={emptyTitle} />;
  }

  return <div className="grid gap-3">{records.map(renderItem)}</div>;
}

function RecordCard({ title, meta, body, badge, action }) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-950/55 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-bold text-slate-100">{title}</p>
            {badge && (
              <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">{meta}</p>
        </div>
        {action}
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
        {body || '내용 없음'}
      </p>
    </article>
  );
}
