import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  MapPinned,
  Megaphone,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { db, doc, getDoc, setDoc } from '../firebase';
import { symbolData } from '../data/symbolData';
import MapArea, { DEFAULT_MAP_PINS } from './MapArea';

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
  { id: 'appOnly', label: '접속만', icon: BarChart3 },
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

  const appOnlyVisitorRecords = useMemo(
    () => visitors.filter(visitor => visitor.viewedSymbols.length === 0),
    [visitors],
  );

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

  const stats = [
    { label: '발견 방문', value: visitorRecords.length, desc: 'QR을 1개 이상 발견', chart: discoveryCountDistribution },
    { label: '접속만', value: appOnlyVisitorRecords.length, desc: '아직 QR 발견 없음' },
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
    appOnly: appOnlyVisitorRecords.length,
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

  const filteredAppOnlyVisitors = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    if (!query) return appOnlyVisitorRecords;
    return appOnlyVisitorRecords.filter(visitor => {
      const target = [visitor.id, formatDate(visitor.updatedAt)].join(' ');
      return normalizeSearchText(target).includes(query);
    });
  }, [appOnlyVisitorRecords, searchQuery]);

  const filteredComments = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    if (!query) return comments;
    return comments.filter(comment => {
      const target = [
        comment.name,
        comment.content,
        getSymbolLabel(comment.symbolId),
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

      <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 xl:grid-cols-[1fr_380px]">
        <div className="grid content-start gap-5">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {stats.map(item => (
              <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-400">{item.label}</p>
                    <strong className="mt-2 block text-3xl text-white">{item.value}</strong>
                  </div>
                  {item.breakdown && (
                    <div className="grid gap-1 text-right">
                      {item.breakdown.map(detail => (
                        <span key={detail.label} className={`text-xs ${detail.tone}`}>
                          {detail.label} {detail.value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs leading-snug text-slate-500">{item.desc}</p>
                {item.chart?.length > 0 && (
                  <div className="mt-3 grid gap-2">
                    {item.chart.map(row => (
                      <div key={row.count} className="grid grid-cols-[34px_1fr_34px] items-center gap-2 text-[11px] text-slate-400">
                        <span>{row.count}개</span>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-cyan-300"
                            style={{ width: `${row.percent}%` }}
                          />
                        </div>
                        <span className="text-right text-slate-300">{row.visitors}명</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/55 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">기록 관리</h2>
                <p className="mt-1 text-sm text-slate-400">검색 후 탭을 전환해 방문, 댓글, 소감을 빠르게 확인합니다.</p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="방문자, 이름, 작품, 내용 검색"
                  className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-slate-950/70 p-1 md:grid-cols-4">
              {recordTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      'flex min-h-10 items-center justify-center gap-2 rounded-md px-2 text-sm transition',
                      isActive ? 'bg-white text-slate-950' : 'text-slate-400 hover:text-slate-100',
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                    <span className={isActive ? 'text-slate-600' : 'text-slate-500'}>{tabCounts[tab.id]}</span>
                  </button>
                );
              })}
            </div>

            {recordError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {recordError}
              </div>
            )}

            {activeTab === 'visitors' && (
              <VisitorList
                isLoading={isLoadingVisitors}
                visitors={filteredVisitors}
                emptyTitle="표시할 발견 기록이 없습니다."
              />
            )}

            {activeTab === 'appOnly' && (
              <VisitorList
                isLoading={isLoadingVisitors}
                visitors={filteredAppOnlyVisitors}
                emptyTitle="접속만 한 방문자가 없습니다."
                appOnly
              />
            )}

            {activeTab === 'comments' && (
              <RecordList
                records={filteredComments}
                emptyTitle="표시할 작품 댓글이 없습니다."
                renderItem={comment => (
                  <RecordCard
                    key={comment.id}
                    title={comment.name || '이름 없음'}
                    meta={`${getSymbolLabel(comment.symbolId)} / ${formatDate(comment.createdAt)}`}
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
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/55 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                  <MapPinned className="h-5 w-5 text-cyan-200" />
                  지도 핀 위치
                </h2>
                <p className="mt-1 text-sm text-slate-400">핀을 드래그한 뒤 저장하면 방문자 화면에 반영됩니다.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isLoadingPins}
                  className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200 transition active:scale-95 disabled:opacity-40"
                >
                  <RotateCcw className="h-4 w-4" />
                  기본값
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || isLoadingPins}
                  className="flex h-10 items-center gap-2 rounded-lg bg-cyan-500 px-3 text-sm font-bold text-slate-950 transition active:scale-95 disabled:opacity-40"
                >
                  {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  저장
                </button>
              </div>
            </div>

            {isLoadingPins ? (
              <div className="flex aspect-[345/324] items-center justify-center rounded-lg bg-slate-950/60">
                <RefreshCw className="h-7 w-7 animate-spin text-cyan-300" />
              </div>
            ) : (
              <MapArea
                symbols={mockSymbols}
                onSymbolClick={() => {}}
                isQuestionUnlocked={true}
                editable={true}
                onPinMove={handlePinMove}
                pins={pins}
              />
            )}
          </section>
        </div>

        <aside className="grid content-start gap-5 xl:sticky xl:top-[76px]">
          <section className="rounded-lg border border-slate-800 bg-slate-900/55 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                  <Megaphone className="h-5 w-5 text-amber-200" />
                  상단 공지
                </h2>
                <p className="mt-1 text-sm text-slate-400">방문자 화면 상단에 안내를 노출합니다.</p>
              </div>
              <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  name="isActive"
                  checked={announcementDraft.isActive}
                  onChange={handleAnnouncementChange}
                  className="h-4 w-4 accent-cyan-400"
                  disabled={isLoadingAnnouncement || isSavingAnnouncement}
                />
                노출
              </label>
            </div>

            <div className="grid gap-3">
              <input
                name="title"
                value={announcementDraft.title}
                onChange={handleAnnouncementChange}
                placeholder="공지 제목"
                className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
                disabled={isLoadingAnnouncement || isSavingAnnouncement}
              />
              <textarea
                name="message"
                value={announcementDraft.message}
                onChange={handleAnnouncementChange}
                placeholder="예: 오늘 오후 3시에 상품 부스 운영이 시작됩니다."
                className="min-h-24 resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm leading-relaxed text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
                disabled={isLoadingAnnouncement || isSavingAnnouncement}
              />
              <button
                type="button"
                onClick={handleSaveAnnouncement}
                disabled={isLoadingAnnouncement || isSavingAnnouncement}
                className="flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-300 px-3 text-sm font-bold text-slate-950 transition active:scale-95 disabled:opacity-40"
              >
                {isSavingAnnouncement ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                공지 저장
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/55 p-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <Link2 className="h-5 w-5 text-cyan-200" />
              운영 링크
            </h2>
            <div className="mt-4 grid max-h-[520px] gap-3 overflow-y-auto pr-1">
              {adminLinks.map(link => (
                <div key={link.path} className="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
                  <p className="font-bold text-slate-100">{link.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{link.desc}</p>
                  <code className="mt-2 block break-all rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-cyan-200">
                    {baseUrl}{link.path}
                  </code>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(link.path)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition active:scale-95"
                      aria-label={`${link.label} 복사`}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <a
                      href={link.path}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition active:scale-95"
                      aria-label={`${link.label} 열기`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/55 p-4">
            <h2 className="text-lg font-bold text-white">핀 좌표</h2>
            <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {pins.map(pin => (
                <div key={pin.id} className="rounded-lg border border-slate-800 bg-slate-950/55 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-slate-200">{pin.label || getSymbolLabel(pin.id)}</span>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{pin.type}</span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-cyan-300">
                    L {pin.pinLeft} / T {pin.pinTop}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
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

function VisitorList({ isLoading, visitors, emptyTitle, appOnly = false }) {
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
              {appOnly ? '접속만 있음' : `${visitor.viewedSymbols.length}개 발견`}
            </span>
          </div>

          {appOnly ? (
            <p className="mt-3 text-sm text-slate-500">아직 발견한 작품이 없습니다.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {visitor.viewedSymbols.map(symbol => (
                <span key={symbol.id} className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300">
                  {symbol.label}
                </span>
              ))}
            </div>
          )}
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
