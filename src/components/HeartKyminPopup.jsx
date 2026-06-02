import React, { useState } from 'react';
import { X, ArrowRight, ArrowLeft, Heart, Check, MessageSquare } from 'lucide-react';
import useArtworkComments from '../hooks/useArtworkComments';
import ArtworkCommentModal from './ArtworkCommentModal';
import { artistPopupEnglish } from '../data/artistPopupEnglish';

const ACCENT = '#fa5c5c';
const accent = (opacity = 1) => `rgba(250, 92, 92, ${opacity})`;
export default function HeartKyminPopup({ onClose, language = 'ko' }) {
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
  const englishCopy = language === 'en' ? artistPopupEnglish.heart_kymin : null;
  const introLines = englishCopy?.intro || [
    '익숙한 장소',
    '늘 지나가던 곳',
    '잠깐 시간이 나서',
    '',
    '머물러본 그곳에서',
    '줄곧 날',
    '기다리던 존재를',
    '만났다',
  ];
  const detailTitleLines = englishCopy ? [englishCopy.title] : ['늘', '기다리고', '있었다'];
  const commentsApi = useArtworkComments('heart_kymin');

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300 overflow-x-hidden touch-pan-y"
      style={{ '--heart-accent': ACCENT }}
    >
      {/* 스타일 태그 삽입: 몽환적인 플로팅 하트 및 피그마 전용 서체 애니메이션 정의 */}
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
          background: rgba(250, 92, 92, 0.2);
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.5);
        }
        .popup-body-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(250, 92, 92, 0.4);
        }
      `}</style>

      {/* 팝업 모달 몸체: Figma iPhone 17-19의 가로-세로 뷰포트 비율을 1:1 복원하는 360x780px 고정형 카드 */}
      <div className="relative w-[360px] h-[780px] max-h-[92vh] rounded-[32px] overflow-hidden flex flex-col shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-gray-100 bg-white animate-in zoom-in-95 duration-300 touch-pan-y">
        
        {/* Step 1: 피그마 iPhone 17-19 1:1 완벽 절대 좌표 복원 */}
        {step === 1 && (
          <div
            className="relative flex-1 text-gray-800 overflow-hidden select-none"
            style={{ backgroundImage: `linear-gradient(to bottom, #fff, ${accent(0.03)}, ${accent(0.1)})` }}
          >
            
            {/* 1. 피그마 기하학적 도형 배경들 0.9배율 완벽 재현 */}
            <div className="absolute inset-0 pointer-events-none z-[1] overflow-hidden">
              {/* Radial gradient background box 1 */}
              <div 
                className="absolute w-[232px] h-[230px] rounded-[20px] left-[150px] top-[103px] opacity-[0.08]" 
                style={{ backgroundImage: `linear-gradient(to bottom, ${ACCENT}, ${accent(0.18)})` }}
              />
              {/* Radial gradient background box 2 */}
              <div 
                className="absolute w-[143px] h-[142px] rounded-bl-[20px] rounded-br-[20px] rounded-tl-[20px] left-[219px] top-0 opacity-[0.06]" 
                style={{ backgroundImage: `linear-gradient(to bottom, ${ACCENT}, ${accent(0.12)})` }}
              />
              {/* Radial gradient background box 3 */}
              <div 
                className="absolute w-[73px] h-[254px] rounded-[20px] left-[242px] top-[281px] opacity-[0.05]" 
                style={{ backgroundImage: `linear-gradient(to bottom, ${ACCENT}, ${accent(0.18)})` }}
              />
              {/* Radial gradient background box 4 */}
              <div 
                className="absolute w-[82px] h-[230px] rounded-[20px] left-[291px] top-[176px] opacity-[0.08]" 
                style={{ backgroundImage: `linear-gradient(to bottom, ${ACCENT}, ${accent(0.18)})` }}
              />
              {/* Radial gradient background box 5 */}
              <div 
                className="absolute w-[137px] h-[230px] rounded-[20px] left-[276px] top-[448px] opacity-[0.07]" 
                style={{ backgroundImage: `linear-gradient(to bottom, ${ACCENT}, #ffffff)` }}
              />
              {/* Radial gradient background box 6 */}
              <div 
                className="absolute w-[141px] h-[269px] rounded-[20px] left-[208px] top-[574px] opacity-[0.08]" 
                style={{ backgroundImage: `linear-gradient(to bottom, ${ACCENT}, ${accent(0.18)})` }}
              />
              {/* Radial gradient background box 7 */}
              <div 
                className="absolute w-[68px] h-[269px] rounded-[20px] left-[15px] top-[631px] opacity-[0.06]" 
                style={{ backgroundImage: `linear-gradient(to bottom, ${ACCENT}, ${accent(0.18)})` }}
              />
              {/* Radial gradient background box 8 */}
              <div 
                className="absolute w-[147px] h-[49px] rounded-[20px] left-[130px] top-[365px] opacity-[0.08]" 
                style={{ backgroundImage: `linear-gradient(to bottom, ${ACCENT}, ${accent(0.18)})` }}
              />
            </div>

            {/* 흩날리는 파스텔 핑크 하트 파티클 */}
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
                  <Heart className="text-transparent" style={{ width: heart.size, height: heart.size, fill: accent(0.08) }} />
                </div>
              ))}
            </div>

            {/* 2. 피그마 자산 이미지들 배치 (은은한 실루엣 하트로 일치) */}
            <div className="absolute inset-0 pointer-events-none z-[3]">
              {/* 자산 1 3 (하트 실루엣 1) */}
              <Heart className="absolute left-[180px] top-[70px] w-[50px] h-[48px]" style={{ color: accent(0.2), fill: accent(0.1) }} />
              {/* 자산 1 2 (하트 실루엣 2) */}
              <Heart className="absolute left-[256px] top-[155px] w-[76px] h-[71px]" style={{ color: accent(0.15), fill: accent(0.08) }} />
              {/* 자산 1 4 (하트 실루엣 3) */}
              <Heart className="absolute left-[10px] bottom-[20px] w-[50px] h-[48px]" style={{ color: accent(0.2), fill: accent(0.1) }} />
              {/* 자산 1 1 (우측 대형 하트 실루엣) */}
              <div className="absolute left-[132px] top-[448px] w-[225px] h-[212px] rotate-[5.89deg] opacity-25">
                <Heart className="w-full h-full" style={{ color: accent(0.3), fill: accent(0.15) }} />
              </div>
            </div>

            {/* 3. 글자 배치 (피그마 1:1 절대좌표 이식 및 김규민 작가 사양 적용) */}
            <div className="relative z-10 w-full h-full">
              {/* SYMBOL1 : HEART */}
              <span className="absolute left-[29px] top-[31px] text-[15px] tracking-[1.92px] font-medium text-[#4a3b3b] font-readable-sans">
                SYMBOL1 : {englishCopy?.symbol?.toUpperCase() || 'HEART'}
              </span>
              
              {/* Rectangle 361 (상단 얇은 가로선) */}
              <div className="absolute left-[29px] top-[64px] w-[35px] h-[1.5px] bg-[rgba(250,92,92,0.22)]" />

              {/* 2026.05.26/06.02 */}
              <div className="absolute right-[25px] top-[58px] text-[10px] text-[#4a3b3b] tracking-[1.2px] text-right font-readable-sans">
                2026.05.26/06.02
              </div>
              
              {/* 과기대 붕어방 */}
              <div className="absolute right-[25px] top-[71px] text-[10px] text-[#4a3b3b] tracking-[1.2px] text-right font-readable-sans">
                {englishCopy ? 'Bungeobang' : '과기대 붕어방'}
              </div>

              {/* 대형 감성 문구: 김규민 작가 (iPhone 17 - 19) 피그마 7줄 배치 및 색감/두께 단일화 */}
              <div className="absolute left-[29px] top-[91px] w-[310px] text-left">
                <div className={[
                  'leading-[1.22] text-[#4a3b3b] tracking-[1.5px] font-sentiment font-normal',
                  englishCopy ? 'text-[29px]' : 'text-[34px]',
                ].join(' ')}>
                  {introLines.map((line, index) => (
                    line
                      ? <p key={`${line}-${index}`}>{line}</p>
                      : <div key={`gap-${index}`} className="h-[18px]" />
                  ))}
                </div>
              </div>

              {/* 하단 작가 소개 영역 */}
              {/* Rectangle 358 (작가 위 가로선) */}
              <div className="absolute left-[26px] top-[450px] w-[35px] h-[1.5px] bg-[rgba(250,92,92,0.22)]" />
              
              {/* ARTIST. 김규민 및 댓글 이모지 버튼 */}
              <div className="absolute left-[26px] right-[25px] top-[465px] flex items-center justify-between">
                <span className="text-[15px] tracking-[1.92px] font-medium text-[#4a3b3b] font-readable-sans">
                  ARTIST. {englishCopy?.artist || '김규민'}
                </span>
                <button
                  onClick={() => setShowCommentModal(true)}
                  className="relative flex items-center justify-center w-16 h-16 rounded-full bg-[rgba(250,92,92,0.08)] border-2 border-[rgba(250,92,92,0.18)] hover:bg-[rgba(250,92,92,0.14)] text-[var(--heart-accent)] cursor-pointer transition-all active:scale-95 shadow-md animate-in fade-in duration-300"
                  title={uiText.leaveComment}
                >
                  <MessageSquare className="w-8 h-8" />
                  {/* 댓글 수 배지 */}
                  <span className="absolute -top-1 -right-1 flex h-6 min-w-[24px] px-1.5 items-center justify-center rounded-full bg-[var(--heart-accent)] text-white text-xs font-bold shadow-sm border border-white">
                    {commentsApi.comments.length}
                  </span>
                </button>
              </div>
              
              {/* 서울과학기술대학교 중앙동아리 CCC */}
              <div className="absolute left-[25px] top-[502px] text-[10px] tracking-[1.2px] text-[#4a3b3b] leading-normal font-readable-sans">
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

              {/* NEXT PAGE 버튼: 우측 하단 둥근 캡슐 */}
              <button
                onClick={() => setStep(2)}
                className="absolute right-[25px] bottom-[46px] w-[140px] h-[47px] bg-[var(--heart-accent)] text-white rounded-[24px] flex items-center justify-between pl-6 pr-5 hover:opacity-90 transition-all duration-200 active:scale-[0.96] shadow-[0_4px_15px_rgba(250,92,92,0.25)] cursor-pointer font-readable-sans"
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

        {/* Step 2: 피그마 iPhone 17-20 기반 디테일 완벽 복원 (김규민 작가 수필 서사 적용) */}
        {step === 2 && (
          <div
            className="relative flex-1 flex flex-col text-gray-800 overflow-y-auto overflow-x-hidden popup-body-scroll select-none touch-pan-y"
            style={{ backgroundImage: `linear-gradient(to bottom, #fff, ${accent(0.03)}, ${accent(0.12)})` }}
          >
            
            {/* 전체 높이를 확보하여 피그마의 비율을 보존 */}
            <div className="relative w-full flex flex-col p-6 pb-8 min-h-[960px]">
              
              {/* 은은하게 그라데이션으로 퍼지는 로즈빛 광원 오버레이 */}
              <div 
                className="absolute inset-0 pointer-events-none opacity-[0.02] mix-blend-multiply" 
                style={{ backgroundImage: `linear-gradient(206.325deg, ${accent(0)} 14.004%, ${accent(0.5)} 80.929%)` }} 
              />
              <div 
                className="absolute inset-0 pointer-events-none opacity-40 mix-blend-overlay" 
                style={{ backgroundImage: `linear-gradient(147.794deg, ${accent(0)} 34.559%, ${accent(0.18)} 100.79%)` }} 
              />

              {/* 흩날리는 핑크빛 하트 파티클 */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
                {floatingHearts.map((heart) => (
                  <div
                    key={heart.id}
                    className="absolute bottom-0 animate-float"
                    style={{
                      left: heart.left,
                      '--dur': heart.duration,
                      '--delay': heart.delay,
                      '--op': heart.opacity * 1.2,
                      fontSize: `${heart.size}px`,
                    }}
                  >
                    <Heart className="text-transparent" style={{ width: heart.size, height: heart.size, fill: accent(0.1) }} />
                  </div>
                ))}
              </div>

              {/* 우측 상단 하트 장식 (오버레이) */}
              <div className="absolute top-[5px] right-[-10px] w-64 h-60 opacity-40 pointer-events-none z-[2] mix-blend-normal animate-pulse">
                <Heart className="w-full h-full" style={{ color: accent(0.24), fill: accent(0.15) }} />
              </div>

              {/* 상단 띠지 */}
              <div className="relative z-10 flex justify-between items-center pb-6 font-readable-sans">
                <span className="text-[10px] tracking-[1.2px] font-bold text-[var(--heart-accent)]">
                  SYMBOL1 : {englishCopy?.symbol?.toUpperCase() || 'HEART'}
                </span>
                <div className="w-[100px] h-[0.5px] bg-[rgba(250,92,92,0.22)]" />
              </div>

              {/* 카드 배경 */}
              <div className="relative z-10 flex-1 flex flex-col bg-white/75 rounded-[18px] border border-[rgba(250,92,92,0.12)] px-6 py-7 shadow-[0_4px_18px_rgba(0,0,0,0.025)]">
                
                {/* 헤드라인 타이틀: "늘 기다리고 있었다" */}
                <div className={[
                  'text-left font-sentiment leading-[1.18] text-[#4a3b3b] tracking-[2px] font-normal mt-2 select-text',
                  englishCopy ? 'text-[27px]' : 'text-[34px]',
                ].join(' ')}>
                  {detailTitleLines.map(line => <p key={line}>{line}</p>)}
                </div>

                {/* 얇은 가로선 */}
                <div className="bg-[rgba(250,92,92,0.2)] h-px w-[31px] my-6 flex-none" />

                {/* 본문 서사: 김규민 작가 수필 (온점 하나도 누락 없이 100% 반영) */}
                {englishCopy ? (
                  <div className="text-left text-[14.5px] leading-[1.85] text-gray-700 space-y-5 tracking-normal font-readable-sans select-text">
                    {englishCopy.body.map((paragraph, index) => (
                      <p
                        key={paragraph}
                        className={index === 0 || index === englishCopy.body.length - 1 ? 'text-[#4a3b3b] font-medium' : ''}
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="text-left text-[14.5px] leading-[1.85] text-gray-700 space-y-5 tracking-normal font-readable-sans select-text break-keep">
                    <p className="text-black">익숙한 냄새 같은 기억이 있다. 어릴 때, 교회에서 먹던 따뜻한 잔치국수, 손에 쥐고 설레던 달란트, 괜히 오래 머물고 싶었던 그 시간들.</p>
                    
                    <div className="h-1" />
                    <p>그때는 이유를 몰랐고, <span className="font-bold">그저 자연스럽게 그 자리에 있었을 뿐이었다.</span></p>
                    
                    <div className="h-1" />
                    <p>시간이 지나고, 나는 그곳을 스쳐 지나가는 사람이 되었고 그 기억들도 지나간 장면쯤으로 남아 있다고 생각했다.</p>
                    
                    <div className="py-2 text-[rgba(250,92,92,0.25)] text-center flex justify-center gap-1 select-none font-bold">
                      <span>.</span><span>.</span><span>.</span>
                    </div>
                    
                    <p>그런데 어느 날, <span className="font-bold">익숙한 공간에서 잠깐 멈춰 서게 되었을 때</span> 문득 그때의 감각이 다시 떠올랐다.</p>
                    
                    <div className="h-1" />
                    <p>따뜻했던 공기, <span>누군가 곁에 있었던 것 같은 조용한 느낌.</span></p>
                    
                    <div className="h-1" />
                    <p>그 자리에, <span className="font-bold">여전히 같은 모습으로 아무 일도 없다는 듯 앉아 있는 존재.</span></p>
                    
                    <div className="h-1" />
                    <p>떠난 적이 없었던 것처럼, 처음부터 계속 그 자리에 있었던 것처럼.</p>
                    
                    {/* 마무리 문장은 박스 없이 여백과 얇은 선으로만 구분한다. */}
                    <div className="mt-7 pt-5 border-t border-[rgba(250,92,92,0.14)] text-[14.5px] leading-[1.85] text-[#4a3b3b] text-center">
                      <p className="font-semibold">“어릴 때 아무렇지 않게</p>
                      <p className="font-semibold">지나쳤던 그 마음이,</p>
                      <p className="font-semibold">지금의 나를 향해</p>
                      <div className="h-2.5" />
                      <p className="font-semibold">여전히 그 자리에서</p>
                      <p className="font-semibold">나를 기다리고 있었다.”</p>
                    </div>
                    
                    <div className="h-2" />
                    <p className="text-[14.5px] font-semibold text-[#4a3b3b] text-center leading-[1.85]">
                      늘 우리를 기다리시는<br />
                      그 사랑.
                    </p>
                  </div>
                )}
              </div>

              {/* 하단 제어 버튼: 112px X 52px 둥근 캡슐 */}
              <div className="relative z-10 grid grid-cols-[92px_1fr] gap-2.5 mt-8 flex-none font-readable-sans">
                {/* BACK 버튼 */}
                <button
                  onClick={() => setStep(1)}
                  className="h-[48px] rounded-2xl border border-gray-200 bg-white text-gray-600 flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-[0.96] cursor-pointer shadow-[0_5px_14px_rgba(15,23,42,0.08)] font-bold"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-[12px] tracking-[1.2px]">BACK</span>
                </button>
                
                {/* NEXT (확인 완료) 버튼 */}
                <button
                  onClick={() => setShowCommentModal(true)}
                  className="h-[48px] min-w-0 bg-[var(--heart-accent)] text-white rounded-2xl flex items-center justify-center gap-2 px-3 hover:opacity-90 transition-all duration-200 active:scale-[0.96] shadow-[0_8px_18px_rgba(250,92,92,0.26)] cursor-pointer font-bold"
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

      </div>

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
  );
}
