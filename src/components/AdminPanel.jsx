import React, { useState, useEffect } from 'react';
import MapArea, { DEFAULT_MAP_PINS } from './MapArea';
import { db, doc, getDoc, setDoc } from '../firebase';
import { Save, RefreshCw, ArrowLeft, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AdminPanel({ onBack }) {
  const [pins, setPins] = useState(DEFAULT_MAP_PINS);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notification, setNotification] = useState({ message: '', type: '' });

  // Firestore에서 현재 심볼 위치 데이터 로드
  useEffect(() => {
    async function loadPins() {
      try {
        const pinsDocRef = doc(db, 'settings', 'map_pins');
        const pinsDocSnap = await getDoc(pinsDocRef);

        if (pinsDocSnap.exists()) {
          const cloudPins = pinsDocSnap.data().pins;
          if (Array.isArray(cloudPins) && cloudPins.length > 0) {
            // 서버 데이터와 기본 핀 목록을 ID 기반으로 매칭 및 신규 핀 자동 추가 병합
            const mergedPins = DEFAULT_MAP_PINS.map(defaultPin => {
              const cloudMatch = cloudPins.find(cp => cp.id === defaultPin.id);
              return cloudMatch ? { ...defaultPin, ...cloudMatch } : defaultPin;
            });
            setPins(mergedPins);
          }
        }
      } catch (err) {
        console.error('핀 데이터 로드 중 에러 발생:', err);
        showNotification('서버에서 핀 데이터를 불러오지 못해 기본 좌표를 표시합니다.', 'error');
      } finally {
        setIsLoading(false);
      }
    }
    loadPins();
  }, []);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification({ message: '', type: '' });
    }, 3000);
  };

  // 실시간 핀 드래그 업데이트 핸들러
  const handlePinMove = (id, newLeft, newTop) => {
    setPins((prevPins) =>
      prevPins.map((pin) =>
        pin.id === id
          ? {
              ...pin,
              pinLeft: newLeft,
              pinTop: newTop,
              // 텍스트 위치도 상대적으로 함께 이동 (옵션)
              textLeft: (parseFloat(newLeft) + (parseFloat(pin.textLeft) - parseFloat(pin.pinLeft))) + '%',
              textTop: (parseFloat(newTop) + (parseFloat(pin.textTop) - parseFloat(pin.pinTop))) + '%',
            }
          : pin
      )
    );
  };

  // 위치 정보 Firestore 저장
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const pinsDocRef = doc(db, 'settings', 'map_pins');
      await setDoc(pinsDocRef, { pins }, { merge: true });
      showNotification('심볼 위치 정보가 성공적으로 클라우드에 저장되었습니다! ✨', 'success');
    } catch (err) {
      console.error('심볼 위치 저장 에러:', err);
      showNotification('위치 저장에 실패했습니다. Firebase 권한이나 네트워크를 확인해 주세요.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 디폴트 핀 좌표로 초기화
  const handleReset = () => {
    if (window.confirm('모든 심볼의 위치를 초기 기본값으로 리셋하시겠습니까?')) {
      setPins(DEFAULT_MAP_PINS);
      showNotification('기본 위치로 재설정되었습니다. 저장하려면 [저장하기]를 누르세요.', 'warning');
    }
  };

  // 모든 심볼 해금 상태 dummy 객체 (지도 핀 활성화 상태 표시용)
  const mockSymbols = Object.keys(DEFAULT_MAP_PINS.reduce((acc, p) => ({ ...acc, [p.id]: true }), {})).reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});

  return (
    <div className="w-full h-full min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Jua'] select-none overflow-y-auto pb-10">
      
      {/* 프리미엄 헤더 */}
      <header className="px-6 py-5 bg-slate-900/60 backdrop-blur-md border-b border-slate-800 flex items-center justify-between sticky top-0 z-50">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 rounded-xl transition-all border border-slate-700/50"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>뒤로가기</span>
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-indigo-400" />
          </div>
          <h1 className="text-xl font-bold tracking-wide">심볼 위치 관리자</h1>
        </div>
        <div className="w-20" /> {/* 레이아웃 균형용 */}
      </header>

      {/* 가이드 메시지 */}
      <div className="max-w-4xl mx-auto w-full px-6 pt-8">
        <div className="bg-gradient-to-r from-indigo-950/40 to-slate-900/40 border border-indigo-500/20 rounded-2xl p-5 backdrop-blur-md shadow-xl flex items-start gap-4">
          <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/30 text-indigo-400">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-indigo-300 mb-1">지도 심볼 위치 조정 모드</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              지도 위에 배치된 원형 심볼 아이콘들을 **마우스로 드래그 앤 드롭**하여 실시간으로 위치를 바꿀 수 있습니다. 
              조정을 끝마친 후에는 우측 상단의 **[저장하기]** 버튼을 반드시 눌러야 클라우드 데이터에 반영됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* 메인 에디팅 영역 */}
      <main className="max-w-4xl mx-auto w-full px-6 py-8 flex flex-col md:flex-row gap-8 items-stretch">
        
        {/* 지도 작업대 */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-5 shadow-2xl backdrop-blur-md">
            {isLoading ? (
              <div className="w-full aspect-[345/324] bg-slate-950/60 rounded-2xl flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-sm text-slate-500">지도 데이터를 불러오는 중...</p>
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
          <div className="flex justify-between items-center px-2">
            <span className="text-xs text-slate-500 tracking-wider">
              * 지도 확대 및 축소(더블클릭/휠)된 상태에서도 오차 없이 드래그가 정상 작동합니다.
            </span>
          </div>
        </div>

        {/* 컨트롤 보드 */}
        <div className="w-full md:w-80 flex flex-col gap-5 justify-between">
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-md flex-1">
            <h3 className="text-md font-bold text-slate-300 mb-4 border-b border-slate-800 pb-3">실시간 좌표 검침기</h3>
            
            <div className="space-y-3 max-h-[380px] overflow-y-auto scroll-container pr-1">
              {pins.map((pin) => (
                <div key={pin.id} className="flex justify-between items-center bg-slate-950/60 border border-slate-900 rounded-xl px-4 py-2.5 text-sm transition-all hover:bg-slate-950 hover:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-2.5 h-2.5 rounded-full" 
                      style={{ backgroundColor: pin.color }}
                    />
                    <span className="text-slate-200">{pin.label || '특별 심볼'}</span>
                    <span className="text-[10px] bg-slate-800 text-slate-400 rounded px-1.5 py-0.5">{pin.type}</span>
                  </div>
                  <div className="text-xs font-mono text-indigo-400 text-right">
                    <div>L: {pin.pinLeft}</div>
                    <div>T: {pin.pinTop}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-95 text-white font-bold rounded-2xl shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 border border-indigo-400/20 disabled:opacity-40 disabled:pointer-events-none transition-all"
            >
              {isSaving ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              <span>변경사항 저장하기</span>
            </button>

            <button
              onClick={handleReset}
              disabled={isLoading}
              className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-slate-400 hover:text-slate-300 font-bold rounded-2xl border border-slate-800 flex items-center justify-center gap-2 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              <span>기본값으로 되돌리기</span>
            </button>
          </div>
        </div>

      </main>

      {/* 알림 토스트 */}
      {notification.message && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2.5 px-6 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-xl animate-fade-in ${
          notification.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300' 
            : notification.type === 'warning'
            ? 'bg-amber-950/90 border-amber-500/30 text-amber-300'
            : 'bg-rose-950/90 border-rose-500/30 text-rose-300'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-amber-400" />
          )}
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

    </div>
  );
}
