import React, { useState } from 'react';
import { X, BookOpen, CheckCircle2, Cross, Divide, Heart, HelpCircle, Send, Sparkles, Star } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { symbolData } from '../data/symbolData';
import { symbolIcons } from '../data/symbolIcons';
import { db } from '../firebase';

const questionToneClasses = {
  rose: {
    card: 'border-rose-100 bg-rose-50/70',
    icon: 'border-rose-100 bg-white text-rose-500',
    step: 'text-rose-500',
  },
  amber: {
    card: 'border-amber-100 bg-amber-50/70',
    icon: 'border-amber-100 bg-white text-amber-500',
    step: 'text-amber-600',
  },
  emerald: {
    card: 'border-emerald-100 bg-emerald-50/70',
    icon: 'border-emerald-100 bg-white text-emerald-500',
    step: 'text-emerald-600',
  },
};

const qrCopy = {
  ko: {
    close: '닫기',
    found: '발견 완료!',
    description: '상징 설명',
    detail: '상세 정보',
    meaning: '상징의 의미',
    location: '발견 장소',
    message: '마지막 메시지',
    confirm: '확인',
  },
  en: {
    close: 'Close',
    found: 'Found!',
    description: 'Symbol Description',
    detail: 'Details',
    meaning: 'Meaning',
    location: 'Location',
    message: 'Final Message',
    confirm: 'Confirm',
  },
};

const questionCopy = {
  ko: {
    close: '닫기',
    eyebrow: 'Final Question',
    title: '작품이 남긴 질문',
    description: '세 가지 상징을 따라 만난 작품들을 떠올리며, 잠시 나에게 질문을 건네 보세요.',
    questions: [
      {
        label: '하트',
        question: '나는 오늘 어떤 사랑을 발견했나요?',
        icon: Heart,
        tone: 'rose',
      },
      {
        label: '나누기',
        question: '내가 기꺼이 나눌 수 있는 것은 무엇인가요?',
        icon: Divide,
        tone: 'amber',
      },
      {
        label: '십자가',
        question: '내가 지키고 싶은 믿음은 어디에 있나요?',
        icon: Cross,
        tone: 'emerald',
      },
    ],
    name: '이름',
    namePlaceholder: '이름을 적어 주세요',
    feedback: '작품 소감',
    feedbackPlaceholder: '작품을 보며 떠오른 생각을 적어 주세요',
    submit: '소감 제출하기',
    submitting: '제출 중',
    submittedTitle: '소감이 제출됐어요.',
    submittedDescription: '남겨준 생각을 함께 모아둘게요.',
    emptyError: '작품을 보며 떠오른 생각을 한 줄 이상 적어 주세요.',
    saveError: '소감 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    anonymous: '익명',
  },
  en: {
    close: 'Close',
    eyebrow: 'Final Question',
    title: 'The Question Left by the Artworks',
    description: 'Think back on the artworks you met through the three symbols, then offer yourself a quiet question.',
    questions: [
      {
        label: 'Heart',
        question: 'What kind of love did I discover today?',
        icon: Heart,
        tone: 'rose',
      },
      {
        label: 'Divide',
        question: 'What am I willing to share with others?',
        icon: Divide,
        tone: 'amber',
      },
      {
        label: 'Cross',
        question: 'Where is the faith I want to hold onto?',
        icon: Cross,
        tone: 'emerald',
      },
    ],
    name: 'Name',
    namePlaceholder: 'Write your name',
    feedback: 'Artwork Reflection',
    feedbackPlaceholder: 'Write the thought that came to mind while viewing the artworks',
    submit: 'Submit Reflection',
    submitting: 'Submitting',
    submittedTitle: 'Your reflection was submitted.',
    submittedDescription: 'We will keep your thought with the tour.',
    emptyError: 'Please write at least one line of reflection.',
    saveError: 'There was an error saving your reflection. Please try again later.',
    anonymous: 'Anonymous',
  },
};

