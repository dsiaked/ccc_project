import React from 'react';

export default function ArtistEnglishBody({ copy, accentClass = 'text-indigo-600', panelClass = 'border-indigo-100 bg-indigo-50/70 text-indigo-950' }) {
  if (!copy) return null;

  return (
    <>
      <div className={`text-left font-sentiment text-[30px] leading-[1.18] tracking-[0.2px] font-bold mt-2 select-text ${accentClass}`}>
        {copy.title}
      </div>

      <div className="bg-current h-px w-[31px] my-5 flex-none opacity-35" />

      <div className={`rounded-[22px] border px-4 py-3 text-left text-[16px] leading-[1.7] font-semibold select-text ${panelClass}`}>
        {copy.intro.map(line => (
          <p key={line}>{line}</p>
        ))}
      </div>

      <div className="mt-6 text-left text-[14px] sm:text-[14.5px] leading-[1.9] text-gray-700 space-y-5 tracking-wide font-sans select-text">
        {copy.body.map(paragraph => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </>
  );
}
