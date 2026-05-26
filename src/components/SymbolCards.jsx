import React from 'react';
import { Divide, Heart, Lock, Search, Unlock } from 'lucide-react';

const CustomCrossIcon = ({ className = 'w-6 h-6', color = 'currentColor', strokeWidth = '2.5' }) => (
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

const cards = [
  {
    id: 'heart',
    label: '하트',
    accent: 'pink',
    icon: <Heart className="w-8 h-8 text-pink-500 fill-pink-500/20" />,
  },
  {
    id: 'divide',
    label: '나누기',
    accent: 'orange',
    icon: <Divide className="w-8 h-8 text-orange-500" />,
  },
  {
    id: 'cross',
    label: '십자가',
    accent: 'lime',
    icon: <CustomCrossIcon className="w-8 h-8" color="#4d7c0f" strokeWidth="2.5" />,
  },
  {
    id: 'question',
    label: '물음표',
    accent: 'sky',
    icon: <span className="text-4xl font-bold text-sky-500 select-none font-['Cafe24_Ssurround']">?</span>,
  },
];

const accentClasses = {
  pink: {
    panel: 'bg-pink-50',
    border: 'border-pink-200',
    text: 'text-pink-700',
    dot: 'bg-pink-500',
  },
  orange: {
    panel: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
  },
  lime: {
    panel: 'bg-lime-50',
    border: 'border-lime-200',
    text: 'text-lime-700',
    dot: 'bg-lime-500',
  },
  sky: {
    panel: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-700',
    dot: 'bg-sky-500',
  },
};

export default function SymbolCards({ symbols, onCardClick, isQuestionUnlocked }) {
  const checkDiscovered = id => {
    if (id === 'heart') {
      return symbols.heart_kymin || symbols.heart_yewon || symbols.heart_eunhye || symbols.heart_jihoon;
    }
    if (id === 'divide') {
      return symbols.divide_kyeomjun || symbols.divide_yewon;
    }
    if (id === 'cross') {
      return symbols.cross || symbols.cross_jihoon;
    }
    return symbols[id];
  };

  const getState = card => {
    if (card.id === 'question' && !isQuestionUnlocked) return 'locked';
    if (card.id === 'question') return symbols.question ? 'discovered' : 'ready';
    return checkDiscovered(card.id) ? 'discovered' : 'locked';
  };

  return (
    <div className="grid grid-cols-2 gap-3.5 pb-8">
      {cards.map(card => {
        const state = getState(card);
        const accent = accentClasses[card.accent];
        const isLocked = state === 'locked';
        const isReady = state === 'ready';

        return (
          <button
            key={card.id}
            type="button"
            className={[
              'w-full aspect-[0.82] border-2 rounded-2xl bg-white overflow-hidden relative text-left cursor-pointer transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
              isLocked
                ? 'border-dashed border-slate-200 shadow-sm'
                : `${accent.border} shadow-[0_8px_18px_rgba(15,23,42,0.08)] hover:scale-[1.02]`,
            ].join(' ')}
            onClick={() => onCardClick(card.id)}
          >
            <div className={`absolute top-0 left-0 w-full h-[55%] flex items-center justify-center ${isLocked ? 'bg-slate-50' : accent.panel}`}>
              {isLocked ? <Search className="w-9 h-9 text-slate-300" /> : card.icon}
            </div>

            <div
              className={[
                'absolute top-[38%] left-1/2 -translate-x-1/2 w-11 h-11 bg-white rounded-full border-2 flex items-center justify-center shadow-sm',
                isLocked ? 'border-slate-200' : accent.border,
              ].join(' ')}
            >
              {isLocked ? (
                <Lock className="w-5 h-5 text-slate-400" />
              ) : (
                <Unlock className={`w-5 h-5 ${accent.text} ${isReady ? 'animate-bounce' : ''}`} />
              )}
            </div>

            <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-1.5">
              <span className={`text-lg leading-tight ${isLocked ? 'text-slate-400' : 'text-slate-900'}`}>
                {card.label}
              </span>
              <div
                className={[
                  'border rounded-full px-2.5 py-0.5 flex items-center gap-1.5 w-fit max-w-full',
                  isLocked ? 'bg-slate-50 border-slate-200' : `${accent.panel} ${accent.border}`,
                ].join(' ')}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${isLocked ? 'bg-slate-400' : accent.dot} ${isReady ? 'animate-pulse' : ''}`} />
                <span className={`text-xs mt-0.5 whitespace-nowrap ${isLocked ? 'text-slate-500' : accent.text}`}>
                  {isLocked ? '미발견' : isReady ? '위치 확인' : '발견 완료'}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
