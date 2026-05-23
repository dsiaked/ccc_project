import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MapArea from './components/MapArea';
import SymbolCards from './components/SymbolCards';
import Popup from './components/Popup';
import CompletedPopup from './components/CompletedPopup';
import { symbolData } from './data/symbolData';

// Firebase imports
import { auth, db, signInAnonymously, doc, getDoc, setDoc } from './firebase';
import { Sparkles } from 'lucide-react';

const INITIAL_SYMBOLS = Object.keys(symbolData).reduce((acc, id) => {
  acc[id] = false;
  return acc;
}, {});

const TOTAL_SYMBOLS = 4; // 하트, 나누기, 십자가, 물음표 카테고리 기준

export default function App() {
  const [symbols, setSymbols] = useState(() => {
    const savedSymbols = localStorage.getItem('symbols');

    if (!savedSymbols) return INITIAL_SYMBOLS;

    try {
      return {
        ...INITIAL_SYMBOLS,
        ...JSON.parse(savedSymbols),
      };
    } catch {
      return INITIAL_SYMBOLS;
    }
  });

  const [userId, setUserId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [activePopup, setActivePopup] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedPopupSeen, setCompletedPopupSeen] = useState(() => {
    return localStorage.getItem('completedPopupSeen') === 'true';
  });
  const [toast, setToast] = useState('');

  // 1개 이상 해금 시 해당 카테고리 발견 완료로 판정
  const isHeartDiscovered = symbols.heart_kymin || symbols.heart_yewon || symbols.heart_eunhye || symbols.heart_jihoon;
  const isDivideDiscovered = symbols.divide_kyeomjun || symbols.divide_yewon;
  const isCrossDiscovered = symbols.cross;
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
    const isResetRequested = params.get('reset') === 'true';

    if (isResetRequested) {
      localStorage.clear();
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

    let symbol = params.get('symbol');

    if (symbol) {
      if (symbol === 'heart') symbol = 'heart_kymin';
      else if (symbol === 'divide') symbol = 'divide_kyeomjun';

      if (Object.prototype.hasOwnProperty.call(INITIAL_SYMBOLS, symbol)) {
        setSymbols(prev => {
          if (prev[symbol]) return prev;
          const next = { ...prev, [symbol]: true };
          localStorage.setItem('symbols', JSON.stringify(next));
          return next;
        });

        if (symbol === 'question') {
          // question은 발견했을 때 설명하는 팝업창 없이 바로 완료(축하) 팝업을 노출
          setShowCompleted(true);
          setCompletedPopupSeen(true);
          localStorage.setItem('completedPopupSeen', 'true');
        } else {
          setActivePopup({
            type: 'qr',
            id: symbol,
          });
        }

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

        // Firestore에서 사용자 해금 데이터 로드
        const userDocRef = doc(db, 'users', uid);

        // 🔄 로컬에서 요청된 초기화(리셋) 플래그가 있는 경우 클라우드 및 로컬스토리지 강제 초기화 진행
        if (localStorage.getItem('needReset') === 'true') {
          await setDoc(userDocRef, { symbols: INITIAL_SYMBOLS });
          localStorage.removeItem('needReset');
          localStorage.removeItem('completedPopupSeen');
          localStorage.setItem('completedPopupSeen', 'false');
          setCompletedPopupSeen(false);
          setSymbols(INITIAL_SYMBOLS);
          return;
        }

        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const cloudData = userDocSnap.data();
          const cloudSymbols = cloudData.symbols || {};

          // 로컬 데이터와 클라우드 데이터의 영리한 병합 (OR 논리합)
          setSymbols(prev => {
            const merged = {};
            for (const key of Object.keys(INITIAL_SYMBOLS)) {
              merged[key] = !!(prev[key] || cloudSymbols[key]);
            }
            // 병합 완료된 최신 데이터를 다시 클라우드 및 로컬스토리지에 반영
            setDoc(userDocRef, { symbols: merged }, { merge: true });
            localStorage.setItem('symbols', JSON.stringify(merged));
            return merged;
          });
        } else {
          // 최초 접속 사용자: 현재 로컬의 해금 데이터를 Firestore에 백업 등록
          setSymbols(current => {
            setDoc(userDocRef, { symbols: current });
            return current;
          });
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

  // 4. 전체 해금 시 완료 팝업 자동 기동
  useEffect(() => {
    if (
      discoveredCount === TOTAL_SYMBOLS &&
      !completedPopupSeen &&
      activePopup === null &&
      !isLoading
    ) {
      const timerId = setTimeout(() => {
        setShowCompleted(true);
        setCompletedPopupSeen(true);
        localStorage.setItem('completedPopupSeen', 'true');
      }, 500);

      return () => clearTimeout(timerId);
    }
  }, [discoveredCount, completedPopupSeen, activePopup, isLoading]);

  const handleMapSymbolClick = id => {
    if (id === 'question') {
      if (!isQuestionUnlocked) {
        setToast('나머지 3개의 심볼을 해금해야 할 거 같다... 🔒');
        setTimeout(() => {
          setToast('');
        }, 2000);
        return;
      }
      if (!symbols.question) {
        setActivePopup({
          type: 'question_guide',
          id: 'question',
        });
        return;
      }
      // 이미 발견된 완료 상태인 경우 설명창 없이 바로 완료 팝업 오픈
      setShowCompleted(true);
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
        setToast('나머지 3개의 심볼을 해금해야 할 거 같다... 🔒');
        setTimeout(() => {
          setToast('');
        }, 2000);
        return;
      }
      if (!symbols.question) {
        setActivePopup({
          type: 'question_guide',
          id: 'question',
        });
        return;
      }
      // 이미 발견된 완료 상태인 경우 설명창 없이 바로 완료 팝업 오픈
      setShowCompleted(true);
      return;
    }

    const isCategoryDiscovered = 
      id === 'heart' ? isHeartDiscovered :
      id === 'divide' ? isDivideDiscovered :
      symbols[id];

    if (!isCategoryDiscovered) {
      setToast('아직 발견하지 못한 심볼이에요 🔒');

      setTimeout(() => {
        setToast('');
      }, 1500);

      return;
    }

    if (id === 'heart' || id === 'divide') {
      setActivePopup({
        type: 'multi',
        id, // 'heart' 또는 'divide'
      });
    } else {
      setActivePopup({
        type: 'qr',
        id, // 'cross' 또는 'question'
      });
    }
  };

  const closePopup = () => {
    setActivePopup(null);
  };

  return (
    <div className="w-full h-full flex flex-col bg-white overflow-hidden relative font-['Jua']">
      
      {/* 5. 프리미엄 글래스모피즘 동기화 로딩 화면 */}
      {isLoading && (
        <div className="fixed inset-0 bg-white/75 backdrop-blur-xl z-[100] flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className="w-20 h-20 bg-purple-50 border-[3px] border-[#F8CFD0] rounded-[28px] flex items-center justify-center shadow-lg mb-6 animate-bounce">
            <Sparkles className="w-10 h-10 text-purple-600 animate-pulse" />
          </div>
          <h3 className="font-['Cafe24_Ssurround'] font-bold text-2xl text-gray-800 text-center mb-2">
            기기 데이터 동기화 중
          </h3>
          <p className="text-gray-500 text-sm text-center leading-relaxed max-w-[240px]">
            기기별 해금 데이터를 안전하게 로드하고 있습니다. 잠시만 기다려주세요!
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scroll-container pb-10">
        <Header discoveredCount={discoveredCount} />

        <div className="px-6 pb-6">
          <MapArea 
            symbols={symbols} 
            onSymbolClick={handleMapSymbolClick} 
            isQuestionUnlocked={isQuestionUnlocked}
          />
        </div>

        <div className="px-6 pt-6">
          <div className="flex justify-center mb-5">
            <div className="bg-white border-[2.8px] border-purple-800 rounded-full px-8 py-3 shadow-[0_4px_12px_rgba(107,33,168,0.15)]">
              <h2 className="text-purple-800 text-2xl">심볼 설명 카드</h2>
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

      {showCompleted && (
        <CompletedPopup onClose={() => setShowCompleted(false)} />
      )}

      {discoveredCount === TOTAL_SYMBOLS && !isLoading && (
        <button
          onClick={() => setShowCompleted(true)}
          className="fixed bottom-6 right-6 px-4 py-2 bg-purple-700 text-white rounded-full shadow-lg"
        >
          완료 팝업 다시 보기
        </button>
      )}

      {toast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full text-sm shadow-lg animate-fade-in-out">
          {toast}
        </div>
      )}
    </div>
  );
}