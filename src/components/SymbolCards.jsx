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
    icon: <Heart className="w-8 h-8 text-pink-500 fill-pink-500/20" />,
  },
  {
    id: 'divide',
    label: '나누기',
    accent: 'orange',
    icon: <Divide className="w-8 h-8 text-orange-500" />,
  },
  {
    id: 'cross',
    label: '십자가',
    accent: 'lime',
    icon: <CustomCrossIcon className="w-8 h-8" color="#4d7c0f" strokeWidth="2.5" />,
  },
  {
    id: 'question',
    label: '물음표',
    accent: 'sky',
    icon: <span className="text-4xl font-bold text-sky-500 select-none font-['Cafe24_Ssurround']">?</span>,
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
      return symbols.heart_kymin || symbols.heart_yewon || symbols.heart_eunhye || symbols.heart_jihoon;
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
        const statusLabel = isQuestionDone ? '방문 완료' : isLocked ? '미발견' : isReady ? '위치 확인' : '발견 완료';

        if (isQuestionPending) {
          return (
            <button
              key={card.id}
              type="button"
              className="col-span-3 w-full min-h-[118px] border-2 border-slate-200 rounded-2xl bg-white/85 overflow-hidden relative text-left cursor-pointer transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 shadow-sm"
              onClick={() => onCardClick(card.id)}
            >
              <div className="absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(135deg,rgba(148,163,184,0.08),rgba(14,165,233,0.08))]" />
              <div className="relative h-full min-h-[118px] px-5 py-4 flex items-center gap-4">
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-50 border border-slate-200 text-sky-500">
                  <Gift className="w-7 h-7" />
                  <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm text-sm font-bold text-sky-500">
                    ?
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <span className="mb-2 inline-flex rounded-full bg-slate-50 border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-500">
                    준비 중
                  </span>
                  <span className="block text-xl leading-tight text-slate-950 font-bold">
                    상품 부스
                  </span>
                  <p className="mt-1 text-[13px] leading-snug text-slate-600 font-bold">
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
              className="col-span-3 w-full min-h-[124px] border-2 border-sky-200 rounded-2xl bg-gradient-to-br from-white via-sky-50 to-indigo-50 overflow-hidden relative text-left cursor-pointer transition-transform active:scale-[0.99] hover:scale-[1.01] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 shadow-[0_12px_26px_rgba(14,165,233,0.16)]"
              onClick={() => onCardClick(card.id)}
            >
              <div className="absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(135deg,rgba(56,189,248,0.12),rgba(99,102,241,0.12))]" />
              <div className="absolute right-5 top-5 h-16 w-16 rounded-full border border-sky-200/80 bg-white/70" />
              <div className="relative h-full min-h-[124px] px-5 py-4 flex items-center gap-4">
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-[0_10px_20px_rgba(14,165,233,0.24)]">
                  <Gift className="w-8 h-8" />
                  <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white border border-sky-200 shadow-sm">
                    <MapPin className="w-3.5 h-3.5 text-sky-600" />
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full bg-sky-100 border border-sky-200 px-2.5 py-0.5 text-[11px] font-bold text-sky-700">
                      위치 확인
                    </span>
                    <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
                  </div>
                  <span className="block text-xl leading-tight text-slate-950 font-bold">
                    상품 부스
                  </span>
                  <p className="mt-1 text-[13px] leading-snug text-slate-700 font-bold">
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
              'w-full min-h-[148px] border-2 rounded-2xl bg-white overflow-hidden relative text-center cursor-pointer transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 flex flex-col',
              isQuestionDone
                ? 'border-sky-200 shadow-[0_8px_18px_rgba(14,165,233,0.12)] hover:scale-[1.02]'
                : isLocked
                  ? 'border-dashed border-slate-200 shadow-sm'
                  : `${accent.border} shadow-[0_8px_18px_rgba(15,23,42,0.08)] hover:scale-[1.02]`,
            ].join(' ')}
            onClick={() => onCardClick(card.id)}
          >
            <div className={`h-[62px] w-full flex shrink-0 items-center justify-center ${isLocked ? 'bg-slate-50' : isQuestionDone ? 'bg-sky-50' : accent.panel}`}>
              {isLocked ? (
                <Search className="w-7 h-7 text-slate-300" />
              ) : isQuestionDone ? (
                <Gift className="w-8 h-8 text-sky-600" />
              ) : (
                card.icon
              )}
            </div>

            <div
              className={[
                '-mt-4 mx-auto w-9 h-9 bg-white rounded-full border-2 flex shrink-0 items-center justify-center shadow-sm',
                isLocked ? 'border-slate-200' : isQuestionDone ? 'border-sky-200' : accent.border,
              ].join(' ')}
            >
              {isLocked ? (
                <Lock className="w-4 h-4 text-slate-400" />
              ) : isQuestionDone ? (
                <MapPin className="w-4 h-4 text-sky-600" />
              ) : (
                <Unlock className={`w-4 h-4 ${accent.text} ${isReady ? 'animate-bounce' : ''}`} />
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-end gap-1.5 px-1.5 pb-3 pt-1">
              <span className={`block w-full truncate text-[15px] leading-tight ${isLocked ? 'text-slate-400' : 'text-slate-900'}`}>
                {displayLabel}
              </span>
              <div
                className={[
                  'border rounded-full px-1.5 py-0.5 flex items-center gap-1 w-fit max-w-full',
                  isLocked ? 'bg-slate-50 border-slate-200' : isQuestionDone ? 'bg-sky-50 border-sky-200' : `${accent.panel} ${accent.border}`,
                ].join(' ')}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${isLocked ? 'bg-slate-400' : isQuestionDone ? 'bg-sky-500' : accent.dot} ${isReady ? 'animate-pulse' : ''}`} />
                <span className={`max-w-[68px] truncate text-[10px] mt-0.5 whitespace-nowrap ${isLocked ? 'text-slate-500' : accent.text}`}>
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
              <h3 className="text-[17px] leading-tight text-slate-950">참가자 소감</h3>
              <p className="text-[12px] leading-snug text-slate-500">관리자가 공개한 소감만 보여요</p>
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
          <div className="grid gap-3">
            {featuredFeedbacks.map(feedback => (
              <article key={feedback.id} className="rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-left">
                <p className="line-clamp-4 whitespace-pre-wrap break-words text-[14px] leading-6 text-slate-700">
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
