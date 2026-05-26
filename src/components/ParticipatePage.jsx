import React from 'react';
import { ArrowLeft, CheckCircle2, Gift, HeartHandshake, Send } from 'lucide-react';

export default function ParticipatePage({ onBack }) {
  return (
    <main className="w-full h-full bg-white overflow-y-auto scroll-container font-['Jua']">
      <div className="min-h-full px-6 py-7 flex flex-col">
        <header className="flex items-center justify-between mb-7">
          <button
            type="button"
            onClick={onBack}
            aria-label="돌아가기"
            className="w-11 h-11 rounded-full border border-slate-200 bg-white shadow-sm flex items-center justify-center text-slate-700 active:scale-95 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-xs uppercase tracking-[0.24em] text-indigo-600 font-bold">
            Join
          </span>
        </header>

        <section className="mb-7">
          <div className="w-16 h-16 rounded-[22px] bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center mb-5">
            <Gift className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-[31px] leading-tight text-slate-950 font-black mb-3">
            참여가 완료되기 전,
            <br />
            아래 내용을 확인해 주세요
          </h1>
          <p className="text-slate-600 text-[16px] leading-7">
            모든 상징을 발견한 분들을 위한 마지막 참여 페이지입니다. 이름과 연락처를 남기면
            운영팀이 확인 후 안내를 이어갈 수 있어요.
          </p>
        </section>

        <section className="grid gap-3 mb-7">
          <div className="border border-slate-200 rounded-[18px] p-4 flex gap-3 bg-slate-50">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg text-slate-900 mb-1">발견 기록 확인</h2>
              <p className="text-sm leading-6 text-slate-600">
                하트, 나누기, 십자가, 물음표까지 4개의 상징을 모두 찾은 상태에서 참여할 수 있습니다.
              </p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-[18px] p-4 flex gap-3 bg-slate-50">
            <HeartHandshake className="w-6 h-6 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg text-slate-900 mb-1">참여 정보 제출</h2>
              <p className="text-sm leading-6 text-slate-600">
                아래 버튼을 눌러 참여 정보를 작성해 주세요. 제출 후에는 현장 안내에 따라 진행하면 됩니다.
              </p>
            </div>
          </div>
        </section>

        <form className="mt-auto border border-indigo-100 rounded-[24px] p-5 bg-indigo-50/70">
          <label className="block text-sm text-slate-700 mb-2" htmlFor="participant-name">
            이름
          </label>
          <input
            id="participant-name"
            type="text"
            placeholder="이름을 입력하세요"
            className="w-full h-12 rounded-2xl border border-indigo-100 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-4"
          />

          <label className="block text-sm text-slate-700 mb-2" htmlFor="participant-contact">
            연락처
          </label>
          <input
            id="participant-contact"
            type="tel"
            placeholder="연락처를 입력하세요"
            className="w-full h-12 rounded-2xl border border-indigo-100 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-5"
          />

          <button
            type="button"
            className="w-full h-14 rounded-full bg-indigo-700 text-white text-lg shadow-[0_10px_24px_rgba(67,56,202,0.28)] flex items-center justify-center gap-2 active:scale-[0.98] transition"
          >
            <Send className="w-5 h-5" />
            참여 신청하기
          </button>
        </form>
      </div>
    </main>
  );
}
