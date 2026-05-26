import React from 'react';
import { BadgeCheck, BookOpenText, Gift, MapPinned, Megaphone, QrCode, Sparkles } from 'lucide-react';

export default function Header({ discoveredCount, announcement }) {
  const totalDiscoverableSymbols = 4;
  const progress = (discoveredCount / totalDiscoverableSymbols) * 100;
  const isReadyForBooth = discoveredCount === 3;
  const progressMessages = [
    '지도에서 첫 번째 심볼을 찾아 작품 투어를 시작해 보세요.',
    '좋아요. 두 가지 심볼이 더 남았어요.',
    '거의 다 왔어요. 마지막 심볼을 찾아보세요.',
    '세 가지 심볼을 모두 확인했어요. 상품 부스에서 작품 설명도 다시 볼 수 있어요.',
    '투어를 완료했어요. 상품 부스에서 작품 설명을 둘러보고 소감을 남겨 주세요.',
  ];
  const progressMessage = progressMessages[Math.min(discoveredCount, totalDiscoverableSymbols)];

  return (
    <header className="w-full pt-8 px-6 pb-5 flex flex-col gap-5">
      <div className="flex flex-col items-center justify-center gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.28em] text-indigo-600 font-bold">
          Exhibition Tour
        </span>
        <h1 className="text-[28px] font-black text-center text-slate-950 font-['Cafe24_Ssurround']">
          붕어방 작품 투어
        </h1>
        <div className="w-10 h-[3px] bg-indigo-500 rounded-full mt-1" />
      </div>

      {announcement?.message && (
        <section className="rounded-[22px] border border-amber-200 bg-amber-50/95 px-4 py-3.5 shadow-[0_10px_24px_rgba(245,158,11,0.12)]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-white text-amber-600">
              <Megaphone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg leading-tight text-amber-950 mb-1.5">
                {announcement.title || '공지'}
              </h2>
              <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-amber-900">
                {announcement.message}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-[22px] border border-sky-100 bg-white/82 px-4 py-3.5 shadow-[0_10px_24px_rgba(14,165,233,0.08)]">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 border border-sky-100">
            <MapPinned className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <h2 className="text-lg leading-tight text-slate-950 mb-1.5">작품 투어 안내</h2>
            <div className="space-y-1 text-[13px] leading-5 text-slate-600">
              <p>1. 지도 속 하트, 나누기, 십자가 심볼을 따라 작품을 찾아보세요.</p>
              <p>2. 각 작품의 QR을 스캔해 설명을 읽고 기록을 모아보세요.</p>
              <p>3. 세 가지 심볼을 모두 확인한 뒤 상품 부스에서 작품 설명을 보고 이벤트에 참여해 보세요.</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="min-h-[86px] rounded-2xl border border-slate-100 bg-slate-50 px-2.5 py-3 text-center">
            <span className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[13px] font-bold text-sky-700 shadow-sm">
              1
            </span>
            <QrCode className="mx-auto mb-1 h-4 w-4 text-sky-600" />
            <span className="block text-[12px] leading-tight text-slate-800">QR 스캔</span>
          </div>
          <div className="min-h-[86px] rounded-2xl border border-slate-100 bg-slate-50 px-2.5 py-3 text-center">
            <span className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[13px] font-bold text-indigo-700 shadow-sm">
              2
            </span>
            <BookOpenText className="mx-auto mb-1 h-4 w-4 text-indigo-600" />
            <span className="block text-[12px] leading-tight text-slate-800">작품 설명</span>
          </div>
          <div className="min-h-[86px] rounded-2xl border border-emerald-100 bg-emerald-50 px-2.5 py-3 text-center">
            <span className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[13px] font-bold text-emerald-700 shadow-sm">
              3
            </span>
            <div className="mb-1 flex items-center justify-center gap-1 text-emerald-600">
              <BadgeCheck className="h-4 w-4" />
              <Gift className="h-4 w-4" />
            </div>
            <span className="block text-[12px] leading-tight text-slate-800">심볼 완료 후 참여</span>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3.5 py-2.5">
          <p className="text-[12px] leading-relaxed text-amber-800">
            웹이 정상적으로 작동하지 않을 경우, 가까운 운영 부스에 방문해 주세요.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-label="탐색 진행률">
        <div className="flex items-center justify-between min-h-11">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <span className="text-xl text-slate-800">진행률</span>
          </div>
          <div className="bg-slate-900 rounded-full px-4 py-1.5 shadow-[0_3px_10px_rgba(15,23,42,0.18)] flex items-center justify-center">
            <span className="text-white text-xl leading-none pt-1">{discoveredCount}/{totalDiscoverableSymbols}</span>
          </div>
        </div>

        <div className="w-full bg-slate-100 border border-slate-200 rounded-full h-7 p-[2px] shadow-inner relative overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-sky-500 to-emerald-400 transition-all duration-500 relative"
            style={{ width: `${progress}%`, minWidth: discoveredCount > 0 ? '10%' : '0' }}
          >
            {discoveredCount === totalDiscoverableSymbols && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] leading-none text-white">
                완료
              </span>
            )}
          </div>
        </div>

        {!isReadyForBooth && (
          <p className="rounded-2xl border border-slate-100 bg-white/75 px-4 py-3 text-[13px] leading-relaxed text-slate-700 shadow-sm">
            {progressMessage}
          </p>
        )}

        {isReadyForBooth && (
          <div className="mt-1 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 shadow-[0_6px_16px_rgba(16,185,129,0.08)]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm">
                <Gift className="h-4 w-4" />
              </div>
              <p className="min-w-0 text-[13px] leading-relaxed text-emerald-800">
                세 가지 심볼을 모두 확인했어요. 상품 부스에서 작품 설명을 다시 보고 이벤트에 참여해 주세요.
              </p>
            </div>
          </div>
        )}
      </section>
    </header>
  );
}
