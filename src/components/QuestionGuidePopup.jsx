import React from 'react';
import { MapPin, Sparkles, X } from 'lucide-react';

const sparkleDots = [
  'left-8 top-16 h-2 w-2 bg-yellow-300 delay-0',
  'right-10 top-20 h-1.5 w-1.5 bg-sky-300 delay-150',
  'left-12 bottom-28 h-1.5 w-1.5 bg-fuchsia-300 delay-300',
  'right-14 bottom-20 h-2 w-2 bg-emerald-300 delay-500',
  'left-1/2 top-10 h-1 w-1 bg-white delay-700',
];

export default function QuestionGuidePopup({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/55 backdrop-blur-md font-['Jua'] question-guide-overlay">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-x-[-20%] top-8 h-24 rotate-[-8deg] bg-gradient-to-r from-transparent via-indigo-300/25 to-transparent question-guide-sweep" />
        <div className="absolute inset-x-[-20%] bottom-16 h-20 rotate-[10deg] bg-gradient-to-r from-transparent via-emerald-200/20 to-transparent question-guide-sweep delay-300" />
        {sparkleDots.map(className => (
          <span
            key={className}
            className={`absolute rounded-full shadow-[0_0_18px_currentColor] question-guide-spark ${className}`}
          />
        ))}
      </div>

      <div className="relative w-full max-w-[320px] overflow-hidden rounded-[30px] bg-white p-6 shadow-[0_28px_70px_rgba(15,23,42,0.35)] border border-white/80 flex flex-col items-center question-guide-card">
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-indigo-100 via-sky-50 to-transparent pointer-events-none" />
        <button
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/85 flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-700 active:scale-90 transition-all border border-slate-100 shadow-sm"
        >
          <X className="w-4 h-4 stroke-[2.5]" />
        </button>

        <div className="relative mb-4 flex h-20 w-20 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-indigo-100 question-guide-ping" />
          <span className="absolute inset-2 rounded-full bg-sky-100 question-guide-ping delay-300" />
          <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-600 via-sky-500 to-emerald-400 flex items-center justify-center shadow-[0_14px_28px_rgba(37,99,235,0.28)] rotate-3">
            <Sparkles className="absolute -right-2 -top-2 w-5 h-5 text-yellow-300 question-guide-twinkle" />
            <MapPin className="w-8 h-8 text-white drop-shadow" />
          </div>
        </div>

        <p className="relative text-[11px] font-bold tracking-[0.24em] text-indigo-600 uppercase mb-2">
          Final Clue
        </p>

        <h3 className="relative text-slate-950 text-[22px] font-bold mb-3 font-['Cafe24_Ssurround'] text-center">
          상품 부스 안내
        </h3>

        <p className="relative text-slate-700 text-[15px] font-bold text-center leading-relaxed mb-5">
          세 가지 심볼을 모두 모았어요. 이제 상품 부스로 이동해 이벤트에 참여할 수 있습니다.
        </p>

        <div className="relative bg-slate-50 border border-slate-100 rounded-2xl p-4 w-full text-center mb-6 shadow-inner">
          <span className="text-slate-500 text-xs block mb-2">위치 힌트</span>
          <p className="text-slate-800 text-sm font-bold leading-relaxed">
            광활한 잔디밭, 지붕 하나
          </p>
        </div>

        <button
          onClick={onClose}
          className="relative w-full py-3.5 rounded-2xl bg-slate-950 hover:bg-indigo-950 text-white font-['Cafe24_Ssurround'] font-bold text-base shadow-[0_10px_22px_rgba(15,23,42,0.25)] transition-all active:scale-[0.98]"
        >
          확인
        </button>
      </div>
    </div>
  );
}
