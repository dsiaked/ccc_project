import React, { useRef, useState, useEffect } from 'react';
import Header from './components/Header';
import MapArea, { DEFAULT_MAP_PINS } from './components/MapArea';
import SymbolCards from './components/SymbolCards';
import Popup from './components/Popup';
import ParticipatePage from './components/ParticipatePage';
import AdminPanel from './components/AdminPanel';
import { symbolData } from './data/symbolData';

// Firebase imports
import { auth, db, signInAnonymously, doc, getDoc, setDoc } from './firebase';
import { Sparkles, Shield } from 'lucide-react';

const INITIAL_SYMBOLS = Object.keys(symbolData).reduce((acc, id) => {
  acc[id] = false;
  return acc;
}, {});

const UNLOCKED_SYMBOLS = Object.keys(symbolData).reduce((acc, id) => {
  acc[id] = id !== 'question';
  return acc;
}, {});

const ADMIN_UNLOCK_CATEGORIES = {
  heart: ['heart_kymin', 'heart_yewon', 'heart_eunhye', 'heart_jihoon', 'heart_eunchae'],
  divide: ['divide_kyeomjun', 'divide_yewon'],
  cross: ['cross', 'cross_jihoon'],
};

const BASIC_UNLOCK_SYMBOLS = ['heart_kymin', 'divide_kyeomjun', 'cross'];

const QR_SYMBOL_ALIASES = {
  heart: 'heart_kymin',
  kymin: 'heart_kymin',
  kim_kyumin: 'heart_kymin',
  gyumin: 'heart_kymin',
  heart_kim: 'heart_kymin',
  yewon_heart: 'heart_yewon',
  heart_son: 'heart_yewon',
  eunhye: 'heart_eunhye',
  eunhye_heart: 'heart_eunhye',
  heart_kim_eunhye: 'heart_eunhye',
  jihoon_heart: 'heart_jihoon',
  heart_hong: 'heart_jihoon',
  divide: 'divide_kyeomjun',
  divide_kyeom: 'divide_kyeomjun',
  kyeomjun: 'divide_kyeomjun',
  divide_seo: 'divide_kyeomjun',
  yewon_divide: 'divide_yewon',
  divide_son: 'divide_yewon',
  cross_kyeomjun: 'cross',
  kyeomjun_cross: 'cross',
  cross_seo: 'cross',
  jihoon_cross: 'cross_jihoon',
  cross_hong: 'cross_jihoon',
  question_mark: 'question',
  reward: 'question',
  booth: 'question',
};

const ADMIN_UNLOCK_LABELS = {
  heart: '하트',
  divide: '나누기',
  cross: '십자가',
};

const normalizeSymbols = symbols => ({
  ...INITIAL_SYMBOLS,
  ...symbols,
});

