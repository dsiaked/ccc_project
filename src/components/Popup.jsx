import React from 'react';
import { X, Heart, Cross, Divide, Sparkles, BookOpen, Star } from 'lucide-react';

const popupData = {
  heart: {
    title: '하트',
    icon: <Heart className="w-12 h-12 text-pink-500" />,
    desc: '사랑과 정열을 상징하는 하트 심볼입니다. 이 심볼은 조화와 균형을 의미합니다.',
    meaning: '하트는 사랑과 열정을 상징하며, 인간의 가장 순수한 감정을 나타냅니다. 이 심볼은 조화와 균형을 의미합니다.',
    location: '전시회 좌측 영역에 위치한 하트 심볼은 따뜻한 핑크색 네온으로 빛나며 관람객들을 맞이합니다',
    message: '당신의 따뜻한 마음이 세상을 더 아름답게 만듭니다. 사랑과 열정을 잃지 마세요.'
  },
  cross: {
    title: '십자가',
    icon: <Cross className="w-12 h-12 text-gray-700" />,
    desc: '믿음과 희망을 나타내는 십자가 심볼입니다. 이 심볼은 성장과 발전을 표현합니다.',
    meaning: '십자가는 믿음과 희망을 나타내며, 어려움 속에서도 포기하지 않는 의지를 상징합니다. 성장과 발전을 표현합니다.',
    location: '전시회 우측 상단에 자리한 십자가 심볼은 밝은 노란색으로 희망의 메시지를 전달합니다.',
    message: '어둠 속에서도 빛을 찾는 당신의 용기가 새로운 길을 열어줄 것입니다.'
  },
  divide: {
    title: '나누기',
    icon: <Divide className="w-12 h-12 text-blue-500" />,
    desc: '나눔과 배려를 의미하는 나누기 심볼입니다. 이 심볼은 창의성과 혁신을 담고 있습니다.',
    meaning: '나누기는 나눔과 배려의 정신을 담고 있으며, 함께 성장하는 공동체의 가치를 의미합니다. 창의성과 혁신을 담고 있습니다.',
    location: '전시회 좌측 하단에 배치된 나누기 심볼은 시원한 블루 색상으로 평온함을 선사합니다.',
    message: '나눔은 결코 줄어들지 않습니다. 오히려 더 큰 행복으로 돌아옵니다.'
  },
  question: {
    title: '특별 심볼',
    icon: <Sparkles className="w-12 h-12 text-yellow-500" />,
    desc: '호기심과 탐구를 상징하는 물음표 심볼입니다. 이 심볼은 완성과 성취를 뜻합니다.',
    meaning: '물음표는 끝없는 호기심과 탐구정신을 상징하며, 배움에 대한 열정을 나타냅니다. 이 심볼은 완성과 성취를 뜻합니다.',
    location: '전시회 우측 하단 특별 구역에 위치한 물음표 심볼은 신비로운 그린 빛으로 탐험가들을 기다립니다.',
    message: '질문하는 자만이 진정한 답을 찾을 수 있습니다. 계속해서 탐구하고 배워나가세요!'
  }
};

export default function Popup({ id, onClose }) {
  const data = popupData[id];
  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden flex flex-col max-h-[85vh] shadow-[0_20px_50px_rgba(0,0,0,0.3)] animate-in zoom-in-95 duration-300">
        
        <div className="relative p-6 border-b border-gray-100 bg-gray-50 flex flex-col items-center pt-10">
          <button 
            onClick={onClose}
            className="absolute top-5 right-5 w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>

          <div className="w-24 h-24 bg-white border-[3px] border-gray-100 rounded-[28px] flex items-center justify-center shadow-md mb-4 rotate-3">
            {data.icon}
          </div>
          
          <h2 className="text-3xl text-gray-800 mb-3">{data.title}</h2>
          
          <div className="bg-purple-100 border-[1.5px] border-purple-200 rounded-full px-4 py-1 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-600" />
            <span className="text-purple-700 text-sm mt-0.5 font-medium">발견완료!</span>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-white">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-5 h-5 text-purple-600" />
              <h3 className="text-xl text-gray-800">심볼 설명</h3>
            </div>
            <p className="text-gray-600 leading-relaxed pl-7">{data.desc}</p>
          </div>

          <div className="mb-2">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              <h3 className="text-xl text-gray-800">상세 정보</h3>
            </div>
            
            <div className="pl-7 flex flex-col gap-5">
              <div>
                <h4 className="text-gray-800 text-lg mb-1.5">심볼의 의미</h4>
                <p className="text-gray-600 leading-relaxed text-sm">{data.meaning}</p>
              </div>
              
              <div>
                <h4 className="text-gray-800 text-lg mb-1.5">발견 장소</h4>
                <p className="text-gray-600 leading-relaxed text-sm">{data.location}</p>
              </div>
              
              <div>
                <h4 className="text-gray-800 text-lg mb-1.5">특별 메시지</h4>
                <p className="text-purple-700 leading-relaxed text-sm font-medium bg-purple-50 p-3 rounded-xl border border-purple-100">
                  {data.message}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 bg-gray-50">
          <button 
            onClick={onClose}
            className="w-full bg-gray-800 text-white rounded-full py-4 text-xl shadow-md hover:bg-gray-700 transition-colors active:scale-[0.98]"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
