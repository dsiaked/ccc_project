import React, { useState } from 'react';
import { X, BookOpen, CheckCircle2, HelpCircle, Send, Sparkles, Star } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { symbolData } from '../data/symbolData';
import { getSymbolIcon } from '../data/symbolIcons';
import { db } from '../firebase';

const reflectionQuestions = [
  {
    label: '하트',
    question: '나는 오늘 어떤 사랑을 발견했나요?',
  },
  {
    label: '나누기',
    question: '내가 기꺼이 나눌 수 있는 것은 무엇인가요?',
  },
  {
    label: '십자가',
    question: '내가 지키고 싶은 믿음은 어디에 있나요?',
  },
];

function QuestionReflectionPopup({ onClose }) {
  const [name, setName] = useState(() => localStorage.getItem('tour_feedback_name') || '');
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const isSubmitting = status === 'submitting';
  const isSubmitted = status === 'submitted';
  const canSubmit = feedback.trim().length > 0 && !isSubmitting;

  const handleSubmit = async event => {
    event.preventDefault();

    const trimmedFeedback = feedback.trim();
    const trimmedName = name.trim();

    if (!trimmedFeedback) {
      setErrorMessage('작품을 보며 떠오른 생각을 한 줄 이상 적어 주세요.');
      return;
    }

    setStatus('submitting');
    setErrorMessage('');

    try {
      await addDoc(collection(db, 'tour_feedbacks'), {
        name: trimmedName || '익명',
        feedback: trimmedFeedback,
        createdAt: serverTimestamp(),
        source: 'question_popup',
      });
      localStorage.setItem('tour_feedback_name', trimmedName);
      setFeedback('');
      setStatus('submitted');
    } catch (error) {
      console.error('작품 질문 소감 저장 중 에러 발생:', error);
      setStatus('idle');
      setErrorMessage('저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-6 backdrop-blur-md animate-in fade-in duration-200 font-['Jua']">
      <div className="relative flex max-h-[86vh] w-full max-w-sm flex-col overflow-hidden rounded-[30px] border border-white/80 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.34)] animate-in zoom-in-95 duration-300">
        <button
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-slate-100 bg-white/90 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-700 active:scale-90"
        >
          <X className="h-[18px] w-[18px]" />
        </button>

        <div className="relative overflow-hidden bg-gradient-to-b from-sky-50 via-white to-white px-6 pb-5 pt-10 text-center">
          <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_50%_0%,rgba(125,211,252,0.45),transparent_70%)]" />
          <div className="relative mx-auto mb-4 flex h-[68px] w-[68px] items-center justify-center rounded-[24px] border border-sky-100 bg-white text-sky-600 shadow-[0_12px_26px_rgba(14,165,233,0.18)]">
            <HelpCircle className="h-9 w-9" />
            <Sparkles className="absolute -right-1.5 -top-1.5 h-5 w-5 text-amber-400" />
          </div>
          <p className="relative mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-sky-600">
            Final Question
          </p>
          <h2 className="relative text-[25px] leading-tight text-slate-950 font-['Cafe24_Ssurround']">
            작품이 남긴 질문
          </h2>
          <p className="relative mt-3 text-[14px] leading-6 text-slate-600">
            세 가지 심볼을 따라 만난 작품들을 떠올리며, 잠시 나에게 질문을 건네 보세요.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 scroll-container">
          <div className="grid gap-3">
            {reflectionQuestions.map((item, index) => (
              <section
                key={item.label}
                className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[12px] font-bold text-sky-700 shadow-sm">
                    {index + 1}
                  </span>
                  <span className="text-[12px] font-bold text-slate-500">{item.label}</span>
                </div>
                <p className="text-[17px] leading-7 text-slate-900">
                  {item.question}
                </p>
              </section>
            ))}
          </div>

          {isSubmitted ? (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-500" />
              <p className="text-[15px] leading-6 text-emerald-800">
                소감이 제출됐어요. 남겨준 생각을 함께 모아둘게요.
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/80 p-4"
            >
              <label className="mb-2 block text-[13px] text-slate-600" htmlFor="question-feedback-name">
                이름 또는 닉네임
              </label>
              <input
                id="question-feedback-name"
                type="text"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="익명으로 남겨도 괜찮아요"
                className="mb-3 h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300"
              />

              <label className="mb-2 block text-[13px] text-slate-600" htmlFor="question-feedback">
                작품 소감
              </label>
              <textarea
                id="question-feedback"
                value={feedback}
                onChange={event => setFeedback(event.target.value)}
                placeholder="작품을 보며 떠오른 생각을 적어 주세요"
                rows={4}
                maxLength={300}
                className="w-full resize-none rounded-2xl border border-sky-100 bg-white px-3 py-3 text-[14px] leading-6 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-500">최대 300자</span>
                <span className="text-[11px] text-slate-500">{feedback.length}/300</span>
              </div>

              {errorMessage && (
                <p className="mt-3 rounded-xl border border-rose-100 bg-white px-3 py-2 text-[13px] text-rose-600">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-4 flex h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-base font-bold text-white shadow-[0_10px_22px_rgba(15,23,42,0.22)] transition active:scale-[0.98] disabled:bg-slate-300 disabled:shadow-none"
              >
                {isSubmitting ? (
                  <>
                    <Sparkles className="h-[18px] w-[18px] animate-pulse" />
                    제출 중
                  </>
                ) : (
                  <>
                    <Send className="h-[18px] w-[18px]" />
                    소감 제출하기
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        <div className="border-t border-slate-100 bg-white p-5">
          <button
            onClick={onClose}
            className="h-[52px] w-full rounded-2xl bg-white text-base font-bold text-slate-700 ring-1 ring-slate-200 transition active:scale-[0.98]"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QrPopup({ id, onClose }) {
  const symbol = symbolData[id];

  if (!symbol) return null;

  if (id === 'question') {
    return <QuestionReflectionPopup onClose={onClose} />;
  }

  const Icon = getSymbolIcon(symbol.iconKey);
  const data = symbol.qr;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden flex flex-col max-h-[85vh] shadow-[0_20px_50px_rgba(0,0,0,0.3)] animate-in zoom-in-95 duration-300">
        <div className="relative p-6 border-b border-gray-100 bg-gray-50 flex flex-col items-center pt-10">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>

          <div className="w-24 h-24 bg-white border-[3px] border-gray-100 rounded-[28px] flex items-center justify-center shadow-md mb-4 rotate-3">
            <Icon className={symbol.iconClass} />
          </div>

          <h2 className="text-3xl text-gray-800 mb-3">
            {data.title}
          </h2>

          <div className="bg-purple-100 border-[1.5px] border-purple-200 rounded-full px-4 py-1 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-600" />
            <span className="text-purple-700 text-sm mt-0.5 font-medium">
              발견완료!
            </span>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-white">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-5 h-5 text-purple-600" />
              <h3 className="text-xl text-gray-800">심볼 설명</h3>
            </div>

            <p className="text-gray-600 leading-relaxed pl-7">
              {data.desc}
            </p>
          </div>

          <div className="mb-2">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              <h3 className="text-xl text-gray-800">상세 정보</h3>
            </div>

            <div className="pl-7 flex flex-col gap-5">
              <div>
                <h4 className="text-gray-800 text-lg mb-1.5">
                  심볼의 의미
                </h4>
                <p className="text-gray-600 leading-relaxed text-sm">
                  {data.meaning}
                </p>
              </div>

              <div>
                <h4 className="text-gray-800 text-lg mb-1.5">
                  발견 장소
                </h4>
                <p className="text-gray-600 leading-relaxed text-sm">
                  {data.location}
                </p>
              </div>

              <div>
                <h4 className="text-gray-800 text-lg mb-1.5">
                  특별 메시지
                </h4>
                <p className="text-purple-700 leading-relaxed text-sm font-medium bg-purple-50 p-3 rounded-xl border border-purple-100">
                  {data.message}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full bg-gray-800 text-white rounded-full py-4 text-xl shadow-md hover:bg-gray-700 transition-colors active:scale-[0.98]"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
