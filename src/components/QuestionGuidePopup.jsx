import React from 'react';
import { X, MapPin } from 'lucide-react';

export default function QuestionGuidePopup({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-fade-in font-['Jua']">
      
      {/* 극도로 심플하고 세련된 미니멀 화이트 카드 */}
      <div className="relative w-full max-w-[310px] rounded-[28px] bg-white p-6 shadow-[0_20px_40px_rgba(0,0,0,0.1)] border border-gray-100 flex flex-col items-center">
        
        {/* 닫기 버튼 */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:scale-90 transition-all border border-gray-100"
        >
          <X className="w-4 h-4 stroke-[2.5]" />
        </button>

        {/* 심플한 지도 핀 아이콘 */}
        <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center mb-5 shadow-sm border border-purple-100/50">
          <MapPin className="w-8 h-8 text-purple-600 animate-bounce" />
        </div>

        {/* 미니멀 타이틀 */}
        <h3 className="text-gray-900 text-xl font-bold mb-3 font-['Cafe24_Ssurround']">
          특별 심볼 잠금해제!
        </h3>
        
        {/* 찾아가라는 명확한 문구 */}
        <p className="text-gray-800 text-[15px] font-bold text-center leading-relaxed mb-4">
          이제 특별 심볼의 위치로 찾아가세요! 📍
        </p>

        {/* 위치 힌트 박스 */}
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 w-full text-center mb-6">
          <span className="text-gray-500 text-xs block mb-1">위치 힌트</span>
          <p className="text-gray-700 text-sm font-bold leading-relaxed">
            "지도 한가운데, 두 갈래 도로가 만나는 신비로운 강변을 찾아보세요."
          </p>
        </div>

        {/* 확인 버튼 */}
        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-purple-800 hover:bg-purple-900 text-white font-['Cafe24_Ssurround'] font-bold text-base shadow-[0_4px_12px_rgba(107,33,168,0.2)] transition-all active:scale-[0.98]"
        >
          확인
        </button>

      </div>
    </div>
  );
}
