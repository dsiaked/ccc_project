import React from 'react';
import { Sparkles } from 'lucide-react';

export default function Header({ discoveredCount }) {
  return (
    <div className="w-full pt-8 px-6 pb-6 flex flex-col gap-6">
      <h1 className="text-4xl text-slate-800 text-center tracking-tight">
        붕어방 심볼 작품 투어
      </h1>
      
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between h-11">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <span className="text-xl text-slate-800">진행도</span>
          </div>
          <div className="bg-purple-800 border-[1.5px] border-white rounded-full px-4 py-1.5 shadow-[0_3px_10px_rgba(107,33,168,0.3)] flex items-center justify-center">
            <span className="text-white text-xl leading-none pt-1">{discoveredCount}/4</span>
          </div>
        </div>
        
        <div className="w-full bg-gray-100 border-[1.5px] border-gray-200 rounded-full h-8 p-[1.5px] shadow-inner relative overflow-hidden">
          <div 
            className="h-full rounded-full bg-gradient-to-r from-purple-800 to-purple-500 transition-all duration-500 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3)] relative"
            style={{ width: `${(discoveredCount / 4) * 100}%`, minWidth: discoveredCount > 0 ? '10%' : '0' }}
          >
            {discoveredCount === 4 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] leading-none">✨</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
