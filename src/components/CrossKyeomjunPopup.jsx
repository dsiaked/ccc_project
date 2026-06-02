import React, { useState } from 'react';
import { X, ArrowRight, ArrowLeft, Check, MessageSquare } from 'lucide-react';
import useArtworkComments from '../hooks/useArtworkComments';
import { crossKyeomjunContent } from '../data/artworkContent/crossKyeomjun';
import { artistPopupEnglish } from '../data/artistPopupEnglish';
import ArtworkCommentModal from './ArtworkCommentModal';

const CustomCrossIcon = ({ className = "w-6 h-6", color = "currentColor", strokeWidth = "2.5", style }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    <line x1="12" y1="2.5" x2="12" y2="21.5" />
    <line x1="6.5" y1="8" x2="17.5" y2="8" />
  </svg>
);

export default function CrossKyeomjunPopup({ onClose, language = 'ko' }) {
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
  const englishCopy = language === 'en' ? artistPopupEnglish.cross : null;
  const commentsApi = useArtworkComments('cross_kyeomjun');

  // 몽환적인 흩날리는 초록색 십자가 입자 데이터 정의 (화이트-그린 테마룩)
  const floatingParticles = [
    { id: 1, size: 20, left: '12%', delay: '0s', duration: '9s', opacity: 0.16 },
    { id: 2, size: 32, left: '78%', delay: '1.5s', duration: '11s', opacity: 0.14 },
    { id: 3, size: 18, left: '48%', delay: '4.0s', duration: '8s', opacity: 0.18 },
    { id: 4, size: 28, left: '22%', delay: '5.8s', duration: '10s', opacity: 0.15 },
    { id: 5, size: 16, left: '88%', delay: '2.5s', duration: '7s', opacity: 0.17 },
    { id: 6, size: 26, left: '62%', delay: '4.8s', duration: '12s', opacity: 0.14 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300 overflow-x-hidden touch-pan-y">
      {/* 스타일 태그 삽입: 몽환적인 플로팅 파티클 및 피그마 전용 서체 애니메이션 정의 */}
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
        /* 팝업 전체 바디 커스텀 스크롤 스타일 */
        .popup-body-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .popup-body-scroll::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.02);
          border-radius: 999px;
        }
        .popup-body-scroll::-webkit-scrollbar-thumb {
          background: rgba(76, 175, 80, 0.2);
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.5);
        }
        .popup-body-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(76, 175, 80, 0.4);
        }
      `}</style>

      {/* 팝업 모달 몸체: Figma iPhone 17-14의 가로-세로 뷰포트 비율을 1:1 복원하는 360x780px 고정형 카드 */}
      <div className="relative w-[360px] h-[780px] max-h-[92vh] rounded-[32px] overflow-hidden flex flex-col shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-gray-100 bg-white animate-in zoom-in-95 duration-300 touch-pan-y">

        {/* Step 1: 피그마 iPhone 17-14 1:1 완벽 절대 좌표 복원 */}
        {step === 1 && (
          <div className="relative flex-1 bg-gradient-to-b from-[#ffffff] via-[#f7faf8] to-[#eef7f0] text-gray-800 overflow-hidden select-none">

            {/* 1. 피그마 기하학적 도형 배경들 0.9배율 완벽 재현 (그린 오리지널 테마) */}
            <div className="absolute inset-0 pointer-events-none z-[1] overflow-hidden">
              {/* Radial gradient background box 1 */}
              <div
                className="absolute w-[232px] h-[230px] rounded-[20px] left-[150px] top-[103px] opacity-[0.08]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #e8f5e9)" }}
              />
              {/* Radial gradient background box 2 */}
              <div
                className="absolute w-[143px] h-[142px] rounded-bl-[20px] rounded-br-[20px] rounded-tl-[20px] left-[219px] top-0 opacity-[0.06]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #f1faf2)" }}
              />
              {/* Radial gradient background box 3 */}
              <div
                className="absolute w-[73px] h-[254px] rounded-[20px] left-[242px] top-[281px] opacity-[0.05]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #e8f5e9)" }}
              />
              {/* Radial gradient background box 4 */}
              <div
                className="absolute w-[82px] h-[230px] rounded-[20px] left-[291px] top-[176px] opacity-[0.08]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #e8f5e9)" }}
              />
              {/* Radial gradient background box 5 */}
              <div
                className="absolute w-[137px] h-[230px] rounded-[20px] left-[276px] top-[448px] opacity-[0.07]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #ffffff)" }}
              />
              {/* Radial gradient background box 6 */}
              <div
                className="absolute w-[141px] h-[269px] rounded-[20px] left-[208px] top-[574px] opacity-[0.08]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #e8f5e9)" }}
              />
              {/* Radial gradient background box 7 */}
              <div
                className="absolute w-[68px] h-[269px] rounded-[20px] left-[15px] top-[631px] opacity-[0.06]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #e8f5e9)" }}
              />
              {/* Radial gradient background box 8 */}
              <div
                className="absolute w-[147px] h-[49px] rounded-[20px] left-[130px] top-[365px] opacity-[0.08]"
                style={{ backgroundImage: "linear-gradient(to bottom, #4caf50, #e8f5e9)" }}
              />
            </div>

            {/* 흩날리는 파스텔 그린 십자가 파티클 */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]">
              {floatingParticles.map((part) => (
                <div
                  key={part.id}
                  className="absolute bottom-0 animate-float"
                  style={{
                    left: part.left,
                    '--dur': part.duration,
                    '--delay': part.delay,
                    '--op': part.opacity * 0.8,
                    fontSize: `${part.size}px`,
                  }}
                >
                  <CustomCrossIcon className="text-emerald-400/20" color="currentColor" strokeWidth="2.5" style={{ width: part.size, height: part.size }} />
                </div>
              ))}
            </div>

            {/* 2. 피그마 자산 이미지들 배치 (십자가 기호 실루엣으로 일치) */}
            <div className="absolute inset-0 pointer-events-none z-[3]">
              {/* 자산 4 3 (십자가 실루엣 1) */}
              <CustomCrossIcon className="absolute left-[180px] top-[70px] w-[50px] h-[48px]" color="#6ee7b7" strokeWidth="2" style={{ opacity: 0.2 }} />
              {/* 자산 4 2 (십자가 실루엣 2) */}
              <CustomCrossIcon className="absolute left-[256px] top-[155px] w-[76px] h-[71px]" color="#6ee7b7" strokeWidth="2.2" style={{ opacity: 0.15 }} />
              {/* 자산 4 4 (십자가 실루엣 3) */}
              <CustomCrossIcon className="absolute left-[10px] bottom-[20px] w-[50px] h-[48px]" color="#6ee7b7" strokeWidth="2" style={{ opacity: 0.2 }} />
              {/* 자산 4 1 (우측 대형 십자가 실루엣) */}
              <div className="absolute left-[132px] top-[448px] w-[225px] h-[212px] rotate-[10deg] opacity-20">
                <CustomCrossIcon className="w-full h-full" color="#6ee7b7" strokeWidth="2.5" />
              </div>
            </div>

            {/* 3. 글자 배치 (피그마 1:1 절대좌표 이식 및 서겸준 작가 사양 적용) */}
            <div className="relative z-10 w-full h-full">
              {/* SYMBOL3 : CROSS */}
              <span className="absolute left-[29px] top-[31px] text-[15px] tracking-[1.92px] font-medium text-[#2d3a2e] font-readable-sans">
                SYMBOL3 : {englishCopy?.symbol?.toUpperCase() || 'CROSS'}
              </span>

              {/* Rectangle 362 (상단 얇은 가로선) */}
              <div className="absolute left-[29px] top-[64px] w-[35px] h-[1.5px] bg-[#c3dec6]" />

              {/* 2026.05.26/06.02 */}
              <div className="absolute right-[25px] top-[58px] text-[10px] text-[#2d3a2e] tracking-[1.2px] text-right font-readable-sans">
                2026.05.26/06.02
              </div>

              {/* 과기대 붕어방 */}
              <div className="absolute right-[25px] top-[71px] text-[10px] text-[#2d3a2e] tracking-[1.2px] text-right font-readable-sans">
                {englishCopy ? 'Bungeobang' : '과기대 붕어방'}
              </div>

              {/* 대형 감성 문구: 서겸준 작가 (iPhone 17 - 14) 피그마 배치 및 그린/차콜 단일화 */}
              <div className="absolute left-[29px] top-[91px] w-[310px] text-left">
                <div className={[
                  'leading-[1.24] text-[#2d3a2e] tracking-[1.2px] font-sentiment font-normal',
                  englishCopy ? 'text-[29px]' : 'text-[32px]',
                ].join(' ')}>
                  {englishCopy ? (
                    englishCopy.intro.map(line => <p key={line}>{line}</p>)
                  ) : (
                    crossKyeomjunContent.heroLines.map((line, index) => (
                      line
                        ? <p key={`${line}-${index}`}>{line}</p>
                        : <div key={`spacer-${index}`} className="h-[18px]" />
                    ))
                  )}
                </div>
              </div>

              {/* 하단 작가 소개 영역 */}
              {/* Rectangle 358 (작가 위 가로선) */}
              <div className="absolute left-[26px] top-[450px] w-[35px] h-[1.5px] bg-[#c3dec6]" />

              {/* ARTIST. 서겸준 및 댓글 이모지 버튼 */}
              <div className="absolute left-[26px] right-[25px] top-[465px] flex items-center justify-between">
                <span className="text-[15px] tracking-[1.92px] font-medium text-[#2d3a2e] font-readable-sans">
                  ARTIST. {englishCopy?.artist || '서겸준'}
                </span>
                <button
                  onClick={() => setShowCommentModal(true)}
                  className="relative flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-100 hover:bg-emerald-100/50 text-[#10b981] cursor-pointer transition-all active:scale-95 shadow-md animate-in fade-in duration-300"
                  title={uiText.leaveComment}
                >
                  <MessageSquare className="w-8 h-8" />
                  {/* 댓글 수 배지 */}
                  <span className="absolute -top-1 -right-1 flex h-6 min-w-[24px] px-1.5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold shadow-sm border border-white">
                    {commentsApi.comments.length}
                  </span>
                </button>
              </div>

              {/* 서울과학기술대학교 중앙동아리 CCC */}
              <div className="absolute left-[25px] top-[502px] text-[10px] tracking-[1.2px] text-[#2d3a2e] leading-normal font-readable-sans">
                {englishCopy ? (
                  <>
                    <p>Seoul National University</p>
                    <p className="mt-0.5">of Science and Technology</p>
                    <p className="mt-0.5">CCC Club</p>
                  </>
                ) : (
                  <>
                    <p>서울과학기술대학교</p>
                    <p className="mt-0.5">중앙동아리 CCC</p>
                  </>
                )}
              </div>

              {/* NEXT 버튼: 우측 하단 둥근 캡슐 */}
              <button
                onClick={() => setStep(2)}
                className="absolute right-[25px] bottom-[46px] w-[140px] h-[47px] bg-gradient-to-r from-[#4caf50] to-[#66bb6a] text-white rounded-[24px] flex items-center justify-between pl-6 pr-5 hover:opacity-90 transition-all duration-200 active:scale-[0.96] shadow-[0_4px_15px_rgba(76,175,80,0.25)] cursor-pointer font-readable-sans"
              >
                <span className="text-[13px] tracking-[1.68px] font-bold">NEXT</span>
                <ArrowRight className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* 닫기 X 버튼 */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 w-8 h-8 bg-gray-100/80 hover:bg-gray-200/80 text-gray-500 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors border border-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: 피그마 iPhone 17-16 기반 디테일 완벽 복원 (십자가 서겸준 작가 수필 서사 적용) */}
        {step === 2 && (
          <div className="relative flex-1 flex flex-col bg-gradient-to-b from-[#ffffff] via-[#f7faf8] to-[#eef7f0] text-gray-800 overflow-y-auto overflow-x-hidden popup-body-scroll select-none touch-pan-y">

            {/* 전체 높이를 확보하여 피그마의 비율을 보존 */}
            <div className="relative w-full flex flex-col p-6 pb-8 min-h-[780px]">

              {/* 은은하게 그라데이션으로 퍼지는 초록빛 광원 오버레이 */}
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.02] mix-blend-multiply"
                style={{ backgroundImage: "linear-gradient(206.325deg, rgba(76, 175, 80, 0) 14.004%, rgb(46, 125, 50) 80.929%)" }}
              />
              <div
                className="absolute inset-0 pointer-events-none opacity-40 mix-blend-overlay"
                style={{ backgroundImage: "linear-gradient(147.794deg, rgba(76, 175, 80, 0) 34.559%, rgb(200, 230, 201) 100.79%)" }}
              />

              {/* 흩날리는 초록빛 십자가 파티클 */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
                {floatingParticles.map((part) => (
                  <div
                    key={part.id}
                    className="absolute bottom-0 animate-float"
                    style={{
                      left: part.left,
                      '--dur': part.duration,
                      '--delay': part.delay,
                      '--op': part.opacity * 1.2,
                      fontSize: `${part.size}px`,
                    }}
                  >
                    <CustomCrossIcon className="text-emerald-400/15" color="currentColor" strokeWidth="2.5" style={{ width: part.size, height: part.size }} />
                  </div>
                ))}
              </div>

              {/* 우측 상단 십자가 장식 (오버레이) */}
              <div className="absolute top-[5px] right-[-10px] w-64 h-60 opacity-30 pointer-events-none z-[2] animate-pulse">
                <CustomCrossIcon className="w-full h-full" color="#a7f3d0" strokeWidth="2.5" style={{ opacity: 0.3 }} />
              </div>

              {/* 상단 띠지 */}
              <div className="relative z-10 flex justify-between items-center pb-6 font-readable-sans">
                <span className="text-[10px] tracking-[1.2px] font-bold text-[#2e7d32]">
                  SYMBOL3 : {englishCopy?.symbol?.toUpperCase() || 'CROSS'}
                </span>
                <div className="w-[100px] h-[0.5px] bg-[#c3dec6]" />
              </div>

              {/* 카드 배경 */}
              <div className="relative z-10 flex-1 flex flex-col bg-white/80 backdrop-blur-md rounded-[20px] border border-green-100 p-7 shadow-[0_8px_32px_rgba(0,0,0,0.03)]">

                {/* 헤드라인 타이틀: "검정색 못과 흰 어린양" */}
                <div className="text-left font-sentiment text-[28px] leading-[1.2] text-[#2e7d32] tracking-[1px] font-bold mt-2 select-text">
                  {englishCopy ? (
                    <p>{englishCopy.title}</p>
                  ) : (
                    crossKyeomjunContent.detailTitle.map(line => (
                      <p key={line}>{line}</p>
                    ))
                  )}
                </div>

                {/* 얇은 가로선 */}
                <div className="bg-[#4caf50] h-px w-[31px] my-5 flex-none" />

                {/* 본문 서사: 서겸준 작가 십자가 수필 (온점 하나도 누락 없이 100% 반영) */}
                <div className="text-left text-[14.5px] leading-[1.85] text-gray-700 space-y-5 tracking-wide font-readable-sans select-text break-keep">

                  {englishCopy ? (
                    englishCopy.body.map((paragraph, index) => (
                      <p
                        key={paragraph}
                        className={index === 0 || index === englishCopy.body.length - 1 ? 'text-gray-800 font-medium' : ''}
                      >
                        {paragraph}
                      </p>
                    ))
                  ) : (
                    <>
                      {crossKyeomjunContent.body.map(({ className, text }) => (
                        <p key={text} className={className}>
                          {text}
                        </p>
                      ))}

                      {/* 대답 상자: 서겸준 작가 수필 세가지 은유 요약 */}
                      <div className="my-6 border border-green-150 bg-[#f1faf2] py-5 px-3.5 rounded-3xl font-sentiment text-[14.5px] leading-relaxed text-[#2e7d32] text-center shadow-sm">
                        {crossKyeomjunContent.quoteLines.map(line => (
                          <p key={line} className="font-bold text-[#2d6630]">{line}</p>
                        ))}
                      </div>
                    </>
                  )}

                </div>
              </div>

              <div className="relative z-10 grid grid-cols-[92px_1fr] gap-2.5 mt-8 flex-none font-readable-sans">
                {/* BACK 버튼 */}
                <button
                  onClick={() => setStep(1)}
                  className="h-[48px] rounded-2xl border border-gray-200 bg-white text-gray-600 flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-[0.96] cursor-pointer shadow-[0_5px_14px_rgba(15,23,42,0.08)] font-bold"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-[12px] tracking-[1.2px]">BACK</span>
                </button>

                <button
                  onClick={() => setShowCommentModal(true)}
                  className="h-[48px] min-w-0 bg-gradient-to-r from-[#4caf50] to-[#66bb6a] text-white rounded-2xl flex items-center justify-center gap-2 px-3 hover:opacity-90 transition-all duration-200 active:scale-[0.96] shadow-[0_8px_18px_rgba(76,175,80,0.26)] cursor-pointer font-bold"
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

            {/* 닫기 X 버튼 */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 w-8 h-8 bg-gray-100/80 hover:bg-gray-200/80 text-gray-500 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors border border-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 댓글 모달 */}
        {showCommentModal && (
          <ArtworkCommentModal
            commentsApi={commentsApi}
            onClose={() => setShowCommentModal(false)}
            uiText={uiText}
            accent="#10b981"
            accentTextClass="text-emerald-500"
            accentNameClass="text-emerald-800"
            accentBgClass="bg-emerald-50/30 border-emerald-100/50"
            focusRingClass="focus:ring-emerald-400"
          />
        )}

      </div>
    </div>
  );
}