export default function QrPopup({ id, onClose, language = 'ko' }) {
  const symbol = symbolData[id];

  if (!symbol) return null;

  if (id === 'question') {
    return <QuestionReflectionPopup onClose={onClose} language={language} />;
  }

  const Icon = symbolIcons[symbol.iconKey] || Sparkles;
  const localizedSymbol = language === 'en' ? symbol.en || symbol : symbol;
  const data = localizedSymbol.qr;
  const text = qrCopy[language] || qrCopy.ko;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden flex flex-col max-h-[85vh] shadow-[0_20px_50px_rgba(0,0,0,0.3)] animate-in zoom-in-95 duration-300">
        <div className="relative p-6 border-b border-gray-100 bg-gray-50 flex flex-col items-center pt-10">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-100 transition-colors"
            aria-label={text.close}
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
              {text.found}
            </span>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-white">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-5 h-5 text-purple-600" />
              <h3 className="text-xl text-gray-800">{text.description}</h3>
            </div>

            <p className="text-gray-600 leading-relaxed pl-7">
              {data.desc}
            </p>
          </div>

          <div className="mb-2">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              <h3 className="text-xl text-gray-800">{text.detail}</h3>
            </div>

            <div className="pl-7 flex flex-col gap-5">
              <div>
                <h4 className="text-gray-800 text-lg mb-1.5">{text.meaning}</h4>
                <p className="text-gray-600 leading-relaxed text-sm">
                  {data.meaning}
                </p>
              </div>

              <div>
                <h4 className="text-gray-800 text-lg mb-1.5">{text.location}</h4>
                <p className="text-gray-600 leading-relaxed text-sm">
                  {data.location}
                </p>
              </div>

              <div>
                <h4 className="text-gray-800 text-lg mb-1.5">{text.message}</h4>
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
            {text.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionReflectionPopup({ onClose, language = 'ko' }) {
  const [name, setName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const text = questionCopy[language] || questionCopy.ko;

  const handleSubmit = async event => {
    event.preventDefault();
    const trimmedFeedback = feedback.trim();

    if (!trimmedFeedback) {
      setErrorMessage(text.emptyError);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await addDoc(collection(db, 'tour_feedbacks'), {
        name: name.trim() || text.anonymous,
        feedback: trimmedFeedback,
        createdAt: serverTimestamp(),
        isPublished: false,
      });
      setIsSubmitted(true);
    } catch (error) {
      console.error('Question feedback save failed:', error);
      setErrorMessage(text.saveError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-950/55 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-[30px] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
        <div className="relative border-b border-slate-100 bg-gradient-to-br from-sky-50 via-white to-indigo-50 px-6 pb-6 pt-8 text-center">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm"
            aria-label={text.close}
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-[0_12px_26px_rgba(14,165,233,0.25)]">
            <HelpCircle className="h-9 w-9" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-600">{text.eyebrow}</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">{text.title}</h2>
          <p className="mx-auto mt-2 max-w-[310px] text-sm leading-relaxed text-slate-600">
            {text.description}
          </p>
        </div>

        <div className="max-h-[64vh] overflow-y-auto px-5 py-5">
          <div className="grid gap-3">
            {text.questions.map((item, index) => {
              const Icon = item.icon;
              const tone = questionToneClasses[item.tone];

              return (
                <article key={item.label} className={`rounded-2xl border px-4 py-3 ${tone.card}`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${tone.icon}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${tone.step}`}>
                        Step {String(index + 1).padStart(2, '0')}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">{item.question}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {isSubmitted ? (
            <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-5 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
              <p className="font-bold text-emerald-800">{text.submittedTitle}</p>
              <p className="mt-1 text-sm leading-relaxed text-emerald-700">
                {text.submittedDescription}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 rounded-full bg-emerald-600 px-5 py-2 text-sm font-bold text-white"
              >
                {text.close}
              </button>
            </div>
          ) : (
            <form className="mt-5 grid gap-3" onSubmit={handleSubmit}>
              <label className="grid gap-1.5">
                <span className="text-sm font-bold text-slate-700">{text.name}</span>
                <input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder={text.namePlaceholder}
                  className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-sky-400 focus:bg-white"
                  maxLength={24}
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm font-bold text-slate-700">{text.feedback}</span>
                <textarea
                  value={feedback}
                  onChange={event => setFeedback(event.target.value)}
                  placeholder={text.feedbackPlaceholder}
                  className="min-h-[118px] resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-sky-400 focus:bg-white"
                  maxLength={500}
                />
              </label>

              {errorMessage && (
                <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-bold text-white shadow-[0_10px_22px_rgba(15,23,42,0.18)] transition active:scale-[0.98] disabled:opacity-60"
              >
                {isSubmitting ? <Sparkles className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isSubmitting ? text.submitting : text.submit}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
