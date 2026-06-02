import React, { Suspense, lazy, useMemo, useRef, useState, useEffect } from 'react';
import Header from './components/Header';
import MapArea, { DEFAULT_MAP_PINS } from './components/MapArea';
import SymbolCards from './components/SymbolCards';
import useFirebaseSymbolSync from './hooks/useFirebaseSymbolSync';
import usePublicFeedbackFeed from './hooks/usePublicFeedbackFeed';
import {
  ADMIN_UNLOCK_CATEGORIES,
  ADMIN_UNLOCK_LABELS,
  BASIC_UNLOCK_SYMBOLS,
  INITIAL_SYMBOLS,
  UNLOCKED_SYMBOLS,
  hasQuestionPrerequisites,
  normalizeSymbols,
  resolveQrSymbol,
} from './utils/symbols';
import { saveUserSymbols } from './utils/firebaseApi';

import { Camera, Sparkles } from 'lucide-react';

const Popup = lazy(() => import('./components/Popup'));
const ParticipatePage = lazy(() => import('./components/ParticipatePage'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const QRScannerPopup = lazy(() => import('./components/QRScannerPopup'));

const SYMBOLS_STORAGE_KEY = 'symbols';
const SYMBOLS_BROADCAST_CHANNEL = 'ccc-symbols';

const appCopy = {
  ko: {
    loadingFallback: '불러오는 중...',
    syncTitle: '기기 데이터 동기화 중',
    syncDesc: '해금 데이터를 안전하게 불러오고 있어요. 잠시만 기다려 주세요.',
    basicUnlocked: '하트, 나누기, 십자가가 해금되었어요.',
    needThreeSymbols: '먼저 하트, 나누기, 십자가를 모두 찾아야 해요.',
    boothLocked: '하트, 나누기, 십자가를 모으면 상품 부스 안내가 열려요.',
    undiscovered: '아직 발견하지 못한 심볼이에요.',
    mapTitle: '작품 지도',
    mapDesc: '심볼을 따라 오늘의 작품을 찾아보세요.',
    scanQrButton: 'QR 스캔',
    invalidQr: '작품 QR을 인식하지 못했어요.',
    cardsTitle: '작품 설명 카드',
    cardsDesc: '발견한 심볼의 작품 설명을 확인하고, 마지막 상품 부스까지 이어가 보세요.',
  },
  en: {
    loadingFallback: 'Loading...',
    syncTitle: 'Syncing Device Data',
    syncDesc: 'Your unlocked symbols are being loaded safely. Please wait a moment.',
    basicUnlocked: 'Heart, Division, and Cross have been unlocked.',
    needThreeSymbols: 'Find Heart, Division, and Cross first.',
    boothLocked: 'Find Heart, Division, and Cross to unlock the prize booth guide.',
    undiscovered: 'This symbol has not been discovered yet.',
    mapTitle: 'Artwork Map',
    mapDesc: "Follow the symbols and find today's artworks.",
    scanQrButton: 'Scan QR',
    invalidQr: 'This QR code was not recognized.',
    cardsTitle: 'Artwork Cards',
    cardsDesc: 'Open the cards you discovered and continue to the final booth.',
  },
};

const getTimestamp = value => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'number') return value;
  return new Date(value).getTime() || 0;
};

const readStoredSymbols = () => {
  const savedSymbols = localStorage.getItem(SYMBOLS_STORAGE_KEY);
  if (!savedSymbols) return INITIAL_SYMBOLS;

  try {
    return normalizeSymbols(JSON.parse(savedSymbols));
  } catch {
    return INITIAL_SYMBOLS;
  }
};

const areAllSymbolsLocked = symbols => (
  Object.keys(INITIAL_SYMBOLS).every(symbolId => !symbols[symbolId])
);

const mergeDeviceSymbols = (currentSymbols, incomingSymbols) => {
  const normalizedIncoming = normalizeSymbols(incomingSymbols);
  if (areAllSymbolsLocked(normalizedIncoming)) return normalizedIncoming;

  return Object.keys(INITIAL_SYMBOLS).reduce((acc, symbolId) => {
    acc[symbolId] = !!(currentSymbols?.[symbolId] || normalizedIncoming[symbolId]);
    return acc;
  }, {});
};

const publishDeviceSymbols = symbols => {
  const normalizedSymbols = normalizeSymbols(symbols);
  localStorage.setItem(SYMBOLS_STORAGE_KEY, JSON.stringify(normalizedSymbols));

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(SYMBOLS_BROADCAST_CHANNEL);
    channel.postMessage({ symbols: normalizedSymbols });
    channel.close();
  }
};

