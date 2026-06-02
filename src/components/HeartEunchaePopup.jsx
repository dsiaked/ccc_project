import React, { useState } from 'react';
import { X, ArrowRight, ArrowLeft, Heart, Check, MessageSquare } from 'lucide-react';
import useArtworkComments from '../hooks/useArtworkComments';
import ArtworkCommentModal from './ArtworkCommentModal';
import { artistPopupEnglish } from '../data/artistPopupEnglish';
import { ArtistEnglishDetailOverlay, ArtistEnglishIntroOverlay } from './ArtistEnglishContentOverlay';

export default function HeartEunchaePopup({ onClose, language = 'ko' }) {
  const [step, setStep] = useState(1);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const uiText = language === 'en'
    ? {
        leaveComment: 'Leave a reflection',
        nextArtwork: 'View next artwork',
        loadingComments: 'Loading reflections...',
        firstComment: 'Be the first to leave a reflection.',
        noComments: 'No reflections have been written yet.',
        firstCommentHint: 'Fill this artwork with a warm first note.',
        edit: 'Edit',
        delete: 'Delete',
        cancel: 'Cancel',
        save: 'Save',
        namePlaceholder: 'Name or nickname',
        commentPlaceholder: 'Leave a warm reflection. (max 100 characters)',
      }
    : {
        leaveComment: '감상평 남기기',
        nextArtwork: '다음 작품 보러 가기',
        loadingComments: '감상평을 불러오는 중...',
        firstComment: '첫 감상평을 남겨보세요!',
        noComments: '아직 작성된 감상평이 없습니다.',
        firstCommentHint: '따뜻한 첫 마디로 작품을 채워주세요 ✨',
        edit: '수정',
        delete: '삭제',
        cancel: '취소',
        save: '저장',
        namePlaceholder: '작성자 이름 (닉네임)',
        commentPlaceholder: '따뜻한 감상평을 남겨주세요! (최대 100자)',
      };
  const englishCopy = language === 'en' ? artistPopupEnglish.heart_eunchae : null;
  const commentsApi = useArtworkComments('heart_eunchae');

  // 몽환적인 흩날리는 핑크색 하트 입자 데이터 정의
  const floatingHearts = [
    { id: 1, size: 24, left: '10%', delay: '0s', duration: '8s', opacity: 0.15 },
    { id: 2, size: 36, left: '75%', delay: '1s', duration: '10s', opacity: 0.12 },
    { id: 3, size: 16, left: '45%', delay: '3s', duration: '7s', opacity: 0.18 },
    { id: 4, size: 28, left: '25%', delay: '5s', duration: '9s', opacity: 0.14 },
    { id: 5, size: 20, left: '85%', delay: '2s', duration: '6s', opacity: 0.16 },
    { id: 6, size: 32, left: '60%', delay: '4s', duration: '11s', opacity: 0.13 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300 overflow-x-hidden touch-pan-y">
      <style>{`
        @keyframes float-up {
          0% {
            transform: translateY(100%) rotate(0deg) scale(0.8);
            opacity: 0;
          }
          10% {
            opacity: var(--op);
          }
          90% {
            opacity: var(--op);
          }
          100% {
            transform: translateY(-120%) rotate(360deg) scale(1.1);
            opacity: 0;
          }
        }
        .animate-float {
          animation: float-up var(--dur) ease-in-out infinite;
          animation-delay: var(--delay);
        }
        .font-sentiment {
          font-family: 'Jua', sans-serif;
        }
        .font-readable-sans {
          font-family: 'Jua', sans-serif;
        }
        .popup-body-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .popup-body-scroll::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.02);
          border-radius: 999px;
        }
        .popup-body-scroll::-webkit-scrollbar-thumb {
          background: rgba(250, 92, 92, 0.2);
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.5);
        }
        .popup-body-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(250, 92, 92, 0.4);
        }
      `}</style>

      {/* 팝업 모달 몸체 */}
      <div className="relative w-[360px] h-[780px] max-h-[92vh] rounded-[32px] overflow-hidden flex flex-col shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-gray-100 bg-white animate-in zoom-in-95 duration-300 touch-pan-y">

        {/* Step 1: 첫 번째 팝업창 (감성 인트로) */}
        {step === 1 && (
          <div className="relative flex-1 bg-gradient-to-b from-[#ffffff] via-[#fffbfb] to-[#fff0f0] text-gray-800 overflow-hidden select-none">

            {/* 기하학적 백그라운드 디자인 */}
            <div className="absolute inset-0 pointer-events-none z-[1] overflow-hidden">
              <div className="absolute w-[232px] h-[230px] rounded-[20px] left-[150px] top-[103px] opacity-[0.08]" style={{ backgroundImage: "linear-gradient(to bottom, #fa5c5c, #f8cfd0)" }} />
              <div className="absolute w-[143px] h-[142px] rounded-bl-[20px] rounded-br-[20px] rounded-tl-[20px] left-[219px] top-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(to bottom, #fa5c5c, #ffedd5)" }} />
              <div className="absolute w-[73px] h-[254px] rounded-[20px] left-[242px] top-[281px] opacity-[0.05]" style={{ backgroundImage: "linear-gradient(to bottom, #fa5c5c, #f8cfd0)" }} />
            </div>

            {/* 하트 파티클 */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]">
              {floatingHearts.map((heart) => (
                <div
                  key={heart.id}
                  className="absolute bottom-0 animate-float"
                  style={{
                    left: heart.left,
                    '--dur': heart.duration,
                    '--delay': heart.delay,
                    '--op': heart.opacity * 0.8,
                    fontSize: `${heart.size}px`,
                  }}
                >
                  <Heart className="fill-rose-400/8 text-transparent" style={{ width: heart.size, height: heart.size }} />
                </div>
              ))}
            </div>

            {/* 메인 텍스트 및 라벨 */}
            <div className="relative z-10 w-full h-full">
              <span className="absolute left-[29px] top-[31px] text-[15px] tracking-[1.92px] font-medium text-[#4a3b3b] font-readable-sans">
                SYMBOL : HEART
              </span>

              <div className="absolute left-[29px] top-[64px] w-[35px] h-[1.5px] bg-[#e2cece]" />

              <div className="absolute right-[25px] top-[58px] text-[10px] text-[#4a3b3b] tracking-[1.2px] text-right font-readable-sans">
                2026.05.26/06.02
              </div>

              <div className="absolute right-[25px] top-[71px] text-[10px] text-[#4a3b3b] tracking-[1.2px] text-right font-readable-sans">
                과기대 미술관
              </div>

              {/* 작품 명으로 감성 인트로 구성 */}
              <div className="absolute left-[29px] top-[110px] w-[310px] text-left">
                <h1 className="text-[36px] font-bold text-rose-500 tracking-wide font-sentiment mb-6 select-text">
                  〈Little Lamb〉
                </h1>
                <div className="text-[20px] leading-[1.6] text-[#4a3b3b] font-sentiment font-normal break-keep">
                  <p>작고 둥근 몸짓,</p>
                  <p>보호하고 아껴주고 싶은</p>
                  <p>연약함을 온전히 품어 안으시는</p>
                  <p className="font-bold text-rose-500">예수님의 다정한 시선 🐑</p>
                </div>
              </div>

              {/* 아티스트 정보 하단 배치 */}
              <div className="absolute left-[26px] top-[450px] w-[35px] h-[1.5px] bg-[#e2cece]" />

              <div className="absolute left-[26px] right-[25px] top-[465px] flex items-center justify-between">
                <span className="text-[15px] tracking-[1.92px] font-medium text-[#4a3b3b] font-readable-sans">
                  ARTIST. 이은채
                </span>
                <button
                  onClick={() => setShowCommentModal(true)}
                  className="relative flex items-center justify-center w-16 h-16 rounded-full bg-rose-50 border-2 border-rose-100 hover:bg-rose-100/50 text-[#fa5c5c] cursor-pointer transition-all active:scale-95 shadow-md animate-in fade-in"
                >
                  <MessageSquare className="w-8 h-8" />
                  <span className="absolute -top-1 -right-1 flex h-6 min-w-[24px] px-1.5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold shadow-sm border border-white">
                    {commentsApi.comments.length}
                  </span>
                </button>
              </div>

              <div className="absolute left-[25px] top-[502px] text-[10px] tracking-[1.2px] text-[#4a3b3b] leading-normal font-readable-sans">
                <p>서울과학기술대학교</p>
                <p className="mt-0.5">중앙동아리 CCC</p>
              </div>

              <ArtistEnglishIntroOverlay copy={englishCopy} textColor={'text-[#4a3b3b]'} />

              <button
                onClick={() => setStep(2)}
                className="absolute right-[25px] bottom-[46px] w-[140px] h-[47px] bg-gradient-to-r from-[#fa5c5c] to-[#ff7b7b] text-white rounded-[24px] flex items-center justify-between pl-6 pr-5 hover:opacity-90 transition-all active:scale-[0.96] shadow-[0_4px_15px_rgba(250,92,92,0.25)] cursor-pointer font-readable-sans"
              >
                <span className="text-[13px] tracking-[1.68px] font-bold">NEXT</span>
                <ArrowRight className="w-4 h-4 text-white" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 w-8 h-8 bg-gray-100/80 hover:bg-gray-200/80 text-gray-500 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors border border-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: 두 번째 팝업창 (작품 상세 설명 본문) */}
        {step === 2 && (
          <div className="relative flex-1 flex flex-col bg-gradient-to-b from-[#ffffff] via-[#fffbfb] to-[#ffebeb] text-gray-800 overflow-y-auto overflow-x-hidden popup-body-scroll select-none touch-pan-y">
            <div className="relative w-full flex flex-col p-6 pb-8 min-h-[960px]">

              <div className="absolute top-[5px] right-[-10px] w-64 h-60 opacity-40 pointer-events-none z-[2] mix-blend-normal">
                <Heart className="w-full h-full text-rose-200/40 fill-rose-100/15" />
              </div>

              {/* 상단 헤더 */}
              <div className="relative z-10 flex justify-between items-center pb-6 font-readable-sans">
                <span className="text-[10px] tracking-[1.2px] font-bold text-rose-500">
                  SYMBOL : HEART
                </span>
                <div className="w-[100px] h-[0.5px] bg-rose-200" />
              </div>

              {/* 작품 설명 카드 몸체 */}
              <div className="relative z-10 flex-1 flex flex-col bg-white/90 backdrop-blur-md rounded-[24px] border border-rose-100 p-6 sm:p-7 shadow-[0_8px_32px_rgba(0,0,0,0.03)]">
                
                {/* 작품 제목 */}
                <div className="text-left font-sentiment text-[32px] leading-[1.2] text-rose-500 tracking-[1.5px] font-bold mt-2 select-text">
                  〈Little Lamb〉
                </div>
                
                <div className="bg-rose-300 h-px w-[31px] my-5 flex-none" />

                {/* 사용자가 작성 요청한 3문단 작품 설명 본문 - font-sans와 leading-relaxed 적용으로 가독성 극대화 */}
                <div className="text-left text-[14px] sm:text-[14.5px] leading-[1.9] text-gray-700 space-y-6 tracking-wide font-sans select-text break-keep">
                  
                  {/* 1문단 */}
                  <p className="text-gray-600">
                    <span className="font-bold text-gray-900 text-base">〈Little Lamb〉</span>은 인간이 귀여움을 느끼는 방식에서 출발한 작업이다. 사람들은 자신과 닮은 존재에게 감정을 이입하고 의인화하며 귀여움을 느낀다. 작은 몸집과 둥근 형태 짧은 팔다리처럼 본능적으로 귀엽다고 느끼는 요소들은 대상을 보호하고 싶고 아껴주고 싶은 감정을 자연스럽게 불러일으킨다. 나는 이러한 감정 안에 <span className="font-semibold text-rose-500">예수님이 인간을 바라보시는 사랑과 닮은 부분</span>이 있다고 느꼈다. 연약한 존재를 먼저 품고 아끼시는 마음 말이다.
                  </p>

                  {/* 2문단 */}
                  <p className="text-gray-600">
                    작품은 양의 형상을 통해 이러한 귀여움의 요소들을 조형적으로 드러낸다. 둥글고 작은 몸 비율과 모여 있는 발의 자세 그리고 단순화된 얼굴은 연약하고 순한 인상을 강조한다. 몸통은 크기가 다른 알루미늄 피스들을 반복적으로 용접해 <span className="font-medium text-gray-800">양털처럼 부드러운 덩어리감</span>을 만들었고 얼굴과 발은 적동을 망치로 직접 성형해 손의 흔적과 유기적인 감각이 느껴지도록 했다. 차갑고 단단한 금속 재료를 사용했지만 전체적으로는 부드럽고 사랑스러운 인상이 느껴지도록 구성했다.
                  </p>

                  {/* 3문단 - 더욱 고급스러운 가스모피즘 핑크 베일 박스로 리팩토링 */}
                  <div className="bg-rose-50/30 border border-rose-100/50 p-5 rounded-[24px] shadow-[0_4px_15px_rgba(250,92,92,0.02)] relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-16 h-16 opacity-5 pointer-events-none">
                      <Heart className="w-full h-full text-rose-500 fill-rose-500" />
                    </div>
                    <span className="inline-block text-xl mb-2 select-none">🐑</span>
                    <p className="text-gray-700 leading-[1.85]">
                      성경에서 양은 예수님과 그를 따르는 사람들을 상징한다. 관람자가 이 작은 양을 바라보며 자연스럽게 느끼는 애정과 보호하고 싶은 마음을 통해 <span className="font-bold text-rose-600">연약한 존재를 먼저 품고 아끼시는 사랑</span>을 떠올리기를 바랐다. 이 작업은 귀여운 대상을 마주할 때 판단보다 애정이 먼저 일어나는 감각을 통해 존재 자체를 사랑으로 바라보는 시선을 이야기한다.
                    </p>
                  </div>

                </div>

                <ArtistEnglishDetailOverlay copy={englishCopy} accentClass={'text-rose-500'} />
              </div>

              {/* 하단 네비게이션 */}
              <div className="relative z-10 grid grid-cols-[92px_1fr] gap-2.5 mt-8 flex-none font-readable-sans">
                <button
                  onClick={() => setStep(1)}
                  className="w-[112px] h-[52px] bg-white border border-gray-200 text-gray-700 rounded-[26px] flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-all active:scale-[0.96] cursor-pointer shadow-sm font-bold"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-[12px] tracking-[1.2px]">BACK</span>
                </button>

                <button
                  onClick={() => setShowCommentModal(true)}
                  className="h-[48px] min-w-0 bg-gradient-to-r from-[#fa5c5c] to-[#ff7b7b] text-white rounded-2xl flex items-center justify-center gap-2 px-3 hover:opacity-90 transition-all active:scale-[0.96] shadow-[0_8px_18px_rgba(250,92,92,0.26)] cursor-pointer font-bold"
                >
                  <span className="min-w-0 truncate text-[13px] tracking-[0.1px]">{uiText.leaveComment}</span>
                  <Check className="w-[18px] h-[18px]" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="col-span-2 h-[44px] rounded-2xl border border-gray-200 bg-white/95 text-gray-700 flex items-center justify-center transition-all duration-200 active:scale-[0.98] cursor-pointer shadow-[0_5px_14px_rgba(15,23,42,0.07)] font-bold"
                >
                  <span className="text-[13px] tracking-[0.1px]">{uiText.nextArtwork}</span>
                </button>
              </div>

            </div>

            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 w-8 h-8 bg-gray-100/80 hover:bg-gray-200/80 text-gray-500 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors border border-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

      </div>

      {/* 댓글 모달 */}
            {showCommentModal && (
        <ArtworkCommentModal
          commentsApi={commentsApi}
          onClose={() => setShowCommentModal(false)}
          uiText={uiText}
          accent="#fa5c5c"
          accentTextClass="text-rose-500"
          accentNameClass="text-rose-800"
          accentBgClass="bg-rose-50/30 border border-rose-100/50"
          focusRingClass="focus:ring-rose-400"
        />
      )}
    </div>
  );
}
