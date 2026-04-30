import React from 'react';
import { X, Lock, MapPin, Heart, Cross, Divide, Sparkles } from 'lucide-react';

const mapData = {
  heart: {
    title: '하트',
    icon: <Heart className="w-10 h-10 text-pink-400" />,
    hint: '따뜻한 색이 빛나는 곳을 찾아보세요',
  },
  cross: {
    title: '십자가',
    icon: <Cross className="w-10 h-10 text-gray-500" />,
    hint: '높은 곳, 빛이 드는 방향을 주목하세요',
  },
  divide: {
    title: '나누기',
    icon: <Divide className="w-10 h-10 text-blue-400" />,
    hint: '차분하고 시원한 분위기의 공간입니다',
  },
  question: {
    title: '특별 심볼',
    icon: <Sparkles className="w-10 h-10 text-yellow-400" />,
    hint: '가장 특별한 곳에 숨겨져 있습니다',
  },
};

export default function MapPopup({ id, onClose }) {
  const data = mapData[id];
  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-[28px] p-6 shadow-xl relative">

        {/* 닫기 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>

        {/* 아이콘 */}
        <div className="flex flex-col items-center mt-4 mb-6">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-gray-400" />
          </div>

          <h2 className="text-2xl text-gray-700 mb-2">
            {data.title}
          </h2>

          <p className="text-gray-400 text-sm">
            아직 발견하지 못했어요
          </p>
        </div>

        {/* 힌트 */}
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-purple-500" />
            <span className="text-sm text-gray-600">힌트</span>
          </div>

          <p className="text-gray-700 text-sm">
            {data.hint}
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-gray-800 text-white rounded-full py-3"
        >
          닫기
        </button>
      </div>
    </div>
  );
}