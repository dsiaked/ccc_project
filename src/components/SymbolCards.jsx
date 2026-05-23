import React from 'react';
import { Lock, Unlock, Heart, Divide } from 'lucide-react';

const CustomCrossIcon = ({ className = "w-6 h-6", color = "currentColor", strokeWidth = "2.5" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth={strokeWidth} 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <line x1="12" y1="2.5" x2="12" y2="21.5" />
    <line x1="6.5" y1="8" x2="17.5" y2="8" />
  </svg>
);

export default function SymbolCards({ symbols, onCardClick, isQuestionUnlocked }) {
  const cards = [
    { id: 'heart', label: '하트', icon: <Heart className="w-8 h-8 text-pink-500" /> },
    { id: 'divide', label: '나누기', icon: <Divide className="w-8 h-8 text-blue-500" /> },
    { id: 'cross', label: '십자가', icon: <CustomCrossIcon className="w-8 h-8" color="#374151" strokeWidth="2.5" /> },
    { id: 'question', label: '특별 심볼', icon: <span className="text-4xl font-bold text-yellow-500 select-none font-['Cafe24_Ssurround']">?</span> }
  ];

  const checkDiscovered = (id) => {
    if (id === 'heart') {
      return symbols.heart_kymin || symbols.heart_yewon || symbols.heart_eunhye || symbols.heart_jihoon;
    }
    if (id === 'divide') {
      return symbols.divide_kyeomjun || symbols.divide_yewon;
    }
    return symbols[id];
  };

  return (
    <div className="grid grid-cols-2 gap-4 pb-8">
      {cards.map((card) => {
        const isDiscovered = checkDiscovered(card.id);

        if (card.id === 'question') {
          // 3단계 특별 심볼 동적 렌더링 분기
          if (!isQuestionUnlocked) {
            // 1단계: 잠금 상태 (Locked)
            return (
              <div 
                key={card.id} 
                className="w-full aspect-[0.78] border-[3.5px] border-dashed border-gray-200 rounded-[24px] bg-white shadow-sm overflow-hidden relative cursor-pointer"
                onClick={() => onCardClick(card.id)}
              >
                <div className="absolute top-0 left-0 w-full h-[55%] bg-gray-50 flex flex-col items-center justify-center">
                  <span className="text-4xl opacity-50">❓</span>
                </div>
                <div className="absolute top-[38%] left-1/2 -translate-x-1/2 w-12 h-12 bg-white rounded-full border-[2.5px] border-gray-200 flex items-center justify-center shadow-md">
                  <Lock className="w-5 h-5 text-gray-400" />
                </div>
                <div className="absolute bottom-3 left-4 flex flex-col gap-1.5">
                  <span className="text-gray-400 text-lg">{card.label}</span>
                  <div className="bg-gray-100 border-[1.5px] border-gray-300 rounded-full px-2.5 py-0.5 flex items-center gap-1.5 w-fit">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                    <span className="text-gray-500 text-xs mt-0.5">미해금</span>
                  </div>
                </div>
              </div>
            );
          } else if (!symbols.question) {
            // 2단계: 잠금 해제 & 위치 탐색 (Unlocked & Waiting)
            return (
              <div 
                key={card.id} 
                className="w-full aspect-[0.78] border-[3.5px] border-solid border-sky-300 rounded-[24px] bg-sky-50/20 shadow-md overflow-hidden relative cursor-pointer transition-transform hover:scale-105"
                onClick={() => onCardClick(card.id)}
              >
                <div className="absolute top-0 left-0 w-full h-[55%] bg-sky-50 flex items-center justify-center">
                  <span className="text-4xl font-bold text-sky-400/80 animate-pulse select-none font-['Cafe24_Ssurround']">?</span>
                </div>
                <div className="absolute top-[38%] left-1/2 -translate-x-1/2 w-12 h-12 bg-white rounded-full border-[2.5px] border-sky-300 flex items-center justify-center shadow-md">
                  <Unlock className="w-5 h-5 text-sky-600 animate-bounce" />
                </div>
                <div className="absolute bottom-3 left-4 flex flex-col gap-1.5">
                  <span className="text-sky-800 text-lg">{card.label}</span>
                  <div className="bg-sky-50 border-[1.5px] border-sky-200 rounded-full px-2.5 py-0.5 flex items-center gap-1.5 w-fit">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
                    </span>
                    <span className="text-sky-700 text-xs mt-0.5">위치확인!</span>
                  </div>
                </div>
              </div>
            );
          } else {
            // 3단계: 완전히 발견 완료된 상태 (Discovered)
            return (
              <div 
                key={card.id} 
                className="w-full aspect-[0.78] border-[3.5px] border-solid border-gray-200 rounded-[24px] bg-white shadow-md overflow-hidden relative cursor-pointer transition-transform hover:scale-105"
                onClick={() => onCardClick(card.id)}
              >
                <div className="absolute top-0 left-0 w-full h-[55%] bg-purple-50 flex items-center justify-center">
                  {card.icon}
                </div>
                <div className="absolute top-[38%] left-1/2 -translate-x-1/2 w-12 h-12 bg-white rounded-full border-[2.5px] border-gray-200 flex items-center justify-center shadow-md">
                  <Unlock className="w-5 h-5 text-purple-600" />
                </div>
                <div className="absolute bottom-3 left-4 flex flex-col gap-1.5">
                  <span className="text-gray-800 text-lg">{card.label}</span>
                  <div className="bg-purple-50 border-[1.5px] border-purple-200 rounded-full px-2.5 py-0.5 flex items-center gap-1.5 w-fit">
                    <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                    <span className="text-purple-700 text-xs mt-0.5">발견완료!</span>
                  </div>
                </div>
              </div>
            );
          }
        }

        if (!isDiscovered) {
          return (
            <div 
              key={card.id} 
              className="w-full aspect-[0.78] border-[3.5px] border-dashed border-gray-200 rounded-[24px] bg-white shadow-sm overflow-hidden relative cursor-pointer"
              onClick={() => onCardClick(card.id)}
            >
              <div className="absolute top-0 left-0 w-full h-[55%] bg-gray-50 flex flex-col items-center justify-center">
                <span className="text-4xl opacity-50">❓</span>
              </div>
              <div className="absolute top-[38%] left-1/2 -translate-x-1/2 w-12 h-12 bg-white rounded-full border-[2.5px] border-gray-200 flex items-center justify-center shadow-md">
                <Lock className="w-5 h-5 text-gray-400" />
              </div>
              <div className="absolute bottom-3 left-4 flex flex-col gap-1.5">
                <span className="text-gray-400 text-lg">{card.label}</span>
                <div className="bg-gray-100 border-[1.5px] border-gray-300 rounded-full px-2.5 py-0.5 flex items-center gap-1.5 w-fit">
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                  <span className="text-gray-500 text-xs mt-0.5">미발견</span>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div 
            key={card.id} 
            className="w-full aspect-[0.78] border-[3.5px] border-solid border-gray-200 rounded-[24px] bg-white shadow-md overflow-hidden relative cursor-pointer transition-transform hover:scale-105"
            onClick={() => onCardClick(card.id)}
          >
            <div className="absolute top-0 left-0 w-full h-[55%] bg-purple-50 flex items-center justify-center">
              {card.icon}
            </div>
            <div className="absolute top-[38%] left-1/2 -translate-x-1/2 w-12 h-12 bg-white rounded-full border-[2.5px] border-gray-200 flex items-center justify-center shadow-md">
              <Unlock className="w-5 h-5 text-purple-600" />
            </div>
            <div className="absolute bottom-3 left-4 flex flex-col gap-1.5">
              <span className="text-gray-800 text-lg">{card.label}</span>
              <div className="bg-purple-50 border-[1.5px] border-purple-200 rounded-full px-2.5 py-0.5 flex items-center gap-1.5 w-fit">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                <span className="text-purple-700 text-xs mt-0.5">발견완료!</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
