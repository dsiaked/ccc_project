import React from 'react';
import { X, Lock, MapPin, CheckCircle, Sparkles } from 'lucide-react';
import { symbolData } from '../data/symbolData';
import { symbolIcons } from '../data/symbolIcons';

const popupCopy = {
  ko: {
    hint: '힌트',
    message: '발견 메시지',
    close: '닫기',
  },
  en: {
    hint: 'Hint',
    message: 'Discovery Message',
    close: 'Close',
  },
};

export default function MapPopup({ id, discovered, onClose, language = 'ko' }) {
  const symbol = symbolData[id];

  if (!symbol) return null;

  const Icon = symbolIcons[symbol.iconKey] || Sparkles;
  const localizedSymbol = language === 'en' ? symbol.en || symbol : symbol;
  const mapStateData = discovered
    ? localizedSymbol.map.discovered
    : localizedSymbol.map.undiscovered;
  const text = popupCopy[language] || popupCopy.ko;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
      <div className="bg-white w-full max-w-sm rounded-[28px] p-6 shadow-xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>

        <div className="flex flex-col items-center mt-4 mb-6">
          <div
            className={`
              w-20 h-20 rounded-full flex items-center justify-center mb-4 relative
              ${
                discovered
                  ? 'bg-purple-50 border-[3px] border-purple-400 shadow-[0_0_18px_rgba(147,51,234,0.35)]'
                  : 'bg-gray-100 border border-gray-200'
              }
            `}
          >
            <Icon
              className={
                discovered
                  ? symbol.iconClass
                  : 'w-12 h-12 text-gray-400'
              }
            />

            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-full border border-gray-200 flex items-center justify-center shadow-sm">
              {discovered ? (
                <CheckCircle className="w-5 h-5 text-purple-600" />
              ) : (
                <Lock className="w-4 h-4 text-gray-400" />
              )}
            </div>
          </div>

          <h2 className="text-2xl text-gray-700 mb-2">
            {mapStateData.title}
          </h2>

          <p
            className={`
              text-sm text-center leading-relaxed
              ${discovered ? 'text-purple-600' : 'text-gray-400'}
            `}
          >
            {mapStateData.desc}
          </p>
        </div>

        {!discovered && (
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-purple-500" />
              <span className="text-sm text-gray-600">{text.hint}</span>
            </div>

            <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">
              {mapStateData.hint}
            </p>
          </div>
        )}

        {discovered && (
          <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-sm text-purple-700">{text.message}</span>
            </div>

            <p className="text-purple-700 text-sm leading-relaxed font-medium">
              {mapStateData.message}
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full bg-gray-800 text-white rounded-full py-3"
        >
          {text.close}
        </button>
      </div>
    </div>
  );
}
