import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  MessageSquareText,
  RefreshCw,
  Save,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { db, doc, getDoc, setDoc } from '../firebase';
import { symbolData } from '../data/symbolData';
import MapArea, { DEFAULT_MAP_PINS } from './MapArea';

const adminLinks = [
  { label: '관리자 대시보드', path: '/admin-panel', desc: '관리자 화면으로 이동합니다.' },
  { label: '전체 작품 열기', path: '/admin', desc: '하트, 나누기, 십자가 작품을 모두 엽니다.' },
  { label: '하트 작품 열기', path: '/admin/heart', desc: '하트 카테고리 작품을 엽니다.' },
  { label: '나누기 작품 열기', path: '/admin/divide', desc: '나누기 카테고리 작품을 엽니다.' },
  { label: '십자가 작품 열기', path: '/admin/cross', desc: '십자가 카테고리 작품을 엽니다.' },
  { label: '기본 3개 열기', path: '/unlock/basic', desc: '하트, 나누기, 십자가 대표 작품을 하나씩 엽니다.' },
  { label: '투어 소감 페이지', path: '/?symbol=question', desc: '상품 부스 QR 진입 페이지입니다.' },
  { label: '방문 기록 초기화', path: '/?reset=true', desc: '현재 기기의 발견 상태를 초기화합니다.' },
];

const recordTabs = [
  { id: 'visitors', label: '방문자', icon: Users },
  { id: 'comments', label: '댓글', icon: MessageSquareText },
  { id: 'feedbacks', label: '소감', icon: Clipboard },
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
  if (id === 'question') return '상품 부스';
  const symbol = symbolData[id];
  return symbol?.qr?.title || symbol?.title || id;
};

const getViewedSymbols = symbols => (
  symbolOrder
    .filter(id => symbols?.[id])
    .map(id => ({ id, label: getSymbolLabel(id) }))
);