const normalizeQrValue = value => {
  if (!value) return '';
  return decodeURIComponent(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
};

const resolveQrSymbol = value => {
  const normalizedValue = normalizeQrValue(value);
  if (!normalizedValue) return '';
  if (Object.prototype.hasOwnProperty.call(INITIAL_SYMBOLS, normalizedValue)) {
    return normalizedValue;
  }
  return QR_SYMBOL_ALIASES[normalizedValue] || '';
};

export default function App() {
  const [page, setPage] = useState(() => {
    const path = window.location.pathname;
    if (path === '/participate') return 'participate';
    if (path === '/admin-panel') return 'admin-panel';
    return 'home';
  });

  const [pins, setPins] = useState(DEFAULT_MAP_PINS);

  const [symbols, setSymbols] = useState(() => {
    const savedSymbols = localStorage.getItem('symbols');

    if (!savedSymbols) return INITIAL_SYMBOLS;

    try {
      return normalizeSymbols(JSON.parse(savedSymbols));
    } catch {
      return INITIAL_SYMBOLS;
    }
  });

  const [userId, setUserId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [activePopup, setActivePopup] = useState(null);
  const [toast, setToast] = useState('');
  const hasAutoOpenedQuestionGuide = useRef(
    localStorage.getItem('questionGuideAutoShown') === 'true',
  );

  // 1개 이상 해금 시 해당 카테고리 발견 완료로 판정
  const isHeartDiscovered = symbols.heart_kymin || symbols.heart_yewon || symbols.heart_eunhye || symbols.heart_jihoon || symbols.heart_eunchae;
  const isDivideDiscovered = symbols.divide_kyeomjun || symbols.divide_yewon;
  const isCrossDiscovered = symbols.cross || symbols.cross_jihoon;
  const isQuestionDiscovered = symbols.question;

  // 특별 심볼 해금 조건: 3가지 심볼이 모두 최소 1개 이상 해금되었을 때
  const isQuestionUnlocked = isHeartDiscovered && isDivideDiscovered && isCrossDiscovered;

  const discoveredCount = (isHeartDiscovered ? 1 : 0) + 
                          (isDivideDiscovered ? 1 : 0) + 
                          (isCrossDiscovered ? 1 : 0) +
                          (isQuestionDiscovered ? 1 : 0);

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
      localStorage.setItem('symbols', JSON.stringify(INITIAL_SYMBOLS));
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
        localStorage.setItem('symbols', JSON.stringify(next));
        return next;
      });
      setToast('하트, 나누기, 십자가가 해금되었어요.');

      setTimeout(() => {
        setToast('');
      }, 1500);

      window.history.replaceState({}, '', '/');
      return;
    }

    if (isAdminUnlockRequested) {
      localStorage.setItem('symbols', JSON.stringify(UNLOCKED_SYMBOLS));
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
        localStorage.setItem('symbols', JSON.stringify(next));
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
        setActivePopup(null);
        setPage('participate');
        window.history.replaceState({}, '', '/participate');
        return;
      }

      if (Object.prototype.hasOwnProperty.call(INITIAL_SYMBOLS, symbol)) {
        setSymbols(prev => {
          if (prev[symbol]) return prev;
          const next = { ...prev, [symbol]: true };
          localStorage.setItem('symbols', JSON.stringify(next));
          if (userId) {
            setDoc(doc(db, 'users', userId), { symbols: next }, { merge: true }).catch(err => {
              console.error('QR 해금 데이터 즉시 백업 중 에러 발생:', err);
            });
          }
          return next;
        });

        setActivePopup({
          type: 'qr',
          id: symbol,
        });

        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  // 2. Firebase 익명 로그인 및 Firestore 데이터 동기화
  useEffect(() => {
    async function initFirebaseSession() {
      try {
        // 백그라운드 익명 로그인 처리
        const userCredential = await signInAnonymously(auth);
        const uid = userCredential.user.uid;
        setUserId(uid);

        // 🔄 지도 핀(심볼) 위치 데이터 동적 로드
        try {
          const pinsDocRef = doc(db, 'settings', 'map_pins');
          const pinsDocSnap = await getDoc(pinsDocRef);
          if (pinsDocSnap.exists()) {
            const cloudPins = pinsDocSnap.data().pins;
            if (Array.isArray(cloudPins) && cloudPins.length > 0) {
              const mergedPins = DEFAULT_MAP_PINS.map(defaultPin => {
                const cloudMatch = cloudPins.find(cp => cp.id === defaultPin.id);
                return cloudMatch ? { ...defaultPin, ...cloudMatch } : defaultPin;
              });
              setPins(mergedPins);
            }
          }
        } catch (pinError) {
          console.error('심볼 위치(pins) 데이터를 로드하는 중 에러 발생:', pinError);
        }

        // Firestore에서 사용자 해금 데이터 로드
        const userDocRef = doc(db, 'users', uid);

        // 🔄 로컬에서 요청된 초기화(리셋) 플래그가 있는 경우 클라우드 및 로컬스토리지 강제 초기화 진행
        if (localStorage.getItem('needReset') === 'true') {
          await setDoc(userDocRef, { symbols: INITIAL_SYMBOLS });
          localStorage.removeItem('needReset');
          setSymbols(INITIAL_SYMBOLS);
          return;
        }

        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const cloudData = userDocSnap.data();
          const cloudSymbols = cloudData.symbols || {};

          // 로컬 데이터와 클라우드 데이터의 영리한 병합 (OR 논리합 + 불필요 리렌더 방지 얕은 비교)
          setSymbols(prev => {
            const merged = {};
            let isChanged = false;
            for (const key of Object.keys(INITIAL_SYMBOLS)) {
              const val = !!(prev[key] || cloudSymbols[key]);
              if (prev[key] !== val) isChanged = true;
              merged[key] = val;
            }
            return isChanged ? merged : prev;
          });
        } else {
          // 최초 접속 사용자: 로컬의 데이터를 유지하며, 아래 useEffect가 자동으로 클라우드에 백업하게 둠
          setSymbols(current => current);
        }
      } catch (error) {
        console.error('Firebase Auth/Firestore 동기화 중 에러 발생:', error);
        // 네트워크 장애 등으로 실패하더라도 로컬 스토리지 기반으로 정상 실행되도록 안전 보장
      } finally {
        setIsLoading(false);
      }
    }

    initFirebaseSession();
  }, []);

  // 3. 심볼 상태가 변경될 때마다 로컬 스토리지 및 Firestore에 상시 실시간 백업
  useEffect(() => {
    localStorage.setItem('symbols', JSON.stringify(symbols));

    if (userId && !isLoading) {
      const userDocRef = doc(db, 'users', userId);
      setDoc(userDocRef, { symbols }, { merge: true }).catch(err => {
        console.error('Firestore 백업 중 에러 발생:', err);
      });
    }
  }, [symbols, userId, isLoading]);

  useEffect(() => {
    if (
      !isQuestionUnlocked ||
      isQuestionDiscovered ||
      isLoading ||
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
  }, [isQuestionUnlocked, isQuestionDiscovered, isLoading, activePopup]);

  const handleMapSymbolClick = id => {
    if (id === 'question') {
      if (!isQuestionUnlocked) {
        setToast('하트, 나누기, 십자가를 모으면 상품 부스 안내가 열려요.');
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
        setToast('하트, 나누기, 십자가를 모으면 상품 부스 안내가 열려요.');
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
      setToast('아직 발견하지 못한 심볼이에요 🔒');

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

  const closePopup = () => {
    setActivePopup(null);
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

  if (page === 'participate') {
    return <ParticipatePage onBack={openHomePage} />;
  }

  if (page === 'admin-panel') {
    return <AdminPanel onBack={openHomePage} />;
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
            기기 데이터 동기화 중
          </h3>
          <p className="text-gray-500 text-sm text-center leading-relaxed max-w-[240px]">
            해금 데이터를 안전하게 불러오고 있어요. 잠시만 기다려 주세요.
          </p>
        </div>
      )}

      <div className="relative z-10 flex-1 overflow-y-auto scroll-container pb-10">
        <Header discoveredCount={discoveredCount} />

        <div className="px-6 pb-6">
          <MapArea 
            symbols={symbols} 
            onSymbolClick={handleMapSymbolClick} 
            isQuestionUnlocked={isQuestionUnlocked}
            pins={pins}
          />
        </div>

        <div className="px-6 pt-5">
          <div className="flex justify-center mb-5">
            <div className="bg-white border-2 border-slate-200 rounded-full px-7 py-2.5 shadow-[0_4px_12px_rgba(15,23,42,0.08)]">
              <h2 className="text-slate-900 text-2xl">작품 설명 카드</h2>
            </div>
          </div>

          <SymbolCards 
            symbols={symbols} 
            onCardClick={handleSymbolCardClick} 
            isQuestionUnlocked={isQuestionUnlocked}
          />
        </div>
      </div>

      {activePopup && (
        <Popup
          id={activePopup.id}
          type={activePopup.type}
          symbols={symbols}
          discovered={symbols[activePopup.id]}
          onClose={closePopup}
        />
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