const resolveScannedQrSymbol = rawValue => {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  try {
    const url = new URL(value, window.location.origin);
    const normalizedPath = url.pathname.replace(/\/+$/, '');
    const pathTarget = normalizedPath.startsWith('/qr/')
      ? normalizedPath.slice('/qr/'.length)
      : normalizedPath.startsWith('/symbol/')
        ? normalizedPath.slice('/symbol/'.length)
        : '';
    const queryTarget =
      url.searchParams.get('symbol') ||
      url.searchParams.get('id') ||
      url.searchParams.get('qr') ||
      url.searchParams.get('s');

    return resolveQrSymbol(pathTarget || queryTarget || value);
  } catch {
    return resolveQrSymbol(value);
  }
};

export default function App() {
  const [page, setPage] = useState(() => {
    const path = window.location.pathname;
    if (path === '/participate') return 'participate';
    if (path === '/admin-panel') return 'admin-panel';
    return 'home';
  });

  const [pins, setPins] = useState(DEFAULT_MAP_PINS);
  const [announcement, setAnnouncement] = useState(null);

  const [symbols, setSymbols] = useState(() => {
    return readStoredSymbols();
  });

  const [activePopup, setActivePopup] = useState(null);
  const [toast, setToast] = useState('');
  const [highlightedPinId, setHighlightedPinId] = useState(null);
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'ko');
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const mapSectionRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const hasAutoOpenedQuestionGuide = useRef(
    localStorage.getItem('questionGuideAutoShown') === 'true',
  );
  const { userId, isLoading } = useFirebaseSymbolSync({
    symbols,
    setSymbols,
    setPins,
    setAnnouncement,
  });

  // 1개 이상 해금 시 해당 카테고리 발견 완료로 판정
  const isHeartDiscovered = symbols.heart_kymin || symbols.heart_yewon || symbols.heart_eunhye || symbols.heart_jihoon || symbols.heart_eunchae;
  const isDivideDiscovered = symbols.divide_kyeomjun || symbols.divide_yewon;
  const isCrossDiscovered = symbols.cross || symbols.cross_jihoon;
  const isQuestionDiscovered = symbols.question;

  // 특별 심볼 해금 조건: 3가지 심볼이 모두 최소 1개 이상 해금되었을 때
  const isQuestionUnlocked = isHeartDiscovered && isDivideDiscovered && isCrossDiscovered;

  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.lang = language === 'en' ? 'en' : 'ko';
  }, [language]);

  useEffect(() => {
    const applyIncomingSymbols = incomingSymbols => {
      setSymbols(prev => mergeDeviceSymbols(prev, incomingSymbols));
    };

    const handleStorage = event => {
      if (event.key !== SYMBOLS_STORAGE_KEY || !event.newValue) return;

      try {
        applyIncomingSymbols(JSON.parse(event.newValue));
      } catch (error) {
        console.error('기기 해금 데이터 동기화 중 오류 발생:', error);
      }
    };

    window.addEventListener('storage', handleStorage);

    if (!('BroadcastChannel' in window)) {
      return () => window.removeEventListener('storage', handleStorage);
    }

    const channel = new BroadcastChannel(SYMBOLS_BROADCAST_CHANNEL);
    channel.onmessage = event => {
      if (event.data?.symbols) {
        applyIncomingSymbols(event.data.symbols);
      }
    };

    return () => {
      window.removeEventListener('storage', handleStorage);
      channel.close();
    };
  }, []);

  const toggleLanguage = () => {
    setLanguage(prev => (prev === 'en' ? 'ko' : 'en'));
  };
  const text = appCopy[language] || appCopy.ko;

  const discoveredCount = (isHeartDiscovered ? 1 : 0) + 
                          (isDivideDiscovered ? 1 : 0) + 
                          (isCrossDiscovered ? 1 : 0) +
                          (isQuestionDiscovered ? 1 : 0);

  const featuredFeedbacks = usePublicFeedbackFeed({ enabled: page === 'home' });

  // 0. 카카오톡 인앱 브라우저 외부 브라우저 강제 전환
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('kakaotalk')) {
      const currentUrl = window.location.href;
      window.location.href = `kakaotalk://web/openExternalApp?url=${encodeURIComponent(currentUrl)}`;
    }
  }, []);

  // 1. URL 쿼리 파라미터를 통한 즉시 해금 및 리셋 처리
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const normalizedPath = window.location.pathname.replace(/\/+$/, '');
    const adminPathTarget = normalizedPath.startsWith('/admin/')
      ? normalizedPath.slice('/admin/'.length)
      : '';
    const unlockPathTarget = normalizedPath.startsWith('/unlock/')
      ? normalizedPath.slice('/unlock/'.length)
      : '';
    const qrPathTarget = normalizedPath.startsWith('/qr/')
      ? normalizedPath.slice('/qr/'.length)
      : normalizedPath.startsWith('/symbol/')
        ? normalizedPath.slice('/symbol/'.length)
        : '';
    const adminQueryTarget = params.get('admin');
    const unlockQueryTarget = params.get('unlock');
    const qrQueryTarget =
      params.get('symbol') || params.get('id') || params.get('qr') || params.get('s');
    const adminUnlockTarget = adminPathTarget || adminQueryTarget;
    const isResetRequested = params.get('reset') === 'true';
    const isBasicUnlockRequested =
      unlockPathTarget === 'basic' ||
      unlockQueryTarget === 'basic' ||
      unlockQueryTarget === 'core' ||
      adminQueryTarget === 'basic';
    const isAdminUnlockRequested =
      normalizedPath === '/admin' || adminQueryTarget === 'unlock' || adminQueryTarget === 'all';
    const isAdminCategoryUnlockRequested =
      Object.prototype.hasOwnProperty.call(ADMIN_UNLOCK_CATEGORIES, adminUnlockTarget);

    if (isResetRequested) {
      localStorage.clear();
      hasAutoOpenedQuestionGuide.current = false;
      publishDeviceSymbols(INITIAL_SYMBOLS);
      localStorage.setItem('needReset', 'true'); // Firebase 세션 로드 완료 시 클라우드 리셋을 처리하기 위한 플래그
      setSymbols(INITIAL_SYMBOLS);
      setToast('로컬 및 서버 데이터 초기화 중... 🔄');
      
      setTimeout(() => {
        setToast('');
        window.location.href = window.location.pathname; // 쿼리 파라미터를 깔끔하게 제거하고 새로고침
      }, 1200);
      return;
    }

    if (isBasicUnlockRequested) {
      setSymbols(prev => {
        const next = normalizeSymbols(prev);
        for (const symbolId of BASIC_UNLOCK_SYMBOLS) {
          next[symbolId] = true;
        }
        publishDeviceSymbols(next);
        return next;
      });
      setToast(text.basicUnlocked);

      setTimeout(() => {
        setToast('');
      }, 1500);

      window.history.replaceState({}, '', '/');
      return;
    }

    if (isAdminUnlockRequested) {
      publishDeviceSymbols(UNLOCKED_SYMBOLS);
      setSymbols(UNLOCKED_SYMBOLS);
      setToast('관리자 모드로 전체 잠금이 열렸습니다.');

      setTimeout(() => {
        setToast('');
      }, 1500);

      window.history.replaceState({}, '', '/');
      return;
    }

    if (isAdminCategoryUnlockRequested) {
      setSymbols(prev => {
        const next = normalizeSymbols(prev);
        for (const symbolId of ADMIN_UNLOCK_CATEGORIES[adminUnlockTarget]) {
          next[symbolId] = true;
        }
        publishDeviceSymbols(next);
        return next;
      });
      setToast(`관리자 모드로 ${ADMIN_UNLOCK_LABELS[adminUnlockTarget]} 잠금이 열렸습니다.`);

      setTimeout(() => {
        setToast('');
      }, 1500);

      window.history.replaceState({}, '', '/');
      return;
    }

    const symbol = resolveQrSymbol(qrPathTarget || qrQueryTarget);

    if (symbol) {
      if (symbol === 'question') {
        if (!hasQuestionPrerequisites(symbols)) {
          setToast(text.needThreeSymbols);
          setTimeout(() => {
            setToast('');
          }, 2000);
          window.history.replaceState({}, '', '/');
          return;
        }

        setSymbols(prev => {
          const next = { ...prev, question: true };
          publishDeviceSymbols(next);
          if (userId) {
            saveUserSymbols(userId, next).catch(err => {
              console.error('question QR 완료 데이터 백업 중 에러 발생:', err);
            });
          }
          return next;
        });

        setPage('home');
        setActivePopup({
          type: 'qr',
          id: 'question',
        });
        window.history.replaceState({}, '', '/');
        return;
      }

      if (Object.prototype.hasOwnProperty.call(INITIAL_SYMBOLS, symbol)) {
        setSymbols(prev => {
          if (prev[symbol]) return prev;
          const next = { ...prev, [symbol]: true };
          publishDeviceSymbols(next);
          if (userId) {
            saveUserSymbols(userId, next).catch(err => {
              console.error('QR 해금 데이터 즉시 백업 중 에러 발생:', err);
            });
          }
          return next;
        });

        setActivePopup({
          type: 'qr',
          id: symbol,
        });

        window.history.replaceState({}, '', '/');
      }
    }
  }, []);

  useEffect(() => {
    if (
      !isQuestionUnlocked ||
      isQuestionDiscovered ||
      isLoading ||
      page !== 'home' ||
      activePopup ||
      hasAutoOpenedQuestionGuide.current
    ) {
      return;
    }

    hasAutoOpenedQuestionGuide.current = true;
    localStorage.setItem('questionGuideAutoShown', 'true');

    const timerId = window.setTimeout(() => {
      setActivePopup({
        type: 'question_guide',
        id: 'question',
      });
    }, 650);

    return () => window.clearTimeout(timerId);
  }, [isQuestionUnlocked, isQuestionDiscovered, isLoading, page, activePopup]);

  const handleQrScannerDetected = rawValue => {
    const symbol = resolveScannedQrSymbol(rawValue);

    if (!symbol || !Object.prototype.hasOwnProperty.call(INITIAL_SYMBOLS, symbol)) {
      setToast(text.invalidQr);
      window.setTimeout(() => setToast(''), 1600);
      return;
    }

    if (symbol === 'question' && !hasQuestionPrerequisites(symbols)) {
      setToast(text.needThreeSymbols);
      window.setTimeout(() => setToast(''), 2000);
      setIsQrScannerOpen(false);
      return;
    }

    setSymbols(prev => {
      const next = { ...prev, [symbol]: true };
      publishDeviceSymbols(next);
      if (userId) {
        saveUserSymbols(userId, next).catch(err => {
          console.error('QR 스캔 해금 데이터 백업 중 에러 발생:', err);
        });
      }
      return next;
    });

    setIsQrScannerOpen(false);
    setPage('home');
    setActivePopup({
      type: 'qr',
      id: symbol,
    });
    window.history.replaceState({}, '', '/');
  };

  const handleMapSymbolClick = id => {
    if (id === 'question') {
      if (!isQuestionUnlocked) {
        setToast(text.boothLocked);
        setTimeout(() => {
          setToast('');
        }, 2000);
        return;
      }
      setActivePopup({
        type: symbols.question ? 'qr' : 'question_guide',
        id: 'question',
      });
      return;
    }

    const isDiscovered = symbols[id];
    setActivePopup({
      type: isDiscovered ? 'qr' : 'map',
      id,
    });
  };

  const handleSymbolCardClick = id => {
    if (id === 'question') {
      if (!isQuestionUnlocked) {
        setToast(text.boothLocked);
        setTimeout(() => {
          setToast('');
        }, 2000);
        return;
      }
      setActivePopup({
        type: symbols.question ? 'qr' : 'question_guide',
        id: 'question',
      });
      return;
    }

    const isCategoryDiscovered = 
      id === 'heart' ? isHeartDiscovered :
      id === 'divide' ? isDivideDiscovered :
      id === 'cross' ? isCrossDiscovered :
      symbols[id];

    if (!isCategoryDiscovered) {
      setToast(`${text.undiscovered} 🔒`);

      setTimeout(() => {
        setToast('');
      }, 1500);

      return;
    }

    if (id === 'heart' || id === 'divide' || id === 'cross') {
      setActivePopup({
        type: 'multi',
        id, // 'heart', 'divide' 또는 'cross'
      });
    } else {
      setActivePopup({
        type: 'qr',
        id, // 'question'
      });
    }
  };

  const focusQuestionPinOnMap = () => {
    const questionPin = mapSectionRef.current?.querySelector('[data-map-pin-id="question"]');

    (questionPin || mapSectionRef.current)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center',
    });

    setHighlightedPinId('question');
    window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedPinId(null);
    }, 6200);
  };

  const closePopup = () => {
    const shouldFocusQuestionPin = activePopup?.type === 'question_guide' && activePopup?.id === 'question';
    setActivePopup(null);

    if (shouldFocusQuestionPin) {
      window.setTimeout(focusQuestionPinOnMap, 180);
    }
  };

  const openHomePage = () => {
    setPage('home');
    window.history.pushState({}, '', '/');
  };

  const openAdminPanel = () => {
    setPage('admin-panel');
    window.history.pushState({}, '', '/admin-panel');
  };

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/participate') setPage('participate');
      else if (path === '/admin-panel') setPage('admin-panel');
      else setPage('home');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => (
    () => window.clearTimeout(highlightTimerRef.current)
  ), []);

  if (page === 'participate') {
    return (
      <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">{text.loadingFallback}</div>}>
        <ParticipatePage onBack={openHomePage} language={language} />
      </Suspense>
    );
  }

  if (page === 'admin-panel') {
    return (
      <Suspense fallback={<div className="flex h-full items-center justify-center bg-slate-950 text-slate-300">관리자 페이지를 불러오는 중...</div>}>
        <AdminPanel onBack={openHomePage} />
      </Suspense>
    );
  }

  return (
    <div className="home-screen w-full h-full flex flex-col overflow-hidden relative font-['Jua']">
      <div className="home-backdrop" aria-hidden="true">
        <div className="home-backdrop__wash" />
        <div className="home-backdrop__grid" />
        <div className="home-backdrop__route home-backdrop__route--top" />
        <div className="home-backdrop__route home-backdrop__route--bottom" />
        <div className="home-backdrop__spark home-backdrop__spark--one" />
        <div className="home-backdrop__spark home-backdrop__spark--two" />
        <div className="home-backdrop__spark home-backdrop__spark--three" />
      </div>
      
      {/* 5. 프리미엄 글래스모피즘 동기화 로딩 화면 */}
      {isLoading && (
        <div className="fixed inset-0 bg-white/75 backdrop-blur-xl z-[100] flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className="w-20 h-20 bg-indigo-50 border-2 border-indigo-100 rounded-2xl flex items-center justify-center shadow-lg mb-6 animate-bounce">
            <Sparkles className="w-10 h-10 text-indigo-600 animate-pulse" />
          </div>
          <h3 className="font-['Cafe24_Ssurround'] font-bold text-2xl text-gray-800 text-center mb-2">
            {text.syncTitle}
          </h3>
          <p className="text-gray-500 text-sm text-center leading-relaxed max-w-[240px]">
            {text.syncDesc}
          </p>
        </div>
      )}

      <div className="relative z-10 flex-1 overflow-y-auto scroll-container pb-10">
        <Header
          discoveredCount={discoveredCount}
          announcement={announcement}
          language={language}
          onToggleLanguage={toggleLanguage}
        />

        <section
          ref={mapSectionRef}
          className="border-y border-sky-100 bg-sky-50/45 px-6 py-5 backdrop-blur-sm"
          aria-labelledby="tour-map-title"
        >
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 id="tour-map-title" className="font-['Cafe24_Ssurround'] text-[20px] font-bold text-slate-950">
                {text.mapTitle}
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-slate-600">
                {text.mapDesc}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsQrScannerOpen(true)}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-sky-200 bg-white/90 px-3 text-[13px] font-bold text-sky-700 shadow-sm transition active:scale-95"
            >
              <Camera className="h-4 w-4" />
              {text.scanQrButton}
            </button>
          </div>
          <MapArea 
            symbols={symbols} 
            onSymbolClick={handleMapSymbolClick} 
            isQuestionUnlocked={isQuestionUnlocked}
            pins={pins}
            highlightedPinId={highlightedPinId}
            language={language}
          />
        </section>

        <section className="px-6 pt-6" aria-labelledby="artwork-cards-title">
          <div className="mb-4">
            <h2 id="artwork-cards-title" className="font-['Cafe24_Ssurround'] text-[20px] font-bold text-slate-950">
              {text.cardsTitle}
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-slate-600">
              {text.cardsDesc}
            </p>
          </div>

          <SymbolCards 
            symbols={symbols} 
            onCardClick={handleSymbolCardClick} 
            isQuestionUnlocked={isQuestionUnlocked}
            featuredFeedbacks={featuredFeedbacks}
            language={language}
          />
        </section>
      </div>

      {activePopup && (
        <Suspense fallback={null}>
          <Popup
            id={activePopup.id}
            type={activePopup.type}
            symbols={symbols}
            discovered={symbols[activePopup.id]}
            onClose={closePopup}
            language={language}
            onToggleLanguage={toggleLanguage}
          />
        </Suspense>
      )}

      {isQrScannerOpen && (
        <Suspense fallback={null}>
          <QRScannerPopup
            language={language}
            onClose={() => setIsQrScannerOpen(false)}
            onDetected={handleQrScannerDetected}
          />
        </Suspense>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10 bg-gradient-to-t from-white/95 to-transparent" />

      {toast && (
        <div className="pointer-events-none fixed bottom-10 left-1/2 z-[120] -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full text-sm shadow-lg animate-fade-in-out">
          {toast}
        </div>
      )}
    </div>
  );
}


