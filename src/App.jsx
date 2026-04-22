import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MapArea from './components/MapArea';
import SymbolCards from './components/SymbolCards';
import Popup from './components/Popup';
import CompletedPopup from './components/CompletedPopup';

export default function App() {
  const [symbols, setSymbols] = useState({
    heart: false,
    cross: false,
    divide: false,
    question: false,
  });

  const [activePopup, setActivePopup] = useState(null); // 'heart', 'cross', 'divide', 'question', null
  const [showCompleted, setShowCompleted] = useState(false);

  const discoveredCount = Object.values(symbols).filter(Boolean).length;

  useEffect(() => {
    if (discoveredCount === 4 && !showCompleted) {
      // Small delay before showing completed popup
      const timer = setTimeout(() => {
        setShowCompleted(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [discoveredCount]);

  const handleSymbolClick = (id) => {
    if (!symbols[id]) {
      setSymbols(prev => ({ ...prev, [id]: true }));
    }
    setActivePopup(id);
  };

  const closePopup = () => {
    setActivePopup(null);
  };

  return (
    <div className="w-full h-full flex flex-col bg-white overflow-hidden relative font-['Jua']">
      <div className="flex-1 overflow-y-auto scroll-container pb-10">
        <Header discoveredCount={discoveredCount} />
        
        <div className="px-6 pb-6">
          <MapArea symbols={symbols} onSymbolClick={handleSymbolClick} />
        </div>

        <div className="px-6 pt-6">
          <div className="flex justify-center mb-5">
            <div className="bg-white border-[2.8px] border-purple-800 rounded-full px-8 py-3 shadow-[0_4px_12px_rgba(107,33,168,0.15)]">
              <h2 className="text-purple-800 text-2xl">심볼 설명 카드</h2>
            </div>
          </div>
          <SymbolCards symbols={symbols} onCardClick={setActivePopup} />
        </div>
      </div>

      {activePopup && (
        <Popup id={activePopup} onClose={closePopup} />
      )}

      {showCompleted && (
        <CompletedPopup onClose={() => setShowCompleted(false)} />
      )}
    </div>
  );
}
