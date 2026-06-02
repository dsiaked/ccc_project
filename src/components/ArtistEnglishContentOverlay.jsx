import React from 'react';

const getSymbolNumber = symbol => ({
  Heart: '1',
  Division: '2',
  Cross: '3',
}[symbol] || '');

export function ArtistEnglishIntroOverlay({ copy, textColor = 'text-[#4a3b3b]' }) {
  if (!copy) return null;

  const symbolNumber = getSymbolNumber(copy.symbol);

  return (
    <div className={`pointer-events-none absolute inset-0 z-[35] ${textColor}`}>
      <span className="absolute left-[29px] top-[31px] bg-white pr-2 text-[15px] font-medium tracking-[1.92px] font-readable-sans">
        SYMBOL{symbolNumber} : {copy.symbol.toUpperCase()}
      </span>

      <div className="absolute right-[25px] top-[58px] bg-white pl-2 text-right text-[10px] tracking-[1.2px] font-readable-sans">
        <p>2026.05.26/06.02</p>
        <p className="mt-0.5">Boongo Room</p>
      </div>

      <div className="absolute left-[21px] top-[86px] min-h-[335px] w-[322px] rounded-2xl bg-white p-2 shadow-[0_10px_25px_rgba(255,255,255,0.45)]">
        <div className="text-[29px] leading-[1.22] tracking-[1.2px] font-sentiment">
          {copy.intro.map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
        </div>
      </div>

      <div className="absolute left-[21px] top-[460px] min-h-[94px] w-[250px] rounded-2xl bg-white px-2 py-1.5 shadow-[0_10px_25px_rgba(255,255,255,0.45)]">
        <p className="text-[15px] font-medium tracking-[1.92px] font-readable-sans">
          ARTIST. {copy.artist}
        </p>
        <p className="mt-3 text-[10px] tracking-[1.2px] font-readable-sans">Seoul National University</p>
        <p className="mt-0.5 text-[10px] tracking-[1.2px] font-readable-sans">of Science and Technology</p>
        <p className="mt-0.5 text-[10px] tracking-[1.2px] font-readable-sans">CCC Club</p>
      </div>
    </div>
  );
}

export function ArtistEnglishDetailOverlay({ copy, accentClass = 'text-slate-900' }) {
  if (!copy) return null;

  return (
    <div className="absolute inset-0 z-[35] flex flex-col overflow-y-auto rounded-[20px] bg-white p-7 popup-body-scroll">
      <p className={`text-[10px] font-bold uppercase tracking-[0.22em] ${accentClass}`}>
        {copy.symbol}
      </p>
      <h2 className={`mt-3 text-left font-sentiment text-[29px] font-bold leading-[1.16] tracking-[0.4px] ${accentClass}`}>
        {copy.title}
      </h2>
      <div className="my-5 h-px w-[31px] bg-current opacity-25" />
      <div className="space-y-5 text-left text-[14.5px] leading-[1.85] tracking-wide text-gray-700 font-readable-sans select-text">
        {copy.body.map((paragraph, index) => (
          <p
            key={paragraph}
            className={index === 0 || index === copy.body.length - 1 ? 'font-medium text-gray-800' : ''}
          >
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}
