import React from 'react';
import { Sparkles } from 'lucide-react';

export default function Header({ discoveredCount }) {
  const totalDiscoverableSymbols = 4;
  const progress = (discoveredCount / totalDiscoverableSymbols) * 100;

  return (
    <header className="w-full pt-8 px-6 pb-5 flex flex-col gap-5">
      <div className="flex flex-col items-center justify-center gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.28em] text-indigo-600 font-bold">
          Exhibition Tour
        </span>
        <h1 className="text-[28px] font-black text-center text-slate-950 font-['Cafe24_Ssurround']">
          붕어방 작품 투어
        </h1>
        <div className="w-10 h-[3px] bg-indigo-500 rounded-full mt-1" />
      </div>

      <section className="flex flex-col gap-3" aria-label="탐색 진행률">
        <div className="flex items-center justify-between min-h-11">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <span className="text-xl text-slate-800">진행률</span>
          </div>
          <div className="bg-slate-900 rounded-full px-4 py-1.5 shadow-[0_3px_10px_rgba(15,23,42,0.18)] flex items-center justify-center">
            <span className="text-white text-xl leading-none pt-1">{discoveredCount}/{totalDiscoverableSymbols}</span>
          </div>
        </div>

        <div className="w-full bg-slate-100 border border-slate-200 rounded-full h-7 p-[2px] shadow-inner relative overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-sky-500 to-emerald-400 transition-all duration-500 relative"
            style={{ width: `${progress}%`, minWidth: discoveredCount > 0 ? '10%' : '0' }}
          >
            {discoveredCount === totalDiscoverableSymbols && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] leading-none text-white">
                완료
              </span>
            )}
          </div>
        </div>
      </section>
    </header>
  );
}
