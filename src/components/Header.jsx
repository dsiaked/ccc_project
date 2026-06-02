import React, { useState } from 'react';
import { BadgeCheck, ChevronDown, Gift, MapPinned, Megaphone, QrCode, Sparkles } from 'lucide-react';

export default function Header({ discoveredCount, announcement }) {
  const [isAnnouncementOpen, setIsAnnouncementOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const totalDiscoverableSymbols = 4;
  const progress = (discoveredCount / totalDiscoverableSymbols) * 100;
  const isReadyForBooth = discoveredCount === 3;
  const progressMessages = [
    '지도에서 첫 번째 심볼을 찾아 작품 투어를 시작해 보세요.',
    '좋아요. 두 가지 심볼이 더 남아 있어요.',
    '거의 다 왔어요. 마지막 심볼을 찾아보세요.',
    '세 가지 심볼을 모두 확인했어요. 상품 부스에서 작품 설명을 다시 보고 이벤트에 참여해 주세요.',
    '투어를 완료했어요. 오늘의 질문 앞에서 잠시 생각을 나눠 주세요.',
  ];
  const progressMessage = progressMessages[Math.min(discoveredCount, totalDiscoverableSymbols)];

  return (
    <header className="w-full pt-7 px-6 pb-4 flex flex-col gap-3">
      {announcement?.message && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/95 px-3.5 py-2.5 shadow-[0_6px_14px_rgba(245,158,11,0.09)]">
          <button
            type="button"
            onClick={() => setIsAnnouncementOpen(prev => !prev)}
            className="flex w-full items-center gap-2.5 text-left"
            aria-expanded={isAnnouncementOpen}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-600">
              <Megaphone className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] font-bold leading-tight text-amber-950">
                {announcement.title || '공지'}
              </h2>
                {!isAnnouncementOpen && (
                <p className="mt-0.5 truncate text-[12px] leading-4 text-amber-900">
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
          {isAnnouncementOpen && (
            <p className="mt-2.5 whitespace-pre-wrap break-words border-t border-amber-200/70 pt-2.5 text-[13px] leading-5 text-amber-900">
              {announcement.message}
            </p>
          )}
        </section>
      )}

      <section className="rounded-[28px] border border-white/80 bg-white/58 px-3 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex flex-col items-center justify-center gap-1">
          <span className="text-[10px] uppercase tracking-[0.28em] text-indigo-600 font-bold">
            Exhibition Tour
          </span>
          <h1 className="text-[26px] font-black text-center text-slate-950 font-['Cafe24_Ssurround']">
            붕어방 작품 투어
          </h1>
          <div className="w-9 h-[3px] bg-indigo-500 rounded-full mt-0.5" />
        </div>

      <section className="mt-4 rounded-2xl border border-slate-100 bg-white/72 px-3.5 py-3" aria-label="탐색 진행률">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-indigo-600" />
            <span className="text-[14px] font-bold text-slate-800">진행률</span>
            {!isReadyForBooth && (
              <span className="truncate text-[12px] text-slate-500">{progressMessage}</span>
            )}
          </div>
          <div className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-[13px] font-bold leading-none text-white shadow-[0_3px_10px_rgba(15,23,42,0.16)]">
            {discoveredCount}/{totalDiscoverableSymbols}
          </div>
        </div>

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
                세 가지 심볼을 모두 확인했어요. 상품 부스에서 작품 설명을 다시 보고 이벤트에 참여해 주세요.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/65 px-3.5 py-2.5">
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
            <h2 className="text-[15px] font-bold leading-tight text-slate-950">작품 투어 안내</h2>
            {!isGuideOpen && (
              <p className="mt-0.5 truncate text-[12px] leading-4 text-slate-600">작품 찾기 → QR 스캔 및 설명 확인 → 부스 이벤트 참여</p>
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
                <p>1. 지도 속 심볼을 따라 작품 위치를 찾아보세요.</p>
                <p>2. 작품 옆 QR을 스캔하고 작품 설명을 확인하세요.</p>
                <p>3. 세 가지 심볼을 모두 찾으면 부스 이벤트에 참여해 보세요.</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="min-h-[78px] rounded-2xl border border-slate-100 bg-slate-50 px-2 py-2.5 text-center">
                <span className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[13px] font-bold text-sky-700 shadow-sm">
                  1
                </span>
                <MapPinned className="mx-auto mb-1 h-4 w-4 text-sky-600" />
                <span className="block text-[12px] leading-tight text-slate-800">작품 찾기</span>
              </div>
              <div className="min-h-[78px] rounded-2xl border border-slate-100 bg-slate-50 px-2 py-2.5 text-center">
                <span className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[13px] font-bold text-indigo-700 shadow-sm">
                  2
                </span>
                <QrCode className="mx-auto mb-1 h-4 w-4 text-indigo-600" />
                <span className="block text-[12px] leading-tight text-slate-800">QR 스캔 및<br />설명 확인</span>
              </div>
              <div className="min-h-[78px] rounded-2xl border border-emerald-100 bg-emerald-50 px-2 py-2.5 text-center">
                <span className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[13px] font-bold text-emerald-700 shadow-sm">
                  3
                </span>
                <div className="mb-1 flex items-center justify-center gap-1 text-emerald-600">
                  <BadgeCheck className="h-4 w-4" />
                  <Gift className="h-4 w-4" />
                </div>
                <span className="block text-[12px] leading-tight text-slate-800">부스 이벤트<br />참여</span>
              </div>
            </div>
          </>
        )}

      </section>
      </section>
    </header>
  );
}