export default function AdminPanel({ onBack }) {
  const [pins, setPins] = useState(DEFAULT_MAP_PINS);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingPins, setIsLoadingPins] = useState(true);
  const [isLoadingVisitors, setIsLoadingVisitors] = useState(true);
  const [visitors, setVisitors] = useState([]);
  const [comments, setComments] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [activeTab, setActiveTab] = useState('visitors');
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [recordError, setRecordError] = useState('');

  const baseUrl = window.location.origin;

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    window.setTimeout(() => {
      setNotification({ message: '', type: '' });
    }, 2800);
  };

  const loadPins = async () => {
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
  };

  const loadVisitors = async () => {
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
      console.error('방문자 기록 로드 실패:', err);
      setRecordError('방문자 기록을 불러오지 못했습니다. Firestore 읽기 권한을 확인해 주세요.');
    } finally {
      setIsLoadingVisitors(false);
    }
  };

  useEffect(() => {
    loadPins();
    loadVisitors();

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
      unsubscribeComments();
      unsubscribeFeedbacks();
    };
  }, []);

  const stats = useMemo(() => {
    const visitorsWithAnySymbol = visitors.filter(visitor => visitor.viewedSymbols.length > 0).length;
    const completedVisitors = visitors.filter(visitor => {
      const symbols = visitor.symbols || {};
      const hasHeart = symbols.heart_kymin || symbols.heart_yewon || symbols.heart_eunhye || symbols.heart_jihoon || symbols.heart_eunchae;
      const hasDivide = symbols.divide_kyeomjun || symbols.divide_yewon;
      const hasCross = symbols.cross || symbols.cross_jihoon;
      return hasHeart && hasDivide && hasCross;
    }).length;

    return [
      { label: '방문 기록', value: visitors.length, desc: '기기별 방문자 기록' },
      { label: '작품 본 사람', value: visitorsWithAnySymbol, desc: '1개 이상 본 방문자' },
      { label: '3개 심볼 완료', value: completedVisitors, desc: '하트, 나누기, 십자가 완료' },
      { label: '댓글', value: comments.length, desc: '작품 팝업 댓글' },
      { label: '투어 소감', value: feedbacks.length, desc: '상품 부스 QR 제출' },
    ];
  }, [comments.length, feedbacks.length, visitors]);

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

  const handleReset = () => {
    if (!window.confirm('지도 핀 위치를 기본값으로 되돌릴까요?')) return;
    setPins(DEFAULT_MAP_PINS);
    showNotification('기본 위치로 되돌렸습니다. 저장 버튼을 눌러 반영해 주세요.', 'warning');
  };

  const handleCopy = async path => {
    try {
      await navigator.clipboard.writeText(`${baseUrl}${path}`);
      showNotification('관리자 주소를 복사했습니다.');
    } catch {
      showNotification('주소 복사에 실패했습니다.', 'error');
    }
  };

  const mockSymbols = useMemo(
    () => DEFAULT_MAP_PINS.reduce((acc, pin) => ({ ...acc, [pin.id]: true }), {}),
    [],
  );

  return (
    <div className="w-full min-h-screen bg-slate-950 text-slate-100 font-['Jua'] overflow-y-auto pb-12">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 px-5 py-4 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[335px] flex-col gap-3">
          <div className="flex items-center justify-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10">
              <ShieldAlert className="h-5 w-5 text-indigo-300" />
            </div>
            <h1 className="text-lg font-bold tracking-wide text-white">작품 투어 관리자</h1>
          </div>

          <div className="flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300 transition-all active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            돌아가기
          </button>

          <button
            onClick={loadVisitors}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300 transition-all active:scale-95"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingVisitors ? 'animate-spin' : ''}`} />
            새로고침
          </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[375px] flex-col gap-7 px-5 py-7">
        <section className="grid grid-cols-2 gap-3">
          {stats.map(item => (
            <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl">
              <p className="text-xs text-slate-400">{item.label}</p>
              <strong className="mt-2 block text-3xl text-white">{item.value}</strong>
              <p className="mt-2 text-[11px] leading-snug text-slate-500">{item.desc}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/55 p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white">관리자 주소</h2>
              <p className="mt-1 text-sm text-slate-400">운영 중 바로 열어야 하는 주소를 한곳에 모았습니다.</p>
            </div>
          </div>

          <div className="grid gap-3">
            {adminLinks.map(link => (
              <div key={link.path} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
                <div className="flex flex-col gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-100">{link.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{link.desc}</p>
                    <code className="mt-2 block break-all rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-indigo-200">
                      {baseUrl}{link.path}
                    </code>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(link.path)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 active:scale-95"
                      aria-label={`${link.label} 복사`}
                    >
                      <Clipboard className="h-4 w-4" />
                    </button>
                    <a
                      href={link.path}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 active:scale-95"
                      aria-label={`${link.label} 열기`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/55 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">지도 핀 위치</h2>
                <p className="mt-1 text-sm text-slate-400">핀을 드래그한 뒤 저장하면 관람자 화면에 반영됩니다.</p>
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving || isLoadingPins}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-40"
              >
                {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                저장
              </button>
            </div>

            {isLoadingPins ? (
              <div className="flex aspect-[345/324] items-center justify-center rounded-2xl bg-slate-950/60">
                <RefreshCw className="h-7 w-7 animate-spin text-indigo-300" />
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
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/55 p-5 shadow-2xl">
              <h3 className="mb-4 text-base font-bold text-white">핀 좌표</h3>
              <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
                {pins.map(pin => (
                  <div key={pin.id} className="rounded-xl border border-slate-800 bg-slate-950/55 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-slate-200">{pin.label || getSymbolLabel(pin.id)}</span>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{pin.type}</span>
                    </div>
                    <div className="mt-1 font-mono text-xs text-indigo-300">
                      L {pin.pinLeft} / T {pin.pinTop}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleReset}
              disabled={isLoadingPins}
              className="rounded-2xl border border-slate-800 bg-slate-900 py-3.5 font-bold text-slate-300 transition-all active:scale-95 disabled:opacity-40"
            >
              기본 위치로 되돌리기
            </button>
          </aside>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/55 p-5 shadow-2xl">
          <div className="mb-4 flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-bold text-white">관람 기록</h2>
              <p className="mt-1 text-sm text-slate-400">작품을 본 사람, 작품 댓글, 투어 소감을 확인합니다.</p>
            </div>
            <div className="flex rounded-2xl border border-slate-800 bg-slate-950/70 p-1">
              {recordTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-all',
                      isActive ? 'bg-white text-slate-950' : 'text-slate-400',
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {recordError && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <AlertCircle className="h-4 w-4" />
              {recordError}
            </div>
          )}

          {activeTab === 'visitors' && (
            <div className="space-y-3">
              {isLoadingVisitors ? (
                <EmptyState icon={RefreshCw} title="방문자 기록을 불러오는 중" spinning />
              ) : visitors.length === 0 ? (
                <EmptyState icon={Users} title="아직 방문자 기록이 없습니다." />
              ) : (
                visitors.map(visitor => (
                  <article key={visitor.id} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
                    <div className="flex flex-col gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-100">방문자 {visitor.id.slice(0, 8)}</p>
                        <p className="mt-1 text-xs text-slate-500">최근 갱신 {formatDate(visitor.updatedAt)}</p>
                      </div>
                      <span className="w-fit rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-200">
                        {visitor.viewedSymbols.length}개 기록
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {visitor.viewedSymbols.length > 0 ? (
                        visitor.viewedSymbols.map(symbol => (
                          <span key={symbol.id} className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300">
                            {symbol.label}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">아직 본 작품이 없습니다.</span>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          )}

          {activeTab === 'comments' && (
            <RecordList
              records={comments}
              emptyTitle="아직 작품 댓글이 없습니다."
              renderItem={comment => (
                <RecordCard
                  key={comment.id}
                  title={comment.name || '이름 없음'}
                  meta={`${getSymbolLabel(comment.symbolId)} · ${formatDate(comment.createdAt)}`}
                  body={comment.content}
                />
              )}
            />
          )}

          {activeTab === 'feedbacks' && (
            <RecordList
              records={feedbacks}
              emptyTitle="아직 투어 소감이 없습니다."
              renderItem={feedback => (
                <RecordCard
                  key={feedback.id}
                  title={feedback.name || '익명'}
                  meta={formatDate(feedback.createdAt)}
                  body={feedback.feedback}
                />
              )}
            />
          )}
        </section>
      </main>

      {notification.message && (
        <div
          className={[
            'fixed bottom-8 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2.5 rounded-2xl border px-5 py-3 shadow-2xl backdrop-blur-xl',
            notification.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-950/90 text-emerald-200'
              : notification.type === 'warning'
                ? 'border-amber-500/30 bg-amber-950/90 text-amber-200'
                : 'border-rose-500/30 bg-rose-950/90 text-rose-200',
          ].join(' ')}
        >
          {notification.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <span className="text-sm">{notification.message}</span>
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, title, spinning = false }) {
  return (
    <div className="flex min-h-[170px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 text-center">
      <Icon className={`mb-3 h-7 w-7 text-slate-500 ${spinning ? 'animate-spin' : ''}`} />
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

function RecordCard({ title, meta, body }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-100">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{meta}</p>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
        {body || '내용 없음'}
      </p>
    </article>
  );
}
