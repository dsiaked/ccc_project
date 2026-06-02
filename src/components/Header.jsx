import React, { useState } from 'react';
import { BadgeCheck, ChevronDown, Gift, MapPinned, Megaphone, QrCode, Sparkles } from 'lucide-react';
import LanguageToggle from './LanguageToggle';

const copy = {
  ko: {
    notice: '공지',
    brand: '붕어방 작품 투어',
    guideTitle: '작품 투어 안내',
    guideSummary: '작품 찾기 -> QR 스캔 및 설명 확인 -> 부스 이벤트 참여',
    guideSteps: [
      '1. 지도 속 심볼을 따라 작품 위치를 찾아보세요.',
      '2. 작품 옆 QR을 스캔하고 작품 설명을 확인하세요.',
      '3. 세 가지 심볼을 모두 찾으면 부스 이벤트에 참여해 보세요.',
    ],
    findArtwork: '작품 찾기',
    scanQr: 'QR 스캔 및\n설명 확인',
    joinBooth: '부스 이벤트\n참여',
    progress: '진행률',
    completeMessage: '세 가지 심볼을 모두 확인했어요. 상품 부스에서 작품 설명을 다시 보고 이벤트에 참여해 주세요.',
    progressMessages: [
      '지도에서 첫 번째 심볼을 찾아 작품 투어를 시작해 보세요.',
      '좋아요. 한 가지 심볼을 찾았어요.',
      '거의 다 왔어요. 마지막 심볼을 찾아보세요.',
      '세 가지 심볼을 모두 확인했어요. 상품 부스에서 작품 설명을 다시 보고 이벤트에 참여해 주세요.',
      '투어를 완료했어요. 오늘의 질문 앞에서 잠시 생각을 남겨 주세요.',
    ],
    switchLabel: 'English version',
    switchText: 'EN',
  },
  en: {
    notice: 'Notice',
    brand: 'Bungeobang Artwork Tour',
    guideTitle: 'Tour Guide',
    guideSummary: 'Find artwork -> Scan QR -> Join the booth event',
    guideSteps: [
      '1. Follow the symbols on the map to find each artwork.',
      '2. Scan the QR code beside the artwork and read the description.',
      '3. Find all three symbols, then join the booth event.',
    ],
    findArtwork: 'Find Artwork',
    scanQr: 'Scan QR\nRead Info',
    joinBooth: 'Booth Event\nJoin',
    progress: 'Progress',
    completeMessage: 'You found all three symbols. Visit the booth to review the artworks and join the event.',
    progressMessages: [
      'Find the first symbol on the map to begin the artwork tour.',
      'Nice. You found one symbol.',
      'Almost there. Look for the final symbol.',
      'You found all three symbols. Visit the booth to review the artworks and join the event.',
      'Tour complete. Take a moment to leave your thought at the final question.',
    ],
    switchLabel: '한국어 버전',
    switchText: 'KR',
  },
};

