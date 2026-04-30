import React from 'react';
import { X, BookOpen, Star } from 'lucide-react';
import { symbolData } from '../data/symbolData';

export default function QrPopup({ id, onClose }) {
  const symbol = symbolData[id];

  if (!symbol) return null;

  const Icon = symbol.Icon;
  const data = symbol.qr;

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
            <Icon className={symbol.iconClass} />
          </div>

          <h2 className="text-3xl text-gray-800 mb-3">
            {data.title}
          </h2>

          <div className="bg-purple-100 border-[1.5px] border-purple-200 rounded-full px-4 py-1 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-600" />
            <span className="text-purple-700 text-sm mt-0.5 font-medium">
              발견완료!
            </span>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-white">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-5 h-5 text-purple-600" />
              <h3 className="text-xl text-gray-800">심볼 설명</h3>
            </div>

            <p className="text-gray-600 leading-relaxed pl-7">
              {data.desc}
            </p>
          </div>

          <div className="mb-2">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              <h3 className="text-xl text-gray-800">상세 정보</h3>
            </div>

            <div className="pl-7 flex flex-col gap-5">
              <div>
                <h4 className="text-gray-800 text-lg mb-1.5">
                  심볼의 의미
                </h4>
                <p className="text-gray-600 leading-relaxed text-sm">
                  {data.meaning}
                </p>
              </div>

              <div>
                <h4 className="text-gray-800 text-lg mb-1.5">
                  발견 장소
                </h4>
                <p className="text-gray-600 leading-relaxed text-sm">
                  {data.location}
                </p>
              </div>

              <div>
                <h4 className="text-gray-800 text-lg mb-1.5">
                  특별 메시지
                </h4>
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
            확인
          </button>
        </div>
      </div>
    </div>
  );
}