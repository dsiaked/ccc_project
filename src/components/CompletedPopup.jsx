import React from 'react';
import { PartyPopper } from 'lucide-react';

export default function CompletedPopup({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-[320px] rounded-[36px] overflow-hidden flex flex-col items-center p-8 shadow-[0_20px_60px_rgba(0,0,0,0.4)] animate-in zoom-in-90 duration-500 relative">
        
        {/* Background decorations */}
        <div className="absolute -top-10 -left-10 w-32 h-32 bg-yellow-400 rounded-full blur-3xl opacity-20" />
        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-purple-500 rounded-full blur-3xl opacity-20" />
        
        <div className="w-24 h-24 mb-6 relative flex items-center justify-center">
          <div className="absolute inset-0 bg-yellow-100 rounded-full animate-ping opacity-70" />
          <div className="relative w-20 h-20 bg-gradient-to-tr from-yellow-300 to-yellow-500 rounded-full flex items-center justify-center shadow-lg border-4 border-white z-10">
            <span className="text-4xl">🏆</span>
          </div>
        </div>
        
        <h2 className="text-[28px] text-gray-800 mb-4 text-center font-bold tracking-tight">
          🎉 축하합니다! 🎉
        </h2>
        
        <p className="text-gray-600 text-center mb-2 text-lg">
          4개의 모든 심볼을 발견했어요!
        </p>
        <p className="text-purple-600 text-center mb-8 font-medium">
          특별한 선물이 기다리고 있어요! 🎁✨
        </p>
        
        <button 
          onClick={onClose}
          className="w-full bg-gradient-to-r from-purple-700 to-purple-500 text-white rounded-full py-4 text-xl shadow-[0_8px_20px_rgba(107,33,168,0.3)] hover:opacity-90 transition-all active:scale-[0.98] font-medium"
        >
          확인 🎊
        </button>
      </div>
      
      {/* Confetti effects */}
      <span className="absolute top-[20%] left-[10%] text-3xl animate-bounce" style={{ animationDelay: '0.1s' }}>✨</span>
      <span className="absolute top-[15%] right-[15%] text-4xl animate-bounce" style={{ animationDelay: '0.3s' }}>🎉</span>
      <span className="absolute bottom-[20%] left-[15%] text-4xl animate-bounce" style={{ animationDelay: '0.5s' }}>🎊</span>
      <span className="absolute bottom-[25%] right-[10%] text-3xl animate-bounce" style={{ animationDelay: '0.2s' }}>⭐</span>
    </div>
  );
}
