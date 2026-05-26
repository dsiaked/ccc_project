import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, MessageSquareText, Send, Sparkles } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export default function ParticipatePage({ onBack }) {
  const [name, setName] = useState(() => localStorage.getItem('tour_feedback_name') || '');
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const isSubmitting = status === 'submitting';
  const canSubmit = feedback.trim().length > 0 && !isSubmitting;

  const handleSubmit = async event => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedFeedback = feedback.trim();

    if (!trimmedFeedback) {
      setErrorMessage('작품 투어 소감을 한 줄 이상 작성해 주세요.');
      return;
    }

    setStatus('submitting');
    setErrorMessage('');

    try {
      await addDoc(collection(db, 'tour_feedbacks'), {
        name: trimmedName || '익명',
        feedback: trimmedFeedback,
        createdAt: serverTimestamp(),
        source: 'question_qr',
      });
      localStorage.setItem('tour_feedback_name', trimmedName);
      setFeedback('');
      setStatus('submitted');
    } catch (error) {
      console.error('작품 투어 소감 저장 중 에러 발생:', error);
      setStatus('idle');
      setErrorMessage('저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
    }
  };

  return (
    <main className="w-full h-full bg-gradient-to-b from-sky-50 via-white to-emerald-50 overflow-y-auto scroll-container font-['Jua']">
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
          <span className="text-xs uppercase tracking-[0.24em] text-sky-600 font-bold">
            Tour Feedback
          </span>
        </header>

        <section className="mb-7">
          <div className="w-16 h-16 rounded-[22px] bg-sky-100 border-2 border-white flex items-center justify-center mb-5 shadow-sm">
            <MessageSquareText className="w-8 h-8 text-sky-600" />
          </div>
          <h1 className="text-[31px] leading-tight text-slate-950 font-black mb-3">
            작품 투어 소감을
            <br />
            남겨주세요
          </h1>
          <p className="text-slate-600 text-[16px] leading-7">
            붕어방 작품 투어를 둘러본 느낌을 짧게 적어 주세요. 좋았던 작품, 기억에 남은 순간,
            다음 사람에게 전하고 싶은 말 모두 괜찮아요.
          </p>
        </section>

        {status !== 'submitted' && (
          <section className="mb-5 rounded-[24px] border border-sky-100 bg-white/80 p-4 shadow-[0_10px_24px_rgba(14,165,233,0.08)]">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 border border-sky-100">
                <Sparkles className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <h2 className="text-lg text-slate-950 mb-1">작품 투어 안내</h2>
                <p className="text-sm leading-6 text-slate-600">
                  지도 속 심볼을 따라 작품을 둘러보고, 마지막 부스에서 투어를 마무리하는 참여형 전시입니다.
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-slate-50 border border-slate-100 px-2 py-2">
                <span className="block text-[11px] text-slate-500 mb-0.5">1단계</span>
                <span className="text-sm text-slate-900">심볼 찾기</span>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-100 px-2 py-2">
                <span className="block text-[11px] text-slate-500 mb-0.5">2단계</span>
                <span className="text-sm text-slate-900">작품 보기</span>
              </div>
              <div className="rounded-2xl bg-sky-50 border border-sky-100 px-2 py-2">
                <span className="block text-[11px] text-sky-600 mb-0.5">마무리</span>
                <span className="text-sm text-sky-900">소감 남기기</span>
              </div>
            </div>
          </section>
        )}

        {status === 'submitted' ? (
          <section className="mt-auto rounded-[26px] border border-emerald-100 bg-white p-6 shadow-[0_16px_32px_rgba(15,23,42,0.08)]">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-5">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-2xl text-slate-950 mb-2">소감이 제출됐어요</h2>
            <p className="text-slate-600 text-sm leading-6 mb-5">
              함께 남겨 준 마음까지 작품 투어의 일부로 잘 간직할게요.
            </p>
            <button
              type="button"
              onClick={onBack}
              className="w-full h-14 rounded-full bg-slate-950 text-white text-base shadow-[0_10px_24px_rgba(15,23,42,0.22)] active:scale-[0.98] transition"
            >
              홈으로 돌아가기
            </button>
          </section>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-auto border border-sky-100 rounded-[26px] p-5 bg-white/90 shadow-[0_16px_32px_rgba(14,165,233,0.12)]"
          >
            <label className="block text-sm text-slate-700 mb-2" htmlFor="feedback-name">
              이름 또는 닉네임
            </label>
            <input
              id="feedback-name"
              type="text"
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="익명으로 남겨도 괜찮아요"
              className="w-full h-12 rounded-2xl border border-sky-100 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300 mb-4"
            />

            <label className="block text-sm text-slate-700 mb-2" htmlFor="tour-feedback">
              작품 투어 소감
            </label>
            <textarea
              id="tour-feedback"
              value={feedback}
              onChange={event => setFeedback(event.target.value)}
              placeholder="기억에 남은 작품이나 투어 소감을 적어 주세요"
              rows={6}
              maxLength={300}
              className="w-full rounded-2xl border border-sky-100 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none leading-6"
            />
            <div className="mt-2 mb-5 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">최대 300자</span>
              <span className="text-xs text-slate-500">{feedback.length}/300</span>
            </div>

            {errorMessage && (
              <p className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full h-14 rounded-full bg-sky-600 disabled:bg-slate-300 disabled:shadow-none text-white text-lg shadow-[0_10px_24px_rgba(14,165,233,0.28)] flex items-center justify-center gap-2 active:scale-[0.98] transition"
            >
              {isSubmitting ? (
                <>
                  <Sparkles className="w-5 h-5 animate-pulse" />
                  제출 중
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  소감 제출하기
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