export default function Header({ discoveredCount, announcement, language = 'ko', onToggleLanguage }) {
  const [isAnnouncementOpen, setIsAnnouncementOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const text = copy[language] || copy.ko;
  const totalDiscoverableSymbols = 4;
  const progress = (discoveredCount / totalDiscoverableSymbols) * 100;
  const isReadyForBooth = discoveredCount === 3;
  const progressMessage = text.progressMessages[Math.min(discoveredCount, totalDiscoverableSymbols)];

  return (
    <header className={['w-full px-6 pb-4 flex flex-col gap-3', announcement?.message ? 'pt-0' : 'pt-7'].join(' ')}>
      {announcement?.message && (
        <section className="sticky top-0 z-50 -mx-6 border-b border-amber-200 bg-amber-50/95 shadow-[0_4px_14px_rgba(245,158,11,0.12)] backdrop-blur">
          <button
            type="button"
            onClick={() => setIsAnnouncementOpen(prev => !prev)}
            className="flex min-h-11 w-full items-center gap-2.5 px-4 py-2 text-left"
            aria-expanded={isAnnouncementOpen}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-600">
              <Megaphone className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-[12px] font-bold text-amber-950">
                  {announcement.title || text.notice}
                </span>
                {!isAnnouncementOpen && (
                  <span className="truncate text-[12px] leading-4 text-amber-900">
                    {announcement.message}
                  </span>
                )}
              </div>
              {isAnnouncementOpen && (
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[12px] leading-5 text-amber-900">
                  {announcement.message}
                </p>
              )}
            </div>
            <ChevronDown
              className={[
                'h-4 w-4 shrink-0 text-amber-700 transition-transform',
                isAnnouncementOpen ? 'rotate-180' : '',
              ].join(' ')}
            />
          </button>
        </section>
      )}

      <section className="rounded-[28px] border border-white/80 bg-white/58 px-3 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="w-14" />
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1">
            <span className="text-[10px] uppercase tracking-[0.28em] text-indigo-600 font-bold">
              Exhibition Tour
            </span>
            <h1 className="text-[26px] font-black text-center text-slate-950 font-['Cafe24_Ssurround']">
              {text.brand}
            </h1>
            <div className="w-9 h-[3px] bg-indigo-500 rounded-full mt-0.5" />
          </div>
          <LanguageToggle language={language} onToggle={onToggleLanguage} />
        </div>

        <section className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/65 px-3.5 py-2.5">
          <button
            type="button"
            onClick={() => setIsGuideOpen(prev => !prev)}
            className="flex w-full items-center gap-2.5 text-left"
            aria-expanded={isGuideOpen}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-50 border border-sky-100">
              <MapPinned className="h-4 w-4 text-sky-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-bold leading-tight text-slate-950">{text.guideTitle}</h2>
              {!isGuideOpen && (
                <p className="mt-0.5 truncate text-[12px] leading-4 text-slate-600">{text.guideSummary}</p>
              )}
            </div>
            <ChevronDown
              className={[
                'h-4 w-4 shrink-0 text-slate-500 transition-transform',
                isGuideOpen ? 'rotate-180' : '',
              ].join(' ')}
            />
          </button>

          {isGuideOpen && (
            <>
              <div className="mt-3 border-t border-sky-100 pt-3">
                <div className="space-y-0.5 text-[13px] leading-5 text-slate-600">
                  {text.guideSteps.map(step => <p key={step}>{step}</p>)}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <GuideCard number="1" icon={<MapPinned className="mx-auto mb-1 h-4 w-4 text-sky-600" />} label={text.findArtwork} />
                <GuideCard number="2" icon={<QrCode className="mx-auto mb-1 h-4 w-4 text-indigo-600" />} label={text.scanQr} tone="indigo" />
                <GuideCard
                  number="3"
                  icon={(
                    <div className="mb-1 flex items-center justify-center gap-1 text-emerald-600">
                      <BadgeCheck className="h-4 w-4" />
                      <Gift className="h-4 w-4" />
                    </div>
                  )}
                  label={text.joinBooth}
                  tone="emerald"
                />
              </div>
            </>
          )}
        </section>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white/82 px-3.5 py-3 shadow-[0_6px_16px_rgba(15,23,42,0.06)]" aria-label={text.progress}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-indigo-600" />
            <span className="text-[14px] font-bold text-slate-800">{text.progress}</span>
          </div>
          <div className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-[13px] font-bold leading-none text-white shadow-[0_3px_10px_rgba(15,23,42,0.16)]">
            {discoveredCount}/{totalDiscoverableSymbols}
          </div>
        </div>

        {!isReadyForBooth && (
          <p className="mt-1.5 text-[12px] leading-4 text-slate-500">
            {progressMessage}
          </p>
        )}

        <div className="mt-2.5 h-3 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100 p-[2px] shadow-inner">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-sky-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${progress}%`, minWidth: discoveredCount > 0 ? '10%' : '0' }}
          />
        </div>

        {isReadyForBooth && (
          <div className="mt-2.5 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 shadow-[0_6px_16px_rgba(16,185,129,0.08)]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm">
                <Gift className="h-3.5 w-3.5" />
              </div>
              <p className="min-w-0 text-[13px] leading-relaxed text-emerald-800">
                {text.completeMessage}
              </p>
            </div>
          </div>
        )}
      </section>
    </header>
  );
}

function GuideCard({ number, icon, label, tone = 'sky' }) {
  const toneClasses = {
    sky: 'border-slate-100 bg-slate-50 text-sky-700',
    indigo: 'border-slate-100 bg-slate-50 text-indigo-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  };

  return (
    <div className={`min-h-[78px] rounded-2xl px-2 py-2.5 text-center ${toneClasses[tone]}`}>
      <span className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[13px] font-bold shadow-sm">
        {number}
      </span>
      {icon}
      <span className="block whitespace-pre-line text-[12px] leading-tight text-slate-800">{label}</span>
    </div>
  );
}
