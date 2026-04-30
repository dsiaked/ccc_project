import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MapArea from './components/MapArea';
import SymbolCards from './components/SymbolCards';
import Popup from './components/Popup';
import CompletedPopup from './components/CompletedPopup';
import { symbolData } from './data/symbolData';

const INITIAL_SYMBOLS = Object.keys(symbolData).reduce((acc, id) => {
  acc[id] = false;
  return acc;
}, {});

const TOTAL_SYMBOLS = Object.keys(INITIAL_SYMBOLS).length;

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

  const [activePopup, setActivePopup] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedPopupSeen, setCompletedPopupSeen] = useState(() => {
    return localStorage.getItem('completedPopupSeen') === 'true';
  });
  const [toast, setToast] = useState('');

  const discoveredCount = Object.values(symbols).filter(Boolean).length;

  useEffect(() => {
    localStorage.setItem('symbols', JSON.stringify(symbols));
  }, [symbols]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const symbol = params.get('symbol');

    if (!symbol || !Object.prototype.hasOwnProperty.call(INITIAL_SYMBOLS, symbol)) {
      return;
    }

    setSymbols(prev => {
      if (prev[symbol]) return prev;

      return {
        ...prev,
        [symbol]: true,
      };
    });

    setActivePopup({
      type: 'qr',
      id: symbol,
    });

    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (
      discoveredCount === TOTAL_SYMBOLS &&
      !completedPopupSeen &&
      activePopup === null
    ) {
      const timerId = setTimeout(() => {
        setShowCompleted(true);
        setCompletedPopupSeen(true);
        localStorage.setItem('completedPopupSeen', 'true');
      }, 500);

      return () => clearTimeout(timerId);
    }
  }, [discoveredCount, completedPopupSeen, activePopup]);

  const handleMapSymbolClick = id => {
    setActivePopup({
      type: 'map',
      id,
    });
  };

  const handleSymbolCardClick = id => {
    if (!symbols[id]) {
      setToast('아직 발견하지 못한 심볼이에요 🔒');

      setTimeout(() => {
        setToast('');
      }, 1500);

      return;
    }

    setActivePopup({
      type: 'qr',
      id,
    });
  };

  const closePopup = () => {
    setActivePopup(null);
  };

  return (
    <div className="w-full h-full flex flex-col bg-white overflow-hidden relative font-['Jua']">
      <div className="flex-1 overflow-y-auto scroll-container pb-10">
        <Header discoveredCount={discoveredCount} />

        <div className="px-6 pb-6">
          <MapArea symbols={symbols} onSymbolClick={handleMapSymbolClick} />
        </div>

        <div className="px-6 pt-6">
          <div className="flex justify-center mb-5">
            <div className="bg-white border-[2.8px] border-purple-800 rounded-full px-8 py-3 shadow-[0_4px_12px_rgba(107,33,168,0.15)]">
              <h2 className="text-purple-800 text-2xl">심볼 설명 카드</h2>
            </div>
          </div>

          <SymbolCards symbols={symbols} onCardClick={handleSymbolCardClick} />
        </div>
      </div>

      {activePopup && (
        <Popup
          id={activePopup.id}
          type={activePopup.type}
          discovered={symbols[activePopup.id]}
          onClose={closePopup}
        />
      )}

      {showCompleted && (
        <CompletedPopup onClose={() => setShowCompleted(false)} />
      )}

      {discoveredCount === TOTAL_SYMBOLS && (
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