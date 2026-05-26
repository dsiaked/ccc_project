import React from 'react';
import { Divide, Gift, Heart, Lock, MapPin, MessageSquareText, Search, Unlock } from 'lucide-react';

const CustomCrossIcon = ({ className = 'w-6 h-6', color = 'currentColor', strokeWidth = '2.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <line x1="12" y1="2.5" x2="12" y2="21.5" />
    <line x1="6.5" y1="8" x2="17.5" y2="8" />
  </svg>
);

const cards = [
  {
    id: 'heart',
    label: '하트',
    accent: 'pink',
    icon: <Heart className="h-8 w-8 fill-pink-500/20 text-pink-500" />,
  },
  {
    id: 'divide',
    label: '나누기',
    accent: 'orange',
    icon: <Divide className="h-8 w-8 text-orange-500" />,
  },
  {
    id: 'cross',
    label: '십자가',
    accent: 'lime',
    icon: <CustomCrossIcon className="h-8 w-8" color="#4d7c0f" strokeWidth="2.5" />,
  },
  {
    id: 'question',
    label: '물음표',
    accent: 'sky',
    icon: <span className="select-none font-['Cafe24_Ssurround'] text-4xl font-bold text-sky-500">?</span>,
  },
];

const accentClasses = {
  pink: {
    panel: 'bg-pink-50',
    border: 'border-pink-200',
    text: 'text-pink-700',
    dot: 'bg-pink-500',
  },
  orange: {
    panel: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
  },
  lime: {
    panel: 'bg-lime-50',
    border: 'border-lime-200',
    text: 'text-lime-700',
    dot: 'bg-lime-500',
  },
  sky: {
    panel: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-700',
    dot: 'bg-sky-500',
  },
};

export default function SymbolCards({ symbols, onCardClick, isQuestionUnlocked, featuredFeedbacks = [] }) {
  const isQuestionDiscovered = !!symbols.question;

  const checkDiscovered = id => {
    if (id === 'heart') {
      return symbols.heart_kymin || symbols.heart_yewon || symbols.heart_eunhye || symbols.heart_jihoon || symbols.heart_eunchae;
    }
    if (id === 'divide') {
      return symbols.divide_kyeomjun || symbols.divide_yewon;
    }
    if (id === 'cross') {
      return symbols.cross || symbols.cross_jihoon;
    }
    return symbols[id];
  };

  const getState = card => {
    if (card.id === 'question' && !isQuestionUnlocked) return 'locked';
    if (card.id === 'question') return symbols.question ? 'discovered' : 'ready';
    return checkDiscovered(card.id) ? 'discovered' : 'locked';
  };

  return (
    <div className="pb-8">
      <div className={`grid ${isQuestionDiscovered ? 'grid-cols-2 gap-3.5' : 'grid-cols-3 gap-2.5'}`}>
        {cards.map(card => {
          const state = getState(card);
          const accent = accentClasses[card.accent];
          const isLocked = state === 'locked';
          const isReady = state === 'ready';
          const isQuestionPending = card.id === 'question' && isLocked;
          const isQuestionReady = card.id === 'question' && isReady;
          const isQuestionDone = card.id === 'question' && state === 'discovered';
          const displayLabel = isQuestionDone ? '상품 부스' : card.label;

          if (isQuestionPending) {
            return (
              <button
                key={card.id}
                type="button"
                className="col-span-3 min-h-[118px] w-full cursor-pointer overflow-hidden rounded-2xl border-2 border-slate-200 bg-white/85 text-left shadow-sm transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                onClick={() => onCardClick(card.id)}
              >
                <div className="relative h-full min-h-[118px] px-5 py-4 flex items-center gap-4">
                  <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sky-500">
                    <Gift className="h-7 w-7" />
                    <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold text-sky-500 shadow-sm">
                      ?
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="mb-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold text-slate-500">
                      준비 중
                    </span>
                    <span className="block text-xl font-bold leading-tight text-slate-950">상품 부스</span>
                    <p className="mt-1 text-[13px] font-bold leading-snug text-slate-600">
                      세 가지 심볼을 모두 모으면 상품 부스 안내가 열려요.
                    </p>
                  </div>
                </div>
              </button>
            );
          }

          if (isQuestionReady) {
            return (
              <button
                key={card.id}
                type="button"
                className="col-span-3 min-h-[124px] w-full cursor-pointer overflow-hidden rounded-2xl border-2 border-sky-200 bg-gradient-to-br from-white via-sky-50 to-indigo-50 text-left shadow-[0_12px_26px_rgba(14,165,233,0.16)] transition-transform hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                onClick={() => onCardClick(card.id)}
              >
                <div className="relative h-full min-h-[124px] px-5 py-4 flex items-center gap-4">
                  <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-[0_10px_20px_rgba(14,165,233,0.24)]">
                    <Gift className="h-8 w-8" />
                    <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-sky-200 bg-white shadow-sm">
                      <MapPin className="h-3.5 w-3.5 text-sky-600" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-full border border-sky-200 bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-700">
                        위치 확인
                      </span>
                      <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
                    </div>
                    <span className="block text-xl font-bold leading-tight text-slate-950">상품 부스</span>
                    <p className="mt-1 text-[13px] font-bold leading-snug text-slate-700">
                      세 가지 심볼을 모두 모았어요. 상품 부스를 찾아가세요.
                    </p>
                  </div>
                </div>
              </button>
            );
          }

          return (
            <button
              key={card.id}
              type="button"
              className={[
                'relative flex min-h-[148px] w-full cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-white text-center transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
                isQuestionDone
                  ? 'border-sky-200 shadow-[0_8px_18px_rgba(14,165,233,0.12)] hover:scale-[1.02]'
                  : isLocked
                    ? 'border-dashed border-slate-200 shadow-sm'
                    : `${accent.border} shadow-[0_8px_18px_rgba(15,23,42,0.08)] hover:scale-[1.02]`,
              ].join(' ')}
              onClick={() => onCardClick(card.id)}
            >
              <div className={`flex h-[62px] w-full shrink-0 items-center justify-center ${isLocked ? 'bg-slate-50' : isQuestionDone ? 'bg-sky-50' : accent.panel}`}>
                {isLocked ? <Search className="h-7 w-7 text-slate-300" /> : isQuestionDone ? <Gift className="h-8 w-8 text-sky-600" /> : card.icon}
              </div>

              <div
                className={[
                  '-mt-4 mx-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 bg-white shadow-sm',
                  isLocked ? 'border-slate-200' : isQuestionDone ? 'border-sky-200' : accent.border,
                ].join(' ')}
              >
                {isLocked ? (
                  <Lock className="h-4 w-4 text-slate-400" />
                ) : isQuestionDone ? (
                  <MapPin className="h-4 w-4 text-sky-600" />
                ) : (
                  <Unlock className={`h-4 w-4 ${accent.text} ${isReady ? 'animate-bounce' : ''}`} />
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col items-center justify-end gap-1.5 px-1.5 pb-3 pt-1">
                <span className={`block w-full truncate text-[15px] leading-tight ${isLocked ? 'text-slate-400' : 'text-slate-900'}`}>
                  {displayLabel}
                </span>
                <div
                  className={[
                    'flex w-fit max-w-full items-center gap-1 rounded-full border px-1.5 py-0.5',
                    isLocked ? 'border-slate-200 bg-slate-50' : isQuestionDone ? 'border-sky-200 bg-sky-50' : `${accent.panel} ${accent.border}`,
                  ].join(' ')}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${isLocked ? 'bg-slate-400' : isQuestionDone ? 'bg-sky-500' : accent.dot} ${isReady ? 'animate-pulse' : ''}`} />
                  <span className={`mt-0.5 max-w-[68px] truncate whitespace-nowrap text-[10px] ${isLocked ? 'text-slate-500' : isQuestionDone ? 'text-sky-700' : accent.text}`}>
                    {isLocked ? '미발견' : isReady ? '위치 확인' : '발견 완료'}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <section className="mt-5 rounded-[22px] border-2 border-slate-200 bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
              <MessageSquareText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-[17px] leading-tight text-slate-950">여행자 소감</h3>
              <p className="text-[12px] leading-snug text-slate-500">여행자들이 남긴 소감을 함께 둘러보세요</p>
            </div>
          </div>
          {featuredFeedbacks.length > 0 && (
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] text-sky-700">
              {featuredFeedbacks.length}개
            </span>
          )}
        </div>

        {featuredFeedbacks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
            <p className="text-sm text-slate-500">아직 공개된 소감이 없습니다.</p>
          </div>
        ) : (
          <div className="grid max-h-[568px] gap-3 overflow-y-auto pr-1 scroll-container">
            {featuredFeedbacks.map(feedback => (
              <article key={feedback.id} className="min-h-[104px] rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-left">
                <p className="line-clamp-3 whitespace-pre-wrap break-words text-[14px] leading-6 text-slate-700">
                  {feedback.feedback}
                </p>
                <p className="mt-2 truncate text-[12px] text-slate-500">
                  {feedback.name || '익명'}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
