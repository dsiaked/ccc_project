import React from 'react';
import { Languages } from 'lucide-react';

export default function LanguageToggle({ language, onToggle, className = '', tone = 'light' }) {
  const nextLabel = language === 'en' ? 'KR' : 'EN';
  const ariaLabel = language === 'en' ? '한국어로 전환' : 'Switch to English';
  const toneClass = tone === 'dark'
    ? 'border-white/75 bg-slate-950/82 text-white shadow-[0_10px_28px_rgba(15,23,42,0.28)] backdrop-blur'
    : 'border-indigo-100 bg-white/90 text-indigo-700 shadow-sm';

  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition active:scale-95',
        toneClass,
        className,
      ].join(' ')}
      aria-label={ariaLabel}
    >
      <Languages className="h-3.5 w-3.5" />
      {nextLabel}
    </button>
  );
}
