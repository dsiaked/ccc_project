import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, MessageSquareText, Send, Sparkles } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db, signInAnonymously } from '../firebase';

const FEEDBACK_AUTH_TIMEOUT_MS = 6000;
const FEEDBACK_SUBMIT_TIMEOUT_MS = 8000;

const withTimeout = (promise, timeoutMs, label) => (
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label} timed out`));
      }, timeoutMs);
    }),
  ])
);

const ensureFeedbackAuth = async () => {
  if (auth.currentUser) return auth.currentUser;
  const userCredential = await signInAnonymously(auth);
  return userCredential.user;
};

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
      await withTimeout(
        ensureFeedbackAuth(),
        FEEDBACK_AUTH_TIMEOUT_MS,
        'Feedback auth',
      );
      await withTimeout(
        addDoc(collection(db, 'tour_feedbacks'), {
          name: trimmedName || '익명',
          feedback: trimmedFeedback,
          isPublished: false,
          createdAt: serverTimestamp(),
          source: 'question_qr',
        }),
        FEEDBACK_SUBMIT_TIMEOUT_MS,
        'Feedback submit',
      );
      localStorage.setItem('tour_feedback_name', trimmedName);
      setFeedback('');
      setStatus('submitted');
    } catch (error) {
      console.error('작품 투어 소감 저장 중 에러 발생:', error);
      setStatus('idle');
      const isTimeoutError = error?.message?.includes('timed out');
      const isPermissionError = error?.code === 'permission-denied';
      setErrorMessage(
        isTimeoutError
          ? '네트워크 연결이 불안정해 제출 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.'
          : isPermissionError
            ? '제출 권한 확인에 실패했어요. 새로고침 후 다시 시도해 주세요.'
            : '저장에 실패했어요. 잠시 후 다시 시도해 주세요.',
      );
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

        {status !== 'submitted' && (
          <section className="mb-7">
            <div className="w-16 h-16 rounded-[22px] bg-sky-100 border-2 border-white flex items-center justify-center mb-5 shadow-sm">
              <MessageSquareText className="w-8 h-8 text-sky-600" />
            </div>
            <h1 className="text-[31px] leading-tight text-slate-950 font-black mb-3">
              여행의 마지막
              <br />
              질문
            </h1>
            <p className="text-slate-600 text-[16px] leading-7">
              오늘 만난 작품 중 마음에 오래 남은 장면을 적어 주세요. 짧은 한 줄이어도,
              다음 여행자에게는 또 하나의 질문이 될 수 있어요.
            </p>
          </section>
        )}

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
          <section className="mt-auto overflow-hidden rounded-[30px] border border-emerald-100 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.10)]">
            <div className="bg-gradient-to-b from-emerald-50 via-white to-white px-6 pb-5 pt-7 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[24px] border border-emerald-100 bg-white text-emerald-500 shadow-[0_12px_26px_rgba(16,185,129,0.16)]">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-600">
                Journey Note
              </p>
              <h2 className="text-[26px] leading-tight text-slate-950 mb-3">
                당신의 문장이
                <br />
                여행에 남았어요
              </h2>
              <p className="text-slate-600 text-sm leading-6">
                오늘 지나온 작품과 마음을 함께 모아둘게요. 남겨 준 소감도 누군가에게는
                작은 질문이 될 수 있습니다.
              </p>
            </div>
            <div className="px-6 pb-6">
              <div className="mb-5 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="mb-2 text-[12px] text-slate-500">오늘의 여행</p>
                <div className="flex flex-wrap gap-2">
                  {['하트', '나누기', '십자가', '물음표'].map(item => (
                    <span key={item} className="rounded-full bg-white px-3 py-1.5 text-[12px] text-slate-700 shadow-sm">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={onBack}
                className="w-full h-14 rounded-full bg-slate-950 text-white text-base shadow-[0_10px_24px_rgba(15,23,42,0.22)] active:scale-[0.98] transition"
              >
                처음으로 돌아가기
              </button>
            </div>
          </section>
        ) : (
          <form onSubmit={handleSubmit} className="mt-auto flex flex-col gap-4">
            <section className="rounded-[24px] border border-sky-100 bg-white/85 p-4 shadow-[0_10px_24px_rgba(14,165,233,0.08)]">
              <p className="mb-3 text-[13px] text-sky-700">무엇을 적을지 고민된다면</p>
              <div className="space-y-2 text-[14px] leading-6 text-slate-700">
                <p>가장 오래 머문 작품은 무엇이었나요?</p>
                <p>하트, 나누기, 십자가 중 나에게 가장 가까웠던 심볼은 무엇인가요?</p>
                <p>오늘 가져가고 싶은 한 문장은 무엇인가요?</p>
              </div>
            </section>

            <section className="border border-sky-100 rounded-[26px] p-5 bg-white/90 shadow-[0_16px_32px_rgba(14,165,233,0.12)]">
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
            </section>
          </form>
        )}
      </div>
    </main>
  );
}
