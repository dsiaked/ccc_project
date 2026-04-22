import React from 'react';
import { Lock, Heart, Cross, Divide, Sparkles } from 'lucide-react';

export default function SymbolCards({ symbols, onCardClick }) {
  const cards = [
    { id: 'heart', label: '하트', icon: <Heart className="w-8 h-8 text-pink-500" /> },
    { id: 'cross', label: '십자가', icon: <Cross className="w-8 h-8 text-gray-700" /> },
    { id: 'divide', label: '나누기', icon: <Divide className="w-8 h-8 text-blue-500" /> },
    { id: 'question', label: '특별 심볼', icon: <Sparkles className="w-8 h-8 text-yellow-500" /> }
  ];

  return (
    <div className="grid grid-cols-2 gap-4 pb-8">
      {cards.map((card) => {
        const isDiscovered = symbols[card.id];

        if (!isDiscovered) {
          return (
            <div 
              key={card.id} 
              className="w-full aspect-[0.9] border-[3.5px] border-dashed border-gray-200 rounded-[24px] bg-white shadow-sm overflow-hidden relative cursor-pointer"
              onClick={() => onCardClick(card.id)}
            >
              <div className="absolute top-0 left-0 w-full h-[60%] bg-gray-50 flex flex-col items-center justify-center">
                <span className="text-4xl opacity-50">❓</span>
              </div>
              <div className="absolute top-[45%] left-1/2 -translate-x-1/2 w-14 h-14 bg-white rounded-full border-[2.5px] border-gray-200 flex items-center justify-center shadow-md">
                <Lock className="w-6 h-6 text-gray-400" />
              </div>
              <div className="absolute bottom-4 left-4 flex flex-col gap-1.5">
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
            className="w-full aspect-[0.9] border-[3.5px] border-solid border-gray-200 rounded-[24px] bg-white shadow-md overflow-hidden relative cursor-pointer transition-transform hover:scale-105"
            onClick={() => onCardClick(card.id)}
          >
            <div className="absolute top-0 left-0 w-full h-[60%] bg-purple-50 flex items-center justify-center">
              {card.icon}
            </div>
            <div className="absolute top-[45%] left-1/2 -translate-x-1/2 w-14 h-14 bg-white rounded-full border-[2.5px] border-gray-200 flex items-center justify-center shadow-md">
              <Sparkles className="w-6 h-6 text-purple-600" />
            </div>
            <div className="absolute bottom-4 left-4 flex flex-col gap-1.5">
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
