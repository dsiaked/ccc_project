import React from 'react';
import { Check, X } from 'lucide-react';
import { artistPopupEnglish } from '../data/artistPopupEnglish';
import LanguageToggle from './LanguageToggle';

export default function ArtistInlineEnglishLayer({ artistId, onClose, onToggleLanguage }) {
  const copy = artistPopupEnglish[artistId];

  if (!copy) return null;

  return (
    <div className="absolute inset-0 z-[70] flex flex-col bg-gradient-to-b from-white via-slate-50 to-indigo-50 text-slate-800">
      <div className="flex items-center justify-between px-6 pb-4 pt-6">
        <span className="text-[10px] tracking-[1.2px] font-bold text-indigo-600">
          SYMBOL : {copy.symbol.toUpperCase()}
        </span>
        <LanguageToggle language="en" onToggle={onToggleLanguage} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 popup-body-scroll">
        <div className="rounded-[24px] border border-indigo-100 bg-white/92 p-6 shadow-[0_8px_32px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-500">
            ARTIST. {copy.artist}
          </p>
          <h1 className="mt-3 text-left text-[30px] leading-[1.15] text-slate-950 tracking-[0.2px] font-bold select-text">
            {copy.title}
          </h1>

          <div className="bg-indigo-300 h-px w-[31px] my-5 flex-none" />

          <div className="rounded-[22px] border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-left text-[16px] leading-[1.7] font-semibold text-indigo-950 select-text">
            {copy.intro.map(line => (
              <p key={line}>{line}</p>
            ))}
          </div>

          <div className="mt-6 text-left text-[14px] sm:text-[14.5px] leading-[1.9] text-slate-700 space-y-5 tracking-wide font-sans select-text">
            {copy.body.map(paragraph => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <LanguageToggle
            language="en"
            onToggle={onToggleLanguage}
            className="h-[52px] w-[112px] justify-center rounded-[26px]"
          />

          <button
            type="button"
            className="flex-1 min-w-[176px] h-[52px] bg-gradient-to-r from-indigo-600 to-sky-500 text-white rounded-[26px] flex items-center justify-center gap-2 shadow-[0_8px_18px_rgba(79,70,229,0.26)] font-bold"
          >
            <span className="text-[13px] tracking-[0.2px]">English Version</span>
            <Check className="w-[18px] h-[18px]" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full h-[46px] bg-white border border-gray-200 text-gray-700 rounded-[23px] flex items-center justify-center hover:bg-gray-50 transition-all duration-200 active:scale-[0.98] cursor-pointer shadow-sm font-bold"
          >
            <span className="text-[13px] tracking-[0.4px]">Close</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-20 w-8 h-8 bg-gray-100/80 hover:bg-gray-200/80 text-gray-500 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors border border-gray-200"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
